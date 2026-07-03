#!/usr/bin/env node
// Computes chart aggregates from report/dataset.json → report/chart_data.json
const fs = require('fs')
const path = require('path')
const REPORT = path.join(__dirname, '..', 'report')
const rows = JSON.parse(fs.readFileSync(path.join(REPORT, 'dataset.json'), 'utf8'))
const AB = rows.filter(r => r.tier === 'A' || r.tier === 'B')
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const pct = (n, d) => d ? Math.round((n / d) * 1000) / 10 : 0

// 1) fits donut
const fitCount = AB.filter(r => r.fits).length
const donut = { fit: fitCount, nofit: AB.length - fitCount, total: AB.length, pct: pct(fitCount, AB.length) }

// 2) base-type freq + fit rate
const baseOrder = ['established_videogame_genre_or_mode', 'real_world_game', 'licensed_or_franchise_IP', 'original_no_clear_base', 'physical_party_activity', 'folklore_mythology']
const baseLabel = {
  established_videogame_genre_or_mode: '기성 비디오게임 장르/모드', real_world_game: '현실 게임/활동',
  licensed_or_franchise_IP: '라이선스/프랜차이즈 IP', original_no_clear_base: '오리지널(베이스 없음)',
  physical_party_activity: '물리적 파티 활동', folklore_mythology: '민담/신화',
}
const baseType = baseOrder.map(k => {
  const g = AB.filter(r => r.base_type === k)
  return { key: k, label: baseLabel[k], count: g.length, fit: g.filter(r => r.fits).length, fitRate: pct(g.filter(r => r.fits).length, g.length) }
}).filter(d => d.count > 0)

// 3) twist-type freq + median copies among possessors
const twistTypes = ['aesthetic_reframe', 'co_op_social_layer', 'genre_fusion', 'mechanical_swap', 'price_or_scope_disruption', 'narrative_reframe', 'accessibility_simplification', 'physics_jank_emergence', 'input_embodiment', 'procedural_roguelike_layer']
const twistLabel = {
  aesthetic_reframe: '미학적 재구성', co_op_social_layer: '협동/소셜 레이어', genre_fusion: '장르 융합',
  mechanical_swap: '기계적 교체', price_or_scope_disruption: '가격/규모 파괴', narrative_reframe: '서사 재구성',
  accessibility_simplification: '접근성 단순화', physics_jank_emergence: '물리 잼 창발', input_embodiment: '입력 체화',
  procedural_roguelike_layer: '로그라이크 레이어',
}
const twist = twistTypes.map(t => {
  const g = AB.filter(r => Array.isArray(r.twist_types) && r.twist_types.includes(t))
  const copies = g.map(r => r.copies_m).filter(x => typeof x === 'number')
  return { key: t, label: twistLabel[t], count: g.length, medianCopies: median(copies) }
}).filter(d => d.count > 0)

// 4) trait prevalence (A+B)
const traits = [
  { key: 'co_op', label: '협동/소셜', v: pct(AB.filter(r => r.co_op).length, AB.length) },
  { key: 'streamer', label: '스트리머 구동', v: pct(AB.filter(r => r.streamer_driven).length, AB.length) },
  { key: 'short_form', label: '숏폼 바이럴', v: pct(AB.filter(r => r.short_form_viral).length, AB.length) },
  { key: 'early_access', label: 'Early Access', v: pct(AB.filter(r => r.early_access).length, AB.length) },
  { key: 'sequel', label: '속편', v: pct(AB.filter(r => r.is_sequel).length, AB.length) },
  { key: 'original', label: '신규 오리지널 IP', v: pct(AB.filter(r => r.is_original).length, AB.length) },
  { key: 'solo_tiny', label: '솔로/소규모(≤5인)', v: pct(AB.filter(r => r.solo || (r.team_size && r.team_size <= 5)).length, AB.length) },
]

// 5) price distribution bins
const priceBins = [
  { label: '무료/<$5', lo: 0, hi: 5 }, { label: '$5–10', lo: 5, hi: 10 }, { label: '$10–20', lo: 10, hi: 20 },
  { label: '$20–40', lo: 20, hi: 40 }, { label: '$40–60', lo: 40, hi: 60 }, { label: '$60+', lo: 60, hi: 1e9 },
]
const price = priceBins.map(b => {
  const g = AB.filter(r => typeof r.price === 'number' && r.price >= b.lo && r.price < b.hi)
  return { label: b.label, count: g.length, fit: g.filter(r => r.fits).length }
})

// 6) games by year, fit split (2020+)
const years = [2020, 2021, 2022, 2023, 2024, 2025, 2026]
const byYear = years.map(y => {
  const g = AB.filter(r => r.year === y)
  return { year: y, fit: g.filter(r => r.fits).length, nofit: g.filter(r => !r.fits).length, total: g.length }
})
const preCount = AB.filter(r => r.year && r.year < 2020).length

// 7) familiarity × novelty matrix (fam 1-5 rows, novelty 0-5 cols); cell=count, fitCount
const matrix = []
for (let fam = 5; fam >= 1; fam--) {
  const rowCells = []
  for (let nov = 0; nov <= 5; nov++) {
    const g = AB.filter(r => r.familiarity === fam && (r.max_novelty || 0) === nov)
    rowCells.push({ fam, nov, count: g.length, fit: g.filter(r => r.fits).length })
  }
  matrix.push(rowCells)
}

// 8) representative cases (pull from dataset when present)
const wanted = ['Buckshot Roulette', 'MECCHA CHAMELEON', "Liar's Bar", 'Content Warning', 'Chained Together']
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const cases = wanted.map(w => {
  const r = rows.find(x => norm(x.title) === norm(w)) || rows.find(x => norm(x.title).includes(norm(w).slice(0, 8)))
  return r ? { title: r.title, base: r.base_concept, familiarity: r.familiarity, twist_types: r.twist_types, novelty: r.max_novelty, price: r.price, team: r.team_size, copies: r.copies_m, hook: r.hook } : { title: w, missing: true }
})

const out = {
  meta: { generated: '2026-07-03', cohort_AB: AB.length, total: rows.length },
  donut, baseType, twist, traits, price, byYear, preCount, matrix, cases,
  headline: {
    fits_pct_AB: donut.pct, fits_pct_ABC: 53.5, coder_disagreement: 45,
    coop: traits.find(t => t.key === 'co_op').v, streamer: traits.find(t => t.key === 'streamer').v,
  },
}
fs.writeFileSync(path.join(REPORT, 'chart_data.json'), JSON.stringify(out, null, 2))
console.log('chart_data.json written. cohort A+B =', AB.length, '| fit', donut.fit + '/' + donut.total, '=', donut.pct + '%')
console.log('base_type rows:', baseType.length, '| twist rows:', twist.length, '| pre-2020 in cohort:', preCount)
console.log('matrix fam5..1 x nov0..5 fit cells:')
for (const row of matrix) console.log(' fam' + row[0].fam, row.map(c => c.fit + '/' + c.count).join('  '))
console.log('cases found:', cases.map(c => c.missing ? c.title + '(MISSING)' : c.title + ' ' + c.copies + 'M').join(' | '))