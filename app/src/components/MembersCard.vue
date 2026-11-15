<script setup lang="ts">
// Members of an organization as of a chosen year: who was in, who had left, who came later.
import { computed, ref } from 'vue'
import type { Entry, Relation } from '../model/types'
import { db, formatDate, get, relationsOf } from '../store'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ org: Entry }>()
const year = ref<number>(db().meta.today.year)

const members = computed(() => (relationsOf.value.get(props.org.id) ?? []).filter(r => r.kind === 'member' && r.b === props.org.id))
const split = computed(() => {
  const y = year.value
  const now: Relation[] = [], before: Relation[] = [], later: Relation[] = []
  for (const r of members.value) {
    if (r.from && r.from.year > y) later.push(r)
    else if (r.to && r.to.year < y) before.push(r)
    else now.push(r)
  }
  const byName = (a: Relation, b: Relation) => (get(a.a)?.name ?? '').localeCompare(get(b.a)?.name ?? '')
  return { now: now.sort(byName), before: before.sort(byName), later: later.sort(byName) }
})
const range = (r: Relation) => (r.from || r.to) ? `${r.from ? formatDate(r.from) : '?'} – ${r.to ? formatDate(r.to) : 'now'}` : ''
</script>

<template>
  <div class="card members-card">
    <h3>Members <span class="muted small">as of</span>
      <input type="number" class="short" :value="year" @change="year = Number(($event.target as HTMLInputElement).value) || db().meta.today.year" />
    </h3>
    <ul class="rel">
      <li v-for="r in split.now" :key="r.id"><EntryLink :id="r.a" icon /><span v-if="r.role" class="role">{{ r.role }}</span><span class="when">{{ range(r) }}</span></li>
    </ul>
    <p v-if="!split.now.length" class="muted small">Nobody known in {{ year }}.</p>
    <details v-if="split.before.length">
      <summary class="muted small">Earlier members ({{ split.before.length }})</summary>
      <ul class="rel ended-list">
        <li v-for="r in split.before" :key="r.id"><EntryLink :id="r.a" icon /><span v-if="r.role" class="role">{{ r.role }}</span><span class="when">{{ range(r) }}</span></li>
      </ul>
    </details>
    <details v-if="split.later.length">
      <summary class="muted small">Joined later ({{ split.later.length }})</summary>
      <ul class="rel ended-list">
        <li v-for="r in split.later" :key="r.id"><EntryLink :id="r.a" icon /><span v-if="r.role" class="role">{{ r.role }}</span><span class="when">{{ range(r) }}</span></li>
      </ul>
    </details>
  </div>
</template>
