<script setup lang="ts">
// The theme in a dialog, opened from the ⚙ menu: on the left the big choices (the theme and the decorative style), on
// the right the fine-tuning (each colour and the heading and text fonts). Every change shows on the page at once; the
// backdrop is light so the page behind can be judged.
import { computed, onMounted, onUnmounted } from 'vue'
import { COLOR_LABELS, FLOURISHES, FONTS, PRESETS, TEXT_FONTS, effectiveColors, setColor, setTheme, settings, type Preset, type ThemeColors } from '../theme'

const emit = defineEmits<{ close: [] }>()
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

const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); emit('close') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div class="modal-back theme-dialog-back" @mousedown.self="emit('close')">
      <div class="modal theme-dialog" role="dialog" aria-label="Theme and colours">
        <header class="modal-head">
          <h2>Theme &amp; colours</h2>
          <span class="spacer" />
          <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
        </header>
        <div class="theme-cols">
          <section>
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
            <h4>Style</h4>
            <div class="preset-grid">
              <button v-for="f in FLOURISHES" :key="f.id" class="preset style-pick" :class="{ on: (s.flourish ?? 'plain') === f.id }" @click="setTheme({ flourish: f.id === 'plain' ? undefined : f.id })">
                <span class="preset-name">{{ f.name }}</span>
                <span class="preset-note">{{ f.note }}</span>
              </button>
            </div>
          </section>
          <section>
            <!-- a sample made of the app's own parts, drawn with the current theme, colours, fonts and style -->
            <div class="card theme-sample" aria-label="Preview">
              <div class="md"><h2>Celeste Nevoya</h2></div>
              <p class="small">Warlock 11 · played by <a href="#" @click.prevent>Rebecca</a></p>
              <input value="Damage / heal" aria-label="Sample field" />
              <div class="cs-hp-bar"><i style="width: 62%" /></div>
              <div class="theme-sample-row">
                <span class="chip">Arcana</span><span class="badge">Known</span>
                <span class="pips-inline"><button type="button" class="pip on" tabindex="-1" /><button type="button" class="pip on" tabindex="-1" /><button type="button" class="pip" tabindex="-1" /></span>
                <label class="small"><input type="checkbox" checked /> Prepared</label>
                <button type="button" class="primary small-btn">Long rest</button>
              </div>
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
            <h4>Heading font</h4>
            <div class="font-row">
              <button v-for="f in FONTS" :key="f.id" :class="{ on: (s.font ?? 'book') === f.id }" :style="{ fontFamily: f.css }" @click="setTheme({ font: f.id })">{{ f.name }}</button>
            </div>
            <h4>Text font</h4>
            <div class="font-row">
              <button v-for="f in TEXT_FONTS" :key="f.id" :class="{ on: (s.textFont ?? 'system') === f.id }" :style="{ fontFamily: f.css }" title="Body text, menus, tabs and tables" @click="setTheme({ textFont: f.id })">{{ f.name }}</button>
            </div>
          </section>
        </div>
        <p class="small muted">Saved with the world, so it looks the same on every computer.</p>
      </div>
    </div>
  </Teleport>
</template>
