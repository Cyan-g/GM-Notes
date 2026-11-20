<script setup lang="ts">
// The player's picks for an ability score bonus (abilityBonus.ts): its fixed part shown, a dropdown per score to pick,
// and the alternative set of picks when it has one ("+2 to one or +1 to two"). A score is picked once per bonus.
import { computed } from 'vue'
import type { AbilityBonus } from '../model/types'
import { ABILITY_NAME, ABILITY_SHORT, picksIn, pickable, type BonusChoice } from '../abilityBonus'

const props = defineProps<{ bonus: AbilityBonus }>()
const choice = defineModel<BonusChoice>({ required: true })
const picks = computed(() => picksIn(props.bonus, choice.value))
const taken = computed(() => new Set(choice.value.picks.flat()))
type Ab = keyof typeof ABILITY_NAME
function set(i: number, slot: number, a: string) {
  const all = picks.value.map((_, k) => [...(choice.value.picks[k] ?? [])])
  all[i][slot] = a as Ab
  all[i] = all[i].filter(Boolean)
  choice.value = { ...choice.value, picks: all }
}
const setAlt = (alt: boolean) => { choice.value = { alt, picks: [] } }
const fixed = computed(() => Object.entries(props.bonus.fixed ?? {}).filter(([, n]) => n) as [Ab, number][])
const sign = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)
</script>

<template>
  <div class="bonus-picker">
    <div v-if="bonus.orPick?.length && bonus.pick?.length" class="seg">
      <button type="button" :class="{ on: !choice.alt }" @click="setAlt(false)">{{ bonus.pick.map(p => `${sign(p.amount)}${(p.count ?? 1) > 1 ? ` ×${p.count}` : ''}`).join(' / ') }}</button>
      <button type="button" :class="{ on: choice.alt }" @click="setAlt(true)">{{ bonus.orPick.map(p => `${sign(p.amount)}${(p.count ?? 1) > 1 ? ` ×${p.count}` : ''}`).join(' / ') }}</button>
    </div>
    <div class="bp-rows">
      <span v-for="[a, n] in fixed" :key="a" class="chip">{{ sign(n) }} {{ ABILITY_SHORT[a] }}</span>
      <template v-for="(p, i) in picks" :key="`${choice.alt}-${i}`">
        <label v-for="slot in p.count ?? 1" :key="slot" class="bp-pick">
          <b>{{ sign(p.amount) }}</b>
          <select :value="choice.picks[i]?.[slot - 1] ?? ''" @change="set(i, slot - 1, ($event.target as HTMLSelectElement).value)">
            <option value="">—</option>
            <option v-for="a in pickable(bonus, p)" :key="a" :value="a" :disabled="taken.has(a) && choice.picks[i]?.[slot - 1] !== a">{{ ABILITY_NAME[a] }}</option>
          </select>
        </label>
      </template>
      <span v-if="bonus.max" class="muted small">max {{ bonus.max }}</span>
    </div>
  </div>
</template>
