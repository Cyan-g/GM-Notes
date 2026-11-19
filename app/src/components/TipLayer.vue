<script setup lang="ts">
// One tooltip for the whole app: any element with data-tip shows its text right away on hover (or keyboard focus),
// placed against the window so scrolling tables and cards can't cut it off.
import { onMounted, onUnmounted, ref } from 'vue'

const text = ref('')
const pos = ref({ left: 0, top: 0 })
let current: HTMLElement | null = null

function show(el: HTMLElement) {
  const t = el.dataset.tip
  if (!t) return
  current = el
  text.value = t
  const r = el.getBoundingClientRect()
  const width = Math.min(352, window.innerWidth - 16)
  pos.value = { left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6 }
  // Above the element when there's no room below.
  requestAnimationFrame(() => {
    const box = document.querySelector('.tip-layer') as HTMLElement | null
    if (box && pos.value.top + box.offsetHeight > window.innerHeight - 8) pos.value = { ...pos.value, top: Math.max(8, r.top - box.offsetHeight - 6) }
  })
}
function hide() { current = null; text.value = '' }
function over(ev: Event) {
  const el = (ev.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null
  if (el && el !== current) show(el)
  else if (!el && current) hide()
}
onMounted(() => {
  document.addEventListener('mouseover', over)
  document.addEventListener('focusin', over)
  window.addEventListener('scroll', hide, true)
})
onUnmounted(() => {
  document.removeEventListener('mouseover', over)
  document.removeEventListener('focusin', over)
  window.removeEventListener('scroll', hide, true)
})
</script>

<template>
  <div v-if="text" class="tip-layer" role="tooltip" :style="{ left: pos.left + 'px', top: pos.top + 'px' }">{{ text }}</div>
</template>
