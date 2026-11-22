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
  /** What the character has anyway (from the species, classes, feats): shown greyed with where from, not removable. */
  given?: { id: string; from: string }[]
}>()
const emit = defineEmits<{ change: [values: string[]] }>()
const listId = `prof-${Math.random().toString(36).slice(2, 8)}`
const typed = ref('')
const all = computed(() => [...(props.toggles ?? []), ...(props.suggest ?? [])])
/** An option's label; an id the lists don't have reads as words ("bagpipes" → "Bagpipes", "herbalism-kit" → "Herbalism kit"). */
const labelOf = (id: string) => all.value.find(o => o.id === id)?.label ?? (/^[a-z0-9-]+$/.test(id) ? (id.charAt(0).toUpperCase() + id.slice(1)).replace(/-/g, ' ') : id)
const has = (id: string) => props.values.includes(id)
const givenBy = (id: string) => props.given?.filter(g => g.id === id).map(g => g.from).join(', ') ?? ''
/** Given ones not typed and not a toggle: greyed chips. */
const givenExtras = computed(() => [...new Set((props.given ?? []).map(g => g.id))].filter(id => !has(id) && !props.toggles?.some(t => t.id === id)))
const extras = computed(() => props.values.filter(v => !props.toggles?.some(t => t.id === v)))
/** Disabled, only the toggles that are on show. */
const shownToggles = computed(() => (props.disabled ? props.toggles?.filter(t => has(t.id)) : props.toggles) ?? [])
const offered = computed(() => (props.suggest ?? []).filter(o => !has(o.id)))

const toggle = (id: string) => emit('change', has(id) ? props.values.filter(x => x !== id) : [...props.values, id])
const remove = (id: string) => emit('change', props.values.filter(x => x !== id))
/** The only one, if there's exactly one. */
const one = <T,>(l: T[]) => (l.length === 1 ? l[0] : undefined)
function add() {
  const raw = typed.value.trim()
  if (!raw) return
  const low = raw.toLowerCase()
  // the best match: the name itself, else the one suggestion it starts (or else is part of); only a name that matches
  // nothing is new ("Elv" is Elvish, never a language called "Elv")
  const found = all.value.find(o => o.label.toLowerCase() === low)
    ?? one(offered.value.filter(o => o.label.toLowerCase().startsWith(low)))
    ?? one(offered.value.filter(o => o.label.toLowerCase().includes(low)))
  const matches = offered.value.some(o => o.label.toLowerCase().includes(low))
  const id = found?.id ?? (matches ? undefined : props.create?.(raw))
  if (!id) return
  if (!has(id)) emit('change', [...props.values, id])
  typed.value = ''
}
</script>

<template>
  <div class="prof-row" :class="{ bare: !label }">
    <span v-if="label" class="prof-label">{{ label }}</span>
    <div class="prof-chips">
      <button v-for="t in shownToggles" :key="t.id" type="button" class="chip-toggle" :class="{ on: has(t.id), given: !has(t.id) && !!givenBy(t.id) }" :disabled="disabled || (!has(t.id) && !!givenBy(t.id))" :title="!has(t.id) && givenBy(t.id) ? `From ${givenBy(t.id)}` : undefined" @click="toggle(t.id)">{{ t.label }}</button>
      <span v-for="v in givenExtras" :key="'g-' + v" class="chip prof-chip given" :title="`From ${givenBy(v)}`">{{ labelOf(v) }}</span>
      <span v-for="v in extras" :key="v" class="chip prof-chip">{{ labelOf(v) }}<button v-if="!disabled" type="button" class="link-btn" :title="`Remove ${labelOf(v)}`" @click="remove(v)">×</button></span>
      <template v-if="!disabled && (create || offered.length)">
        <input v-model="typed" class="prof-add" :list="listId" :placeholder="placeholder ?? 'Add…'" @keydown.enter.prevent="add" @change="add" />
        <datalist :id="listId"><option v-for="o in offered" :key="o.id" :value="o.label" /></datalist>
      </template>
      <span v-if="disabled && !values.length && !givenExtras.length" class="muted small">none</span>
    </div>
  </div>
</template>
