<script setup lang="ts">
// On a character's Edit page: every choice their classes, species and background ask for (Fighting Style, Expertise,
// invocations, a lineage, skills…) and the proficiencies they grant, which the player may swap for another of the same
// kind. In play the sheet only shows what was picked.
import { computed } from 'vue'
import type { CharacterSheet, Entry, TraitGrant } from '../model/types'
import { editSheet } from '../sheet'
import { state } from '../store'
import { choiceOpen, grantOptions, hasChoices, isClassOrigin, setCastAbility, setPicks, setSwap, speciesTraits, swappableSpells, traitGrants, GRANT_KINDS, type ActiveTrait } from '../species'
import { ABILITY_NAME } from '../abilityBonus'
import TraitChoicePicker from './TraitChoicePicker.vue'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const ro = computed(() => !!state.readOnly)
const list = computed(() => {
  const act = speciesTraits(props.pc, props.s).filter(a => a.active && hasChoices(a))
  return [...act.filter(a => isClassOrigin(a.race)).sort((x, y) => (x.trait.level ?? 1) - (y.trait.level ?? 1)), ...act.filter(a => !isClassOrigin(a.race))]
})
const open = computed(() => list.value.filter(choiceOpen).length)
function swapOptions(g: TraitGrant & { was?: string }) {
  const opts = grantOptions(g.kind)
  return [g.was ?? g.id, g.id].filter((id, i, l) => l.indexOf(id) === i && !opts.some(o => o.id === id)).map(id => ({ id, label: id })).concat(opts)
}
const swap = (key: string, id: string, original: string) => editSheet(props.pc, x => setSwap(x, key, id, original))
const pick = (a: ActiveTrait, picks: string[]) => editSheet(props.pc, x => setPicks(x, a.key, picks))
const cast = (a: ActiveTrait, ability: string) => editSheet(props.pc, x => setCastAbility(x, a.key, ability as Parameters<typeof setCastAbility>[2]))
const val = (ev: Event) => (ev.target as HTMLSelectElement).value
const kindName = (k: string) => GRANT_KINDS.find(x => x.id === k)?.label ?? k
const nameOf = (g: TraitGrant) => grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id
const tag = (a: ActiveTrait) => (a.race.type === 'class' ? `${a.race.name} ${a.trait.level ?? 1}` : a.race.name)
</script>

<template>
  <section v-if="list.length" class="feature-choices">
    <h4>Choices from classes, species and background <span v-if="open" class="sp-open small">{{ open }} open</span></h4>
    <div v-for="a in list" :key="a.key" class="sp-trait" :class="{ 'sp-pending': choiceOpen(a) }">
      <div class="sp-head"><b>{{ a.trait.name }}</b> <span class="feat-tag" :class="'tag-' + a.race.type">{{ tag(a) }}</span></div>
      <div v-if="traitGrants(a, s).length" class="sp-grants">
        <label v-for="gr in traitGrants(a, s)" :key="gr.key" class="sp-grant small" :class="{ swapped: gr.was }" :title="gr.was ? `Swapped; it gives ${nameOf({ kind: gr.kind, id: gr.was })}` : `${kindName(gr.kind)}; pick another to swap it`">
          <span class="muted">{{ gr.kind === 'language' ? 'Speaks' : kindName(gr.kind) }}</span>
          <select :value="gr.id" :disabled="ro" @change="swap(gr.key, ($event.target as HTMLSelectElement).value, gr.was ?? gr.id)">
            <option v-for="o in swapOptions(gr)" :key="o.id" :value="o.id">{{ o.label }}{{ o.id === (gr.was ?? gr.id) && gr.was ? ' (given)' : '' }}</option>
          </select>
        </label>
      </div>
      <div v-if="a.trait.castWith?.among?.length || swappableSpells(a, s).length" class="sp-grants">
        <label v-if="a.trait.castWith?.among?.length" class="sp-grant small" title="The ability this trait's spells are cast with (their attack and save DC)">
          <span class="muted">Casts with</span>
          <select :value="a.cast ?? ''" :disabled="ro" @change="cast(a, val($event))">
            <option value="">Choose…</option>
            <option v-for="ab in a.trait.castWith.among" :key="ab" :value="ab">{{ ABILITY_NAME[ab] }}</option>
          </select>
        </label>
        <label v-for="x in swappableSpells(a, s)" :key="x.key" class="sp-grant small" :class="{ swapped: x.id !== x.given }" :title="`From ${x.from}; pick another to swap it`">
          <span class="muted">Spell</span>
          <select :value="x.id" :disabled="ro" @change="swap(x.key, val($event), x.given)">
            <option v-for="e in x.candidates" :key="e.id" :value="e.id">{{ e.name }}{{ e.id === x.given && x.id !== x.given ? ' (given)' : '' }}</option>
          </select>
        </label>
      </div>
      <TraitChoicePicker v-if="a.trait.choice" :a="a" :disabled="ro" @pick="p => pick(a, p)" />
    </div>
  </section>
</template>
