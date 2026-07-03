#!/usr/bin/env node
// Extracts the slim hits payload passed into control-study.workflow.js via args.
// (Workflow sandbox has no filesystem, so the 111 confirmed hits must be handed in.)
const fs = require('fs')
const path = require('path')
const REPORT = path.join(__dirname, '..', 'report')
const rows = JSON.parse(fs.readFileSync(path.join(REPORT, 'dataset.json'), 'utf8'))

// Confirmed hits = Tier A+B (the analysis cohort from phase 1).
const hits = rows.filter(r => r.tier === 'A' || r.tier === 'B').map(r => ({
  title: r.title,
  app_id: r.app_id || null,
  developer: r.developer || null,
  year: r.year || null,
  genre: r.genre || null,
  // original (unblinded) phase-1 coding — kept ONLY for the blind-vs-original delta:
  orig_fits: !!r.fits,
  orig_familiarity: r.familiarity ?? null,
  orig_max_novelty: r.max_novelty ?? null,
  orig_twist_types: r.twist_types || [],
  orig_base_type: r.base_type || null,
  copies_m: r.copies_m ?? null,
}))

// genre × year distribution of windowed (2020-2026) hits — drives control frequency-matching.
const windowed = hits.filter(h => h.year && h.year >= 2020 && h.year <= 2026)
const cells = {}
for (const h of windowed) {
  const g = h.genre || 'unknown'
  const key = g + '||' + h.year
  cells[key] = (cells[key] || 0) + 1
}
const genreDist = {}
for (const h of windowed) { const g = h.genre || 'unknown'; genreDist[g] = (genreDist[g] || 0) + 1 }

const args = {
  seed: 20260703,
  window: '2020-2026',
  hits,                         // all 111 (for blind recode + sensitivity)
  windowed_count: windowed.length,
  genre_year_cells: cells,      // matching frame
  genre_dist: genreDist,
}
const outPath = path.join(REPORT, '_control_args.json')
fs.writeFileSync(outPath, JSON.stringify(args))
console.log('wrote', outPath, '| bytes', fs.statSync(outPath).size)
console.log('hits total', hits.length, '| windowed 2020-2026', windowed.length)
console.log('top genres (windowed):', Object.entries(genreDist).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([g,n])=>`${g}:${n}`).join(' · '))
console.log('genre×year cells:', Object.keys(cells).length)