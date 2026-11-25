<script setup lang="ts">
// The wizard's name and story step: the character's name, its player (in the DM's world), its looks and its story.
import LinkTextarea from '../edit/LinkTextarea.vue'
import { computed } from 'vue'
import { byType, get, playerMode } from '../../store'
import { defaultCampaigns, wizard } from '../../wizard'
import Dropdown from '../Dropdown.vue'
import SuggestInput from '../SuggestInput.vue'
import { AGES, usedValues } from '../../npc'
import { useDraft } from '../../composables/useDraft'
import { inputValue as val } from '../../dom'

const { d } = useDraft()
// the campaigns it joins: the running one unless picked otherwise
const chosen = computed(() => d.value.campaigns ?? defaultCampaigns())
const campaigns = computed(() => (byType.value.get('campaign') ?? []).filter(c => !chosen.value.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)))
/** What a look can be: what characters and NPCs already have (ages also the usual words), as on the Edit page. */
const looksFor = (k: string) => (k === 'age' ? [...new Set([...AGES, ...usedValues('age')])] : usedValues(k))
const addCampaign = (id: string) => { if (id) wizard.d.campaigns = [...chosen.value, id] }
const dropCampaign = (id: string) => { wizard.d.campaigns = chosen.value.filter(x => x !== id) }
</script>

<template>
  <!-- who: the name big, with player and campaign beside it; then looks and story side by side -->
  <div class="wz-who">
    <label class="wz-name"><span>Name</span><input :class="{ 'wz-todo': !d.name.trim() }" :value="d.name" placeholder="The character's name" @input="wizard.d.name = val($event)" /></label>
    <label v-if="!playerMode" class="wz-player"><span>Player</span><SuggestInput :value="d.player" :options="usedValues('player', ['pc'])" @input="wizard.d.player = val($event)" /></label>
    <div class="wz-campaigns"><span>Campaign</span>
      <span class="wz-campaign-list">
        <span v-for="id in chosen" :key="id" class="chip">{{ get(id)?.name ?? id }} <button type="button" class="link-btn" title="Not in this campaign" @click="dropCampaign(id)">×</button></span>
        <Dropdown v-if="campaigns.length" compact value="" aria-label="Add a campaign" @change="addCampaign(($event.target as HTMLSelectElement).value)">
          <option value="">{{ chosen.length ? '＋ another…' : 'Choose…' }}</option>
          <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
        </Dropdown>
        <span v-if="!chosen.length && !campaigns.length" class="muted small">none in this world</span>
      </span>
    </div>
  </div>
  <div class="wz-about">
    <section class="card wz-looks">
      <h3>Looks</h3>
      <div class="wz-looks-grid">
        <label v-for="(v, k) in d.looks" :key="k" :class="{ wide: k === 'clothing' }"><span>{{ k.charAt(0).toUpperCase() + k.slice(1) }}</span><SuggestInput :value="v" :options="looksFor(String(k))" @input="wizard.d.looks = { ...d.looks, [k]: val($event) }" /></label>
      </div>
    </section>
    <section class="card wz-story">
      <h3>Story</h3>
      <LinkTextarea :value="d.story" placeholder="Where they come from, what they want… (Markdown)" aria-label="Story" @input="wizard.d.story = val($event)" />
    </section>
  </div>
</template>
