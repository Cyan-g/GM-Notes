<script setup lang="ts">
// The menu bar at the top: one menu per category, cascading into types and entries.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { MENUS } from '../menu'
import { db, save, state } from '../store'
import { newEntry } from '../ui'
import { route } from '../router'
import { daysSince } from '../backup'
import MenuPanel from './MenuPanel.vue'
import ThemeMenu from './ThemeMenu.vue'

defineEmits<{ search: [] }>()

const open = ref<number | null>(null)
const anchor = ref<DOMRect | null>(null)
const backupAge = computed(() => daysSince(state.db?.meta.externalBackup))

function show(i: number, ev: Event) {
  anchor.value = (ev.currentTarget as HTMLElement).getBoundingClientRect()
  open.value = i
}
const close = () => { clearTimeout(timer); open.value = null }

// Hovering a title opens its menu; leaving the title and its menu closes it after a moment,
// so moving the mouse from the title down into the menu doesn't lose it.
let timer: number | undefined
function hoverTitle(i: number, ev: MouseEvent) {
  clearTimeout(timer)
  const el = ev.currentTarget as HTMLElement
  if (open.value === i) return
  timer = window.setTimeout(() => show(i, { currentTarget: el } as unknown as Event), open.value == null ? 90 : 0)
}
const keep = () => clearTimeout(timer)
const leave = () => { clearTimeout(timer); timer = window.setTimeout(close, 280) }

// Clicking a title opens the menu's dashboard if it has one (a real link, so middle-click opens a tab);
// otherwise it opens or closes the menu. On a touch screen the first tap opens the menu.
let touch = false
const notePointer = (ev: PointerEvent) => { touch = ev.pointerType === 'touch' }
function clickTitle(i: number, ev: MouseEvent) {
  const m = MENUS[i]
  if (m.home && !(touch && open.value !== i)) { close(); return }
  ev.preventDefault()
  // Hovering usually opened it already; a click keeps it open (Esc, a click elsewhere or leaving closes it).
  if (open.value !== i) show(i, ev)
}

function outside(ev: PointerEvent) {
  if (!(ev.target as Element).closest?.('.menubar, .menu-panel')) close()
}
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && open.value != null) { ev.stopPropagation(); close() } }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('keydown', onKey, true); window.addEventListener('resize', close) })
onUnmounted(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', close) })
watch(() => route.current, close)

// Which menu the open page belongs to, so its title can be marked.
const current = computed(() => MENUS.findIndex(m => m.owns(route.current)))
</script>

<template>
  <header class="topbar">
    <a class="brand" href="#/">{{ db().meta.title }}</a>
    <nav class="menubar" role="menubar">
      <component :is="m.home ? 'a' : 'button'" v-for="(m, i) in MENUS" :key="m.title" class="menu-title" role="menuitem" aria-haspopup="menu"
              :href="m.home" :title="m.home ? `Open ${m.title.toLowerCase()} (hover for the menu)` : undefined"
              :aria-expanded="open === i" :class="{ open: open === i, current: current === i }"
              @pointerdown="notePointer" @click="clickTitle(i, $event)"
              @mouseenter="hoverTitle(i, $event)" @mouseleave="leave">{{ m.title }}</component>
    </nav>
    <div class="menu-host" @mouseenter="keep" @mouseleave="leave">
      <MenuPanel v-if="open != null && anchor" :key="open" :items="MENUS[open].items()" :anchor="anchor" :level="0" @close="close" />
    </div>
    <div class="bar-tools">
      <button class="search-btn" @click="$emit('search')"><span>Search…</span><kbd>Ctrl K</kbd></button>
      <button class="new-btn" title="New entry" @click="newEntry()">＋</button>
      <span class="save-status" :class="{ err: !!state.error }">
        <template v-if="state.readOnly"><span :title="state.readOnly">🔒 Not saving</span></template>
        <template v-else-if="state.error">⚠ Not saved <button class="link-btn" :title="state.error" @click="save()">Retry</button></template>
        <template v-else-if="state.saving">Saving…</template>
        <template v-else-if="state.dirty">Unsaved…</template>
        <template v-else-if="state.savedAt">✓ Saved</template>
      </span>
      <a href="#/data" class="data-link" :class="{ warn: backupAge == null || backupAge > 7 }"
         :title="backupAge == null ? 'Data & backups: never copied' : `Data & backups: last copy ${backupAge} days ago`">💾<span v-if="backupAge == null || backupAge > 7" class="data-warn">{{ backupAge == null ? 'no copy' : `${backupAge} d` }}</span></a>
      <ThemeMenu />
    </div>
  </header>
</template>
