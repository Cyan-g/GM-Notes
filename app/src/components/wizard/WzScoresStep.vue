<script setup lang="ts">
// The wizard's ability scores step: the base scores (standard array, point buy or typed in), the bonus from the
// background, the species or typed by hand, and what the feats add. With guidance: what each method means, which
// scores the class leans on, and beside each score what it feeds now (its save and skills, HP, AC, initiative, the
// spell DC), worked out as the sheet will.
import Dropdown from '../Dropdown.vue'
import { computed, watchEffect } from 'vue'
import type { Id } from '../../model/types'
import { POINTS, POINT_COST, STANDARD_ARRAY, bonusAdds, bonusOf, featLevels, pointsSpent, wizard } from '../../wizard'
import { abilityBonusText } from '../../abilityBonus'
import { ABILITY_KEYS, ABILITY_NAME, mod, signed } from '../../model/dnd'
import { bonusSources } from '../../rules'
import { raceChain } from '../../species'
import { get } from '../../store'
import { useDraft } from '../../composables/useDraft'
import { inputNumber as num, inputValue as val } from '../../dom'
import SpreadPicker from '../SpreadPicker.vue'
import { useDraftSheet } from '../../composables/useDraftSheet'
import { bonusOpen } from '../../abilityBonus'
import { dieOfDraft } from '../../wizard'
import type { Ability } from '../../model/dnd'

const { d, scores } = useDraft()
const bonus = computed(() => bonusOf(d.value))
const adds = computed(() => bonusAdds(d.value))
function setMethod(m: typeof wizard.d.method) {
  wizard.d.method = m
  wizard.d.base = m === 'pointbuy' ? Object.fromEntries(ABILITY_KEYS.map(a => [a, 8])) : m === 'typed' ? Object.fromEntries(ABILITY_KEYS.map(a => [a, 10])) : {}
}
const arrayLeft = (a: string) => STANDARD_ARRAY.filter((n, i) => {
  const usedBy = ABILITY_KEYS.filter(k => d.value.base[k] === n && k !== a).length
  return STANDARD_ARRAY.slice(0, i).filter(x => x === n).length >= usedBy
})
const setBase = (a: string, n: number | undefined) => { wizard.d.base = { ...wizard.d.base, [a]: n } }
/** Whether one more point can go into a score: up to 15, with points left for it. */
const canBuy = (a: keyof typeof ABILITY_NAME) => { const n = (d.value.base[a] ?? 8) + 1; return n <= 15 && pointsSpent(d.value) - (POINT_COST[d.value.base[a] ?? 8] ?? 0) + POINT_COST[n] <= POINTS }
const buy = (a: keyof typeof ABILITY_NAME, by: number) => {
  const n = (d.value.base[a] ?? 8) + by
  if (n < 8 || n > 15) return
  if (by > 0 && pointsSpent(d.value) - (POINT_COST[d.value.base[a] ?? 8] ?? 0) + POINT_COST[n] > POINTS) return
  setBase(a, n)
}
const sources = computed(() => bonusSources())
/** The species' increase in words: each race of the chain with its own ("Dwarf: +2 Con · Mountain Dwarf: +2 Str"). */
const speciesBonusText = computed(() => {
  const chain = [...raceChain(d.value.race, true)].reverse().filter(x => x.fields.abilityIncrease)
  if (d.value.bonusFrom === 'subrace') { const own = chain.at(-1); return own ? abilityBonusText(own.fields.abilityIncrease) : '' }
  return chain.map(x => (chain.length > 1 ? `${x.name}: ` : '') + abilityBonusText(x.fields.abilityIncrease)).join(' · ')
})
const hasSubrace = computed(() => raceChain(d.value.race, true).length > 1)
// each source keeps its own picks: switching away and back finds them again
function setBonusFrom(f: typeof wizard.d.bonusFrom) {
  const keep = { ...(d.value.bonusChoices ?? {}) }
  if (d.value.bonusFrom !== 'custom') keep[d.value.bonusFrom] = d.value.bonusChoice
  wizard.d.bonusChoices = keep
  wizard.d.bonusFrom = f
  wizard.d.bonusChoice = f !== 'custom' ? keep[f] ?? { picks: [] } : { picks: [] }
}
// a source the Ruleset no longer offers: the first one it does
watchEffect(() => { if (!sources.value.includes(d.value.bonusFrom)) setBonusFrom(sources.value[0]) })
const LABEL: Record<string, string> = { background: "Background's", species: "Species'", subrace: "Subrace's only", custom: 'Typed in' }
/** The scores the + buttons start from: the base ones for the background's or species' bonus. */
const baseScores = computed(() => Object.fromEntries(ABILITY_KEYS.map(a => [a, d.value.base[a] ?? 10])) as Record<(typeof ABILITY_KEYS)[number], number>)
// ---- guidance ----
const { abilities, skills, hp, ac, init, passive, spell, casting, primary } = useDraftSheet()
/** The class's main scores, in words. */
const priorities = computed(() => {
  const p = primary.value.list
  if (!d.value.cls || !p.length) return ''
  const names = p.map(a => ABILITY_NAME[a]).join(primary.value.any ? ' or ' : ' and ')
  const why = casting.value && p.includes(casting.value) ? ` (${ABILITY_NAME[casting.value]} is its spellcasting: spell save DC and spell attacks)` : ''
  return `${d.value.cls}: ${names} first${why}.`
})
const isKey = (a: Ability) => primary.value.list.includes(a)
/** What a score feeds now, besides its save and skills. */
function feeds(a: Ability): string[] {
  const out: string[] = []
  if (a === 'str') out.push('melee weapon attacks and damage', 'carrying capacity')
  if (a === 'dex') out.push(`AC ${ac.value}`, `Initiative ${signed(init.value)}`, 'ranged and finesse weapon attacks')
  if (a === 'con' && hp.value != null) out.push(`HP ${hp.value} (the ${dieOfDraft(d.value)} + CON each level)`, 'concentration saves')
  if (a === 'wis') out.push(`Passive Perception ${passive.value}`)
  if (casting.value === a && spell.value) out.push(`Spell save DC ${spell.value.dc}`, `Spell attack ${signed(spell.value.attack)}`)
  return out
}
const skillsOf = (a: Ability) => skills.value.filter(x => x.ability === a)
const bonusLeft = computed(() => d.value.bonusFrom !== 'custom' && !!bonus.value && bonusOpen(bonus.value, d.value.bonusChoice) > 0)
const featAdds = (a: keyof typeof ABILITY_NAME) => scores.value[a] - Math.min(20, (d.value.base[a] ?? 10) + (adds.value[a] ?? 0))
</script>

