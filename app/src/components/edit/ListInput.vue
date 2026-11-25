<script setup lang="ts">
// A list of short texts as removable chips. Enter or comma adds one.
import SuggestInput from '../SuggestInput.vue'
import { ref } from 'vue'

const props = defineProps<{ modelValue?: string[]; options?: readonly string[]; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
const q = ref('')

function add() {
  const v = q.value.trim().replace(/,$/, '')
  if (!v) return
  const list = [...(props.modelValue ?? [])]
  if (!list.includes(v)) list.push(v)
  emit('update:modelValue', list)
  q.value = ''
}
function remove(i: number) {
  const list = [...(props.modelValue ?? [])]
  list.splice(i, 1)
  emit('update:modelValue', list)
}
function key(ev: KeyboardEvent) {
  if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); add() }
  else if (ev.key === 'Backspace' && !q.value && props.modelValue?.length) remove(props.modelValue.length - 1)
}
</script>

<template>
  <div class="list-input">
    <span v-for="(v, i) in modelValue ?? []" :key="v + i" class="chip">{{ v }}<button type="button" class="x" @click="remove(i)">×</button></span>
    <SuggestInput v-model="q" :options="(options ?? []).filter(o => !(modelValue ?? []).includes(o))" :placeholder="placeholder || 'Add…'" @keydown="key" @blur="add" />
  </div>
</template>
