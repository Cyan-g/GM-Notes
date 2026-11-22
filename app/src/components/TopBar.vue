<script setup lang="ts">
// The menu bar at the top: one menu per category, cascading into types and entries.
import AppIcon from './AppIcon.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { visibleMenus } from '../menu'
import { db, playerMode, save, setMode, state } from '../store'
import { newEntry } from '../ui'
import { goBack, nav, route } from '../router'
import MenuPanel from './MenuPanel.vue'
import SettingsMenu from './SettingsMenu.vue'
import WorldList from './WorldList.vue'
import { desktop } from '../storage/desktop'
import SessionButton from './SessionButton.vue'
import SyncChip from './SyncChip.vue'
/** The world's name: a menu with Home and the known worlds (desktop app). */
const worldsOpen = ref(false)
const brandBox = ref<HTMLElement | null>(null)
function brandOutside(ev: PointerEvent) { if (worldsOpen.value && !brandBox.value?.contains(ev.target as Node)) worldsOpen.value = false }
onMounted(() => document.addEventListener('pointerdown', brandOutside))
onUnmounted(() => document.removeEventListener('pointerdown', brandOutside))
watch(() => route.current, () => { worldsOpen.value = false })
const settingsMenu = ref<InstanceType<typeof SettingsMenu> | null>(null)

defineEmits<{ search: [] }>()

const open = ref<number | null>(null)
const anchor = ref<DOMRect | null>(null)

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
  const m = visibleMenus.value[i]
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
watch(visibleMenus, close)

// Which menu the open page belongs to, so its title can be marked.
const current = computed(() => visibleMenus.value.findIndex(m => m.owns(route.current)))
</script>

<template>
  <header class="topbar">
    <button class="nav-back" :disabled="!nav.canBack" title="Go back (Alt+←)" aria-label="Go back" @click="goBack">←</button>
    <div ref="brandBox" class="brand-box">
      <button v-if="desktop" class="brand" :aria-expanded="worldsOpen" aria-haspopup="dialog" title="Home and your worlds" @click="worldsOpen = !worldsOpen">{{ db().meta.title }} <span class="brand-caret">▾</span></button>
      <a v-else class="brand" href="#/">{{ db().meta.title }}</a>
      <div v-if="worldsOpen" class="theme-panel brand-panel" role="dialog" aria-label="Home and worlds">
        <a class="brand-home" href="#/" @click="worldsOpen = false"><AppIcon ui="home" /> Home of {{ db().meta.title }}</a>
        <h4>Worlds</h4>
        <WorldList @done="worldsOpen = false" />
      </div>
    </div>
    <nav class="menubar" role="menubar">
      <component :is="m.home ? 'a' : 'button'" v-for="(m, i) in visibleMenus" :key="m.title" class="menu-title" role="menuitem" aria-haspopup="menu"
              :href="m.home" :title="m.home ? `Open ${m.title.toLowerCase()} (hover for the menu)` : undefined"
              :aria-expanded="open === i" :class="{ open: open === i, current: current === i }"
              @pointerdown="notePointer" @click="clickTitle(i, $event)"
              @mouseenter="hoverTitle(i, $event)" @mouseleave="leave">{{ m.title }}</component>
    </nav>
    <div class="menu-host" @mouseenter="keep" @mouseleave="leave">
      <MenuPanel v-if="open != null && anchor" :key="open" :items="visibleMenus[open].items()" :anchor="anchor" :level="0" @close="close" />
    </div>
    <div class="bar-tools">
      <button class="search-btn" @click="$emit('search')"><span>Search…</span><kbd>Ctrl K</kbd></button>
      <button class="new-btn" title="New entry" @click="newEntry()">＋</button>
      <span class="save-status" :class="{ err: !!state.error }">
        <template v-if="state.readOnly"><span :title="state.readOnly"><AppIcon ui="padlock" /> Not saving</span></template>
        <template v-else-if="state.error"><AppIcon ui="warning" /> Not saved <button class="link-btn" :title="state.error" @click="save()">Retry</button></template>
        <template v-else-if="state.saving">Saving…</template>
        <template v-else-if="state.dirty">Unsaved…</template>
        <template v-else-if="state.savedAt">✓ Saved</template>
      </span>
      <SyncChip />
      <SessionButton />
      <!-- the mode, switched right here: player mode shows only what the players know -->
      <button class="mode-tag" :class="{ player: playerMode }" :disabled="!!state.db?.follow || !!state.readOnly" :aria-pressed="playerMode"
              :title="state.db?.follow ? 'Player mode: a world your DM shares' : playerMode ? 'Player mode: only what the players know is shown. Click for DM mode' : 'DM mode: everything is shown. Click for player mode, to see what the players see'"
              @click.stop="setMode(playerMode ? 'dm' : 'player')">{{ playerMode ? 'Player mode' : 'DM mode' }}</button>
      <SettingsMenu ref="settingsMenu" />
    </div>
  </header>
</template>
