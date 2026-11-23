<script setup lang="ts">
// The wizard's ability scores step: the base scores (standard array, point buy or typed in), the bonus from the
// background, the species or typed by hand, and what the feats add. With guidance: what each method means, which
// scores the class leans on, and beside each score what it feeds now (ScoreTable: its save and skills, HP, AC,
// initiative, the spell DC), worked out as the sheet will.
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
import { useSpread } from '../../composables/useSpread'
import { useDraftSheet } from '../../composables/useDraftSheet'
import ScoreTable from '../ScoreTable.vue'
import { bonusOpen } from '../../abilityBonus'
import { dieOfDraft } from '../../wizard'

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
const { sheet, prof, hp, spell, casting, primary } = useDraftSheet()
/** The class's main scores, in words. */
const priorities = computed(() => {
  const p = primary.value.list
  if (!d.value.cls || !p.length) return ''
  const names = p.map(a => ABILITY_NAME[a]).join(primary.value.any ? ' or ' : ' and ')
  const why = casting.value && p.includes(casting.value) ? ` (${ABILITY_NAME[casting.value]} is its spellcasting: spell save DC and spell attacks)` : ''
  return `${d.value.cls}: ${names} first${why}.`
})
const bonusLeft = computed(() => d.value.bonusFrom !== 'custom' && !!bonus.value && bonusOpen(bonus.value, d.value.bonusChoice) > 0)
// ---- the bonus, placed point by point in the table (background's or species'), or typed in ----
const spread = useSpread(computed(() => (d.value.bonusFrom !== 'custom' ? bonus.value : undefined)), baseScores, computed(() => d.value.bonusChoice), c => { wizard.d.bonusChoice = c })
/** Points placed but not all yet: the score shows them already (the sheet counts them once all are placed). */
const pending = (a: (typeof ABILITY_KEYS)[number]) => (bonusLeft.value ? (spread.adds.value[a] ?? 0) + spread.fixed(a) - (adds.value[a] ?? 0) : 0)
const featAdds = (a: keyof typeof ABILITY_NAME) => scores.value[a] - Math.min(20, (d.value.base[a] ?? 10) + (adds.value[a] ?? 0))
</script>

<template>
  <!-- the two choices side by side: where the scores come from, and where the bonus comes from -->
  <div class="wz-score-src">
    <span class="wz-src-label">Scores</span>
    <div class="seg">
    <button type="button" :class="{ on: d.method === 'array' }" @click="setMethod('array')">Standard array</button>
    <button type="button" :class="{ on: d.method === 'pointbuy' }" @click="setMethod('pointbuy')">Point buy</button>
    <button type="button" :class="{ on: d.method === 'typed' }" @click="setMethod('typed')">Typed in</button>
    </div>
    <span class="wz-src-label">Bonus</span>
    <div class="seg">
      <button v-for="x in sources" :key="x" type="button" :class="{ on: d.bonusFrom === x }" :disabled="x === 'subrace' && !hasSubrace && d.bonusFrom !== 'subrace'" :title="x === 'subrace' && !hasSubrace ? 'Only with a subrace' : undefined" @click="setBonusFrom(x)">{{ LABEL[x] }}</button>
    </div>
  </div>
  <div class="wz-guide">
    <p v-if="d.method === 'array'"><b>Standard array:</b> six set numbers, 15, 14, 13, 12, 10 and 8. Give each to one score, using each number once. The quickest way, and every character gets the same total.</p>
    <template v-else-if="d.method === 'pointbuy'">
      <p><b>Point buy:</b> every score starts at 8, and you have {{ POINTS }} points to raise them, up to 15. The higher a score, the more each step costs:</p>
      <p class="wz-costs"><span v-for="n in [9, 10, 11, 12, 13, 14, 15]" :key="n" class="chip">{{ n }}: {{ POINT_COST[n] }} pt{{ POINT_COST[n] === 1 ? '' : 's' }}</span></p>
      <p :class="{ 'wz-bad': pointsSpent(d) > POINTS }"><b>{{ POINTS - pointsSpent(d) }}</b> of {{ POINTS }} points left.</p>
    </template>
    <p v-else><b>Typed in:</b> scores rolled at the table (usually 4d6 six times, dropping the lowest die of each) or agreed with your DM. Type each one in.</p>
    <p><b>Bonus:</b>{{ ' ' }}
      <span>
      <template v-if="d.bonusFrom === 'background'">{{ d.background ? abilityBonusText(get(d.background)?.fields.abilityIncrease) || 'This background gives none.' : 'Choose a background first.' }}</template>
      <template v-else-if="d.bonusFrom === 'species' || d.bonusFrom === 'subrace'">{{ d.race ? speciesBonusText || 'This species gives none.' : 'Choose a species first.' }}</template>
      <template v-else>Type the bonus for each score in its column.</template>
      <template v-if="bonus && d.bonusFrom !== 'custom'"> · place them with − and + in the Bonus column<template v-if="spread.cap.value !== 20"> (up to {{ spread.cap.value }})</template>.</template>
      </span>
      Every 2 points over 10 is +1 to the modifier, which is what the dice use.</p>
    <p v-if="priorities" class="wz-priority">★ {{ priorities }} Then <b>Constitution</b> (hit points, concentration) and <b>Dexterity</b> (AC, initiative) help every class.</p>
  </div>
  <!-- the scores as the sheet will have them, with what each does (points still being placed count already) -->
  <ScoreTable :s="sheet" :prof="prof" :level="d.level" :pending="pending" :primary="primary.list" :hp="hp" :die="dieOfDraft(d)" :casting="casting" :spell="spell">
    <template #head><th>Base</th><th :class="{ 'wz-todo': bonusLeft }">Bonus<span v-if="bonusLeft" class="wz-left wz-th-left">{{ spread.points.value - spread.spent.value }} left</span></th><th v-if="featLevels(d).length">Feats</th></template>
    <template #cols="{ a }">
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
          <span v-else-if="bonus && (spread.allowed(a) || spread.fixed(a))" class="wz-bonus-pick">
            <button type="button" class="chip-btn" :disabled="!spread.adds.value[a]" :aria-label="`Take a point back from ${ABILITY_NAME[a]}`" @click="spread.add(a, -1)">−</button>
            <b :class="{ muted: !(spread.adds.value[a] || spread.fixed(a)) }">+{{ (spread.adds.value[a] ?? 0) + spread.fixed(a) }}</b>
            <button type="button" class="chip-btn" :disabled="!spread.canAdd(a)" :aria-label="`One point to ${ABILITY_NAME[a]}`" @click="spread.add(a, 1)">+</button>
          </span>
          <template v-else>{{ adds[a] ? signed(adds[a]!) : '' }}</template>
        </td>
        <td v-if="featLevels(d).length">{{ featAdds(a) ? signed(featAdds(a)) : '' }}</td>
    </template>
  </ScoreTable>
</template>
