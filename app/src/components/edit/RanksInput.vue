<script setup lang="ts">
// An organization's ranks as rows, highest first: title, renown needed, and what the rank means.
import { computed } from 'vue'
import type { RankLine } from '../../model/types'

const props = defineProps<{ modelValue?: RankLine[] }>()
const emit = defineEmits<{ 'update:modelValue': [RankLine[]] }>()
const ranks = computed(() => props.modelValue ?? [])

function update(i: number, patch: Partial<RankLine>) {
  emit('update:modelValue', ranks.value.map((k, j) => {
    if (j !== i) return k
    const n = { ...k, ...patch }
    if (n.renown == null || Number.isNaN(n.renown)) delete n.renown
    if (!n.station) delete n.station
    return n
  }))
}
const remove = (i: number) => emit('update:modelValue', ranks.value.filter((_, j) => j !== i))
function move(i: number, d: number) {
  const list = [...ranks.value], j = i + d
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  emit('update:modelValue', list)
}
// New ranks go at the bottom: the lowest rank, usually with the least renown.
const add = () => emit('update:modelValue', [...ranks.value, { title: '', renown: 0 }])
const val = (ev: Event) => (ev.target as HTMLInputElement).value
</script>

<template>
  <table class="mini edit-table ranks-edit">
    <thead><tr><th class="num">Rank</th><th>Title</th><th class="num" title="Renown needed; empty for a rank that is appointed">Renown</th><th>Station</th><th /></tr></thead>
    <tbody>
      <tr v-for="(k, i) in ranks" :key="i">
        <td class="num rank-n">{{ i + 1 }}</td>
        <td><input :value="k.title" placeholder="Title" @change="update(i, { title: val($event).trim() })" /></td>
        <td class="num"><input type="number" class="short" :value="k.renown ?? ''" placeholder="—" @change="update(i, { renown: val($event) === '' ? undefined : Number(val($event)) })" /></td>
        <td><input :value="k.station ?? ''" placeholder="What this rank means" @change="update(i, { station: val($event).trim() })" /></td>
        <td class="ranks-actions">
          <button type="button" class="link-btn" title="Higher" :disabled="i === 0" @click="move(i, -1)">↑</button>
          <button type="button" class="link-btn" title="Lower" :disabled="i === ranks.length - 1" @click="move(i, 1)">↓</button>
          <button type="button" class="x" title="Remove" @click="remove(i)">×</button>
        </td>
      </tr>
      <tr><td colspan="5"><button type="button" class="chip-btn" @click="add">＋ Add a rank</button> <span class="muted small">Highest first. Members whose role is a rank's title show up next to it.</span></td></tr>
    </tbody>
  </table>
</template>
