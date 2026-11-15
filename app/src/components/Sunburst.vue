<script setup lang="ts">
// Everything inside an entry as rings: the entry in the centre, one ring per level outward,
// each slice as wide as the number of places it holds. Three rings show at a time.
// Click a slice to zoom into it (or open it if it has nothing inside), click the centre to zoom out.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { hierarchy, partition, type HierarchyRectangularNode } from 'd3-hierarchy'
import { arc as d3arc } from 'd3-shape'
import { childrenOf, get, state } from '../store'
import { go, hrefEntry } from '../router'
import type { Entry, Id } from '../model/types'

const props = withDefaults(defineProps<{ id: Id; max?: number }>(), { max: 560 })

// As wide as the card it sits in (up to `max`).
const box = ref<HTMLElement | null>(null)
const size = ref(300)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(([e]) => { size.value = Math.max(220, Math.min(props.max, Math.floor(e.contentRect.width))) })
  if (box.value) ro.observe(box.value)
})
onUnmounted(() => ro?.disconnect())

interface Node { id: Id; name: string; kids?: Node[] }
interface Pos { x0: number; x1: number; y0: number; y1: number }
type HNode = HierarchyRectangularNode<Node> & { cur: Pos; from: Pos; target: Pos }

const RINGS = 3
const HUES = ['#e0835f', '#d9a441', '#7fb069', '#4fa3a5', '#6c8ed9', '#a07ad6', '#d6739b', '#c9785a']

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
  r.each(d => { const n = d as HNode; n.cur = n.from = n.target = { x0: n.x0, x1: n.x1, y0: n.y0, y1: n.y1 } })
  return r
})
const nodes = computed(() => (root.value?.descendants().slice(1) ?? []) as HNode[])
const focus = ref<HNode | null>(null)
watch(root, r => { focus.value = r }, { immediate: true })

// Colours follow the slice's ring-1 ancestor (relative to the entry), paler further out.
const panel = ref('#201c19')
watch(() => JSON.stringify(state.db?.meta.theme), () => requestAnimationFrame(() => {
  panel.value = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || panel.value
}), { immediate: true })
const mix = (a: string, b: string, t: number) => {
  const p = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  const x = p(a), y = p(b)
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}
function color(d: HNode) {
  const ring1 = d.ancestors().reverse()[1]
  const i = root.value!.children!.indexOf(ring1)
  return mix(HUES[i % HUES.length], /^#[0-9a-f]{6}$/i.test(panel.value) ? panel.value : '#201c19', Math.min(0.65, (d.depth - 1) * 0.2))
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

// ---- zoom with a short animation ----
let raf = 0
function zoomTo(f: HNode) {
  focus.value = f
  for (const d of [root.value!, ...nodes.value] as HNode[]) {
    d.from = d.cur
    d.target = {
      x0: Math.max(0, Math.min(1, (d.x0 - f.x0) / (f.x1 - f.x0))) * 2 * Math.PI,
      x1: Math.max(0, Math.min(1, (d.x1 - f.x0) / (f.x1 - f.x0))) * 2 * Math.PI,
      y0: Math.max(0, d.y0 - f.depth),
      y1: Math.max(0, d.y1 - f.depth),
    }
  }
  const start = performance.now()
  cancelAnimationFrame(raf)
  // A hidden tab gets no animation frames: jump straight to the end.
  if (document.visibilityState !== 'visible') { for (const d of nodes.value) d.cur = d.target; tick.value++; return }
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 450)
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    for (const d of nodes.value) {
      d.cur = {
        x0: d.from.x0 + (d.target.x0 - d.from.x0) * e, x1: d.from.x1 + (d.target.x1 - d.from.x1) * e,
        y0: d.from.y0 + (d.target.y0 - d.from.y0) * e, y1: d.from.y1 + (d.target.y1 - d.from.y1) * e,
      }
    }
    tick.value++
    if (t < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}
onUnmounted(() => cancelAnimationFrame(raf))
const tick = ref(0)
const shown = computed(() => { void tick.value; return nodes.value.filter(d => visible(d.cur) || visible(d.target)) })

function click(d: HNode) {
  if (d.children) zoomTo(d)
  else go(hrefEntry(d.data.id))
}
function zoomOut() { if (focus.value?.parent) zoomTo(focus.value.parent as HNode) }

const hovered = ref<HNode | null>(null)
const path = (d: HNode) => d.ancestors().reverse().slice(1).map(a => a.data.name).join(' › ')
const inside = (d: HNode) => d.descendants().length - 1
</script>

<template>
  <div v-if="root && root.children" ref="box" class="sunburst">
    <svg :viewBox="`${-R} ${-R} ${size} ${size}`" :width="size" :height="size" role="img" :aria-label="`Places inside ${root.data.name}, as rings`">
      <g @mouseleave="hovered = null">
        <path v-for="d in shown" :key="d.data.id + d.depth" :d="arcGen(d.cur) ?? ''" :fill="color(d)"
              :fill-opacity="visible(d.cur) ? 1 : 0" class="sb-slice" :class="{ leaf: !d.children }"
              @mouseenter="hovered = d" @click="click(d)">
          <title>{{ path(d) }}{{ d.children ? ` · ${inside(d)} places` : '' }}</title>
        </path>
      </g>
      <g class="sb-labels" pointer-events="none">
        <text v-for="d in shown.filter(n => labelFits(n.cur))" :key="'t' + d.data.id + d.depth" :transform="labelTransform(d.cur)" dy="0.35em">{{ short(d.data.name, d.cur) }}</text>
      </g>
      <circle :r="ringW - 2" class="sb-centre" :class="{ up: !!focus?.parent }" @click="zoomOut" />
      <text class="sb-centre-label" dy="0.35em" pointer-events="none">{{ short(focus?.data.name ?? '', { x0: 0, x1: 7, y0: 0, y1: 1.15 }) }}</text>
    </svg>
    <div class="sb-info">
      <template v-if="hovered">{{ path(hovered) }}<span v-if="hovered.children" class="muted"> · {{ inside(hovered) }} places</span></template>
      <template v-else-if="focus && focus.parent">
        <a :href="hrefEntry(focus.data.id)">Open {{ focus.data.name }}</a> <span class="muted">· centre zooms out</span>
      </template>
      <span v-else class="muted">Click a ring to zoom in, a place without rings opens it.</span>
    </div>
  </div>
</template>
