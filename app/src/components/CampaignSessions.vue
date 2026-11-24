<script setup lang="ts">
// A campaign's sessions on its page: the last ten, the earlier ones folded away, and a new one numbered after the last.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { formatDate, state } from '../store'
import { createSession, sessionNo, sessionsOf } from '../sessions'
import { dayNumber } from '../calendar'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ campaign: Entry }>()
const sessions = computed(() => sessionsOf(props.campaign.id))
/** What looks wrong in the log: two sessions with one number, a session dated before the one played before it. */
const oddities = computed(() => {
  const out: string[] = [], seen = new Map<number, string>()
  const cal = state.db?.meta.calendar
  let prev: Entry | undefined
  for (const s of sessions.value) {
    const n = sessionNo(s)
    if (Number.isFinite(n)) { if (seen.has(n)) out.push(`two sessions numbered ${n} (${seen.get(n)} and ${s.name})`); else seen.set(n, s.name) }
    const a = prev?.fields.date, b = s.fields.date
    if (cal && a?.year != null && b?.year != null && dayNumber(cal, { year: b.year, month: b.month ?? 1, day: b.day ?? 1 }) < dayNumber(cal, { year: a.year, month: a.month ?? 1, day: a.day ?? 1 })) out.push(`${s.name} is dated before ${prev!.name}`)
    if (b?.year != null) prev = s
  }
  return out
})
/** A new session of this campaign, numbered after the last one. */
function newSession() {
  createSession(props.campaign.id)
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
    <p v-if="oddities.length" class="small warn-text">In this log: {{ oddities.join('; ') }}.</p>
    <button class="new-session" @click="newSession">+ New session</button>
  </section>
</template>
