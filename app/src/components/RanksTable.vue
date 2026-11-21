<script setup lang="ts">
// An organization's ranks, highest first, with the current members holding each one
// (a member whose role is the rank's title, e.g. "Archmage").
import { computed } from 'vue'
import type { Entry, RankLine } from '../model/types'
import { membersOf } from '../org'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ ranks: RankLine[]; org: Entry }>()
const norm = (s?: string) => (s ?? '').trim().toLowerCase()
const holders = computed(() => {
  const current = membersOf(props.org)
  return props.ranks.map(k => current.filter(r => norm(r.role) === norm(k.title)).map(r => r.a))
})
const anyHolders = computed(() => holders.value.some(h => h.length))
</script>

<template>
  <table class="mini ranks">
    <thead><tr><th class="num">Rank</th><th>Title</th><th class="num">Renown</th><th>Station</th><th v-if="anyHolders">Held by</th></tr></thead>
    <tbody>
      <tr v-for="(k, i) in ranks" :key="i">
        <td class="num rank-n">{{ i + 1 }}</td>
        <td class="rank-title">{{ k.title }}</td>
        <td class="num">{{ k.renown ?? '—' }}</td>
        <td>{{ k.station }}</td>
        <td v-if="anyHolders"><template v-for="(id, j) in holders[i]" :key="id"><template v-if="j">, </template><span class="nowrap"><EntryLink :id="id" /></span></template></td>
      </tr>
    </tbody>
  </table>
</template>
