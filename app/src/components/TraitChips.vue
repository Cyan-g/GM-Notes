<script setup lang="ts">
// What a species trait (or one of its options) does, as chips: effects, granted proficiencies and languages, spells,
// uses per rest. Shown on the race's page, the Species card and the trait editor.
import { computed } from 'vue'
import type { Trait, TraitOption, TraitSpell } from '../model/types'
import { describeEffects } from '../effects'
import { grantLabel, spellLabel, usesLabel, GRANT_KINDS, HOW_SPECIES } from '../species'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ t: Trait | TraitOption; noGrants?: boolean; noUses?: boolean; /** Its spells are shown elsewhere (a table by level). */ noSpells?: boolean; /** On a sheet: the level that counts, so a spell already reached doesn't say "from level N". */ reached?: number }>()
/** How a spell is cast, in brackets; its level only while it's still ahead. */
const how = (x: TraitSpell) => ((x.from ?? 1) <= (props.reached ?? 0) ? `(${HOW_SPECIES[x.how]})` : spellLabel(x).replace(/^[^(]*\(/, '('))
const trait = computed(() => props.t as Trait)
const kindLabel = (k: string) => GRANT_KINDS.find(g => g.id === k)?.label ?? k
</script>

<template>
  <span v-if="(t.effects?.length || (!noGrants && t.grants?.length) || (!noSpells && t.spells?.length) || (!noUses && trait.uses))" class="chips trait-chips">
    <span v-for="(f, i) in describeEffects(t.effects ?? [])" :key="'e' + i" class="chip">{{ f }}</span>
    <span v-for="(g, i) in noGrants ? [] : t.grants ?? []" :key="'g' + i" class="chip" :title="kindLabel(g.kind)">{{ g.kind === 'language' ? 'Speaks' : 'Proficient:' }} {{ grantLabel(g) }}</span>
    <span v-for="(x, i) in noSpells ? [] : t.spells ?? []" :key="'s' + i" class="chip"><EntryLink :id="x.spell" /> <span class="muted small">{{ how(x) }}<template v-if="x.swap"> · swappable{{ x.swap.classes?.length ? ` from the ${x.swap.classes.join(' or ')} list` : '' }}</template></span></span>
    <span v-if="trait.uses && !noUses" class="chip">{{ usesLabel(trait) }}</span>
  </span>
</template>
