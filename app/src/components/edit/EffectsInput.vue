<script setup lang="ts">
// An item's effects (gear.ts): one row each, what it changes, the number and what it applies to.
import { computed } from 'vue'
import type { GearEffect } from '../../model/types'
import { EFFECT_KINDS, describeEffect } from '../../gear'
import { ABILITIES, SKILLS } from '../../sheet'
import { TYPES } from '../../model/schema'
import { fieldOptions } from '../../store'

const model = defineModel<GearEffect[] | undefined>()
const list = computed(() => model.value ?? [])
const kindOf = (f: GearEffect) => EFFECT_KINDS.find(k => k.on === f.on)
const damageTypes = computed(() => fieldOptions(TYPES.item.fields.find(x => x.key === 'damageType')))

function put(i: number, patch: Partial<GearEffect>) {
  const l = list.value.map(x => ({ ...x }))
  l[i] = { ...l[i], ...patch }
  // Drop what the new kind doesn't use, and fill in what it needs.
  const k = kindOf(l[i])
  const f = l[i]
  if (k?.needs !== 'ability') delete f.ability
  if (k?.needs !== 'skill') delete f.skill
  if (k?.needs !== 'type') delete f.type
  if (k?.needs !== 'text') delete f.text
  if (!k?.canSet) delete f.set
  if (k?.noValue) delete f.value
  else if (f.value == null) f.value = f.set ? 19 : 1
  if (k?.needs === 'ability' && !f.ability) f.ability = 'str'
  if (k?.needs === 'skill' && !f.skill) f.skill = SKILLS[0].name
  model.value = l
}
const add = () => (model.value = [...list.value, { on: 'ac', value: 1 }])
const remove = (i: number) => { const l = [...list.value]; l.splice(i, 1); model.value = l.length ? l : undefined }
</script>

<template>
  <div class="effects-input">
    <div v-for="(f, i) in list" :key="i" class="effect-row">
      <select :value="f.on" aria-label="What it changes" @change="put(i, { on: ($event.target as HTMLSelectElement).value as GearEffect['on'] })">
        <option v-for="k in EFFECT_KINDS" :key="k.on" :value="k.on">{{ k.label }}</option>
      </select>
      <select v-if="kindOf(f)?.needs === 'ability'" :value="f.ability" aria-label="Ability" @change="put(i, { ability: ($event.target as HTMLSelectElement).value as GearEffect['ability'] })">
        <option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.label }}</option>
      </select>
      <select v-if="kindOf(f)?.needs === 'skill'" :value="f.skill" aria-label="Skill" @change="put(i, { skill: ($event.target as HTMLSelectElement).value })">
        <option v-for="s in SKILLS" :key="s.name" :value="s.name">{{ s.name }}</option>
      </select>
      <select v-if="kindOf(f)?.needs === 'type'" :value="f.type ?? ''" aria-label="Damage type" @change="put(i, { type: ($event.target as HTMLSelectElement).value })">
        <option value="">—</option>
        <option v-for="o in damageTypes" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
      <select v-if="kindOf(f)?.canSet" :value="f.set ? 'set' : 'add'" aria-label="Add or set" @change="put(i, { set: ($event.target as HTMLSelectElement).value === 'set' || undefined, value: ($event.target as HTMLSelectElement).value === 'set' ? 19 : 1 })">
        <option value="add">add</option>
        <option value="set">set to</option>
      </select>
      <input v-if="!kindOf(f)?.noValue" type="number" class="effect-value" :value="f.value ?? ''" aria-label="Value" @change="put(i, { value: Number(($event.target as HTMLInputElement).value) || 0 })" />
      <input v-if="kindOf(f)?.needs === 'text'" class="effect-text" :value="f.text ?? ''" placeholder="e.g. Darkvision 60 ft" aria-label="Feature" @input="put(i, { text: ($event.target as HTMLInputElement).value })" />
      <span class="muted effect-say">{{ describeEffect(f) }}</span>
      <button type="button" class="link-btn" title="Remove this effect" @click="remove(i)">×</button>
    </div>
    <button type="button" class="chip-btn" @click="add">+ Effect</button>
  </div>
</template>
