<script setup lang="ts">
// Everything a character can do, as one list on their sheet's Features & traits card (species.ts): the features of
// their classes and subclasses by level, their species' traits, their background's (and its Origin feat), the features
// typed on the sheet, and what their gear adds. Each line names its source as a tag and folds its text away; use pips
// (or − / ＋ for a pool such as Lay on Hands), scaling values and open choices stay on the line. Granted proficiencies
// are dropdowns the player can swap; choices are picked here. Class features still to come are listed at the end.
import { computed } from 'vue'
import type { CharacterSheet, Entry, Feature, TraitGrant } from '../model/types'
import { editSheet } from '../sheet'
import { get, state } from '../store'
import {
  backgroundOf, choiceOpen, grantOptions, isClassOrigin, scaleAt, setPicks, setSwap, speciesTraits, spendUse, traitGrants,
  usesLeft, usesMax, GRANT_KINDS, type ActiveTrait,
} from '../species'
import EntryLink from './EntryLink.vue'
import ConditionIcon from './ConditionIcon.vue'
import MarkdownView from './MarkdownView.vue'
import TraitChips from './TraitChips.vue'
import TraitChoicePicker from './TraitChoicePicker.vue'

interface GearLine { text: string; from: string }
const props = defineProps<{ pc: Entry; s: CharacterSheet; gear: { senses: { sense: string; range: number; from: string }[]; resistances: { type: string; from: string }[]; immunities: { condition: string; from: string }[]; features: GearLine[] } }>()
const ro = computed(() => !!state.readOnly)
const all = computed(() => speciesTraits(props.pc, props.s))
/** Class features by level (then by class), then species traits, then the background's. */
const traits = computed(() => {
  const now = all.value.filter(a => a.active)
  const cls = now.filter(a => isClassOrigin(a.race)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1))
  return [...cls, ...now.filter(a => a.race.type === 'race'), ...now.filter(a => a.race.type === 'background')]
})
const later = computed(() => all.value.filter(a => !a.active && isClassOrigin(a.race)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1)))
const laterSpecies = computed(() => all.value.filter(a => !a.active && !isClassOrigin(a.race)))
const bg = computed(() => backgroundOf(props.pc))
/** The background's Origin feat, unless the sheet lists it already (the creation wizard writes it there). */
const originFeat = computed(() => {
  const f = get(bg.value?.fields.originFeat)
  return f && !props.s.features.some(x => x.name.toLowerCase().startsWith(f.name.toLowerCase())) ? f : undefined
})
const open = computed(() => traits.value.filter(choiceOpen).length)
defineExpose({ open })

function swapOptions(g: TraitGrant & { was?: string }) {
  const opts = grantOptions(g.kind)
  return [g.was ?? g.id, g.id].filter((id, i, l) => l.indexOf(id) === i && !opts.some(o => o.id === id)).map(id => ({ id, label: id })).concat(opts)
}
const swap = (key: string, id: string, original: string) => editSheet(props.pc, x => setSwap(x, key, id, original))
const pick = (a: ActiveTrait, picks: string[]) => editSheet(props.pc, x => setPicks(x, a.key, picks))
const use = (a: ActiveTrait, n: number) => { if (!ro.value) editSheet(props.pc, x => spendUse(x, props.pc, a, n)) }
const val = (ev: Event) => (ev.target as HTMLSelectElement).value
const kindName = (k: string) => GRANT_KINDS.find(x => x.id === k)?.label ?? k
const nameOf = (g: TraitGrant) => grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id
const max = (a: ActiveTrait) => usesMax(props.pc, a, props.s)
const left = (a: ActiveTrait) => usesLeft(props.pc, props.s, a)
/** The source tag: the class (with its level) or subclass, the race, the background. */
const tag = (a: ActiveTrait) => (a.race.type === 'class' ? `${a.race.name} ${a.trait.level ?? 1}` : a.race.name)
const own = (f: Feature) => f.text?.trim()
</script>

