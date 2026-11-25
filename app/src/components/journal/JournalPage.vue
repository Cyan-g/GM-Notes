<script setup lang="ts">
// One side of an open campaign journal (JournalBook): the cover and the campaign's overview, a session (its facts on
// the left, its notes on the right), or the blank page after the last one. A page scrolls within its bounds. Its text is
// written on the page itself: the pen opens the editor in place, the pen again (or Ctrl+S, Escape) closes it.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES } from '../../model/schema'
import { entries, formatDate, state } from '../../store'
import { changed } from '../../edit'
import { isShared } from '../../sync'
import { createSession, nextSessionNo, sessionsOf } from '../../sessions'
import { hrefEntry } from '../../router'
import MarkdownView from '../MarkdownView.vue'
import BodyEditor from '../edit/BodyEditor.vue'
import FieldInput from '../edit/FieldInput.vue'
import SessionSide from '../SessionSide.vue'
import DataImage from '../DataImage.vue'
import { writeOnOpen, writingOn } from '../../journal'
import EntryLink from '../EntryLink.vue'
import CampaignParty from '../CampaignParty.vue'
import CampaignJoin from '../CampaignJoin.vue'

export type Leaf = { kind: 'cover' } | { kind: 'session'; s: Entry } | { kind: 'next' }
/** `side`: left or right of a spread, or both (one page at a time, a narrow window). `still`: a page turning over,
 * shown only (no editing). */
/** `num`: the left page's number (the right one's is the next). */
const props = defineProps<{ campaign: Entry; leaf: Leaf; side: 'left' | 'right' | 'both'; num: number; still?: boolean; writeNow?: boolean; turnIn?: boolean }>()

const s = computed(() => (props.leaf.kind === 'session' ? props.leaf.s : undefined))
const showLeft = computed(() => props.side !== 'right')
const showRight = computed(() => props.side !== 'left')
/** Whose text this page holds: a session's notes, or (the cover's right page) the campaign's overview. */
const textOf = computed(() => s.value ?? (props.leaf.kind === 'cover' ? props.campaign : undefined))
/** Written here unless it's read-only: a read-only world, the DM's campaign in a player's world. */
const canWrite = computed(() => !props.still && !state.readOnly && !!textOf.value && !isShared(textOf.value))
const canTick = computed(() => !state.readOnly && !!textOf.value && !isShared(textOf.value))

// ---- the page's curve: its edges rise to a crest a quarter from the spine, level again at it (style.css, --dip 1.6%);
// the Illuminated frame follows it ----
const FRAME_LEFT = 'M0 1.6 L5 1.583 L10 1.531 L15 1.447 L20 1.335 L25 1.2 L30 1.047 L35 0.884 L40 0.716 L45 0.553 L50 0.4 L55 0.265 L60 0.153 L65 0.069 L70 0.017 L75 0 L80 0.07 L85 0.254 L90 0.482 L95 0.666 L100 0.736 L100 99.395 L95 99.346 L90 99.217 L85 99.058 L80 98.929 L75 98.88 L70 98.892 L65 98.928 L60 98.987 L55 99.065 L50 99.16 L45 99.267 L40 99.381 L35 99.499 L30 99.613 L25 99.72 L20 99.815 L15 99.893 L10 99.952 L5 99.988 L0 100 Z'
const FRAME_RIGHT = 'M100 1.6 L95 1.583 L90 1.531 L85 1.447 L80 1.335 L75 1.2 L70 1.047 L65 0.884 L60 0.716 L55 0.553 L50 0.4 L45 0.265 L40 0.153 L35 0.069 L30 0.017 L25 0 L20 0.07 L15 0.254 L10 0.482 L5 0.666 L0 0.736 L0 99.395 L5 99.346 L10 99.217 L15 99.058 L20 98.929 L25 98.88 L30 98.892 L35 98.928 L40 98.987 L45 99.065 L50 99.16 L55 99.267 L60 99.381 L65 99.499 L70 99.613 L75 99.72 L80 99.815 L85 99.893 L90 99.952 L95 99.988 L100 100 Z'

