<script setup lang="ts">
// The wizard's species step: the species as a list (size, speed and subraces beside each), and beside it the one
// looked at: for the picked one, first what its traits ask the player to choose (a skill, the size), then its
// description and traits. A species with subraces gets a Subrace step after this one (WzSubraceStep).
import Dropdown from '../Dropdown.vue'
import { computed } from 'vue'
import type { Entry } from '../../model/types'
import { mainRace, species, subracesOf, wizard } from '../../wizard'
import { speciesSizes } from '../../species'
import { traitsOf } from '../../model/traits'
import { get } from '../../store'
import { useDraft } from '../../composables/useDraft'
import { inputValue as val } from '../../dom'
import WizardPage from '../WizardPage.vue'
import WzChooser, { type ChooserItem } from './WzChooser.vue'
import WzTraitChoices from './WzTraitChoices.vue'

const { d, pc } = useDraft()
const main = computed(() => mainRace(d.value.race))
/** A species' line: its size and walking speed, and how many subraces it has. */
function raceLine(x: Entry): string {
  const sp = x.fields.speeds as { walk?: number } | undefined
  return [x.fields.size, sp?.walk != null && `${sp.walk} ft`, subracesOf(x.id).length && `${subracesOf(x.id).length} subraces`].filter(Boolean).join(' · ')
}
const items = computed<ChooserItem[]>(() => species().map(x => ({ id: x.id, label: x.name, hint: raceLine(x) })))
/** Another species (its subrace, if one was picked, goes with the old one). */
function pick(id: string) { if (id !== main.value?.id) wizard.d.race = id }
const sizes = computed(() => speciesSizes(pc.value))
/** The species the character has: what's looked at belongs to it. */
const isMine = (id: string) => id === main.value?.id
</script>

<template>
  <WzChooser :items="items" :picked="main?.id" label="Species" @pick="pick">
    <template #detail="{ item }">
      <template v-if="isMine(item.id)">
        <p v-if="subracesOf(main?.id).length" class="small muted">{{ main?.name }} has subraces: the next step picks one.</p>
        <label v-if="sizes.length > 1" class="wz-row small">Size
          <Dropdown :value="d.size && sizes.includes(d.size) ? d.size : sizes[0]" @change="wizard.d.size = val($event)">
            <option v-for="z in sizes" :key="z" :value="z">{{ z }}</option>
          </Dropdown>
        </label>
        <WzTraitChoices which="species" />
      </template>
      <p v-else class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it.</p>
      <WizardPage v-if="get(item.id)" :e="get(item.id)!" :title="get(item.id)!.name" />
    </template>
  </WzChooser>
</template>
