<script setup lang="ts">
// The parts a species trait and each option of its choice share: name, text, effects (as on gear), the proficiencies
// and languages it grants, and the spells it gives. Only the parts in use show, each as a TraitSection; the others are
// chips in the Add row at the bottom, which the feature's own parts (TraitsInput: choice, uses…) join through slots.
import TextWithTables from './TextWithTables.vue'
import Dropdown from '../Dropdown.vue'
import { computed, ref } from 'vue'
import type { TraitGrant, TraitOption, TraitSpell } from '../../model/types'
import { GRANT_KINDS, HOW_SPECIES, grantLabel, grantOptions } from '../../species'
import { ABILITY_NAME } from '../../model/dnd'
import { listOptions } from '../../store'
import EffectsInput from './EffectsInput.vue'
import TraitSection from './TraitSection.vue'
import { describeEffects } from '../../effects'
import { get } from '../../store'
import EntryPicker from './EntryPicker.vue'
import SpellLevelsInput from './SpellLevelsInput.vue'
import { inputValue as val } from '../../dom'

const model = defineModel<TraitOption>({ required: true })
const props = defineProps<{
  /** The level of the feature these fields belong to: its spells come with it unless one says a later level. */
  traitLevel?: number
  /** For an option of a choice: the other options, one of which it may need picked first. */
  siblings?: { id: string; name: string }[]
  /** Label of the level ("Warlock level") for an option's prerequisite. */
  levelWord?: string
  /** A class's or subclass's feature: its spells are edited as a list by level ("Warlock level"). */
  byLevel?: string
  /** The name is edited elsewhere (a feature card's header). */
  noName?: boolean
}>()
/** The text box grows with its text: two lines when empty, up to sixteen. */
const rows = (t?: string) => Math.min(16, Math.max(2, (t ?? '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 105)), 0)))
function setNeeds(p: Partial<NonNullable<TraitOption['needs']>>) {
  const n = { ...(model.value.needs ?? {}), ...p }
  if (!n.level) delete n.level
  if (!n.option) delete n.option
  put({ needs: Object.keys(n).length ? n : undefined })
}
const put = (patch: Partial<TraitOption>) => {
  const next: TraitOption = { ...model.value, ...patch }
  for (const k of ['text', 'effects', 'grants', 'spells', 'needs', 'repeatable'] as const) {
    const v = next[k]
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete next[k]
  }
  model.value = next
}
const grants = computed(() => model.value.grants ?? [])
const spells = computed(() => model.value.spells ?? [])
function setGrant(i: number, patch: Partial<TraitGrant>) {
  const l = grants.value.map(g => ({ ...g }))
  l[i] = { ...l[i], ...patch }
  if (patch.kind) l[i].id = grantOptions(patch.kind)[0]?.id ?? ''
  put({ grants: l })
}
const addGrant = () => put({ grants: [...grants.value, { kind: 'skill', id: grantOptions('skill')[0].id }] })
const removeGrant = (i: number) => put({ grants: grants.value.filter((_, k) => k !== i) })
function setSpell(i: number, patch: Partial<TraitSpell>) {
  const l = spells.value.map(x => ({ ...x }))
  l[i] = { ...l[i], ...patch }
  // a spell comes with its feature: only a later level is kept
  if (!l[i].from || l[i].from! <= Math.max(1, props.traitLevel ?? 1)) delete l[i].from
  if (!l[i].ability) delete l[i].ability
  if (!l[i].swap) delete l[i].swap
  put({ spells: l })
}
const addSpell = (spell: string) => put({ spells: [...spells.value, { spell, how: 'long' }] })
const removeSpell = (i: number) => put({ spells: spells.value.filter((_, k) => k !== i) })

// ---- the parts in use, and the Add row ----
/** Spells opened from the Add row before any is picked. */
const spellsOpen = ref(false)
const textBox = ref<InstanceType<typeof TextWithTables>>()
const showSpells = computed(() => spells.value.length > 0 || spellsOpen.value)
const effectsSummary = computed(() => describeEffects(model.value.effects ?? []).join(', '))
const grantsSummary = computed(() => grants.value.map(grantLabel).join(', '))
const spellsSummary = computed(() => spells.value.map(x => get(x.spell)?.name ?? '?').join(', '))
function drop(part: 'effects' | 'grants' | 'spells', label: string) {
  if ((model.value[part]?.length ?? 0) && !confirm(`Take the ${label} off “${model.value.name || 'this'}”?`)) return
  if (part === 'spells') spellsOpen.value = false
  put({ [part]: undefined })
}
</script>

<template>
  <div class="trait-fields">
    <label v-if="!noName" class="trait-name"><span>Name</span><input :value="model.name" placeholder="e.g. Dwarven Resilience" @input="put({ name: val($event) })" /></label>
    <div v-if="siblings" class="trait-needs small">
      <label class="check-chip" title="It can be picked more than once (Agonizing Blast: a different cantrip each time)"><input type="checkbox" :checked="!!model.repeatable" @change="put({ repeatable: ($event.target as HTMLInputElement).checked || undefined })" /> can be taken again</label>
      <span class="trait-label">Needs</span>
      <label>{{ levelWord ?? 'level' }} <input type="number" min="1" max="20" class="effect-value" :value="model.needs?.level ?? ''" placeholder="—" @change="setNeeds({ level: Number(val($event)) || undefined })" /></label>
      <label>and <Dropdown :value="model.needs?.option ?? ''" @change="setNeeds({ option: val($event) || undefined })">
        <option value="">no other option</option>
        <option v-for="o in siblings.filter(x => x.id !== model.id)" :key="o.id" :value="o.id">{{ o.name }}</option>
      </Dropdown></label>
    </div>
    <TextWithTables ref="textBox" :rows="rows(model.text)" :value="model.text ?? ''" aria-label="Text" placeholder="What it says (shown on the sheet)" @update="v => put({ text: v })" />

    <TraitSection v-if="model.effects?.length" title="Effects" :summary="effectsSummary" @remove="drop('effects', 'effects')">
      <EffectsInput traits :model-value="model.effects" @update:model-value="v => put({ effects: v })" />
    </TraitSection>
    <TraitSection v-if="grants.length" title="Proficiencies and languages" :summary="grantsSummary" @remove="drop('grants', 'proficiencies and languages')">
      <div class="effects-input">
        <div v-for="(g, i) in grants" :key="i" class="effect-row">
          <Dropdown :value="g.kind" aria-label="What kind" @change="setGrant(i, { kind: val($event) as TraitGrant['kind'] })">
            <option v-for="k in GRANT_KINDS" :key="k.id" :value="k.id">{{ k.label }}</option>
          </Dropdown>
          <Dropdown :value="g.id" aria-label="Which" @change="setGrant(i, { id: val($event) })">
            <option v-if="!grantOptions(g.kind).some(o => o.id === g.id)" :value="g.id">{{ g.id }}</option>
            <option v-for="o in grantOptions(g.kind)" :key="o.id" :value="o.id">{{ o.label }}</option>
          </Dropdown>
          <button type="button" class="link-btn" title="Remove" @click="removeGrant(i)">×</button>
        </div>
        <button type="button" class="chip-btn" @click="addGrant">+ Another</button>
      </div>
    </TraitSection>
    <TraitSection v-if="showSpells" title="Spells" :summary="spellsSummary" @remove="drop('spells', 'spells')">
      <div class="trait-spells-edit">
      <!-- a class's or subclass's feature: the spells by level, set once for the list; each spell's settings fold below -->
      <SpellLevelsInput v-if="byLevel" :model-value="model.spells" :trait-level="traitLevel ?? 1" :level-word="byLevel" @update:model-value="v => put({ spells: v })" />
      <component :is="byLevel ? 'details' : 'div'" v-if="!byLevel || spells.length" class="effects-input" :class="{ 'steps-fold': byLevel }">
        <summary v-if="byLevel" class="small">Each spell's settings</summary>
        <div v-for="(x, i) in spells" :key="i" class="effect-row">
          <EntryPicker :model-value="x.spell" :types="['spell']" @update:model-value="v => v ? setSpell(i, { spell: v }) : removeSpell(i)" />
          <Dropdown :value="x.how" aria-label="How it's cast" @change="setSpell(i, { how: val($event) as TraitSpell['how'] })">
            <option v-for="(label, id) in HOW_SPECIES" :key="id" :value="id">{{ label }}</option>
          </Dropdown>
          <label class="small ab-with" title="The ability it's cast with (its attack and save DC are shown with it)">cast with <Dropdown :value="x.ability ?? ''" aria-label="Cast with" @change="setSpell(i, { ability: (val($event) || undefined) as TraitSpell['ability'] })">
            <option value="">—</option>
            <option v-for="(label, id) in ABILITY_NAME" :key="id" :value="id">{{ label }}</option>
          </Dropdown></label>
          <label class="small" title="Only from a later level than the feature's own; empty: with the feature">from level <input type="number" min="1" max="20" class="effect-value" :value="x.from ?? ''" :placeholder="`${traitLevel ?? 1}`" @change="setSpell(i, { from: Number(val($event)) || undefined })" /></label>
          <label class="check-chip small" title="The player may swap it for another spell of its level from a class's list (High Elf: a Wizard cantrip)"><input type="checkbox" :checked="!!x.swap" @change="setSpell(i, { swap: ($event.target as HTMLInputElement).checked ? {} : undefined })" /> swappable</label>
          <Dropdown v-if="x.swap" :value="x.swap.classes?.[0] ?? ''" aria-label="For a spell of which list" @change="setSpell(i, { swap: val($event) ? { classes: [val($event)] } : {} })">
            <option value="">any list</option>
            <option v-for="o in listOptions('class')" :key="o.id" :value="o.id">{{ o.label }} list</option>
          </Dropdown>
        </div>
        <EntryPicker v-if="!byLevel" add :types="['spell']" :exclude="spells.map(x => x.spell)" placeholder="Add a spell…" @pick="addSpell" />
      </component>
      </div>
    </TraitSection>

    <!-- the feature's own parts (TraitsInput): the player's choice, uses, a scaling value… -->
    <slot name="sections" />

    <div class="fadd">
      <span class="fadd-label">Add</span>
      <button v-if="!model.effects?.length" type="button" class="chip-btn" title="Changes a number or gives a sense, resistance, advantage… (as gear does)" @click="put({ effects: [{ on: 'ac', value: 1 }] })">+ Effect</button>
      <button v-if="!grants.length" type="button" class="chip-btn" title="A skill, tool, weapon, armor or language it gives" @click="addGrant">+ Proficiency or language</button>
      <button v-if="!showSpells" type="button" class="chip-btn" title="Spells it gives: at will, once per rest, always prepared…" @click="spellsOpen = true">+ Spells</button>
      <slot name="add" />
      <button type="button" class="chip-btn" title="A table in the text, edited as a grid (a d6 table, levels and values)" @click="textBox?.addTable()">+ Table</button>
    </div>
  </div>
</template>
