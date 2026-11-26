<script setup lang="ts">
// A campaign as its journal: a book opened on a spread. The first spread is the cover and the campaign's overview;
// then one spread per session in the order they were played (its facts left, its notes right); the last is the blank
// page for the next session. ← and → (or the arrows at the edges) turn the pages; the address follows the session
// open, without a step in the history for every page; Home is the cover, End the blank page. A narrow window shows one page
// at a time.
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import type { Entry, Id } from '../../model/types'
import { sessionsOf, setCurrentCampaign } from '../../sessions'
import AppIcon from '../AppIcon.vue'
import { hrefEntry, hrefList, replaceTo } from '../../router'
import { state } from '../../store'
import { isShared } from '../../sync'
import JournalPage, { type Leaf } from './JournalPage.vue'
import { writeOnOpen } from '../../journal'
import LeafStrip from './LeafStrip.vue'
import { SEAM_HALF, STACK, bookShape, sheetClip, type ShapeInput } from './bookShape'
import { bookShapeKey } from '../../journal'
import { settings } from '../../theme'

/** How many strips a turning page bends in: fewer for one turned while others are still in the air (flipping through,
 * where the finer bend can't be seen and every strip is two more pages to draw). */
const STRIPS = 8, STRIPS_QUICK = 4
/** Flipping through: at most this many pages in the air at once, a new one at most every this many ms. */
const MAX_TURNS = 4, TURN_GAP = 120
// ---- the stacks under the open spread: the pages read so far (left) and still to come (right) ----
/** How many bands the book's pages are bound in across the seam: a sheet for each band's binding point. */
const BINDS = 24
/** Where those points lie across the seam's oval (px from its middle; SEAM_HALF to either side, as high as the stacks): evenly
 * spaced along its curved edge, from its left end (0) to its right (BINDS), so the gaps along the edge are all alike. */
const BIND_X = (() => {
  const a = SEAM_HALF, b = STACK, steps = 2000
  // the half oval's edge from its left end over the top to its right, and how far along it each step is
  const xs: number[] = [], along: number[] = [0]
  for (let k = 0; k <= steps; k++) xs.push(-a * Math.cos((Math.PI * k) / steps))
  for (let k = 1; k <= steps; k++) {
    const t0 = (Math.PI * (k - 1)) / steps, t1 = (Math.PI * k) / steps
    along.push(along[k - 1] + Math.hypot(a * (Math.cos(t0) - Math.cos(t1)), b * (Math.sin(t1) - Math.sin(t0))))
  }
  const total = along[steps]
  return Array.from({ length: BINDS + 1 }, (_, j) => {
    const want = (total * j) / BINDS
    let k = 0
    while (k < steps && along[k + 1] < want) k++
    const f = (want - along[k]) / Math.max(1e-9, along[k + 1] - along[k])
    return xs[k] + (xs[k + 1] - xs[k]) * Math.min(1, f)
  })
})()
/** The point across the oval for a place between the binding points (`slot` 0 to BINDS). */
const bindX = (slot: number) => {
  const j = Math.max(0, Math.min(BINDS - 1, Math.floor(slot)))
  return BIND_X[j] + (BIND_X[j + 1] - BIND_X[j]) * (slot - j)
}
/** How thick a stack of `pages` is, in px: quick at first, slower later (1 page 2.2px, 8 pages 6.2px, 35 and more 13px). */
const stackThickness = (pages: number) => Math.min(STACK, 2.2 * Math.sqrt(pages))
/** How strongly sheet `depth` (0: right under the open page) of `sheets` curves, the open page's curve being 1: the
 * curve fades toward the cover, the less the deeper it lies. */
const sheetCurve = (depth: number, sheets: number) => 0.9 * (1 - depth / sheets)
/** How far out sheet `depth` of `sheets` reaches past the open page, as a share of the most (the bottom sheet's): each
 * deeper sheet steps out less than the one above it. The most is the block's share of the seam: its pages are bound
 * across that much of the spine, the top one at the spine's place, the bottom one at the seam's end. */
const sheetOut = (depth: number, sheets: number) => 1 - (1 - (depth + 1) / sheets) ** 2
/** A stack's sheets for `pages` pages whose block spans `reach` px of the seam: how far each lies below the open page
 * and out past it (px), and how much it curves. A side with no pages: the open page's own edge only. */
