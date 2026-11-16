<script setup lang="ts">
// Everything inside an entry as rings: the entry in the centre, one ring per level outward,
// each slice as wide as the number of places it holds. Two rings show at a time; deeper places are on the next page.
// Clicking a slice opens that place (its page shows its own rings); clicking the centre goes up a level.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { hierarchy, partition, type HierarchyRectangularNode } from 'd3-hierarchy'
import { arc as d3arc } from 'd3-shape'
import { childrenOf, get } from '../store'
import { effectiveColors } from '../theme'
import { go, hrefEntry } from '../router'
import type { Entry, Id } from '../model/types'

// `rings`: how many levels show at once (2 on place pages, more on the Atlas).
const props = withDefaults(defineProps<{ id: Id; max?: number; rings?: number }>(), { max: 460, rings: 2 })

// Sized to the card: with room, the rings sit beside a legend; on a narrow card the legend goes below.
const LEGEND = 250
const box = ref<HTMLElement | null>(null)
const size = ref(300)
const wide = ref(false)
let ro: ResizeObserver | undefined
function fit(w: number) {
  wide.value = w >= 620
  size.value = Math.max(220, Math.min(props.max, wide.value ? w - LEGEND - 24 : w))
}
onMounted(() => {
  // Measure once straight away (a hidden tab gets no resize callbacks), then follow the card's width.
  if (box.value) fit(Math.floor(box.value.clientWidth))
  ro = new ResizeObserver(([e]) => fit(Math.floor(e.contentRect.width)))
  if (box.value) ro.observe(box.value)
})
onUnmounted(() => ro?.disconnect())

interface Node { id: Id; name: string; kids?: Node[] }
interface Pos { x0: number; x1: number; y0: number; y1: number }
type HNode = HierarchyRectangularNode<Node> & { cur: Pos }

const RINGS = props.rings

function build(e: Entry, seen = new Set<Id>()): Node {
  seen.add(e.id)
  const kids = (childrenOf.value.get(e.id) ?? []).filter(c => c.type === e.type && !seen.has(c.id))
  return { id: e.id, name: e.name, kids: kids.length ? kids.map(k => build(k, seen)) : undefined }
}

const root = computed(() => {
  const e = get(props.id)
  if (!e) return null
  const h = hierarchy(build(e), d => d.kids).sum(d => (d.kids ? 0 : 1)).sort((a, b) => b.value! - a.value! || a.data.name.localeCompare(b.data.name))
  const r = partition<Node>().size([2 * Math.PI, h.height + 1])(h) as HNode
  r.each(d => { (d as HNode).cur = { x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1 } })
  return r
})
const nodes = computed(() => (root.value?.descendants().slice(1) ?? []) as HNode[])

// Colours come from the theme: a gradient around the circle through the accent, the link colour and a
// deeper accent (back to the start, so there's no seam), each ring further out blending towards the card.
const theme = computed(() => effectiveColors())
const mix = (a: string, b: string, t: number) => {
  const p = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  const x = p(a), y = p(b)
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
const stops = computed(() => {
  const { accent, link, ink, bg } = theme.value
  return [accent, link, mix(accent, ink, 0.35), mix(link, bg, 0.3), accent]
})
function along(f: number) {
  const s = stops.value, x = Math.min(0.9999, Math.max(0, f)) * (s.length - 1), i = Math.floor(x)
  return mix(s[i], s[i + 1], x - i)
}
function color(d: HNode) {
  return mix(along((d.x0 + d.x1) / 2 / (2 * Math.PI)), theme.value.panel, Math.min(0.55, (d.depth - 1) * 0.18))
}
const textOn = (fill: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16) / 255)
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55 ? '#1a1410' : '#fffaf2'
}

