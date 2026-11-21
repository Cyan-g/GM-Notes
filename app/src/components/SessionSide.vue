<script setup lang="ts">
// A session's side column: its facts (in-world date, when it was played, who was there, the sessions before and
// after), its encounters, and everyone and everything its text links to, grouped by type in order of first mention.
import { computed } from 'vue'
import type { Entry, EntryType } from '../model/types'
import { TYPES } from '../model/schema'
import { byType, formatDate, get, hiddenFromPlayers, playerMode, state } from '../store'
import { weekday } from '../calendar'
import { newEntry } from '../ui'
import EntryLink from './EntryLink.vue'
import { sessionsOf } from '../sessions'
import { stripSecrets } from '../model/text'

const props = defineProps<{ e: Entry }>()

// ---- facts ----
const date = computed(() => {
  const d = props.e.fields.date
  if (!d?.day || !d.month) return formatDate(d)
  const cal = state.db?.meta.calendar
  const wd = cal ? cal.weekdays[weekday(cal, d)] : ''
  return `${wd ? wd + ', ' : ''}${formatDate(d)}`
})
const players = computed(() => ((props.e.fields.players ?? []) as string[]).filter(id => get(id)))
const pager = computed(() => {
  const c = props.e.fields.campaign
  if (!c) return null
  const list = sessionsOf(c)
  const i = list.findIndex(s => s.id === props.e.id)
  return { prev: list[i - 1], next: list[i + 1] }
})

// ---- what the text links to ----
const ORDER: EntryType[] = ['pc', 'npc', 'creature', 'place', 'organization', 'deity', 'item', 'spell']
const linked = computed(() => {
  // player mode never shows DM-only text, so nor what it links to
  const body = playerMode.value ? stripSecrets(props.e.body) : props.e.body
  const seen = new Set<string>([props.e.id, String(props.e.fields.campaign ?? '')])
  const groups = new Map<EntryType, Entry[]>()
  for (const [, raw] of body.matchAll(/\[\[([^\]|#]+)/g)) {
    const id = raw.replace(/\\$/, '').trim()
    const x = get(id)
    if (!x || seen.has(id) || x.type === 'encounter' || x.type === 'session' || hiddenFromPlayers(x)) continue
    seen.add(id)
    if (!groups.has(x.type)) groups.set(x.type, [])
    groups.get(x.type)!.push(x)
  }
  const rank = (t: EntryType) => (ORDER.indexOf(t) + 1 || 99)
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0])).map(([t, list]) => ({ t, label: TYPES[t].plural, list }))
})

// ---- encounters: set to this session, or linked from its text ----
const encounters = computed(() => {
  if (playerMode.value) return []
  const own = (byType.value.get('encounter') ?? []).filter(x => x.fields.session === props.e.id)
  const inText = [...props.e.body.matchAll(/\[\[([^\]|#]+)/g)].map(([, raw]) => get(raw.replace(/\\$/, '').trim()))
    .filter((x): x is Entry => x?.type === 'encounter' && !own.includes(x))
  return [...own, ...inText]
})
const newEncounter = () => newEntry('encounter', { session: props.e.id, ...(props.e.fields.campaign ? { campaign: props.e.fields.campaign } : {}) })
</script>

<template>
  <div class="card session-facts">
    <dl>
      <template v-if="date"><dt>In the world</dt><dd>{{ date }}</dd></template>
      <template v-if="e.fields.playedOn"><dt>Played on</dt><dd>{{ e.fields.playedOn }}</dd></template>
      <template v-if="players.length"><dt>Present</dt><dd><span class="chips"><EntryLink v-for="id in players" :key="id" :id="id" class="chip" /></span></dd></template>
    </dl>
    <p v-if="!date && !e.fields.playedOn && !players.length" class="muted small">No in-world date yet: ✎ Edit to set one.</p>
    <div v-if="pager && (pager.prev || pager.next)" class="pager session-pager">
      <EntryLink v-if="pager.prev" :id="pager.prev.id" :label="'← ' + pager.prev.name" />
      <span v-else />
      <EntryLink v-if="pager.next" :id="pager.next.id" :label="pager.next.name + ' →'" />
    </div>
  </div>

  <!-- encounters are the DM's: not in player mode -->
  <div v-if="!playerMode && (encounters.length || !state.readOnly)" class="card">
    <h3>Encounters <span v-if="encounters.length" class="muted small">{{ encounters.length }}</span>
      <button v-if="!state.readOnly" class="link-btn small push-right" title="A new encounter for this session" @click="newEncounter">＋ Encounter</button></h3>
    <ul v-if="encounters.length" class="plain"><li v-for="x in encounters" :key="x.id"><EntryLink :id="x.id" icon /></li></ul>
    <p v-else class="muted small">None yet.</p>
  </div>

  <div v-if="linked.length" class="card session-linked">
    <h3>In this session</h3>
    <template v-for="g in linked" :key="g.t">
      <h4>{{ g.label }} <span class="muted small">{{ g.list.length }}</span></h4>
      <ul class="plain"><li v-for="x in g.list" :key="x.id"><EntryLink :id="x.id" icon /></li></ul>
    </template>
  </div>
</template>
