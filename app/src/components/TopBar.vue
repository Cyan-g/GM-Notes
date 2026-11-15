<script setup lang="ts">
// The menu bar at the top: one menu per category, cascading into types and entries.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { MENUS } from '../menu'
import { db, get, save, state } from '../store'
import { newEntry } from '../ui'
import { route } from '../router'
import { daysSince } from '../backup'
import MenuPanel from './MenuPanel.vue'

defineEmits<{ search: [] }>()

const open = ref<number | null>(null)
const anchor = ref<DOMRect | null>(null)
const backupAge = computed(() => daysSince(state.db?.meta.externalBackup))

function show(i: number, ev: Event) {
  anchor.value = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  open.value = i
}
const toggle = (i: number, ev: Event) => (open.value === i ? close() : show(i, ev))
// Once a menu is open, moving to another title switches to it, like a desktop menu bar.
const slide = (i: number, ev: Event) => { if (open.value != null && open.value !== i) show(i, ev) }
const close = () => { open.value = null }

function outside(ev: PointerEvent) {
  if (!(ev.target as Element).closest?.('.menubar, .menu-panel')) close()
}
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && open.value != null) { ev.stopPropagation(); close() } }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('keydown', onKey, true); window.addEventListener('resize', close) })
onUnmounted(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', close) })
watch(() => route.current, close)

// Which menu the open page belongs to, so its title can be marked.
const TYPES_OF = [
  ['calendar', 'tracker', 'timeline', 'dashboard'],
  ['campaign', 'session', 'encounter', 'pc'],
  ['place', 'npc', 'organization', 'event', 'deity', 'race'],
  ['item', 'creature', 'spell', 'subclass', 'writing', 'note'],
]
const current = computed(() => {
  const r = route.current
  const key = r.name === 'list' ? r.type : r.name === 'entry' ? get(r.id)?.type : r.name
  return TYPES_OF.findIndex(l => l.includes(key as string))
})
</script>

<template>
  <header class="topbar">
    <a class="brand" href="#/">{{ db().meta.title }}</a>
    <nav class="menubar" role="menubar">
      <button v-for="(m, i) in MENUS" :key="m.title" class="menu-title" role="menuitem" aria-haspopup="menu"
              :aria-expanded="open === i" :class="{ open: open === i, current: current === i }"
              @click="toggle(i, $event)" @mouseenter="slide(i, $event)">{{ m.title }}</button>
    </nav>
    <MenuPanel v-if="open != null && anchor" :key="open" :items="MENUS[open].items()" :anchor="anchor" :level="0" @close="close" />
    <div class="bar-tools">
      <button class="search-btn" @click="$emit('search')"><span>Search…</span><kbd>Ctrl K</kbd></button>
      <button class="new-btn" title="New entry" @click="newEntry()">＋</button>
      <span class="save-status" :class="{ err: !!state.error }">
        <template v-if="state.error">⚠ Not saved <button class="link-btn" :title="state.error" @click="save">Retry</button></template>
        <template v-else-if="state.saving">Saving…</template>
        <template v-else-if="state.dirty">Unsaved…</template>
        <template v-else-if="state.savedAt">✓ Saved</template>
      </span>
      <a href="#/data" class="data-link" :class="{ warn: backupAge == null || backupAge > 7 }"
         :title="backupAge == null ? 'Data & backups: never copied' : `Data & backups: last copy ${backupAge} days ago`">💾<span v-if="backupAge == null || backupAge > 7" class="data-warn">{{ backupAge == null ? 'no copy' : `${backupAge} d` }}</span></a>
    </div>
  </header>
</template>
