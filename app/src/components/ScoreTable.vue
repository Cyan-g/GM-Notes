<script setup lang="ts">
// The six ability scores as a table, the same wherever scores are set: the creator's Scores step, a feat's ability
// score increase (in the creator's Feats step and the level-up). A row per ability: its name (★ the class's main
// scores), the caller's own columns (the `cols` slot: base, bonus, a feat's + and −), then the score, its modifier and
// what it does now (its save and skills, AC, initiative, HP, passive perception, the spell DC). Points placed but not
// on the sheet yet (`pending`) count already: the numbers are worked out on a copy of the sheet with them added.
import { computed } from 'vue'
import type { CharacterSheet } from '../model/types'
import { ABILITY_KEYS, ABILITY_NAME, SKILLS, mod, signed, type Ability } from '../model/dnd'
import { armorClass, initiative, passivePerception, saveBonus, score, skillBonus, skillLevel } from '../sheet'
import { own, ownerOf } from '../sheetData'

const props = defineProps<{
  s: CharacterSheet; prof: number; level: number
  /** Points not on the sheet yet, per ability (a choice still being made). */
  pending?: (a: Ability) => number
  /** The class's main scores, starred. */
  primary?: Ability[]
  /** Hit points now and the hit die, for Constitution. */
  hp?: number; die?: string
  /** The spellcasting ability, with its save DC and attack now. */
  casting?: Ability; spell?: { dc: number; attack: number }
  /** Abilities this table can't change: grey (a feat that raises only some). */
  dim?: (a: Ability) => boolean
}>()
const pend = (a: Ability) => props.pending?.(a) ?? 0
/** The sheet with the pending points added, still the character's (skills and the rest its features give count). */
const preview = computed<CharacterSheet>(() => {
  const copy: CharacterSheet = { ...props.s, abilities: Object.fromEntries(ABILITY_KEYS.map(a => [a, (props.s.abilities[a] ?? 10) + pend(a)])) as unknown as CharacterSheet['abilities'] }
  const pc = ownerOf(props.s)
  return pc ? own(copy, pc) : copy
})
const now = (a: Ability) => score(preview.value, a)
/** How much a pending point moves the modifier. */
const modUp = (a: Ability) => mod(now(a)) - mod(score(props.s, a))
const ac = computed(() => armorClass(preview.value).ac)
const isKey = (a: Ability) => !!props.primary?.includes(a)
function feeds(a: Ability): string[] {
  const out: string[] = []
  if (a === 'str') out.push('melee weapon attacks and damage', 'carrying capacity')
  if (a === 'dex') out.push(`AC ${ac.value}`, `Initiative ${signed(initiative(preview.value))}`, 'ranged and finesse weapon attacks')
  if (a === 'con' && props.hp != null) out.push(`HP ${Math.max(1, props.hp + modUp('con') * props.level)}${props.die ? ` (the ${props.die} + CON each level)` : ''}`, 'concentration saves')
  if (a === 'wis') out.push(`Passive Perception ${passivePerception(preview.value, props.prof)}`)
  if (props.casting === a && props.spell) out.push(`Spell save DC ${props.spell.dc + modUp(a)}`, `Spell attack ${signed(props.spell.attack + modUp(a))}`)
  return out
}
const skillsOf = (a: Ability) => SKILLS.filter(x => x.ability === a).map(x => ({ name: x.name, on: skillLevel(preview.value, x.name) > 0, bonus: skillBonus(preview.value, x.name, props.prof) }))
</script>

<template>
  <table class="wz-scores">
    <thead><tr><th /><slot name="head" /><th>Score</th><th>Mod</th><th class="wz-does-h">What it does now</th></tr></thead>
    <tbody>
      <tr v-for="a in ABILITY_KEYS" :key="a" :class="{ 'wz-key': isKey(a), 'st-dim': dim?.(a) }">
        <th>{{ ABILITY_NAME[a] }}<span v-if="isKey(a)" class="wz-key-mark" title="One of the class's main scores"> ★</span></th>
        <slot name="cols" :a="a" />
        <td><b v-flash="now(a)" :class="{ 'st-up': pend(a) > 0 }">{{ now(a) }}</b></td>
        <td>{{ signed(mod(now(a))) }}</td>
        <td class="wz-does">
          <span class="wz-does-save" :class="{ on: s.saves.includes(a) }">Save {{ signed(saveBonus(preview, a, prof)) }}<template v-if="s.saves.includes(a)"> (proficient)</template></span>
          <span v-for="x in skillsOf(a)" :key="x.name" class="wz-does-skill" :class="{ on: x.on }">{{ x.name }} {{ signed(x.bonus) }}</span>
          <span v-for="f in feeds(a)" :key="f" class="wz-does-feed">{{ f }}</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
