<script setup lang="ts">
// The parts a species trait and each option of its choice share: name, text, effects (as on gear), the proficiencies
// and languages it grants, and the spells it gives.
import { computed } from 'vue'
import type { TraitGrant, TraitOption, TraitSpell } from '../../model/types'
import { GRANT_KINDS, HOW_SPECIES, grantOptions } from '../../species'
import { ABILITY_NAME } from '../../abilityBonus'
import { listOptions } from '../../store'
import EffectsInput from './EffectsInput.vue'
import EntryPicker from './EntryPicker.vue'

const model = defineModel<TraitOption>({ required: true })
const put = (patch: Partial<TraitOption>) => {
  const next: TraitOption = { ...model.value, ...patch }
  for (const k of ['text', 'effects', 'grants', 'spells'] as const) {
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
  if (!l[i].from || l[i].from! <= 1) delete l[i].from
  if (!l[i].ability) delete l[i].ability
  if (!l[i].swap) delete l[i].swap
  put({ spells: l })
}
const addSpell = (spell: string) => put({ spells: [...spells.value, { spell, how: 'long' }] })
const removeSpell = (i: number) => put({ spells: spells.value.filter((_, k) => k !== i) })
const val = (ev: Event) => (ev.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
</script>

<template>
  <div class="trait-fields">
    <label class="trait-name"><span>Name</span><input :value="model.name" placeholder="e.g. Dwarven Resilience" @input="put({ name: val($event) })" /></label>
    <label class="trait-text"><span>Text</span><textarea rows="2" :value="model.text ?? ''" placeholder="What it says (shown on the sheet)" @input="put({ text: val($event) })" /></label>
    <div class="trait-part"><span class="trait-label">Effects</span><EffectsInput :model-value="model.effects" @update:model-value="v => put({ effects: v })" /></div>
    <div class="trait-part">
      <span class="trait-label">Grants</span>
      <div class="effects-input">
        <div v-for="(g, i) in grants" :key="i" class="effect-row">
          <select :value="g.kind" aria-label="What kind" @change="setGrant(i, { kind: val($event) as TraitGrant['kind'] })">
            <option v-for="k in GRANT_KINDS" :key="k.id" :value="k.id">{{ k.label }}</option>
          </select>
          <select :value="g.id" aria-label="Which" @change="setGrant(i, { id: val($event) })">
            <option v-if="!grantOptions(g.kind).some(o => o.id === g.id)" :value="g.id">{{ g.id }}</option>
            <option v-for="o in grantOptions(g.kind)" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
          <button type="button" class="link-btn" title="Remove" @click="removeGrant(i)">×</button>
        </div>
        <button type="button" class="chip-btn" @click="addGrant">+ Proficiency or language</button>
      </div>
    </div>
    <div class="trait-part">
      <span class="trait-label">Spells</span>
      <div class="effects-input">
        <div v-for="(x, i) in spells" :key="i" class="effect-row">
          <EntryPicker :model-value="x.spell" :types="['spell']" @update:model-value="v => v ? setSpell(i, { spell: v }) : removeSpell(i)" />
          <select :value="x.how" aria-label="How it's cast" @change="setSpell(i, { how: val($event) as TraitSpell['how'] })">
            <option v-for="(label, id) in HOW_SPECIES" :key="id" :value="id">{{ label }}</option>
          </select>
          <select :value="x.ability ?? ''" aria-label="Cast with" title="The ability it's cast with (its attack and save DC are shown with it)" @change="setSpell(i, { ability: (val($event) || undefined) as TraitSpell['ability'] })">
            <option value="">no ability</option>
            <option v-for="(label, id) in ABILITY_NAME" :key="id" :value="id">with {{ label }}</option>
          </select>
          <label class="small" title="From this character level">from level <input type="number" min="1" max="20" class="effect-value" :value="x.from ?? 1" @change="setSpell(i, { from: Number(val($event)) || 1 })" /></label>
          <label class="small" title="The player may swap it for another spell of its level from a class's list (High Elf: a Wizard cantrip)"><input type="checkbox" :checked="!!x.swap" @change="setSpell(i, { swap: ($event.target as HTMLInputElement).checked ? {} : undefined })" /> swappable</label>
          <select v-if="x.swap" :value="x.swap.classes?.[0] ?? ''" aria-label="For a spell of which list" @change="setSpell(i, { swap: val($event) ? { classes: [val($event)] } : {} })">
            <option value="">any list</option>
            <option v-for="o in listOptions('class')" :key="o.id" :value="o.id">{{ o.label }} list</option>
          </select>
        </div>
        <EntryPicker add :types="['spell']" :exclude="spells.map(x => x.spell)" placeholder="Add a spell…" @pick="addSpell" />
      </div>
    </div>
  </div>
</template>
