<script setup lang="ts">
// What one feature asks the player for, on a character's Edit page (in its Features & traits line) and in the level-up
// and "to pick" windows (FeatureChoices): the proficiencies it gives, with a way to swap one; the ability its spells are
// cast with; spells it gives that may be swapped; its choice (TraitChoicePicker); and under it what its picked options
// ask for in turn (`subs`: Agonizing Blast's cantrip, Pact of the Tome's cantrips).
import Dropdown from './Dropdown.vue'
import TraitChoicePicker from './TraitChoicePicker.vue'
import SkillGrid from './SkillGrid.vue'
import { computed, ref } from 'vue'
import type { CharacterSheet, Entry, TraitGrant } from '../model/types'
import { useReadOnly } from '../composables/useReadOnly'
import { editSheet } from '../sheetData'
import { haveNow, skillLevel } from '../sheet'
import { ABILITY_NAME, profBonus } from '../model/dnd'
import { totalLevel } from '../model/classes'
import {
  choiceOpen, grantOptions, setCastAbility, setPicks, setSwap, skillSources, subLabel, swappableSpells, traitGrants, GRANT_KINDS, type ActiveTrait,
} from '../species'
import { swapFrame } from '../skillFrames'
import { inputValue as val } from '../dom'

const props = defineProps<{ pc: Entry; s: CharacterSheet; a: ActiveTrait; subs?: ActiveTrait[] }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
/** The skill grid's numbers: the proficiency bonus, and where each skill comes from. */
const prof = computed(() => profBonus(totalLevel(props.pc)))
const sources = computed(() => skillSources(props.pc, props.s))
function swapOptions(g: TraitGrant & { was?: string }) {
  const opts = grantOptions(g.kind)
  return [g.was ?? g.id, g.id].filter((id, i, l) => l.indexOf(id) === i && !opts.some(o => o.id === id)).map(id => ({ id, label: id })).concat(opts)
}
const swap = (key: string, id: string, original: string) => editSheet(props.pc, x => setSwap(x, key, id, original))
// ---- a given skill swapped on the skill grid: click it, then the new one ----
const swapping = ref<string | null>(null)
const skillGrants = (a: ActiveTrait) => traitGrants(a, props.s).filter(g => g.kind === 'skill')
const swapGrid = (a: ActiveTrait) => swapFrame({
  given: skillGrants(a).map(g => ({ key: g.key, id: g.id, was: g.was })), selected: swapping.value,
  select: k => { swapping.value = k }, swap, levelOf: n => skillLevel(props.s, n), prof: prof.value,
})
const pick = (a: ActiveTrait, picks: string[]) => editSheet(props.pc, x => setPicks(x, a.key, picks))
const cast = (a: ActiveTrait, ability: string) => editSheet(props.pc, x => setCastAbility(x, a.key, ability as Parameters<typeof setCastAbility>[2]))
const kindName = (k: string) => GRANT_KINDS.find(x => x.id === k)?.label ?? k
const nameOf = (g: TraitGrant) => grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id
/** What a trait gives, in words: "Investigation, Insight" (a swapped one by what it gives now). */
const givenText = (a: ActiveTrait) => traitGrants(a, props.s).map(g => nameOf(g)).join(', ')
const swapped = (a: ActiveTrait) => traitGrants(a, props.s).some(g => g.was)
/** The option a sub-choice comes with, by name. */
const optionName = (x: ActiveTrait) => props.a.options.find(o => o.id === x.parent?.option)?.name ?? ''
</script>

<template>
  <div class="sp-choice-block">
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
    <div v-for="x in subs ?? []" :key="x.key" class="sp-sub" :class="{ 'sp-pending': choiceOpen(x) }">
      <div class="sp-sub-head small"><b>{{ optionName(x) }}</b> <span class="muted">· {{ subLabel(x) }}</span></div>
      <TraitChoicePicker :a="x" :sheet="s" :prof="prof" :from="(n: string) => sources.get(n)" :have="haveNow(s)" :disabled="ro" @pick="p => pick(x, p)" />
    </div>
  </div>
</template>
