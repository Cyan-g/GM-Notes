<script setup lang="ts">
// Money typed as "12.5", "12 gp", "12 gp 7 sp 3 cp", or a change: "+5 gp", "-3 sp" (money.ts); stored in copper.
// What it refuses, it says why (below the field, and on hover).
import { ref, watch } from 'vue'
import { formatMoney } from '../../store'
import { parseMoney } from '../../money'

// other attributes (disabled, aria-label) go to the input, not the wrapper
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue?: number | null; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [number | undefined] }>()
const el = ref<HTMLInputElement>()
const text = ref(formatMoney(props.modelValue))
const error = ref('')
watch(() => props.modelValue, v => { if (document.activeElement !== el.value) text.value = formatMoney(v) })

function commit() {
  const r = parseMoney(text.value, props.modelValue ?? 0)
  if ('error' in r) { error.value = r.error === 'Not enough money for that' ? `${r.error}: there's ${formatMoney(props.modelValue ?? 0) || 'nothing'}` : r.error; return }
  error.value = ''
  if (isNaN(r.cp)) { emit('update:modelValue', undefined); return }
  emit('update:modelValue', r.cp)
  text.value = formatMoney(r.cp)
}
</script>

<template>
  <span class="money-field">
    <input ref="el" v-model="text" v-bind="$attrs" class="money" :class="{ bad: !!error }" :placeholder="placeholder || 'e.g. 25 gp'"
           :title="error || 'An amount (12 gp, 12 gp 7 sp), or a change: +5 gp, -3 sp'" :aria-invalid="!!error || undefined" @change="commit" @keydown.enter="commit" @input="error = ''" />
    <small v-if="error" class="money-error" role="alert">{{ error }}</small>
  </span>
</template>
