<script setup lang="ts">
// A player's characters in the DM's campaign (on the journal's party page): those in it, with a way to take one out,
// and a button to put each of the others in. The characters go to the DM while connected to their live session.
import { computed } from 'vue'
import type { Entry, Id } from '../model/types'
import { entries } from '../store'
import { changed } from '../edit'
import { isShared } from '../sync'
import { currentPc } from '../sheet'
import { characterSend } from '../playerCharacters'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ campaign: Entry }>()
const campaignsOf = (pc: Entry) => (pc.fields.campaigns as Id[] | undefined) ?? []
const myInCampaign = computed(() => entries.value.filter(x => x.type === 'pc' && !isShared(x) && campaignsOf(x).includes(props.campaign.id)))
/** One's own characters not in this campaign: the current one first. */
const notInCampaign = computed(() => entries.value.filter(x => x.type === 'pc' && !isShared(x) && !campaignsOf(x).includes(props.campaign.id))
  .sort((a, b) => Number(b.id === currentPc.value?.id) - Number(a.id === currentPc.value?.id) || a.name.localeCompare(b.name)))
function joinCampaign(pc: Entry) { pc.fields.campaigns = [...campaignsOf(pc), props.campaign.id]; changed(pc) }
function leaveCampaign(pc: Entry) {
  const rest = campaignsOf(pc).filter(id => id !== props.campaign.id)
  if (rest.length) pc.fields.campaigns = rest; else delete pc.fields.campaigns
  changed(pc)
}
</script>

<template>
  <section v-if="isShared(campaign)" class="campaign-join">
      <h2>Your characters</h2>
      <p class="small muted">Characters in this campaign go to your DM while you're connected to their live session: they see them, read-only, and get your changes a few seconds after you make them.
        <template v-if="characterSend.error"><br /><span class="warn-text">Not sent: {{ characterSend.error }}</span></template></p>
      <ul v-if="myInCampaign.length" class="plain">
        <li v-for="pc in myInCampaign" :key="pc.id"><EntryLink :id="pc.id" icon /> <button type="button" class="link-btn small" title="Your DM keeps the last version, marked as no longer shared" @click="leaveCampaign(pc)">Take out</button></li>
      </ul>
      <!-- every own character not in it yet (one the DM took out comes back the same way) -->
      <button v-for="pc in notInCampaign" :key="pc.id" type="button" class="chip-btn join-btn" @click="joinCampaign(pc)">＋ Put {{ pc.name }} in this campaign</button>
      <p v-if="!myInCampaign.length && !notInCampaign.length" class="small muted">Make a character first (Character menu), then put it in here.</p>
    </section>
</template>
