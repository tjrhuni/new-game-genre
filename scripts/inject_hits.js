#!/usr/bin/env node
// Splices the slim phase-1 hits array into control-study.workflow.js at the
// /*__HITS_DATA__*/ placeholder, so the workflow is self-contained & reproducible
// (the sandbox has no filesystem to read report/dataset.json at run time).
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')
const args = JSON.parse(fs.readFileSync(path.join(ROOT, 'report', '_control_args.json'), 'utf8'))
const slim = args.hits.map(h => ({
  title: h.title, app_id: h.app_id, developer: h.developer, year: h.year, genre: h.genre,
  orig_fits: h.orig_fits, orig_familiarity: h.orig_familiarity, orig_max_novelty: h.orig_max_novelty,
  copies_m: h.copies_m,
}))
const wfPath = path.join(ROOT, 'control-study.workflow.js')
let wf = fs.readFileSync(wfPath, 'utf8')
const json = JSON.stringify(slim)
// Replace the placeholder OR a previously-injected array (idempotent re-run).
const re = /const HITS_INLINE = \/\*__HITS_DATA__\*\/[\s\S]*?\n/
if (!re.test(wf)) { console.error('placeholder not found'); process.exit(1) }
wf = wf.replace(re, `const HITS_INLINE = /*__HITS_DATA__*/ ${json}\n`)
fs.writeFileSync(wfPath, wf)
console.log('injected', slim.length, 'hits (', json.length, 'bytes ) into', path.basename(wfPath))
console.log('windowed 2020-2026:', slim.filter(h => h.year >= 2020 && h.year <= 2026).length)