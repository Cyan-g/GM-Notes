<script setup lang="ts">
// What a character can do, as one list on their sheet's Features & traits card in play (species.ts): the features of
// their classes and subclasses by level, their species' and background's traits, the Origin feat, the features typed
// on the sheet, and what their gear adds. Only what's used or read here is listed (shownInPlay): a trait that only gives
// proficiencies, spells or numbers the sheet already shows is left out. Picked options (invocations, Metamagic) and
// feats (a Fighting Style) are lines of their own. Each line names its source as a tag and folds its text away; use
// pips (or − / ＋ for a pool), scaling values stay on the line. Choices are made on the Edit page, not here.
import { useReadOnly } from '../composables/useReadOnly'
import { computed, ref } from 'vue'
import ChoicesModal from './ChoicesModal.vue'
import type { CharacterSheet, Entry, Feature, TraitOption } from '../model/types'
import { editSheet } from '../sheetData'
import { mod, profBonus } from '../model/dnd'
import { totalLevel } from '../model/classes'
import { noteUndo, restoreSheet, snapSheet } from '../undoNote'
import { score } from '../sheet'
import { get, state } from '../store'
import { hrefEntry } from '../router'
import { MASTERY_OF } from '../model/schema'
import { optionsIn } from '../model/lists'
import { ui } from '../ui'
import {
  backgroundOf, choiceCandidates, choiceOpen, featOfFeature, isOn, levelTag, picksLeft, sourceTag, toggleOn, isClassOrigin, scaleAt, shownInPlay,
  speciesTraits, spendUse, usesLeft, usesMax, useReminder, isPool, type ActiveTrait,
} from '../species'
import { traitsOf } from '../model/traits'
import EntryLink from './EntryLink.vue'
import ConditionIcon from './ConditionIcon.vue'
import MarkdownView from './MarkdownView.vue'
import TraitChips from './TraitChips.vue'

interface GearLine { text: string; from: string }
const props = defineProps<{ pc: Entry; s: CharacterSheet; gear: { senses: { sense: string; range: number; from: string }[]; resistances: { type: string; from: string }[]; immunities: { condition: string; from: string }[]; damageImmunities: { type: string; from: string }[]; features: GearLine[] } }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
const all = computed(() => speciesTraits(props.pc, props.s))
/** A trait whose picks are what's used (invocations, a Fighting Style feat): once picked, its picks are listed instead. */
const replacedByPicks = (a: ActiveTrait) => !a.trait.uses && !a.trait.scale && a.trait.onSheet !== 'show'
  && (a.trait.choice?.kind === 'option' || a.trait.choice?.kind === 'feat') && a.picks.length > 0
type Line = { kind: 'trait'; a: ActiveTrait } | { kind: 'option'; a: ActiveTrait; o: TraitOption } | { kind: 'feat'; a: ActiveTrait; id: string }
/** Class features by level (then by class), then species traits, then the background's; each followed by its picks. */
const lines = computed<Line[]>(() => {
  const now = all.value.filter(a => a.active && (shownInPlay(a) || choiceOpen(a)))
  const cls = now.filter(a => isClassOrigin(a.race)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1))
  return [...cls, ...now.filter(a => a.race.type === 'race'), ...now.filter(a => a.race.type === 'background'), ...now.filter(a => a.race.type === 'feat'), ...now.filter(a => a.race.type === 'item')].flatMap(a => [
    ...(replacedByPicks(a) && !choiceOpen(a) ? [] : [{ kind: 'trait' as const, a }]),
    ...a.options.map(o => ({ kind: 'option' as const, a, o })),
    // a picked feat with features of its own is listed by them instead
    ...(a.trait.choice?.kind === 'feat' ? a.picks.filter(id => get(id) && !live(get(id))).map(id => ({ kind: 'feat' as const, a, id })) : []),
  ])
})
const later = computed(() => all.value.filter(a => !a.active && isClassOrigin(a.race) && shownInPlay(a)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1)))
const bg = computed(() => backgroundOf(props.pc))
/** Whether a feat has features of its own (they're listed as lines, like a class's). */
const live = (f: Entry | undefined) => traitsOf(f).length > 0
/** The background's Origin feat, unless the sheet lists it already (the creation wizard writes it there) or its features are listed. */
const originFeat = computed(() => {
  const f = get(bg.value?.fields.originFeat)
  return f && !live(f) && !props.s.features.some(x => x.name.toLowerCase().startsWith(f.name.toLowerCase())) ? f : undefined
})
/** The sheet's feature lines, but for feats whose features are listed. */
const ownFeatures = computed(() => props.s.features.filter(f => f.name.trim() && !live(featOfFeature(f))))
/** The "to pick" window. */
const choosing = ref(false)
// switching a feature with uses on spends one (entering a Rage), and the note says how many are left, with Undo
function flip(a: ActiveTrait) {
  if (ro.value) return
  const turningOn = !isOn(a, props.s), spends = turningOn && !!a.trait.uses
  const before = spends ? snapSheet(props.pc) : undefined, had = left(a)
  editSheet(props.pc, x => { toggleOn(x, a.key); if (spends && had > 0) spendUse(x, props.pc, a, 1, score) })
  if (spends) noteUndo(had > 0 ? `${a.trait.name} on: ${had - 1} of ${max(a)} use${max(a) === 1 ? '' : 's'} left` : `${a.trait.name} on, with no uses left`, restoreSheet(props.pc, before))
}
// spending one says what the feature does, with Undo (as on the Uses card)
function use(a: ActiveTrait, n: number) {
  if (ro.value) return
  const before = snapSheet(props.pc)
  editSheet(props.pc, x => spendUse(x, props.pc, a, n, score))
  if (n > 0 && !isPool(a)) noteUndo(useReminder(a), restoreSheet(props.pc, before))
}
const max = (a: ActiveTrait) => usesMax(props.pc, a, props.s, score)
/** The save DC a feature shows (Monk's Focus, Cunning Strike): 8 + proficiency bonus + the ability's modifier. */
const dcOf = (a: ActiveTrait) => 8 + profBonus(totalLevel(props.pc)) + mod(score(props.s, a.trait.dc!))
const left = (a: ActiveTrait) => usesLeft(props.pc, props.s, a, score)
/** The source tag: the class (with its level) or subclass, the race, the background. */
const tag = sourceTag
/** Weapons to master and other plain picks, by name. */
const pickNames = (a: ActiveTrait) => (a.trait.choice && a.trait.choice.kind === 'mastery'
  ? a.picks.map(id => `${choiceCandidates(a.trait.choice!).find(o => o.id === id)?.label ?? id}${MASTERY_OF[id] ? ` (${MASTERY_OF[id]})` : ''}`) : [])
