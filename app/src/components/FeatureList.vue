<script setup lang="ts">
// What a character can do, as one list on their sheet's Features & traits card in play (species.ts): the features of
// their classes and subclasses by level, their species' and background's traits, the Origin feat, the features typed
// on the sheet, and what their gear adds. Only what's used or read here is listed (shownInPlay): a trait that only gives
// proficiencies, spells or numbers the sheet already shows is left out. Picked options (invocations, Metamagic) and
// feats (a Fighting Style) are lines of their own. Each line names its source as a tag and folds its text away; use
// pips (or − / ＋ for a pool), scaling values stay on the line. Choices are made on the Edit page, not here.
import { computed } from 'vue'
import type { CharacterSheet, Entry, Feature, TraitOption } from '../model/types'
import { editSheet } from '../sheet'
import { get, state } from '../store'
import { hrefEntry } from '../router'
import {
  backgroundOf, choiceCandidates, choiceOpen, isClassOrigin, scaleAt, shownInPlay, speciesTraits, spendUse, usesLeft, usesMax,
  type ActiveTrait,
} from '../species'
import EntryLink from './EntryLink.vue'
import ConditionIcon from './ConditionIcon.vue'
import MarkdownView from './MarkdownView.vue'
import TraitChips from './TraitChips.vue'

interface GearLine { text: string; from: string }
const props = defineProps<{ pc: Entry; s: CharacterSheet; gear: { senses: { sense: string; range: number; from: string }[]; resistances: { type: string; from: string }[]; immunities: { condition: string; from: string }[]; features: GearLine[] } }>()
const ro = computed(() => !!state.readOnly)
const all = computed(() => speciesTraits(props.pc, props.s))
/** A trait whose picks are what's used (invocations, a Fighting Style feat): once picked, its picks are listed instead. */
const replacedByPicks = (a: ActiveTrait) => !a.trait.uses && !a.trait.scale && a.trait.onSheet !== 'show'
  && (a.trait.choice?.kind === 'option' || a.trait.choice?.kind === 'feat') && a.picks.length > 0
type Line = { kind: 'trait'; a: ActiveTrait } | { kind: 'option'; a: ActiveTrait; o: TraitOption } | { kind: 'feat'; a: ActiveTrait; id: string }
/** Class features by level (then by class), then species traits, then the background's; each followed by its picks. */
const lines = computed<Line[]>(() => {
  const now = all.value.filter(a => a.active && (shownInPlay(a) || choiceOpen(a)))
  const cls = now.filter(a => isClassOrigin(a.race)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1))
  return [...cls, ...now.filter(a => a.race.type === 'race'), ...now.filter(a => a.race.type === 'background')].flatMap(a => [
    ...(replacedByPicks(a) && !choiceOpen(a) ? [] : [{ kind: 'trait' as const, a }]),
    ...a.options.map(o => ({ kind: 'option' as const, a, o })),
    ...(a.trait.choice?.kind === 'feat' ? a.picks.filter(id => get(id)).map(id => ({ kind: 'feat' as const, a, id })) : []),
  ])
})
const later = computed(() => all.value.filter(a => !a.active && isClassOrigin(a.race) && shownInPlay(a)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1)))
const bg = computed(() => backgroundOf(props.pc))
/** The background's Origin feat, unless the sheet lists it already (the creation wizard writes it there). */
const originFeat = computed(() => {
  const f = get(bg.value?.fields.originFeat)
  return f && !props.s.features.some(x => x.name.toLowerCase().startsWith(f.name.toLowerCase())) ? f : undefined
})
const use = (a: ActiveTrait, n: number) => { if (!ro.value) editSheet(props.pc, x => spendUse(x, props.pc, a, n)) }
const max = (a: ActiveTrait) => usesMax(props.pc, a, props.s)
const left = (a: ActiveTrait) => usesLeft(props.pc, props.s, a)
/** The source tag: the class (with its level) or subclass, the race, the background. */
const tag = (a: ActiveTrait) => (a.race.type === 'class' ? `${a.race.name} ${a.trait.level ?? 1}` : a.race.name)
/** Weapons to master and other plain picks, by name. */
const pickNames = (a: ActiveTrait) => (a.trait.choice && a.trait.choice.kind === 'mastery'
  ? a.picks.map(id => choiceCandidates(a.trait.choice!).find(o => o.id === id)?.label ?? id) : [])
const own = (f: Feature) => f.text?.trim()
/** A text without the SRD's source line (it's for the entry's page, not the sheet). */
const clean = (t: unknown) => String(t ?? '').replace(/\s*\*?Source: System Reference Document[^*]*\*?\s*$/i, '').trim()
const empty = computed(() => !lines.value.length && !originFeat.value && !props.s.features.length && !props.gear.senses.length
  && !props.gear.resistances.length && !props.gear.immunities.length && !props.gear.features.length)
</script>

