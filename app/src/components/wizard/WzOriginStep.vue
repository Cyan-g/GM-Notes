<script setup lang="ts">
// The wizard's species and background step: the species (and its subrace, when it has subraces), the size when it
// offers more than one, the background, and the choices their traits ask for.
import { computed } from 'vue'
import type { Entry } from '../../model/types'
import { ownedSpells, backgrounds, mainRace, species, subracesOf, wizard } from '../../wizard'
import { ABILITY_NAME } from '../../model/dnd'
import { choiceOpen, isClassOrigin, setCastAbility, sourceTag, speciesSizes, speciesTraits, type ActiveTrait } from '../../species'
import { traitsOf } from '../../model/traits'
import { get } from '../../store'
import { renderInline } from '../../markdown'
import { useDraft } from '../../composables/useDraft'
import { inputValue as val } from '../../dom'
import EntryLink from '../EntryLink.vue'
import TraitChoicePicker from '../TraitChoicePicker.vue'
import MarkdownView from '../MarkdownView.vue'
import WizardPage from '../WizardPage.vue'

const { d, pc } = useDraft()
const raceList = computed(() => species())
/** The main race picked, and its subraces (the character gets the subrace once one is picked). */
const main = computed(() => mainRace(d.value.race))
const subs = computed(() => subracesOf(main.value?.id))
/** The subrace picked (when the species has subraces). */
const subPicked = computed(() => (d.value.race && d.value.race !== main.value?.id ? get(d.value.race) : undefined))
/** A subrace's traits besides those it replaces. */
const ownTraits = (x: Entry) => traitsOf(x).filter(t => !t.replaces).length
/** A species' short line on its tile: its size and walking speed, and how many subraces it has. */
function raceLine(x: Entry): string {
  const sp = x.fields.speeds as { walk?: number } | undefined
  return [x.fields.size, sp?.walk != null && `${sp.walk} ft`, subracesOf(x.id).length && `${subracesOf(x.id).length} subraces`].filter(Boolean).join(' · ')
}
const sizes = computed(() => speciesSizes(pc.value))
const bgList = computed(() => backgrounds())
const choices = computed(() => speciesTraits(pc.value).filter(a => !isClassOrigin(a.race) && a.active && (a.trait.choice || a.trait.castWith?.among?.length)))
function setPicks(a: ActiveTrait, picks: string[]) {
  const all = { ...(wizard.d.species.picks ?? {}) }
  if (picks.filter(Boolean).length) all[a.key] = picks.filter(Boolean); else delete all[a.key]
  wizard.d.species = { ...wizard.d.species, picks: all }
}
/** Pick the ability a trait's spells are cast with (Elven Lineage: Int, Wis or Cha). */
const setCast = (a: ActiveTrait, ab: string) => { const holder = { species: { ...wizard.d.species } } as Parameters<typeof setCastAbility>[0]; setCastAbility(holder, a.key, ab as Parameters<typeof setCastAbility>[2]); wizard.d.species = holder.species! }
</script>

<template>
  <h3 class="wz-sub">Species</h3>
  <div class="wz-tiles">
    <button v-for="x in raceList" :key="x.id" type="button" class="wz-tile" :class="{ on: main?.id === x.id }" :aria-pressed="main?.id === x.id" @click="wizard.d.race = x.id">
      <b>{{ x.name }}</b><small class="muted">{{ raceLine(x) }}</small>
    </button>
  </div>
  <!-- a species with subraces: the subrace is its own choice, and needed -->
  <div v-if="subs.length" class="wz-subraces" :class="{ open: !subPicked }">
    <h3 class="wz-sub">{{ main?.name }}: pick a subrace <span v-if="!subPicked" class="wz-need small">needed</span></h3>
    <p class="muted small">Each {{ main?.name }} is one of these; the subrace adds its own traits to the {{ main?.name }}'s.</p>
    <div class="wz-tiles">
      <button v-for="x in subs" :key="x.id" type="button" class="wz-tile" :class="{ on: d.race === x.id }" :aria-pressed="d.race === x.id" @click="wizard.d.race = d.race === x.id ? main?.id : x.id">
        <b>{{ x.name }}</b><small class="muted">{{ ownTraits(x) ? `${ownTraits(x)} trait${ownTraits(x) === 1 ? '' : 's'} of its own` : 'no traits of its own' }}</small>
      </button>
    </div>
  </div>
  <div class="wz-row">
    <label v-if="sizes.length > 1">Size
      <select :value="d.size && sizes.includes(d.size) ? d.size : sizes[0]" @change="wizard.d.size = val($event)">
        <option v-for="z in sizes" :key="z" :value="z">{{ z }}</option>
      </select>
    </label>
    <label>Background
      <select :value="d.background ?? ''" @change="wizard.d.background = val($event) || undefined">
        <option value="">{{ bgList.length ? 'Choose…' : 'none in this world' }}</option>
        <option v-for="x in bgList" :key="x.id" :value="x.id">{{ x.name }}</option>
      </select>
    </label>
  </div>
  <!-- the species' page (and the subrace's), for its lore and traits -->
  <WizardPage v-if="main" :e="main" :title="`About the ${main.name}`" />
  <WizardPage v-if="subPicked" :e="subPicked" :title="`The ${subPicked.name}`" />
  <p v-if="d.background" class="small">
    <EntryLink :id="d.background" />: <template v-if="get(d.background)?.fields.originFeat">Origin feat <EntryLink :id="String(get(d.background)?.fields.originFeat)" /><template v-if="get(d.background)?.fields.originFeatNote"> ({{ get(d.background)?.fields.originFeatNote }})</template>; </template>
    skills {{ (get(d.background)?.fields.skillProfs ?? []).join(', ') || '—' }}
  </p>
  <div v-for="a in choices" :key="a.key" class="wz-choice" :class="{ open: choiceOpen(a) }">
    <b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ sourceTag(a) }}</span>
    <details v-if="(a.trait.text ?? '').length > 220" class="small wz-rules"><summary>Rules</summary><MarkdownView :source="a.trait.text!" /></details>
    <p v-else-if="a.trait.text" class="small md" v-html="renderInline(a.trait.text)" />
    <TraitChoicePicker v-if="a.trait.choice" :a="a" :owned="a.trait.choice.kind === 'spell' ? ownedSpells(d, { skip: a.key, withClass: true }) : undefined" @pick="p => setPicks(a, p)" />
    <label v-if="a.trait.castWith?.among?.length" class="small wz-cast">Casts its spells with
      <select :value="a.cast ?? ''" @change="setCast(a, val($event))">
        <option value="">Choose…</option>
        <option v-for="ab in a.trait.castWith.among" :key="ab" :value="ab">{{ ABILITY_NAME[ab] }}</option>
      </select>
    </label>
  </div>
</template>
