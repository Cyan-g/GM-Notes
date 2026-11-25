<script setup lang="ts">
// A text box with suggestions: type anything, or pick one from the list under it. It stands in for <input list> with a
// <datalist>, whose list is drawn by Chromium (it won't scroll in Electron and looks like nothing else in the app):
// this one is the app's floating list (as the search pickers', EntryPicker), filtered as you type, scrolled with the
// wheel, walked with the arrow keys, picked with Enter or a click, closed with Escape.
//   <SuggestInput :value="x" :options="['Alive', 'Dead']" @change="…" />     or v-model="x", like an <input>.
// Every other attribute and listener (class, placeholder, @change, @keydown.enter, v-model) goes to the <input>
// itself, and a pick sets its value and sends `input` and `change` as typing would, so a field that used a datalist
// works unchanged. `options`: words, or { value, label } when what's written differs from what's shown.
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, watch } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ options: (string | { value: string; label?: string })[]; /** With v-model. */ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const input = ref<HTMLInputElement>()
// What's in the box: its own copy, so a redraw (the list filtering as you type) never puts the field's saved value back
// over what's being typed (Vue writes an input's value on every redraw). It follows the field when that changes.
const attrs = useAttrs()
const outside = computed(() => String((props.modelValue !== undefined ? props.modelValue : attrs.value) ?? ''))
const current = ref(outside.value)
watch(outside, v => { current.value = v })
const open = ref(false)
const typed = ref('')
const sel = ref(-1)
const items = computed(() => props.options.map(o => (typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value })))
/** The suggestions matching what's typed (anywhere in them), each once; all of them while the box is empty. */
const shown = computed(() => {
  const q = typed.value.trim().toLowerCase(), seen = new Set<string>()
  return items.value.filter(o => {
    if (seen.has(o.value) || (q && !o.label.toLowerCase().includes(q) && !o.value.toLowerCase().includes(q))) return false
    seen.add(o.value)
    return true
  })
})
const showList = computed(() => open.value && shown.value.length > 0)

// The list floats over the page (fixed, at the box), so a card it sits in never grows or scrolls; upwards when
// there's no room below.
const place = ref<Record<string, string>>({})
function position() {
  const r = input.value?.getBoundingClientRect()
  if (!r) return
  const w = Math.max(180, r.width), below = window.innerHeight - r.bottom, up = below < 220 && r.top > below
  place.value = {
    left: `${Math.max(4, Math.min(r.left, window.innerWidth - w - 4))}px`, width: `${w}px`,
    ...(up ? { bottom: `${window.innerHeight - r.top + 2}px`, maxHeight: `${Math.min(300, r.top - 8)}px` } : { top: `${r.bottom + 2}px`, maxHeight: `${Math.min(300, below - 8)}px` }),
  }
}
function show() {
  if (open.value) return
  // opened on a box that already holds a value: the whole list, filtered only once something is typed
  typed.value = ''
  open.value = true
  sel.value = -1
  position()
  window.addEventListener('scroll', position, true)
  window.addEventListener('resize', position)
}
function hide() {
  open.value = false
  window.removeEventListener('scroll', position, true)
  window.removeEventListener('resize', position)
}
onBeforeUnmount(hide)
function onInput() {
  typed.value = input.value?.value ?? ''
  current.value = typed.value
  emit('update:modelValue', typed.value)
  sel.value = -1
  if (!open.value) show()
}
/** Write the pick into the box and tell the field, as typing it would have. */
function pick(value: string) {
  const el = input.value
  if (!el) return
  el.value = value
  current.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  typed.value = value
  hide()
}
// Keys are read before the field's own handlers (capture), so Enter on a highlighted suggestion picks it first and the
// field's Enter (add the chip) then sees the picked value.
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!open.value) show()
    if (!shown.value.length) return
    e.preventDefault()
    const n = shown.value.length
    sel.value = e.key === 'ArrowDown' ? (sel.value + 1) % n : (sel.value <= 0 ? n - 1 : sel.value - 1)
    void nextTick(() => document.querySelector('.suggest-list li.sel')?.scrollIntoView({ block: 'nearest' }))
  } else if (e.key === 'Enter' && showList.value && sel.value >= 0) {
    pick(shown.value[sel.value].value)
  } else if (e.key === 'Enter' && showList.value && typed.value.trim() && shown.value.length === 1) {
    // typed down to one suggestion ("steal" → Stealth): Enter takes it
    pick(shown.value[0].value)
  } else if (e.key === 'Escape' && open.value) {
    e.preventDefault()
    e.stopPropagation()
    hide()
  } else if (e.key === 'Tab') hide()
}
</script>

<template>
  <span class="suggest" @keydown.capture="onKey">
    <input ref="input" v-bind="$attrs" :value="current" autocomplete="off" @focus="show" @click="show" @input="onInput" @blur="hide" />
    <Teleport to="body">
      <ul v-if="showList" class="picker-list floating suggest-list" :style="place" role="listbox">
        <!-- mousedown: picked before the box loses focus (which closes the list) -->
        <li v-for="(o, i) in shown" :key="o.value" role="option" :aria-selected="i === sel" :class="{ sel: i === sel }" @mousedown.prevent="pick(o.value)" @mousemove="sel = i">{{ o.label }}</li>
      </ul>
    </Teleport>
  </span>
</template>
