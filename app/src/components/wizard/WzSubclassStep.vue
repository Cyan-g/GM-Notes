<script setup lang="ts">
// The wizard's subclass step, once the level reaches the class's subclass level: the subclasses as a list (how many
// features each gives at the chosen level beside it), and the one looked at beside the list: what it gives up to the
// level first, then its description and every feature. Clicking the picked one again leaves it unpicked.
import { computed } from 'vue'
import { subclassesOf, wizard } from '../../wizard'
import { traitsOf } from '../../model/traits'
import { get } from '../../store'
import { useDraft } from '../../composables/useDraft'
import WizardPage from '../WizardPage.vue'
import WzChooser, { type ChooserItem } from './WzChooser.vue'

const { d } = useDraft()
const items = computed<ChooserItem[]>(() => (d.value.cls ? subclassesOf(d.value.cls) : []).map(s => {
  const n = traitsOf(s).filter(t => (t.level ?? 1) <= d.value.level).length
  return { id: s.id, label: s.name, hint: `${n} feature${n === 1 ? '' : 's'}` }
}))
const pick = (id: string) => { wizard.d.subclass = d.value.subclass === id ? undefined : id }
</script>

<template>
  <WzChooser :items="items" :picked="d.subclass" label="Subclasses" :need="!d.subclass && items.length > 0" intro="Click a subclass on the left to see the features it gives. Clicking takes it." empty="The world has no subclasses of this class yet; add them on the class's page, or go on without one." @pick="pick">
    <template #detail="{ item, picked }">
      <p v-if="!picked" class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it.</p>
      <WizardPage v-if="get(item.id)" :e="get(item.id)!" :title="item.label" :level="d.level" />
    </template>
  </WzChooser>
</template>
