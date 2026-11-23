<script setup lang="ts">
// What the species' traits (which="species"), the subrace's ("subrace"), the background's ("background") or one feat's
// ("feat": the feat `feat`, taken by `via`) ask the player to choose in the wizard: a skill, a language, a cantrip,
// the ability their spells use. A feat's choices, and a trait's choice of a feat (Versatile), are made in the Feats
// step: the other steps point there.
import Dropdown from '../Dropdown.vue'
import { computed } from 'vue'
import { draftHave, ownedSpells, wizard } from '../../wizard'
import { ABILITY_NAME } from '../../model/dnd'
import { get } from '../../store'
import { choiceOpen, isClassOrigin, setCastAbility, sourceTag, speciesTraits, takenByOthers, type ActiveTrait } from '../../species'
import { renderInline } from '../../markdown'
import { useDraft } from '../../composables/useDraft'
import { useDraftSheet } from '../../composables/useDraftSheet'
import { skillSources } from '../../species'
import { inputValue as val } from '../../dom'
import TraitChoicePicker from '../TraitChoicePicker.vue'
import MarkdownView from '../MarkdownView.vue'

const props = defineProps<{ which: 'species' | 'subrace' | 'background' | 'feat'; feat?: string; via?: string }>()
const { d, pc } = useDraft()
// the skill grid of a skill choice: the character as the sheet will be, and where its skills come from
const draftNow = useDraftSheet()
const sources = computed(() => skillSources(draftNow.pc.value, draftNow.sheet.value, get(draftNow.d.value.cls)?.name ?? 'the class'))
const all = computed(() => speciesTraits(pc.value))
const kindOf = (a: ActiveTrait) => (a.race.type !== 'race' ? 'background' : a.race.fields.parent ? 'subrace' : 'species')
const inFeats = (a: ActiveTrait) => a.race.type === 'feat' || a.trait.choice?.kind === 'feat'
const choices = computed(() => all.value.filter(a => !isClassOrigin(a.race) && a.active && (a.trait.choice || a.trait.castWith?.among?.length)
  && (props.which === 'feat' ? a.race.type === 'feat' && a.race.id === props.feat && (a.via ?? 'origin') === (props.via ?? 'origin') : !inFeats(a) && kindOf(a) === props.which)))
/** This step's traits that give a feat (Versatile): chosen in the Feats step. */
const featGivers = computed(() => props.which === 'feat' ? [] : all.value.filter(a => !isClassOrigin(a.race) && a.active && a.trait.choice?.kind === 'feat' && kindOf(a) === props.which))
const toFeats = (tab?: string) => { wizard.featTab = tab; wizard.step = 'feats' }
function setPicks(a: ActiveTrait, picks: string[]) {
  const all = { ...(wizard.d.species.picks ?? {}) }
  if (picks.filter(Boolean).length) all[a.key] = picks.filter(Boolean); else delete all[a.key]
  wizard.d.species = { ...wizard.d.species, picks: all }
}
/** Pick the ability a trait's spells are cast with (Elven Lineage: Int, Wis or Cha). */
const setCast = (a: ActiveTrait, ab: string) => { const holder = { species: { ...wizard.d.species } } as Parameters<typeof setCastAbility>[0]; setCastAbility(holder, a.key, ab as Parameters<typeof setCastAbility>[2]); wizard.d.species = holder.species! }
</script>

<template>
  <div v-for="a in choices" :key="a.key" class="wz-choice" :class="{ open: choiceOpen(a), 'wz-todo': choiceOpen(a) }" :data-left="choiceOpen(a) ? 'to pick' : undefined">
    <b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ sourceTag(a) }}</span>
    <details v-if="(a.trait.text ?? '').length > 220" class="small wz-rules"><summary>Rules</summary><MarkdownView :source="a.trait.text!" /></details>
    <p v-else-if="a.trait.text" class="small md" v-html="renderInline(a.trait.text)" />
    <TraitChoicePicker v-if="a.trait.choice" :a="a" :sheet="draftNow.sheet.value" :prof="draftNow.prof.value" :from="(x: string) => sources.get(x)" :taken="takenByOthers(all, a)" :have="draftHave(d)" :owned="a.trait.choice.kind === 'spell' ? ownedSpells(d, { skip: a.key, withClass: true }) : undefined" @pick="p => setPicks(a, p)" />
    <label v-if="a.trait.castWith?.among?.length" class="small wz-cast">Casts its spells with
      <Dropdown :value="a.cast ?? ''" @change="setCast(a, val($event))">
        <option value="">Choose…</option>
        <option v-for="ab in a.trait.castWith.among" :key="ab" :value="ab">{{ ABILITY_NAME[ab] }}</option>
      </Dropdown>
    </label>
  </div>
  <p v-for="a in featGivers" :key="a.key" class="small wz-feat-pointer" :class="{ 'wz-todo': choiceOpen(a) }">
    <b>{{ a.trait.name }}</b>: {{ a.picks.length ? `gives ${a.picks.map(id => get(id)?.name ?? id).join(', ')}` : 'gives a feat of your choice' }}, chosen and set up in the Feats step.
    <button type="button" class="link-btn" @click="toFeats(a.key)">Go to Feats →</button>
  </p>
</template>
