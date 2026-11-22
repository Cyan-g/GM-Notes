// Two copies of the world as two devices, A and B: changes made on each are merged into the other through the real
// change log (electron/db.cjs) and the real merge (src/devicesync/merge.ts), on copies in a temporary folder.
// node tests/devicesync-merge.mjs <a world folder>   (the world itself is only read)
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { createRequire } from 'node:module'
import { planMerge, applyPlan } from '../src/devicesync/merge.ts'
const require = createRequire(import.meta.url)
const { WorldDb } = require('../electron/db.cjs')
import os from 'node:os'
const here = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-sync-test-'))
const sleep = ms => new Promise(r => setTimeout(r, ms))

function device(name) {
  const dir = path.join(here, `mergetest-${name}`)
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir)
  fs.copyFileSync(path.join(process.argv[2], 'dndesk.sqlite'), path.join(dir, 'dndesk.sqlite'))
  const db = new WorldDb(dir, { device: `device-${name}` })
  const l = db.load()
  return { name, db, d: l.data, rev: l.rev, got: 0, since: '' }
}
// what the app's store does: save what differs from the last saved state
function snapshot(d) { return { e: new Map(Object.values(d.entries).map(x => [x.id, JSON.stringify(x)])), r: new Map(d.relations.map(x => [x.id, JSON.stringify(x)])), meta: JSON.stringify(d.meta), play: Object.fromEntries(['tracker', 'spellbook', 'crafting', 'playerNotes'].map(k => [k, JSON.stringify(d[k] ?? null)])) } }
function saveDiff(dev, before, extra = {}) {
  const d = dev.d
  const upsert = Object.values(d.entries).filter(x => before.e.get(x.id) !== JSON.stringify(x))
  const remove = [...before.e.keys()].filter(id => !d.entries[id])
  const relUpsert = d.relations.filter(x => before.r.get(x.id) !== JSON.stringify(x))
  const ids = new Set(d.relations.map(x => x.id)), relRemove = [...before.r.keys()].filter(id => !ids.has(id))
  const play = {}; for (const k of Object.keys(before.play)) if (before.play[k] !== JSON.stringify(d[k] ?? null)) play[k] = d[k] ?? null
  dev.rev = dev.db.save({ rev: dev.rev, upsert, remove, relUpsert, relRemove, play, meta: before.meta !== JSON.stringify(d.meta) || upsert.length ? d.meta : undefined, ...extra })
}
async function edit(dev, f) { const before = snapshot(dev.d); f(dev.d); saveDiff(dev, before); await sleep(5) }
// one device asks the other for what changed and takes it in
function pull(to, from, batch = from.db.changeBatch(to.got)) {
  const keys = batch.items.map(x => `${x.kind}:${x.key}`)
  const plan = planMerge(to.d, batch, to.db.linesOf(keys), to.since)
  const before = snapshot(to.d)
  const n = applyPlan(to.d, plan)
  if (n) saveDiff(to, before, { origin: plan.origin, keep: plan.keep })
  to.got = batch.upTo
  return { n, plan }
}
// both send what they have at the same moment, then each takes the other's in
const talk = (a, b) => { const t = new Date().toISOString(); const fromB = b.db.changeBatch(a.got), fromA = a.db.changeBatch(b.got); const x = pull(a, b, fromB), y = pull(b, a, fromA); a.since = b.since = t; return [x, y] }
const ok = (name, f) => { f(); console.log('ok  ', name) }
const clean = x => JSON.parse(JSON.stringify(x))

const A = device('A'), B = device('B')
const npcs = Object.values(A.d.entries).filter(x => x.type === 'npc')
const [n1, n2, n3] = npcs

await edit(A, d => { d.entries[n1.id].body += '\n\nChanged on A.'; d.entries[n1.id].updated = new Date().toISOString() })
let [, toB] = [null, pull(B, A)]
ok('an entry changed on A arrives on B, marked as A\'s change', () => {
  assert.equal(B.d.entries[n1.id].body, A.d.entries[n1.id].body)
  assert.deepEqual(clean(B.db.linesOf([`entry:${n1.id}`])[`entry:${n1.id}`]), clean(A.db.linesOf([`entry:${n1.id}`])[`entry:${n1.id}`]))
})
ok('that change doesn\'t come back to A as new', () => { const { n } = pull(A, B); assert.equal(n, 0) })
A.since = B.since = new Date().toISOString(); await sleep(5)

