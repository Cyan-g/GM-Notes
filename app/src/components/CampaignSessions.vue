<script setup lang="ts">
// A campaign's sessions on its page: the last ten, the earlier ones folded away, and a new one numbered after the last.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { formatDate } from '../store'
import { nextSessionNo, sessionsOf } from '../sessions'
import { newEntry } from '../ui'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ campaign: Entry }>()
const sessions = computed(() => sessionsOf(props.campaign.id))
/** A new session of this campaign, numbered after the last one. */
function newSession() {
  newEntry('session', { campaign: props.campaign.id, number: nextSessionNo(props.campaign.id) })
}
</script>

<template>
  <section>
    <h2>Sessions</h2>
    <details v-if="sessions.length > 10" class="older-sessions">
      <summary>Show the {{ sessions.length - 10 }} earlier sessions</summary>
      <ol class="plain">
        <li v-for="s in sessions.slice(0, -10)" :key="s.id"><EntryLink :id="s.id" /> <span class="muted">{{ formatDate(s.fields.date) }}</span></li>
      </ol>
    </details>
    <ol v-if="sessions.length" class="plain">
      <li v-for="s in sessions.slice(-10)" :key="s.id"><EntryLink :id="s.id" /> <span class="muted">{{ formatDate(s.fields.date) }}</span></li>
    </ol>
    <button class="new-session" @click="newSession">+ New session</button>
  </section>
</template>
