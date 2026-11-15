<script setup lang="ts">
// One dropdown panel. A row with children opens another panel beside it (hover, or the › button on touch).
// Panels are position: fixed so a scrolling parent never clips its submenus.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { MenuNode } from '../menu'

const props = defineProps<{ items: MenuNode[]; anchor: DOMRect; level: number }>()
const emit = defineEmits<{ close: []; back: []; enter: [] }>()

const el = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0 })
const openIndex = ref<number | null>(null)
const childAnchor = ref<DOMRect | null>(null)
const narrow = ref(window.innerWidth < 640)
let timer: number | undefined

const children = computed(() => (openIndex.value != null ? props.items[openIndex.value].children?.() ?? [] : []))

function place() {
  const a = props.anchor
  const p = el.value!
  if (narrow.value) { pos.value = { left: 8, top: props.level === 0 ? a.bottom : a.top }; return }
  const w = p.offsetWidth, h = p.offsetHeight
  let left = props.level === 0 ? a.left : a.right - 2
  let top = props.level === 0 ? a.bottom + 2 : a.top - 5
  if (left + w > innerWidth - 8) left = props.level === 0 ? innerWidth - w - 8 : a.left - w + 2
  left = Math.max(8, left)
  top = Math.max(8, Math.min(top, innerHeight - h - 8))
  pos.value = { left, top }
}
onMounted(() => nextTick(place))
const onResize = () => { narrow.value = innerWidth < 640; place() }
window.addEventListener('resize', onResize)
onUnmounted(() => { window.removeEventListener('resize', onResize); clearTimeout(timer) })

/** The pointer reached this panel: keep it (and its parent's open row) open. */
function hold() { clearTimeout(timer); emit('enter') }
function openAt(i: number, row: HTMLElement) {
  clearTimeout(timer)
  if (openIndex.value === i) return
  openIndex.value = null
  childAnchor.value = narrow.value ? el.value!.getBoundingClientRect() : row.getBoundingClientRect()
  nextTick(() => { openIndex.value = i })
}
function hover(i: number, ev: MouseEvent) {
  if (narrow.value) return
  const row = ev.currentTarget as HTMLElement
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    if (props.items[i].children) openAt(i, row)
    else openIndex.value = null
  }, openIndex.value == null ? 60 : 180)
}
function toggle(i: number, ev: Event) {
  const row = (ev.currentTarget as HTMLElement).closest('.menu-row') as HTMLElement
  if (openIndex.value === i) openIndex.value = null
  else openAt(i, row)
}
function pick(n: MenuNode, i: number, ev: Event) {
  if (n.action) { ev.preventDefault(); n.action(); emit('close') }
  else if (n.href) emit('close')
  else if (n.children) { ev.preventDefault(); toggle(i, ev) }
}
</script>

<template>
  <div ref="el" class="menu-panel" :class="{ narrow, covered: narrow && openIndex != null }" role="menu"
       :style="{ left: pos.left + 'px', top: pos.top + 'px', maxHeight: narrow ? `calc(100vh - ${pos.top + 8}px)` : 'calc(100vh - 16px)' }"
       @mouseenter="hold">
    <button v-if="narrow && level > 0" class="menu-row back" @click="emit('back')">‹ Back</button>
    <template v-for="(n, i) in items" :key="i">
      <hr v-if="n.separator" />
      <component :is="n.href ? 'a' : 'button'" v-else class="menu-row" role="menuitem"
                 :href="n.href" :class="{ open: openIndex === i, sub: !!n.children }"
                 :aria-haspopup="n.children ? 'menu' : undefined" :aria-expanded="n.children ? openIndex === i : undefined"
                 @mouseenter="hover(i, $event)" @click="pick(n, i, $event)">
        <span v-if="n.icon" class="icon">{{ n.icon }}</span>
        <span class="menu-label">{{ n.label }}</span>
        <span v-if="n.hint" class="menu-hint">{{ n.hint }}</span>
        <span v-if="n.children" class="menu-arrow" title="Open submenu" @click.stop.prevent="toggle(i, $event)">›</span>
      </component>
    </template>
    <MenuPanel v-if="openIndex != null && childAnchor" :key="openIndex" :items="children" :anchor="childAnchor" :level="level + 1"
               @close="emit('close')" @back="openIndex = null" @enter="hold" />
  </div>
</template>
