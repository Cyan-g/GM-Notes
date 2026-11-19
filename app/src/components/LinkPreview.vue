<script setup lang="ts">
// Hovering a link to an entry shows a small card with what it is, without leaving the page.
import { entryIcon } from '../model/classes'
import EntryIcon from './EntryIcon.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { get } from '../store'
import { TYPES } from '../model/schema'
import { describe, excerpt } from '../describe'
import DataImage from './DataImage.vue'

const id = ref<string | null>(null)
const pos = ref({ x: 0, y: 0, above: false })
const e = computed(() => get(id.value))
let timer: number | undefined
let current: HTMLAnchorElement | null = null

function linkOf(t: EventTarget | null) {
  const a = (t as HTMLElement | null)?.closest?.('a[href^="#/e/"]') as HTMLAnchorElement | null
  if (!a || a.closest('.link-preview, .qs, .picker-list, .topbar, .menu-panel, .crumbs')) return null
  return a
}
function over(ev: MouseEvent) {
  const a = linkOf(ev.target)
  if (!a || a === current) return
  current = a
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    const target = decodeURIComponent(a.getAttribute('href')!.split('/')[2] ?? '')
    if (!get(target)) return
    const r = a.getBoundingClientRect()
    const above = r.bottom + 260 > window.innerHeight
    pos.value = { x: Math.min(r.left, window.innerWidth - 340), y: above ? r.top - 8 : r.bottom + 8, above }
    id.value = target
  }, 350)
}
function out(ev: MouseEvent) {
  const a = linkOf(ev.target)
  if (!a || a !== current) return
  if (a.contains(ev.relatedTarget as Node)) return
  current = null
  clearTimeout(timer)
  id.value = null
}
const hide = () => { clearTimeout(timer); id.value = null; current = null }
onMounted(() => {
  document.addEventListener('mouseover', over)
  document.addEventListener('mouseout', out)
  window.addEventListener('scroll', hide, true)
  window.addEventListener('hashchange', hide)
})
onUnmounted(() => {
  document.removeEventListener('mouseover', over)
  document.removeEventListener('mouseout', out)
  window.removeEventListener('scroll', hide, true)
  window.removeEventListener('hashchange', hide)
})
</script>

<template>
  <div v-if="e" class="link-preview" :class="{ above: pos.above }" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
    <DataImage v-if="e.image" :path="e.image" class="lp-img" />
    <div class="lp-text">
      <div class="lp-type"><EntryIcon :e="e" /> {{ TYPES[e.type].label }}<span v-if="e.visibility === 'secret'" class="lp-secret">DM only</span></div>
      <div class="lp-name">{{ e.name }}</div>
      <div v-if="describe(e)" class="lp-lead">{{ describe(e) }}</div>
      <p v-if="excerpt(e)" class="lp-excerpt">{{ excerpt(e) }}</p>
    </div>
  </div>
</template>
