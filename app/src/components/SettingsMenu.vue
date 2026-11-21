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
import { COLOR_LABELS, FLOURISHES, FONTS, PRESETS, TEXT_FONTS, effectiveColors, setColor, setTheme, settings, type Preset, type ThemeColors } from '../theme'

/** Closed, the short menu, or the theme panel. */
const open = ref<null | 'menu' | 'theme'>(null)
const backupAge = computed(() => daysSince(state.db?.meta.externalBackup))
const overdue = computed(() => backupAge.value == null || backupAge.value > 7)
const toggle = () => { open.value = open.value ? null : 'menu' }
defineExpose({ toggle })
function importFile() { open.value = null; pickImport() }
function exportWorld() { open.value = null; ui.worldExport = true }
function data() { open.value = null; go('#/data') }
const root = ref<HTMLElement | null>(null)
const s = computed(settings)
const colors = computed(() => effectiveColors(s.value))
const changed = computed(() => Object.keys(s.value.colors ?? {}) as (keyof ThemeColors)[])
const keys = Object.keys(COLOR_LABELS) as (keyof ThemeColors)[]
const parchment = PRESETS.find(p => p.id === 'parchment')!
const candle = PRESETS.find(p => p.id === 'candlelight')!

function pick(id: string) {
  // A new theme starts clean; keeping old colour changes on top of it rarely looks right.
  setTheme({ preset: id, colors: undefined })
}
function resetColor(k: keyof ThemeColors) {
  const c = { ...s.value.colors }
  delete c[k]
  setTheme({ colors: Object.keys(c).length ? c : undefined })
}
const preview = (p: Preset) => ({ '--p-bg': p.colors.bg, '--p-panel': p.colors.panel, '--p-ink': p.colors.ink, '--p-accent': p.colors.accent })

function outside(ev: PointerEvent) { if (open.value && !root.value?.contains(ev.target as Node)) open.value = null }
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && open.value) { ev.stopPropagation(); open.value = open.value === 'menu' ? null : 'menu' } }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('keydown', onKey, true) })
onUnmounted(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', onKey, true) })
</script>

<template>
  <div ref="root" class="theme-menu">
    <button class="theme-btn" :class="{ open: !!open, warn: overdue }" :aria-expanded="!!open" aria-haspopup="menu"
            :title="overdue ? `Settings: theme, mode, export and import, data & backups. ${backupAge == null ? 'No backup copy yet' : `Last backup copy ${backupAge} days ago`}` : 'Settings: theme, mode, export and import, data & backups'"
            @click="toggle"><AppIcon ui="cog" /><span v-if="overdue" class="settings-dot" /></button>
    <div v-if="open === 'menu'" class="theme-panel settings-list" role="menu">
      <button role="menuitem" @click="open = 'theme'"><span><AppIcon ui="palette" /></span>Theme &amp; colours<span class="hint">›</span></button>
      <label v-if="!state.db?.follow" class="settings-switch" title="Off: player mode, trimmed to spells, crafting and maps, without DM-only text">
        <span><AppIcon ui="dice" /></span>DM mode
        <input type="checkbox" role="switch" :checked="!playerMode" :disabled="!!state.readOnly" @change="setMode(($event.target as HTMLInputElement).checked ? 'dm' : 'player')" />
      </label>
      <button role="menuitem" @click="exportWorld"><span><AppIcon ui="exportFile" /></span>Export the world…<span class="hint">{{ playerMode ? 'to share' : 'for a player' }}</span></button>
      <button role="menuitem" @click="importFile"><span><AppIcon ui="importFile" /></span>Import from a file…<span class="hint">entry or world</span></button>
      <button role="menuitem" :class="{ warn: overdue }" @click="data"><span><AppIcon ui="save" /></span>Data &amp; backups
        <span class="hint">{{ backupAge == null ? 'no backup copy yet' : backupAge === 0 ? 'backup copy today' : `backup copy ${backupAge} d ago` }}</span></button>
    </div>
    <div v-if="open === 'theme'" class="theme-panel" role="dialog" aria-label="Theme and colours">
      <h4><button class="link-btn back" @click="open = 'menu'">‹ Back</button></h4>
      <h4>Theme</h4>
      <div class="preset-grid">
        <button class="preset" :class="{ on: s.preset === 'system' }" @click="pick('system')">
          <span class="preset-prev split" :style="{ '--p-a': parchment.colors.bg, '--p-b': candle.colors.bg, '--p-accent': parchment.colors.accent }"><i /></span>
          <span class="preset-name">Day &amp; night</span>
          <span class="preset-note">Parchment or Candlelight, like your system</span>
        </button>
        <button v-for="p in PRESETS" :key="p.id" class="preset" :class="{ on: s.preset === p.id }" @click="pick(p.id)">
          <span class="preset-prev" :style="preview(p)"><b /><i /></span>
          <span class="preset-name">{{ p.name }}</span>
          <span class="preset-note">{{ p.note }}</span>
        </button>
      </div>

      <h4>Colours <button v-if="changed.length" class="link-btn" @click="setTheme({ colors: undefined })">Reset all</button></h4>
      <div class="color-rows">
        <label v-for="k in keys" :key="k" class="color-row">
          <input type="color" :value="colors[k]" @input="setColor(k, ($event.target as HTMLInputElement).value)" />
          <span>{{ COLOR_LABELS[k] }}</span>
          <code>{{ colors[k] }}</code>
          <button v-if="changed.includes(k)" class="link-btn" title="Back to the theme's colour" @click.prevent="resetColor(k)">↺</button>
        </label>
      </div>

      <h4>Style</h4>
      <div class="font-row">
        <button v-for="f in FLOURISHES" :key="f.id" :class="{ on: (s.flourish ?? 'plain') === f.id }" :title="f.note" @click="setTheme({ flourish: f.id === 'plain' ? undefined : f.id })">{{ f.name }}</button>
      </div>
      <h4>Heading font</h4>
      <div class="font-row">
        <button v-for="f in FONTS" :key="f.id" :class="{ on: (s.font ?? 'book') === f.id }" :style="{ fontFamily: f.css }" @click="setTheme({ font: f.id })">{{ f.name }}</button>
      </div>
      <h4>Text font</h4>
      <div class="font-row">
        <button v-for="f in TEXT_FONTS" :key="f.id" :class="{ on: (s.textFont ?? 'system') === f.id }" :style="{ fontFamily: f.css }" title="Body text, menus, tabs and tables" @click="setTheme({ textFont: f.id })">{{ f.name }}</button>
      </div>
      <p class="small muted">Saved with your data, so the stick looks the same on every computer.</p>
    </div>
  </div>
</template>
