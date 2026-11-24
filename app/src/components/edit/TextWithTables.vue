<script setup lang="ts">
// A text box whose tables are edited as grids (feature and option texts): the text around a table stays a text box
// (LinkTextarea: links shown as they'll read), each table in it is a TableGrid. Without a table it's one text box,
// as before. `addTable()` puts a new table at the end. Emits the whole text on every change.
import { computed } from 'vue'
import LinkTextarea from './LinkTextarea.vue'
import TableGrid from './TableGrid.vue'
import { NEW_TABLE, editParts, joinTables, tableText, type Part, type Table } from '../../textTables'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ value: string; rows?: number; placeholder?: string }>()
const emit = defineEmits<{ update: [string] }>()
const parts = computed(() => editParts(props.value ?? ''))
const hasTable = computed(() => parts.value.some(p => p.kind === 'table'))
function put(k: number, p: Part | null) {
  const l = [...parts.value]
  if (p) l[k] = p; else l.splice(k, 1)
  emit('update', joinTables(l))
}
const setText = (k: number, text: string) => put(k, { kind: 'text', text })
const setTable = (k: number, table: Table) => put(k, { kind: 'table', raw: tableText(table), table })
/** A new table at the end of the text. */
function addTable() {
  const v = (props.value ?? '').replace(/\s+$/, '')
  emit('update', v ? `${v}\n\n${NEW_TABLE}` : NEW_TABLE)
}
defineExpose({ addTable })
</script>

<template>
  <LinkTextarea v-if="!hasTable" v-bind="$attrs" :rows="rows" :value="value" :placeholder="placeholder" @input="emit('update', ($event.target as HTMLTextAreaElement).value)" />
  <div v-else class="text-tables" v-bind="$attrs">
    <template v-for="(p, k) in parts" :key="k">
      <LinkTextarea v-if="p.kind === 'text'" grow :rows="1" :value="p.text" :placeholder="k === 0 ? 'Text above the table' : k === parts.length - 1 ? 'Text below the table' : 'Text between the tables'"
        @input="setText(k, ($event.target as HTMLTextAreaElement).value)" />
      <TableGrid v-else :table="p.table" @update="t => setTable(k, t)" @remove="put(k, null)" />
    </template>
  </div>
</template>
