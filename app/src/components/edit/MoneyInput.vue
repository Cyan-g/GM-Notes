<script setup lang="ts">
// Money typed as "12.5", "12 gp", "12 gp 7 sp 3 cp", or a change: "+5 gp", "-3 sp" (money.ts), in the world's coins (the
// Ruleset's "Currency"); stored as a number of its smallest coin.
// What it refuses, it says why (below the field, and on hover).
import { computed, ref, watch } from 'vue'
import { formatMoney } from '../../store'
import { parseMoney } from '../../money'
import { currency } from '../../rules'

// other attributes (disabled, aria-label) go to the input, not the wrapper
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue?: number | null; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [number | undefined] }>()
const el = ref<HTMLInputElement>()
const text = ref(formatMoney(props.modelValue))
const error = ref('')
watch(() => props.modelValue, v => { if (document.activeElement !== el.value) text.value = formatMoney(v) })

function commit() {
  const r = parseMoney(text.value, props.modelValue ?? 0, currency())
  if ('error' in r) { error.value = r.error === 'Not enough money for that' ? `${r.error}: there's ${formatMoney(props.modelValue ?? 0) || 'nothing'}` : r.error; return }
  error.value = ''
  if (isNaN(r.cp)) { emit('update:modelValue', undefined); return }
  emit('update:modelValue', r.cp)
  text.value = formatMoney(r.cp)
}
/** The coins for the hover text: "An amount (12 gp, 12 gp 7 sp)". */
const hint = computed(() => {
  const c = currency(), i = c.coins.findIndex(x => x.abbr === c.main), below = c.coins[i - 1]?.abbr
  return `An amount (12 ${c.main}${below ? `, 12 ${c.main} 7 ${below}` : ''}), or a change: +5 ${c.main}${below ? `, -3 ${below}` : ''}. Coins: ${c.coins.map(x => x.abbr).join(', ')}`
})
</script>

<template>
  <span class="money-field">
    <input ref="el" v-model="text" v-bind="$attrs" class="money" :class="{ bad: !!error }" :placeholder="placeholder || `e.g. 25 ${currency().main}`"
           :title="error || hint" :aria-invalid="!!error || undefined" @change="commit" @keydown.enter="commit" @input="error = ''" />
    <small v-if="error" class="money-error" role="alert">{{ error }}</small>
  </span>
</template>
