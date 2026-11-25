<script setup lang="ts">
// Edit every relation of one entry. A change shows up on the other entry's page too.
import SuggestInput from '../SuggestInput.vue'
import Dropdown from '../Dropdown.vue'
import { computed, ref } from 'vue'
import type { Entry, EntryType, Relation, RelationKind } from '../../model/types'
import { RELATION_KINDS } from '../../model/schema'
import { formatDate, get, relationsOf, state } from '../../store'
import { addRelation, relationChanged, removeRelation } from '../../edit'
import EntryPicker from './EntryPicker.vue'
import DateInput from './DateInput.vue'

const props = defineProps<{ entry: Entry }>()

/** Every way a relation can read from this entry's side ("member of", "has member", ...), for the kinds that fit its type. */
const fits = (types: EntryType[] | undefined) => !types || types.includes(props.entry.type)
const ALL = Object.entries(RELATION_KINDS).flatMap(([kind, k]) => [
  { value: `${kind}:a`, label: k.forward, ok: fits(k.a), other: k.b },
  ...(k.symmetric ? [] : [{ value: `${kind}:b`, label: k.verb, ok: fits(k.b), other: k.a }]),
])
const OPTIONS = ALL.filter(o => o.ok)
/** The choices for an existing relation: the fitting ones, plus its own if it doesn't fit (so nothing silently changes). */
const optionsFor = (r: Relation) => (OPTIONS.some(o => o.value === optionOf(r)) ? OPTIONS : [...OPTIONS, ALL.find(o => o.value === optionOf(r))!])
const optionOf = (r: Relation) => `${r.kind}:${r.a === props.entry.id || RELATION_KINDS[r.kind].symmetric ? 'a' : 'b'}`
const otherOf = (r: Relation) => (r.a === props.entry.id ? r.b : r.a)

const rels = computed(() => relationsOf.value.get(props.entry.id) ?? [])
/** Relations grouped the way they read from this entry ("Member of", "Lives in", …), like on the page itself. */
const groups = computed(() => {
  const m = new Map<string, Relation[]>()
  for (const r of rels.value) {
    const label = ALL.find(o => o.value === optionOf(r))?.label ?? r.kind
    if (!m.has(label)) m.set(label, [])
    m.get(label)!.push(r)
  }
  return [...m.entries()].map(([label, list]) => ({ label: label[0].toUpperCase() + label.slice(1), list }))
})
/** Rows showing their kind and dates for editing. */
const open = ref(new Set<string>())
const toggle = (id: string) => { const s = new Set(open.value); s.has(id) ? s.delete(id) : s.add(id); open.value = s }
/** For a membership: the organization's rank titles, offered as roles. */
const rankTitles = (r: Relation) => (r.kind === 'member' ? ((get(r.b)?.fields.ranks as { title: string }[] | undefined) ?? []).map(k => k.title).filter(Boolean) : [])
/** Roles offered while typing: the ranks, then the roles others have there, then the ones this kind usually has. */
function rolesFor(r: Relation): string[] {
  const all = state.db?.relations ?? []
  const there = all.filter(x => x.kind === r.kind && x.b === r.b && x.id !== r.id).map(x => x.role)
  const count = new Map<string, number>()
  for (const x of all) if (x.kind === r.kind && x.role) count.set(x.role, (count.get(x.role) ?? 0) + 1)
  const usual = [...count].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v]) => v)
  return [...new Set([...rankTitles(r), ...there, ...usual].filter((v): v is string => !!v?.trim()))]
}
const dates = (r: Relation) => (r.from || r.to ? `${r.from ? formatDate(r.from) : '?'} – ${r.to ? formatDate(r.to) : 'now'}` : '')

function setOption(r: Relation, v: string) {
  const [kind, side] = v.split(':') as [RelationKind, 'a' | 'b']
  const other = otherOf(r)
  r.kind = kind
  if (side === 'a') { r.a = props.entry.id; r.b = other } else { r.a = other; r.b = props.entry.id }
  relationChanged(r)
}
function setOther(r: Relation, id: string | null) {
  if (!id) { removeRelation(r.id); return }
  if (r.a === props.entry.id) r.b = id
  else r.a = id
  relationChanged(r)
}
function setField(r: Relation, key: 'role' | 'from' | 'to' | 'note', v: any) {
  if (v === undefined || v === '') delete r[key]
  else r[key] = v
  relationChanged(r)
}

