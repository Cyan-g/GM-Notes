<script setup lang="ts">
// An item's effects (gear.ts): one row each, what it changes, the number and what it applies to.
import { computed } from 'vue'
import type { GearEffect } from '../../model/types'
import { EFFECT_KINDS, SENSES, describeEffect, type EffectNeed } from '../../gear'
import { ABILITIES, SKILLS } from '../../sheet'
import { TYPES } from '../../model/schema'
import { fieldOptions } from '../../store'
import { CONDITIONS } from '../../encounter'

const model = defineModel<GearEffect[] | undefined>()
const list = computed(() => model.value ?? [])
const kindOf = (f: GearEffect) => EFFECT_KINDS.find(k => k.on === f.on)
const needs = (f: GearEffect, n: EffectNeed) => !!kindOf(f)?.needs?.includes(n)
const damageTypes = computed(() => fieldOptions(TYPES.item.fields.find(x => x.key === 'damageType')))
const conditions = CONDITIONS.filter(c => c !== 'Concentrating')

/** What each kind of input fills in when it first shows. */
const FIELD_OF: Record<EffectNeed, keyof GearEffect> = {
  ability: 'ability', skill: 'skill', type: 'type', text: 'text', mode: 'mode', note: 'note', dice: 'dice', proficient: 'proficient', sense: 'sense', condition: 'condition', pb: 'pb', plusAbility: 'ability',
}
function put(i: number, patch: Partial<GearEffect>) {
  const l = list.value.map(x => ({ ...x }))
  const f: GearEffect = { ...l[i], ...patch }
  // Drop what the new kind doesn't use, and fill in what it needs.
  const k = kindOf(f)
  for (const [n, key] of Object.entries(FIELD_OF) as [EffectNeed, keyof GearEffect][]) if (!k?.needs?.some(x => FIELD_OF[x] === key)) delete f[key]
  if (!k?.canSet) { delete f.set; delete f.force }
  if (k?.noValue) delete f.value
  else if (f.value == null) f.value = f.on === 'sense' ? 60 : f.set ? 19 : 1
  if (needs(f, 'ability') && !f.ability) f.ability = 'str'
  if (needs(f, 'skill') && !f.skill) f.skill = SKILLS[0].name
  if (needs(f, 'mode') && !f.mode) f.mode = 'adv'
  if (needs(f, 'sense') && !f.sense) f.sense = SENSES[0]
  if (needs(f, 'dice') && !f.dice) f.dice = '1'
  l[i] = f
  model.value = l
}
function setMode(i: number, m: string) {
  put(i, { set: m === 'set' || undefined, force: m === 'force' || undefined, value: m === 'add' ? 1 : m === 'set' ? 19 : 8 })
}
const val = (ev: Event) => (ev.target as HTMLInputElement | HTMLSelectElement).value
const add = () => (model.value = [...list.value, { on: 'ac', value: 1 }])
const remove = (i: number) => { const l = [...list.value]; l.splice(i, 1); model.value = l.length ? l : undefined }
</script>

<template>
  <div class="effects-input">
    <div v-for="(f, i) in list" :key="i" class="effect-row">
      <select :value="f.on" aria-label="What it changes" @change="put(i, { on: val($event) as GearEffect['on'] })">
        <option v-for="k in EFFECT_KINDS" :key="k.on" :value="k.on">{{ k.label }}</option>
      </select>
      <select v-if="needs(f, 'mode')" :value="f.mode" aria-label="Advantage or disadvantage" @change="put(i, { mode: val($event) as 'adv' | 'dis' })">
        <option value="adv">advantage</option>
        <option value="dis">disadvantage</option>
      </select>
      <select v-if="needs(f, 'ability')" :value="f.ability" aria-label="Ability" @change="put(i, { ability: val($event) as GearEffect['ability'] })">
        <option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.label }}</option>
      </select>
      <select v-if="needs(f, 'plusAbility')" :value="f.ability ?? ''" aria-label="Plus an ability's modifier" @change="put(i, { ability: (val($event) || undefined) as GearEffect['ability'] })">
        <option value="">no ability</option>
        <option v-for="a in ABILITIES" :key="a.key" :value="a.key">+ {{ a.label }} modifier</option>
      </select>
      <select v-if="needs(f, 'skill')" :value="f.skill" aria-label="Skill" @change="put(i, { skill: val($event) })">
        <option v-for="s in SKILLS" :key="s.name" :value="s.name">{{ s.name }}</option>
      </select>
      <input v-if="needs(f, 'dice')" class="effect-value" :value="f.dice ?? ''" placeholder="2 or 1d6" aria-label="Extra damage" @change="put(i, { dice: val($event).trim() })" />
      <select v-if="needs(f, 'type')" :value="f.type ?? ''" aria-label="Damage type" @change="put(i, { type: val($event) || undefined })">
        <option value="">—</option>
        <option v-for="o in damageTypes" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
      <select v-if="needs(f, 'sense')" :value="f.sense" aria-label="Sense" @change="put(i, { sense: val($event) })">
        <option v-for="s in SENSES" :key="s" :value="s">{{ s }}</option>
      </select>
      <select v-if="needs(f, 'condition')" :value="f.condition ?? ''" aria-label="Condition" @change="put(i, { condition: val($event) || undefined })">
        <option value="">—</option>
        <option v-for="c in conditions" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-if="kindOf(f)?.canSet" :value="f.force ? 'force' : f.set ? 'set' : 'add'" aria-label="Add, raise to, or becomes" title="set to: raises a lower score (Gauntlets of Ogre Power); becomes: even when that's lower (a curse)" @change="setMode(i, val($event))">
        <option value="add">add</option>
        <option value="set">set to</option>
        <option value="force">becomes</option>
      </select>
      <input v-if="!kindOf(f)?.noValue" type="number" class="effect-value" :value="f.value ?? ''" aria-label="Value" @change="put(i, { value: Number(val($event)) || 0 })" />
      <label v-if="needs(f, 'proficient')" class="small effect-check" title="Only counts while the wielder is proficient with the weapon"><input type="checkbox" :checked="!!f.proficient" @change="put(i, { proficient: ($event.target as HTMLInputElement).checked || undefined })" /> if proficient</label>
      <label v-if="needs(f, 'pb')" class="small effect-check" title="Adds the proficiency bonus too (Alert)"><input type="checkbox" :checked="!!f.pb" @change="put(i, { pb: ($event.target as HTMLInputElement).checked || undefined })" /> + proficiency bonus</label>
      <input v-if="needs(f, 'note')" class="effect-text" :value="f.note ?? ''" placeholder="when, e.g. against being knocked prone" aria-label="When" @input="put(i, { note: val($event) || undefined })" />
      <input v-if="needs(f, 'text')" class="effect-text" :value="f.text ?? ''" placeholder="e.g. Darkvision 60 ft" aria-label="Feature" @input="put(i, { text: val($event) })" />
      <span v-if="!needs(f, 'text') && !needs(f, 'note')" class="muted effect-say">{{ describeEffect(f) }}</span>
      <button type="button" class="link-btn" title="Remove this effect" @click="remove(i)">×</button>
    </div>
    <button type="button" class="chip-btn" @click="add">+ Effect</button>
  </div>
</template>
