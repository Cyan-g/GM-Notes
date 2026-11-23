<script setup lang="ts">
// Archive → Ruleset: how the world's rules work (rules.ts). The DM keeps presets ("Standard", "Our house rules"…),
// one active; each rule shows its choices with what they do, and the search finds rules by name, text or keyword.
// A rule changed from the Standard default is marked. Players see the active preset, read-only; a world that follows a
// shared one has the DM's ruleset (sync.ts).
import Dropdown from '../components/Dropdown.vue'
import AppIcon from '../components/AppIcon.vue'
import { computed, ref } from 'vue'
import { playerMode, state } from '../store'
import {
  RULES, activePreset, addPreset, changedFromDefault, deletePreset, presets, renamePreset, rule, setActivePreset, setRule, type RuleDef,
} from '../rules'

const ro = computed(() => !!state.readOnly || playerMode.value || !!state.db?.follow)
const q = ref('')
/** The rules matching the search, by group. */
const groups = computed(() => {
  const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hit = (r: RuleDef) => words.every(w => [r.label, r.text, r.group, r.keywords ?? '', ...r.options.map(o => `${o.label} ${o.text ?? ''}`)].join(' ').toLowerCase().includes(w))
  const out = new Map<string, RuleDef[]>()
  for (const r of RULES.filter(hit)) out.set(r.group, [...(out.get(r.group) ?? []), r])
  return [...out]
})
const changed = computed(() => RULES.filter(r => changedFromDefault(activePreset.value, r.id)).length)
function newPreset() {
  const name = prompt('Name of the new preset (a copy of the active one):', `${activePreset.value.name} (copy)`)
  if (name != null) addPreset(name)
}
function rename() {
  const name = prompt('New name of the preset:', activePreset.value.name)
  if (name != null) renamePreset(activePreset.value.id, name)
}
function remove() {
  if (confirm(`Remove the preset “${activePreset.value.name}”? Its settings are lost; the world switches to the first preset.`)) deletePreset(activePreset.value.id)
}
</script>

<template>
  <div class="ruleset-page">
    <header class="list-head">
      <h1><span class="icon"><AppIcon ui="scales" /></span>Ruleset</h1>
      <span class="muted small">How the rules work in this world. Presets keep different setups; the active one counts everywhere.</span>
    </header>

    <div class="card rs-presets">
      <label>Preset
        <Dropdown :value="activePreset.id" :disabled="ro" @change="setActivePreset(($event.target as HTMLSelectElement).value)">
          <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option>
        </Dropdown>
      </label>
      <span class="muted small">{{ changed ? `${changed} rule${changed === 1 ? '' : 's'} changed from the standard` : 'all rules as standard' }}</span>
      <span v-if="!ro" class="rs-actions">
        <button class="chip-btn" title="A new preset, starting as a copy of this one" @click="newPreset">＋ New preset</button>
        <button class="link-btn small" @click="rename">Rename</button>
        <button v-if="presets.length > 1" class="link-btn small danger" @click="remove">Remove</button>
      </span>
    </div>

    <input v-model="q" class="rs-search" type="search" placeholder="Find a rule… (e.g. weight, XP, exhaustion)" aria-label="Find a rule" />

    <section v-for="[g, list] in groups" :key="g" class="rs-group">
      <h2>{{ g }}</h2>
      <div v-for="r in list" :key="r.id" class="card rs-rule" :class="{ changed: changedFromDefault(activePreset, r.id) }">
        <div class="rs-head"><b>{{ r.label }}</b><span v-if="changedFromDefault(activePreset, r.id)" class="rs-mark small" title="Not as in the Standard preset">changed</span></div>
        <p class="muted small">{{ r.text }}</p>
        <label v-if="r.number" class="rs-number"><input type="number" :min="r.number.min" :max="r.number.max" :value="rule(r.id)" :disabled="ro" :aria-label="r.label"
          @change="setRule(r.id, String(Math.min(r.number.max, Math.max(r.number.min, Math.round(Number(($event.target as HTMLInputElement).value) || Number(r.default))))))" />
          <span class="muted small">{{ r.number.unit }} · standard {{ r.default }}</span></label>
        <div v-else class="rs-options" role="radiogroup" :aria-label="r.label">
          <label v-for="o in r.options" :key="o.id" class="rs-option" :class="{ on: rule(r.id) === o.id }">
            <input type="radio" :name="r.id" :checked="rule(r.id) === o.id" :disabled="ro" @change="setRule(r.id, o.id)" />
            <span><b>{{ o.label }}</b><span v-if="o.id === r.default" class="muted small"> · standard</span><br /><span v-if="o.text" class="muted small">{{ o.text }}</span></span>
          </label>
        </div>
      </div>
    </section>
    <p v-if="!groups.length" class="muted">No rule matches “{{ q }}”.</p>
  </div>
</template>
