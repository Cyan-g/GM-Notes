<script setup lang="ts">
// The wizard's ability scores step: the base scores (standard array, point buy or typed in), the bonus from the
// background, the species or typed by hand, and what the feats add.
import { computed } from 'vue'
import type { Id } from '../../model/types'
import { POINTS, POINT_COST, STANDARD_ARRAY, bonusAdds, bonusOf, featLevels, pointsSpent, wizard } from '../../wizard'
import { abilityBonusText } from '../../abilityBonus'
import { ABILITY_KEYS, ABILITY_NAME, mod, signed } from '../../model/dnd'
import { rule } from '../../rules'
import { get } from '../../store'
import { useDraft } from '../../composables/useDraft'
import { inputNumber as num, inputValue as val } from '../../dom'
import SpreadPicker from '../SpreadPicker.vue'

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
const buy = (a: keyof typeof ABILITY_NAME, by: number) => {
  const n = (d.value.base[a] ?? 8) + by
  if (n < 8 || n > 15) return
  if (by > 0 && pointsSpent(d.value) - (POINT_COST[d.value.base[a] ?? 8] ?? 0) + POINT_COST[n] > POINTS) return
  setBase(a, n)
}
const speciesBonusText = computed(() => {
  for (let x = get(d.value.race); x; x = get(x.fields.parent as Id | undefined)) if (x.fields.abilityIncrease) return abilityBonusText(x.fields.abilityIncrease)
  return ''
})
const setBonusFrom = (f: typeof wizard.d.bonusFrom) => { wizard.d.bonusFrom = f; wizard.d.bonusChoice = { picks: [] } }
/** The scores the + buttons start from: the base ones for the background's or species' bonus. */
const baseScores = computed(() => Object.fromEntries(ABILITY_KEYS.map(a => [a, d.value.base[a] ?? 10])) as Record<(typeof ABILITY_KEYS)[number], number>)
const featAdds = (a: keyof typeof ABILITY_NAME) => scores.value[a] - Math.min(20, (d.value.base[a] ?? 10) + (adds.value[a] ?? 0))
</script>

<template>
  <div class="seg">
    <button type="button" :class="{ on: d.method === 'array' }" @click="setMethod('array')">Standard array</button>
    <button type="button" :class="{ on: d.method === 'pointbuy' }" @click="setMethod('pointbuy')">Point buy</button>
    <button type="button" :class="{ on: d.method === 'typed' }" @click="setMethod('typed')">Typed in</button>
  </div>
  <p v-if="d.method === 'array'" class="muted small">Give each of 15, 14, 13, 12, 10 and 8 to one score.</p>
  <p v-else-if="d.method === 'pointbuy'" class="small" :class="{ 'wz-bad': pointsSpent(d) > POINTS }">{{ POINTS - pointsSpent(d) }} of {{ POINTS }} points left (scores 8 to 15; 14 costs 7, 15 costs 9).</p>
  <table class="wz-scores">
    <thead><tr><th /><th>Base</th><th>Bonus</th><th v-if="featLevels(d).length">Feats</th><th>Score</th><th>Mod</th></tr></thead>
    <tbody>
      <tr v-for="a in ABILITY_KEYS" :key="a">
        <th>{{ ABILITY_NAME[a] }}</th>
        <td>
          <select v-if="d.method === 'array'" :value="d.base[a] ?? ''" @change="setBase(a, val($event) ? Number(val($event)) : undefined)">
            <option value="">—</option>
            <option v-for="n in [...new Set(arrayLeft(a))]" :key="n" :value="n">{{ n }}</option>
          </select>
          <span v-else-if="d.method === 'pointbuy'" class="wz-buy">
            <button type="button" class="chip-btn" @click="buy(a, -1)">−</button><b>{{ d.base[a] ?? 8 }}</b><button type="button" class="chip-btn" @click="buy(a, 1)">＋</button>
          </span>
          <input v-else type="number" min="1" max="30" :value="d.base[a] ?? ''" @change="setBase(a, num($event) || undefined)" />
        </td>
        <td>
          <input v-if="d.bonusFrom === 'custom'" type="number" min="-5" max="5" class="wz-small" :value="d.custom[a] ?? ''" placeholder="0" @change="wizard.d.custom = { ...d.custom, [a]: num($event) || undefined }" />
          <template v-else>{{ adds[a] ? signed(adds[a]!) : '' }}</template>
        </td>
        <td v-if="featLevels(d).length">{{ featAdds(a) ? signed(featAdds(a)) : '' }}</td>
        <td><b v-flash="scores[a]">{{ scores[a] }}</b></td>
        <td>{{ signed(mod(scores[a])) }}</td>
      </tr>
    </tbody>
  </table>
  <h3>Ability score bonus</h3>
  <div class="seg">
    <button v-if="rule('abilityIncrease') !== 'species'" type="button" :class="{ on: d.bonusFrom === 'background' }" @click="setBonusFrom('background')">Background's</button>
    <button v-if="rule('abilityIncrease') !== 'background'" type="button" :class="{ on: d.bonusFrom === 'species' }" @click="setBonusFrom('species')">Species'</button>
    <button type="button" :class="{ on: d.bonusFrom === 'custom' }" @click="setBonusFrom('custom')">Custom</button>
  </div>
  <p class="muted small">
    <template v-if="d.bonusFrom === 'background'">{{ d.background ? abilityBonusText(get(d.background)?.fields.abilityIncrease) || 'This background gives none.' : 'Choose a background first.' }}</template>
    <template v-else-if="d.bonusFrom === 'species'">{{ d.race ? speciesBonusText || 'This species gives none.' : 'Choose a species first.' }}</template>
    <template v-else>Type the bonus for each score in the table.</template>
  </p>
  <SpreadPicker v-if="bonus && d.bonusFrom !== 'custom'" :key="d.bonusFrom + (d.bonusFrom === 'background' ? d.background : d.race)" v-model="wizard.d.bonusChoice" :bonus="bonus" :scores="baseScores" />
</template>
