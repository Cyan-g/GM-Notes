<script setup lang="ts">
// The choices a character's classes, species, background and feats ask for that are still to make (Fighting Style,
// Expertise, invocations, a lineage, skills, a casting ability…), with how many picks are left: in the level-up dialog
// and the sheet's "to pick" window. On the Edit page each is made in its own Features & traits line (FeatureList).
import { computed } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { choiceOpen, hasChoices, isClassOrigin, picksLeft, sourceTag, speciesTraits, subsOf, type ActiveTrait } from '../species'
import TraitChoiceBlock from './TraitChoiceBlock.vue'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const traits = computed(() => speciesTraits(props.pc, props.s).filter(a => a.active))
/** The choices a trait's picked options bring (Agonizing Blast's cantrip): made under that option, not on their own. */
const subs = (a: ActiveTrait) => subsOf(traits.value, a)
/** A trait's own picks and its options' still to make. */
const openAll = (a: ActiveTrait) => choiceOpen(a) || subs(a).some(choiceOpen)
const leftAll = (a: ActiveTrait) => picksLeft(a) + subs(a).reduce((n, x) => n + picksLeft(x), 0)
const ordered = (l: ActiveTrait[]) => [...l.filter(a => isClassOrigin(a.race)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1)), ...l.filter(a => !isClassOrigin(a.race))]
// the open ones as they were when shown: one stays while its picks are made (it doesn't vanish mid-pick)
const shownOpen = new Set<string>(traits.value.filter(a => !a.parent && hasChoices(a) && openAll(a)).map(a => a.key))
const list = computed(() => ordered(traits.value.filter(a => !a.parent && hasChoices(a) && (openAll(a) || shownOpen.has(a.key)))))
const left = computed(() => list.value.reduce((n, a) => n + leftAll(a), 0))
</script>

<template>
  <section v-if="list.length" class="feature-choices">
    <p class="small muted">{{ left ? `${left} pick${left === 1 ? '' : 's'} to make.` : 'All made.' }}</p>
    <div v-for="a in list" :key="a.key" class="sp-trait" :class="{ 'sp-pending': openAll(a) }">
      <div class="sp-head"><b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ sourceTag(a) }}</span>
        <span v-if="leftAll(a)" class="sp-open small">{{ leftAll(a) }} to pick</span></div>
      <TraitChoiceBlock :pc="pc" :s="s" :a="a" :subs="subs(a)" />
    </div>
  </section>
</template>
