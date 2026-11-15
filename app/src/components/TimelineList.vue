<script setup lang="ts">
import type { TItem } from '../timeline'
import type { Id } from '../model/types'
import { RELATION_KINDS } from '../model/schema'
import { formatDate, get } from '../store'
import EntryLink from './EntryLink.vue'

defineProps<{ items: TItem[] }>()

function when(it: TItem) {
  if (it.kind === 'relation') {
    if (it.start && it.end) return `${formatDate(it.start)} – ${formatDate(it.end)}`
    if (it.start) return `since ${formatDate(it.start)}`
    return `until ${formatDate(it.end)}`
  }
  return it.end ? `${formatDate(it.start)} – ${formatDate(it.end)}` : formatDate(it.start)
}
const people = (it: TItem) => it.involved.filter((id: Id) => get(id)?.type !== 'place' && id !== it.entry)
const typeLabel = (it: TItem) => it.kind === 'relation' ? RELATION_KINDS[it.rel!.kind].forward : it.category
</script>

<template>
  <div class="table-wrap">
    <table class="grid timeline-list">
      <thead><tr><th>When</th><th>What</th><th>Type</th><th>Who</th><th>Where</th></tr></thead>
      <tbody>
        <tr v-for="it in items" :key="it.key" :class="'k-' + it.kind">
          <td class="when-cell">{{ when(it) }}</td>
          <td>
            <template v-if="it.entry"><EntryLink :id="it.entry" /></template>
            <template v-else>
              <EntryLink :id="it.rel!.a" /> {{ RELATION_KINDS[it.rel!.kind].forward }} <EntryLink :id="it.rel!.b" />
              <span v-if="it.rel!.role" class="role">· {{ it.rel!.role }}</span>
            </template>
          </td>
          <td><span class="badge">{{ typeLabel(it) }}</span></td>
          <td><span class="chips"><EntryLink v-for="id in (it.kind === 'relation' ? [] : people(it))" :key="id" :id="id" class="chip" /></span></td>
          <td><span class="chips"><EntryLink v-for="id in it.places.filter(p => it.kind !== 'relation' || p !== it.rel!.b)" :key="id" :id="id" class="chip" /></span></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!items.length" class="muted pad">Nothing on the timeline matches.</p>
  </div>
</template>
