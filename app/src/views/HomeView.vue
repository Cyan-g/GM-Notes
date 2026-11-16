<script setup lang="ts">
import { computed } from 'vue'
import { byType, childrenOf, db, entries, formatDate, get } from '../store'
import EntryLink from '../components/EntryLink.vue'
import { describe } from '../describe'
import { toggleFavourite } from '../edit'

const campaigns = computed(() => (byType.value.get('campaign') ?? []).map(c => {
  const s = (byType.value.get('session') ?? []).filter(x => x.fields.campaign === c.id)
  const last = s.sort((a, b) => (b.fields.number as number ?? 0) - (a.fields.number as number ?? 0))[0]
  return { c, count: s.length, last }
}))
const worlds = computed(() => (byType.value.get('place') ?? []).filter(p => !p.fields.parent))
const favourites = computed(() => (db().meta.favourites ?? []).map(id => get(id)).filter((e): e is NonNullable<typeof e> => !!e))
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
      <section class="card favourites">
        <h3>★ Favourites</h3>
        <ul v-if="favourites.length" class="rel">
          <li v-for="e in favourites" :key="e.id">
            <EntryLink :id="e.id" icon />
            <span class="role">{{ describe(e, { parent: false }) }}</span>
            <button class="link-btn unfav" title="Remove from favourites" @click="toggleFavourite(e.id)">✕</button>
          </li>
        </ul>
        <p v-else class="muted small">Star an entry with ☆ next to its Edit button (or press F on its page) to keep it here.</p>
      </section>
    </div>
  </div>
</template>
