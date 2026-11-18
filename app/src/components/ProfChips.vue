<script setup lang="ts">
// One row of proficiencies on the character sheet. Values are ids (list options or Tool items): the fixed
// choices show as toggles (Light, Medium…), the rest as chips that can be removed, plus a box to add one of the
// suggestions. With `create`, a name that isn't one yet is added to its list first.
import { computed, ref } from 'vue'
import type { ListOption } from '../model/lists'

const props = defineProps<{
  /** Left out in a form, where the field has its own label. */
  label?: string
  values: string[]
  /** Shown as toggles, always. */
  toggles?: ListOption[]
  /** What can be added in the box. */
  suggest?: ListOption[]
  /** Make a new option from a typed name; returns its id. */
  create?: (label: string) => string
  placeholder?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ change: [values: string[]] }>()
const listId = `prof-${Math.random().toString(36).slice(2, 8)}`
const typed = ref('')
const all = computed(() => [...(props.toggles ?? []), ...(props.suggest ?? [])])
const labelOf = (id: string) => all.value.find(o => o.id === id)?.label ?? id
const has = (id: string) => props.values.includes(id)
const extras = computed(() => props.values.filter(v => !props.toggles?.some(t => t.id === v)))
const offered = computed(() => (props.suggest ?? []).filter(o => !has(o.id)))

const toggle = (id: string) => emit('change', has(id) ? props.values.filter(x => x !== id) : [...props.values, id])
const remove = (id: string) => emit('change', props.values.filter(x => x !== id))
function add() {
  const raw = typed.value.trim()
  if (!raw) return
  const low = raw.toLowerCase()
  const found = all.value.find(o => o.label.toLowerCase() === low)
  const id = found?.id ?? props.create?.(raw)
  if (!id) return
  if (!has(id)) emit('change', [...props.values, id])
  typed.value = ''
}
</script>

<template>
  <div class="prof-row" :class="{ bare: !label }">
    <span v-if="label" class="prof-label">{{ label }}</span>
    <div class="prof-chips">
      <button v-for="t in toggles" :key="t.id" type="button" class="chip-toggle" :class="{ on: has(t.id) }" :disabled="disabled" @click="toggle(t.id)">{{ t.label }}</button>
      <span v-for="v in extras" :key="v" class="chip prof-chip">{{ labelOf(v) }}<button v-if="!disabled" type="button" class="link-btn" :title="`Remove ${labelOf(v)}`" @click="remove(v)">×</button></span>
      <template v-if="!disabled && (create || offered.length)">
        <input v-model="typed" class="prof-add" :list="listId" :placeholder="placeholder ?? 'Add…'" @keydown.enter.prevent="add" @change="add" />
        <datalist :id="listId"><option v-for="o in offered" :key="o.id" :value="o.label" /></datalist>
      </template>
      <span v-if="disabled && !values.length" class="muted small">none</span>
    </div>
  </div>
</template>
