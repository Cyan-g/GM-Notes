<script setup lang="ts">
// The wizard's species step: the species as a list (size and speed beside each); a species with subraces lists them
// under it once picked, and one of them is needed. Beside the list, the one looked at: for the picked one, first
// what its traits ask the player to choose (a skill, a cantrip, the size), then its description and traits.
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
/** The species, and under the picked one its subraces. */
const items = computed<ChooserItem[]>(() => species().flatMap(x => [
  { id: x.id, label: x.name, hint: raceLine(x) },
  ...(main.value?.id === x.id ? subracesOf(x.id).map(s => {
    const n = traitsOf(s).filter(t => !t.replaces).length
    return { id: s.id, label: `↳ ${s.name}`, hint: n ? `${n} trait${n === 1 ? '' : 's'}` : '' }
  }) : []),
]))
/** A subrace clicked again goes back to the species alone. */
function pick(id: string) {
  const e = get(id)
  if (e && e.fields.parent && d.value.race === id) wizard.d.race = main.value?.id
  else wizard.d.race = id
}
const sizes = computed(() => speciesSizes(pc.value))
/** The species (or subrace) the character has: what's looked at belongs to it. */
const isMine = (id: string) => id === d.value.race || id === main.value?.id
</script>

<template>
  <WzChooser :items="items" :picked="d.race ? [d.race, ...(main && main.id !== d.race ? [main.id] : [])] : null" label="Species" @pick="pick">
    <template #detail="{ item }">
      <template v-if="isMine(item.id)">
        <p v-if="subracesOf(main?.id).length && d.race === main?.id" class="wz-need-line small">{{ main?.name }}: pick a subrace on the left (needed).</p>
        <label v-if="sizes.length > 1" class="wz-row small">Size
          <Dropdown :value="d.size && sizes.includes(d.size) ? d.size : sizes[0]" @change="wizard.d.size = val($event)">
            <option v-for="z in sizes" :key="z" :value="z">{{ z }}</option>
          </Dropdown>
        </label>
        <WzTraitChoices which="species" />
      </template>
      <p v-else class="small muted wz-ch-hint-line">Click {{ item.label.replace('↳ ', '') }} on the left to take it.</p>
      <WizardPage v-if="get(item.id)" :e="get(item.id)!" :title="get(item.id)!.name" />
      <WizardPage v-if="isMine(item.id) && item.id === main?.id && d.race !== main?.id && get(d.race)" :e="get(d.race)!" :title="get(d.race)!.name" />
    </template>
  </WzChooser>
</template>
