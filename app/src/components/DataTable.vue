<script setup lang="ts">
// A sortable, filterable table of entries.
import { printable } from '../cards'
import AppIcon from './AppIcon.vue'
import { activeSpellbook, currentPc } from '../sheet'
import { get, state as store, touch } from '../store'
import SpellModal from './SpellModal.vue'
import { computed, ref, watch } from 'vue'
import type { Entry, EntryType } from '../model/types'
import { column, facet } from '../columns'
import { formatMoney } from '../store'
import { TYPES, byKey, typeWord } from '../model/schema'
import { newEntry, printCards } from '../ui'
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
  /** Show the rows as a tree by this field (a ref to the parent: a subrace's main race); children sort under it. */
  tree?: string
  /** Columns the rows can be grouped by (a heading row for each place, organization, race…). */
  groups?: string[]
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
    return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name, undefined, { numeric: true })) * dir
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

// ---- as a tree: each row under its parent (rows that match a filter bring their parents along) ----
const collapsed = ref(new Set<string>())
const parentOf = (e: Entry) => (props.tree ? (byKey(e.fields)[props.tree] as string | undefined) : undefined)
const tableRows = computed(() => {
  if (!props.tree) return shown.value.map(e => ({ e, depth: 0, kids: 0 }))
  const byId = new Map(base.value.map(e => [e.id, e]))
  const keep = new Map(shown.value.map(e => [e.id, e]))
  for (const e of shown.value) for (let p = byId.get(parentOf(e) ?? ''); p && !keep.has(p.id); p = byId.get(parentOf(p) ?? '')) keep.set(p.id, p)
  const order = sorted([...keep.values()], sortKey.value, sortDir.value)
  const kids = new Map<string, Entry[]>()
  for (const e of order) { const p = parentOf(e); if (p && keep.has(p)) { if (!kids.has(p)) kids.set(p, []); kids.get(p)!.push(e) } }
  const filtering = !!q.value.trim() || Object.values(chosen.value).some(Boolean)
  const out: { e: Entry; depth: number; kids: number }[] = []
  const walk = (e: Entry, depth: number) => {
    out.push({ e, depth, kids: kids.get(e.id)?.length ?? 0 })
    if (filtering || !collapsed.value.has(e.id)) for (const k of kids.get(e.id) ?? []) if (depth < 10) walk(k, depth + 1)
  }
  for (const e of order) { const p = parentOf(e); if (!p || !keep.has(p)) walk(e, 0) }
  return out
})
// ---- grouped: a heading row per value of a column (an NPC in two places shows under the first) ----
const groupBy = ref('')
const groupCols = computed(() => (props.groups ?? []).map(k => column(k, props.type)))
function groupLabel(e: Entry): string {
  const col = groupCols.value.find(c => c.key === groupBy.value)
  if (!col) return ''
  const v = col.value(e)
  if (col.key === '@status') return String(e.fields.status ?? '').trim() || 'Alive'
  const first = Array.isArray(v) ? v[0] : v
  if (first == null || first === '') return ''
  return col.kind === 'ids' || col.field?.kind === 'ref' ? get(String(first))?.name ?? '' : String(first)
}
const grouped = computed(() => {
  if (!groupBy.value) return null
  const m = new Map<string, Entry[]>()
  for (const e of shown.value) { const g = groupLabel(e); if (!m.has(g)) m.set(g, []); m.get(g)!.push(e) }
  // the named groups in order, the rows without one last
  return [...m].sort((a, b) => (!a[0] ? 1 : !b[0] ? -1 : a[0].localeCompare(b[0]))).map(([label, rows]) => ({ label, rows }))
})
function toggleTree(id: string) {
  const s = new Set(collapsed.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  collapsed.value = s
}

function sortBy(k: string) {
  if (sortKey.value === k) sortDir.value *= -1
  else { sortKey.value = k; sortDir.value = 1 }
}
const arrow = (k: string) => (sortKey.value === k ? (sortDir.value > 0 ? ' ▲' : ' ▼') : '')
const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length)

// ---- every shown spell or item as a printed card, in the order shown (the filters pick) ----
const cardRows = computed(() => shown.value.filter(printable))
function printShown() {
  const kinds = new Set(cardRows.value.map(e => e.type))
  printCards(kinds.size === 1 ? (kinds.has('spell') ? 'Spells' : 'Items') : 'Cards', [{ label: 'Shown', ids: cardRows.value.map(e => e.id) }])
}