<template>
  <div class="seg">
    <button type="button" :class="{ on: d.method === 'array' }" @click="setMethod('array')">Standard array</button>
    <button type="button" :class="{ on: d.method === 'pointbuy' }" @click="setMethod('pointbuy')">Point buy</button>
    <button type="button" :class="{ on: d.method === 'typed' }" @click="setMethod('typed')">Typed in</button>
  </div>
  <div class="wz-guide">
    <p v-if="d.method === 'array'"><b>Standard array:</b> six set numbers, 15, 14, 13, 12, 10 and 8. Give each to one score, using each number once. The quickest way, and every character gets the same total.</p>
    <template v-else-if="d.method === 'pointbuy'">
      <p><b>Point buy:</b> every score starts at 8, and you have {{ POINTS }} points to raise them, up to 15. The higher a score, the more each step costs:</p>
      <p class="wz-costs"><span v-for="n in [9, 10, 11, 12, 13, 14, 15]" :key="n" class="chip">{{ n }}: {{ POINT_COST[n] }} pt{{ POINT_COST[n] === 1 ? '' : 's' }}</span></p>
      <p :class="{ 'wz-bad': pointsSpent(d) > POINTS }"><b>{{ POINTS - pointsSpent(d) }}</b> of {{ POINTS }} points left.</p>
    </template>
    <p v-else><b>Typed in:</b> scores rolled at the table (usually 4d6 six times, dropping the lowest die of each) or agreed with your DM. Type each one in.</p>
    <p>Then the <b>bonus</b> below adds to these (in the 2024 rules from the background: +2 and +1, or +1 to three scores; no score above 20 at creation). Every 2 points over 10 is +1 to the modifier, which is what the dice use.</p>
    <p v-if="priorities" class="wz-priority">★ {{ priorities }} Then <b>Constitution</b> (hit points, concentration) and <b>Dexterity</b> (AC, initiative) help every class.</p>
  </div>
  <table class="wz-scores">
    <thead><tr><th /><th>Base</th><th>Bonus</th><th v-if="featLevels(d).length">Feats</th><th>Score</th><th>Mod</th><th class="wz-does-h">What it does now</th></tr></thead>
    <tbody>
      <tr v-for="a in ABILITY_KEYS" :key="a" :class="{ 'wz-key': isKey(a) }">
        <th>{{ ABILITY_NAME[a] }}<span v-if="isKey(a)" class="wz-key-mark" title="One of the class's main scores"> ★</span></th>
        <td>
          <Dropdown v-if="d.method === 'array'" :class="{ 'wz-todo': d.base[a] == null }" :value="d.base[a] ?? ''" @change="setBase(a, val($event) ? Number(val($event)) : undefined)">
            <option value="">—</option>
            <option v-for="n in [...new Set(arrayLeft(a))]" :key="n" :value="n">{{ n }}</option>
          </Dropdown>
          <span v-else-if="d.method === 'pointbuy'" class="wz-buy">
            <button type="button" class="chip-btn" :disabled="(d.base[a] ?? 8) <= 8" @click="buy(a, -1)">−</button><b>{{ d.base[a] ?? 8 }}</b><button type="button" class="chip-btn" :disabled="!canBuy(a)" :title="(d.base[a] ?? 8) >= 15 ? '15 is the most point buy allows' : !canBuy(a) ? 'Not enough points left' : undefined" @click="buy(a, 1)">＋</button>
          </span>
          <input v-else type="number" min="1" max="30" :class="{ 'wz-todo': d.base[a] == null }" :value="d.base[a] ?? ''" @change="setBase(a, num($event) || undefined)" />
        </td>
        <td>
          <input v-if="d.bonusFrom === 'custom'" type="number" min="-5" max="5" class="wz-small" :value="d.custom[a] ?? ''" placeholder="0" @change="wizard.d.custom = { ...d.custom, [a]: num($event) || undefined }" />
          <template v-else>{{ adds[a] ? signed(adds[a]!) : '' }}</template>
        </td>
        <td v-if="featLevels(d).length">{{ featAdds(a) ? signed(featAdds(a)) : '' }}</td>
        <td><b v-flash="scores[a]">{{ scores[a] }}</b></td>
        <td>{{ signed(mod(scores[a])) }}</td>
        <td class="wz-does">
          <span class="wz-does-save" :class="{ on: abilities.find(x => x.a === a)?.saveProf }">Save {{ signed(abilities.find(x => x.a === a)?.save ?? 0) }}<template v-if="abilities.find(x => x.a === a)?.saveProf"> (proficient)</template></span>
          <span v-for="x in skillsOf(a)" :key="x.name" class="wz-does-skill" :class="{ on: x.level > 0 }">{{ x.name }} {{ signed(x.bonus) }}</span>
          <span v-for="f in feeds(a)" :key="f" class="wz-does-feed">{{ f }}</span>
        </td>
      </tr>
    </tbody>
  </table>
  <h3>Ability score bonus</h3>
  <div class="seg">
    <button v-for="x in sources" :key="x" type="button" :class="{ on: d.bonusFrom === x }" :disabled="x === 'subrace' && !hasSubrace && d.bonusFrom !== 'subrace'" :title="x === 'subrace' && !hasSubrace ? 'Only with a subrace' : undefined" @click="setBonusFrom(x)">{{ LABEL[x] }}</button>
  </div>
  <p class="muted small">
    <template v-if="d.bonusFrom === 'background'">{{ d.background ? abilityBonusText(get(d.background)?.fields.abilityIncrease) || 'This background gives none.' : 'Choose a background first.' }}</template>
    <template v-else-if="d.bonusFrom === 'species' || d.bonusFrom === 'subrace'">{{ d.race ? speciesBonusText || 'This species gives none.' : 'Choose a species first.' }}</template>
    <template v-else>Type the bonus for each score in the table.</template>
  </p>
  <SpreadPicker v-if="bonus && d.bonusFrom !== 'custom'" :class="{ 'wz-todo': bonusLeft }" :data-left="bonusLeft ? 'to pick' : undefined" :key="d.bonusFrom + (d.bonusFrom === 'background' ? d.background : d.race)" v-model="wizard.d.bonusChoice" :bonus="bonus" :scores="baseScores" />
</template>
