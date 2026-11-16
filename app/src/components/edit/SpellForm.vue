<script setup lang="ts">
// Editing a spell's stats the way you'd fill in a spell card: buttons for the fixed choices,
// quick picks for the usual casting times, ranges and durations, V S M as one toggle group.
import { computed, ref } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES } from '../../model/schema'
import { changed } from '../../edit'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => props.entry.fields as Record<string, any>)
const opts = (key: string) => TYPES.spell.fields.find(x => x.key === key)?.options ?? []

function set(key: string, value: unknown) {
  if (value === undefined || value === '' || value === false || (Array.isArray(value) && !value.length)) delete f.value[key]
  else f.value[key] = value
  changed(props.entry)
}
const toggle = (key: string) => set(key, !f.value[key])
function toggleIn(key: string, v: string) {
  const list: string[] = f.value[key] ?? []
  set(key, list.includes(v) ? list.filter(x => x !== v) : [...list, v])
}

const LEVELS = computed(() => opts('level'))
const SCHOOLS = computed(() => opts('school'))
const KINDS = computed(() => opts('spellType'))
const ABILITIES = computed(() => opts('savingThrow'))
const CLASSES = computed(() => opts('classes'))
const QUICK = {
  castingTime: ['action', 'bonus action', 'reaction', '1 minute', '10 minutes', '1 hour'],
  range: ['Self', 'touch', '30 feet', '60 feet', '120 feet', '150 feet'],
  duration: ['Instantaneous', '1 round', '1 minute', '10 minutes', '1 hour', '8 hours', '24 hours'],
}
type Quick = keyof typeof QUICK
const LABELS: Record<Quick, string> = { castingTime: 'Casting time', range: 'Range', duration: 'Duration' }

// Material: 'yes' means "needs materials" without saying which.
const hasM = computed(() => !!f.value.material)
const materialText = computed(() => (f.value.material === 'yes' ? '' : f.value.material ?? ''))
// Switching M off and on again brings back what was written.
const lastMaterial = ref('yes')
function toggleM() {
  if (hasM.value) { lastMaterial.value = f.value.material; set('material', undefined) }
  else set('material', lastMaterial.value)
}
const setMaterial = (v: string) => set('material', v.trim() || 'yes')
</script>

<template>
  <!-- Two columns; buttons only where a glance matters (level, components, casting), dropdowns elsewhere. -->
  <div class="spell-form">
    <div class="sf-cell">
      <span class="sf-label">Level</span>
      <div class="seg">
        <button v-for="l in LEVELS" :key="l" type="button" :class="{ on: f.level === l }" @click="set('level', f.level === l ? undefined : l)">{{ l }}</button>
      </div>
    </div>

    <div class="sf-cell">
      <span class="sf-label">Components</span>
      <div class="sf-inline">
        <div class="seg" role="group" aria-label="Components">
          <button type="button" :class="{ on: f.verbal }" title="Verbal" @click="toggle('verbal')">V</button>
          <button type="button" :class="{ on: f.somatic }" title="Somatic" @click="toggle('somatic')">S</button>
          <button type="button" :class="{ on: hasM }" title="Material" @click="toggleM">M</button>
        </div>
        <input v-if="hasM" class="sf-material" :value="materialText" placeholder="Which materials (optional)" @change="setMaterial(($event.target as HTMLInputElement).value)" />
      </div>
    </div>

    <label class="sf-cell">
      <span class="sf-label">School</span>
      <select :value="f.school ?? ''" @change="set('school', ($event.target as HTMLSelectElement).value || undefined)">
        <option value="">—</option>
        <option v-for="o in SCHOOLS" :key="o" :value="o">{{ o }}</option>
      </select>
    </label>

    <div class="sf-cell">
      <span class="sf-label">Type</span>
      <div class="sf-inline">
        <select :value="f.spellType ?? ''" @change="set('spellType', ($event.target as HTMLSelectElement).value || undefined)">
          <option value="">—</option>
          <option v-for="o in KINDS" :key="o" :value="o">{{ o }}</option>
        </select>
        <select v-if="f.spellType === 'Saving throw' || f.savingThrow" :value="f.savingThrow ?? ''" aria-label="Saving throw" @change="set('savingThrow', ($event.target as HTMLSelectElement).value || undefined)">
          <option value="">which save?</option>
          <option v-for="o in ABILITIES" :key="o" :value="o">{{ o }} save</option>
        </select>
      </div>
    </div>

    <!-- Free text with the usual values as suggestions. -->
    <label v-for="key in (Object.keys(QUICK) as Quick[])" :key="key" class="sf-cell">
      <span class="sf-label">{{ LABELS[key] }}</span>
      <input :value="f[key] ?? ''" :list="`sf-${key}`" :placeholder="QUICK[key][0]" @change="set(key, ($event.target as HTMLInputElement).value.trim())" />
      <datalist :id="`sf-${key}`"><option v-for="q in QUICK[key]" :key="q" :value="q" /></datalist>
    </label>

    <div class="sf-cell">
      <span class="sf-label">Casting</span>
      <div class="seg">
        <button type="button" :class="{ on: f.concentration }" @click="toggle('concentration')">Concentration</button>
        <button type="button" :class="{ on: f.ritual }" @click="toggle('ritual')">Ritual</button>
      </div>
    </div>

    <div class="sf-cell full">
      <span class="sf-label">Classes</span>
      <div class="seg wrap">
        <button v-for="c in CLASSES" :key="c" type="button" :class="{ on: (f.classes ?? []).includes(c) }" @click="toggleIn('classes', c)">{{ c }}</button>
      </div>
    </div>
  </div>
</template>
