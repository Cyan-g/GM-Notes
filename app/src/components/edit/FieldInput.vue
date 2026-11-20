<script setup lang="ts">
import TraitsInput from './TraitsInput.vue'
import AbilityBonusInput from './AbilityBonusInput.vue'
// Edits one schema field of an entry in place.
import ChoiceListInput from './ChoiceListInput.vue'
import { computed } from 'vue'
import { byKey, type FieldDef } from '../../model/schema'
import { listKeyOf } from '../../model/lists'
import { byType, fieldOptions } from '../../store'
import ProfChips from '../ProfChips.vue'
import type { Entry } from '../../model/types'
import { changed } from '../../edit'
import EntryPicker from './EntryPicker.vue'
import DateInput from './DateInput.vue'
import ListInput from './ListInput.vue'
import MoneyInput from './MoneyInput.vue'
import RecipeInput from './RecipeInput.vue'
import StockInput from './StockInput.vue'
import StatblockInput from './StatblockInput.vue'
import EncounterInput from './EncounterInput.vue'
import RanksInput from './RanksInput.vue'
import EffectsInput from './EffectsInput.vue'
import ItemSpellsInput from './ItemSpellsInput.vue'
import RequirementsInput from './RequirementsInput.vue'

const props = defineProps<{ def: FieldDef; entry: Entry }>()

const value = computed({
  get: () => byKey(props.entry.fields)[props.def.key] as any,
  set: (v: unknown) => {
    const f = byKey(props.entry.fields)
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) delete f[props.def.key]
    else f[props.def.key] = v
    changed(props.entry)
  },
})
/** The field's list (Archive → Lists): ids stored, labels shown. A value no longer in the list stays pickable. */
const options = computed(() => fieldOptions(props.def))
const selectOptions = computed(() => {
  const o = options.value
  const v = value.value
  return v && !o.some(x => x.id === v) ? [{ id: String(v), label: String(v) }, ...o] : o
})
const hasList = computed(() => !!listKeyOf(props.def))
/** For a ref with `pick`: only the entries that fit (e.g. Tool items for "Crafted with"). */
const only = computed(() => {
  const p = props.def.pick
  if (!p) return undefined
  return (props.def.to ?? []).flatMap(t => byType.value.get(t) ?? []).filter(e => p.is.includes(String(byKey(e.fields)[p.field] ?? ''))).map(e => e.id)
})
const refs = computed(() => (value.value as string[] | undefined) ?? [])
function addRef(id: string) { if (!refs.value.includes(id)) value.value = [...refs.value, id] }
/** Lists picked from with a dropdown (long lists with descriptions) instead of toggle buttons. */
const DROPDOWN_LISTS = ['weaponProperty', 'ingredientProperty']
</script>

<template>
  <input v-if="def.kind === 'text'" :value="value ?? ''" @input="value = ($event.target as HTMLInputElement).value" />
  <textarea v-else-if="def.kind === 'longtext'" rows="3" :value="value ?? ''" @input="value = ($event.target as HTMLTextAreaElement).value" />
  <input v-else-if="def.kind === 'number'" type="number" :value="value ?? ''" @change="value = ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value)" />
  <input v-else-if="def.kind === 'weight'" type="number" step="0.1" min="0" :value="value ?? ''" placeholder="lb" @change="value = ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value)" />
  <label v-else-if="def.kind === 'bool'" class="toggle"><input type="checkbox" :checked="!!value" @change="value = ($event.target as HTMLInputElement).checked || undefined" /><span>{{ value ? 'Yes' : 'No' }}</span></label>
  <select v-else-if="def.kind === 'select'" :value="value ?? ''" @change="value = ($event.target as HTMLSelectElement).value">
    <option value="">—</option>
    <option v-for="o in selectOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
  </select>
  <ChoiceListInput v-else-if="def.kind === 'list' && hasList && DROPDOWN_LISTS.includes(listKeyOf(def) ?? '')" :values="value ?? []" :options="options" :placeholder="`Add a ${def.label.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '')}…`" @change="value = $event" />
  <ProfChips v-else-if="def.kind === 'list' && hasList" :values="value ?? []" :toggles="options" @change="value = $event" />
  <ListInput v-else-if="def.kind === 'list'" v-model="value" />
  <MoneyInput v-else-if="def.kind === 'money'" v-model="value" />
  <DateInput v-else-if="def.kind === 'date'" v-model="value" />
  <EntryPicker v-else-if="def.kind === 'ref'" v-model="value" :types="def.to" :exclude="[entry.id]" :only="only" />
  <div v-else-if="def.kind === 'refs'" class="refs-input">
    <span v-for="(id, i) in refs" :key="id" class="chip"><EntryPicker :model-value="id" :types="def.to" @update:model-value="v => { const l = [...refs]; if (v) l[i] = v; else l.splice(i, 1); value = l }" /></span>
    <EntryPicker add :types="def.to" :exclude="[entry.id, ...refs]" placeholder="Add…" @pick="addRef" />
  </div>
  <RanksInput v-else-if="def.kind === 'ranks'" v-model="value" />
  <EffectsInput v-else-if="def.kind === 'effects'" v-model="value" />
  <ItemSpellsInput v-else-if="def.kind === 'itemSpells'" v-model="value" />
  <TraitsInput v-else-if="def.kind === 'speciesTraits'" v-model="value" />
  <AbilityBonusInput v-else-if="def.kind === 'abilityBonus'" v-model="value" />
  <RequirementsInput v-else-if="def.kind === 'requires'" v-model="value" />
  <RecipeInput v-else-if="def.kind === 'recipe'" v-model="value" :item-value="entry.fields.value" />
  <StockInput v-else-if="def.kind === 'stock'" v-model="value" :markup="(entry.fields.markup) ?? 1" />
  <EncounterInput v-else-if="def.kind === 'combatants'" v-model="value" />
  <StatblockInput v-else-if="def.kind === 'statblock'" v-model="value" />
  <input v-else :value="value ?? ''" @input="value = ($event.target as HTMLInputElement).value" />
</template>
