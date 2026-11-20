<script setup lang="ts">
// The character's species on their sheet: race (and subrace), size and speed, then every trait with its text and what
// it does. With kind="background" the same for their background (its Origin feat, skills, tool and features), and with
// kind="class" for their classes and subclasses: the features they have by their level in each, folded to a line with
// the text a click away, then what comes later. Every granted proficiency is a dropdown the player can swap for another
// of its kind. Traits with uses get pips (or a number, for a pool such as Lay on Hands) to spend and give back; choices
// are picked here and kept with the character. Species traits of a higher level show dimmed until the character gets there.
import { computed } from 'vue'
import type { Entry, TraitGrant } from '../model/types'
import { blankSheet, editSheet, sheetOf } from '../sheet'
import { state } from '../store'
import { renderInline } from '../markdown'
import {
  backgroundOf, choiceOpen, grantOptions, isClassOrigin, lineage, scaleAt, setPicks, setSwap, speciesSize, speciesSpeed, speciesTraits,
  spendUse, traitGrants, usesLeft, usesMax, GRANT_KINDS, type ActiveTrait,
} from '../species'
import EntryLink from './EntryLink.vue'
import TraitChips from './TraitChips.vue'
import TraitChoicePicker from './TraitChoicePicker.vue'
import MarkdownView from './MarkdownView.vue'

const props = withDefaults(defineProps<{ pc: Entry; kind?: 'species' | 'background' | 'class' }>(), { kind: 'species' })
const bg = computed(() => props.kind === 'background')
const cls = computed(() => props.kind === 'class')
const ro = computed(() => !!state.readOnly)
const s = computed(() => sheetOf(props.pc) ?? blankSheet())
const all = computed(() => speciesTraits(props.pc, s.value))
const traits = computed(() => all.value.filter(a => (cls.value ? isClassOrigin(a.race) : (a.race.type === 'background') === bg.value && !isClassOrigin(a.race))))
const races = computed(() => (cls.value ? [...new Map(traits.value.map(a => [a.race.id, a.race])).values()]
  : bg.value ? (backgroundOf(props.pc) ? [backgroundOf(props.pc)!] : []) : lineage(props.pc)))
/** For classes: the features they have now, by class and subclass; the later ones listed apart. */
const groups = computed(() => races.value.map(r => ({ r, now: traits.value.filter(a => a.race.id === r.id && a.active), later: traits.value.filter(a => a.race.id === r.id && !a.active) })))
const feat = computed(() => (bg.value ? races.value[0]?.fields.originFeat : undefined))
const featNote = computed(() => (bg.value ? races.value[0]?.fields.originFeatNote : undefined))
const open = computed(() => traits.value.filter(a => a.active && choiceOpen(a)).length)
const size = computed(() => (bg.value || cls.value ? undefined : speciesSize(props.pc)))
const speed = computed(() => (bg.value || cls.value ? undefined : speciesSpeed(props.pc)))
/** A granted proficiency's dropdown: everything of its kind, plus the granted one if the lists don't have it. */
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
const max = (a: ActiveTrait) => usesMax(props.pc, a, s.value)
const left = (a: ActiveTrait) => usesLeft(props.pc, s.value, a)
const levelOf = (r: Entry) => traits.value.find(a => a.race.id === r.id)?.level
const title = computed(() => (cls.value ? 'Class features' : bg.value ? 'Background' : 'Species'))
</script>

<template>
  <section v-if="races.length" class="card species-card" :class="{ 'class-card': cls }">
    <h3>{{ title }}
      <span v-if="!cls" class="muted small"><template v-for="(r, i) in races" :key="r.id"><template v-if="i"> › </template><EntryLink :id="r.id" /></template><template v-if="size"> · {{ size }}</template><template v-if="speed"> · {{ speed }} ft</template></span>
      <span v-if="open" class="sp-open small" :title="`${open} choice${open === 1 ? '' : 's'} still to make`">{{ open }} to choose</span>
    </h3>
    <p v-if="feat" class="sp-feat small">Origin feat: <EntryLink :id="String(feat)" /><span v-if="featNote" class="muted"> ({{ featNote }})</span></p>
    <p v-if="!traits.length" class="muted small">{{ bg ? 'Nothing more yet: the DM sets it up on the background’s Edit page.' : 'No traits yet: the DM adds them on the race’s Edit page.' }}</p>

    <template v-for="g in cls ? groups : [{ r: undefined, now: traits, later: [] }]" :key="g.r?.id ?? 'all'">
      <h4 v-if="g.r" class="sp-origin"><EntryLink :id="g.r.id" /> <span class="muted small">level {{ levelOf(g.r) }}</span></h4>
      <div v-for="a in g.now" :key="a.key" class="sp-trait" :class="{ dim: !a.active, 'sp-pending': a.active && choiceOpen(a) }">
        <component :is="cls ? 'details' : 'div'" class="sp-fold">
          <component :is="cls ? 'summary' : 'div'" class="sp-head">
            <b>{{ a.trait.name }}</b>
            <span v-if="!a.active" class="muted small">from level {{ a.trait.level }}</span>
            <span v-else-if="cls" class="muted small">{{ a.trait.level ?? 1 }}</span>
            <span v-else-if="races.length > 1" class="muted small">{{ a.race.name }}</span>
            <span v-if="a.active && scaleAt(a)" class="chip sp-scale">{{ a.trait.scale!.label }} {{ scaleAt(a) }}</span>
            <span v-if="a.active && max(a)" class="sp-uses" :title="`Uses; back on a ${a.trait.uses!.recharge} rest${a.trait.uses!.shortBack ? `, ${a.trait.uses!.shortBack} on a short rest` : ''}`" @click.stop.prevent>
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
          </component>
          <MarkdownView v-if="a.trait.text && cls" class="small sp-text" :source="a.trait.text" />
          <div v-else-if="a.trait.text" class="md small sp-text" v-html="renderInline(a.trait.text)" />
        </component>
        <TraitChips :t="a.trait" :no-grants="a.active" :no-uses="a.active" />
        <!-- what it grants, each swappable for another of its kind -->
        <div v-if="a.active && traitGrants(a, s).length" class="sp-grants">
          <label v-for="gr in traitGrants(a, s)" :key="gr.key" class="sp-grant small" :class="{ swapped: gr.was }" :title="gr.was ? `Swapped; it gives ${nameOf({ kind: gr.kind, id: gr.was })}` : `${kindName(gr.kind)}; pick another to swap it`">
            <span class="muted">{{ gr.kind === 'language' ? 'Speaks' : kindName(gr.kind) }}</span>
            <select :value="gr.id" :disabled="ro" @change="swap(gr.key, val($event), gr.was ?? gr.id)">
              <option v-for="o in swapOptions(gr)" :key="o.id" :value="o.id">{{ o.label }}{{ o.id === (gr.was ?? gr.id) && gr.was ? ' (given)' : '' }}</option>
            </select>
          </label>
        </div>
        <TraitChoicePicker v-if="a.trait.choice && a.active" :a="a" :disabled="ro" @pick="p => pick(a, p)" />
      </div>
      <details v-if="g.later.length" class="sp-later small">
        <summary class="muted">Later: {{ g.later.map(a => `${a.trait.name} (${a.trait.level})`).join(', ') }}</summary>
        <div v-for="a in g.later" :key="a.key" class="sp-trait dim">
          <b>{{ a.trait.name }}</b> <span class="muted">level {{ a.trait.level }}</span>
          <MarkdownView v-if="a.trait.text" class="small" :source="a.trait.text" />
        </div>
      </details>
    </template>
  </section>
</template>
