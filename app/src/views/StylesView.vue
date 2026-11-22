<script setup lang="ts">
// The style gallery (#/styles, from Theme & colours → Compare styles): the app's real parts — a card with a heading,
// fields, HP bars, chips, charges, death saves, a checkbox, tabs, stat boxes, a list table, a menu, a tooltip — in
// every style (styles/), side by side, in a light and a dark theme. One look (or one screenshot) checks a change to a
// style everywhere. Each box carries its own theme colours and style, so the page doesn't change the window's.
import Dropdown from '../components/Dropdown.vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { FLOURISHES, PRESETS, applyTheme, effectiveColors, settings, tokens } from '../theme'

const light = ref(PRESETS.find(p => !p.dark)?.id ?? 'parchment')
const dark = ref(PRESETS.find(p => p.dark)?.id ?? 'candlelight')
const mine = computed(() => ({ id: 'mine', name: 'Your theme', colors: effectiveColors(settings()) }))
const columns = computed(() => [mine.value, ...[light.value, dark.value].map(id => PRESETS.find(p => p.id === id)!).filter(Boolean)])
/** A box's theme: the colour tokens as inline variables, and its background and text. */
const look = (c: { colors: Parameters<typeof tokens>[0] }) => ({ ...tokens(c.colors), background: 'var(--bg)', color: 'var(--ink)' })
// the window's own style would reach into every box (it's on <html>): plain while the gallery is open
const plainWindow = () => { document.documentElement.classList.remove('fx'); delete document.documentElement.dataset.fx }
onMounted(plainWindow)
onUnmounted(applyTheme)
</script>

<template>
  <div class="styles-view">
    <header class="list-head">
      <h1>Styles</h1>
    </header>
    <p class="muted small">Every style on the same parts, in your theme and in a light and a dark one. The styles are written in <code>app/src/styles/</code>: <code>base.css</code> says which parts each one decorates, and each style sets its variables there.
      Rows under the mouse can't show here: try the menu and the table.</p>
    <div class="sg-pick small">
      <label>Light theme <Dropdown v-model="light"><option v-for="p in PRESETS.filter(x => !x.dark)" :key="p.id" :value="p.id">{{ p.name }}</option></Dropdown></label>
      <label>Dark theme <Dropdown v-model="dark"><option v-for="p in PRESETS.filter(x => x.dark)" :key="p.id" :value="p.id">{{ p.name }}</option></Dropdown></label>
    </div>
    <div class="sg-grid" :style="{ gridTemplateColumns: `8rem repeat(${columns.length}, minmax(0, 1fr))` }">
      <span />
      <b v-for="c in columns" :key="c.id" class="sg-col">{{ c.name }}</b>
      <template v-for="f in FLOURISHES" :key="f.id">
        <b class="sg-row">{{ f.name }}<span class="muted small">{{ f.note }}</span></b>
        <div v-for="c in columns" :key="c.id + f.id" :class="{ fx: f.id !== 'plain' }" :data-fx="f.id !== 'plain' ? f.id : undefined" class="sg-cell" :style="look(c)">
          <div class="card sg-card">
            <div class="md"><h2>Celeste Nevoya</h2></div>
            <nav class="tabs"><a class="on">Overview</a><a>Inventory</a><a>Spellbook</a></nav>
            <div class="sg-line"><input value="Damage / heal" aria-label="Sample field" /><Dropdown aria-label="Sample list"><option>Wizard</option></Dropdown></div>
            <div class="hp-bar sg-hp"><div class="hp-fill" style="width: 62%" /><span class="hp-text"><b>49</b> / 79</span></div>
            <div class="hp-bar bloodied sg-hp"><div class="hp-fill" style="width: 30%" /><span class="hp-text"><b>24</b> / 79</span></div>
            <div class="cs-hp-bar"><i style="width: 62%" /></div>
            <div class="sg-line">
              <span class="chip">Arcana</span><span class="badge">Known</span><button type="button" class="chip-btn on" tabindex="-1">Light</button>
              <span class="sg-pips"><button type="button" class="pip on" tabindex="-1" /><button type="button" class="pip" tabindex="-1" /></span>
              <span class="death-saves sg-ds"><span class="ds-row ok">✓ <button type="button" class="ds-box on" tabindex="-1" /><button type="button" class="ds-box" tabindex="-1" /></span></span>
              <label><input type="checkbox" checked /> Prepared</label><label><input type="checkbox" /> Ritual</label>
            </div>
            <div class="sg-stats"><div class="cs-stat"><span>Armor class</span><b>17</b></div><div class="cs-stat"><span>Speed</span><b>30 ft</b></div></div>
            <div class="md"><hr /></div>
          </div>
          <div class="table-wrap sg-table"><table class="grid"><thead><tr><th>Name</th><th>Level</th></tr></thead><tbody><tr><td>Fire Bolt</td><td>Cantrip</td></tr><tr><td>Shield</td><td>1</td></tr></tbody></table></div>
          <div class="sg-line sg-pop">
            <div class="menu-panel sg-static"><button type="button" class="menu-row"><span class="menu-label">Spells</span></button><button type="button" class="menu-row open"><span class="menu-label">Armory</span></button><hr /><button type="button" class="menu-row"><span class="menu-label">Crafting</span></button></div>
            <div class="tip-layer sg-static">+1 Ring of Protection</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
