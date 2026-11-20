<script setup lang="ts">
// What a species trait (or one of its options) does, as chips: effects, granted proficiencies and languages, spells,
// uses per rest. Shown on the race's page, the Species card and the trait editor.
import { computed } from 'vue'
import type { Trait, TraitOption } from '../model/types'
import { describeEffect } from '../gear'
import { grantLabel, spellLabel, usesLabel, GRANT_KINDS } from '../species'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ t: Trait | TraitOption; noGrants?: boolean; noUses?: boolean }>()
const trait = computed(() => props.t as Trait)
const kindLabel = (k: string) => GRANT_KINDS.find(g => g.id === k)?.label ?? k
</script>

<template>
  <span v-if="(t.effects?.length || (!noGrants && t.grants?.length) || t.spells?.length || (!noUses && trait.uses))" class="chips trait-chips">
    <span v-for="(f, i) in t.effects ?? []" :key="'e' + i" class="chip">{{ describeEffect(f) }}</span>
    <span v-for="(g, i) in noGrants ? [] : t.grants ?? []" :key="'g' + i" class="chip" :title="kindLabel(g.kind)">{{ g.kind === 'language' ? 'Speaks' : 'Proficient:' }} {{ grantLabel(g) }}</span>
    <span v-for="(x, i) in t.spells ?? []" :key="'s' + i" class="chip"><EntryLink :id="x.spell" /> <span class="muted small">{{ spellLabel(x).replace(/^[^(]*\(/, '(') }}</span></span>
    <span v-if="trait.uses && !noUses" class="chip">{{ usesLabel(trait) }}</span>
  </span>
</template>
