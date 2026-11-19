<script setup lang="ts">
// Create an entry: a name, a type from the grid (the page's own type picked already), and, on a place's page, the
// place it belongs to. Names that already exist are pointed out. The new entry then opens in edit mode.
import TypeIcon from './TypeIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'
import type { Entry, EntryType } from '../model/types'
import { TYPES, typeWord } from '../model/schema'
import { addRelation, createEntry } from '../edit'
import { get, playerMode } from '../store'
import { carryOver } from '../checklist'
import { sessionNo, sessionsOf } from '../sessions'
import { search } from '../search'
import { go, hrefEntry, route } from '../router'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ type?: EntryType; fields?: Record<string, unknown> }>()

/** The most used types first. Player mode creates only what it shows. */
const ORDER: EntryType[] = ['npc', 'place', 'item', 'session', 'organization', 'event', 'note', 'spell', 'creature', 'encounter', 'pc', 'campaign', 'deity', 'race', 'feat', 'writing', 'subclass']
const PLAYER: EntryType[] = ['pc', 'campaign', 'session', 'note', 'place', 'event', 'spell', 'item']
const types = computed(() => ORDER.filter(t => TYPES[t] && (!playerMode.value || PLAYER.includes(t))))

const type = ref<EntryType>('npc')
const name = ref('')
const input = ref<HTMLInputElement>()
const grid = ref<HTMLDivElement>()

/** The entry whose page is open. */
const page = computed<Entry | undefined>(() => (route.current.name === 'entry' ? get(route.current.id) : undefined))
const pageType = computed<EntryType | undefined>(() => (route.current.name === 'list' ? route.current.type : page.value?.type))

watch(open, async v => {
  if (!v) return
  name.value = ''
  inPlace.value = true
  const want = props.type ?? pageType.value
  if (want && types.value.includes(want)) type.value = want
  if (!types.value.includes(type.value)) type.value = types.value[0]
  await nextTick()
  input.value?.focus()
})

// ---- on a place's page: a new place inside it, an NPC living there, an organization seated there ----
const place = computed(() => (page.value?.type === 'place' && !Object.keys(props.fields ?? {}).length ? page.value : undefined))
const inPlace = ref(true)
const placeText = computed(() => (type.value === 'place' ? 'Located in' : type.value === 'npc' ? 'Lives in' : type.value === 'organization' ? 'Seat in' : ''))

// ---- names that exist already ----
const norm = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const similar = computed(() => {
  const n = name.value.trim()
  if (n.length < 3) return []
  return search(n, 4).map(e => ({ e, exact: norm(e.name) === norm(n) || e.aliases.some(a => norm(a) === norm(n)) }))
    .filter(x => x.exact || norm(x.e.name).startsWith(norm(n)) || norm(n).startsWith(norm(x.e.name)))
    .sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, 3)
})
function openExisting(e: Entry) { open.value = false; go(hrefEntry(e.id)) }

/** Arrow keys move through the type grid (left/right, and up/down by its row length); Enter creates. */
function gridKey(ev: KeyboardEvent) {
  if (ev.key === 'Enter') { ev.preventDefault(); create(); return }
  const i = types.value.indexOf(type.value)
  const cols = Math.max(1, Math.round((grid.value?.clientWidth ?? 1) / ((grid.value?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1)))
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[ev.key]
  if (!step) return
  ev.preventDefault()
  const j = Math.max(0, Math.min(types.value.length - 1, i + step))
  type.value = types.value[j]
  ;(grid.value?.children[j] as HTMLElement | undefined)?.focus()
}

function create() {
  if (!name.value.trim()) return
  const fields = JSON.parse(JSON.stringify(props.fields ?? {}))
  const p = place.value && inPlace.value && placeText.value ? place.value : undefined
  if (p && type.value === 'place') fields.parent = p.id
  if (p && type.value === 'organization') fields.seat = p.id
  const e = createEntry(type.value, name.value, fields)
  if (p && type.value === 'npc') addRelation(e.id, p.id, 'lives-in')
  // a campaign's next session starts with the last one's headings and open checklist items
  if (e.type === 'session' && fields.campaign) {
    const before = sessionsOf(fields.campaign).filter(s => s.id !== e.id && (fields.number == null || sessionNo(s) < fields.number)).at(-1)
    if (before?.body.trim()) get(e.id)!.body = carryOver(before.body)
  }
  open.value = false
  go(hrefEntry(e.id, true))
}
</script>

<template>
  <div v-if="open" class="qs-backdrop" @mousedown.self="open = false" @keydown.esc="open = false">
    <form class="qs new-entry" @submit.prevent="create">
      <h3>New {{ typeWord(type) }}</h3>
      <input ref="input" v-model="name" class="new-name" placeholder="Name" aria-label="Name" />
      <ul v-if="similar.length" class="new-similar">
        <li v-for="s in similar" :key="s.e.id">
          <span class="muted">{{ s.exact ? 'Already exists:' : 'Similar:' }}</span>
          <TypeIcon :type="s.e.type" /> <b>{{ s.e.name }}</b> <span class="muted small">{{ TYPES[s.e.type].label }}</span>
          <button type="button" class="link-btn" @click="openExisting(s.e)">Open</button>
        </li>
      </ul>
      <div ref="grid" class="new-types" role="radiogroup" aria-label="Type" @keydown="gridKey">
        <button v-for="t in types" :key="t" type="button" role="radio" :aria-checked="type === t" :tabindex="type === t ? 0 : -1"
                class="new-type-btn" :class="{ on: type === t }" @click="type = t">
          <TypeIcon :type="t" /><span>{{ TYPES[t].label }}</span>
        </button>
      </div>
      <label v-if="place && placeText" class="new-in"><input v-model="inPlace" type="checkbox" /> {{ placeText }} <b>{{ place.name }}</b></label>
      <div class="actions">
        <button type="button" @click="open = false">Cancel</button>
        <button type="submit" class="primary" :disabled="!name.trim()">Create</button>
      </div>
    </form>
  </div>
</template>
