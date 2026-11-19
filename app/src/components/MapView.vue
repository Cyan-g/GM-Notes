<script setup lang="ts">
// A place's map: drag to pan, wheel or buttons to zoom, pins that link to entries.
// With `editable`, pins can be added, dragged, linked and removed, and the map's scale set.
// Measure (travel.ts): click points or pins to lay a route; it shows the distance, the travel time at a pace or in
// a vehicle and the arrival date, and can be saved by name to show on the map again.
import { entryIcon } from '../model/classes'
import EntryIcon from './EntryIcon.vue'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Entry, MapRoute, MapScale, Pin } from '../model/types'
import { arrival, formatDistance, formatTravel, legs, modeOf, setOwnModes, travelHours, travelModes, DEFAULT_MODES, type TravelMode } from '../travel'
import { isShared } from '../sync'
import { TYPES } from '../model/schema'
import { childrenOf, formatDate, get, state } from '../store'
import { changed } from '../edit'
import { hrefEntry, hrefMap } from '../router'
import EntryPicker from './edit/EntryPicker.vue'

const props = withDefaults(defineProps<{ place: Entry; editable?: boolean; tall?: boolean; focusPin?: string; banner?: boolean }>(), { editable: false, tall: false, banner: false })

const url = ref<string | null>(null)
const natural = reactive({ w: 1, h: 1 })
watch(() => props.place.fields.map, async p => {
  url.value = p && state.storage ? await state.storage.fileUrl(String(p)) : null
}, { immediate: true })
function onLoad(ev: Event) {
  const img = ev.target as HTMLImageElement
  natural.w = img.naturalWidth || 1
  natural.h = img.naturalHeight || 1
  fit()
  if (props.focusPin) centerOn(props.focusPin)
}

const pins = computed<Pin[]>(() => (props.place.fields.pins) ?? [])
const pinName = (p: Pin) => get(p.entry)?.name ?? p.label ?? 'Pin'
const pinIcon = (p: Pin) => { const e = get(p.entry); return e ? entryIcon(e) : '📌' }
const showLabels = ref(true)

// ---- pan & zoom ----
const box = ref<HTMLElement>()
const view = reactive({ x: 0, y: 0, s: 1 })
const minScale = ref(0.1)
function fit() {
  const el = box.value
  if (!el) return
  const contain = Math.min(el.clientWidth / natural.w, el.clientHeight / natural.h)
  // A banner is wide and short: fill its width (cut off top and bottom) instead of showing the whole map small.
  const s = props.banner ? Math.max(el.clientWidth / natural.w, el.clientHeight / natural.h) : contain
  minScale.value = contain * 0.8
  view.s = s
  view.x = (el.clientWidth - natural.w * s) / 2
  view.y = (el.clientHeight - natural.h * s) / 2
}
// The box changes size with the window (the banner is full width): fit the map again.
let resizeTimer: number | undefined
const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(fit, 150) }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => { window.removeEventListener('resize', onResize); clearTimeout(resizeTimer) })
function zoomAt(factor: number, cx: number, cy: number) {
  const s = Math.min(8, Math.max(minScale.value, view.s * factor))
  const k = s / view.s
  view.x = cx - (cx - view.x) * k
  view.y = cy - (cy - view.y) * k
  view.s = s
}
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  const r = box.value!.getBoundingClientRect()
  zoomAt(ev.deltaY < 0 ? 1.2 : 1 / 1.2, ev.clientX - r.left, ev.clientY - r.top)
}
const zoomButton = (f: number) => zoomAt(f, box.value!.clientWidth / 2, box.value!.clientHeight / 2)
function centerOn(pinId: string) {
  const p = pins.value.find(x => x.id === pinId)
  const el = box.value
  if (!p || !el) return
  view.s = Math.max(view.s, Math.min(2, minScale.value * 3))
  view.x = el.clientWidth / 2 - p.x * natural.w * view.s
  view.y = el.clientHeight / 2 - p.y * natural.h * view.s
  selected.value = pinId
}

