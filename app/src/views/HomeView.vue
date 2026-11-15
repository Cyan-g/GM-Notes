<script setup lang="ts">
import { computed } from 'vue'
import { byType, childrenOf, db, formatDate, entries } from '../store'
import EntryLink from '../components/EntryLink.vue'

const campaigns = computed(() => (byType.value.get('campaign') ?? []).map(c => {
  const s = (byType.value.get('session') ?? []).filter(x => x.fields.campaign === c.id)
  const last = s.sort((a, b) => (b.fields.number as number ?? 0) - (a.fields.number as number ?? 0))[0]
  return { c, count: s.length, last }
}))
const worlds = computed(() => (byType.value.get('place') ?? []).filter(p => !p.fields.parent))
const recent = computed(() => [...entries.value].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 8))
</script>

<template>
  <div class="home">
    <header>
      <h1>{{ db().meta.title }}</h1>
      <p class="muted">Today in the world: <a href="#/calendar"><b>{{ formatDate(db().meta.today) }}</b></a> · {{ entries.length }} entries</p>
    </header>
    <div class="home-grid">
      <section class="card">
        <h3>Campaigns</h3>
        <ul class="rel">
          <li v-for="{ c, count, last } in campaigns" :key="c.id">
            <EntryLink :id="c.id" icon />
            <span class="role">{{ c.fields.status || '' }}</span>
            <span class="when" v-if="count">{{ count }} sessions<template v-if="last">, last: <EntryLink :id="last.id" /></template></span>
          </li>
        </ul>
      </section>
      <section class="card">
        <h3>World</h3>
        <ul class="rel">
          <li v-for="w in worlds" :key="w.id">
            <EntryLink :id="w.id" icon />
            <ul class="rel nested"><li v-for="c in childrenOf.get(w.id) ?? []" :key="c.id"><EntryLink :id="c.id" /></li></ul>
          </li>
        </ul>
      </section>
      <section class="card">
        <h3>Recently changed</h3>
        <ul class="rel"><li v-for="e in recent" :key="e.id"><EntryLink :id="e.id" icon /></li></ul>
      </section>
    </div>
  </div>
</template>
