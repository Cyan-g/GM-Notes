<script setup lang="ts">
// Several choices from a list (a weapon's properties): the chosen ones as chips (with their description on hover),
// and a dropdown to add another.
import { computed } from 'vue'
import type { ListOption } from '../../model/lists'

const props = defineProps<{ values: string[]; options: ListOption[]; placeholder?: string }>()
const emit = defineEmits<{ change: [values: string[]] }>()
const chosen = computed(() => props.values.map(id => props.options.find(o => o.id === id) ?? { id, label: id }))
const left = computed(() => props.options.filter(o => !props.values.includes(o.id)))
function add(ev: Event) {
  const el = ev.target as HTMLSelectElement
  if (el.value) emit('change', [...props.values, el.value])
  el.value = ''
}
const remove = (id: string) => emit('change', props.values.filter(v => v !== id))
</script>

<template>
  <div class="choice-list">
    <span v-for="o in chosen" :key="o.id" class="chip" :class="{ tip: 'note' in o && o.note }" :data-tip="'note' in o ? o.note : undefined">
      {{ o.label }}<button type="button" class="link-btn" :title="`Remove ${o.label}`" @click="remove(o.id)">×</button>
    </span>
    <select v-if="left.length" class="choice-add" :aria-label="placeholder ?? 'Add…'" @change="add">
      <option value="">{{ placeholder ?? 'Add…' }}</option>
      <option v-for="o in left" :key="o.id" :value="o.id" :title="o.note">{{ o.label }}</option>
    </select>
  </div>
</template>