// both change n2 while apart: B later
await edit(A, d => { d.entries[n2.id].body = 'A says so.' })
await edit(B, d => { d.entries[n2.id].body = 'B says so, later.' })
const [intoA, intoB] = talk(A, B)
ok('changed on both: the newer (B) wins on both devices', () => {
  assert.equal(A.d.entries[n2.id].body, 'B says so, later.')
  assert.equal(B.d.entries[n2.id].body, 'B says so, later.')
})
ok('…reported as a conflict on both sides', () => {
  assert.deepEqual(intoA.plan.conflicts.map(c => [c.key, c.kept]), [[n2.id, 'theirs']])
  assert.deepEqual(intoB.plan.conflicts.map(c => [c.key, c.kept]), [[n2.id, 'here']])
})
ok('…and A\'s replaced version is in A\'s History', () => {
  assert.ok(A.db.history(n2.id).some(h => h.entry.body === 'A says so.'))
})

// a new entry with a relation on B; a deleted entry (with its relations) on A
const fresh = { ...clean(n3), id: 'sync-test-npc', name: 'Sync Test NPC', created: new Date().toISOString(), updated: new Date().toISOString() }
const doomed = Object.values(A.d.entries).find(x => x.type === 'npc' && A.d.relations.filter(r => r.a === x.id || r.b === x.id).length >= 2 && ![n1.id, n2.id, n3.id].includes(x.id))
await edit(B, d => { d.entries[fresh.id] = fresh; d.relations.push({ id: 'sync-test-rel', a: fresh.id, b: n1.id, kind: d.relations[0].kind, visibility: 'known' }) })
await edit(A, d => { delete d.entries[doomed.id]; d.relations = d.relations.filter(r => r.a !== doomed.id && r.b !== doomed.id) })
talk(A, B)
ok('a new entry and its relation arrive', () => {
  assert.equal(A.d.entries[fresh.id]?.name, 'Sync Test NPC')
  assert.ok(A.d.relations.some(r => r.id === 'sync-test-rel'))
})
ok('a deleted entry and its relations are gone on the other device too, and recoverable there', () => {
  assert.ok(!B.d.entries[doomed.id])
  assert.ok(!B.d.relations.some(r => r.a === doomed.id || r.b === doomed.id))
  assert.ok(B.db.deleted().some(x => x.entry.id === doomed.id))
})

// settings: today and the tracker travel, the theme doesn't
await edit(B, d => { d.meta.today = { ...d.meta.today, day: 7 }; d.meta.theme = { preset: 'infernal' }; d.tracker = { ...(d.tracker ?? {}), round: 4 } })
talk(A, B)
ok('today\'s date and the combat tracker travel; the theme stays per device', () => {
  assert.equal(A.d.meta.today.day, 7)
  assert.equal(A.d.tracker.round, 4)
  assert.notDeepEqual(A.d.meta.theme, { preset: 'infernal' })
})

// a relation to an entry the other device deleted later
await edit(B, d => { d.relations.push({ id: 'sync-test-rel2', a: fresh.id, b: n3.id, kind: d.relations[0].kind, visibility: 'known' }) })
await edit(A, d => { delete d.entries[n3.id]; d.relations = d.relations.filter(r => r.a !== n3.id && r.b !== n3.id) })
const [rA, rB] = talk(A, B)
ok('a relation to an entry deleted later on the other device is dropped, not broken', () => {
  assert.ok(!A.d.entries[n3.id] && !B.d.entries[n3.id])
  assert.ok(!A.d.relations.some(r => r.id === 'sync-test-rel2') && !B.d.relations.some(r => r.id === 'sync-test-rel2'))
  assert.equal(rA.plan.skipped + rB.plan.skipped >= 1, true)
})

ok('both devices end with the same world', () => {
  const pick = d => JSON.stringify({ e: Object.values(d.entries).map(x => [x.id, x.name, x.body]).sort(), r: d.relations.map(x => x.id).sort(), today: d.meta.today, tracker: d.tracker ?? null })
  assert.equal(pick(A.d), pick(B.d))
  assert.equal(pick(A.d), pick(A.db.load().data))
  assert.equal(pick(B.d), pick(B.db.load().data))
})
ok('both databases check out', () => { assert.equal(A.db.integrity(), 'ok'); assert.equal(B.db.integrity(), 'ok') })
console.log('all passed')
