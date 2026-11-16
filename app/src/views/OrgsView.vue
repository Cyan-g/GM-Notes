<script setup lang="ts">
// The People menu's front page: every organization as a card, grouped by the region its seat is in,
// with its leader, members and ranks at a glance; and the people tables beside it.
import { computed, ref } from 'vue'
import type { Entry, Id, RankLine } from '../model/types'
import { byType, childrenOf, isCurrent, placePath, relationsOf } from '../store'
import { hrefDashboard, hrefEntry, hrefList } from '../router'
import { TYPES } from '../model/schema'
import { newEntry } from '../ui'
import EntryLink from '../components/EntryLink.vue'

const orgs = computed(() => byType.value.get('organization') ?? [])
const npcs = computed(() => byType.value.get('npc') ?? [])
const ORG_TYPES = (TYPES.organization.fields.find(f => f.key === 'orgType')?.options ?? []) as string[]

// ---- filters ----
const typeFilter = ref<string>('')
const q = ref('')
const types = computed(() => ORG_TYPES.filter(t => orgs.value.some(o => o.fields.orgType === t)))
const shown = computed(() => orgs.value.filter(o =>
  (!typeFilter.value || (typeFilter.value === '—' ? !o.fields.orgType : o.fields.orgType === typeFilter.value))
  && (!q.value.trim() || [o.name, ...o.aliases].some(n => n.toLowerCase().includes(q.value.trim().toLowerCase())))))

// ---- per organization ----
const members = (o: Entry) => (relationsOf.value.get(o.id) ?? []).filter(r => r.kind === 'member' && r.b === o.id && isCurrent(r))
const ranks = (o: Entry) => (o.fields.ranks as RankLine[] | undefined) ?? []
const LEADER = /\b(leader|head|king|queen|duke|duchess|chief|chieftain|general|archmage|vizier|saint|high[- ]?priest(ess)?|grandmaster|captain|matriarch|patriarch)\b/i
/** Who leads it: the holder of the top rank, else a member whose role sounds like it. */
function leader(o: Entry): { id: Id; role?: string } | undefined {
  const m = members(o)
  const top = ranks(o)[0]?.title?.toLowerCase()
  const r = (top && m.find(x => x.role?.trim().toLowerCase() === top)) || m.find(x => x.role && LEADER.test(x.role))
  return r ? { id: r.a, role: r.role } : undefined
}
const subOrgs = (o: Entry) => (childrenOf.value.get(o.id) ?? []).filter(c => c.type === 'organization')

// ---- grouped by the region of the seat (Ardenvale, Harrowmere, …) ----
const world = computed(() => (byType.value.get('place') ?? []).filter(p => !p.fields.parent)
  .sort((a, b) => (childrenOf.value.get(b.id)?.length ?? 0) - (childrenOf.value.get(a.id)?.length ?? 0))[0])
function regionOf(o: Entry): Entry | undefined {
  const seat = o.fields.seat as Id | undefined
  if (!seat) return undefined
  const path = placePath(seat)
  const i = path.findIndex(p => p.id === world.value?.id)
  return i >= 0 ? path[i + 1] ?? path[i] : path[0]
}
const groups = computed(() => {
  const m = new Map<string, { region?: Entry; list: Entry[] }>()
  for (const o of shown.value.filter(o => !o.fields.parent || !shown.value.some(p => p.id === o.fields.parent))) {
    const r = regionOf(o)
    const k = r?.id ?? '~'
    if (!m.has(k)) m.set(k, { region: r, list: [] })
    m.get(k)!.list.push(o)
  }
  for (const g of m.values()) g.list.sort((a, b) => members(b).length - members(a).length || a.name.localeCompare(b.name))
  return [...m.values()].sort((a, b) => (a.region ? 0 : 1) - (b.region ? 0 : 1) || b.list.length - a.list.length)
})

