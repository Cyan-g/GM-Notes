<script setup lang="ts">
// Pick an entry by typing its name. Single mode shows the current pick; add mode clears after each pick.
import { entryIcon } from '../../model/classes'
import { computed, nextTick, ref, watch } from 'vue'
import type { EntryType } from '../../model/types'
import { TYPES } from '../../model/schema'
import { search } from '../../search'
import { get } from '../../store'
import { createEntry } from '../../edit'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  types?: readonly EntryType[]
  placeholder?: string
  add?: boolean
  exclude?: string[]
  /** If given, only these entries can be picked. */
  only?: string[]
}>(), { modelValue: null, add: false })
const emit = defineEmits<{ 'update:modelValue': [string | null]; pick: [string] }>()

const editing = ref(false)
const q = ref('')
const sel = ref(0)
const input = ref<HTMLInputElement>()
const current = computed(() => get(props.modelValue))
const results = computed(() => search(q.value, 10, e => (!props.types?.length || props.types.includes(e.type)) && !props.exclude?.includes(e.id) && (!props.only || props.only.includes(e.id))))
const createType = computed(() => props.types?.length === 1 && !props.only ? props.types[0] : null)
const options = computed(() => [
  ...results.value.map(e => ({ kind: 'pick' as const, e })),
  ...(createType.value && q.value.trim() && !results.value.some(e => e.name.toLowerCase() === q.value.trim().toLowerCase())
    ? [{ kind: 'create' as const, e: null }] : []),
])
watch(q, () => { sel.value = 0 })

async function start() {
  editing.value = true
  q.value = ''
  await nextTick()
  input.value?.focus()
}
function choose(i = sel.value) {
  const o = options.value[i]
  if (!o) return
  const id = o.kind === 'pick' ? o.e!.id : createEntry(createType.value!, q.value.trim()).id
  if (props.add) emit('pick', id)
  else emit('update:modelValue', id)
  q.value = ''
  if (!props.add) editing.value = false
}
function key(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown') { sel.value = Math.min(sel.value + 1, options.value.length - 1); ev.preventDefault() }
  else if (ev.key === 'ArrowUp') { sel.value = Math.max(sel.value - 1, 0); ev.preventDefault() }
  else if (ev.key === 'Enter') { ev.preventDefault(); choose() }
  else if (ev.key === 'Escape') { editing.value = false; q.value = '' }
}
function blur() { setTimeout(() => { if (!props.add) editing.value = false; q.value = '' }, 150) }
</script>

<template>
  <div class="picker">
    <div v-if="!add && !editing" class="picker-current">
      <button type="button" class="picker-value" @click="start">
        <template v-if="current"><span class="icon">{{ entryIcon(current) }}</span>{{ current.name }}</template>
        <span v-else class="muted">{{ placeholder || 'Choose…' }}</span>
      </button>
      <button v-if="modelValue" type="button" class="x" title="Clear" @click="emit('update:modelValue', null)">×</button>
    </div>
    <template v-else>
      <input ref="input" v-model="q" :placeholder="placeholder || 'Type a name…'" @keydown="key" @blur="blur" @focus="editing = true" />
      <ul v-if="editing && q && options.length" class="picker-list">
        <li v-for="(o, i) in options" :key="o.e?.id ?? 'create'" :class="{ sel: i === sel }" @mousedown.prevent="choose(i)" @mousemove="sel = i">
          <template v-if="o.kind === 'pick'">
            <span class="icon">{{ entryIcon(o.e!) }}</span>{{ o.e!.name }}
            <span class="muted small">{{ TYPES[o.e!.type].label }}</span>
          </template>
          <template v-else>＋ Create {{ TYPES[createType!].label.toLowerCase() }} “{{ q.trim() }}”</template>
        </li>
      </ul>
    </template>
  </div>
</template>
