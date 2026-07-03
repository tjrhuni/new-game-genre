#!/usr/bin/env node
// Post-processes the workflow return into report/ deliverables.
// Usage: node scripts/process_results.js <workflow-output-file>
const fs = require('fs')
const path = require('path')

const outFile = process.argv[2]
if (!outFile) { console.error('need output file path'); process.exit(1) }
const wrapper = JSON.parse(fs.readFileSync(outFile, 'utf8'))
const R = wrapper.result
if (!R || !Array.isArray(R.dataset)) { console.error('no dataset in result'); process.exit(1) }

const REPORT = path.join(__dirname, '..', 'report')
fs.mkdirSync(REPORT, { recursive: true })

// ---- dataset.json (full) ----
fs.writeFileSync(path.join(REPORT, 'dataset.json'), JSON.stringify(R.dataset, null, 2))

// ---- stats.json (+meta, critic, redteam) ----
fs.writeFileSync(path.join(REPORT, 'stats.json'), JSON.stringify({
  meta: R.meta, stats: R.stats, critic: R.critic, redteam_ko: R.redteam_ko,
}, null, 2))

// ---- dimensions.json (findings for review) ----
fs.writeFileSync(path.join(REPORT, 'dimensions.json'), JSON.stringify(R.dimensions, null, 2))

// ---- report.md ----
if (typeof R.report_markdown === 'string') {
  fs.writeFileSync(path.join(REPORT, 'report.md'), R.report_markdown)
}

// ---- dataset.csv (flatten arrays) ----
const cols = ['title', 'app_id', 'developer', 'country', 'year', 'genre', 'copies_m',
  'self_reported', 'reviews', 'review_pct', 'peak_ccu', 'price', 'tier', 'meets_1M',
  'inflation_flags', 'base_concept', 'base_type', 'familiarity', 'twist_present',
  'twist_types', 'max_novelty', 'twist_count', 'fits', 'fits_recheck', 'fit_strength',
  'non_fit_factors', 'co_op', 'players_max', 'streamer_driven', 'short_form_viral',
  'meme', 'watchability', 'art_style', 'tone', 'prod_tier', 'team_size', 'solo',
  'dev_months', 'early_access', 'is_sequel', 'is_licensed_IP', 'is_original', 'hook',
  'fit_rationale', 'confidence', 'sources']
function cell(v) {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) v = v.join(' | ')
  v = String(v)
  if (/[",\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"'
  return v
}
const csv = [cols.join(',')]
  .concat(R.dataset.map(r => cols.map(c => cell(r[c])).join(',')))
  .join('\n')
fs.writeFileSync(path.join(REPORT, 'dataset.csv'), csv + '\n')

// ---- console summary ----
const s = R.stats
console.log('WROTE report/{dataset.json,dataset.csv,stats.json,dimensions.json,report.md}')
console.log('games:', R.dataset.length, '| dims:', R.dimensions.length, '| report chars:', (R.report_markdown || '').length)
console.log('tiers:', JSON.stringify(s.tier_counts), '| cohort A+B:', s.confirmed_cohort_AB)
console.log('fits A+B:', s.fits_pct_AB + '%', '| A+B+C:', s.fits_pct_ABC + '%', '| coder-disagree:', s.coder_disagreement_pct_AB + '%')
console.log('base_type_freq:', JSON.stringify(s.base_type_freq_AB))
console.log('twist_freq:', JSON.stringify(s.twist_type_freq_AB))
console.log('co_op:', s.co_op_pct_AB + '%', 'streamer:', s.streamer_pct_AB + '%', 'EA:', s.early_access_pct_AB + '%',
  'sequel:', s.sequel_pct_AB + '%', 'solo/tiny:', s.solo_or_tiny_pct_AB + '%',
  'med price $' + s.median_price_AB, 'under$20:', s.price_under_20_pct_AB + '%', 'med team:', s.median_team_size_AB)
console.log('by year:', JSON.stringify(s.games_by_year))
console.log('critic.missing:', JSON.stringify((R.critic && R.critic.missing_famous_titles) || []))
