<script setup lang="ts">
// The wizard's name and story step: the character's name, its player (in the DM's world), its looks and its story.
import LinkTextarea from '../edit/LinkTextarea.vue'
import { computed } from 'vue'
import { byType, get, playerMode } from '../../store'
import { defaultCampaigns, wizard } from '../../wizard'
import ProfChips from '../ProfChips.vue'
import { useDraft } from '../../composables/useDraft'
import { inputValue as val } from '../../dom'

const { d } = useDraft()
// the campaigns it joins: the running one unless picked otherwise
const chosen = computed(() => d.value.campaigns ?? defaultCampaigns())
/** Every campaign, as on the character's Details card: toggle chips up to 6, else chips plus a box. */
const campaignOptions = computed(() => (byType.value.get('campaign') ?? []).map(c => ({ id: c.id, label: c.name })).sort((a, b) => a.label.localeCompare(b.label)))
const setCampaigns = (ids: string[]) => { wizard.d.campaigns = ids }
</script>

<template>
  <!-- who: the name big, with player and campaign beside it; then looks and story side by side -->
  <div class="wz-who">
    <label class="wz-name"><span>Name</span><input :class="{ 'wz-todo': !d.name.trim() }" :value="d.name" placeholder="The character's name" @input="wizard.d.name = val($event)" /></label>
    <label v-if="!playerMode" class="wz-player"><span>Player</span><input :value="d.player" @input="wizard.d.player = val($event)" /></label>
    <div class="wz-campaigns"><span>Campaign</span>
      <ProfChips v-if="campaignOptions.length <= 6" :values="chosen" :toggles="campaignOptions" @change="setCampaigns" />
      <ProfChips v-else-if="campaignOptions.length" :values="chosen" :suggest="campaignOptions" placeholder="Add a campaign…" @change="setCampaigns" />
      <span v-else class="muted small">none in this world</span>
    </div>
  </div>
  <div class="wz-about">
    <section class="card wz-looks">
      <h3>Looks</h3>
      <div class="wz-looks-grid">
        <label v-for="(v, k) in d.looks" :key="k" :class="{ wide: k === 'clothing' }"><span>{{ k.charAt(0).toUpperCase() + k.slice(1) }}</span><input :value="v" @input="wizard.d.looks = { ...d.looks, [k]: val($event) }" /></label>
      </div>
    </section>
    <section class="card wz-story">
      <h3>Story</h3>
      <LinkTextarea :value="d.story" placeholder="Where they come from, what they want… (Markdown)" aria-label="Story" @input="wizard.d.story = val($event)" />
    </section>
  </div>
</template>
