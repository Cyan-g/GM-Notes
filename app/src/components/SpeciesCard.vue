<script setup lang="ts">
// The character's species on their sheet: race (and subrace), size and speed, then every trait with its text and what
// it does. Traits with uses get pips to spend and give back; choices the species asks for are picked here and kept with
// the character. Traits of a higher level show dimmed until the character gets there.
import { computed } from 'vue'
import type { Entry, TraitGrant } from '../model/types'
import { blankSheet, editSheet, sheetOf } from '../sheet'
import { state } from '../store'
import { renderInline } from '../markdown'
import {
  choiceOpen, grantOptions, lineage, setPicks, speciesSize, speciesSpeed, speciesTraits, spendUse, usesLeft, usesMax,
  GRANT_KINDS, type ActiveTrait,
} from '../species'
import EntryLink from './EntryLink.vue'
import TraitChips from './TraitChips.vue'

const props = defineProps<{ pc: Entry }>()
const ro = computed(() => !!state.readOnly)
const s = computed(() => sheetOf(props.pc) ?? blankSheet())
const races = computed(() => lineage(props.pc))
const traits = computed(() => speciesTraits(props.pc, s.value))
const open = computed(() => traits.value.filter(a => a.active && choiceOpen(a)).length)
const size = computed(() => speciesSize(props.pc))
const speed = computed(() => speciesSpeed(props.pc))

/** What a pick-N choice can take: its `among` list, else everything of that kind. */
function candidates(a: ActiveTrait) {
  const c = a.trait.choice!, kind = c.kind as TraitGrant['kind']
  const all = grantOptions(kind)
  return c.among?.length ? c.among.map(id => all.find(o => o.id === id) ?? { id, label: id }) : all
}
function pick(a: ActiveTrait, slot: number, id: string) {
  const picks = [...a.picks]
  picks[slot] = id
  editSheet(props.pc, x => setPicks(x, a.key, picks.filter(Boolean)))
}
const chooseOption = (a: ActiveTrait, id: string) => editSheet(props.pc, x => setPicks(x, a.key, id ? [id] : []))
const use = (a: ActiveTrait, n: number) => { if (!ro.value) editSheet(props.pc, x => spendUse(x, props.pc, a, n)) }
const kindLabel = (k: string, n: number) => { const g = GRANT_KINDS.find(x => x.id === k); return n === 1 ? g?.label.toLowerCase() : g?.plural }
const val = (ev: Event) => (ev.target as HTMLSelectElement).value
</script>

<template>
  <section v-if="races.length" class="card species-card">
    <h3>Species
      <span class="muted small"><template v-for="(r, i) in races" :key="r.id"><template v-if="i"> › </template><EntryLink :id="r.id" /></template><template v-if="size"> · {{ size }}</template><template v-if="speed"> · {{ speed }} ft</template></span>
      <span v-if="open" class="sp-open small" :title="`${open} choice${open === 1 ? '' : 's'} still to make`">{{ open }} to choose</span>
    </h3>
    <p v-if="!traits.length" class="muted small">No traits yet: the DM adds them on the race's Edit page.</p>
    <div v-for="a in traits" :key="a.key" class="sp-trait" :class="{ dim: !a.active, 'sp-pending': a.active && choiceOpen(a) }">
      <div class="sp-head">
        <b>{{ a.trait.name }}</b>
        <span v-if="!a.active" class="muted small">from level {{ a.trait.level }}</span>
        <span v-else-if="races.length > 1" class="muted small">{{ a.race.name }}</span>
        <span v-if="a.active && usesMax(pc, a.trait)" class="sp-uses" :title="`Uses; back on a ${a.trait.uses!.recharge} rest`">
          <button v-for="p in usesMax(pc, a.trait)" :key="p" class="pip" :class="{ on: p <= usesLeft(pc, s, a) }" :disabled="ro"
                  :title="p <= usesLeft(pc, s, a) ? 'Use it' : 'Get it back'" @click="use(a, p <= usesLeft(pc, s, a) ? 1 : -1)" />
          <span v-flash="usesLeft(pc, s, a)" class="muted small">{{ usesLeft(pc, s, a) }}/{{ usesMax(pc, a.trait) }} · {{ a.trait.uses!.recharge }} rest</span>
        </span>
      </div>
      <p v-if="a.trait.text" class="md small" v-html="renderInline(a.trait.text)" />
      <TraitChips :t="a.trait" />
      <!-- the choice: one of several options, or N skills / languages / tools -->
      <div v-if="a.trait.choice && a.active" class="sp-choice">
        <template v-if="a.trait.choice.kind === 'option'">
          <select :value="a.option?.id ?? ''" :disabled="ro" aria-label="Choose one" @change="chooseOption(a, val($event))">
            <option value="">Choose…</option>
            <option v-for="o in a.trait.choice.options ?? []" :key="o.id" :value="o.id">{{ o.name }}</option>
          </select>
          <template v-if="a.option">
            <span v-if="a.option.text" class="md small" v-html="renderInline(a.option.text)" />
            <TraitChips :t="a.option" />
          </template>
        </template>
        <template v-else>
          <span class="small muted">Choose {{ a.trait.choice.count ?? 1 }} {{ kindLabel(a.trait.choice.kind, a.trait.choice.count ?? 1) }}:</span>
          <select v-for="n in a.trait.choice.count ?? 1" :key="n" :value="a.picks[n - 1] ?? ''" :disabled="ro" :aria-label="`Choice ${n}`" @change="pick(a, n - 1, val($event))">
            <option value="">—</option>
            <option v-for="o in candidates(a)" :key="o.id" :value="o.id" :disabled="a.picks.includes(o.id) && a.picks[n - 1] !== o.id">{{ o.label }}</option>
          </select>
        </template>
      </div>
    </div>
  </section>
</template>
