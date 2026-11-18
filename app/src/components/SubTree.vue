<script setup lang="ts">
// Everything below an entry (places in places, organizations in organizations), as a nested list.
// Branches with their own sub-entries can be folded; the first level starts open.
import { computed } from 'vue'
import { optionLabel } from '../store'
import { childrenOf } from '../store'
import type { Id } from '../model/types'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ id: Id; depth?: number }>()
const kids = computed(() => childrenOf.value.get(props.id) ?? [])
function count(id: Id): number {
  return (childrenOf.value.get(id) ?? []).reduce((n, c) => n + 1 + count(c.id), 0)
}
const kind = (f: Record<string, unknown>) => (f.placeType ? optionLabel('place.placeType', f.placeType) : f.orgType ? optionLabel('organization.orgType', f.orgType) : undefined)
</script>

<template>
  <ul class="sub-tree" :class="{ top: !depth }">
    <li v-for="c in kids" :key="c.id">
      <details v-if="childrenOf.get(c.id)?.length" :open="!depth">
        <summary><EntryLink :id="c.id" /> <span class="role">{{ kind(c.fields) }}</span><span class="tree-count">{{ count(c.id) }}</span></summary>
        <SubTree :id="c.id" :depth="(depth ?? 0) + 1" />
      </details>
      <span v-else class="tree-leaf"><EntryLink :id="c.id" /> <span class="role">{{ kind(c.fields) }}</span></span>
    </li>
  </ul>
</template>
