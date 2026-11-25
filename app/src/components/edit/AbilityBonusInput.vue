<script setup lang="ts">
// A race's or feat's ability score bonus (abilityBonus.ts): fixed bonuses per score, picks the player makes (with an
// alternative set of picks), a cap and a note. Stored only; nothing is added to a sheet on its own.
import { computed } from 'vue'
import type { AbilityBonus, AbilityPick } from '../../model/types'
import { abilityBonusText, cleanBonus } from '../../abilityBonus'
import { ABILITY_KEYS, ABILITY_SHORT, ABILITY_UPPER } from '../../model/dnd'

const model = defineModel<AbilityBonus | undefined>()
const b = computed<AbilityBonus>(() => model.value ?? {})
const put = (p: Partial<AbilityBonus>) => { model.value = cleanBonus({ ...b.value, ...p }) }
const num = (ev: Event) => Number((ev.target as HTMLInputElement).value) || 0
const setFixed = (a: keyof typeof ABILITY_SHORT, n: number) => put({ fixed: { ...b.value.fixed, [a]: n } })

type Side = 'pick' | 'orPick'
const list = (side: Side) => b.value[side] ?? []
const putSide = (side: Side, l: AbilityPick[]) => put(side === 'pick' ? { pick: l } : { orPick: l })
function setPick(side: Side, i: number, p: Partial<AbilityPick>) {
  const l = list(side).map(x => ({ ...x }))
  l[i] = { ...l[i], ...p }
  putSide(side, l)
}
const addPick = (side: Side) => putSide(side, [...list(side), { amount: 1 }])
const removePick = (side: Side, i: number) => putSide(side, list(side).filter((_, k) => k !== i))
function toggleAmong(side: Side, i: number, a: keyof typeof ABILITY_SHORT) {
  const among = new Set(list(side)[i].among ?? [])
  if (among.has(a)) among.delete(a); else among.add(a)
  setPick(side, i, { among: [...among] })
}
const text = computed(() => abilityBonusText(model.value))
</script>

<template>
  <div class="ability-bonus-input">
    <div class="ab-fixed">
      <label v-for="a in ABILITY_KEYS" :key="a" class="ab-score">
        <span>{{ ABILITY_UPPER[a] }}</span>
        <input type="number" min="-5" max="5" :value="b.fixed?.[a] || ''" placeholder="0" @change="setFixed(a, num($event))" />
      </label>
    </div>
    <template v-for="side in (['pick', 'orPick'] as const)" :key="side">
      <div v-if="side === 'pick' || list('pick').length" class="ab-picks">
        <span class="trait-label">{{ side === 'pick' ? 'Player picks' : 'Or instead' }}</span>
        <div v-for="(p, i) in list(side)" :key="i" class="effect-row ab-pick">
          <label class="small">+<input type="number" min="1" max="5" class="effect-value" :value="p.amount" aria-label="Bonus" @change="setPick(side, i, { amount: num($event) || 1 })" /></label>
          <label class="small">to <input type="number" min="1" max="6" class="effect-value" :value="p.count ?? 1" aria-label="How many scores" @change="setPick(side, i, { count: num($event) || 1 })" /> {{ (p.count ?? 1) === 1 ? 'score' : 'scores' }}</label>
          <span class="seg" :title="p.among?.length ? 'Only from these' : 'From any score (pick some to narrow it)'">
            <button v-for="a in ABILITY_KEYS" :key="a" type="button" :class="{ on: p.among?.includes(a) }" @click="toggleAmong(side, i, a)">{{ ABILITY_UPPER[a] }}</button>
          </span>
          <button type="button" class="link-btn" title="Remove" @click="removePick(side, i)">×</button>
        </div>
        <button type="button" class="chip-btn" @click="addPick(side)">{{ side === 'pick' ? '+ Pick' : '+ Alternative pick' }}</button>
      </div>
    </template>
    <div class="trait-row">
      <label class="small">Max score <input type="number" min="1" max="30" class="effect-value" :value="b.max ?? ''" placeholder="—" @change="put({ max: num($event) || undefined })" /></label>
      <input class="ab-note" :value="b.note ?? ''" placeholder="Note (optional)" @change="put({ note: ($event.target as HTMLInputElement).value })" />
    </div>
    <p v-if="text" class="muted small ab-preview">{{ text }} · not added to sheets on its own</p>
  </div>
</template>
