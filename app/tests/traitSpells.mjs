// A feature's spells by level: node --experimental-strip-types tests/traitSpells.mjs
import assert from 'node:assert'
import { spellsByLevel, spansLevels, sharedOf } from '../src/traitSpells.ts'

const dusk = [{ spell: 'disguise-self', how: 'list' }, { spell: 'identify', how: 'list' }, { spell: 'knock', how: 'list', from: 3 }, { spell: 'blink', how: 'list', from: 5 }]
// spells before the feature's own level come with it (Warlock 3)
assert.deepEqual(spellsByLevel(dusk, 3).map(([l, xs]) => [l, xs.map(({ x }) => x.spell)]), [[3, ['disguise-self', 'identify', 'knock']], [5, ['blink']]])
assert.deepEqual(spellsByLevel(dusk, 1).map(([l]) => l), [1, 3, 5])
assert.ok(spansLevels(dusk, 3))
assert.ok(!spansLevels([{ spell: 'a', how: 'prepared' }, { spell: 'b', how: 'prepared' }], 3))
assert.equal(sharedOf(dusk, 'how'), 'list')
assert.equal(sharedOf([...dusk, { spell: 'x', how: 'prepared' }], 'how'), 'mixed')
assert.equal(sharedOf(dusk, 'ability'), '')
console.log('trait spells: ok')
