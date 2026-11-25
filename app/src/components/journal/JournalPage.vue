<script setup lang="ts">
// One side of an open campaign journal (JournalBook): the cover and the campaign's overview, a session (its facts on
// the left, its notes on the right), or the blank page after the last one. A page scrolls within its bounds. Its text is
// written on the page itself: the pen opens the editor in place, the pen again (or Ctrl+S, Escape) closes it.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES } from '../../model/schema'
import { formatDate, state } from '../../store'
import { changed } from '../../edit'
import { isShared } from '../../sync'
import { createSession, nextSessionNo, sessionsOf } from '../../sessions'
import { hrefEntry } from '../../router'
import MarkdownView from '../MarkdownView.vue'
import BodyEditor from '../edit/BodyEditor.vue'
import FieldInput from '../edit/FieldInput.vue'
import SessionSide from '../SessionSide.vue'
import DataImage from '../DataImage.vue'
import { writeOnOpen } from '../../journal'

export type Leaf = { kind: 'cover' } | { kind: 'session'; s: Entry } | { kind: 'next' }
/** `side`: left or right of a spread, or both (one page at a time, a narrow window). `still`: a page turning over,
 * shown only (no editing). */
const props = defineProps<{ campaign: Entry; leaf: Leaf; side: 'left' | 'right' | 'both'; still?: boolean; writeNow?: boolean; turnIn?: boolean }>()

const s = computed(() => (props.leaf.kind === 'session' ? props.leaf.s : undefined))
const showLeft = computed(() => props.side !== 'right')
const showRight = computed(() => props.side !== 'left')
/** Whose text this page holds: a session's notes, or (the cover's right page) the campaign's overview. */
const textOf = computed(() => s.value ?? (props.leaf.kind === 'cover' ? props.campaign : undefined))
/** Written here unless it's read-only: a read-only world, the DM's campaign in a player's world. */
const canWrite = computed(() => !props.still && !state.readOnly && !!textOf.value && !isShared(textOf.value))
const canTick = computed(() => !state.readOnly && !!textOf.value && !isShared(textOf.value))

// ---- writing on the page ----
const writing = ref(false)
watch(() => [props.leaf, props.writeNow] as const, () => { writing.value = !!props.writeNow && canWrite.value }, { immediate: true })
function setText(v: string) { const e = textOf.value; if (!e) return; e.body = v; changed(e) }
const onKey = (ev: KeyboardEvent) => {
  if (!writing.value && !details.value) return
  if (ev.key === 'Escape' || ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's')) {
    // Ctrl+S also saves (the app's own handler); here it closes the writing too
    if (ev.key === 'Escape') ev.stopPropagation()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    writing.value = false; details.value = false
  }
}
window.addEventListener('keydown', onKey, true)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

// ---- a session's details, edited on its left page ----
const details = ref(false)
const DETAIL_KEYS = ['number', 'playedOn', 'date', 'players']
const detailDefs = computed(() => TYPES.session.fields.filter(f => DETAIL_KEYS.includes(f.key)))
function rename(v: string) { const e = s.value; if (e && v.trim()) { e.name = v.trim(); changed(e) } }
/** "Session 12": the number on the page's top; a title of its own besides ("Session 12 - The Well") is its heading. */
const heading = computed(() => {
  const e = s.value
  if (!e) return ''
  const n = e.fields.number
  return n != null ? e.name.replace(new RegExp(`^Session\\s*${n}\\s*[-–—:]?\\s*`, 'i'), '') : e.name
})

// ---- the page after the last one ----
const notesOnly = computed(() => isShared(props.campaign))
const nextNo = computed(() => nextSessionNo(props.campaign.id))
function newPage() { const e = createSession(props.campaign.id, {}, 'page'); writeOnOpen.value = e.id }
const count = computed(() => sessionsOf(props.campaign.id).length)
const firstLast = computed(() => {
  const l = sessionsOf(props.campaign.id).map(x => x.fields.date).filter(Boolean)
  return l.length ? [formatDate(l[0]), formatDate(l.at(-1))].filter((x, i, a) => x && a.indexOf(x) === i).join(' – ') : ''
})
</script>

<template>
  <!-- the left page -->
  <section v-if="showLeft" class="jpage jleft" :class="[leaf.kind, { 'turn-in': turnIn }]">
    <template v-if="leaf.kind === 'cover'">
      <div class="jcover">
        <p class="jcover-kicker">Campaign journal</p>
        <h2 class="jcover-title">{{ campaign.name }}</h2>
        <DataImage v-if="campaign.image" :path="campaign.image" :alt="campaign.name" class="jcover-img" />
        <p class="muted small">{{ count }} session{{ count === 1 ? '' : 's' }}<template v-if="firstLast"> · {{ firstLast }}</template></p>
      </div>
    </template>
    <template v-else-if="leaf.kind === 'session' && s">
      <header class="jpage-head">
        <span class="jpage-no">Session {{ s.fields.number ?? '' }}</span>
        <button v-if="!still && !state.readOnly && !isShared(s)" type="button" class="link-btn small" :title="details ? 'Done' : 'Its date, who was there…'" @click="details = !details">{{ details ? 'Done' : '✎ Details' }}</button>
      </header>
      <h2 v-if="heading && heading !== s.name" class="jpage-title">{{ heading }}</h2>
      <h2 v-else class="jpage-title">{{ s.name }}</h2>
      <div v-if="details" class="jdetails form-grid">
        <label>Name</label><div><input :value="s.name" @change="rename(($event.target as HTMLInputElement).value)" /></div>
        <template v-for="f in detailDefs" :key="f.key">
          <label>{{ f.label }}</label><div><FieldInput :def="f" :entry="s" /></div>
        </template>
        <p class="full muted small">More (featured, loot, the timeline) on its <a :href="hrefEntry(s.id, true)">Edit page</a>.</p>
      </div>
      <SessionSide v-else :e="s" in-book />
    </template>
    <template v-else>
      <div class="jnext">
        <p class="jpage-no">Session {{ nextNo }}</p>
        <p class="muted">{{ notesOnly ? 'Your notes for the next session.' : 'The next session starts here.' }}</p>
        <button v-if="!state.readOnly && !still" type="button" class="primary" @click="newPage">＋ {{ notesOnly ? 'My session notes' : `Session ${nextNo}` }}</button>
      </div>
    </template>
  </section>

  <!-- the right page -->
  <section v-if="showRight" class="jpage jright" :class="[leaf.kind, { writing, 'turn-in': turnIn }]">
    <template v-if="textOf">
      <div v-if="canWrite" class="jpen">
        <button type="button" class="link-btn small" :title="writing ? 'Done writing (Ctrl+S)' : 'Write on this page'" @click="writing = !writing">{{ writing ? 'Done' : '✎ Write' }}</button>
      </div>
      <BodyEditor v-if="writing" :model-value="textOf.body" compact narrow @update:model-value="setText" />
      <template v-else>
        <!-- the whole outline, headings not filled in yet too: a journal page shows its template -->
        <MarkdownView v-if="textOf.body.trim()" :source="textOf.body" :tasks="canTick" all-headings @update:source="setText" />
        <p v-else-if="canWrite || leaf.kind !== 'cover'" class="muted jempty">{{ leaf.kind === 'cover' ? 'The campaign in a few lines: where it starts, what it is about.' : 'Nothing written yet.' }}
          <button v-if="canWrite" type="button" class="link-btn" @click="writing = true">✎ Write</button></p>
      </template>
      <p v-if="leaf.kind === 'cover' && notesOnly" class="muted small">Your DM's campaign: the pages after this one are your own session notes.</p>
    </template>
  </section>
</template>
