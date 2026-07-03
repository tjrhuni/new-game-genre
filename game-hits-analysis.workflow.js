// ============================================================================
//  game-hits-analysis.workflow.js
//  "100만장+ 판매 스팀게임의 공통점 분석 (2020–2026)"
//
//  A Dynamic Workflow that fans out 200+ subagents to (1) discover Steam games
//  that plausibly sold 1,000,000+ copies since 2020, (2) research + adversarially
//  verify each one, (3) analyze the dataset across ~18 dimensions, and (4)
//  synthesize a Korean report — explicitly testing the user's hypothesis that
//  hits = "a globally-familiar game/concept + one or more novel, user-friendly
//  twists" (e.g. Buckshot Roulette, Meccha Chameleon).
//
//  NOTE ON STRUCTURE: the Workflow sandbox has no filesystem / `require`, so the
//  logical modules from the plan (schemas.js / prompts.js / merge.js) live here
//  as clearly-delimited SECTIONS of one self-contained file. The script RETURNS
//  its dataset + dimension findings + report markdown to the caller, which then
//  writes dataset.{csv,json}, report.md and the chart artifact to report/.
//
//  Concurrency on this host is capped at ~2 agents at once (4 cores), so the
//  candidate list is bounded (MAX_GAMES) to keep the run completable while still
//  clearing the 200-agent requirement from the per-game research+verify fan-out
//  alone. All figures are ESTIMATES; every game carries a confidence tier.
// ============================================================================

export const meta = {
  name: 'steam-1m-hits-analysis',
  description: 'Analyze common traits of Steam 1M+ sellers (2020-2026) via a 200+ agent fan-out; test the "familiar base + novel twist" hypothesis',
  phases: [
    { title: 'Discovery', detail: 'multi-modal sweep for 1M+ candidates' },
    { title: 'Research', detail: 'one agent per game — fill design-DNA schema' },
    { title: 'Verify', detail: 'one agent per game — adversarially confirm >=1M, assign tier' },
    { title: 'Analysis', detail: '~18 dimension agents over the full dataset' },
    { title: 'Synthesis', detail: 'completeness critic, red-team, Korean report' },
  ],
}

// ============================================================================
//  SECTION 0 — CONFIG
// ============================================================================
const TODAY = '2026-07-03'
const WINDOW = '2020-01-01 ~ 2026-07-03 (H1 2026)'
const MAX_GAMES = 120          // bounds Phase 2 to ~240 agents (research + verify)
const DISCOVERY_ROUNDS = 2     // loop-until-dry cap
const NEW_YIELD_STOP = 5       // stop discovery when a round adds < 5 new titles

// Model / effort tiering: breadth cheap, adversarial + whole-table reasoning strong.
const MDL = { disc: 'sonnet', research: 'sonnet', verify: 'sonnet', analyze: 'opus', synth: 'opus' }

// Known must-include anchors — used only to sanity-check discovery recall.
const ANCHORS = [
  'Buckshot Roulette', 'MECCHA CHAMELEON', "Liar's Bar", 'Content Warning',
  'Chained Together', 'R.E.P.O.', 'PEAK', 'Schedule I', 'Palworld',
  'Black Myth: Wukong', 'Hollow Knight: Silksong', 'Path of Exile 2',
]

// The falsifiable hypothesis rubric, shared verbatim with every coding agent.
const HYPOTHESIS_RUBRIC = `
USER HYPOTHESIS TO TEST (do NOT assume true): A 1M+ hit typically takes an
ALREADY GLOBALLY-FAMILIAR game or concept and adds ONE OR MORE novel,
user-friendly twists.
  - base_familiarity_score (1-5): 5 = famous even to non-gamers (Russian roulette,
    hide-and-seek, tag, liar's dice); 3 = famous within gaming (Prop Hunt,
    roguelike, extraction shooter); 1 = obscure / genuinely original, no clear base.
  - A "twist" must be a concrete departure (mechanic swap, genre fusion, co-op/social
    layer, embodiment, aesthetic reframe, roguelike layer, radical simplification,
    price/scope disruption). twist_novelty_score 1-5 (5 = not seen before this game).
  - MECHANICAL VERDICT (compute, don't vibe):
        fits_user_hypothesis = (base_familiarity_score >= 3)
                               AND (twist_present == true)
                               AND (max twist_novelty_score >= 3)
  - Games with base_concept_type "original_no_clear_base" are fits=false BY DESIGN
    (this is what makes the hypothesis falsifiable). Sequels/AAA/licensed IP that
    succeed on brand/production rather than a famous-base+twist are fits=false —
    record their real driver in non_hypothesis_success_factors[].`

