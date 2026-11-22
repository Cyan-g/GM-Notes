<script setup lang="ts">
// The wizard's class features step: what the class and subclass give at the chosen level, by where they come from,
// with the choices they ask for. Levelling bookkeeping (the Spellcasting rules) is one line at the end.
import { computed } from 'vue'
import { draftHave, ownedSpells, wizard } from '../../wizard'
import { choiceOpen, isClassOrigin, scaleAt, setPicks as setTraitPicks, speciesTraits, type ActiveTrait } from '../../species'
import { useDraft } from '../../composables/useDraft'
import EntryLink from '../EntryLink.vue'
import TraitChoicePicker from '../TraitChoicePicker.vue'
import MarkdownView from '../MarkdownView.vue'

const { d, pc } = useDraft()
/** The class's and subclass's features at the chosen level, by where they come from. */
const classFeatures = computed(() => speciesTraits(pc.value).filter(a => isClassOrigin(a.race) && a.active))
const featureGroups = computed(() => [...new Map(classFeatures.value.map(a => [a.race.id, a.race])).values()].map(r => ({ r, list: classFeatures.value.filter(a => a.race.id === r.id) })))
/** A feature that's only levelling bookkeeping (the Spellcasting rules, "Warlock Subclass"): folded into one line. */
const bookkeeping = (a: ActiveTrait) => a.trait.onSheet === 'hide' && !a.trait.choice
const pickFeature = (a: ActiveTrait, picks: string[]) => { const holder = { species: { ...wizard.d.species } } as Parameters<typeof setTraitPicks>[0]; setTraitPicks(holder, a.key, picks); wizard.d.species = holder.species! }
</script>

<template>
  <p class="muted small">What the class{{ d.subclass ? ' and subclass give' : ' gives' }} at level {{ d.level }}; the sheet keeps them up to date as the character levels up. Make the choices here or later on the sheet.</p>
  <template v-for="g in featureGroups" :key="g.r.id">
    <h3><EntryLink :id="g.r.id" /></h3>
    <div v-for="a in g.list.filter(x => !bookkeeping(x))" :key="a.key" class="wz-feature" :class="{ open: choiceOpen(a) }">
      <details>
        <summary><b>{{ a.trait.name }}</b> <span class="muted small">level {{ a.trait.level ?? 1 }}</span>
          <span v-if="scaleAt(a)" class="chip">{{ a.trait.scale!.label }} {{ scaleAt(a) }}</span></summary>
        <MarkdownView v-if="a.trait.text" class="small" :source="a.trait.text" />
      </details>
      <TraitChoicePicker v-if="a.trait.choice" :a="a" :have="draftHave(d)" :owned="a.trait.choice.kind === 'spell' ? ownedSpells(d, { skip: a.key, withClass: true }) : undefined" @pick="p => pickFeature(a, p)" />
    </div>
    <p v-if="g.list.some(bookkeeping)" class="muted small">Also at this level (worked out by the sheet and the Spellbook): {{ g.list.filter(bookkeeping).map(a => a.trait.name).join(', ') }}.</p>
  </template>
</template>
