<script setup lang="ts">
// Money typed as "12.5", "12 gp", "5 sp" or "3 cp"; stored in copper.
import { ref, watch } from 'vue'
import { formatMoney } from '../../store'

const props = defineProps<{ modelValue?: number | null; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [number | undefined] }>()
const el = ref<HTMLInputElement>()
const text = ref(formatMoney(props.modelValue))
const bad = ref(false)
watch(() => props.modelValue, v => { if (document.activeElement !== el.value) text.value = formatMoney(v) })

const MULT: Record<string, number> = { pp: 1000, gp: 100, sp: 10, cp: 1 }
function commit() {
  const t = text.value.trim().toLowerCase().replace(',', '.')
  if (!t) { bad.value = false; emit('update:modelValue', undefined); return }
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(gp|sp|cp|pp)?$/)
  if (!m) { bad.value = true; return }
  bad.value = false
  const cp = Math.round(Number(m[1]) * MULT[m[2] ?? 'gp'])
  emit('update:modelValue', cp)
  text.value = formatMoney(cp)
}
</script>

<template>
  <input ref="el" v-model="text" class="money" :class="{ bad }" :placeholder="placeholder || 'e.g. 25 gp'" title="Amount in gp, or add sp / cp" @change="commit" @keydown.enter="commit" />
</template>
