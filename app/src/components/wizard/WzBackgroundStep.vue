<script setup lang="ts">
// The wizard's background step: the backgrounds as a list (its Origin feat beside each), and the one looked at
// beside it: what it gives (Origin feat, skills), for the picked one what its traits ask to choose, then its page.
import { computed } from 'vue'
import { backgrounds, pickOrigin, wizard } from '../../wizard'
import { get } from '../../store'
import { useDraft } from '../../composables/useDraft'
import EntryLink from '../EntryLink.vue'
import WizardPage from '../WizardPage.vue'
import WzChooser, { type ChooserItem } from './WzChooser.vue'
import WzTraitChoices from './WzTraitChoices.vue'

const { d } = useDraft()
const items = computed<ChooserItem[]>(() => backgrounds().map(b => ({ id: b.id, label: b.name, hint: pickOrigin() ? '' : get(String(b.fields.originFeat ?? ''))?.name ?? '' })))
const pick = (id: string) => { wizard.d.background = id }
</script>

<template>
  <WzChooser :items="items" :picked="d.background" label="Backgrounds" :need="!d.background && items.length > 0" intro="Click a background on the left to see what it gives: ability score increases, an Origin feat, two skills, a tool and starting equipment. Clicking takes it." empty="The world has no backgrounds yet; go on without one." @pick="pick">
    <template #detail="{ item, picked }">
      <p v-if="!picked" class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it.</p>
      <!-- its facts are in its page below; here only where its Origin feat is set up -->
      <p v-if="picked && (pickOrigin() || get(item.id)?.fields.originFeat)" class="small wz-bg-gives">
        <template v-if="pickOrigin()">Origin feat: you pick one in the Feats step.</template>
        <template v-else>Its Origin feat, <EntryLink :id="String(get(item.id)?.fields.originFeat)" /><template v-if="get(item.id)?.fields.originFeatNote"> ({{ get(item.id)?.fields.originFeatNote }})</template>, is set up in the <button type="button" class="link-btn" @click="wizard.featTab = 'origin'; wizard.step = 'feats'">Feats step</button>.</template>
      </p>
      <WzTraitChoices v-if="picked" which="background" />
      <WizardPage v-if="get(item.id)" :e="get(item.id)!" :title="item.label" />
    </template>
  </WzChooser>
</template>
