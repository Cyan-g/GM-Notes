<script setup lang="ts">
// The theme in a dialog, opened from the ⚙ menu: on the left the big choices (the theme and the decorative style), on
// the right the fine-tuning (each colour and the heading and text fonts). Every change shows on the page at once; the
// backdrop is light so the page behind can be judged.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { COLOR_LABELS, FLOURISHES, FONTS, PRESETS, TEXT_FONTS, deleteSaved, effectiveColors, renameSaved, saveTheme, savedState, savedThemes, setColor, setTheme, settings, updateSaved, useSaved, type SavedTheme, type ThemeColors } from '../theme'

const emit = defineEmits<{ close: [] }>()
const s = computed(settings)
const colors = computed(() => effectiveColors(s.value))
const changed = computed(() => Object.keys(s.value.colors ?? {}) as (keyof ThemeColors)[])
const keys = Object.keys(COLOR_LABELS) as (keyof ThemeColors)[]
const parchment = PRESETS.find(p => p.id === 'parchment')!
const candle = PRESETS.find(p => p.id === 'candlelight')!

function pick(id: string) {
  // A new theme starts clean; keeping old colour changes on top of it rarely looks right.
  setTheme({ preset: id, colors: undefined, saved: undefined })
}
// ---- saved themes: the colours as they are, under a name; kept on this computer for every world ----
const mine = computed(() => savedState(s.value))
/** Naming a new saved theme (the name field is open), or renaming one (its id). */
const naming = ref(false)
const renaming = ref('')
const name = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
/** The rename field (inside the list of themes, so a list of one). */
const renameInput = ref<HTMLInputElement[]>([])
async function startNaming() { naming.value = true; renaming.value = ''; name.value = ''; await nextTick(); nameInput.value?.focus() }
async function startRename(t: SavedTheme) { renaming.value = t.id; naming.value = false; name.value = t.name; await nextTick(); renameInput.value[0]?.select() }
function finishName() {
  if (renaming.value) renameSaved(renaming.value, name.value)
  else if (naming.value && name.value.trim()) saveTheme(name.value)
  naming.value = false; renaming.value = ''
}
function remove(t: SavedTheme) { if (confirm(`Delete the theme “${t.name}”? Worlds using it keep its colours.`)) deleteSaved(t.id) }
function resetColor(k: keyof ThemeColors) {
  const c = { ...s.value.colors }
  delete c[k]
  setTheme({ colors: Object.keys(c).length ? c : undefined })
}
const preview = (p: { colors: ThemeColors }) => ({ '--p-bg': p.colors.bg, '--p-panel': p.colors.panel, '--p-ink': p.colors.ink, '--p-accent': p.colors.accent })

const onKey = (ev: KeyboardEvent) => {
  if (ev.key !== 'Escape') return
  ev.stopPropagation()
  if (naming.value || renaming.value) { naming.value = false; renaming.value = '' } else emit('close')
}
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
              <button class="preset" :class="{ on: s.preset === 'system' && !mine.theme }" @click="pick('system')">
                <span class="preset-prev split" :style="{ '--p-a': parchment.colors.bg, '--p-b': candle.colors.bg, '--p-accent': parchment.colors.accent }"><i /></span>
                <span class="preset-name">Day &amp; night</span>
                <span class="preset-note">Parchment or Candlelight, like your system</span>
              </button>
              <button v-for="p in PRESETS" :key="p.id" class="preset" :class="{ on: s.preset === p.id && !mine.theme }" @click="pick(p.id)">
                <span class="preset-prev" :style="preview(p)"><b /><i /></span>
                <span class="preset-name">{{ p.name }}</span>
                <span class="preset-note">{{ p.note }}</span>
              </button>
            </div>
            <template v-if="savedThemes.length">
              <h4>Your themes <span class="muted small">on this computer, for every world</span></h4>
              <div class="preset-grid">
                <div v-for="t in savedThemes" :key="t.id" class="preset saved-theme" :class="{ on: mine.theme?.id === t.id }" role="button" tabindex="0" :title="`Use ${t.name}`" @click="useSaved(t)" @keydown.enter="useSaved(t)">
                  <span class="preset-prev" :style="preview(t)"><b /><i /></span>
                  <input v-if="renaming === t.id" ref="renameInput" v-model="name" class="saved-name-input" maxlength="40" aria-label="The theme's name" @click.stop @keydown.enter.stop="finishName" @blur="finishName" />
                  <span v-else class="preset-name">{{ t.name }}</span>
                  <span class="preset-note">{{ mine.theme?.id === t.id && mine.changed ? 'changed since saved' : `from ${PRESETS.find(p => p.id === t.base)?.name ?? 'a theme'}` }}</span>
                  <span class="saved-actions">
                    <button type="button" class="link-btn" title="Rename" @click.stop="startRename(t)">✎</button>
                    <button type="button" class="link-btn" title="Delete" @click.stop="remove(t)">×</button>
                  </span>
                </div>
              </div>
            </template>
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
            <h4>Colours <span class="saved-buttons">
              <button v-if="mine.theme && mine.changed" class="link-btn" :title="`Keep these colours in ${mine.theme.name}`" @click="updateSaved(mine.theme.id)">Update “{{ mine.theme.name }}”</button>
              <button v-if="changed.length || mine.theme" class="link-btn" title="Keep these colours as a theme of your own, for every world on this computer" @click="startNaming">Save as a theme…</button>
              <button v-if="changed.length" class="link-btn" @click="setTheme({ colors: undefined, saved: undefined })">Reset all</button>
            </span></h4>
            <form v-if="naming" class="saved-new" @submit.prevent="finishName">
              <input ref="nameInput" v-model="name" maxlength="40" placeholder="Name, e.g. Ember" aria-label="The new theme's name" />
              <button type="submit" class="primary" :disabled="!name.trim()">Save</button>
              <button type="button" @click="naming = false">Cancel</button>
            </form>
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
        <p class="small muted">Saved with the world, so it looks the same on every computer. <a href="#/styles" @click="emit('close')">Compare styles</a> side by side.</p>
      </div>
    </div>
  </Teleport>
</template>