// ============================================================================
//  SECTION 1 — SCHEMAS (JSON Schema for structured agent returns)
// ============================================================================
const CandidateListSchema = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          steam_app_id: { type: ['integer', 'null'] },
          developer: { type: ['string', 'null'] },
          release_year: { type: ['integer', 'null'] },
          rough_copies_million: { type: ['number', 'null'] },
          self_reported_milestone: { type: 'boolean' },
          source: { type: 'string' },
          why_included: { type: 'string' },
        },
        required: ['title', 'source'],
      },
    },
  },
  required: ['candidates'],
}

const twistItem = {
  type: 'object',
  properties: {
    twist_type: {
      type: 'string',
      enum: ['mechanical_swap', 'genre_fusion', 'co_op_social_layer', 'input_embodiment',
        'aesthetic_reframe', 'procedural_roguelike_layer', 'physics_jank_emergence',
        'accessibility_simplification', 'narrative_reframe', 'price_or_scope_disruption'],
    },
    twist_description: { type: 'string' },
    twist_novelty_score: { type: 'integer', minimum: 1, maximum: 5 },
  },
  required: ['twist_type', 'twist_novelty_score'],
}

const GameResearchSchema = {
  type: 'object',
  properties: {
    steam_app_id: { type: ['integer', 'null'] },
    canonical_title: { type: 'string' },
    developer: { type: ['string', 'null'] },
    publisher: { type: ['string', 'null'] },
    country_of_studio: { type: ['string', 'null'] },
    release_date: { type: ['string', 'null'] },
    release_year: { type: ['integer', 'null'] },
    early_access: { type: 'boolean' },
    engine: { type: ['string', 'null'] },
    primary_genre: { type: ['string', 'null'] },
    sub_genres: { type: 'array', items: { type: 'string' } },
    // commercial
    copies_estimate_best_million: { type: ['number', 'null'] },
    copies_low_million: { type: ['number', 'null'] },
    copies_high_million: { type: ['number', 'null'] },
    copies_sources: { type: 'array', items: { type: 'string' } },
    self_reported_milestone: { type: 'boolean' },
    self_reported_value_million: { type: ['number', 'null'] },
    self_reported_source_url: { type: ['string', 'null'] },
    review_count: { type: ['integer', 'null'] },
    review_score_pct: { type: ['integer', 'null'] },
    peak_ccu: { type: ['integer', 'null'] },
    price_usd_launch: { type: ['number', 'null'] },
    // design DNA — hypothesis operationalization
    base_concept_name: { type: 'string' },
    base_concept_type: {
      type: 'string',
      enum: ['real_world_game', 'established_videogame_genre_or_mode', 'physical_party_activity',
        'licensed_or_franchise_IP', 'folklore_mythology', 'original_no_clear_base'],
    },
    base_familiarity_score: { type: 'integer', minimum: 1, maximum: 5 },
    evokes_reference_titles: { type: 'array', items: { type: 'string' } },
    twist_present: { type: 'boolean' },
    twists: { type: 'array', items: twistItem },
    primary_hook_one_sentence: { type: 'string' },
    control_complexity: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
    avg_session_minutes: { type: ['integer', 'null'] },
    fits_user_hypothesis: { type: 'boolean' },
    fit_strength: { type: 'integer', minimum: 1, maximum: 5 },
    fit_rationale: { type: 'string' },
    non_hypothesis_success_factors: { type: 'array', items: { type: 'string' } },
    // virality / distribution
    co_op: { type: 'boolean' },
    player_count_max: { type: ['integer', 'null'] },
    streamer_driven: { type: 'boolean' },
    short_form_virality: { type: 'boolean' },
    meme_factor: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
    watchability: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
    // positioning / team / classification
    art_style: { type: ['string', 'null'] },
    tone: { type: 'array', items: { type: 'string' } },
    production_value_tier: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
    team_size: { type: ['integer', 'null'] },
    solo_dev: { type: 'boolean' },
    dev_time_months: { type: ['integer', 'null'] },
    is_sequel: { type: 'boolean' },
    is_licensed_IP: { type: 'boolean' },
    is_new_original_IP: { type: 'boolean' },
    // provenance
    sources: { type: 'array', items: { type: 'string' } },
    research_confidence: { type: 'integer', minimum: 1, maximum: 5 },
  },
  required: ['canonical_title', 'base_concept_type', 'base_familiarity_score',
    'twist_present', 'fits_user_hypothesis'],
}

