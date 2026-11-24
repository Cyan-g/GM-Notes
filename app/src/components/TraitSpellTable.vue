<script setup lang="ts">
// A feature's spells as a table with a row per level (Fiend Spells, an expanded spell list): on the feature's page
// (TraitList) and, compact, on its folded card in the editor (TraitsInput). Rows come from traitSpells.ts.
import { computed } from 'vue'
import type { TraitSpell } from '../model/types'
import { HOW_SPECIES } from '../species'
import { sharedOf, spellsByLevel } from '../traitSpells'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ spells: TraitSpell[]; traitLevel: number; /** "Warlock level". */ levelWord: string; /** Smaller, for a folded card. */ compact?: boolean }>()
const rows = computed(() => spellsByLevel(props.spells, props.traitLevel))
/** How the listed spells are gained, when they're all gained the same way. */
const how = computed(() => { const h = sharedOf(props.spells, 'how'); return h && h !== 'mixed' ? HOW_SPECIES[h as TraitSpell['how']] : '' })
</script>

<template>
  <table class="grid trait-spells" :class="{ compact }">
    <thead><tr><th>{{ levelWord }}</th><th>Spells<span v-if="how" class="muted small"> ({{ how }})</span></th></tr></thead>
    <tbody><tr v-for="[l, list] in rows" :key="l"><td>{{ l }}</td><td><template v-for="({ x }, k) in list" :key="x.spell"><template v-if="k">, </template><EntryLink :id="x.spell" /></template></td></tr></tbody>
  </table>
</template>
