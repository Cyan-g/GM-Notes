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
  <div class="spell-form">
    <div class="sf-row">
      <span class="sf-label">Level</span>
      <div class="seg">
        <button v-for="l in LEVELS" :key="l" type="button" :class="{ on: f.level === l }" @click="set('level', f.level === l ? undefined : l)">{{ l === 'Cantrip' ? 'Cantrip' : l }}</button>
      </div>
    </div>

    <div class="sf-row">
      <span class="sf-label">School</span>
      <div class="seg wrap">
        <button v-for="s in SCHOOLS" :key="s" type="button" :class="{ on: f.school === s }" @click="set('school', f.school === s ? undefined : s)">{{ s }}</button>
      </div>
    </div>

    <div v-for="key in (Object.keys(QUICK) as Quick[])" :key="key" class="sf-row">
      <span class="sf-label">{{ LABELS[key] }}</span>
      <div class="sf-quick">
        <input :value="f[key] ?? ''" :placeholder="QUICK[key][0]" @change="set(key, ($event.target as HTMLInputElement).value.trim())" />
        <button v-for="q in QUICK[key]" :key="q" type="button" class="chip-btn" :class="{ on: String(f[key] ?? '').toLowerCase() === q.toLowerCase() }" @click="set(key, q)">{{ q }}</button>
      </div>
    </div>

    <div class="sf-row">
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

    <div class="sf-row">
      <span class="sf-label">Casting</span>
      <div class="seg">
        <button type="button" :class="{ on: f.concentration }" @click="toggle('concentration')">Concentration</button>
        <button type="button" :class="{ on: f.ritual }" @click="toggle('ritual')">Ritual</button>
      </div>
    </div>

    <div class="sf-row">
      <span class="sf-label">Type</span>
      <div class="seg wrap">
        <button v-for="k in KINDS" :key="k" type="button" :class="{ on: f.spellType === k }" @click="set('spellType', f.spellType === k ? undefined : k)">{{ k }}</button>
      </div>
    </div>

    <div v-if="f.spellType === 'Saving throw' || f.savingThrow" class="sf-row">
      <span class="sf-label">Saving throw</span>
      <div class="seg">
        <button v-for="a in ABILITIES" :key="a" type="button" :class="{ on: f.savingThrow === a }" :title="a" @click="set('savingThrow', f.savingThrow === a ? undefined : a)">{{ a.slice(0, 3).toUpperCase() }}</button>
      </div>
    </div>

    <div class="sf-row">
      <span class="sf-label">Classes</span>
      <div class="seg wrap">
        <button v-for="c in CLASSES" :key="c" type="button" :class="{ on: (f.classes ?? []).includes(c) }" @click="toggleIn('classes', c)">{{ c }}</button>
      </div>
    </div>
  </div>
</template>