<template>
  <div class="feature-list">
    <template v-for="l in lines" :key="l.kind === 'trait' ? l.a.key : l.kind === 'option' ? `${l.a.key}.${l.o.id}` : `${l.a.key}.${l.id}`">
      <!-- a feature or trait -->
      <div v-if="l.kind === 'trait'" class="sp-trait" :class="{ 'sp-pending': choiceOpen(l.a) }">
        <details class="sp-fold">
          <summary class="sp-head">
            <b>{{ l.a.trait.name }}</b>
            <span class="feat-tag" :class="'tag-' + l.a.race.type" :title="`From ${l.a.race.name}`">{{ tag(l.a) }}</span>
            <span v-if="scaleAt(l.a)" class="chip sp-scale">{{ l.a.trait.scale!.label }} {{ scaleAt(l.a) }}</span>
            <span v-if="pickNames(l.a).length" class="muted small">{{ pickNames(l.a).join(', ') }}</span>
            <a v-if="choiceOpen(l.a) && !ro" class="sp-open small" :href="hrefEntry(pc.id, true)" title="Choose on the Edit page" @click.stop>to choose ✎</a>
            <span v-if="max(l.a)" class="sp-uses" :title="`Uses; back on a ${l.a.trait.uses!.recharge} rest${l.a.trait.uses!.shortBack ? `, ${l.a.trait.uses!.shortBack} on a short rest` : ''}`" @click.stop.prevent>
              <template v-if="max(l.a) <= 10">
                <button v-for="p in max(l.a)" :key="p" class="pip" :class="{ on: p <= left(l.a) }" :disabled="ro"
                        :title="p <= left(l.a) ? 'Use it' : 'Get it back'" @click="use(l.a, p <= left(l.a) ? 1 : -1)" />
              </template>
              <template v-else>
                <button class="chip-btn" :disabled="ro || !left(l.a)" title="Use one" @click="use(l.a, 1)">−</button>
                <button class="chip-btn" :disabled="ro || left(l.a) >= max(l.a)" title="Get one back" @click="use(l.a, -1)">＋</button>
              </template>
              <span v-flash="left(l.a)" class="muted small">{{ left(l.a) }}/{{ max(l.a) }} · {{ l.a.trait.uses!.recharge }} rest</span>
            </span>
          </summary>
          <MarkdownView v-if="l.a.trait.text" class="small sp-text" :source="l.a.trait.text" />
          <TraitChips :t="l.a.trait" no-uses />
        </details>
      </div>
      <!-- a picked option (an invocation, a Metamagic option, a lineage…) -->
      <div v-else-if="l.kind === 'option'" class="sp-trait">
        <details class="sp-fold">
          <summary class="sp-head"><b>{{ l.o.name }}</b>
            <span class="feat-tag" :class="'tag-' + l.a.race.type" :title="`Picked in ${l.a.trait.name}, from ${l.a.race.name}`">{{ l.a.trait.name }}</span></summary>
          <MarkdownView v-if="l.o.text" class="small sp-text" :source="l.o.text" />
          <TraitChips :t="l.o" />
        </details>
      </div>
      <!-- a picked feat (a Fighting Style) -->
      <div v-else class="sp-trait">
        <details class="sp-fold">
          <summary class="sp-head"><b><EntryLink :id="l.id" /></b>
            <span class="feat-tag" :class="'tag-' + l.a.race.type" :title="`Picked in ${l.a.trait.name}, from ${l.a.race.name}`">{{ l.a.trait.name }}</span></summary>
          <MarkdownView v-if="get(l.id)?.fields.summary" class="small sp-text" :source="clean(get(l.id)?.fields.summary)" />
        </details>
      </div>
    </template>

    <!-- the background's Origin feat -->
    <div v-if="originFeat && bg" class="sp-trait">
      <details class="sp-fold">
        <summary class="sp-head"><b><EntryLink :id="originFeat.id" /></b><template v-if="bg.fields.originFeatNote"> <span class="muted small">({{ bg.fields.originFeatNote }})</span></template>
          <span class="feat-tag tag-background">{{ bg.name }}</span></summary>
        <MarkdownView v-if="originFeat.fields.summary" class="small sp-text" :source="clean(originFeat.fields.summary)" />
      </details>
    </div>

    <!-- typed on the sheet (feats, homebrew) -->
    <div v-for="(f, i) in s.features" :key="'own' + i" class="sp-trait">
      <details v-if="own(f)" class="sp-fold">
        <summary class="sp-head"><b>{{ f.name }}</b> <span class="feat-tag tag-own">sheet</span></summary>
        <MarkdownView class="small sp-text" :source="clean(f.text)" />
      </details>
      <div v-else class="sp-head"><b>{{ f.name }}</b> <span class="feat-tag tag-own">sheet</span></div>
    </div>

    <!-- what the gear adds -->
    <div v-for="(r, i) in gear.senses" :key="'s' + i" class="sp-trait sp-head"><b>{{ r.sense }} {{ r.range }} ft</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(r, i) in gear.resistances" :key="'r' + i" class="sp-trait sp-head"><b>Resistance: {{ r.type.toLowerCase() }}</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(r, i) in gear.immunities" :key="'i' + i" class="sp-trait sp-head"><b><ConditionIcon :name="r.condition" /> Immune: {{ r.condition.toLowerCase() }}</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(f, i) in gear.features" :key="'f' + i" class="sp-trait sp-head"><b>{{ f.text }}</b> <span class="feat-tag tag-gear">{{ f.from }}</span></div>

    <p v-if="empty" class="muted small">Nothing yet: features come from the character's classes, species and background; feats and anything else are added with ✎ Edit.</p>

    <!-- still to come -->
    <details v-if="later.length" class="sp-later small">
      <summary class="muted">Later: {{ later.map(a => `${a.trait.name} (${a.race.name} ${a.trait.level})`).join(', ') }}</summary>
      <div v-for="a in later" :key="a.key" class="sp-trait dim">
        <b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ a.race.name }} {{ a.trait.level }}</span>
        <MarkdownView v-if="a.trait.text" class="small" :source="a.trait.text" />
      </div>
    </details>
  </div>
</template>
