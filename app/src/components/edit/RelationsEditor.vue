<script setup lang="ts">
// Edit every relation of one entry. A change shows up on the other entry's page too.
import { computed, ref } from 'vue'
import type { Entry, EntryType, Relation, RelationKind } from '../../model/types'
import { RELATION_KINDS } from '../../model/schema'
import { relationsOf } from '../../store'
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
const newOther = computed(() => OPTIONS.find(o => o.value === newKind.value)?.other)
function add(other: string) {
  const [kind, side] = newKind.value.split(':') as [RelationKind, 'a' | 'b']
  if (side === 'a') addRelation(props.entry.id, other, kind)
  else addRelation(other, props.entry.id, kind)
}
</script>

<template>
  <div class="rel-edit">
    <div v-for="r in rels" :key="r.id" class="rel-row">
      <select :value="optionOf(r)" @change="setOption(r, ($event.target as HTMLSelectElement).value)">
        <option v-for="o in optionsFor(r)" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <EntryPicker :model-value="otherOf(r)" :exclude="[entry.id]" @update:model-value="v => setOther(r, v)" />
      <button type="button" class="x" title="Remove this relation" @click="removeRelation(r.id)">×</button>
      <input class="role" :value="r.role ?? ''" placeholder="Role (optional)" @change="setField(r, 'role', ($event.target as HTMLInputElement).value.trim())" />
      <div v-if="RELATION_KINDS[r.kind].dated" class="rel-dates">
        <span class="muted small">from</span><DateInput :model-value="r.from" @update:model-value="v => setField(r, 'from', v)" />
        <span class="muted small">until</span><DateInput :model-value="r.to" @update:model-value="v => setField(r, 'to', v)" />
      </div>
    </div>
    <div class="rel-add">
      <select v-model="newKind">
        <option v-for="o in OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <EntryPicker add :exclude="[entry.id]" :types="newOther" placeholder="Add: type a name…" @pick="add" />
    </div>
    <p class="muted small">Leave “from” empty if it was before records; leave “until” empty while it's still true.</p>
  </div>
</template>
