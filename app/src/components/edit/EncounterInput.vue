<script setup lang="ts">
// Encounter lines: how many of which creature. A creature can be an entry or just a name.
import { computed, ref } from 'vue'
import type { EncounterLine } from '../../model/types'
import { lineInfo } from '../../encounter'
import EntryPicker from './EntryPicker.vue'

const props = defineProps<{ modelValue?: EncounterLine[] }>()
const emit = defineEmits<{ 'update:modelValue': [EncounterLine[]] }>()
const lines = computed(() => props.modelValue ?? [])
const freeName = ref('')

function update(i: number, patch: Partial<EncounterLine>) {
  emit('update:modelValue', lines.value.map((l, j) => {
    if (j !== i) return l
    const n = { ...l, ...patch }
    for (const k of ['hp', 'ac', 'init', 'creature', 'name'] as const) if (n[k] === undefined || n[k] === null || (n[k] as unknown) === '') delete n[k]
    return n
  }))
}
const remove = (i: number) => emit('update:modelValue', lines.value.filter((_, j) => j !== i))
const addEntry = (id: string) => emit('update:modelValue', [...lines.value, { creature: id, count: 1 }])
function addName() {
  const n = freeName.value.trim()
  if (!n) return
  emit('update:modelValue', [...lines.value, { name: n, count: 1 }])
  freeName.value = ''
}
const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
</script>

<template>
  <table class="mini edit-table">
    <thead><tr><th class="num">#</th><th>Creature</th><th class="num" title="Leave empty to use the statblock">HP</th><th class="num">AC</th><th /></tr></thead>
    <tbody>
      <tr v-for="(l, i) in lines" :key="i">
        <td class="num"><input type="number" min="1" class="short" :value="l.count" @change="update(i, { count: Math.max(1, Number(($event.target as HTMLInputElement).value) || 1) })" /></td>
        <td>
          <EntryPicker v-if="l.creature" :model-value="l.creature" :types="['creature', 'npc']" @update:model-value="v => update(i, { creature: v ?? undefined, name: v ? undefined : lineInfo(l).name })" />
          <div v-else class="free-name">
            <input :value="l.name" @change="update(i, { name: ($event.target as HTMLInputElement).value })" />
            <EntryPicker add :types="['creature', 'npc']" placeholder="Link to entry…" @pick="id => update(i, { creature: id, name: undefined })" />
          </div>
        </td>
        <td class="num"><input type="number" class="short" :value="l.hp ?? ''" :placeholder="String(lineInfo({ ...l, hp: undefined }).hp ?? '')" @change="update(i, { hp: num(($event.target as HTMLInputElement).value) })" /></td>
        <td class="num"><input type="number" class="short" :value="l.ac ?? ''" :placeholder="String(lineInfo({ ...l, ac: undefined }).ac ?? '')" @change="update(i, { ac: num(($event.target as HTMLInputElement).value) })" /></td>
        <td><button type="button" class="x" title="Remove" @click="remove(i)">×</button></td>
      </tr>
      <tr>
        <td colspan="5" class="add-row">
          <EntryPicker add :types="['creature', 'npc']" placeholder="Add creature…" @pick="addEntry" />
          <span class="muted small">or by name</span>
          <input v-model="freeName" placeholder="e.g. Goblin" @keydown.enter.prevent="addName" @blur="addName" />
        </td>
      </tr>
    </tbody>
  </table>
</template>
