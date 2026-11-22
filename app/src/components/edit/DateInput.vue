<script setup lang="ts">
// An in-world date: year, month and day in that order (a day needs its month and year: typing one fills them in from
// today in the world); "Today" sets today's date.
import Dropdown from '../Dropdown.vue'
import { computed } from 'vue'
import type { WorldDate } from '../../model/types'
import { db } from '../../store'

const props = defineProps<{ modelValue?: WorldDate | null }>()
const emit = defineEmits<{ 'update:modelValue': [WorldDate | undefined] }>()
const months = computed(() => db().meta.calendar.months)
const d = computed(() => props.modelValue ?? undefined)
const yearHint = computed(() => { const e = [...db().meta.calendar.eras].sort((a, b) => a.fromYear - b.fromYear); return e.length > 1 ? `Years below 0 are ${e[0].name}` : 'Years below 0 count backwards' })

function set(part: 'year' | 'month' | 'day', raw: string) {
  const v = raw === '' ? undefined : Number(raw)
  const next: Partial<WorldDate> = { ...(d.value ?? {}) }
  if (v === undefined || Number.isNaN(v)) delete next[part]
  else next[part] = v
  // a day or month typed first: the rest of the date from today in the world
  const today = db().meta.today
  if (part !== 'year' && next.year == null && today) next.year = today.year
  if (part === 'day' && next.day != null && !next.month && today?.month) next.month = today.month
  if (!next.month) delete next.day
  emit('update:modelValue', next.year == null ? undefined : (next as WorldDate))
}
const setToday = () => { const t = db().meta.today; if (t) emit('update:modelValue', { ...t }) }
const maxDay = computed(() => d.value?.month ? months.value[d.value.month - 1]?.days ?? 31 : 31)
</script>

<template>
  <span class="date-input">
    <input type="number" class="year" :value="d?.year ?? ''" placeholder="Year" :title="yearHint" @change="set('year', ($event.target as HTMLInputElement).value)" />
    <Dropdown :value="d?.month ?? ''" @change="set('month', ($event.target as HTMLSelectElement).value)">
      <option value="">Month</option>
      <option v-for="(m, i) in months" :key="m.name" :value="i + 1">{{ m.name }}</option>
    </Dropdown>
    <input type="number" class="day" :value="d?.day ?? ''" min="1" :max="maxDay" placeholder="Day" @change="set('day', ($event.target as HTMLInputElement).value)" />
    <button v-if="db().meta.today" type="button" class="link-btn small" title="Today in the world" @click="setToday">Today</button>
  </span>
</template>