function sheetsFor(side: 'l' | 'r', pages: number, reach: number, slot: number) {
  // the sheets are the binding points on this side of the spine (fixed across the seam: they don't move as the pages
  // turn, the spine moves across them), the nearest the spine on top; a side with none still shows one, at the seam's
  // end (the paper's edge under the open page)
  // (the deepest always at the seam's end, on the cover, so the block reaches down to it)
  let js = Array.from({ length: BINDS + 1 }, (_, j) => j).filter(j => (side === 'l' ? j < slot - 1e-6 : j > slot + 1e-6))
  js = side === 'l' ? js.reverse() : js
  if (!js.length) js = [side === 'l' ? 0 : BINDS]
  const n = js.length, t = stackThickness(Math.max(1, pages))
  return js.map((j, d) => ({
    off: ((d + 1) * t) / n, out: Math.max(0, reach) * sheetOut(d, n), k: sheetCurve(d, n), bind: BIND_X[j],
    // every page turned shows: the sheet next to the spine is as clear as the spine is far past its point (it comes in
    // over the turns after the spine passes it, and fades as the spine comes to it)
    alpha: d === 0 && n > 1 ? Math.min(1, 0.3 + 0.7 * Math.abs(slot - j)) : 1,
    // the lowest melts into the cover
    melt: n > 1 && d === n - 1,
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
/** The pages turning over now, oldest first (the book stays as it is across its pages, App.vue, so they go on as the
 * address changes): from which page to which, which way, in how many strips, and whether it's halfway over yet. */
interface Turn { id: number; from: number; to: number; dir: 'fwd' | 'back'; strips: number; settled: boolean }
const turns = ref<Turn[]>([])
let turnIds = 0, lastTurn = 0
const timers = new Map<number, number[]>()
/** A turn back while pages are still going forward (or the other way round) waits until they've landed. */
let queued: number | null = null
function endTurn(id: number) {
  for (const t of timers.get(id) ?? []) clearTimeout(t)
  timers.delete(id)
  turns.value = turns.value.filter(t => t.id !== id)
  if (!turns.value.length && queued !== null) { const q = queued; queued = null; turnTo(q) }
}
onBeforeUnmount(() => { for (const ts of timers.values()) ts.forEach(clearTimeout) })
/** The oldest page still in the air: the side it lands on still shows the page there until it's covered. */
const oldest = computed(() => turns.value[0] ?? null)
/** The spread the book's shape is for: while pages turn, still the one the oldest page not yet halfway over turns from
 * (where the spine sits, the paper under each side, how the pages are bound into the spine), so each comes down onto
 * the new shape. */
const shapedAt = computed(() => turns.value.find(t => !t.settled)?.from ?? page.value)
const isTurn = (e: AnimationEvent) => e.animationName === 'leaf-fwd' || e.animationName === 'leaf-back'
/** A turn's animation has started (once its pages are drawn): it's halfway over half its time later. */
function onTurnStart(t: Turn, e: AnimationEvent) {
  if (!isTurn(e) || e.target !== (e.currentTarget as Element).firstElementChild) return
  const ms = parseFloat(getComputedStyle(e.target as Element).animationDuration) * 1000
  timers.get(t.id)?.push(window.setTimeout(() => { const x = turns.value.find(y => y.id === t.id); if (x) x.settled = true }, ms * 0.5))
}
function onTurnEnd(t: Turn, e: AnimationEvent) { if (isTurn(e) && e.target === (e.currentTarget as Element).firstElementChild) endTurn(t.id) }
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
function turnTo(i: number) {
  const l = leaves.value
  if (i < 0 || i >= l.length || i === page.value) return
  if (!reduced() && !narrow.value) {
    const dir = i > page.value ? 'fwd' : 'back', now = performance.now()
    // flipping through: not faster than one every TURN_GAP ms, nor more than MAX_TURNS in the air; turning the other
    // way waits until the pages in the air have landed
    if (turns.value.length && turns.value[0].dir !== dir) { queued = i; return }
    if (turns.value.length >= MAX_TURNS || now - lastTurn < TURN_GAP) return
    lastTurn = now
    const t: Turn = { id: ++turnIds, from: page.value, to: i, dir, strips: turns.value.length ? STRIPS_QUICK : STRIPS, settled: false }
    turns.value.push(t)
    // (it ends when it has landed; this only in case its animation never ends)
    timers.set(t.id, [window.setTimeout(() => endTurn(t.id), 4000)])
  }
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
/** Where the spine sits across the seam's binding points (BINDS of them, 0 at its left end): at its ends on the first
 * page and the last; between, from just past the first point to just short of the last, so the first page turned
 * either way already shows a sheet of its own. */
const spineSlot = computed(() => {
  const n = leaves.value.length - 1, p = shapedAt.value
  if (n < 1) return BINDS / 2
  if (p <= 0) return 0
  if (p >= n) return BINDS
  return 1.4 + ((p - 1) * (BINDS - 2.8)) / Math.max(1, n - 2)
})
/** The same as a share of the seam's width: 0 its left end, 1 its right. */
const spineAt = computed(() => ((bindX(spineSlot.value) / SEAM_HALF + 1) / 2).toFixed(4))

// ---- the book's shape (bookShape.ts): each page's outline, its frame, its corner scrolls and its shadow into the
// spine, worked out in px from the spread's size, the spine's place and the paper under each side ----
const spreadEl = ref<HTMLElement | null>(null)
const spreadSize = ref({ w: 0, h: 0 })
let sizeWatch: ResizeObserver | null = null
onMounted(() => {
  if (!spreadEl.value) return
  const r = spreadEl.value.getBoundingClientRect()
  spreadSize.value = { w: r.width, h: r.height }
  sizeWatch = new ResizeObserver(([e]) => { if (e.contentRect.width) spreadSize.value = { w: e.contentRect.width, h: e.contentRect.height } })
  sizeWatch.observe(spreadEl.value)
})
onBeforeUnmount(() => sizeWatch?.disconnect())
/** How much lower a page sits than one on a full stack (px): as much as its stack is thinner (style.css --d-l, --d-r). */
const dropFor = (pages: number) => STACK - stackThickness(Math.max(1, pages))
const pagesL = computed(() => shapedAt.value)
const pagesR = computed(() => Math.max(0, leaves.value.length - 1 - shapedAt.value))
const dropL = computed(() => `${dropFor(pagesL.value).toFixed(2)}px`)
const dropR = computed(() => `${dropFor(pagesR.value).toFixed(2)}px`)
const shapeIn = computed<ShapeInput>(() => {
  const { w, h } = spreadSize.value
  return {
    w, h, shift: (Number(spineAt.value) * 2 - 1) * SEAM_HALF,
    dL: dropFor(pagesL.value), dR: dropFor(pagesR.value),
    bL: stackThickness(Math.max(1, pagesL.value)) / STACK, bR: stackThickness(Math.max(1, pagesR.value)) / STACK,
    // how strongly each page curves: as much as the paper under it lets it, flat on the cover with none
    aL: stackThickness(pagesL.value) / STACK, aR: stackThickness(pagesR.value) / STACK,
    fx: settings().flourish ?? 'plain',
  }
})
const shape = computed(() => bookShape(shapeIn.value))
/** The sheets under each side (the pages before the open one, and after it), each with its outline once the spread is
 * measured: the page's curve and bend, flatter the deeper it lies. */
function sheetsOf(side: 'l' | 'r', pages: number) {
  const measured = !!shape.value
  // the block's share of the seam: from the spine's place to the seam's end on its side
  const reach = SEAM_HALF + (side === 'l' ? 1 : -1) * shapeIn.value.shift
  return sheetsFor(side, pages, reach, spineSlot.value).map(x => ({
    melt: x.melt,
    style: { '--o': `${x.off.toFixed(2)}px`, '--ox': `${x.out.toFixed(2)}px`, '--k': x.k.toFixed(3), opacity: x.alpha.toFixed(2), ...(measured ? { clipPath: `path('${sheetClip(side, shapeIn.value, x)}')` } : {}) },
  }))
}
const sheetsL = computed(() => sheetsOf('l', pagesL.value))
const sheetsR = computed(() => sheetsOf('r', pagesR.value))
// the pages draw their frames from it (JournalPage)
provide(bookShapeKey, shape)
/** The binding's variables: where the spine is, each page's drop, and the shape's outlines, corners and shadows. */
const bindingVars = computed(() => {
  const v: Record<string, string> = { '--spine-f': spineAt.value, '--d-l': dropL.value, '--d-r': dropR.value }
  const sh = shape.value
  if (sh) {
    for (const [k, p] of [['l', sh.l], ['r', sh.r]] as const) {
      v[`--clip-${k}`] = `path('${p.clip}')`
      v[`--cn-top-${k}`] = `${p.cornerTop.toFixed(1)}px`
      v[`--cn-bottom-${k}`] = `${p.cornerBottom.toFixed(1)}px`
      v[`--gut-${k}`] = `${p.gutter.toFixed(1)}px`
      v[`--gut-a-${k}`] = p.gutterAlpha.toFixed(3)
    }
    // the spine line starts where the pages' top edges meet it
    v['--spine-top'] = `${sh.l.spineTop.toFixed(1)}px`
  }
  return v
})
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
      <div class="binding" :style="bindingVars">
      <!-- the spine's foot: its back bending out below the board, the seam where the pages meet it -->
      <i v-if="!narrow" class="spine-back" aria-hidden="true" /><i v-if="!narrow" class="spine-gap" aria-hidden="true" />
      <div v-if="!narrow" class="stack l" aria-hidden="true"><i v-for="(x, d) in sheetsL" :key="d" class="sheet" :class="{ melt: x.melt }" :style="{ '--d': d, '--dn': (d / Math.max(1, sheetsL.length - 1)).toFixed(3), ...x.style }" /></div>
      <div v-if="!narrow" class="stack r" aria-hidden="true"><i v-for="(x, d) in sheetsR" :key="d" class="sheet" :class="{ melt: x.melt }" :style="{ '--d': d, '--dn': (d / Math.max(1, sheetsR.length - 1)).toFixed(3), ...x.style }" /></div>
      <div ref="spreadEl" class="spread">
        <template v-if="narrow">
          <JournalPage :campaign="campaign" :leaf="leaf" side="both" :num="page * 2 + 1" :write-now="leaf.kind === 'session' && leaf.s.id === writeNow" />
        </template>
        <template v-else>
          <!-- while a page turns, the side it lands on still shows the page there until it's covered -->
          <JournalPage :campaign="campaign" :leaf="oldest?.dir === 'fwd' && leaves[oldest.from] ? leaves[oldest.from] : leaf" side="left"
                       :num="(oldest?.dir === 'fwd' ? oldest.from : page) * 2 + 1" />
          <JournalPage :campaign="campaign" :leaf="oldest?.dir === 'back' && leaves[oldest.from] ? leaves[oldest.from] : leaf" side="right"
                       :num="(oldest?.dir === 'back' ? oldest.from : page) * 2 + 1" :write-now="leaf.kind === 'session' && leaf.s.id === writeNow" />
          <!-- the page turning over: the one that was open, curling around the spine (in hinged strips), and the
               shadow it casts on the page it uncovers, then on the one it lands on -->
          <!-- (several at once when flipping through: in one 3D space, so the one further over lies above) -->
          <div v-if="turns.length" class="leaves">
            <template v-for="t in turns" :key="t.id">
              <template v-if="leaves[t.from] && leaves[t.to]">
                <div class="leaf-cast under" :class="t.dir" aria-hidden="true" />
                <div class="leaf-cast land" :class="t.dir" aria-hidden="true" />
                <div class="leaf" :class="t.dir" :style="{ '--n': t.strips }" @animationstart="onTurnStart(t, $event)" @animationend="onTurnEnd(t, $event)">
                  <LeafStrip :campaign="campaign" :leaf="leaves[t.from]" :num="t.from * 2 + 1" :back-leaf="leaves[t.to]" :back-num="t.to * 2 + 1"
                             :dir="t.dir" :i="0" :n="t.strips" />
                </div>
              </template>
            </template>
          </div>
        </template>
      </div>
      </div>
      <button type="button" class="book-edge next" title="The page after (→)" aria-label="The page after" :disabled="page >= leaves.length - 1" @click="turnTo(page + 1)">›</button>
    </div>
  </div>
</template>
