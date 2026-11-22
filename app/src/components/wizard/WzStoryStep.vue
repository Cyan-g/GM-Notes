<script setup lang="ts">
// The wizard's name and story step: the character's name, its player (in the DM's world), its looks and its story.
import { computed } from 'vue'
import { byType, get, playerMode } from '../../store'
import { defaultCampaigns, wizard } from '../../wizard'
import Dropdown from '../Dropdown.vue'
import { useDraft } from '../../composables/useDraft'
import { inputValue as val } from '../../dom'

const { d } = useDraft()
// the campaigns it joins: the running one unless picked otherwise
const chosen = computed(() => d.value.campaigns ?? defaultCampaigns())
const campaigns = computed(() => (byType.value.get('campaign') ?? []).filter(c => !chosen.value.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)))
const addCampaign = (id: string) => { if (id) wizard.d.campaigns = [...chosen.value, id] }
const dropCampaign = (id: string) => { wizard.d.campaigns = chosen.value.filter(x => x !== id) }
</script>

<template>
  <div class="wz-form">
    <label>Name <input :value="d.name" placeholder="The character's name" @input="wizard.d.name = val($event)" /></label>
    <label v-if="!playerMode">Player <input :value="d.player" @input="wizard.d.player = val($event)" /></label>
    <div class="wz-campaigns"><span>Campaign</span>
      <span v-for="id in chosen" :key="id" class="chip">{{ get(id)?.name ?? id }} <button type="button" class="link-btn" title="Not in this campaign" @click="dropCampaign(id)">×</button></span>
      <Dropdown v-if="campaigns.length" compact value="" aria-label="Add a campaign" @change="addCampaign(($event.target as HTMLSelectElement).value)">
        <option value="">{{ chosen.length ? '＋ another…' : 'Choose…' }}</option>
        <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
      </Dropdown>
    </div>
    <label v-for="(v, k) in d.looks" :key="k">{{ k.charAt(0).toUpperCase() + k.slice(1) }} <input :value="v" @input="wizard.d.looks = { ...d.looks, [k]: val($event) }" /></label>
  </div>
  <label class="wz-story">Story <textarea rows="6" :value="d.story" placeholder="Where they come from, what they want… (Markdown)" @input="wizard.d.story = val($event)" /></label>
</template>
