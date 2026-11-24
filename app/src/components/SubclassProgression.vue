<script setup lang="ts">
// On a subclass's page, above its features: its progression level by level, built from its features as the class
// page's table is — each level's features and every value that grows (Superiority Dice, the Psionic Energy Die,
// maneuvers known, cantrips and spells prepared), and the spell slots of a third caster (Eldritch Knight, Arcane
// Trickster; slots.ts). Without anything that grows, only the levels with features are listed.
import { computed } from 'vue'
import type { Entry, Trait } from '../model/types'
import { traitsOf } from '../model/traits'
import { ORD } from '../model/dnd'
import { THIRD, classSlotsAt } from '../slots'

const props = defineProps<{ e: Entry }>()
const cls = computed(() => String(props.e.fields.class ?? ''))
const traits = computed(() => traitsOf(props.e))
const lv = (t: Trait) => t.level ?? 1
const at = <T,>(steps: [number, T][], l: number) => steps.filter(([x]) => x <= l).at(-1)?.[1]
/** Columns for what grows by level: choices with counts by level, scaling values, uses by level or by class level. */
const growing = computed(() => traits.value.flatMap((t: Trait) => [
  ...(t.choice?.steps?.length ? [{ key: t.id + 'c', label: t.choice.label ?? t.name, value: (l: number) => (l >= lv(t) ? at(t.choice!.steps!, l) ?? '' : '') }] : []),
  ...(t.scale?.steps?.length ? [{ key: t.id + 's', label: t.scale.label || t.name, value: (l: number) => (l >= lv(t) ? at(t.scale!.steps, l) ?? '' : '') }] : []),
  ...(t.uses?.steps?.length ? [{ key: t.id + 'u', label: `${t.name} uses`, value: (l: number) => (l >= lv(t) ? (at(t.uses!.steps!, l) ?? 0) * (t.uses!.times ?? 1) + (t.uses!.plus ?? 0) : '') }] : []),
  ...(!t.uses?.steps?.length && t.uses?.count === 'level' ? [{ key: t.id + 'u', label: `${t.name} uses`, value: (l: number) => (l >= lv(t) ? l * (t.uses!.times ?? 1) + (t.uses!.plus ?? 0) : '') }] : []),
]))
/** A Fighter or Rogue subclass that casts as a third caster: its slot columns. */
const third = computed(() => ['Fighter', 'Rogue'].includes(cls.value) && THIRD.test(props.e.name))
const slotLevels = computed(() => {
  if (!third.value) return []
  const top = Math.max(0, ...classSlotsAt('third', 20).slots.map((n, i) => (n ? i + 1 : 0)))
  return Array.from({ length: top }, (_, i) => i)
})
const first = computed(() => Math.min(...traits.value.map(lv), 20))
/** The rows: every level from its first feature on when something grows, else only the levels with features. */
const levels = computed(() => {
  if (!traits.value.length) return []
  const all = Array.from({ length: 21 - first.value }, (_, i) => first.value + i)
  return growing.value.length || slotLevels.value.length ? all : all.filter(l => traits.value.some(t => lv(t) === l))
})
const features = (l: number) => traits.value.filter(t => lv(t) === l).map(t => t.name)
/** Worth a table: something grows, or there are slots (else the features under their level headings say it all). */
const shown = computed(() => growing.value.length > 0 || slotLevels.value.length > 0)
</script>

<template>
  <details v-if="shown" class="class-table-wrap" open>
    <summary><h2>{{ e.name }} progression</h2></summary>
    <div class="class-table-scroll">
      <table class="grid class-table">
        <thead><tr>
          <th>{{ cls || 'Class' }} level</th><th class="ct-feat">Features</th>
          <th v-for="g in growing" :key="g.key">{{ g.label }}</th>
          <th v-for="i in slotLevels" :key="i">{{ ORD[i + 1] }}</th>
        </tr></thead>
        <tbody>
          <tr v-for="l in levels" :key="l">
            <td>{{ l }}</td>
            <td class="ct-feat">{{ features(l).join(', ') }}<span v-if="!features(l).length" class="muted">—</span></td>
            <td v-for="g in growing" :key="g.key">{{ g.value(l) }}</td>
            <td v-for="i in slotLevels" :key="i">{{ classSlotsAt('third', l).slots[i] || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </details>
</template>
