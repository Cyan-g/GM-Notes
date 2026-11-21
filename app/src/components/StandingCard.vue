<script setup lang="ts">
// A character's standing with organizations: each one they belong to or have renown with, the rank the renown
// earns and what the next one takes.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { rankForRenown, standingOf } from '../org'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ pc: Entry }>()
const rows = computed(() => standingOf(props.pc).map(s => ({ ...s, ...(s.renown != null ? rankForRenown(s.org, s.renown) : {}) })))
</script>

<template>
  <div v-if="rows.length" class="card standing-card">
    <h3>Standing</h3>
    <div v-for="r in rows" :key="r.org.id" class="renown-row">
      <EntryLink :id="r.org.id" icon />
      <span v-if="r.role" class="role small">{{ r.role }}</span>
      <span v-if="r.renown != null" class="small"><span class="muted">renown</span> <b>{{ r.renown }}</b>
        <template v-if="r.rank"> · {{ r.rank.title }}</template>
        <span v-if="r.next" class="muted"> · {{ r.next.title }} at {{ r.next.renown }}</span></span>
    </div>
  </div>
</template>