/** The masteries of the weapons picked to master, with their rules (the Lists page's notes). */
const masteries = (a: ActiveTrait) => (a.trait.choice?.kind === 'mastery'
  ? [...new Set(a.picks.map(id => MASTERY_OF[id]).filter(Boolean))].map(m => ({ name: m, rule: optionsIn(state.db?.meta, 'weaponMastery').find(o => o.id === m)?.note }))
  : [])
const own = (f: Feature) => f.text?.trim()
/** A text without the SRD's source line (it's for the entry's page, not the sheet). */
const clean = (t: unknown) => String(t ?? '').replace(/\s*\*?Source: System Reference Document[^*]*\*?\s*$/i, '').trim()
const empty = computed(() => !lines.value.length && !originFeat.value && !ownFeatures.value.length && !props.gear.senses.length
  && !props.gear.resistances.length && !props.gear.immunities.length && !props.gear.damageImmunities.length && !props.gear.features.length)
</script>

<template>
  <ChoicesModal v-if="choosing" :pc="pc" :s="s" @close="choosing = false" />
  <div class="feature-list">
    <template v-for="l in lines" :key="l.kind === 'trait' ? l.a.key : l.kind === 'option' ? `${l.a.key}.${l.o.id}` : `${l.a.key}.${l.id}`">
      <!-- a feature or trait -->
      <div v-if="l.kind === 'trait'" class="sp-trait" :class="{ 'sp-pending': choiceOpen(l.a) }">
        <details class="sp-fold">
          <summary class="sp-head">
            <b>{{ l.a.trait.name }}</b>
            <span class="feat-tag" :class="'tag-' + l.a.race.type" :title="`From ${l.a.race.name}`">{{ tag(l.a) }}</span>
            <span v-if="scaleAt(l.a)" class="chip sp-scale">{{ l.a.trait.scale!.label }} {{ scaleAt(l.a) }}</span>
            <span v-if="l.a.trait.dc" class="chip sp-scale" :title="`8 + proficiency bonus + ${l.a.trait.dc.toUpperCase()} modifier`">DC {{ dcOf(l.a) }}</span>
            <button v-if="l.a.trait.toggle" class="chip-btn sbk-on" :class="{ on: isOn(l.a, s) }" :aria-pressed="isOn(l.a, s)" :disabled="ro" :title="isOn(l.a, s) ? 'On: its effects count on the sheet. Click to end it' : 'Switch it on: its effects count on the sheet until you end it or take a long rest'" @click.stop.prevent="flip(l.a)">{{ isOn(l.a, s) ? 'On' : 'Off' }}</button>
            <span v-if="pickNames(l.a).length" class="muted small">{{ pickNames(l.a).join(', ') }}</span>
            <button v-if="choiceOpen(l.a) && !ro" type="button" class="link-btn sp-open small" title="Make the choice" @click.stop.prevent="choosing = true">{{ picksLeft(l.a) }} to pick ✎</button>
            <span v-if="max(l.a)" class="sp-uses" :title="`Uses; back on a ${l.a.trait.uses!.recharge} rest${l.a.trait.uses!.shortBack ? `, ${l.a.trait.uses!.shortBack} on a short rest` : ''}`" @click.stop.prevent>
              <template v-if="max(l.a) <= 10 && !isPool(l.a)">
                <button v-for="p in max(l.a)" :key="p" class="pip" :class="{ on: p <= left(l.a) }" :disabled="ro"
                        :title="p <= left(l.a) ? 'Use it' : 'Get it back'" @click="use(l.a, p <= left(l.a) ? 1 : -1)" />
              </template>
              <template v-else>
                <button class="chip-btn" :disabled="ro || !left(l.a)" title="Use one" @click="use(l.a, 1)">−</button>
                <button class="chip-btn" :disabled="ro || left(l.a) >= max(l.a)" title="Get one back" @click="use(l.a, -1)">＋</button>
              </template>
              <span v-flash="left(l.a)" class="muted small">{{ left(l.a) }}/{{ max(l.a) }} · {{ l.a.trait.uses!.recharge === 'short' || (l.a.trait.uses!.shortFrom && l.a.level >= l.a.trait.uses!.shortFrom) ? 'short' : 'long' }} rest</span>
            </span>
          </summary>
          <MarkdownView v-if="l.a.trait.text" class="small sp-text" :source="l.a.trait.text" />
          <TraitChips :t="l.a.trait" no-uses :reached="l.a.level" />
          <ul v-if="masteries(l.a).length" class="small sp-masteries"><li v-for="m in masteries(l.a)" :key="m.name"><b>{{ m.name }}.</b> {{ m.rule }}</li></ul>
        </details>
      </div>
      <!-- a picked option (an invocation, a Metamagic option, a lineage…) -->
      <div v-else-if="l.kind === 'option'" class="sp-trait">
        <details class="sp-fold">
          <!-- a single pick reads as the feature with it ("Elemental Affinity (Fire)"); one of several by its own name -->
          <summary class="sp-head"><b>{{ (l.a.trait.choice?.count ?? 1) === 1 && !l.a.trait.choice?.steps?.length ? `${l.a.trait.name} (${l.o.name})` : l.o.name }}</b>
            <span class="feat-tag" :class="'tag-' + l.a.race.type" :title="`Picked in ${l.a.trait.name}, from ${l.a.race.name}`">{{ (l.a.trait.choice?.count ?? 1) === 1 && !l.a.trait.choice?.steps?.length ? sourceTag(l.a) : l.a.trait.name }}</span></summary>
          <MarkdownView v-if="l.o.text" class="small sp-text" :source="l.o.text" />
          <TraitChips :t="l.o" :reached="l.a.level" />
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
    <div v-for="(f, i) in ownFeatures" :key="'own' + i" class="sp-trait">
      <details v-if="own(f)" class="sp-fold">
        <summary class="sp-head"><b>{{ f.name }}</b> <span class="feat-tag tag-own">sheet</span></summary>
        <MarkdownView class="small sp-text" :source="clean(f.text)" />
      </details>
      <div v-else class="sp-head"><b>{{ f.name }}</b> <span class="feat-tag tag-own">sheet</span></div>
    </div>

    <!-- what the gear adds -->
    <div v-for="(r, i) in gear.senses" :key="'s' + i" class="sp-trait sp-head"><b>{{ r.sense }} {{ r.range }} ft</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(r, i) in gear.resistances" :key="'r' + i" class="sp-trait sp-head"><b>Resistance: {{ r.type.toLowerCase() }}</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(r, i) in gear.damageImmunities" :key="'d' + i" class="sp-trait sp-head"><b>Immune: {{ r.type.toLowerCase() }} damage</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(r, i) in gear.immunities" :key="'i' + i" class="sp-trait sp-head"><b><ConditionIcon :name="r.condition" /> Immune: {{ r.condition.toLowerCase() }}</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(f, i) in gear.features" :key="'f' + i" class="sp-trait sp-head"><b>{{ f.text }}</b> <span class="feat-tag tag-gear">{{ f.from }}</span></div>

    <p v-if="empty" class="muted small">Nothing yet: features come from the character's classes, species and background; feats and anything else are added with ✎ Edit.</p>

    <!-- still to come -->
    <details v-if="later.length" class="sp-later small">
      <summary class="muted">Later: {{ later.map(a => `${a.trait.name} at ${levelTag(a)}`).join(', ') }}</summary>
      <div v-for="a in later" :key="a.key" class="sp-trait dim">
        <b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ tag(a) }}</span>
        <MarkdownView v-if="a.trait.text" class="small" :source="a.trait.text" />
      </div>
    </details>
  </div>
</template>
