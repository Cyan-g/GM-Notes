<script setup lang="ts">
// An in-world date: year required, month and day optional.
import { computed } from 'vue'
import type { WorldDate } from '../../model/types'
import { db } from '../../store'

const props = defineProps<{ modelValue?: WorldDate | null }>()
const emit = defineEmits<{ 'update:modelValue': [WorldDate | undefined] }>()
const months = computed(() => db().meta.calendar.months)
const d = computed(() => props.modelValue ?? undefined)

function set(part: 'year' | 'month' | 'day', raw: string) {
  const v = raw === '' ? undefined : Number(raw)
  const next: Partial<WorldDate> = { ...(d.value ?? {}) }
  if (v === undefined || Number.isNaN(v)) delete next[part]
  else next[part] = v
  if (!next.month) delete next.day
  emit('update:modelValue', next.year == null ? undefined : (next as WorldDate))
}
const maxDay = computed(() => d.value?.month ? months.value[d.value.month - 1]?.days ?? 31 : 31)
</script>

<template>
  <span class="date-input">
    <input type="number" class="day" :value="d?.day ?? ''" min="1" :max="maxDay" placeholder="Day" :disabled="!d?.month" @change="set('day', ($event.target as HTMLInputElement).value)" />
    <select :value="d?.month ?? ''" :disabled="d?.year == null" @change="set('month', ($event.target as HTMLSelectElement).value)">
      <option value="">Month</option>
      <option v-for="(m, i) in months" :key="m.name" :value="i + 1">{{ m.name }}</option>
    </select>
    <input type="number" class="year" :value="d?.year ?? ''" placeholder="Year" title="Negative years are before the Calamity" @change="set('year', ($event.target as HTMLInputElement).value)" />
  </span>
</template>
