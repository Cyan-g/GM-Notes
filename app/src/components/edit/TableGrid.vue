<script setup lang="ts">
// A markdown table inside a text, edited as a grid (TextWithTables, BodyEditor): a field per cell, the header row bold;
// rows and columns added and removed. Every change gives the whole table back (textTables.ts writes it as text).
import type { Table } from '../../textTables'
import { inputValue as val } from '../../dom'

const props = defineProps<{ table: Table }>()
const emit = defineEmits<{ update: [Table]; remove: [] }>()
const copy = (): Table => ({ head: [...props.table.head], align: [...props.table.align], rows: props.table.rows.map(r => [...r]) })
function setHead(c: number, v: string) { const t = copy(); t.head[c] = v; emit('update', t) }
function setCell(r: number, c: number, v: string) { const t = copy(); t.rows[r][c] = v; emit('update', t) }
function addRow(after = props.table.rows.length - 1) { const t = copy(); t.rows.splice(after + 1, 0, t.head.map(() => '')); emit('update', t) }
function removeRow(r: number) { const t = copy(); t.rows.splice(r, 1); emit('update', t) }
function addColumn() { const t = copy(); t.head.push('Column'); t.align.push(':--'); t.rows.forEach(r => r.push('')); emit('update', t) }
function removeColumn(c: number) {
  if (props.table.head.length < 2) return
  const t = copy(); t.head.splice(c, 1); t.align.splice(c, 1); t.rows.forEach(r => r.splice(c, 1)); emit('update', t)
}
function remove() { if (confirm('Remove this table and what’s in it?')) emit('remove') }
/** Enter in a cell of the last row adds a row below; in another, goes to the cell below. */
function onEnter(ev: KeyboardEvent, r: number, c: number) {
  ev.preventDefault()
  if (r === props.table.rows.length - 1) addRow(r)
  setTimeout(() => {
    const grid = (ev.target as HTMLElement).closest('table')
    grid?.querySelector<HTMLInputElement>(`input[data-cell="${r + 1}:${c}"]`)?.focus()
  })
}
</script>

<template>
  <div class="tgrid">
    <table>
      <thead>
        <tr class="tgrid-cols">
          <th v-for="(_, c) in table.head" :key="c"><button v-if="table.head.length > 1" type="button" class="link-btn tgrid-x" :title="`Remove column ${c + 1}`" :aria-label="`Remove column ${c + 1}`" @click="removeColumn(c)">×</button></th>
          <th />
        </tr>
        <tr>
          <th v-for="(h, c) in table.head" :key="c"><input :value="h" :aria-label="`Heading ${c + 1}`" @change="setHead(c, val($event))" /></th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in table.rows" :key="r">
          <td v-for="(cell, c) in row" :key="c"><input :value="cell" :data-cell="`${r}:${c}`" :aria-label="`Row ${r + 1}, column ${c + 1}`" @change="setCell(r, c, val($event))" @keydown.enter="onEnter($event, r, c)" /></td>
          <td class="tgrid-act"><button type="button" class="link-btn tgrid-x" :title="`Remove row ${r + 1}`" :aria-label="`Remove row ${r + 1}`" @click="removeRow(r)">×</button></td>
        </tr>
      </tbody>
    </table>
    <div class="tgrid-bar">
      <button type="button" class="chip-btn" @click="addRow()">+ Row</button>
      <button type="button" class="chip-btn" @click="addColumn">+ Column</button>
      <button type="button" class="link-btn small danger" @click="remove">Remove table</button>
    </div>
  </div>
</template>
