#!/usr/bin/env node
// Post-processes the control-study workflow return into report/ deliverables.
// Usage: node scripts/process_control.js <workflow-output-file>
const fs = require('fs')
const path = require('path')
const REPORT = path.join(__dirname, '..', 'report')

const outFile = process.argv[2]
if (!outFile) { console.error('need output file path'); process.exit(1) }
const wrapper = JSON.parse(fs.readFileSync(outFile, 'utf8'))
const R = wrapper.result || wrapper
if (!R || !R.stats) { console.error('no stats in result'); process.exit(1) }

const coded = Array.isArray(R.coded) ? R.coded : []
const controls = coded.filter(r => r.arm === 'control')
const hits = coded.filter(r => r.arm === 'hit')

// comparison_stats.json
fs.writeFileSync(path.join(REPORT, 'comparison_stats.json'), JSON.stringify({
  meta: R.meta, stats: R.stats, dimensions: R.dimensions, redteam_ko: R.redteam_ko, critic_ko: R.critic_ko,
}, null, 2))

// control_dataset.json (+ recoded hits blind)
fs.writeFileSync(path.join(REPORT, 'control_dataset.json'), JSON.stringify(controls, null, 2))
fs.writeFileSync(path.join(REPORT, 'recoded_hits_blind.json'), JSON.stringify(hits, null, 2))

// report/control-study.md
if (typeof R.report_markdown === 'string') fs.writeFileSync(path.join(REPORT, 'control-study.md'), R.report_markdown)

// flat CSV of the whole coded pool
const flat = coded.map(r => {
  const c = r.code || {}
  const nov = (c.twists || []).reduce((m, t) => Math.max(m, t.twist_novelty_score || 0), 0)
  return {
    title: r.title, arm: r.arm, band: r.band, fits: r.fits, app_id: r.app_id, year: r.year,
    base_type: c.base_concept_type, familiarity: c.base_familiarity_score, twist_present: c.twist_present,
    max_novelty: nov, twist_types: (c.twists || []).map(t => t.twist_type).join(' | '),
    co_op: c.co_op, price: c.price_usd_launch, team_size: c.team_size, solo: c.solo_dev,
    is_sequel: c.is_sequel, is_licensed_IP: c.is_licensed_IP, is_original: c.is_new_original_IP,
    research_confidence: c.research_confidence, outcome_leaked: c.outcome_leaked,
    orig_fits: r.orig ? r.orig.fits : '', copies_m: r.orig ? r.orig.copies_m : '',
  }
})
const cols = Object.keys(flat[0] || { title: 1 })
const cell = v => { if (v === null || v === undefined) return ''; v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }
fs.writeFileSync(path.join(REPORT, 'control_dataset.csv'),
  [cols.join(',')].concat(flat.map(r => cols.map(c => cell(r[c])).join(','))).join('\n') + '\n')

// console summary
const s = R.stats, m = s.primary_2x2_blind
console.log('WROTE report/{comparison_stats.json, control_dataset.{json,csv}, recoded_hits_blind.json, control-study.md}')
console.log('controls:', controls.length, '| hits(blind-recoded):', hits.length, '| dims:', (R.dimensions || []).length)
console.log('control bands:', JSON.stringify(s.control_band_counts))
console.log('PRIMARY 2x2 (blind): P(fits|hit)=' + m.p_hit, 'P(fits|control)=' + m.p_ctrl, '| RD=' + m.rd_points + 'pt', 'OR=' + m.odds_ratio, 'OR_CI=' + JSON.stringify(m.or_ci), '|', m.verdict)
console.log('band gradient:', (s.band_gradient || []).map(b => `${b.band}:${b.fits_pct}%(n${b.n})`).join(' → '))
console.log('Cochran-Armitage:', JSON.stringify(s.cochran_armitage))
console.log('gate decomposition:'); (s.gate_decomposition || []).forEach(g => console.log('  ', g.feature, `hit ${g.hit_pct}% vs ctrl ${g.ctrl_pct}% (RD ${g.rd_points}pt, OR ${g.odds_ratio})`))
console.log('top discriminating features:'); (s.feature_discrimination_ranked || []).slice(0, 8).forEach(f => console.log('  ', f.feature, `hit ${f.hit_pct}% vs ctrl ${f.ctrl_pct}% (RD ${f.rd_points}pt)`))
console.log('confirmation bias:', JSON.stringify(s.confirmation_bias))
console.log('sensitivity:', JSON.stringify({ leak_rate: s.sensitivity.leak_rate_pct, no_leak_RD: s.sensitivity.primary_no_leak && s.sensitivity.primary_no_leak.rd_points, hi_conf_RD: s.sensitivity.primary_hi_confidence && s.sensitivity.primary_hi_confidence.rd_points }))