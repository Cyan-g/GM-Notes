<script setup lang="ts">
// One row of proficiencies on the character sheet: fixed choices as toggles (Light, Medium…), anything else
// as chips that can be removed, and a box to add one (with suggestions, e.g. every tool or weapon).
import { computed, ref } from 'vue'

const props = defineProps<{
  label: string
  values: string[]
  /** Shown as toggles, always. */
  toggles?: readonly string[]
  /** Suggested in the add box. Leave out `free` to allow only these. */
  suggest?: readonly string[]
  /** Anything may be typed, not only a suggestion. */
  free?: boolean
  placeholder?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ change: [values: string[]] }>()
const listId = `prof-${Math.random().toString(36).slice(2, 8)}`
const typed = ref('')
const low = (v: string) => v.toLowerCase()
const has = (v: string) => props.values.some(x => low(x) === low(v))
const extras = computed(() => props.values.filter(v => !props.toggles?.some(t => low(t) === low(v))))
const offered = computed(() => (props.suggest ?? []).filter(v => !has(v)))

const toggle = (v: string) => emit('change', has(v) ? props.values.filter(x => low(x) !== low(v)) : [...props.values, v])
const remove = (v: string) => emit('change', props.values.filter(x => x !== v))
function add() {
  const raw = typed.value.trim()
  if (!raw) return
  // A suggestion typed in other letter case is taken as written in the list.
  const v = props.suggest?.find(x => low(x) === low(raw)) ?? (props.free ? raw : undefined)
  if (v && !has(v)) emit('change', [...props.values, v])
  if (v) typed.value = ''
}
</script>

<template>
  <div class="prof-row">
    <span class="prof-label">{{ label }}</span>
    <div class="prof-chips">
      <button v-for="t in toggles" :key="t" type="button" class="chip-toggle" :class="{ on: has(t) }" :disabled="disabled" @click="toggle(t)">{{ t }}</button>
      <span v-for="v in extras" :key="v" class="chip prof-chip">{{ v }}<button v-if="!disabled" type="button" class="link-btn" :title="`Remove ${v}`" @click="remove(v)">×</button></span>
      <template v-if="!disabled && (free || offered.length)">
        <input v-model="typed" class="prof-add" :list="listId" :placeholder="placeholder ?? 'Add…'" @keydown.enter.prevent="add" @change="add" />
        <datalist :id="listId"><option v-for="o in offered" :key="o" :value="o" /></datalist>
      </template>
      <span v-if="disabled && !values.length" class="muted small">none</span>
    </div>
  </div>
</template>
