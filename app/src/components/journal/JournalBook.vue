<script setup lang="ts">
// A campaign as its journal: a book opened on a spread. The first spread is the cover and the campaign's overview;
// then one spread per session in the order they were played (its facts left, its notes right); the last is the blank
// page for the next session. ← and → (or the arrows at the edges) turn the pages; the address follows the session
// open, without a step in the history for every page; Home is the cover, End the blank page. A narrow window shows one page
// at a time.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Entry, Id } from '../../model/types'
import { sessionsOf, setCurrentCampaign } from '../../sessions'
import AppIcon from '../AppIcon.vue'
import { hrefEntry, hrefList, replaceTo } from '../../router'
import { state } from '../../store'
import { isShared } from '../../sync'
import JournalPage, { type Leaf } from './JournalPage.vue'
import { startTurn, turning as turnState, writeOnOpen } from '../../journal'
import LeafStrip from './LeafStrip.vue'

/** How many strips a turning page bends in. */
const STRIPS = 8
// ---- the stacks under the open spread: the pages read so far (left) and still to come (right) ----
/** At most this many sheets a side: one per page while there are no more pages than that, else that many. */
const MAX_SHEETS = 8
/** How thick a stack of `pages` is, in px: quick at first, slower later (1 page 2.2px, 8 pages 6.2px, 35 and more 13px). */
const stackThickness = (pages: number) => Math.min(13, 2.2 * Math.sqrt(pages))
/** How strongly sheet `depth` (0: right under the open page) of `sheets` curves, the open page's curve being 1: the
 * curve fades toward the cover, the less the deeper it lies. */
const sheetCurve = (depth: number, sheets: number) => 0.9 * (1 - depth / sheets)
/** How far out sheet `depth` of `sheets` reaches past the open page, as a share of the most (the bottom sheet's): each
 * deeper sheet steps out less than the one above it. */
const sheetOut = (depth: number, sheets: number) => 1 - (1 - (depth + 1) / sheets) ** 2
/** A stack's sheets for `pages` pages: how far each lies below the open page and out past it (px), and how much it
 * curves. A side with no pages: the open page's own edge only. */
function sheetsFor(pages: number): { off: string; out: string; k: string }[] {
  // a side with no pages under it still shows the paper's edge under the open page, as with one page left
  if (pages <= 0) pages = 1
  const n = Math.min(pages, MAX_SHEETS), t = stackThickness(pages)
  return Array.from({ length: n }, (_, d) => ({
    off: `${(((d + 1) * t) / n).toFixed(2)}px`, out: `${(0.6 * t * sheetOut(d, n)).toFixed(2)}px`, k: sheetCurve(d, n).toFixed(3),
  }))
}

/** `at`: the session the book is opened at (else the page last open in this campaign, else its latest session). */
const props = defineProps<{ campaign: Entry; at?: Id }>()

const sessions = computed(() => sessionsOf(props.campaign.id))
const leaves = computed<Leaf[]>(() => [{ kind: 'cover' }, ...sessions.value.map(s => ({ kind: 'session' as const, s })), { kind: 'next' }])
/** The page last open in each campaign this visit: a session's id, 'cover' or 'next'. */
const lastOpen = remembered()
function indexFor(at: Id | undefined): number {
  const l = leaves.value
  const key = at ?? lastOpen.get(props.campaign.id)
  if (key === 'cover') return 0
  if (key === 'next') return l.length - 1
  const i = key ? l.findIndex(x => x.kind === 'session' && x.s.id === key) : -1
  // a campaign opened afresh: its latest session (the cover while it has none)
  return i >= 0 ? i : Math.max(0, l.length - 2)
}
const page = ref(indexFor(props.at))
watch(() => [props.at, props.campaign.id, leaves.value.length] as const, () => { const i = indexFor(props.at); if (i !== page.value) page.value = i })
const leaf = computed(() => leaves.value[Math.min(page.value, leaves.value.length - 1)])
/** A session just made here opens for writing (journal.ts). */
const writeNow = writeOnOpen

// ---- turning the pages ----
/** The page turning over now, in this campaign's book (journal.ts). */
const turning = computed(() => (turnState.value?.campaign === props.campaign.id ? turnState.value : null))
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
function turnTo(i: number) {
  const l = leaves.value
  if (i < 0 || i >= l.length || i === page.value) return
  if (!reduced() && !narrow.value) startTurn(props.campaign.id, page.value, i > page.value ? 'fwd' : 'back')
  page.value = i
  writeNow.value = null
  const x = l[i]
  lastOpen.set(props.campaign.id, x.kind === 'session' ? x.s.id : x.kind)
  replaceTo(hrefEntry(x.kind === 'session' ? x.s.id : props.campaign.id))
}
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
function onKey(ev: KeyboardEvent) {
  if (ev.altKey || ev.ctrlKey || ev.metaKey || typing(ev.target) || document.querySelector('.modal-back')) return
  if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); turnTo(page.value + 1) }
  else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); turnTo(page.value - 1) }
  // the cover, and the blank page after the last session
  else if (ev.key === 'Home') { ev.preventDefault(); turnTo(0) }
  else if (ev.key === 'End') { ev.preventDefault(); turnTo(leaves.value.length - 1) }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// ---- one page at a time in a narrow window ----
const narrow = ref(window.innerWidth < 1000)
const onResize = () => { narrow.value = window.innerWidth < 1000 }
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))

