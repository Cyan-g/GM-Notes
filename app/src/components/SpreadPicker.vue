<script setup lang="ts">
// An ability score increase as the scores they are now, each with + (and − to take it back): the points go where the
// bonus allows (Ability Score Improvement: +2 to one or +1 to two), never past its maximum. Fills in a BonusChoice
// once every point is placed, so the rest of the app reads it like any other pick.
import { computed, ref, watch } from 'vue'
import type { Abilities, AbilityBonus } from '../model/types'
import { ABILITY_KEYS, ABILITY_SHORT, pickable, type BonusChoice } from '../abilityBonus'

type Ability = keyof Abilities
const props = defineProps<{ bonus: AbilityBonus; scores: Record<Ability, number> }>()
const choice = defineModel<BonusChoice>({ required: true })

const adds = ref<Partial<Record<Ability, number>>>({})
watch(() => props.bonus, () => { adds.value = {} })
const cap = computed(() => props.bonus.max ?? 20)
const fixed = (a: Ability) => props.bonus.fixed?.[a] ?? 0

/** The ways to spend the points: the pick, and its alternative (alt). Each slot is one score raised by `amount`. */
interface Slot { group: number; amount: number; among: Ability[] }
const variants = computed(() => ([[props.bonus.pick, false], [props.bonus.orPick, true]] as const)
  .filter(([g]) => g?.length)
  .map(([g, alt]) => ({ alt, slots: g!.flatMap((p, group) => Array.from({ length: p.count ?? 1 }, () => ({ group, amount: p.amount, among: pickable(props.bonus, p) }))) as Slot[] })))
const points = computed(() => Math.max(0, ...variants.value.map(v => v.slots.reduce((n, s) => n + s.amount, 0))))
const spent = computed(() => Object.values(adds.value).reduce((n, v) => n + (v ?? 0), 0))

/** Each raised score in its own slot: partly (`done` false: a slot may still take more) or exactly, all slots used. */
function assign(a: Partial<Record<Ability, number>>, slots: Slot[], done: boolean): Map<Ability, Slot> | null {
  const want = (Object.entries(a) as [Ability, number][]).filter(([, v]) => v > 0)
  if (done && want.length !== slots.length) return null
  const used = new Set<number>(), out = new Map<Ability, Slot>()
  const go = (i: number): boolean => {
    if (i === want.length) return true
    const [ab, v] = want[i]
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k]
      if (used.has(k) || !s.among.includes(ab) || (done ? s.amount !== v : s.amount < v)) continue
      used.add(k); out.set(ab, s)
      if (go(i + 1)) return true
      used.delete(k); out.delete(ab)
    }
    return false
  }
  return go(0) ? out : null
}
const canAdd = (a: Ability) => {
  if (spent.value >= points.value || props.scores[a] + fixed(a) + (adds.value[a] ?? 0) >= cap.value) return false
  const next = { ...adds.value, [a]: (adds.value[a] ?? 0) + 1 }
  return variants.value.some(v => assign(next, v.slots, false))
}
function add(a: Ability, by: number) {
  const n = Math.max(0, (adds.value[a] ?? 0) + by)
  const next = { ...adds.value }
  if (n) next[a] = n; else delete next[a]
  adds.value = next
  // every point placed: the choice the app reads, else nothing picked yet
  for (const v of variants.value) {
    const m = spent.value === points.value ? assign(next, v.slots, true) : null
    if (!m) continue
    const picks: Ability[][] = []
    for (const [ab, s] of m) (picks[s.group] ??= []).push(ab)
    choice.value = { ...(v.alt ? { alt: true } : {}), picks: Array.from({ length: picks.length }, (_, i) => picks[i] ?? []) }
    return
  }
  choice.value = { picks: [] }
}
</script>

<template>
  <div class="spread">
    <p class="small muted">{{ points - spent }} of {{ points }} point{{ points === 1 ? '' : 's' }} left<template v-if="cap !== 20"> · up to {{ cap }}</template></p>
    <div class="spread-grid">
      <div v-for="a in ABILITY_KEYS" :key="a" class="spread-cell" :class="{ up: adds[a] }">
        <span class="cs-label">{{ ABILITY_SHORT[a] }}</span>
        <b>{{ scores[a] + fixed(a) + (adds[a] ?? 0) }}</b>
        <span v-if="adds[a] || fixed(a)" class="small spread-add">+{{ (adds[a] ?? 0) + fixed(a) }}</span>
        <span class="spread-btns">
          <button type="button" class="chip-btn" :disabled="!adds[a]" :aria-label="`Take a point back from ${ABILITY_SHORT[a]}`" @click="add(a, -1)">−</button>
          <button type="button" class="chip-btn" :disabled="!canAdd(a)" :aria-label="`One point to ${ABILITY_SHORT[a]}`" @click="add(a, 1)">+</button>
        </span>
      </div>
    </div>
  </div>
</template>
