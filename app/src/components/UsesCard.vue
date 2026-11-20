<script setup lang="ts">
// On the play sheet, beside hit points and hit dice: every limited use the character has from their classes, species,
// background and feats (Second Wind, Rage, Breath Weapon…), one row each with its pips (or − / ＋ for a pool), so the
// table doesn't have to scroll to the features to tick one off. Rests give them back.
import { computed } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { editSheet } from '../sheet'
import { state } from '../store'
import { sourceTag, speciesTraits, spendUse, usesLeft, usesMax, type ActiveTrait } from '../species'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const ro = computed(() => !!state.readOnly)
const rows = computed(() => speciesTraits(props.pc, props.s).filter(a => a.active && usesMax(props.pc, a, props.s) > 0))
const max = (a: ActiveTrait) => usesMax(props.pc, a, props.s)
const left = (a: ActiveTrait) => usesLeft(props.pc, props.s, a)
const use = (a: ActiveTrait, n: number) => { if (!ro.value) editSheet(props.pc, x => spendUse(x, props.pc, a, n)) }
const back = (a: ActiveTrait) => (a.trait.uses!.recharge === 'short' ? 'short rest' : a.trait.uses!.shortBack ? `long rest (${a.trait.uses!.shortBack} on a short)` : 'long rest')
</script>

<template>
  <div v-if="rows.length" class="cs-hp cs-uses">
    <span class="cs-label">Uses</span>
    <div v-for="a in rows" :key="a.key" class="cs-use" :title="`${a.trait.name} (${sourceTag(a)}): back on a ${back(a)}`">
      <span class="cs-use-name">{{ a.trait.name }}</span>
      <span class="sp-uses">
        <template v-if="max(a) <= 10">
          <button v-for="p in max(a)" :key="p" class="pip" :class="{ on: p <= left(a) }" :disabled="ro" :title="p <= left(a) ? 'Use it' : 'Get it back'" @click="use(a, p <= left(a) ? 1 : -1)" />
        </template>
        <template v-else>
          <button class="chip-btn" :disabled="ro || !left(a)" title="Use one" @click="use(a, 1)">−</button>
          <button class="chip-btn" :disabled="ro || left(a) >= max(a)" title="Get one back" @click="use(a, -1)">＋</button>
        </template>
        <span v-flash="left(a)" class="muted small">{{ left(a) }}/{{ max(a) }} · {{ a.trait.uses!.recharge === 'short' ? 'S' : 'L' }}</span>
      </span>
    </div>
  </div>
</template>