const R = computed(() => size.value / 2)
const ringW = computed(() => R.value / (RINGS + 1))
const arcGen = computed(() => d3arc<Pos>()
  .startAngle(d => d.x0).endAngle(d => d.x1)
  .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005)).padRadius(R.value * 1.5)
  .innerRadius(d => d.y0 * ringW.value).outerRadius(d => Math.max(d.y0 * ringW.value, d.y1 * ringW.value - 1)))
const visible = (p: Pos) => p.y1 <= RINGS + 1 && p.y0 >= 1 && p.x1 > p.x0
const labelFits = (p: Pos) => visible(p) && (p.y1 - p.y0) * (p.x1 - p.x0) > 0.06
function labelTransform(p: Pos) {
  const x = ((p.x0 + p.x1) / 2) * 180 / Math.PI
  const y = ((p.y0 + p.y1) / 2) * ringW.value
  return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`
}
const short = (s: string, p: Pos) => {
  const room = Math.floor(((p.y1 - p.y0) * ringW.value) / 6.2)
  return s.length > room ? s.slice(0, Math.max(1, room - 1)) + '…' : s
}

const shown = computed(() => nodes.value.filter(d => visible(d.cur)))

const click = (d: HNode) => go(hrefEntry(d.data.id))
// The centre is the entry itself: clicking it goes to the place it sits in.
const up = computed(() => { const e = get(props.id); const p = e && get(e.fields.parent as string); return p && p.type === e.type ? p : null })
function goUp() { if (up.value) go(hrefEntry(up.value.id)) }

const hovered = ref<HNode | null>(null)
const ring1 = computed(() => (root.value?.children ?? []) as HNode[])
const path = (d: HNode) => d.ancestors().reverse().slice(1).map(a => a.data.name).join(' › ')
const inside = (d: HNode) => d.descendants().length - 1
</script>

<template>
  <div v-if="root && root.children" ref="box" class="sunburst" :class="{ wide }">
    <svg :viewBox="`${-R} ${-R} ${size} ${size}`" :width="size" :height="size" role="img" :aria-label="`Places inside ${root.data.name}, as rings`">
      <g @mouseleave="hovered = null">
        <path v-for="d in shown" :key="d.data.id + d.depth" :d="arcGen(d.cur) ?? ''" :fill="color(d)"
              class="sb-slice" :class="{ leaf: !d.children }"
              @mouseenter="hovered = d" @click="click(d)">
          <title>{{ path(d) }}{{ d.children ? ` · ${inside(d)} places` : '' }}</title>
        </path>
      </g>
      <g class="sb-labels" pointer-events="none">
        <text v-for="d in shown.filter(n => labelFits(n.cur))" :key="'t' + d.data.id + d.depth" :transform="labelTransform(d.cur)" :fill="textOn(color(d))" dy="0.35em">{{ short(d.data.name, d.cur) }}</text>
      </g>
      <circle :r="ringW - 2" class="sb-centre" :class="{ up: !!up }" @click="goUp"><title v-if="up">Up to {{ up.name }}</title></circle>
      <text class="sb-centre-label" dy="0.35em" pointer-events="none">{{ short(root.data.name, { x0: 0, x1: 7, y0: 0, y1: 1.15 }) }}</text>
    </svg>
    <div class="sb-side">
      <ul class="sb-legend">
        <li v-for="d in ring1" :key="d.data.id" :class="{ on: hovered && hovered.ancestors().includes(d) }" @mouseenter="hovered = d" @mouseleave="hovered = null">
          <span class="sb-swatch" :style="{ background: color(d) }" />
          <a :href="hrefEntry(d.data.id)">{{ d.data.name }}</a>
          <span v-if="d.children" class="sb-count">{{ inside(d) }}</span>
        </li>
      </ul>
      <div class="sb-info">
        <template v-if="hovered">{{ path(hovered) }}<span v-if="hovered.children" class="muted"> · {{ inside(hovered) }} places</span></template>
        <span v-else class="muted">Click a place to open it<template v-if="up">, the centre to go up to {{ up.name }}</template>.</span>
      </div>
    </div>
  </div>
</template>
