<script setup lang="ts">
// A deity's facts: rank, epithet, alignment, the cleric domains it offers and its portfolio always; where it
// dwells, who worships it, its symbol, holy days and the subclasses it's a patron of once added.
import { computed } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES, byKey } from '../../model/schema'
import { isEmpty, setField } from '../../edit'
import { ALIGNMENTS, holidays } from '../../deity'
import { useParts } from '../../composables/useParts'
import FieldInput from './FieldInput.vue'
import ListInput from './ListInput.vue'
import ImageInput from './ImageInput.vue'
import ProfChips from '../ProfChips.vue'
import PartRow from './PartRow.vue'
import AddPartsBar from './AddPartsBar.vue'
import { inputValue as val } from '../../dom'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => props.entry.fields)
const def = (k: string) => TYPES.deity.fields.find(x => x.key === k)!
const set = (key: string, v: unknown) => setField(props.entry, key, v)

// ---- the parts shown once added ----
const MORE = ['realm', 'plane', 'worshippers', 'symbol', 'holyDays', 'patronOf'] as const
const { shown, addable, open, close } = useParts(MORE, k => !isEmpty(byKey(f.value)[k]) || (k === 'symbol' && !!f.value.symbolImage), {
  onClose: k => {
    set(k, undefined)
    if (k === 'symbol') set('symbolImage', undefined)
  },
})
const holidayOptions = computed(() => holidays().map(h => ({ id: h.name, label: h.name })))
</script>

<template>
  <section class="card deity-form">
    <div class="npc-who">
      <label class="sf-field"><span class="sf-label">Rank</span><FieldInput :def="def('rank')" :entry="entry" /></label>
      <label class="sf-field npc-occ"><span class="sf-label">Epithet</span>
        <input :value="f.epithet ?? ''" placeholder="e.g. the golden lady" @change="set('epithet', val($event).trim())" /></label>
      <label class="sf-field"><span class="sf-label">Alignment</span>
        <input :value="f.alignment ?? ''" list="deity-alignments" placeholder="e.g. neutral good" @change="set('alignment', val($event).trim())" />
        <datalist id="deity-alignments"><option v-for="a in ALIGNMENTS" :key="a" :value="a" /></datalist></label>
    </div>
    <PartRow label="Domains" label-title="The cleric domains it offers" fixed><FieldInput :def="def('domains')" :entry="entry" /></PartRow>
    <PartRow label="Portfolio" label-title="What it holds sway over" fixed>
      <ListInput :model-value="f.portfolio ?? []" placeholder="Add, e.g. Wealth, Commerce…" @update:model-value="v => set('portfolio', v)" /></PartRow>

    <PartRow v-for="k in shown" :key="k" :label="def(k).label" @remove="close(k)">
      <input v-if="k === 'realm'" :value="f.realm ?? ''" placeholder="its home, e.g. Brightwater" @change="set('realm', val($event).trim())" />
      <input v-else-if="k === 'plane'" :value="f.plane ?? ''" placeholder="e.g. the Outlands" @change="set('plane', val($event).trim())" />
      <input v-else-if="k === 'worshippers'" :value="f.worshippers ?? ''" placeholder="e.g. merchants, smugglers, gamblers" @change="set('worshippers', val($event).trim())" />
      <div v-else-if="k === 'symbol'" class="deity-symbol">
        <input :value="f.symbol ?? ''" placeholder="e.g. a golden coin bearing her profile" @change="set('symbol', val($event).trim())" />
        <ImageInput :model-value="f.symbolImage" :hint="`${entry.name} symbol`" @update:model-value="v => set('symbolImage', v)" />
      </div>
      <div v-else-if="k === 'holyDays'">
        <ProfChips v-if="holidayOptions.length" :values="f.holyDays ?? []" :toggles="holidayOptions" @change="v => set('holyDays', v)" />
        <p v-else class="muted small">The calendar has no holidays yet: add them in the calendar (Edit calendar), then pick them here.</p>
      </div>
      <FieldInput v-else-if="k === 'patronOf'" :def="def('patronOf')" :entry="entry" />
    </PartRow>
    <AddPartsBar class="npc-add" :parts="addable" :label="k => def(k).label" @add="open" />
  </section>
</template>
