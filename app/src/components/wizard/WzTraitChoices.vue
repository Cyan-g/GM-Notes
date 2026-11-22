<script setup lang="ts">
// What the species' traits (which="species"), the subrace's ("subrace") or the background's and its Origin feat's
// ("background") ask the player to choose in the wizard: a skill, a language, a cantrip, the ability their spells use.
import Dropdown from '../Dropdown.vue'
import { computed } from 'vue'
import { ownedSpells, wizard } from '../../wizard'
import { ABILITY_NAME } from '../../model/dnd'
import { choiceOpen, isClassOrigin, setCastAbility, sourceTag, speciesTraits, type ActiveTrait } from '../../species'
import { renderInline } from '../../markdown'
import { useDraft } from '../../composables/useDraft'
import { inputValue as val } from '../../dom'
import TraitChoicePicker from '../TraitChoicePicker.vue'
import MarkdownView from '../MarkdownView.vue'

const props = defineProps<{ which: 'species' | 'subrace' | 'background' }>()
const { d, pc } = useDraft()
const choices = computed(() => speciesTraits(pc.value).filter(a => !isClassOrigin(a.race) && a.active && (a.trait.choice || a.trait.castWith?.among?.length)
  && (a.race.type !== 'race' ? 'background' : a.race.fields.parent ? 'subrace' : 'species') === props.which))
function setPicks(a: ActiveTrait, picks: string[]) {
  const all = { ...(wizard.d.species.picks ?? {}) }
  if (picks.filter(Boolean).length) all[a.key] = picks.filter(Boolean); else delete all[a.key]
  wizard.d.species = { ...wizard.d.species, picks: all }
}
/** Pick the ability a trait's spells are cast with (Elven Lineage: Int, Wis or Cha). */
const setCast = (a: ActiveTrait, ab: string) => { const holder = { species: { ...wizard.d.species } } as Parameters<typeof setCastAbility>[0]; setCastAbility(holder, a.key, ab as Parameters<typeof setCastAbility>[2]); wizard.d.species = holder.species! }
</script>

<template>
  <div v-for="a in choices" :key="a.key" class="wz-choice" :class="{ open: choiceOpen(a) }">
    <b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ sourceTag(a) }}</span>
    <details v-if="(a.trait.text ?? '').length > 220" class="small wz-rules"><summary>Rules</summary><MarkdownView :source="a.trait.text!" /></details>
    <p v-else-if="a.trait.text" class="small md" v-html="renderInline(a.trait.text)" />
    <TraitChoicePicker v-if="a.trait.choice" :a="a" :owned="a.trait.choice.kind === 'spell' ? ownedSpells(d, { skip: a.key, withClass: true }) : undefined" @pick="p => setPicks(a, p)" />
    <label v-if="a.trait.castWith?.among?.length" class="small wz-cast">Casts its spells with
      <Dropdown :value="a.cast ?? ''" @change="setCast(a, val($event))">
        <option value="">Choose…</option>
        <option v-for="ab in a.trait.castWith.among" :key="ab" :value="ab">{{ ABILITY_NAME[ab] }}</option>
      </Dropdown>
    </label>
  </div>
</template>
