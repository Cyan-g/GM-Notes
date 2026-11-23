<script setup lang="ts">
// The settings of a trait's choice (other than its kind and its options): how many, by level, a feat's kind, which
// spells for a spell choice and how they're cast, and the candidates it's limited to. In the trait editor, for a
// trait's own choice and for the choices an option brings.
import Dropdown from '../Dropdown.vue'
import { computed } from 'vue'
import type { TraitChoice, TraitSpell } from '../../model/types'
import { choiceCandidates, HOW_SPECIES } from '../../species'
import { listOptions } from '../../store'
import { ABILITY_NAME } from '../../model/dnd'
import StepsInput from './StepsInput.vue'
import { inputValue as val } from '../../dom'

const model = defineModel<TraitChoice>({ required: true })
const props = defineProps<{ withLabel?: boolean }>()
const put = (p: Partial<TraitChoice>) => {
  const c: TraitChoice = { ...model.value, ...p }
  for (const k of ['label', 'steps', 'among', 'category'] as const) if (c[k] == null || (Array.isArray(c[k]) && !(c[k] as unknown[]).length)) delete c[k]
  model.value = c
}
type SpellFilter = NonNullable<TraitChoice['spell']>
const spell = computed<SpellFilter>(() => model.value.spell ?? { how: 'atWill' })
const putSpell = (p: Partial<SpellFilter>) => {
  const f: SpellFilter = { ...spell.value, ...p }
  if (!f.classes?.length) delete f.classes
  if (!f.level) delete f.level
  if (!f.ritual) delete f.ritual
  if (!f.ability) delete f.ability
  put({ spell: f })
}
function toggleClass(id: string) {
  const s = new Set(spell.value.classes ?? [])
  if (s.has(id)) s.delete(id); else s.add(id)
  putSpell({ classes: [...s] })
}
function toggleAmong(id: string) {
  const among = new Set(model.value.among ?? [])
  if (among.has(id)) among.delete(id); else among.add(id)
  put({ among: [...among] })
}
const LEVELS = ['Cantrip', '1', '2', '3', '4', '5', '6', '7', '8', '9']
</script>

<template>
  <label v-if="props.withLabel" class="small">called <input class="steps-label" :value="model.label ?? ''" placeholder="e.g. Cantrips" @change="put({ label: val($event).trim() || undefined })" /></label>
  <label class="small">how many <input type="number" min="1" max="30" class="effect-value" :value="model.count ?? 1" @change="put({ count: Number(val($event)) || 1 })" /></label>
  <details class="steps-fold" :open="!!model.steps?.length">
    <summary class="small">{{ model.steps?.length ? 'changes by level' : 'same at every level (change by level…)' }}</summary>
    <StepsInput numeric label="How many" :model-value="model.steps" @update:model-value="v => put({ steps: v as [number, number][] | undefined })" />
  </details>
  <label v-if="model.kind === 'skill'" class="small" title="A picked skill the character is already proficient in becomes Expertise (Keen Mind, Observant)"><input type="checkbox" :checked="!!model.orExpertise" @change="put({ orExpertise: ($event.target as HTMLInputElement).checked || undefined })" /> or Expertise if proficient</label>
  <label v-if="model.kind === 'feat'" class="small">kind <input class="steps-label" :value="model.category ?? ''" placeholder="e.g. Fighting Style" @change="put({ category: val($event).trim() || undefined })" /></label>
  <template v-if="model.kind === 'spell'">
    <Dropdown :value="spell.level ?? ''" aria-label="Spell level" @change="putSpell({ level: val($event) || undefined })">
      <option value="">any level</option>
      <option v-for="l in LEVELS" :key="l" :value="l">{{ l === 'Cantrip' ? 'cantrips' : `level ${l}` }}</option>
    </Dropdown>
    <label class="small"><input type="checkbox" :checked="!!spell.ritual" @change="putSpell({ ritual: ($event.target as HTMLInputElement).checked })" /> rituals only</label>
    <Dropdown :value="spell.how" aria-label="How the picked spells are cast" @change="putSpell({ how: val($event) as TraitSpell['how'] })">
      <option v-for="(label, id) in HOW_SPECIES" :key="id" :value="id">{{ label }}</option>
    </Dropdown>
    <label v-if="spell.how === 'long' || spell.how === 'short'" class="small" title="Also always prepared, and cast with spell slots too (Magic Initiate's level 1 spell)"><input type="checkbox" :checked="!!spell.prepared" @change="putSpell({ prepared: ($event.target as HTMLInputElement).checked || undefined })" /> also always prepared</label>
    <Dropdown :value="spell.ability ?? ''" aria-label="Cast with" title="The ability they're cast with (their attack and save DC are shown with them)" @change="putSpell({ ability: (val($event) || undefined) as SpellFilter['ability'] })">
      <option value="">no ability</option>
      <option v-for="(label, id) in ABILITY_NAME" :key="id" :value="id">with {{ label }}</option>
    </Dropdown>
    <details class="trait-among">
      <summary class="small">{{ spell.classes?.length ? `${spell.classes.join(', ')} list${spell.classes.length > 1 ? 's' : ''}` : "any class's list" }}</summary>
      <div class="seg wrap">
        <button v-for="o in listOptions('class')" :key="o.id" type="button" :class="{ on: spell.classes?.includes(o.id) }" @click="toggleClass(o.id)">{{ o.label }}</button>
      </div>
    </details>
  </template>
  <details v-else-if="model.kind !== 'option'" class="trait-among">
    <summary class="small">{{ model.among?.length ? `only from ${model.among.length}` : 'from any' }}</summary>
    <div class="seg wrap">
      <button v-for="o in choiceCandidates({ ...model, among: undefined })" :key="o.id" type="button" :class="{ on: model.among?.includes(o.id) }" @click="toggleAmong(o.id)">{{ o.label }}</button>
    </div>
  </details>
</template>
