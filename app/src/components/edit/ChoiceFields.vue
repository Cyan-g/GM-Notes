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
import ProfChips from '../ProfChips.vue'
import { inputValue as val } from '../../dom'

const model = defineModel<TraitChoice>({ required: true })
const props = defineProps<{ withLabel?: boolean }>()
const put = (p: Partial<TraitChoice>) => {
  const c: TraitChoice = { ...model.value, ...p }
  for (const k of ['label', 'steps', 'among', 'category'] as const) if (c[k] == null || (Array.isArray(c[k]) && !(c[k] as unknown[]).length)) delete c[k]
  model.value = c
}
type SpellFilter = NonNullable<TraitChoice['spell']>
/** The world's feat kinds (Origin Feat, Fighting Style…), for a feat choice. */
const featKinds = computed(() => listOptions('feat.category'))
const spell = computed<SpellFilter>(() => model.value.spell ?? { how: 'atWill' })
const putSpell = (p: Partial<SpellFilter>) => {
  const f: SpellFilter = { ...spell.value, ...p }
  if (!f.classes?.length) delete f.classes
  if (!f.level) delete f.level
  if (!f.ritual) delete f.ritual
  if (!f.ability) delete f.ability
  put({ spell: f })
}
/** What the choice could take, for narrowing it to some of them. */
const candidates = computed(() => choiceCandidates({ ...model.value, among: undefined }))
const LEVELS = ['Cantrip', '1', '2', '3', '4', '5', '6', '7', '8', '9']
</script>

<template>
  <label v-if="props.withLabel" class="small">called <input class="steps-label" :value="model.label ?? ''" placeholder="e.g. Cantrips" @change="put({ label: val($event).trim() || undefined })" /></label>
  <label class="small">how many <input type="number" min="1" max="30" class="effect-value" :value="model.count ?? 1" @change="put({ count: Number(val($event)) || 1 })" /></label>
  <details class="steps-fold" :open="!!model.steps?.length">
    <summary class="small">{{ model.steps?.length ? 'changes by level' : 'same at every level (change by level…)' }}</summary>
    <StepsInput numeric label="How many" :model-value="model.steps" @update:model-value="v => put({ steps: v as [number, number][] | undefined })" />
  </details>
  <label v-if="model.kind === 'skill'" class="check-chip small" title="A picked skill the character is already proficient in becomes Expertise (Keen Mind, Observant)"><input type="checkbox" :checked="!!model.orExpertise" @change="put({ orExpertise: ($event.target as HTMLInputElement).checked || undefined })" /> or Expertise if proficient</label>
  <!-- which feats it offers: one kind of the world's feat kinds (the Lists page), or any -->
  <label v-if="model.kind === 'feat'" class="small">kind <Dropdown compact :value="model.category ?? ''" aria-label="Which kind of feat" @change="put({ category: val($event) || undefined })">
    <option value="">any feat</option>
    <option v-for="o in featKinds" :key="o.id" :value="o.id">{{ o.label }}</option>
    <option v-if="model.category && !featKinds.some(o => o.id === model.category)" :value="model.category">{{ model.category }}</option>
  </Dropdown></label>
  <template v-if="model.kind === 'spell'">
    <Dropdown :value="spell.level ?? ''" aria-label="Spell level" @change="putSpell({ level: val($event) || undefined })">
      <option value="">any level</option>
      <option v-for="l in LEVELS" :key="l" :value="l">{{ l === 'Cantrip' ? 'cantrips' : `level ${l}` }}</option>
    </Dropdown>
    <label class="check-chip small"><input type="checkbox" :checked="!!spell.ritual" @change="putSpell({ ritual: ($event.target as HTMLInputElement).checked })" /> rituals only</label>
    <label class="check-chip small" title="Only spells with a damage roll (a Warlock cantrip that deals damage)"><input type="checkbox" :checked="!!spell.damaging" @change="putSpell({ damaging: ($event.target as HTMLInputElement).checked || undefined })" /> that deal damage</label>
    <Dropdown :value="spell.how" aria-label="How the picked spells are cast" @change="putSpell({ how: val($event) as TraitSpell['how'] })">
      <option v-for="(label, id) in HOW_SPECIES" :key="id" :value="id">{{ label }}</option>
    </Dropdown>
    <label v-if="spell.how === 'long' || spell.how === 'short'" class="check-chip small" title="Also always prepared, and cast with spell slots too (Magic Initiate's level 1 spell)"><input type="checkbox" :checked="!!spell.prepared" @change="putSpell({ prepared: ($event.target as HTMLInputElement).checked || undefined })" /> also always prepared</label>
    <label v-if="spell.how !== 'known'" class="small ab-with" title="The ability they're cast with (their attack and save DC are shown with them)">cast with <Dropdown :value="spell.ability ?? ''" aria-label="Cast with" @change="putSpell({ ability: (val($event) || undefined) as SpellFilter['ability'] })">
      <option value="">—</option>
      <option v-for="(label, id) in ABILITY_NAME" :key="id" :value="id">{{ label }}</option>
    </Dropdown></label>
    <details class="trait-among">
      <summary class="small">{{ spell.classes?.length ? `${spell.classes.join(', ')} list${spell.classes.length > 1 ? 's' : ''}` : "any class's list" }}</summary>
      <ProfChips :values="spell.classes ?? []" :suggest="listOptions('class')" placeholder="Add a class's list…" @change="v => putSpell({ classes: v })" />
    </details>
  </template>
  <details v-else-if="model.kind !== 'option'" class="trait-among">
    <summary class="small">{{ model.among?.length ? `only from ${model.among.length}` : 'from any' }}</summary>
    <!-- several picks: up to 6 candidates as toggle chips, more as chips plus a box -->
    <ProfChips v-if="candidates.length <= 6" :values="model.among ?? []" :toggles="candidates" @change="v => put({ among: v })" />
    <ProfChips v-else :values="model.among ?? []" :suggest="candidates" placeholder="Add one…" @change="v => put({ among: v })" />
  </details>
</template>