// ---- people at a glance ----
const inOrg = computed(() => new Set(orgs.value.flatMap(o => members(o).map(r => r.a))))
const loners = computed(() => npcs.value.filter(n => !inOrg.value.has(n.id)).length)
const people = computed(() => [
  { label: 'All NPCs', icon: '👤', href: hrefDashboard('people', 'All NPCs'), n: npcs.value.length },
  { label: 'Player characters', icon: '🛡️', href: hrefDashboard('people', 'Player characters'), n: byType.value.get('pc')?.length ?? 0 },
  { label: 'Organizations table', icon: '⚑', href: hrefDashboard('people', 'Organizations'), n: orgs.value.length },
  { label: 'Races', icon: '🧬', href: hrefList('race'), n: byType.value.get('race')?.length ?? 0 },
])
</script>

<template>
  <div class="orgs-page">
    <header class="list-head">
      <h1><span class="icon">⚑</span>Organizations</h1>
      <span class="muted">{{ orgs.length }} organizations · {{ inOrg.size }} of {{ npcs.length }} NPCs belong to one</span>
      <span class="spacer" />
      <button @click="newEntry('npc')">＋ NPC</button>
      <button class="primary" @click="newEntry('organization')">＋ Organization</button>
    </header>

    <div class="orgs-grid">
      <div class="orgs-main">
        <div class="orgs-filter">
          <input v-model="q" placeholder="Find an organization…" />
          <div class="seg wrap">
            <button :class="{ on: !typeFilter }" @click="typeFilter = ''">All</button>
            <button v-for="t in types" :key="t" :class="{ on: typeFilter === t }" @click="typeFilter = typeFilter === t ? '' : t">{{ t }}</button>
            <button v-if="orgs.some(o => !o.fields.orgType)" :class="{ on: typeFilter === '—' }" title="Organizations without a type" @click="typeFilter = typeFilter === '—' ? '' : '—'">No type</button>
          </div>
        </div>

        <section v-for="g in groups" :key="g.region?.id ?? '~'" class="org-group">
          <h2><EntryLink v-if="g.region" :id="g.region.id" /><span v-else>No seat</span> <span class="muted small">{{ g.list.length }}</span></h2>
          <div class="org-cards">
            <article v-for="o in g.list" :key="o.id" class="card org-card">
              <header>
                <a class="org-name" :href="hrefEntry(o.id)">{{ o.name }}</a>
                <span v-if="o.fields.orgType" class="badge">{{ o.fields.orgType }}</span>
              </header>
              <p v-if="o.fields.seat" class="org-line">📍 <EntryLink :id="o.fields.seat as string" /></p>
              <p v-if="leader(o)" class="org-line">👑 <EntryLink :id="leader(o)!.id" /><span v-if="leader(o)!.role" class="muted small"> · {{ leader(o)!.role }}</span></p>
              <p class="org-line muted small">
                {{ members(o).length }} {{ members(o).length === 1 ? 'member' : 'members' }}
                <template v-if="ranks(o).length"> · {{ ranks(o).length }} ranks</template>
                <template v-if="subOrgs(o).length"> · {{ subOrgs(o).length }} branches</template>
              </p>
              <div v-if="ranks(o).length" class="org-ranks" title="Ranks, highest first">
                <span v-for="(k, i) in ranks(o)" :key="i" class="org-rank">{{ k.title }}</span>
              </div>
              <div v-if="subOrgs(o).length" class="org-subs">
                <EntryLink v-for="s in subOrgs(o)" :key="s.id" :id="s.id" icon />
              </div>
            </article>
          </div>
        </section>
        <p v-if="!groups.length" class="muted pad">No organization matches.</p>
      </div>

      <aside class="orgs-side">
        <section class="card">
          <h3>👥 People</h3>
          <ul class="rel compact">
            <li v-for="p in people" :key="p.label"><span>{{ p.icon }}</span><a :href="p.href">{{ p.label }}</a><span class="when">{{ p.n }}</span></li>
          </ul>
          <p class="muted small">{{ loners }} NPCs aren't in any organization.</p>
        </section>
      </aside>
    </div>
  </div>
</template>
