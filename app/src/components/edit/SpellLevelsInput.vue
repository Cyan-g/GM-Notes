<script setup lang="ts">
// A feature's spells as a list by level (Fiend Spells: Lv 3 Burning Hands, Command…; Lv 5 Fireball…): one row per level
// with its spells and a picker to add more, and how the whole list is gained (always prepared, on the spell list, in
// the spellbook…) and cast set once. Each spell's own settings (swappable, a different way) stay in the fold below it.
import { computed, ref } from 'vue'
import type { TraitSpell } from '../../model/types'
import { HOW_SPECIES } from '../../species'
import { ABILITY_NAME } from '../../abilityBonus'
import EntryPicker from './EntryPicker.vue'
import EntryLink from '../EntryLink.vue'

const props = defineProps<{ traitLevel: number; levelWord: string }>()
const model = defineModel<TraitSpell[] | undefined>()
const spells = computed(() => model.value ?? [])
const levelOf = (x: TraitSpell) => Math.max(x.from ?? 1, props.traitLevel)
const rows = computed(() => {
  const by = new Map<number, { x: TraitSpell; i: number }[]>()
  spells.value.forEach((x, i) => by.set(levelOf(x), [...(by.get(levelOf(x)) ?? []), { x, i }]))
  return [...by.entries()].sort((a, b) => a[0] - b[0])
})
/** One value when every spell has it, else '' (mixed). */
const shared = <K extends 'how' | 'ability'>(k: K) => { const v = new Set(spells.value.map(x => x[k] ?? '')); return v.size === 1 ? [...v][0] : 'mixed' }
const save = (l: TraitSpell[]) => { model.value = l.length ? l : undefined }
/** A spell at a level: no level stored when it comes with the feature. */
const at = (x: TraitSpell, level: number): TraitSpell => { const n = { ...x }; if (level > props.traitLevel) n.from = level; else delete n.from; return n }
const setAll = (p: Partial<TraitSpell>) => save(spells.value.map(x => { const n = { ...x, ...p }; if (!n.ability) delete n.ability; return n }))
const moveRow = (from: number, to: number) => save(spells.value.map(x => (levelOf(x) === from ? at(x, Math.min(20, Math.max(1, to || 1))) : x)))
const removeAt = (i: number) => save(spells.value.filter((_, k) => k !== i))
const how = computed(() => (shared('how') === 'mixed' ? 'prepared' : (shared('how') as TraitSpell['how']) || 'prepared'))
function addAt(level: number, id: string) {
  const x: TraitSpell = { spell: id, how: how.value, ...(shared('ability') && shared('ability') !== 'mixed' ? { ability: shared('ability') as TraitSpell['ability'] } : {}) }
  save([...spells.value, at(x, level)])
}
const newLevel = ref<number | null>(null)
const nextLevel = computed(() => newLevel.value ?? Math.min(20, (rows.value.at(-1)?.[0] ?? props.traitLevel - 2) + 2))
const val = (ev: Event) => (ev.target as HTMLInputElement | HTMLSelectElement).value
</script>

<template>
  <div class="spell-levels">
    <div class="trait-row small">
      <span>Gained</span>
      <select :value="shared('how')" aria-label="How the spells are gained" @change="val($event) !== 'mixed' && setAll({ how: val($event) as TraitSpell['how'] })">
        <option v-if="shared('how') === 'mixed'" value="mixed">mixed (set per spell)</option>
        <option v-for="(label, id) in HOW_SPECIES" :key="id" :value="id">{{ label }}</option>
      </select>
      <select :value="shared('ability')" aria-label="Cast with" @change="val($event) !== 'mixed' && setAll({ ability: (val($event) || undefined) as TraitSpell['ability'] })">
        <option v-if="shared('ability') === 'mixed'" value="mixed">mixed abilities</option>
        <option value="">with the class's ability</option>
        <option v-for="(label, id) in ABILITY_NAME" :key="id" :value="id">with {{ label }}</option>
      </select>
    </div>
    <div v-for="[level, list] in rows" :key="level" class="spell-level-row">
      <label class="small">{{ levelWord }} <input type="number" min="1" max="20" class="steps-lv" :value="level" :aria-label="`Level of these spells`" @change="moveRow(level, Number(val($event)))" /></label>
      <span v-for="{ x, i } in list" :key="i" class="chip"><EntryLink :id="x.spell" /><span v-if="x.how !== how || x.swap" class="muted small"> ({{ HOW_SPECIES[x.how] }}{{ x.swap ? ', swappable' : '' }})</span>
        <button type="button" class="link-btn" title="Remove this spell" @click="removeAt(i)">×</button></span>
      <EntryPicker add :types="['spell']" :exclude="spells.map(x => x.spell)" placeholder="+ spell…" @pick="id => addAt(level, id)" />
    </div>
    <div class="spell-level-row new">
      <label class="small">New row at {{ levelWord.toLowerCase() }} <input type="number" min="1" max="20" class="steps-lv" :value="nextLevel" @change="newLevel = Number(val($event)) || null" /></label>
      <EntryPicker add :types="['spell']" :exclude="spells.map(x => x.spell)" placeholder="Add a spell…" @pick="id => { addAt(nextLevel, id); newLevel = null }" />
    </div>
  </div>
</template>
