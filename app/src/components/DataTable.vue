<script setup lang="ts">
// A sortable, filterable table of entries.
import { currentPc } from '../sheet'
import { computed, ref, watch } from 'vue'
import type { Entry, EntryType } from '../model/types'
import { column, facet } from '../columns'
import { formatMoney } from '../store'
import { TYPES } from '../model/schema'
import { newEntry } from '../ui'
import EntryLink from './EntryLink.vue'
import FieldValue from './FieldValue.vue'

const props = withDefaults(defineProps<{
  rows: Entry[]
  cols: string[]
  facets?: string[]
  sort?: { key: string; dir: 1 | -1 }
  limit?: number
  type?: EntryType
  /** The type the view's ＋ New makes, for its empty state. */
  creates?: EntryType
}>(), { facets: () => [], sort: () => ({ key: 'name', dir: 1 as const }) })

/** The columns, leaving out any with nothing in any row (a Player nobody filled in). */
const columns = computed(() => props.cols.map(k => column(k, props.type)).filter(c => !props.rows.length || props.rows.some(e => !empty(c.value(e)))))
const facetDefs = computed(() => props.facets.map(k => facet(k, props.type)).map(f => ({ f, values: f.values(props.rows) })).filter(x => x.values.length > 1))

const q = ref('')
const sortKey = ref(props.sort.key)
const sortDir = ref<number>(props.sort.dir)
const chosen = ref<Record<string, string>>({})
watch(() => [props.cols, props.sort, props.rows.length === 0] as const, () => {
  sortKey.value = props.sort.key; sortDir.value = props.sort.dir
})
watch(() => props.facets.join(), () => { chosen.value = {} })
watch(facetDefs, fs => { for (const x of fs) chosen.value[x.f.key] ??= '' }, { immediate: true })

const sorted = (list: Entry[], key: string, dir: number) => {
  const col = key === 'name' ? column('name') : columns.value.find(c => c.key === key) ?? column(key)
  return [...list].sort((a, b) => {
    const x = col.sort(a), y = col.sort(b)
    return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name)) * dir
  })
}
/** A view with a limit ("Last 50 changes") picks its rows by its own sort first; re-sorting only reorders them. */
const base = computed(() => (props.limit ? sorted(props.rows, props.sort.key, props.sort.dir).slice(0, props.limit) : props.rows))
const shown = computed(() => {
  const n = q.value.trim().toLowerCase()
  const list = base.value.filter(e =>
    (!n || e.name.toLowerCase().includes(n) || e.aliases.some(a => a.toLowerCase().includes(n))) &&
    facetDefs.value.every(({ f }) => !chosen.value[f.key] || f.match(e, chosen.value[f.key])))
  return sorted(list, sortKey.value, sortDir.value)
})

function sortBy(k: string) {
  if (sortKey.value === k) sortDir.value *= -1
  else { sortKey.value = k; sortDir.value = 1 }
}
const arrow = (k: string) => (sortKey.value === k ? (sortDir.value > 0 ? ' ▲' : ' ▼') : '')
const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length)
defineExpose({ count: computed(() => shown.value.length) })
</script>

<template>
  <div>
    <div class="filters table-filters">
      <input v-model="q" type="search" placeholder="Filter by name…" />
      <label v-for="{ f, values } in facetDefs" :key="f.key" class="facet">
        <span>{{ f.label }}</span>
        <select v-model="chosen[f.key]">
          <option value="">All</option>
          <option v-for="v in values" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>
      <span class="muted small">{{ shown.length === base.length ? `${shown.length} shown` : `${shown.length} of ${base.length} shown` }}</span>
    </div>
    <div class="table-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th class="sortable" title="Sort by name" @click="sortBy('name')">Name{{ arrow('name') }}</th>
            <th v-for="c in columns" :key="c.key" class="sortable" :class="{ num: c.kind === 'money' || c.field?.kind === 'money' }" :title="`Sort by ${c.label.toLowerCase()}`" @click="sortBy(c.key)">{{ c.label }}{{ arrow(c.key) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in shown" :key="e.id">
            <td class="name"><EntryLink :id="e.id" :icon="e.type === 'pc'" /><span v-if="e.id === currentPc?.id" class="current-mark" title="The current character">★ current</span></td>
            <td v-for="c in columns" :key="c.key" :class="{ num: c.kind === 'money' || c.field?.kind === 'money', clip: c.field?.kind === 'longtext' }">
              <template v-if="empty(c.value(e))" />
              <FieldValue v-else-if="c.field" :def="c.field" :value="c.value(e)" :entry="e" />
              <span v-else-if="c.kind === 'ids'" class="chips"><EntryLink v-for="id in (c.value(e) as string[])" :key="id" :id="id" class="chip" /></span>
              <template v-else-if="c.kind === 'money'">{{ formatMoney(c.value(e)) }}</template>
              <template v-else>{{ c.value(e) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!base.length" class="muted pad">No {{ (TYPES[creates ?? type ?? 'note']?.plural ?? 'entries').toLowerCase() }} yet<template v-if="creates ?? type"> — <button class="link-btn" @click="newEntry((creates ?? type)!)">＋ New {{ TYPES[(creates ?? type)!].label.toLowerCase() }}</button></template>.</p>
      <p v-else-if="!shown.length" class="muted pad">Nothing matches.</p>
    </div>
  </div>
</template>
