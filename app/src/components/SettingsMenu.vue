<script setup lang="ts">
// The ⚙ menu at the top right: the theme (colours, heading and text fonts), DM or player mode, exporting the world and
// importing a shared file, and data & backups. The button shows when the last backup copy is overdue. Worlds are in the
// menu under the world's name (top left); sharing and connecting are on the session button (SessionButton.vue).
import AppIcon from './AppIcon.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { playerMode, setMode, state } from '../store'
import { daysSince } from '../backup'
import { pickImport, ui } from '../ui'
import { go } from '../router'
import ThemeDialog from './ThemeDialog.vue'
import { devices } from '../devicesync/devices'
import { desktop } from '../storage/desktop'

/** The short menu, open or closed; the theme dialog. */
const open = ref<null | 'menu'>(null)
const themeOpen = ref(false)
function theme() { open.value = null; themeOpen.value = true }
const backupAge = computed(() => daysSince(state.db?.meta.externalBackup))
const overdue = computed(() => backupAge.value == null || backupAge.value > 7)
const toggle = () => { open.value = open.value ? null : 'menu' }
defineExpose({ toggle })
function importFile() { open.value = null; pickImport() }
function exportWorld() { open.value = null; ui.worldExport = true }
function myDevices() { open.value = null; ui.devices = true }
const paired = computed(() => devices.status?.devices.length ?? 0)
function data() { open.value = null; go('#/data') }
const root = ref<HTMLElement | null>(null)

function outside(ev: PointerEvent) { if (open.value && !root.value?.contains(ev.target as Node)) open.value = null }
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && open.value) { ev.stopPropagation(); open.value = null } }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('keydown', onKey, true) })
onUnmounted(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', onKey, true) })
</script>

<template>
  <div ref="root" class="theme-menu">
    <button class="theme-btn" :class="{ open: !!open, warn: overdue }" :aria-expanded="!!open" aria-haspopup="menu"
            :title="overdue ? `Settings: theme, mode, export and import, data & backups. ${backupAge == null ? 'No backup copy yet' : `Last backup copy ${backupAge} days ago`}` : 'Settings: theme, mode, export and import, data & backups'"
            @click="toggle"><AppIcon ui="cog" /><span v-if="overdue" class="settings-dot" /></button>
    <div v-if="open === 'menu'" class="theme-panel settings-list" role="menu">
      <button role="menuitem" @click="theme"><span><AppIcon ui="palette" /></span>Theme &amp; colours<span class="hint">…</span></button>
      <label v-if="!state.db?.follow" class="settings-switch" title="Off: player mode, trimmed to spells, crafting and maps, without DM-only text">
        <span><AppIcon ui="dice" /></span>DM mode
        <input type="checkbox" role="switch" :checked="!playerMode" :disabled="!!state.readOnly" @change="setMode(($event.target as HTMLInputElement).checked ? 'dm' : 'player')" />
      </label>
      <button v-if="desktop?.devices && !state.db?.follow" role="menuitem" @click="myDevices"><span><AppIcon ui="link" /></span>My devices…<span class="hint">{{ paired ? `${paired} paired` : 'sync this world' }}</span></button>
      <button role="menuitem" @click="exportWorld"><span><AppIcon ui="exportFile" /></span>Export the world…<span class="hint">{{ playerMode ? 'to share' : 'for a player' }}</span></button>
      <button role="menuitem" @click="importFile"><span><AppIcon ui="importFile" /></span>Import from a file…<span class="hint">entry or world</span></button>
      <button role="menuitem" :class="{ warn: overdue }" @click="data"><span><AppIcon ui="save" /></span>Data &amp; backups
        <span class="hint">{{ backupAge == null ? 'no backup copy yet' : backupAge === 0 ? 'backup copy today' : `backup copy ${backupAge} d ago` }}</span></button>
    </div>
    <ThemeDialog v-if="themeOpen" @close="themeOpen = false" />
  </div>
</template>
