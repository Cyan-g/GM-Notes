<script setup lang="ts">
// Events as dots on a year axis; relations as bars grouped by the organization or place they belong to.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Id } from '../model/types'
import { RELATION_KINDS } from '../model/schema'
import { db, get, formatDate } from '../store'
import { go, hrefEntry } from '../router'
import { type TItem, yearPos } from '../timeline'
import { formatYear } from '../calendar'

const props = defineProps<{ items: TItem[]; from?: number | null; to?: number | null; focus?: Id | null }>()

const root = ref<HTMLElement>()
const width = ref(800)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = e.contentRect.width })
  if (root.value) ro.observe(root.value)
})
onUnmounted(() => ro?.disconnect())

const now = computed(() => yearPos(db().meta.today))
const COLORS = computed(() => Object.fromEntries(db().meta.eventCategories.map(c => [c.name, c.color])))

const domain = computed(() => {
  const ys: number[] = []
  for (const it of props.items) {
    if (it.start) ys.push(yearPos(it.start))
    if (it.end) ys.push(yearPos(it.end))
    if (it.kind === 'relation' && !it.end) ys.push(now.value)
  }
  let lo = props.from ?? (ys.length ? Math.min(...ys) : now.value - 10)
  let hi = props.to != null ? props.to + 1 : (ys.length ? Math.max(...ys) : now.value)
  if (hi - lo < 4) { lo -= 2; hi += 2 }
  const pad = (hi - lo) * 0.04
  return { lo: lo - (props.from != null ? 0 : pad), hi: hi + (props.to != null ? 0 : pad) }
})
const pct = (y: number) => ((y - domain.value.lo) / (domain.value.hi - domain.value.lo)) * 100
const clamp = (v: number) => Math.max(0, Math.min(100, v))

const ticks = computed(() => {
  const { lo, hi } = domain.value
  const span = hi - lo
  const target = Math.max(3, Math.floor(width.value / 90))
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find(s => span / s <= target) ?? 5000
  const out: number[] = []
  for (let y = Math.ceil(lo / step) * step; y <= hi; y += step) out.push(y)
  return out
})
const yearLabel = (y: number) => (y < 0 ? formatYear(db().meta.calendar, y) : `${y}`)

// ---- events row: stack dots into lanes so labels don't overlap ----
const events = computed(() => {
  const pts = props.items.filter(it => it.kind !== 'relation' && it.start)
    .map(it => ({ it, x: pct(yearPos(it.start!)), x2: it.end ? pct(yearPos(it.end)) : null, label: get(it.entry)?.name ?? '' }))
    .sort((a, b) => a.x - b.x)
  const lanes: number[] = []
  const pxPerPct = width.value / 100
  return pts.map(p => {
    const labelPx = p.label.length * 6.6 + 22
    const flip = p.x2 == null && p.x * pxPerPct + labelPx > width.value
    const startPx = flip ? p.x * pxPerPct - labelPx : p.x * pxPerPct
    const endPx = flip ? p.x * pxPerPct + 8 : Math.max(startPx + labelPx, (p.x2 ?? 0) * pxPerPct)
    let lane = lanes.findIndex(r => r < startPx)
    if (lane < 0) { lane = lanes.length; lanes.push(0) }
    lanes[lane] = endPx + 6
    return { ...p, lane, flip }
  })
})
const eventLanes = computed(() => Math.max(1, ...events.value.map(e => e.lane + 1)))

// ---- relation bars grouped by what they're attached to ----
const LEAD = 6 // % of the axis for an unknown start
const groups = computed(() => {
  const map = new Map<Id, { id: Id; label: string; bars: any[]; first: number }>()
  for (const it of props.items) {
    if (it.kind !== 'relation') continue
    const r = it.rel!
    // Group by the side people belong to: the organization, place, deity…
    const groupId = r.b
    const k = RELATION_KINDS[r.kind]
    if (!map.has(groupId)) map.set(groupId, { id: groupId, label: `${get(groupId)?.name ?? '?'}`, bars: [], first: Infinity })
    const g = map.get(groupId)!
    const endY = it.end ? yearPos(it.end) : now.value
    const right = clamp(pct(endY))
    const left = it.start ? clamp(pct(yearPos(it.start))) : Math.max(0, right - LEAD)
    g.first = Math.min(g.first, it.start ? yearPos(it.start) : endY - 1)
    g.bars.push({
      key: r.id, flip: left > 62, left, width: Math.max(0.6, right - left), unknownStart: !it.start, ongoing: !it.end,
      who: r.a, label: `${get(r.a)?.name ?? '?'}${r.role ? ' · ' + r.role : ''}`,
      title: `${get(r.a)?.name} ${k.forward} ${get(r.b)?.name}${r.role ? ` (${r.role})` : ''}\n${it.start ? formatDate(it.start) : 'before records'} – ${it.end ? formatDate(it.end) : 'now'}`,
    })
  }
  return [...map.values()].sort((a, b) => a.first - b.first).map(g => ({ ...g, bars: g.bars.sort((a, b) => a.left - b.left) }))
})
const nowPct = computed(() => pct(now.value))
</script>

<template>
  <div ref="root" class="tl-chart">
    <div class="tl-axis">
      <span v-for="t in ticks" :key="t" class="tl-tick" :style="{ left: pct(t) + '%' }">{{ yearLabel(t) }}</span>
    </div>
    <div class="tl-body">
      <div v-if="nowPct >= 0 && nowPct <= 100" class="tl-now" :style="{ left: nowPct + '%' }"><span>now</span></div>
      <div v-for="t in ticks" :key="'g' + t" class="tl-grid" :style="{ left: pct(t) + '%' }" />

      <template v-if="events.length">
        <div class="tl-group-title">Events</div>
        <div class="tl-events" :style="{ height: eventLanes * 26 + 'px' }">
          <a v-for="e in events" :key="e.it.key" class="tl-event" :class="{ flip: e.flip }" :href="hrefEntry(e.it.entry!)"
             :style="{ left: e.x + '%', top: e.lane * 26 + 'px', '--c': COLORS[e.it.category] ?? 'var(--accent-2)' }"
             :title="`${e.label}\n${formatDate(e.it.start)}${e.it.end ? ' – ' + formatDate(e.it.end) : ''}`">
            <span v-if="e.x2 != null" class="tl-span" :style="{ width: ((e.x2 - e.x) * width / 100) + 'px' }" />
            <span class="tl-dot" />{{ e.label }}
          </a>
        </div>
      </template>

      <div v-for="g in groups" :key="g.id" class="tl-group">
        <div class="tl-group-title"><a :href="hrefEntry(g.id)">{{ g.label }}</a></div>
        <div v-for="b in g.bars" :key="b.key" class="tl-row">
          <div class="tl-bar" :class="{ unknown: b.unknownStart, ongoing: b.ongoing, flip: b.flip }" :style="{ left: b.left + '%', width: b.width + '%' }"
               :title="b.title" @click="go(hrefEntry(b.who))">
            <span class="tl-bar-label">{{ b.label }}</span>
          </div>
        </div>
      </div>
      <p v-if="!events.length && !groups.length" class="muted pad">Nothing to draw.</p>
    </div>
  </div>
</template>
