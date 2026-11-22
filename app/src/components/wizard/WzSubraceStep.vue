<script setup lang="ts">
// The wizard's subrace step, for a species with subraces: they're a list (how many traits of its own beside each),
// and beside it the one looked at: for the picked one, first what its traits ask to choose (a lineage's casting
// ability), then its description and traits. One is needed; clicking the picked one again leaves it unpicked.
import { computed } from 'vue'
import { mainRace, subracesOf, wizard } from '../../wizard'
import { traitsOf } from '../../model/traits'
import { get } from '../../store'
import { useDraft } from '../../composables/useDraft'
import WizardPage from '../WizardPage.vue'
import WzChooser, { type ChooserItem } from './WzChooser.vue'
import WzTraitChoices from './WzTraitChoices.vue'

const { d } = useDraft()
const main = computed(() => mainRace(d.value.race))
const items = computed<ChooserItem[]>(() => subracesOf(main.value?.id).map(s => {
  const n = traitsOf(s).filter(t => !t.replaces).length
  return { id: s.id, label: s.name, hint: n ? `${n} trait${n === 1 ? '' : 's'}` : '' }
}))
const picked = computed(() => (d.value.race && d.value.race !== main.value?.id ? d.value.race : null))
function pick(id: string) { wizard.d.race = picked.value === id ? main.value?.id : id }
</script>

<template>
  <WzChooser :items="items" :picked="picked" :label="`Subraces of ${main?.name ?? 'the species'}`" :need="!picked" :intro="`Click a subrace of ${main?.name ?? 'the species'} on the left to see what it adds. Clicking takes it.`" @pick="pick">
    <template #detail="{ item, picked: on }">
      <WzTraitChoices v-if="on" which="subrace" />
      <p v-else class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it.</p>
      <WizardPage v-if="get(item.id)" :e="get(item.id)!" :title="item.label" />
    </template>
  </WzChooser>
</template>