const SalesVerifySchema = {
  type: 'object',
  properties: {
    canonical_title: { type: 'string' },
    copies_best_estimate_million: { type: ['number', 'null'] },
    self_reported_milestone: { type: 'boolean' },
    self_reported_value_million: { type: ['number', 'null'] },
    boxleiter_implied_million: { type: ['number', 'null'] },
    peak_ccu: { type: ['integer', 'null'] },
    meets_1M: { type: 'boolean' },
    confidence_tier: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
    confidence_rationale: { type: 'string' },
    inflation_flags: {
      type: 'array',
      items: { type: 'string', enum: ['owners_not_sold', 'bundle', 'giveaway', 'free_weekend', 'key_reseller', 'review_bomb', 'players_not_sales'] },
    },
    fits_recheck: { type: 'boolean' },        // independent re-code of the hypothesis verdict
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['meets_1M', 'confidence_tier'],
}

const DimensionSchema = {
  type: 'object',
  properties: {
    dimension: { type: 'string' },
    headline: { type: 'string' },
    findings: { type: 'string' },
    tables: { type: 'array', items: { type: 'object' } },
    exemplars: { type: 'array', items: { type: 'string' } },
    counterexamples: { type: 'array', items: { type: 'string' } },
    caveats: { type: 'string' },
  },
  required: ['dimension', 'headline', 'findings'],
}

const CriticSchema = {
  type: 'object',
  properties: {
    missing_famous_titles: { type: 'array', items: { type: 'string' } },
    data_quality_concerns: { type: 'array', items: { type: 'string' } },
    over_or_under_counted_dimensions: { type: 'array', items: { type: 'string' } },
    overall_assessment: { type: 'string' },
  },
  required: ['overall_assessment'],
}

// ============================================================================
//  SECTION 2 — PROMPTS
// ============================================================================
function discoveryPrompt(angle, known) {
  const kn = known.length ? `\n\nALREADY KNOWN (exclude these; find NEW titles): ${known.slice(0, 260).join('; ')}` : ''
  let focus
  if (angle.kind === 'year') focus = `Steam games RELEASED in ${angle.key} that sold ~1,000,000+ copies (paid units, not free). Include the biggest sellers of that release year.`
  else if (angle.kind === 'source') focus = `top-selling Steam games since 2020 per the data/estimate source "${angle.key}" (use its published lists/estimates).`
  else if (angle.kind === 'genre') focus = `Steam games in the "${angle.key}" genre/mode released 2020-2026 that reached ~1,000,000+ copies sold.`
  else if (angle.kind === 'milestone') focus = `Steam games (2020-2026) whose DEVELOPER/PUBLISHER publicly announced a "sold N million" or "N million players" milestone (press release, Steam news post, or verified social post). This is the highest-trust channel — capture the milestone claim and its URL.`
  else if (angle.kind === 'editorial') focus = `Steam breakout/indie hits of 2020-2026 that reportedly passed ~1,000,000 sales, per editorial "biggest hits / best-selling" roundups (PC Gamer, PCGamesN, IGN, RPS, GamesRadar, Game World Observer, Dexerto).`
  else if (angle.kind === 'awards') focus = `commercially huge (~1M+) Steam games 2020-2026 surfaced via Steam Awards, Golden Joysticks, or The Game Awards nominations.`
  else if (angle.kind === 'regional') focus = `~1M+ selling Steam games 2020-2026 from Chinese, Japanese, or Korean studios that Western press under-covers.`
  return `You are a games-market researcher. Today is ${TODAY}. Use web search.
TASK: Build a list of ${focus}
Window: ${WINDOW}. All sales are ESTIMATES — include a rough figure and the source, and set self_reported_milestone=true only if the DEVELOPER themselves announced it.
Return 8-25 candidates. Prefer breadth/recall over precision (a later stage verifies). Give steam_app_id and release_year when you can.${kn}`
}

function researchPrompt(g) {
  return `You are a rigorous games-industry analyst. Today is ${TODAY}. Use web search to research ONE game and fill the schema.

GAME: "${g.title}"${g.steam_app_id ? ` (Steam appid ${g.steam_app_id})` : ''}${g.developer ? `, dev: ${g.developer}` : ''}.

Research: identity (dev/publisher/country/release date/early-access/engine/genre), commercial signals (best copies estimate in MILLIONS + range + which sources: gamalytic/vginsights/steamdb/steamspy/self_reported/press; developer self-reported milestone + URL if any; review_count; review_score_pct; peak_ccu; launch price), virality (co-op? max players? streamer-driven? short-form/TikTok virality? meme_factor; watchability = how fun to watch others play), positioning (art_style, tone[], production_value_tier 1-5), team (size, solo?, dev_time_months), and classification (sequel? licensed IP? new original IP?).

Then code the DESIGN-DNA using this rubric EXACTLY:
${HYPOTHESIS_RUBRIC}

Set base_concept_name (e.g. "Russian roulette", "Prop Hunt / hide-and-seek", "Liar's Dice", "extraction shooter", "farming/life sim"), base_concept_type, base_familiarity_score, twists[] (one per distinct twist with type + novelty), then COMPUTE fits_user_hypothesis by the formula, plus fit_strength and a one-line fit_rationale. If it does NOT fit, list the real non_hypothesis_success_factors. Give copies figures in MILLIONS (e.g. 8.0 for 8 million). Cite source URLs. Be honest — do not force a game into the hypothesis.`
}

function verifyPrompt(r) {
  return `You are an ADVERSARIAL sales auditor. Today is ${TODAY}. Steam never publishes real sales; every number is an estimate. Your job is to TRY TO DISPROVE that "${r.canonical_title}" sold 1,000,000+ PAID copies.

Given research so far: best estimate ≈ ${r.copies_estimate_best_million ?? '?'}M; self-reported milestone = ${r.self_reported_milestone}; review_count = ${r.review_count ?? '?'}; peak_ccu = ${r.peak_ccu ?? '?'}; sources = ${(r.copies_sources || []).join(', ') || 'n/a'}.

Independently re-search and cross-check ≥2 methods:
- Boxleiter: implied_copies ≈ review_count × multiplier (≈30 legacy → 50-70 for viral co-op/social titles where buyers under-review). A genuine 1M+ game usually shows ~20k-35k+ reviews.
- Peak concurrent players sanity (very low peak CCU + huge "owners" ⇒ suspect owners≠sales).
- Watch for inflation: owners_not_sold, bundle, giveaway, free_weekend, key_reseller, review_bomb, players_not_sales ("N million PLAYERS" ≠ copies sold).

Assign confidence_tier:
- A = developer/publisher self-reported ≥1M milestone, OR ≥2 independent estimators agree ≥1M with margin.
- B = single reputable estimator ≥1M corroborated by Boxleiter + plausible peak CCU.
- C = borderline 1.0-1.5M single estimate / thin corroboration / estimators straddle 1M.
- D = fails sanity checks (likely owners/players not paid sales, or inflated) → meets_1M=false.

Also independently RE-CODE fits_recheck (the hypothesis verdict) using the same mechanical formula, to measure coder agreement. Return meets_1M, confidence_tier, rationale, inflation_flags, and source URLs.`
}

function dimensionPrompt(dim, cohort, full) {
  return `You are a data analyst. Below is a dataset of Steam games that (per prior verification) sold ~1M+ copies 2020-2026. Analyze ONE dimension and return structured findings. Reason ONLY from the data given; be quantitative (counts, %, medians); name concrete exemplars/counterexamples by title.

DIMENSION: ${dim.key} — ${dim.desc}

ANALYSIS COHORT (Tier A+B, the confident set), ${cohort.length} games:
${JSON.stringify(cohort)}

FULL DATASET incl. Tier C/D (for context / sensitivity), ${full.length} games:
${JSON.stringify(full)}

Return: a one-line headline, a findings paragraph with the key numbers, up to a few small tables (arrays of flat objects), exemplars[], counterexamples[], and caveats. For the hypothesis dimension, report the fits=true share for BOTH Tier A+B and Tier A+B+C (sensitivity band).`
}

function criticPrompt(stats, dims, titles) {
  return `You are a completeness critic for a study of Steam 1M+ sellers (2020-2026). Today ${TODAY}.
Dataset has ${titles.length} titles. Summary stats: ${JSON.stringify(stats)}.
Dimension headlines: ${JSON.stringify(dims.map(d => ({ dim: d.dimension, headline: d.headline })))}.
Titles: ${titles.join('; ')}.
Identify: (1) famous 1M+ Steam games from 2020-2026 that are MISSING from this list; (2) data-quality concerns; (3) dimensions that look over/under-counted. Be specific and terse.`
}

function redteamPrompt(stats, hypDim) {
  return `You are a skeptical red-team reviewer. A study claims Steam 1M+ hits (2020-2026) commonly follow "familiar base + novel twist". Headline stats: ${JSON.stringify(stats)}. Hypothesis-dimension finding: ${JSON.stringify(hypDim)}.
Write the STRONGEST honest rebuttal in Korean (3-6 sentences): survivorship bias (winners-only, no control group of flops), coder subjectivity, definitional elasticity ("almost anything can be framed as base+twist"), confound with cheaper drivers (co-op/streamer virality, low price, timing). State what the data can and cannot prove.`
}

function reportPrompt(stats, dims, critic, redteamKo) {
  return `You are writing the FINAL analysis report in KOREAN (한국어). Today is ${TODAY}. Audience: a game designer/founder deciding what to build next.

Write clean GitHub-flavored Markdown. Keep game names + sources in their original language. Base every claim ONLY on the data below. Use concrete numbers.

HEADLINE STATS (ground truth — compute nothing new that contradicts these):
${JSON.stringify(stats)}

DIMENSION FINDINGS (${dims.length}):
${JSON.stringify(dims)}

COMPLETENESS CRITIC: ${JSON.stringify(critic)}

RED-TEAM REBUTTAL (한국어, include verbatim in a caveats box): ${redteamKo}

Required sections (한국어 제목):
1. "## 핵심 결론 (Executive Summary)" — answer the question directly: among confirmed (Tier A+B) 1M+ sellers, what % fit "익숙한 베이스 + 독창적 변주", with the ±Tier C sensitivity band. 3-5 bullets of the strongest common traits (ranked).
2. "## ⚠️ 먼저 읽을 것: 생존자 편향" — winners-only caveat + the red-team rebuttal box.
3. "## 사용자 가설 검증" — base-concept & twist taxonomies (frequencies), the familiarity×novelty picture, and how strongly the data supports the hypothesis.
4. "## 대표 사례" — map 벅샷 룰렛 / MECCHA CHAMELEON / Liar's Bar / Content Warning / Chained Together field-by-field (base → twist).
5. "## 반례와 다른 성공 경로" — Wukong / Silksong / PoE 2 / Palworld etc.: why they hit 1M+ WITHOUT the pattern (sequel/AAA/IP), what their real drivers were.
6. "## 그 외 공통점" — price, co-op/social, streamer/short-form virality, team size & dev cycle, Early Access, art/tone, 1M 도달 속도.
7. "## 실전 시사점" — 5-8 actionable takeaways for someone building the next hit.
8. "## 방법론 · 신뢰도 · 한계" — estimates-not-sales, confidence tiers, agent counts, biases.

Return ONLY the markdown.`
}

// ============================================================================
//  SECTION 3 — MERGE / DEDUP / STATS (plain JS, no agents)
// ============================================================================
function normalize(t) {
  return String(t || '').toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[:\-–—_.,'"!?()]/g, ' ')
    .replace(/\b(deluxe|goty|game of the year|definitive|complete|edition|remastered|early access)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}
function candKey(c) {
  if (c.steam_app_id) return 'id:' + c.steam_app_id
  return 'nm:' + normalize(c.title)
}
function mergeCandidates(master, rows) {
  let added = 0
  for (const row of rows) {
    if (!row || !Array.isArray(row.candidates)) continue
    for (const c of row.candidates) {
      if (!c || !c.title) continue
      const k = candKey(c)
      const prev = master.get(k)
      if (!prev) {
        master.set(k, {
          title: c.title, steam_app_id: c.steam_app_id || null, developer: c.developer || null,
          release_year: c.release_year || null,
          rough_copies_million: c.rough_copies_million || null,
          self_reported_milestone: !!c.self_reported_milestone,
          sources: [c.source], why: c.why_included || '',
        })
        added++
      } else {
        if (!prev.sources.includes(c.source)) prev.sources.push(c.source)
        prev.self_reported_milestone = prev.self_reported_milestone || !!c.self_reported_milestone
        if ((c.rough_copies_million || 0) > (prev.rough_copies_million || 0)) prev.rough_copies_million = c.rough_copies_million
        if (!prev.steam_app_id && c.steam_app_id) prev.steam_app_id = c.steam_app_id
        if (!prev.release_year && c.release_year) prev.release_year = c.release_year
      }
    }
  }
  return added
}
// Rank by corroboration then rough estimate; self-reported milestones float up.
function rankAndCap(master, cap) {
  const arr = [...master.values()].filter(g => {
    const est = g.rough_copies_million || 0
    return g.self_reported_milestone || est >= 0.8 || g.sources.length >= 2 || est === 0 // keep unknowns (est 0) for verify
  })
  arr.sort((a, b) => {
    const sa = (a.self_reported_milestone ? 100 : 0) + a.sources.length * 3 + (a.rough_copies_million || 0)
    const sb = (b.self_reported_milestone ? 100 : 0) + b.sources.length * 3 + (b.rough_copies_million || 0)
    return sb - sa
  })
  return arr.slice(0, cap)
}
// Flatten a research+verify record into a compact, analysis-ready row.
function compact(r) {
  const v = r.verify || {}
  const twists = Array.isArray(r.twists) ? r.twists : []
  return {
    title: r.canonical_title,
    app_id: r.steam_app_id || null,
    developer: r.developer || null,
    country: r.country_of_studio || null,
    year: r.release_year || (r.release_date ? parseInt(String(r.release_date).slice(0, 4)) : null),
    genre: r.primary_genre || null,
    copies_m: v.copies_best_estimate_million ?? r.copies_estimate_best_million ?? null,
    self_reported: !!(v.self_reported_milestone || r.self_reported_milestone),
    reviews: r.review_count ?? null,
    review_pct: r.review_score_pct ?? null,
    peak_ccu: v.peak_ccu ?? r.peak_ccu ?? null,
    price: r.price_usd_launch ?? null,
    tier: v.confidence_tier || null,
    meets_1M: v.meets_1M ?? null,
    inflation_flags: v.inflation_flags || [],
    base_concept: r.base_concept_name || null,
    base_type: r.base_concept_type || null,
    familiarity: r.base_familiarity_score ?? null,
    twist_present: !!r.twist_present,
    twist_types: twists.map(t => t.twist_type),
    max_novelty: twists.reduce((m, t) => Math.max(m, t.twist_novelty_score || 0), 0),
    twist_count: twists.length,
    fits: !!r.fits_user_hypothesis,
    fits_recheck: v.fits_recheck ?? null,
    fit_strength: r.fit_strength ?? null,
    non_fit_factors: r.non_hypothesis_success_factors || [],
    co_op: !!r.co_op,
    players_max: r.player_count_max ?? null,
    streamer_driven: !!r.streamer_driven,
    short_form_viral: !!r.short_form_virality,
    meme: r.meme_factor ?? null,
    watchability: r.watchability ?? null,
    art_style: r.art_style || null,
    tone: r.tone || [],
    prod_tier: r.production_value_tier ?? null,
    team_size: r.team_size ?? null,
    solo: !!r.solo_dev,
    dev_months: r.dev_time_months ?? null,
    early_access: !!r.early_access,
    is_sequel: !!r.is_sequel,
    is_licensed_IP: !!r.is_licensed_IP,
    is_original: !!r.is_new_original_IP,
    hook: r.primary_hook_one_sentence || '',
    fit_rationale: r.fit_rationale || '',
    sources: (v.sources || r.sources || []).slice(0, 4),
    confidence: r.research_confidence ?? null,
  }
}
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0 }
function computeStats(rows) {
  const tier = k => rows.filter(r => r.tier === k)
  const AB = rows.filter(r => r.tier === 'A' || r.tier === 'B')
  const ABC = rows.filter(r => ['A', 'B', 'C'].includes(r.tier))
  const byYear = {}
  for (const r of rows) if (r.year) byYear[r.year] = (byYear[r.year] || 0) + 1
  const twistFreq = {}, baseFreq = {}, factorFreq = {}
  for (const r of AB) {
    for (const t of r.twist_types) twistFreq[t] = (twistFreq[t] || 0) + 1
    if (r.base_type) baseFreq[r.base_type] = (baseFreq[r.base_type] || 0) + 1
    for (const f of r.non_fit_factors) factorFreq[f] = (factorFreq[f] || 0) + 1
  }
  const prices = AB.map(r => r.price).filter(p => typeof p === 'number').sort((a, b) => a - b)
  const teams = AB.map(r => r.team_size).filter(n => typeof n === 'number').sort((a, b) => a - b)
  const med = a => a.length ? a[Math.floor(a.length / 2)] : null
  const coderDisagree = AB.filter(r => r.fits_recheck !== null && r.fits_recheck !== r.fits).length
  return {
    total_candidates_researched: rows.length,
    tier_counts: { A: tier('A').length, B: tier('B').length, C: tier('C').length, D: tier('D').length },
    confirmed_cohort_AB: AB.length,
    fits_pct_AB: pct(AB.filter(r => r.fits).length, AB.length),
    fits_pct_ABC: pct(ABC.filter(r => r.fits).length, ABC.length),
    fits_count_AB: AB.filter(r => r.fits).length,
    coder_disagreement_pct_AB: pct(coderDisagree, AB.length),
    twist_type_freq_AB: twistFreq,
    base_type_freq_AB: baseFreq,
    non_fit_factor_freq_AB: factorFreq,
    co_op_pct_AB: pct(AB.filter(r => r.co_op).length, AB.length),
    streamer_pct_AB: pct(AB.filter(r => r.streamer_driven).length, AB.length),
    short_form_pct_AB: pct(AB.filter(r => r.short_form_viral).length, AB.length),
    early_access_pct_AB: pct(AB.filter(r => r.early_access).length, AB.length),
    sequel_pct_AB: pct(AB.filter(r => r.is_sequel).length, AB.length),
    solo_or_tiny_pct_AB: pct(AB.filter(r => r.solo || (r.team_size && r.team_size <= 5)).length, AB.length),
    median_price_AB: med(prices),
    price_under_20_pct_AB: pct(AB.filter(r => typeof r.price === 'number' && r.price < 20).length, AB.filter(r => typeof r.price === 'number').length),
    median_team_size_AB: med(teams),
    games_by_year: byYear,
    window: WINDOW, generated: TODAY,
  }
}

// ============================================================================
//  SECTION 4 — PHASES
// ============================================================================
async function discover() {
  const YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026]
  const SOURCES = ['gamalytic', 'vginsights (video game insights)', 'steamdb', 'steamspy', 'steam official top sellers charts']
  const GENRES = ['extraction shooter', 'co-op horror', 'social deduction', 'farming/life sim', 'roguelike/roguelite',
    'survival crafting', 'physics co-op party', 'found-footage horror', 'colony/city builder',
    'soulslike', 'ARPG', 'deckbuilder', 'automation/factory', 'prop hunt / hide-and-seek']
  const angles = [
    ...YEARS.map(y => ({ kind: 'year', key: y })),
    ...SOURCES.map(s => ({ kind: 'source', key: s })),
    ...GENRES.map(g => ({ kind: 'genre', key: g })),
    { kind: 'milestone', key: 'dev-announced' },
    { kind: 'editorial', key: 'roundups' },
    { kind: 'awards', key: 'awards' },
    { kind: 'regional', key: 'CN/JP/KR' },
  ]
  const master = new Map()
  for (let round = 0, added = Infinity; round < DISCOVERY_ROUNDS && added >= NEW_YIELD_STOP; round++) {
    const known = [...master.values()].map(g => g.title)
    log(`Discovery round ${round + 1}: ${angles.length} angles, ${known.length} known so far`)
    const rows = await parallel(angles.map(a => () =>
      agent(discoveryPrompt(a, known), {
        label: `disc:${a.kind}:${a.key}:r${round + 1}`, phase: 'Discovery',
        schema: CandidateListSchema, model: MDL.disc, effort: 'low',
      })))
    added = mergeCandidates(master, rows.filter(Boolean))
    log(`Discovery round ${round + 1} added ${added} new titles (total ${master.size})`)
  }
  const games = rankAndCap(master, MAX_GAMES)
  const have = new Set(games.map(g => normalize(g.title)))
  const missingAnchors = ANCHORS.filter(a => !have.has(normalize(a)))
  if (missingAnchors.length) {
    log(`Injecting ${missingAnchors.length} missing anchor titles: ${missingAnchors.join(', ')}`)
    for (const a of missingAnchors) games.push({ title: a, steam_app_id: null, developer: null, release_year: null, rough_copies_million: null, self_reported_milestone: true, sources: ['anchor'], why: 'known major hit' })
  }
  log(`Discovery done: ${games.length} games to research`)
  return games
}

async function researchAndVerify(games) {
  const records = await pipeline(games,
    (g) => agent(researchPrompt(g), {
      label: `research:${g.title}`, phase: 'Research',
      schema: GameResearchSchema, model: MDL.research, effort: 'medium',
    }),
    (research) => {
      if (!research) return null
      return agent(verifyPrompt(research), {
        label: `verify:${research.canonical_title}`, phase: 'Verify',
        schema: SalesVerifySchema, model: MDL.verify, effort: 'high',
      }).then(v => ({ ...research, verify: v || { meets_1M: null, confidence_tier: 'C', confidence_rationale: 'verify agent unavailable' } }))
    })
  return records.filter(Boolean).map(compact)
}

async function analyze(rows) {
  const cohort = rows.filter(r => r.tier === 'A' || r.tier === 'B')
  const analysisSet = cohort.length >= 10 ? cohort : rows // fall back if too few confident
  const DIMS = [
    { key: 'hypothesis_test', desc: 'What % fit "familiar base + novel twist"? Break down by year & tier; report Tier A+B and A+B+C sensitivity.' },
    { key: 'base_concept_taxonomy', desc: 'Frequency of base_concept_type and recurring base_concept names (real-world game vs prior video-game mode vs IP vs original).' },
    { key: 'twist_taxonomy', desc: 'Frequency of twist_types, common co-occurring twist combinations, and which twists correlate with higher copies.' },
    { key: 'familiarity_x_novelty', desc: 'Cross-tab base_familiarity vs max twist novelty; do hits cluster in high-familiarity / high-novelty? Bucket the counts.' },
    { key: 'counterexample_analysis', desc: 'For fits=false games, distribution of non_hypothesis_success_factors; place Wukong/Silksong/PoE2/Palworld.' },
    { key: 'sequel_vs_original', desc: 'Share sequels vs licensed IP vs new original IP; how do their sales compare.' },
    { key: 'genre_distribution', desc: 'Genre frequency among hits and which genres over-index.' },
    { key: 'team_and_devcycle', desc: 'Team size distribution (solo/tiny vs studio), dev_time_months; correlation of small teams with fits.' },
    { key: 'price_analysis', desc: 'Launch price distribution, median, % under $20; is cheap+viral a pattern.' },
    { key: 'virality_streamer', desc: '% streamer_driven, % short_form_viral, meme/watchability; how central is virality.' },
    { key: 'coop_social', desc: 'Share co-op/multiplayer vs solo; player_count_max patterns; social chaos as a driver.' },
    { key: 'early_access', desc: '% launched in Early Access; EA as a strategy among hits.' },
    { key: 'art_and_tone', desc: 'Dominant art_style and tone clusters (horror/comedy/cozy/absurd).' },
    { key: 'correlations', desc: 'Cross-tabs: fit_strength vs copies; twist_count vs copies; team_size vs fits; co_op vs streamer.' },
    { key: 'production_value', desc: 'Production_value_tier distribution — do both micro-budget and AAA winners appear.' },
    { key: 'region', desc: 'Country_of_studio distribution of hits.' },
    { key: 'tier_composition', desc: 'Confidence-tier composition; how many rely on self-reported milestones; data_conflict census.' },
  ]
  return await parallel(DIMS.map(d => () =>
    agent(dimensionPrompt(d, analysisSet, rows), {
      label: `dim:${d.key}`, phase: 'Analysis', schema: DimensionSchema, model: MDL.analyze, effort: 'high',
    }))).then(a => a.filter(Boolean))
}

async function synthesize(rows, dims, stats) {
  const titles = rows.map(r => r.title)
  const hypDim = dims.find(d => d.dimension && d.dimension.includes('hypothesis')) || dims[0] || {}
  const [critic, redteamKo] = await parallel([
    () => agent(criticPrompt(stats, dims, titles), { label: 'completeness-critic', phase: 'Synthesis', schema: CriticSchema, model: MDL.synth, effort: 'high' }),
    () => agent(redteamPrompt(stats, hypDim), { label: 'red-team', phase: 'Synthesis', model: MDL.synth, effort: 'high' }),
  ])
  const reportMarkdown = await agent(reportPrompt(stats, dims, critic || {}, redteamKo || ''), {
    label: 'final-report', phase: 'Synthesis', model: MDL.synth, effort: 'high',
  })
  return { critic, redteamKo, reportMarkdown }
}

// ============================================================================
//  MAIN
// ============================================================================
phase('Discovery')
const games = await discover()

phase('Research')
const dataset = await researchAndVerify(games)
log(`Research+verify complete: ${dataset.length} game records`)

const stats = computeStats(dataset)
log(`Stats: ${JSON.stringify(stats.tier_counts)} tiers; fits ${stats.fits_pct_AB}% (A+B), ${stats.fits_pct_ABC}% (A+B+C)`)

phase('Analysis')
const dims = await analyze(dataset)
log(`Dimensional analysis complete: ${dims.length} dimensions`)

phase('Synthesis')
const synth = await synthesize(dataset, dims, stats)

return {
  meta: { window: WINDOW, generated: TODAY, max_games: MAX_GAMES },
  stats,
  dataset,
  dimensions: dims,
  critic: synth.critic,
  redteam_ko: synth.redteamKo,
  report_markdown: synth.reportMarkdown,
}
