<script setup lang="ts">
// One tooltip for the whole app: any element with data-tip shows its text right away on hover (or keyboard focus),
// placed against the window so scrolling tables and cards can't cut it off. It's a manual popover, in the top layer,
// so it shows over an open dropdown's list too: an <option> with data-tip gets its tip beside the list.
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const text = ref('')
const pos = ref({ left: 0, top: 0 })
const box = ref<HTMLElement | null>(null)
let current: HTMLElement | null = null

async function show(el: HTMLElement) {
  const t = el.dataset.tip
  if (!t) return
  current = el
  text.value = t
  const r = el.getBoundingClientRect()
  const width = Math.min(352, window.innerWidth - 16)
  const beside = el.tagName === 'OPTION'
  pos.value = beside ? { left: r.right + 8, top: r.top } : { left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6 }
  await nextTick()
  const b = box.value
  if (!b || current !== el) return
  // shown again each time, so it's above whatever opened since (a dropdown's list)
  try { if (b.matches(':popover-open')) b.hidePopover(); b.showPopover() } catch { /* not in the page any more */ }
  const w = b.offsetWidth, h = b.offsetHeight
  if (beside) {
    // the list's other side when there's no room on the right; never under the window's bottom
    const left = r.right + 8 + w > window.innerWidth - 8 ? Math.max(8, r.left - w - 8) : r.right + 8
    pos.value = { left, top: Math.max(8, Math.min(r.top, window.innerHeight - h - 8)) }
  } else if (pos.value.top + h > window.innerHeight - 8) pos.value = { ...pos.value, top: Math.max(8, r.top - h - 6) }
}
function hide() {
  current = null; text.value = ''
  try { if (box.value?.matches(':popover-open')) box.value.hidePopover() } catch { /* gone */ }
}
function over(ev: Event) {
  const el = (ev.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null
  if (el && el !== current) void show(el)
  else if (!el && current) hide()
}
onMounted(() => {
  document.addEventListener('mouseover', over)
  document.addEventListener('focusin', over)
  document.addEventListener('change', hide, true)
  window.addEventListener('scroll', hide, true)
})
onUnmounted(() => {
  document.removeEventListener('mouseover', over)
  document.removeEventListener('focusin', over)
  document.removeEventListener('change', hide, true)
  window.removeEventListener('scroll', hide, true)
})
</script>

<template>
  <div ref="box" popover="manual" class="tip-layer" role="tooltip" :style="{ left: pos.left + 'px', top: pos.top + 'px' }">{{ text }}</div>
</template>
