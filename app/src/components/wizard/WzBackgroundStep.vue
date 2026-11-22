<script setup lang="ts">
// The wizard's background step: the backgrounds as a list (its Origin feat beside each), and the one looked at
// beside it: what it gives (Origin feat, skills), for the picked one what its traits ask to choose, then its page.
import { computed } from 'vue'
import { backgrounds, wizard } from '../../wizard'
import { get } from '../../store'
import { useDraft } from '../../composables/useDraft'
import EntryLink from '../EntryLink.vue'
import WizardPage from '../WizardPage.vue'
import WzChooser, { type ChooserItem } from './WzChooser.vue'
import WzTraitChoices from './WzTraitChoices.vue'

const { d } = useDraft()
const items = computed<ChooserItem[]>(() => backgrounds().map(b => ({ id: b.id, label: b.name, hint: get(String(b.fields.originFeat ?? ''))?.name ?? '' })))
const pick = (id: string) => { wizard.d.background = id }
</script>

<template>
  <WzChooser :items="items" :picked="d.background" label="Backgrounds" empty="The world has no backgrounds yet; go on without one." @pick="pick">
    <template #detail="{ item, picked }">
      <p v-if="!picked" class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it.</p>
      <p class="small wz-bg-gives">
        <template v-if="get(item.id)?.fields.originFeat">Origin feat <EntryLink :id="String(get(item.id)?.fields.originFeat)" /><template v-if="get(item.id)?.fields.originFeatNote"> ({{ get(item.id)?.fields.originFeatNote }})</template> · </template>
        skills {{ (get(item.id)?.fields.skillProfs ?? []).join(', ') || '—' }}
      </p>
      <WzTraitChoices v-if="picked" which="background" />
      <WizardPage v-if="get(item.id)" :e="get(item.id)!" :title="item.label" />
    </template>
  </WzChooser>
</template>
