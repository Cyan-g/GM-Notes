// Tables inside a text, split for editing and put back: node --experimental-strip-types tests/textTables.mjs
import assert from 'node:assert'
import { splitTables, joinTables, editParts, tableText, cells } from '../src/textTables.ts'

const text = 'Intro line.\n\n| 1d6 | Gift |\n|:-:|:--|\n| 1 | Butterflies |\n| 2 | Flowers |\n\nAfter the table.'
let p = splitTables(text)
assert.deepEqual(p.map(x => x.kind), ['text', 'table', 'text'])
assert.deepEqual(p[1].table.head, ['1d6', 'Gift'])
assert.deepEqual(p[1].table.align, [':-:', ':--'])
assert.deepEqual(p[1].table.rows, [['1', 'Butterflies'], ['2', 'Flowers']])
// unchanged: the same text back
assert.equal(joinTables(p), text)
assert.equal(joinTables(editParts(text)), text)

// a table alone, and at the very start or end: no blank lines added
const only = '| a | b |\n|---|---|\n| 1 | 2 |'
assert.equal(joinTables(editParts(only)), only)
assert.deepEqual(editParts(only).map(x => x.kind), ['text', 'table', 'text'])
assert.equal(joinTables(editParts('Text\n\n' + only)), 'Text\n\n' + only)

// a changed table is written anew; text typed into the empty part after it gets a blank line between
p = editParts(only)
p[1].table.rows.push(['3', 'x|y'])
p[1].raw = tableText(p[1].table)
p[2] = { kind: 'text', text: 'Below.' }
assert.equal(joinTables(p), '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | x\\|y |\n\nBelow.')
assert.deepEqual(cells('| 3 | x\\|y |'), ['3', 'x|y'])

// no table: one text part; a pipe in prose isn't a table
assert.deepEqual(splitTables('A | B'), [{ kind: 'text', text: 'A | B' }])
assert.deepEqual(splitTables(''), [{ kind: 'text', text: '' }])
// two tables with a blank line between
const two = only + '\n\n' + only
assert.equal(joinTables(editParts(two)), two)
// a link with a label in a cell: its pipe stays in the cell, written back escaped
assert.deepEqual(cells('| [[the-iron-branch|The Iron Branch]] | x |'), ['[[the-iron-branch|The Iron Branch]]', 'x'])
assert.deepEqual(cells('| [[a\\|b]] | x |'), ['[[a|b]]', 'x'])
assert.equal(tableText({ head: ['h'], align: ['---'], rows: [['[[a|b]]']] }), '| h |\n|---|\n| [[a\\|b]] |')
console.log('text tables: ok')