// ---- writing on the page ----
// (shared, journal.ts: while the right page is written, the left one shows the preview)
const writing = computed({
  get: () => !props.still && !!textOf.value && writingOn.value === textOf.value.id,
  set: v => { writingOn.value = v && textOf.value ? textOf.value.id : null },
})
// a page opened anew isn't being written, unless it was just made here; only the page that holds the text decides
// (by which page it is: the leaf object is made anew whenever the sessions change, as with every keystroke written)
const leafKey = computed(() => (props.leaf.kind === 'session' ? props.leaf.s.id : props.leaf.kind))
watch(() => [leafKey.value, props.writeNow] as const, () => { if (props.side !== 'left' && !props.still) writing.value = !!props.writeNow && canWrite.value }, { immediate: true })
/** The left page, while its right one is written: the text as it reads. */
const previewing = computed(() => props.side === 'left' && writing.value)
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
/** The campaign's notes, listed on page 2. */
const notes = computed(() => entries.value.filter(n => n.type === 'note' && n.fields.campaign === props.campaign.id).sort((a, b) => a.name.localeCompare(b.name)))
const firstLast = computed(() => {
  const l = sessionsOf(props.campaign.id).map(x => x.fields.date).filter(Boolean)
  return l.length ? [formatDate(l[0]), formatDate(l.at(-1))].filter((x, i, a) => x && a.indexOf(x) === i).join(' – ') : ''
})
</script>

<template>
  <!-- the left page -->
  <section v-if="showLeft" class="jpage jleft" :class="[leaf.kind, { 'turn-in': turnIn }]">
    <!-- the gilded frame along the page's curve (shown by the Illuminated style) -->
    <svg v-for="f in ['outer', 'inner']" :key="f" class="jframe" :class="f" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path :d="FRAME_LEFT" /></svg>
    <div class="jbody">
    <!-- while the right page is written: how it reads, here -->
    <template v-if="previewing && textOf">
      <p class="jpage-no">Preview</p>
      <MarkdownView v-if="textOf.body.trim()" :source="textOf.body" all-headings />
      <p v-else class="muted">Nothing written yet.</p>
    </template>
    <template v-else-if="leaf.kind === 'cover'">
      <!-- page 1: the campaign and its party -->
      <div class="jcover">
        <p class="jcover-kicker">Campaign journal</p>
        <h2 class="jcover-title">{{ campaign.name }}</h2>
        <DataImage v-if="campaign.image" :path="campaign.image" :alt="campaign.name" class="jcover-img" />
        <p class="muted small">{{ count }} session{{ count === 1 ? '' : 's' }}<template v-if="firstLast"> · {{ firstLast }}</template></p>
      </div>
      <CampaignParty :campaign="campaign" />
      <CampaignJoin v-if="!still" :campaign="campaign" />
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
    </div>
    <footer class="jfoot"><span class="jnum">{{ side === 'both' ? `${num}–${num + 1}` : num }}</span></footer>
  </section>

  <!-- the right page -->
  <section v-if="showRight" class="jpage jright" :class="[leaf.kind, { writing, 'turn-in': turnIn }]">
    <svg v-for="f in ['outer', 'inner']" :key="f" class="jframe" :class="f" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path :d="FRAME_RIGHT" /></svg>
    <div class="jbody">
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
      <!-- page 2: the campaign's notes, under its overview -->
      <section v-if="leaf.kind === 'cover' && notes.length" class="jnotes">
        <h3>Notes</h3>
        <ul class="plain"><li v-for="n in notes" :key="n.id"><EntryLink :id="n.id" icon /></li></ul>
      </section>
    </template>
    </div>
    <footer v-if="side !== 'both'" class="jfoot"><span class="jnum">{{ num + 1 }}</span></footer>
  </section>
</template>
