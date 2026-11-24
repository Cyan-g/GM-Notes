// The party between DM and players: node --experimental-strip-types tests/partySync.mjs
import assert from 'node:assert'
import { partyNpc, pendingRemovals, relinked, toCarryOut } from '../src/partySync.ts'

const t1 = '2026-11-24T10:00:00.000Z', t2 = '2026-11-25T10:00:00.000Z'
const removed = { stormwatch: t1 }
// the player's app hasn't heard: what it sends is left aside
assert.deepEqual(pendingRemovals(removed, undefined), ['stormwatch'])
assert.deepEqual(pendingRemovals(removed, { stormwatch: '2026-01-01T00:00:00.000Z' }), ['stormwatch'])
// it has: nothing pending; linked again since, the removal is over; not linked, it stays
assert.deepEqual(pendingRemovals(removed, { stormwatch: t1 }), [])
assert.deepEqual(relinked(removed, { stormwatch: t1 }, ['stormwatch', 'other']), ['stormwatch'])
assert.deepEqual(relinked(removed, { stormwatch: t1 }, ['other']), [])
assert.deepEqual(relinked(removed, undefined, ['stormwatch']), [])
// taken out again later: a new time, pending again
assert.deepEqual(pendingRemovals({ stormwatch: t2 }, { stormwatch: t1 }), ['stormwatch'])
// the player's side carries out what it hasn't yet, once
assert.deepEqual(toCarryOut(removed, undefined), [['stormwatch', t1]])
assert.deepEqual(toCarryOut(removed, { stormwatch: t1 }), [])
assert.deepEqual(toCarryOut({ stormwatch: t2 }, { stormwatch: t1 }), [['stormwatch', t2]])

const pc = {
  id: 'mira', type: 'pc', name: 'Mira', aliases: ['Mi'], tags: ['x'], body: 'A wanderer.', visibility: 'known', image: 'images/mira.png',
  created: t1, updated: t2,
  fields: { player: 'Sam', race: 'elf', hair: 'red', eyes: '', classLevels: [{ class: 'Wizard', level: 5 }], campaigns: ['stormwatch'], sheet: { hp: 3 } },
}
const npc = partyNpc(pc, 'Wizard 5')
assert.equal(npc.type, 'npc')
assert.equal(npc.id, 'mira')
assert.deepEqual(npc.fields, { race: 'elf', hair: 'red', occupation: 'Wizard 5' })
assert.equal(npc.image, 'images/mira.png')
assert.equal(npc.body, 'A wanderer.')
assert.deepEqual(npc.tags, [])
assert.equal(npc.visibility, 'known')
console.log('party sync: ok')
