// Gear slots: which slots items fit and where equipped lines sit: node --experimental-strip-types tests/gearSlots.mjs
import assert from 'node:assert'
import { slotsFor, placeGear, pickSlot, isTwoHanded } from '../src/gearSlots.ts'

const sword = { kind: 'Weapon', properties: ['Versatile'] }
const dagger = { kind: 'Weapon', properties: ['Finesse', 'Light', 'Thrown'] }
const greatsword = { kind: 'Weapon', properties: ['Heavy', 'Two-Handed'] }
const shield = { kind: 'Armor', armorType: 'Shield' }
const chain = { kind: 'Armor', armorType: 'Heavy' }
const helm = { kind: 'Armor', slot: 'Head' }
const ring = { kind: 'Ring' }

assert.deepEqual(slotsFor(sword), ['main', 'off'])
assert.deepEqual(slotsFor(shield), ['off'])
assert.deepEqual(slotsFor({ kind: 'Armor', slot: 'Shield' }), ['off'])
assert.deepEqual(slotsFor(chain), ['body'])
assert.deepEqual(slotsFor({ kind: 'Armor', slot: 'Chest', armorType: 'Light' }), ['body'])
assert.deepEqual(slotsFor(helm), ['head'])
assert.deepEqual(slotsFor(ring), [])
assert.ok(isTwoHanded(greatsword))

const L = (f, more = {}) => ({ fits: slotsFor(f), twoHanded: isTwoHanded(f), ...more })

// sword and shield: main and off hand; the ring is other gear
let p = placeGear([L(sword), L(shield), L(ring), L(chain)])
assert.equal(p.at.main, 0); assert.equal(p.at.off, 1); assert.equal(p.at.body, 3)
assert.deepEqual(p.other, [2]); assert.deepEqual(p.overflow, [])

// a greatsword fills both hands; a shield then finds no hand
p = placeGear([L(greatsword), L(shield)])
assert.equal(p.at.main, 0); assert.equal(p.at.off, 0); assert.deepEqual(p.overflow, [1])

// a line that says its slot gets it first: the dagger asked for the off hand
p = placeGear([L(sword), L(dagger, { slot: 'off' })])
assert.equal(p.at.main, 0); assert.equal(p.at.off, 1)
p = placeGear([L(dagger, { slot: 'off' }), L(sword)])
assert.equal(p.at.off, 0); assert.equal(p.at.main, 1)

// a versatile weapon held in two hands
p = placeGear([L(sword, { twoHands: true }), L(dagger)])
assert.equal(p.at.main, 0); assert.equal(p.at.off, 0); assert.deepEqual(p.overflow, [1])
assert.equal(p.slotOf.get(0), 'main')

// picking: the free hand first, a target when it fits, else the first slot
assert.equal(pickSlot(L(dagger), { main: 0 }), 'off')
assert.equal(pickSlot(L(dagger), { main: 0, off: 1 }), 'main')
assert.equal(pickSlot(L(dagger), {}, 'off'), 'off')
assert.equal(pickSlot(L(helm), {}, 'off'), 'head')
assert.equal(pickSlot(L(ring), {}), undefined)
console.log('gear slots: ok')
