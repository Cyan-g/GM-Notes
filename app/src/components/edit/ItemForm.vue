<script setup lang="ts">
// An item's Edit form, in sections: the basics, then the stats of its kind (Weapon, Armor, Ingredient, Crafting),
// then the optional features (Effects, Spells & charges). A feature shows when the item has it; the bar at the
// bottom adds one, and ✕ takes an empty one away again (or clears it, after asking).
import { computed, ref } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES, byKey, type FieldDef } from '../../model/schema'
import { changed } from '../../edit'
import FieldInput from './FieldInput.vue'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => byKey(props.entry.fields))
const shown = (d: FieldDef) => !d.when || d.when.is.includes(String(f.value[d.when.field] ?? ''))
const fields = computed(() => TYPES.item.fields.filter(d => shown(d) && d.key !== 'summary' && d.kind !== 'recipe'))

/** The optional features and the fields each holds. */
const FEATURES = [
  { id: 'requirements', label: 'Requirements', keys: ['requirements'], hint: 'Who can equip it, or attune to it if it needs attunement' },
  { id: 'effects', label: 'Effects', keys: ['effects'], hint: 'What it does to whoever wears, wields or attunes it' },
  { id: 'spells', label: 'Spells & charges', keys: ['charges', 'recharge', 'spells'], hint: 'Spells its user can cast, and its charges' },
  { id: 'features', label: 'Features', keys: ['speciesTraits'], hint: 'Its rules, each with its text, uses per rest, choices and spells; listed on the sheet while it is in use' },
]
const FEATURE_KEYS = FEATURES.flatMap(x => x.keys)
const featureFields = (id: string) => fields.value.filter(d => FEATURES.find(x => x.id === id)!.keys.includes(d.key))
const has = (id: string) => featureFields(id).some(d => { const v = f.value[d.key]; return v != null && v !== '' && !(Array.isArray(v) && !v.length) })
/** Features opened here but still empty. */
const opened = ref(new Set<string>())
const features = computed(() => FEATURES.filter(x => featureFields(x.id).length))
const visible = computed(() => features.value.filter(x => has(x.id) || opened.value.has(x.id)))
const addable = computed(() => features.value.filter(x => !visible.value.includes(x)))
function open(id: string) { opened.value = new Set([...opened.value, id]) }
function close(id: string) {
  if (has(id)) {
    if (!confirm(`Remove this item's ${FEATURES.find(x => x.id === id)!.label.toLowerCase()}?`)) return
    for (const d of featureFields(id)) delete f.value[d.key]
    changed(props.entry)
  }
  const s = new Set(opened.value); s.delete(id); opened.value = s
}

// The basics: everything without a group (yes/no fields as one row of toggles); then one section per group.
const basics = computed(() => fields.value.filter(d => !d.group && !FEATURE_KEYS.includes(d.key)))
const groups = computed(() => {
  const out = new Map<string, FieldDef[]>()
  for (const d of fields.value) if (d.group && !FEATURE_KEYS.includes(d.key)) out.set(d.group, [...(out.get(d.group) ?? []), d])
  return [...out]
})
const WIDE = ['list', 'longtext', 'effects', 'itemSpells', 'requires', 'speciesTraits']
const short = (l: FieldDef[]) => l.filter(d => !WIDE.includes(d.kind) && d.kind !== 'bool')
const wide = (l: FieldDef[]) => l.filter(d => WIDE.includes(d.kind))
const bools = computed(() => basics.value.filter(d => d.kind === 'bool'))
function toggleBool(key: string) {
  if (f.value[key]) delete f.value[key]; else f.value[key] = true
  changed(props.entry)
}
</script>

<template>
  <div class="item-form">
    <section class="if-section">
      <h4>Basics</h4>
      <div class="if-grid">
        <label v-for="d in short(basics)" :key="d.key" class="sheet-field" :class="'k-' + d.kind"><span>{{ d.label }}</span><FieldInput :def="d" :entry="entry" /></label>
      </div>
      <div v-if="bools.length" class="seg wrap if-bools">
        <button v-for="d in bools" :key="d.key" type="button" :class="{ on: !!f[d.key] }" @click="toggleBool(d.key)">{{ d.label }}</button>
      </div>
    </section>

    <section v-for="[g, ds] in groups" :key="g" class="if-section">
      <h4>{{ g }}</h4>
      <div v-if="short(ds).length" class="if-grid">
        <label v-for="d in short(ds)" :key="d.key" class="sheet-field" :class="'k-' + d.kind"><span>{{ d.label }}</span><FieldInput :def="d" :entry="entry" /></label>
      </div>
      <label v-for="d in wide(ds)" :key="d.key" class="sheet-field if-wide" :class="'k-' + d.kind"><span>{{ d.label }}</span><FieldInput :def="d" :entry="entry" /></label>
    </section>

    <section v-for="x in visible" :key="x.id" class="if-section">
      <h4>{{ x.label }} <button type="button" class="link-btn if-close" :title="has(x.id) ? `Remove the ${x.label.toLowerCase()}` : 'Hide this section'" @click="close(x.id)">✕</button></h4>
      <div v-if="short(featureFields(x.id)).length" class="if-grid">
        <label v-for="d in short(featureFields(x.id))" :key="d.key" class="sheet-field" :class="'k-' + d.kind"><span>{{ d.label }}</span><FieldInput :def="d" :entry="entry" /></label>
      </div>
      <div v-for="d in wide(featureFields(x.id))" :key="d.key" class="if-wide"><FieldInput :def="d" :entry="entry" /></div>
    </section>

    <div v-if="addable.length" class="if-add">
      <button v-for="x in addable" :key="x.id" type="button" class="chip-btn" :title="x.hint" @click="open(x.id)">＋ {{ x.label }}</button>
    </div>
  </div>
</template>