<template>
  <div class="feature-list">
    <!-- from classes, species and background -->
    <div v-for="a in traits" :key="a.key" class="sp-trait" :class="{ 'sp-pending': choiceOpen(a) }">
      <details class="sp-fold">
        <summary class="sp-head">
          <b>{{ a.trait.name }}</b>
          <span class="feat-tag" :class="'tag-' + a.race.type" :title="`From ${a.race.name}`">{{ tag(a) }}</span>
          <span v-if="scaleAt(a)" class="chip sp-scale">{{ a.trait.scale!.label }} {{ scaleAt(a) }}</span>
          <span v-if="choiceOpen(a)" class="sp-open small">to choose</span>
          <span v-if="max(a)" class="sp-uses" :title="`Uses; back on a ${a.trait.uses!.recharge} rest${a.trait.uses!.shortBack ? `, ${a.trait.uses!.shortBack} on a short rest` : ''}`" @click.stop.prevent>
            <template v-if="max(a) <= 10">
              <button v-for="p in max(a)" :key="p" class="pip" :class="{ on: p <= left(a) }" :disabled="ro"
                      :title="p <= left(a) ? 'Use it' : 'Get it back'" @click="use(a, p <= left(a) ? 1 : -1)" />
            </template>
            <template v-else>
              <button class="chip-btn" :disabled="ro || !left(a)" title="Use one" @click="use(a, 1)">−</button>
              <button class="chip-btn" :disabled="ro || left(a) >= max(a)" title="Get one back" @click="use(a, -1)">＋</button>
            </template>
            <span v-flash="left(a)" class="muted small">{{ left(a) }}/{{ max(a) }} · {{ a.trait.uses!.recharge }} rest</span>
          </span>
        </summary>
        <MarkdownView v-if="a.trait.text" class="small sp-text" :source="a.trait.text" />
        <TraitChips :t="a.trait" no-grants no-uses />
      </details>
      <!-- what it grants, each swappable for another of its kind -->
      <div v-if="traitGrants(a, s).length" class="sp-grants">
        <label v-for="gr in traitGrants(a, s)" :key="gr.key" class="sp-grant small" :class="{ swapped: gr.was }" :title="gr.was ? `Swapped; it gives ${nameOf({ kind: gr.kind, id: gr.was })}` : `${kindName(gr.kind)}; pick another to swap it`">
          <span class="muted">{{ gr.kind === 'language' ? 'Speaks' : kindName(gr.kind) }}</span>
          <select :value="gr.id" :disabled="ro" @change="swap(gr.key, val($event), gr.was ?? gr.id)">
            <option v-for="o in swapOptions(gr)" :key="o.id" :value="o.id">{{ o.label }}{{ o.id === (gr.was ?? gr.id) && gr.was ? ' (given)' : '' }}</option>
          </select>
        </label>
      </div>
      <TraitChoicePicker v-if="a.trait.choice" :a="a" :disabled="ro" @pick="p => pick(a, p)" />
    </div>

    <!-- the background's Origin feat -->
    <div v-if="originFeat && bg" class="sp-trait">
      <details class="sp-fold">
        <summary class="sp-head"><b><EntryLink :id="originFeat.id" /></b><template v-if="bg.fields.originFeatNote"> <span class="muted small">({{ bg.fields.originFeatNote }})</span></template>
          <span class="feat-tag tag-background">{{ bg.name }}</span></summary>
        <MarkdownView v-if="originFeat.fields.summary" class="small sp-text" :source="String(originFeat.fields.summary)" />
      </details>
    </div>

    <!-- typed on the sheet (feats, homebrew) -->
    <div v-for="(f, i) in s.features" :key="'own' + i" class="sp-trait">
      <details v-if="own(f)" class="sp-fold">
        <summary class="sp-head"><b>{{ f.name }}</b> <span class="feat-tag tag-own">sheet</span></summary>
        <MarkdownView class="small sp-text" :source="f.text" />
      </details>
      <div v-else class="sp-head"><b>{{ f.name }}</b> <span class="feat-tag tag-own">sheet</span></div>
    </div>

    <!-- what the gear adds -->
    <div v-for="(r, i) in gear.senses" :key="'s' + i" class="sp-trait sp-head"><b>{{ r.sense }} {{ r.range }} ft</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(r, i) in gear.resistances" :key="'r' + i" class="sp-trait sp-head"><b>Resistance: {{ r.type.toLowerCase() }}</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(r, i) in gear.immunities" :key="'i' + i" class="sp-trait sp-head"><b><ConditionIcon :name="r.condition" /> Immune: {{ r.condition.toLowerCase() }}</b> <span class="feat-tag tag-gear">{{ r.from }}</span></div>
    <div v-for="(f, i) in gear.features" :key="'f' + i" class="sp-trait sp-head"><b>{{ f.text }}</b> <span class="feat-tag tag-gear">{{ f.from }}</span></div>

    <p v-if="!traits.length && !originFeat && !s.features.length && !gear.senses.length && !gear.resistances.length && !gear.immunities.length && !gear.features.length" class="muted small">
      Nothing yet: features come from the character's classes, species and background; feats and anything else are added with ✎ Edit.</p>

    <!-- still to come -->
    <details v-if="later.length || laterSpecies.length" class="sp-later small">
      <summary class="muted">Later: {{ [...later, ...laterSpecies].map(a => `${a.trait.name} (${a.race.type === 'class' || a.race.type === 'subclass' ? a.race.name + ' ' : 'level '}${a.trait.level})`).join(', ') }}</summary>
      <div v-for="a in [...later, ...laterSpecies]" :key="a.key" class="sp-trait dim">
        <b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ a.race.name }} {{ a.trait.level }}</span>
        <MarkdownView v-if="a.trait.text" class="small" :source="a.trait.text" />
      </div>
    </details>
  </div>
</template>