let drag: { kind: 'pan' | 'pin'; id?: string; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null
const toMap = (ev: PointerEvent) => {
  const r = box.value!.getBoundingClientRect()
  return { x: (ev.clientX - r.left - view.x) / (natural.w * view.s), y: (ev.clientY - r.top - view.y) / (natural.h * view.s) }
}
function down(ev: PointerEvent, pinId?: string) {
  if (ev.button !== 0) return
  drag = { kind: pinId && props.editable && !tool.value ? 'pin' : 'pan', id: pinId, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, moved: false }
  ;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
  if (pinId && (props.editable || tool.value)) ev.stopPropagation()
}
function move(ev: PointerEvent) {
  if (!drag) return
  const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
  if (drag.kind === 'pan') { view.x = drag.vx + dx; view.y = drag.vy + dy }
  else if (drag.moved) {
    const p = pins.value.find(x => x.id === drag!.id)
    if (p) { const m = toMap(ev); p.x = clamp(m.x); p.y = clamp(m.y) }
  }
}
function up(ev: PointerEvent) {
  if (!drag) return
  const d = drag
  drag = null
  // Measuring or setting the scale: a click (not a drag) adds a point, on a pin if one was clicked.
  if (tool.value && !d.moved) {
    const p = d.id ? pins.value.find(x => x.id === d.id) : undefined
    const m = p ? { x: p.x, y: p.y } : toMap(ev)
    if (m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1) addPoint({ x: clamp(m.x), y: clamp(m.y) })
    return
  }
  if (d.kind === 'pin') {
    if (d.moved) changed(props.place)
    else selected.value = d.id ?? null
    return
  }
  if (!d.moved && props.editable && placing.value) addPinAt(toMap(ev))
}
const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000

// ---- editing ----
const placing = ref<false | { entry?: string }>(false)
const selected = ref<string | null>(null)
const sel = computed(() => pins.value.find(p => p.id === selected.value))
function addPinAt(m: { x: number; y: number }) {
  if (m.x < 0 || m.x > 1 || m.y < 0 || m.y > 1) return
  const list = [...pins.value]
  let n = list.length + 1
  while (list.some(p => p.id === `p${n}`)) n++
  const pin: Pin = { id: `p${n}`, x: clamp(m.x), y: clamp(m.y) }
  if (placing.value && placing.value.entry) pin.entry = placing.value.entry
  list.push(pin)
  props.place.fields.pins = list
  changed(props.place)
  selected.value = pin.id
  placing.value = false
}
function setPin(patch: Partial<Pin>) {
  const p = sel.value
  if (!p) return
  Object.assign(p, patch)
  for (const k of ['entry', 'label', 'note'] as const) if (!p[k]) delete p[k]
  changed(props.place)
}
function removePin() {
  props.place.fields.pins = pins.value.filter(p => p.id !== selected.value)
  if (!(props.place.fields.pins).length) delete props.place.fields.pins
  selected.value = null
  changed(props.place)
}
/** Places inside this one that don't have a pin yet: quick to place. */
const unpinned = computed(() => (childrenOf.value.get(props.place.id) ?? []).filter(c => !pins.value.some(p => p.entry === c.id)))

// ---- measuring, routes and the scale (travel.ts) ----
type Pt = { x: number; y: number }
const scale = computed(() => props.place.fields.mapScale as MapScale | undefined)
const routes = computed(() => (props.place.fields.routes as MapRoute[] | undefined) ?? [])
const canSave = computed(() => !state.readOnly && !isShared(props.place))
const tool = ref<null | 'measure' | 'scale'>(null)
const draft = reactive<{ points: Pt[]; difficult: number[]; mode: string; id?: string; name: string }>({ points: [], difficult: [], mode: 'normal', name: '' })
const scalePts = ref<Pt[]>([])
const scaleIn = reactive({ distance: '', unit: 'mi' as 'mi' | 'ft' })
const shownRoutes = ref(new Set<string>())
const modes = computed(() => travelModes())
function addPoint(p: Pt) {
  if (tool.value === 'measure') draft.points.push(p)
  else if (tool.value === 'scale') scalePts.value = scalePts.value.length >= 2 ? [p] : [...scalePts.value, p]
}
function startMeasure() {
  if (tool.value === 'measure') { tool.value = null; return }
  tool.value = 'measure'; placing.value = false
}
function clearDraft() { Object.assign(draft, { points: [], difficult: [], id: undefined, name: '' }) }
function undoPoint() { draft.points.pop(); draft.difficult = draft.difficult.filter(i => i < draft.points.length - 1) }
function toggleDifficult(i: number) { draft.difficult = draft.difficult.includes(i) ? draft.difficult.filter(x => x !== i) : [...draft.difficult, i].sort((a, b) => a - b) }
const mode = computed(() => modeOf(draft.mode))
const unit = computed(() => scale.value?.unit ?? 'mi')
const draftLegs = computed(() => (scale.value ? legs(scale.value, draft.points) : []))
const sumOf = (l: number[]) => l.reduce((a, b) => a + b, 0)
/** Distance, travel time and arrival of a route (saved or being drawn). */
function trip(r: { points: Pt[]; difficult?: number[]; mode?: string }) {
  const s = scale.value
  if (!s || r.points.length < 2) return undefined
  const m = modeOf(r.mode), h = travelHours(s, r, m)
  return { distance: formatDistance(sumOf(legs(s, r.points)), s.unit), time: formatTravel(h, m), arrive: formatDate(arrival(h, m)), mode: m }
}
const draftTrip = computed(() => trip(draft))
function saveRoute() {
  const name = draft.name.trim()
  if (!name || draft.points.length < 2 || !canSave.value) return
  const list = [...routes.value]
  let id = draft.id
  if (!id) { let n = list.length + 1; while (list.some(r => r.id === `r${n}`)) n++; id = `r${n}` }
  const r: MapRoute = { id, name, points: draft.points.map(p => ({ ...p })), mode: draft.mode }
  if (draft.difficult.length) r.difficult = [...draft.difficult]
  const i = list.findIndex(x => x.id === id)
  if (i >= 0) list[i] = r; else list.push(r)
  props.place.fields.routes = list
  changed(props.place)
  draft.id = id
  shownRoutes.value = new Set([...shownRoutes.value, id])
}
function openRoute(r: MapRoute) {
  tool.value = 'measure'
  Object.assign(draft, { points: r.points.map(p => ({ ...p })), difficult: [...(r.difficult ?? [])], mode: r.mode ?? 'normal', id: r.id, name: r.name })
  shownRoutes.value = new Set([...shownRoutes.value].filter(x => x !== r.id))
}
function deleteRoute(r: MapRoute) {
  if (!canSave.value || !confirm(`Delete the route “${r.name}”?`)) return
  const list = routes.value.filter(x => x.id !== r.id)
  if (list.length) props.place.fields.routes = list; else delete props.place.fields.routes
  changed(props.place)
  if (draft.id === r.id) draft.id = undefined
}
function toggleShown(id: string) { const s = new Set(shownRoutes.value); if (s.has(id)) s.delete(id); else s.add(id); shownRoutes.value = s }
const visibleRoutes = computed(() => routes.value.filter(r => shownRoutes.value.has(r.id) && r.id !== (tool.value === 'measure' ? draft.id : undefined)))
function startScale() {
  if (tool.value === 'scale') { tool.value = null; return }
  tool.value = 'scale'; placing.value = false; scalePts.value = []
  scaleIn.distance = scale.value ? String(scale.value.distance) : ''; scaleIn.unit = scale.value?.unit ?? 'mi'
}
function saveScale() {
  const d = Number(scaleIn.distance)
  if (scalePts.value.length !== 2 || !(d > 0)) return
  props.place.fields.mapScale = { a: scalePts.value[0], b: scalePts.value[1], distance: d, unit: scaleIn.unit, w: natural.w, h: natural.h }
  changed(props.place)
  tool.value = null
}
const scaleText = computed(() => (scale.value ? `${formatDistance(scale.value.distance, scale.value.unit)} between two points` : ''))
// Own paces and vehicles (the 5e ones are built in).
const ownModes = computed(() => state.db?.meta.travelModes ?? [])
const putModes = (l: TravelMode[]) => setOwnModes(l.filter(m => m.label.trim()))
function addMode() { let n = ownModes.value.length + 1; while (travelModes().some(m => m.id === `own${n}`)) n++; setOwnModes([...ownModes.value, { id: `own${n}`, label: 'New', mph: 3 }]) }
const setMode = (i: number, patch: Partial<TravelMode>) => putModes(ownModes.value.map((m, k) => (k === i ? { ...m, ...patch } : m)))
/** A dot on the map that keeps its size while zooming. */
const dot = computed(() => 5 / view.s)

function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') { placing.value = false; selected.value = null; tool.value = null } }
window.addEventListener('keydown', onKey)
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="map-view" :class="{ tall, banner, editing: editable, placing: !!placing || !!tool }">
    <div ref="box" class="map-box" @wheel="onWheel" @pointerdown="down($event)" @pointermove="move" @pointerup="up">
      <div class="map-layer" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, width: natural.w + 'px', height: natural.h + 'px' }">
        <img v-if="url" :src="url" draggable="false" alt="" @load="onLoad" />
        <svg v-if="visibleRoutes.length || draft.points.length || scalePts.length" class="map-routes" :viewBox="`0 0 ${natural.w} ${natural.h}`" :width="natural.w" :height="natural.h" :style="{ '--sw': 3 / view.s, '--d1': 9 / view.s, '--d2': 7 / view.s, '--d3': 2 / view.s }">
          <g v-for="r in visibleRoutes" :key="r.id" class="route saved">
            <line v-for="(q, i) in r.points.slice(1)" :key="i" :x1="r.points[i].x * natural.w" :y1="r.points[i].y * natural.h" :x2="q.x * natural.w" :y2="q.y * natural.h" :class="{ difficult: r.difficult?.includes(i) }" />
          </g>
          <g v-if="tool === 'measure'" class="route draft">
            <line v-for="(q, i) in draft.points.slice(1)" :key="i" :x1="draft.points[i].x * natural.w" :y1="draft.points[i].y * natural.h" :x2="q.x * natural.w" :y2="q.y * natural.h" :class="{ difficult: draft.difficult.includes(i) }" />
            <circle v-for="(p, i) in draft.points" :key="'c' + i" :cx="p.x * natural.w" :cy="p.y * natural.h" :r="dot" />
          </g>
          <g v-if="tool === 'scale'" class="route scale">
            <line v-if="scalePts.length === 2" :x1="scalePts[0].x * natural.w" :y1="scalePts[0].y * natural.h" :x2="scalePts[1].x * natural.w" :y2="scalePts[1].y * natural.h" />
            <circle v-for="(p, i) in scalePts" :key="i" :cx="p.x * natural.w" :cy="p.y * natural.h" :r="dot" />
          </g>
        </svg>
        <template v-for="p in pins" :key="p.id">
          <component :is="p.entry && !editable ? 'a' : 'div'" class="pin" :class="{ sel: p.id === selected, linked: !!p.entry }"
            :href="p.entry && !editable ? hrefEntry(p.entry) : undefined"
            :style="{ left: p.x * 100 + '%', top: p.y * 100 + '%', transform: `translate(-50%, -100%) scale(${1 / view.s})` }"
            :title="p.note ? pinName(p) + '\n' + p.note : pinName(p)"
            @pointerdown.stop="down($event, p.id)" @click="tool && $event.preventDefault()">
            <span class="pin-head"><EntryIcon v-if="get(p.entry)" :e="get(p.entry)!" /><template v-else>📌</template></span>
            <span v-if="showLabels" class="pin-label">{{ pinName(p) }}</span>
          </component>
        </template>
      </div>
      <p v-if="!url" class="muted pad">No map picture for this place.</p>
    </div>

    <div class="map-tools">
      <button title="Zoom in" @click="zoomButton(1.4)">＋</button>
      <button title="Zoom out" @click="zoomButton(1 / 1.4)">－</button>
      <button title="Fit" @click="fit">⤢</button>
      <label class="toggle"><input v-model="showLabels" type="checkbox" /> Labels</label>
      <button v-if="!banner && url" :class="{ primary: tool === 'measure' }" title="Measure a route: distance, travel time and arrival" @click="startMeasure">📏 Measure</button>
      <button v-if="editable && url" :class="{ primary: tool === 'scale' }" :title="scale ? 'Scale: ' + scaleText + '. Click to set it again' : 'Set the map\'s scale from two points a known distance apart'" @click="startScale">{{ scale ? '⚖ Scale' : '⚖ Set scale' }}</button>
      <a v-if="!tall" :href="hrefMap(place.id)" class="small">Open large map</a>
    </div>

    <div v-if="tool === 'scale'" class="card map-travel">
      <h4>Set the scale</h4>
      <p class="muted small">Click two points a known distance apart: the ends of the map's scale bar, or two places you know the distance between.<template v-if="scale"> Now: {{ scaleText }}.</template></p>
      <div class="row">
        <span class="muted small">{{ scalePts.length }} / 2 points</span>
        <template v-if="scalePts.length === 2">
          <input v-model="scaleIn.distance" type="number" min="0" step="any" class="travel-num" placeholder="Distance" aria-label="Distance between the two points" />
          <select v-model="scaleIn.unit" aria-label="Unit"><option value="mi">miles</option><option value="ft">feet</option></select>
          <button class="primary" :disabled="!(Number(scaleIn.distance) > 0)" @click="saveScale">Save scale</button>
        </template>
        <button @click="tool = null">Cancel</button>
      </div>
    </div>

    <div v-if="!banner && (tool === 'measure' || routes.length)" class="card map-travel">
      <template v-if="tool === 'measure'">
        <h4>Measure <span class="muted small">click the map or pins to add points</span></h4>
        <p v-if="!scale" class="muted small">This map has no scale yet: <template v-if="editable">set one with ⚖ Set scale.</template><template v-else>set one with ✎ Edit pins → ⚖ Set scale.</template></p>
        <div class="row">
          <select v-model="draft.mode" aria-label="Pace or vehicle">
            <option v-for="m in modes" :key="m.id" :value="m.id">{{ m.label }} · {{ m.mph }} mph{{ m.allDay ? ', all day' : '' }}</option>
          </select>
        </div>
        <ol v-if="draftLegs.length" class="travel-legs">
          <li v-for="(d, i) in draftLegs" :key="i">
            <span>{{ formatDistance(d, unit) }}</span>
            <label class="toggle small"><input type="checkbox" :checked="draft.difficult.includes(i)" @change="toggleDifficult(i)" /> difficult terrain</label>
          </li>
        </ol>
        <p v-if="draftTrip" class="travel-total"><b>{{ draftTrip.distance }}</b> · <b>{{ draftTrip.time }}</b> <span class="muted">({{ mode.allDay ? '24' : '8' }} h a day)</span><template v-if="draftTrip.arrive"> · arrive <b>{{ draftTrip.arrive }}</b></template></p>
        <div class="row">
          <button :disabled="!draft.points.length" @click="undoPoint">Undo point</button>
          <button :disabled="!draft.points.length" @click="clearDraft">Clear</button>
          <template v-if="canSave && draft.points.length > 1">
            <input v-model="draft.name" class="travel-name" placeholder="Route name" aria-label="Route name" @keydown.enter="saveRoute" />
            <button class="primary" :disabled="!draft.name.trim()" @click="saveRoute">{{ draft.id ? 'Save route' : 'Save as route' }}</button>
          </template>
          <button @click="tool = null">Done</button>
        </div>
      </template>
      <template v-if="routes.length">
        <h4>Routes</h4>
        <ul class="travel-routes">
          <li v-for="r in routes" :key="r.id" :class="{ open: tool === 'measure' && draft.id === r.id }">
            <label class="toggle"><input type="checkbox" :checked="shownRoutes.has(r.id)" @change="toggleShown(r.id)" /> {{ r.name }}</label>
            <span v-if="trip(r)" class="muted small">{{ trip(r)!.distance }} · {{ trip(r)!.time }} · {{ trip(r)!.mode.label.toLowerCase() }}</span>
            <button class="link-btn" @click="openRoute(r)">Open</button>
            <button v-if="canSave" class="link-btn x" title="Delete this route" @click="deleteRoute(r)">✕</button>
          </li>
        </ul>
      </template>
      <details v-if="tool === 'measure' && !state.readOnly" class="travel-modes">
        <summary class="muted small">Paces &amp; vehicles…</summary>
        <p class="muted small">Built in (5e): {{ DEFAULT_MODES.map(m => `${m.label.toLowerCase()} ${m.mph} mph`).join(', ') }}. On foot or mounted a travel day is 8 hours; vehicles marked “all day” go around the clock.</p>
        <div v-for="(m, i) in ownModes" :key="m.id" class="row">
          <input :value="m.label" class="travel-name" aria-label="Name" @change="setMode(i, { label: ($event.target as HTMLInputElement).value })" />
          <input :value="m.mph" type="number" min="0.1" step="any" class="travel-num" aria-label="Miles per hour" @change="setMode(i, { mph: Number(($event.target as HTMLInputElement).value) || 1 })" /> mph
          <label class="toggle small"><input type="checkbox" :checked="!!m.allDay" @change="setMode(i, { allDay: ($event.target as HTMLInputElement).checked || undefined })" /> all day</label>
          <button class="link-btn x" title="Remove" @click="putModes(ownModes.filter((_, k) => k !== i))">✕</button>
        </div>
        <button class="chip-btn" @click="addMode">＋ Pace or vehicle</button>
      </details>
    </div>

    <div v-if="editable" class="card pin-editor">
      <div class="row">
        <button :class="{ primary: placing && !placing.entry }" @click="placing = placing ? false : {}">{{ placing ? 'Click on the map… (Esc)' : '＋ Add pin' }}</button>
        <span class="muted small">Drag pins to move them.</span>
      </div>
      <div v-if="unpinned.length" class="unpinned">
        <span class="muted small">Not on the map yet:</span>
        <button v-for="c in unpinned" :key="c.id" class="chip-btn" :class="{ on: placing && placing.entry === c.id }" @click="placing = { entry: c.id }"><EntryIcon :e="c" /> {{ c.name }}</button>
      </div>
      <template v-if="sel">
        <h4>Pin</h4>
        <div class="form-grid">
          <label>Links to</label><EntryPicker :model-value="sel.entry ?? null" placeholder="Choose an entry…" @update:model-value="v => setPin({ entry: v ?? undefined })" />
          <label>Label</label><input :value="sel.label ?? ''" :placeholder="sel.entry ? 'uses the entry name' : 'Name on the map'" @change="setPin({ label: ($event.target as HTMLInputElement).value.trim() })" />
          <label>Note</label><textarea rows="2" :value="sel.note ?? ''" @change="setPin({ note: ($event.target as HTMLTextAreaElement).value.trim() })" />
        </div>
        <button class="danger" @click="removePin">Remove pin</button>
      </template>
    </div>
  </div>
</template>
