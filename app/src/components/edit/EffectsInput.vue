<script setup lang="ts">
// An item's effects (effects.ts): one row each, what it changes, the number and what it applies to.
import Dropdown from '../Dropdown.vue'
import { computed } from 'vue'
import type { GearEffect } from '../../model/types'
import { EFFECT_KINDS, SENSES, describeEffect, type EffectNeed } from '../../effects'
import { ABILITIES, ABILITY_KEYS, CONDITIONS, SKILLS, SPEED_TYPES } from '../../model/dnd'
import { TYPES } from '../../model/schema'
import { fieldOptions } from '../../store'
import { inputValue as val } from '../../dom'
import EntryPicker from './EntryPicker.vue'

const model = defineModel<GearEffect[] | undefined>()
/** On a feature (not gear): an effect can take its number or dice from the feature's scaling value. */
defineProps<{ traits?: boolean }>()
const list = computed(() => model.value ?? [])
const kindOf = (f: GearEffect) => EFFECT_KINDS.find(k => k.on === f.on)
const needs = (f: GearEffect, n: EffectNeed) => !!kindOf(f)?.needs?.includes(n)
const damageTypes = computed(() => fieldOptions(TYPES.item.fields.find(x => x.key === 'damageType')))
const conditions = CONDITIONS

/** What each kind of input fills in when it first shows. */
const FIELD_OF: Record<EffectNeed, keyof GearEffect> = {
  ability: 'ability', skill: 'skill', type: 'type', text: 'text', mode: 'mode', note: 'note', dice: 'dice', proficient: 'proficient', sense: 'sense', condition: 'condition', pb: 'pb', plusAbility: 'ability', abilities: 'abilities', noShield: 'noShield', when: 'when', speedType: 'speedType', emptyDice: 'emptyDice', monkWeapons: 'monkWeapons', spell: 'spell',
}
function put(i: number, patch: Partial<GearEffect>) {
  const l = list.value.map(x => ({ ...x }))
  const f: GearEffect = { ...l[i], ...patch }
  // Drop what the new kind doesn't use, and fill in what it needs.
  const k = kindOf(f)
  for (const [n, key] of Object.entries(FIELD_OF) as [EffectNeed, keyof GearEffect][]) if (!k?.needs?.some(x => FIELD_OF[x] === key)) delete f[key]
  if (!k?.canSet) { delete f.set; delete f.force }
  if (f.on !== 'spellDamage') delete f.picked
  if (k?.noValue) delete f.value
  // spell damage often adds only an ability (Agonizing Blast: + CHA), so it starts without a number
  else if (f.value == null && f.on !== 'spellDamage') f.value = f.on === 'sense' ? 60 : f.set ? 19 : 1
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
const add = () => (model.value = [...list.value, { on: 'ac', value: 1 }])
type Ab = NonNullable<GearEffect['abilities']>[number]
function toggleAbility(i: number, a: Ab) {
  const s = new Set(list.value[i].abilities ?? [])
  if (s.has(a)) s.delete(a); else s.add(a)
  put(i, { abilities: s.size ? ABILITY_KEYS.filter(x => s.has(x)) : undefined })
}
const remove = (i: number) => { const l = [...list.value]; l.splice(i, 1); model.value = l.length ? l : undefined }
</script>

<template>
  <div class="effects-input">
    <div v-for="(f, i) in list" :key="i" class="effect-row">
      <Dropdown compact :value="f.on" aria-label="What it changes" @change="put(i, { on: val($event) as GearEffect['on'] })">
        <option v-for="k in EFFECT_KINDS" :key="k.on" :value="k.on">{{ k.label }}</option>
      </Dropdown>
      <Dropdown compact v-if="needs(f, 'mode')" :value="f.mode" aria-label="Advantage or disadvantage" @change="put(i, { mode: val($event) as 'adv' | 'dis' })">
        <option value="adv">advantage</option>
        <option value="dis">disadvantage</option>
      </Dropdown>
      <Dropdown compact v-if="needs(f, 'ability')" :value="f.ability" aria-label="Ability" @change="put(i, { ability: val($event) as GearEffect['ability'] })">
        <option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.label }}</option>
      </Dropdown>
      <label v-if="needs(f, 'plusAbility')" class="small ab-with">+ modifier of <Dropdown compact :value="f.ability ?? ''" aria-label="Plus an ability's modifier" @change="put(i, { ability: (val($event) || undefined) as GearEffect['ability'] })">
        <option value="">—</option>
        <option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.label }}</option>
      </Dropdown></label>
      <Dropdown compact v-if="needs(f, 'skill')" :value="f.skill" aria-label="Skill" @change="put(i, { skill: val($event) })">
        <option v-for="s in SKILLS" :key="s.name" :value="s.name">{{ s.name }}</option>
      </Dropdown>
      <EntryPicker v-if="needs(f, 'spell') && !f.picked" class="effect-spell" :model-value="f.spell ?? null" :types="['spell']" no-create placeholder="any spell" @update:model-value="v => put(i, { spell: v ?? undefined })" />
      <!-- in an option with a "one they have" spell choice: the spell the player picks there (Agonizing Blast's cantrip) -->
      <label v-if="needs(f, 'spell')" class="check-chip small effect-check" title="The spell the player picks with this option (add a spell choice 'one they have' to the option)"><input type="checkbox" :checked="!!f.picked" @change="put(i, { picked: ($event.target as HTMLInputElement).checked || undefined, spell: undefined })" /> the picked spell</label>
      <input v-if="needs(f, 'dice')" class="effect-value" :value="f.dice ?? ''" placeholder="2 or 1d6" aria-label="Extra damage" @change="put(i, { dice: val($event).trim() })" />
      <Dropdown compact v-if="needs(f, 'type')" :value="f.type ?? ''" aria-label="Damage type" @change="put(i, { type: val($event) || undefined })">
        <option value="">—</option>
        <option v-for="o in damageTypes" :key="o.id" :value="o.id">{{ o.label }}</option>
      </Dropdown>
      <Dropdown compact v-if="needs(f, 'speedType')" :value="f.speedType ?? 'climb'" aria-label="Speed" @change="put(i, { speedType: val($event) as GearEffect['speedType'] })">
        <option v-for="k in SPEED_TYPES.filter(t => t !== 'walk')" :key="k" :value="k">{{ k }}</option>
      </Dropdown>
      <input v-if="needs(f, 'emptyDice')" class="effect-value" :value="f.emptyDice ?? ''" placeholder="empty hands: 1d8" title="The die while holding no weapon or shield (Unarmed Fighting)" aria-label="Die with empty hands" @change="put(i, { emptyDice: val($event).trim() || undefined })" />
      <Dropdown compact v-if="needs(f, 'sense')" :value="f.sense" aria-label="Sense" @change="put(i, { sense: val($event) })">
        <option v-for="s in SENSES" :key="s" :value="s">{{ s }}</option>
      </Dropdown>
      <Dropdown compact v-if="needs(f, 'condition')" :value="f.condition ?? ''" aria-label="Condition" @change="put(i, { condition: val($event) || undefined })">
        <option value="">—</option>
        <option v-for="c in conditions" :key="c" :value="c">{{ c }}</option>
      </Dropdown>
      <Dropdown compact v-if="kindOf(f)?.canSet" :value="f.force ? 'force' : f.set ? 'set' : 'add'" aria-label="Add, raise to, or becomes" title="set to: raises a lower score (Gauntlets of Ogre Power); becomes: even when that's lower (a curse)" @change="setMode(i, val($event))">
        <option value="add">add</option>
        <option value="set">set to</option>
        <option value="force">becomes</option>
      </Dropdown>
      <input v-if="!kindOf(f)?.noValue" type="number" class="effect-value" :value="f.value ?? ''" aria-label="Value" @change="put(i, { value: Number(val($event)) || 0 })" />
      <span v-if="needs(f, 'abilities')" class="chip-toggles" role="group" aria-label="Plus these modifiers">
        <button class="chip-toggle" v-for="a in ABILITIES" :key="a.key" type="button" :class="{ on: f.abilities?.includes(a.key as Ab) }" @click="toggleAbility(i, a.key as Ab)">{{ a.short }}</button>
      </span>
      <label v-if="needs(f, 'noShield')" class="check-chip small effect-check" title="Only without a shield (a monk's Unarmored Defense)"><input type="checkbox" :checked="!!f.noShield" @change="put(i, { noShield: ($event.target as HTMLInputElement).checked || undefined })" /> no shield</label>
      <Dropdown compact v-if="needs(f, 'when')" :value="f.when ?? ''" aria-label="Only for" @change="put(i, { when: (val($event) || undefined) as GearEffect['when'] })">
        <option value="">always</option>
        <option v-if="f.on !== 'ac'" value="melee">melee attacks</option>
        <option v-if="f.on !== 'ac'" value="ranged">ranged attacks</option>
        <option v-if="f.on !== 'ac'" value="finesseOrRanged">finesse or ranged</option>
        <option v-if="f.on !== 'ac'" value="heavy">Heavy weapons</option>
        <option v-if="f.on !== 'ac'" value="oneHanded">one melee weapon in one hand</option>
        <option v-if="f.on !== 'ac'" value="thrown">thrown weapons, when thrown</option>
        <option v-if="f.on === 'ac'" value="armored">while in armor</option>
        <option v-if="f.on === 'ac' || f.on === 'speed'" value="unarmored">without armor or shield</option>
      </Dropdown>
      <label v-if="needs(f, 'proficient')" class="check-chip small effect-check" :title="f.on === 'unarmed' ? 'May use Dexterity instead of Strength (Martial Arts)' : 'Only counts while the wielder is proficient with the weapon'"><input type="checkbox" :checked="!!f.proficient" @change="put(i, { proficient: ($event.target as HTMLInputElement).checked || undefined })" /> {{ f.on === 'unarmed' ? 'STR or DEX' : 'if proficient' }}</label>
      <label v-if="needs(f, 'monkWeapons')" class="check-chip small effect-check" title="Monk weapons (Simple melee, Martial melee with Light) use it too, while no armor or shield is worn (Martial Arts)"><input type="checkbox" :checked="!!f.monkWeapons" @change="put(i, { monkWeapons: ($event.target as HTMLInputElement).checked || undefined })" /> Monk weapons too</label>
      <label v-if="traits && ['damage', 'extraDamage', 'unarmed', 'attack', 'speed'].includes(f.on)" class="check-chip small effect-check" title="The number or dice is the feature's scaling value (Rage Damage, Sneak Attack, Martial Arts)"><input type="checkbox" :checked="!!f.fromScale" @change="put(i, { fromScale: ($event.target as HTMLInputElement).checked || undefined })" /> = scaling value</label>
      <label v-if="needs(f, 'pb')" class="check-chip small effect-check" title="Adds the proficiency bonus too (Alert)"><input type="checkbox" :checked="!!f.pb" @change="put(i, { pb: ($event.target as HTMLInputElement).checked || undefined })" /> + proficiency bonus</label>
      <input v-if="needs(f, 'note')" class="effect-text" :value="f.note ?? ''" placeholder="when, e.g. against being knocked prone" aria-label="When" @input="put(i, { note: val($event) || undefined })" />
      <input v-if="needs(f, 'text')" class="effect-text" :value="f.text ?? ''" placeholder="e.g. Darkvision 60 ft" aria-label="Feature" @input="put(i, { text: val($event) })" />
      <span v-if="!needs(f, 'text') && !needs(f, 'note')" class="muted effect-say">{{ describeEffect(f) }}</span>
      <button type="button" class="link-btn" title="Remove this effect" @click="remove(i)">×</button>
    </div>
    <button type="button" class="chip-btn" @click="add">+ Effect</button>
  </div>
</template>