/** Where the book is open, in words: "Session 12 of 63", "Cover", "Next page". */
const where = computed(() => (leaf.value.kind === 'cover' ? 'The party' : leaf.value.kind === 'next' ? 'The next session'
  : `Session ${leaf.value.s.fields.number ?? page.value} of ${sessions.value.length}`))
/** Where the spine line sits in the half circle at its foot: 0 at the first page (all the others on the right), 1 at the
 * last. */
const spineAt = computed(() => (leaves.value.length > 1 ? page.value / (leaves.value.length - 1) : 0.5).toFixed(3))
/** The sheets under each side: the pages before the open one, and after it. */
const sheetsL = computed(() => sheetsFor(page.value))
const sheetsR = computed(() => sheetsFor(Math.max(0, leaves.value.length - 1 - page.value)))
const editable = computed(() => !state.readOnly && !isShared(props.campaign))
const isCurrent = computed(() => state.db?.meta.currentCampaign === props.campaign.id)
</script>

<script lang="ts">
const lastOpenByCampaign = new Map<string, string>()
function remembered() { return lastOpenByCampaign }
</script>

<template>
  <div class="journal">
    <header class="journal-head">
      <div>
        <nav class="crumbs"><a class="crumb-root" :href="hrefList('campaign')">Campaigns</a></nav>
        <h1 class="journal-title">{{ campaign.name }}</h1>
      </div>
      <span class="spacer" />
      <!-- the campaign the app's Campaign menu opens (and home shows): marked here -->
      <button type="button" class="chip-btn journal-current" :class="{ on: isCurrent }" :title="isCurrent ? 'The Campaign menu opens this journal' : 'Open this journal from the Campaign menu'" @click="setCurrentCampaign(isCurrent ? undefined : campaign.id)">
        <AppIcon ui="star" :class="{ off: !isCurrent }" /> {{ isCurrent ? 'Current campaign' : 'Make current' }}</button>
      <span class="muted small journal-where">{{ where }}</span>
      <div class="journal-nav">
        <button type="button" title="Page 1: the campaign and its party (Home)" :disabled="page <= 0" @click="turnTo(0)">Party</button>
        <button type="button" title="The page before (←)" :disabled="page <= 0" @click="turnTo(page - 1)">◀</button>
        <button type="button" title="The page after (→)" :disabled="page >= leaves.length - 1" @click="turnTo(page + 1)">▶</button>
        <button type="button" title="The last page: the next session's (End)" :disabled="page >= leaves.length - 1" @click="turnTo(leaves.length - 1)">Last</button>
      </div>
      <a v-if="editable" class="button" :href="hrefEntry(campaign.id, true)" title="The campaign's own details: party, status, colour">✎ Campaign</a>
    </header>

    <div class="book" :class="{ single: narrow }">
      <button type="button" class="book-edge prev" title="The page before (←)" aria-label="The page before" :disabled="page <= 0" @click="turnTo(page - 1)">‹</button>
      <!-- the binding: the cover board behind, and the pages already read (left) and still to come (right) stacked
           under the open spread, as thick as they are many -->
      <div class="binding" :style="{ '--spine-f': spineAt }">
      <!-- the spine's foot: its back bending out below the board, the arch where the stacks meet, the pages tucked into it -->
      <i v-if="!narrow" class="spine-back" aria-hidden="true" /><i v-if="!narrow" class="spine-gap" aria-hidden="true" /><i v-if="!narrow" class="spine-tuck" aria-hidden="true" />
      <div v-if="!narrow" class="stack l" aria-hidden="true"><i v-for="(x, d) in sheetsL" :key="d" class="sheet" :style="{ '--d': d, '--k': x.k, '--o': x.off, '--ox': x.out }" /></div>
      <div v-if="!narrow" class="stack r" aria-hidden="true"><i v-for="(x, d) in sheetsR" :key="d" class="sheet" :style="{ '--d': d, '--k': x.k, '--o': x.off, '--ox': x.out }" /></div>
      <div class="spread">
        <template v-if="narrow">
          <JournalPage :campaign="campaign" :leaf="leaf" side="both" :num="page * 2 + 1" :write-now="leaf.kind === 'session' && leaf.s.id === writeNow" />
        </template>
        <template v-else>
          <JournalPage :campaign="campaign" :leaf="leaf" side="left" :num="page * 2 + 1" :turn-in="turning?.dir === 'fwd'" />
          <JournalPage :campaign="campaign" :leaf="leaf" side="right" :num="page * 2 + 1" :turn-in="turning?.dir === 'back'" :write-now="leaf.kind === 'session' && leaf.s.id === writeNow" />
          <!-- the page turning over: the one that was open, curling around the spine (in hinged strips), and the
               shadow it casts on the page it uncovers, then on the one it lands on -->
          <template v-if="turning && leaves[turning.from]">
            <div class="leaf-cast under" :class="turning.dir" aria-hidden="true" />
            <div class="leaf-cast land" :class="turning.dir" aria-hidden="true" />
            <div class="leaf" :class="turning.dir" :style="{ '--n': STRIPS }">
              <LeafStrip :campaign="campaign" :leaf="leaves[turning.from]" :num="turning.from * 2 + 1" :dir="turning.dir" :i="0" :n="STRIPS" />
            </div>
          </template>
        </template>
      </div>
      </div>
      <button type="button" class="book-edge next" title="The page after (→)" aria-label="The page after" :disabled="page >= leaves.length - 1" @click="turnTo(page + 1)">›</button>
    </div>
  </div>
</template>
