// Tests the change log (sync step 1) on a copy of a world in a temporary folder.
// node tests/devicesync-log.cjs <a world folder>   (the world itself is only read)
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert')
const { WorldDb } = require('../electron/db.cjs')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-log-test-'))
fs.copyFileSync(path.join(process.argv[2], 'dndesk.sqlite'), path.join(tmp, 'dndesk.sqlite'))
const w = new WorldDb(tmp, { device: 'dev-A' })
const ok = (name, f) => { f(); console.log('ok  ', name) }

const s0 = w.logState()
ok('an existing world gets a log ID and an empty log', () => { assert.ok(s0.log); assert.equal(s0.seq, 0) })

let { data: d, rev } = w.load()
const e = structuredClone(Object.values(d.entries).find(x => x.type === 'npc'))
e.body += '\n\nLog test.'; e.updated = new Date().toISOString()
const rel = d.relations[0]
const meta = { ...d.meta, today: { ...(d.meta.today ?? {}), day: 99 }, theme: { preset: 'dungeon' } }
rev = w.save({ rev, upsert: [e], relUpsert: [{ ...rel, note: 'log test' }], meta, play: { tracker: { round: 3 }, follow: d.follow ?? null } })
ok('one save: the entry, the relation and meta.today, not the theme or follow', () => {
  const l = w.changesSince(0)
  assert.deepEqual(l.map(x => `${x.kind}:${x.key}:${x.op}`).sort(), [`entry:${e.id}:put`, `relation:${rel.id}:put`, 'setting:meta.today:put', 'setting:tracker:put'].sort())
  assert.ok(l.every(x => x.device === 'dev-A'))
})

const before = w.logState().seq
rev = w.save({ rev, upsert: [{ ...e, body: e.body + ' Again.' }], meta })
ok('the same entry again: still one line, with a higher number; unchanged meta not logged', () => {
  const l = w.changesSince(0)
  assert.equal(l.filter(x => x.key === e.id).length, 1)
  assert.ok(l.find(x => x.key === e.id).seq > before)
  assert.deepEqual(w.changesSince(before).map(x => x.key), [e.id])
})

const victim = Object.values(d.entries).find(x => x.type === 'item' && !d.relations.some(r => r.a === x.id || r.b === x.id))
rev = w.save({ rev, remove: [victim.id], relRemove: [rel.id] })
ok('deletions are logged as deletes', () => {
  const l = w.changesSince(0)
  assert.equal(l.find(x => x.key === victim.id).op, 'delete')
  assert.equal(l.find(x => x.key === rel.id).op, 'delete')
})

rev = w.save({ rev, upsert: [{ ...e, name: e.name + ' (B)' }], origin: { [`entry:${e.id}`]: { device: 'dev-B', at: '2026-11-22T10:00:00.000Z' } } })
ok('a change from another device keeps its device and time', () => {
  const x = w.changesSince(0).find(x => x.key === e.id)
  assert.equal(x.device, 'dev-B'); assert.equal(x.at, '2026-11-22T10:00:00.000Z')
})

w.logFile('images/abc.png', 'put'); w.logFile('backups/x.sqlite', 'put'); w.logFile('images/sub/x.png', 'put')
ok('pictures are logged, backups and sub-folders are not', () => {
  const files = w.changesSince(0).filter(x => x.kind === 'file').map(x => x.key)
  assert.deepEqual(files, ['images/abc.png'])
})

const id1 = w.logState().log; w.newLog()
ok('a restore gives the log a new ID', () => assert.notEqual(w.logState().log, id1))

ok('the world still loads and checks out', () => { assert.equal(w.integrity(), 'ok'); assert.ok(Object.keys(w.load().data.entries).length > 1000) })
w.close()
const r = new WorldDb(tmp, { readOnly: true })
ok('a read-only copy reads the log too', () => assert.ok(r.changesSince(0).length >= 6))
r.close()
console.log('all passed')