// New relation: choose what it is, then whom.
const newKind = ref(OPTIONS[0].value)
/** The usual ones as buttons (a person: where they live, what they belong to, family); the rest in the list. */
const QUICK = ['lives-in:a', 'member:a', 'parent:b', 'parent:a', 'spouse:a', 'sibling:a', 'ally:a', 'rival:a', 'involved:a']
const quick = computed(() => QUICK.map(v => OPTIONS.find(o => o.value === v)).filter((o): o is typeof OPTIONS[number] => !!o).slice(0, 7))
const newOther = computed(() => OPTIONS.find(o => o.value === newKind.value)?.other)
function add(other: string) {
  const [kind, side] = newKind.value.split(':') as [RelationKind, 'a' | 'b']
  if (side === 'a') addRelation(props.entry.id, other, kind)
  else addRelation(other, props.entry.id, kind)
}
</script>

<template>
  <div class="rel-edit">
    <!-- adding first: what it is (the usual ones as buttons), then whom -->
    <div class="rel-add">
      <div class="seg wrap rel-quick">
        <button v-for="o in quick" :key="o.value" type="button" :class="{ on: newKind === o.value }" @click="newKind = o.value">{{ o.label }}</button>
        <Dropdown compact :value="quick.some(o => o.value === newKind) ? '' : newKind" title="Other kinds of relation" @change="newKind = ($event.target as HTMLSelectElement).value || newKind">
          <option value="">more…</option>
          <option v-for="o in OPTIONS.filter(o => !quick.includes(o))" :key="o.value" :value="o.value">{{ o.label }}</option>
        </Dropdown>
      </div>
      <EntryPicker add :exclude="[entry.id]" :types="newOther" :placeholder="`${OPTIONS.find(o => o.value === newKind)?.label ?? 'Add'}: type a name…`" @pick="add" />
    </div>
    <!-- Grouped like the page reads; each row is the other entry, its role and dates. ⋯ opens the kind and dates. -->
    <div v-if="rels.length" class="rel-rows">
      <section v-for="g in groups" :key="g.label" class="rel-group">
        <h4>{{ g.label }} <span class="muted">{{ g.list.length }}</span></h4>
        <div v-for="r in g.list" :key="r.id" class="rel-row" :class="{ open: open.has(r.id) }">
          <div class="rel-line">
            <EntryPicker class="rel-who" :model-value="otherOf(r)" :exclude="[entry.id]" @update:model-value="v => setOther(r, v)" />
            <SuggestInput class="rel-role" :value="r.role ?? ''" :options="rolesFor(r)" :placeholder="rankTitles(r).length ? 'rank' : 'role'" title="Role (optional)" @change="setField(r, 'role', ($event.target as HTMLInputElement).value.trim())" />
            <button type="button" class="rel-more" :class="{ dated: !!dates(r) }" :title="open.has(r.id) ? 'Hide details' : RELATION_KINDS[r.kind].dated ? 'Kind, and since when' : 'Kind'" @click="toggle(r.id)">{{ dates(r) || (RELATION_KINDS[r.kind].dated ? 'when?' : '⋯') }}</button>
            <button type="button" class="x" title="Remove this relation" @click="removeRelation(r.id)">×</button>
          </div>
          <div v-if="open.has(r.id)" class="rel-details">
            <label><span>Kind</span>
              <Dropdown :value="optionOf(r)" @change="setOption(r, ($event.target as HTMLSelectElement).value)">
                <option v-for="o in optionsFor(r)" :key="o.value" :value="o.value">{{ o.label }}</option>
              </Dropdown>
            </label>
            <template v-if="RELATION_KINDS[r.kind].dated">
              <label><span>From</span><DateInput :model-value="r.from" @update:model-value="v => setField(r, 'from', v)" /></label>
              <label><span>Until</span><DateInput :model-value="r.to" @update:model-value="v => setField(r, 'to', v)" /></label>
              <p class="muted small">Leave “from” empty if it was before records, “until” empty while it's still true.</p>
            </template>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