// ---- spells: a click opens the spell over the table; "+ Book" adds it to the current character's (or the world's) book ----
const spells = computed(() => !store.readOnly && props.rows.some(e => e.type === 'spell'))
const quick = ref<string | null>(null)
function open(ev: MouseEvent, e: Entry) {
  if (e.type !== 'spell' || ev.ctrlKey || ev.metaKey || ev.shiftKey) return
  ev.preventDefault()
  quick.value = e.id
}
const bookName = computed(() => (currentPc.value ? `${currentPc.value.name}'s spellbook` : "the world's spellbook"))
const inBook = (id: string) => activeSpellbook().known.includes(id)
function addToBook(id: string) {
  const b = activeSpellbook()
  if (!b.known.includes(id)) { b.known.push(id); touch() }
}
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
      <label v-if="groupCols.length" class="facet">
        <span>Group by</span>
        <select v-model="groupBy">
          <option value="">Nothing</option>
          <option v-for="c in groupCols" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
      </label>
      <span class="muted small">{{ shown.length === base.length ? `${shown.length} shown` : `${shown.length} of ${base.length} shown` }}</span>
      <button v-if="cardRows.length" type="button" class="link-btn small" :title="`Print the ${cardRows.length} shown as cards (PDF, poker size, nine a page)`" @click="printShown"><AppIcon ui="cards" /> Print as cards</button>
    </div>
    <div class="table-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th class="sortable" title="Sort by name" @click="sortBy('name')">Name{{ arrow('name') }}</th>
            <th v-for="c in columns" :key="c.key" class="sortable" :class="['col-' + c.key.replace('@', ''), { num: c.kind === 'money' || c.field?.kind === 'money' }]" :title="c.key === '@concRitual' ? 'Concentration · Ritual' : `Sort by ${c.label.toLowerCase()}`" @click="sortBy(c.key)">{{ c.label }}{{ arrow(c.key) }}</th>
            <th v-if="spells" class="book-col" />
          </tr>
        </thead>
        <tbody>
          <template v-for="g in grouped ?? [{ label: '', rows: [] }]" :key="g.label">
          <tr v-if="grouped" class="group-row"><td :colspan="columns.length + 1 + (spells ? 1 : 0)">{{ g.label || `No ${groupCols.find(c => c.key === groupBy)?.label.toLowerCase()}` }} <span class="muted small">{{ g.rows.length }}</span></td></tr>
          <tr v-for="{ e, depth, kids } in (grouped ? g.rows.map(e => ({ e, depth: 0, kids: 0 })) : tableRows)" :key="e.id" :class="{ 'tree-child': depth }">
            <td class="name" :style="tree ? { paddingLeft: `${0.6 + depth * 1.3}rem` } : undefined" @click.capture="open($event, e)"><button v-if="tree" type="button" class="tree-toggle" :class="{ none: !kids }" :disabled="!kids"
                :title="kids ? (collapsed.has(e.id) ? `Show its ${kids}` : 'Hide them') : ''" @click.stop="toggleTree(e.id)">{{ kids ? (collapsed.has(e.id) ? '▸' : '▾') : '' }}</button><EntryLink :id="e.id" :icon="e.type === 'pc'" /><span v-if="e.id === currentPc?.id" class="current-mark" title="The current character"><AppIcon ui="star" /> current</span></td>
            <td v-for="c in columns" :key="c.key" :class="['col-' + c.key.replace('@', ''), { num: c.kind === 'money' || c.field?.kind === 'money', clip: c.field?.kind === 'longtext' }]">
              <template v-if="empty(c.value(e))" />
              <FieldValue v-else-if="c.field" :def="c.field" :value="c.value(e)" :entry="e" />
              <span v-else-if="c.kind === 'ids'" class="chips"><EntryLink v-for="id in (c.value(e) as string[])" :key="id" :id="id" class="chip" /></span>
              <template v-else-if="c.kind === 'money'">{{ formatMoney(c.value(e)) }}</template>
              <template v-else>{{ c.value(e) }}</template>
            </td>
            <td v-if="spells" class="book-col">
              <template v-if="e.type === 'spell'">
                <span v-if="inBook(e.id)" class="muted small" :title="`In ${bookName}`">in book</span>
                <button v-else class="chip-btn" :title="`Add to ${bookName}`" @click="addToBook(e.id)">＋ Book</button>
              </template>
            </td>
          </tr>
          </template>
        </tbody>
      </table>
      <p v-if="!base.length" class="muted pad">No {{ (TYPES[creates ?? type ?? 'note']?.plural ?? 'entries').toLowerCase() }} yet<template v-if="creates ?? type"> — <button class="link-btn" @click="newEntry((creates ?? type)!)">＋ New {{ typeWord((creates ?? type)!) }}</button></template>.</p>
      <p v-else-if="!shown.length" class="muted pad">Nothing matches.</p>
    </div>
    <SpellModal v-if="quick" :id="quick" @close="quick = null">
      <template v-if="spells" #actions>
        <span v-if="inBook(quick)" class="muted small">in {{ bookName }}</span>
        <button v-else class="chip-btn" :title="`Add to ${bookName}`" @click="addToBook(quick!)">＋ Book</button>
      </template>
    </SpellModal>
  </div>
</template>
