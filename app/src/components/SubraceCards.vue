<script setup lang="ts">
// A race's subraces and lineages on its page. Subraces are entries of their own (High Elf: Subrace of Elf), each with
// its ability score bonus, size and speed where they differ, and its traits; one that stands for a lineage option says
// which. Lineages are the options of a trait's choice (the SRD Elf's Elven Lineage): each with what it gives. A DM adds
// a subrace here.
import { computed } from 'vue'
import type { Entry, Trait } from '../model/types'
import { entries, playerMode, state } from '../store'
import { abilityBonusText } from '../abilityBonus'
import { subraceOption, traitsOf } from '../species'
import { newBlankEntry } from '../ui'
import EntryLink from './EntryLink.vue'
import TraitChips from './TraitChips.vue'

const props = defineProps<{ race: Entry }>()
const subs = computed(() => entries.value.filter(e => e.type === 'race' && e.fields.parent === props.race.id).sort((a, b) => a.name.localeCompare(b.name)))
const walk = (e: Entry) => e.fields.speeds?.walk
const differs = (e: Entry) => ({
  size: !!e.fields.size && e.fields.size !== props.race.fields.size,
  speed: walk(e) != null && walk(e) !== walk(props.race),
})
const grand = (e: Entry) => entries.value.filter(x => x.type === 'race' && x.fields.parent === e.id).length
/** The race's choices of one option (lineages, ancestries): picked once, at character creation. */
const lineages = computed(() => traitsOf(props.race).filter((t: Trait) => t.choice?.kind === 'option' && (t.choice.count ?? 1) === 1 && !t.choice.steps?.length))
/** The lineage option a subrace stands for, if any ("High Elf" picks the High Elf lineage). */
const picks = (s: Entry) => lineages.value.map(t => ({ t, o: subraceOption(t.choice!, s.name, props.race.name) })).find(x => x.o)
const canAdd = computed(() => !state.readOnly && !playerMode.value)
</script>

<template>
  <div v-if="subs.length || lineages.length || canAdd" class="card subrace-cards">
    <template v-for="t in lineages" :key="t.id">
      <h3>{{ t.name }} <span class="muted small">choose one · {{ t.choice!.options?.length ?? 0 }} options</span></h3>
      <div v-for="o in t.choice!.options ?? []" :key="o.id" class="subrace-card">
        <div class="sr-head"><b>{{ o.name }}</b></div>
        <TraitChips :t="o" />
      </div>
    </template>
    <h3>Subraces <span class="muted small">{{ subs.length }}<template v-if="subs.length"> · each also has the {{ race.name }}'s traits</template></span></h3>
    <div v-for="s in subs" :key="s.id" class="subrace-card">
      <div class="sr-head"><EntryLink :id="s.id" />
        <span v-if="s.fields.abilityIncrease" class="muted small">{{ abilityBonusText(s.fields.abilityIncrease) }}</span>
        <span v-if="differs(s).size" class="muted small">{{ s.fields.size }}</span>
        <span v-if="differs(s).speed" class="muted small">speed {{ walk(s) }} ft</span>
        <span v-if="grand(s)" class="muted small">{{ grand(s) }} subraces of its own</span>
      </div>
      <span v-if="picks(s)" class="muted small">Picks the {{ picks(s)!.o!.name }} option of {{ picks(s)!.t.name }}<template v-if="traitsOf(s).length">, and has:</template></span>
      <span v-if="traitsOf(s).length" class="chips"><span v-for="t in traitsOf(s)" :key="t.id" class="chip" :title="t.text">{{ t.name }}</span></span>
      <span v-else-if="!picks(s)" class="muted small">Only the {{ race.name }}'s traits.</span>
    </div>
    <p v-if="!subs.length" class="muted small">No subraces of {{ race.name }}.</p>
    <button v-if="canAdd" type="button" class="chip-btn" @click="newBlankEntry('race', { parent: race.id })">＋ Subrace</button>
  </div>
</template>
