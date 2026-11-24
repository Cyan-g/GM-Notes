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
import { haveNow, skillLevel } from '../sheet'
import { profBonus } from '../model/dnd'
import { totalLevel } from '../model/classes'
import { state } from '../store'
import { ui } from '../ui'
import {
  choiceOpen, grantOptions, skillSources, hasChoices, isClassOrigin, picksLeft, setCastAbility, setPicks, setSwap, sourceTag, speciesTraits, subLabel, subsOf, swappableSpells,
  traitGrants, GRANT_KINDS, type ActiveTrait,
} from '../species'
import { ABILITY_NAME } from '../model/dnd'
import TraitChoicePicker from './TraitChoicePicker.vue'
import SkillGrid from './SkillGrid.vue'
import { swapFrame } from '../skillFrames'
import { inputValue as val } from '../dom'

/** `openOnly`: just the choices still to make (the level-up dialog, the sheet's "to pick" window), not folded. */
const props = defineProps<{ pc: Entry; s: CharacterSheet; openOnly?: boolean }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
const traits = computed(() => speciesTraits(props.pc, props.s).filter(a => a.active))
/** The choices a trait's picked options bring (Agonizing Blast's cantrip): made under that option, not on their own. */
const subs = (a: ActiveTrait) => subsOf(traits.value, a)
/** A trait's own picks and its options' still to make. */
const openAll = (a: ActiveTrait) => choiceOpen(a) || subs(a).some(choiceOpen)
const leftAll = (a: ActiveTrait) => picksLeft(a) + subs(a).reduce((n, x) => n + picksLeft(x), 0)
const optionName = (a: ActiveTrait, x: ActiveTrait) => a.options.find(o => o.id === x.parent?.option)?.name ?? ''
/** Class features by level, then the rest; the ones still waiting for a pick first. */
const list = computed(() => {
  const act = traits.value.filter(a => !a.parent && hasChoices(a))
  const all = [...act.filter(a => isClassOrigin(a.race)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1)), ...act.filter(a => !isClassOrigin(a.race))]
  // the open ones as they were when shown: one stays while its picks are made (it doesn't vanish mid-pick)
  if (props.openOnly) return all.filter(a => openAll(a) || shownOpen.has(a.key))
  return [...all.filter(openAll), ...all.filter(a => !openAll(a))]
})
const shownOpen = new Set<string>(props.openOnly ? speciesTraits(props.pc, props.s).filter(a => a.active && !a.parent && hasChoices(a)).filter(a => choiceOpen(a) || subsOf(speciesTraits(props.pc, props.s), a).some(choiceOpen)).map(a => a.key) : [])
/** The skill grid's numbers: the proficiency bonus, and where each skill comes from. */
const prof = computed(() => profBonus(totalLevel(props.pc)))
const sources = computed(() => skillSources(props.pc, props.s))
const left = computed(() => list.value.reduce((n, a) => n + leftAll(a), 0))
function swapOptions(g: TraitGrant & { was?: string }) {
  const opts = grantOptions(g.kind)
  return [g.was ?? g.id, g.id].filter((id, i, l) => l.indexOf(id) === i && !opts.some(o => o.id === id)).map(id => ({ id, label: id })).concat(opts)
}
const swap = (key: string, id: string, original: string) => editSheet(props.pc, x => setSwap(x, key, id, original))
// ---- a given skill swapped on the skill grid: click it, then the new one (a trait at a time) ----
const swapping = ref<Record<string, string | null>>({})
const skillGrants = (a: ActiveTrait) => traitGrants(a, props.s).filter(g => g.kind === 'skill')
const swapGrid = (a: ActiveTrait) => swapFrame({
  given: skillGrants(a).map(g => ({ key: g.key, id: g.id, was: g.was })), selected: swapping.value[a.key] ?? null,
  select: k => { swapping.value = { ...swapping.value, [a.key]: k } }, swap, levelOf: n => skillLevel(props.s, n), prof: prof.value,
})
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
    <details class="fc-fold" :open="left > 0 || openOnly">
    <summary v-if="!openOnly"><h4>Choices from classes, species, background and feats <span v-if="left" class="sp-open small">{{ left }} to pick</span><span v-else class="muted small">all {{ list.length }} made · open to change</span></h4></summary>
    <p v-else class="small muted">{{ left ? `${left} pick${left === 1 ? '' : 's'} to make.` : 'All made.' }}</p>
    <div v-for="a in list" :key="a.key" class="sp-trait" :class="{ 'sp-pending': openAll(a) }">
      <div class="sp-head"><b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ sourceTag(a) }}</span>
        <span v-if="leftAll(a)" class="sp-open small">{{ leftAll(a) }} to pick</span></div>
      <!-- given proficiencies: listed, with a fold to swap one -->
      <details v-if="traitGrants(a, s).length" class="sp-given small" :open="swapped(a)">
        <summary><span class="muted">Gives</span> {{ givenText(a) }} <span class="link-like">· swap…</span></summary>
        <!-- skills: on the grid (click a given one, then the new one); the rest: a dropdown each -->
        <SkillGrid v-if="skillGrants(a).length && !ro" compact no-saves :s="s" :prof="prof" :frame="swapGrid(a)" :from="(x: string) => sources.get(x)" />
        <div class="sp-grants">
          <label v-for="gr in traitGrants(a, s).filter(g => g.kind !== 'skill' || ro)" :key="gr.key" class="sp-grant small" :class="{ swapped: gr.was }" :title="gr.was ? `Swapped; it gives ${nameOf({ kind: gr.kind, id: gr.was })}` : `${kindName(gr.kind)}; pick another to swap it`">
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
      <TraitChoicePicker v-if="a.trait.choice" :a="a" :sheet="s" :prof="prof" :from="(x: string) => sources.get(x)" :have="haveNow(s)" :disabled="ro" @pick="p => pick(a, p)" />
      <!-- what a picked option asks for in turn, under it: Agonizing Blast's cantrip, Pact of the Tome's cantrips -->
      <div v-for="x in subs(a)" :key="x.key" class="sp-sub" :class="{ 'sp-pending': choiceOpen(x) }">
        <div class="sp-sub-head small"><b>{{ optionName(a, x) }}</b> <span class="muted">· {{ subLabel(x) }}</span></div>
        <TraitChoicePicker :a="x" :sheet="s" :prof="prof" :from="(n: string) => sources.get(n)" :have="haveNow(s)" :disabled="ro" @pick="p => pick(x, p)" />
      </div>
    </div>
    </details>
  </section>
</template>
