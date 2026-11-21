<script setup lang="ts">
// A feat's ability score increase: most are "+1 to one of these" (Grappler: Strength or Dexterity; an Epic Boon: any,
// up to 30), set here in one row; anything else in the full editor. A preview shows the player's + buttons.
import { computed, ref } from 'vue'
import type { AbilityBonus } from '../../model/types'
import type { BonusChoice } from '../../abilityBonus'
import { ABILITY_KEYS, ABILITY_SHORT, type Ability } from '../../model/dnd'
import AbilityBonusInput from './AbilityBonusInput.vue'
import SpreadPicker from '../SpreadPicker.vue'

const model = defineModel<AbilityBonus | undefined>()
/** "+1 to one of these": its abilities (empty: any), if the increase is that. */
const simple = computed<Ability[] | undefined>(() => {
  const b = model.value
  if (!b) return undefined
  const p = b.pick ?? []
  const ok = p.length === 1 && p[0].amount === 1 && (p[0].count ?? 1) === 1 && !b.orPick?.length && !(b.fixed && Object.values(b.fixed).some(Boolean))
  return ok ? ((p[0].among ?? []) as Ability[]) : undefined
})
const mode = ref<'one' | 'custom' | 'none'>(!model.value ? 'none' : simple.value ? 'one' : 'custom')
const among = ref<Ability[]>(simple.value ?? [])
const max = ref<number>(model.value?.max ?? 20)
function save() {
  model.value = { pick: [{ amount: 1, ...(among.value.length && among.value.length < 6 ? { among: [...among.value] } : {}) }], max: max.value }
}
function setMode(m: 'one' | 'custom' | 'none') {
  mode.value = m
  if (m === 'none') model.value = undefined
  else if (m === 'one' && !simple.value) save()
}
function toggle(a: Ability) { among.value = ABILITY_KEYS.filter(x => (x === a ? !among.value.includes(a) : among.value.includes(x))); save() }
const TEN = Object.fromEntries(ABILITY_KEYS.map(a => [a, 10])) as Record<Ability, number>
const preview = ref<BonusChoice>({ picks: [] })
</script>

<template>
  <div class="feat-bonus">
    <div class="seg">
      <button type="button" :class="{ on: mode === 'none' }" @click="setMode('none')">None</button>
      <button type="button" :class="{ on: mode === 'one' }" @click="setMode('one')">+1 to one of these</button>
      <button type="button" :class="{ on: mode === 'custom' }" @click="setMode('custom')">Custom</button>
    </div>
    <div v-if="mode === 'one'" class="cb-line">
      <div class="seg cb-toggles"><button v-for="a in ABILITY_KEYS" :key="a" type="button" :class="{ on: among.includes(a) }" @click="toggle(a)">{{ ABILITY_SHORT[a] }}</button></div>
      <span class="muted small">{{ among.length ? '' : 'none ticked: any ability' }}</span>
      <label class="small">max <select :value="max" @change="max = Number(($event.target as HTMLSelectElement).value); save()"><option :value="20">20</option><option :value="30">30 (Epic Boon)</option></select></label>
    </div>
    <AbilityBonusInput v-else-if="mode === 'custom'" v-model="model" />
    <div v-if="model?.pick?.length || model?.orPick?.length" class="rb-preview">
      <span class="muted small">What the player sees (on scores of 10):</span>
      <SpreadPicker :key="JSON.stringify(model)" v-model="preview" :bonus="model!" :scores="TEN" />
    </div>
  </div>
</template>
