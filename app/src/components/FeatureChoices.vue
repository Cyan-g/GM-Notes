<script setup lang="ts">
// On a character's Edit page, as a card of its own near the top: every choice their classes, species, background and
// feats ask for (Fighting Style, Expertise, invocations, a lineage, skills, a casting ability…), the open ones first,
// with how many picks are left. Proficiencies a feature gives are listed as given, with a fold to swap them for
// another of the same kind. In play the sheet only shows what was picked.
import Dropdown from './Dropdown.vue'
import { useReadOnly } from '../composables/useReadOnly'
import { computed, nextTick, onMounted, ref } from 'vue'
import type { CharacterSheet, Entry, TraitGrant } from '../model/types'
import { editSheet } from '../sheetData'
import { haveNow } from '../sheet'
import { state } from '../store'
import { ui } from '../ui'
import {
  choiceOpen, grantOptions, hasChoices, isClassOrigin, picksLeft, setCastAbility, setPicks, setSwap, sourceTag, speciesTraits, swappableSpells,
  traitGrants, GRANT_KINDS, type ActiveTrait,
} from '../species'
import { ABILITY_NAME } from '../model/dnd'
import TraitChoicePicker from './TraitChoicePicker.vue'
import { inputValue as val } from '../dom'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
/** Class features by level, then the rest; the ones still waiting for a pick first. */
const list = computed(() => {
  const act = speciesTraits(props.pc, props.s).filter(a => a.active && hasChoices(a))
  const all = [...act.filter(a => isClassOrigin(a.race)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1)), ...act.filter(a => !isClassOrigin(a.race))]
  return [...all.filter(choiceOpen), ...all.filter(a => !choiceOpen(a))]
})
const left = computed(() => list.value.reduce((n, a) => n + picksLeft(a), 0))
function swapOptions(g: TraitGrant & { was?: string }) {
  const opts = grantOptions(g.kind)
  return [g.was ?? g.id, g.id].filter((id, i, l) => l.indexOf(id) === i && !opts.some(o => o.id === id)).map(id => ({ id, label: id })).concat(opts)
}
const swap = (key: string, id: string, original: string) => editSheet(props.pc, x => setSwap(x, key, id, original))
const pick = (a: ActiveTrait, picks: string[]) => editSheet(props.pc, x => setPicks(x, a.key, picks))
const cast = (a: ActiveTrait, ability: string) => editSheet(props.pc, x => setCastAbility(x, a.key, ability as Parameters<typeof setCastAbility>[2]))
const kindName = (k: string) => GRANT_KINDS.find(x => x.id === k)?.label ?? k
const nameOf = (g: TraitGrant) => grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id
/** What a trait gives, in words: "Investigation, Insight" (a swapped one by what it gives now). */
const givenText = (a: ActiveTrait) => traitGrants(a, props.s).map(g => nameOf(g)).join(', ')
const swapped = (a: ActiveTrait) => traitGrants(a, props.s).some(g => g.was)

// Arriving from the play sheet's "to pick" link: scroll here.
const root = ref<HTMLElement>()
onMounted(async () => {
  if (ui.scrollTo !== 'choices') return
  ui.scrollTo = ''
  await nextTick()
  root.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
})
</script>

<template>
  <section v-if="list.length" ref="root" class="feature-choices">
    <!-- all made: folded to its heading, opened to change one -->
    <details class="fc-fold" :open="left > 0">
    <summary><h4>Choices from classes, species, background and feats <span v-if="left" class="sp-open small">{{ left }} to pick</span><span v-else class="muted small">all {{ list.length }} made · open to change</span></h4></summary>
    <div v-for="a in list" :key="a.key" class="sp-trait" :class="{ 'sp-pending': choiceOpen(a) }">
      <div class="sp-head"><b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ sourceTag(a) }}</span>
        <span v-if="picksLeft(a)" class="sp-open small">{{ picksLeft(a) }} to pick</span></div>
      <!-- given proficiencies: listed, with a fold to swap one -->
      <details v-if="traitGrants(a, s).length" class="sp-given small" :open="swapped(a)">
        <summary><span class="muted">Gives</span> {{ givenText(a) }} <span class="link-like">· swap…</span></summary>
        <div class="sp-grants">
          <label v-for="gr in traitGrants(a, s)" :key="gr.key" class="sp-grant small" :class="{ swapped: gr.was }" :title="gr.was ? `Swapped; it gives ${nameOf({ kind: gr.kind, id: gr.was })}` : `${kindName(gr.kind)}; pick another to swap it`">
            <span class="muted">{{ gr.kind === 'language' ? 'Speaks' : kindName(gr.kind) }}</span>
            <Dropdown compact :value="gr.id" :disabled="ro" @change="swap(gr.key, val($event), gr.was ?? gr.id)">
              <option v-for="o in swapOptions(gr)" :key="o.id" :value="o.id">{{ o.label }}{{ o.id === (gr.was ?? gr.id) && gr.was ? ' (given)' : '' }}</option>
            </Dropdown>
          </label>
        </div>
      </details>
      <div v-if="a.trait.castWith?.among?.length || swappableSpells(a, s).length" class="sp-grants">
        <label v-if="a.trait.castWith?.among?.length" class="sp-grant small" title="The ability this trait's spells are cast with (their attack and save DC)">
          <span class="muted">Casts its spells with</span>
          <Dropdown compact :value="a.cast ?? ''" :disabled="ro" @change="cast(a, val($event))">
            <option value="">Choose…</option>
            <option v-for="ab in a.trait.castWith.among" :key="ab" :value="ab">{{ ABILITY_NAME[ab] }}</option>
          </Dropdown>
        </label>
        <label v-for="x in swappableSpells(a, s)" :key="x.key" class="sp-grant small" :class="{ swapped: x.id !== x.given }" :title="`From ${x.from}; pick another to swap it`">
          <span class="muted">Spell (swappable)</span>
          <Dropdown compact :value="x.id" :disabled="ro" @change="swap(x.key, val($event), x.given)">
            <option v-for="e in x.candidates" :key="e.id" :value="e.id">{{ e.name }}{{ e.id === x.given ? ' (given)' : '' }}</option>
          </Dropdown>
        </label>
      </div>
      <TraitChoicePicker v-if="a.trait.choice" :a="a" :have="haveNow(s)" :disabled="ro" @pick="p => pick(a, p)" />
    </div>
    </details>
  </section>
</template>
