<script setup lang="ts">
// A place's map: drag to pan, wheel or buttons to zoom, pins that link to entries.
// With `editable`, pins can be added, dragged, linked and removed.
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import type { Entry, Pin } from '../model/types'
import { TYPES } from '../model/schema'
import { childrenOf, get, state } from '../store'
import { changed } from '../edit'
import { hrefEntry, hrefMap } from '../router'
import EntryPicker from './edit/EntryPicker.vue'

const props = withDefaults(defineProps<{ place: Entry; editable?: boolean; tall?: boolean; focusPin?: string }>(), { editable: false, tall: false })

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

const pins = computed<Pin[]>(() => (props.place.fields.pins as Pin[] | undefined) ?? [])
const pinName = (p: Pin) => get(p.entry)?.name ?? p.label ?? 'Pin'
const pinIcon = (p: Pin) => { const e = get(p.entry); return e ? TYPES[e.type].icon : '📌' }
const showLabels = ref(true)

// ---- pan & zoom ----
const box = ref<HTMLElement>()
const view = reactive({ x: 0, y: 0, s: 1 })
const minScale = ref(0.1)
function fit() {
  const el = box.value
  if (!el) return
  const s = Math.min(el.clientWidth / natural.w, el.clientHeight / natural.h)
  minScale.value = s * 0.8
  view.s = s
  view.x = (el.clientWidth - natural.w * s) / 2
  view.y = (el.clientHeight - natural.h * s) / 2
}
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
  drag = { kind: pinId && props.editable ? 'pin' : 'pan', id: pinId, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, moved: false }
  ;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
  if (pinId && props.editable) ev.stopPropagation()
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
  if (!(props.place.fields.pins as Pin[]).length) delete props.place.fields.pins
  selected.value = null
  changed(props.place)
}
/** Places inside this one that don't have a pin yet: quick to place. */
const unpinned = computed(() => (childrenOf.value.get(props.place.id) ?? []).filter(c => !pins.value.some(p => p.entry === c.id)))

function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') { placing.value = false; selected.value = null } }
window.addEventListener('keydown', onKey)
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="map-view" :class="{ tall, editing: editable, placing: !!placing }">
    <div ref="box" class="map-box" @wheel="onWheel" @pointerdown="down($event)" @pointermove="move" @pointerup="up">
      <div class="map-layer" :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, width: natural.w + 'px', height: natural.h + 'px' }">
        <img v-if="url" :src="url" draggable="false" alt="" @load="onLoad" />
        <template v-for="p in pins" :key="p.id">
          <component :is="p.entry && !editable ? 'a' : 'div'" class="pin" :class="{ sel: p.id === selected, linked: !!p.entry }"
            :href="p.entry && !editable ? hrefEntry(p.entry) : undefined"
            :style="{ left: p.x * 100 + '%', top: p.y * 100 + '%', transform: `translate(-50%, -100%) scale(${1 / view.s})` }"
            :title="p.note ? pinName(p) + '\n' + p.note : pinName(p)"
            @pointerdown.stop="down($event, p.id)">
            <span class="pin-head">{{ pinIcon(p) }}</span>
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
      <a v-if="!tall" :href="hrefMap(place.id)" class="small">Open large map</a>
    </div>

    <div v-if="editable" class="card pin-editor">
      <div class="row">
        <button :class="{ primary: placing && !placing.entry }" @click="placing = placing ? false : {}">{{ placing ? 'Click on the map… (Esc)' : '＋ Add pin' }}</button>
        <span class="muted small">Drag pins to move them.</span>
      </div>
      <div v-if="unpinned.length" class="unpinned">
        <span class="muted small">Not on the map yet:</span>
        <button v-for="c in unpinned" :key="c.id" class="chip-btn" :class="{ on: placing && placing.entry === c.id }" @click="placing = { entry: c.id }">{{ TYPES[c.type].icon }} {{ c.name }}</button>
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
