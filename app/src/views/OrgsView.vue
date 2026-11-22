<script setup lang="ts">
// The People menu's front page: the NPCs first (what they do, where they belong), then every organization as a card,
// grouped by the region its seat is in, with its leader, members and ranks at a glance; and the people tables beside it.
import AppIcon from '../components/AppIcon.vue'
import TypeIcon from '../components/TypeIcon.vue'
import { computed, ref } from 'vue'
import { optionLabel, listOptions } from '../store'
import type { Entry, Id, RankLine } from '../model/types'
import { byType, childrenOf, placePath } from '../store'
import { hrefDashboard, hrefEntry, hrefList } from '../router'
import { TYPES } from '../model/schema'
import { newEntry } from '../ui'
import EntryLink from '../components/EntryLink.vue'
import { leadersOf, leads, membersOf } from '../org'

const orgs = computed(() => byType.value.get('organization') ?? [])
const npcs = computed(() => byType.value.get('npc') ?? [])
const ORG_TYPES = computed(() => listOptions('organization.orgType').map(o => o.id))

// ---- the NPCs: one search finds people and organizations ----
const NPC_MANY = 48
const allNpcs = ref(false)
/** The organizations each NPC belongs to. */
const orgsOfNpc = computed(() => {
  const m = new Map<Id, Entry[]>()
  for (const o of orgs.value) for (const r of membersOf(o)) { if (!m.has(r.a)) m.set(r.a, []); m.get(r.a)!.push(o) }
  return m
})
const npcShown = computed(() => {
  const n = q.value.trim().toLowerCase()
  return npcs.value.filter(e => !n || [e.name, ...e.aliases, String(e.fields.occupation ?? '')].some(s => s.toLowerCase().includes(n)))
    .sort((a, b) => a.name.localeCompare(b.name))
})
const deadish = (e: Entry) => /dead|missing|imprisoned/i.test(String(e.fields.status ?? ''))
/** Under the name: what they do, where they belong, and a status that isn't "alive". */
const about = (e: Entry) => [e.fields.occupation, ...(orgsOfNpc.value.get(e.id) ?? []).map(o => o.name), deadish(e) ? e.fields.status : ''].filter(Boolean).join(' · ')

// ---- filters ----
const typeFilter = ref<string>('')
const q = ref('')
const types = computed(() => ORG_TYPES.value.filter(t => orgs.value.some(o => o.fields.orgType === t)))
const shown = computed(() => orgs.value.filter(o =>
  (!typeFilter.value || (typeFilter.value === '—' ? !o.fields.orgType : o.fields.orgType === typeFilter.value))
  && (!q.value.trim() || [o.name, ...o.aliases].some(n => n.toLowerCase().includes(q.value.trim().toLowerCase())))))

// ---- per organization ----
const members = (o: Entry) => membersOf(o)
const ranks = (o: Entry) => (o.fields.ranks) ?? []
/** Who leads it (org.ts, as the entry's page and the list say): the holder of the top rank, else a member whose role leads. */
function leader(o: Entry): { id: Id; role?: string } | undefined {
  const id = leadersOf(o)[0]
  return id ? { id, role: members(o).find(r => r.a === id && leads(o, r.role))?.role } : undefined
}
const subOrgs = (o: Entry) => (childrenOf.value.get(o.id) ?? []).filter(c => c.type === 'organization')

// ---- grouped by the region of the seat (Ardenvale, Harrowmere, …) ----
const world = computed(() => (byType.value.get('place') ?? []).filter(p => !p.fields.parent)
  .sort((a, b) => (childrenOf.value.get(b.id)?.length ?? 0) - (childrenOf.value.get(a.id)?.length ?? 0))[0])
function regionOf(o: Entry): Entry | undefined {
  const seat = o.fields.seat
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
const people = computed(() => [
  { label: 'All NPCs', type: 'npc' as const, href: hrefDashboard('people', 'All NPCs'), n: npcs.value.length },
  { label: 'Player characters', type: 'pc' as const, href: hrefDashboard('people', 'Player characters'), n: byType.value.get('pc')?.length ?? 0 },
  { label: 'Organizations as a table', type: 'organization' as const, href: hrefDashboard('people', 'Organizations'), n: orgs.value.length },
])
</script>

<template>
  <div class="orgs-page">
    <header class="list-head">
      <h1><span class="icon"><AppIcon ui="overview" /></span>People</h1>
      <span class="muted">{{ npcs.length }} NPCs · {{ orgs.length }} organizations · {{ inOrg.size }} NPCs belong to one</span>
      <span class="spacer" />
      <button @click="newEntry('npc')">＋ NPC</button>
      <button class="primary" @click="newEntry('organization')">＋ Organization</button>
    </header>

    <div class="orgs-grid">
      <div class="orgs-main">
        <div class="orgs-filter">
          <input v-model="q" placeholder="Find a person or organization…" />
        </div>

        <section class="org-group">
          <h2>NPCs <span class="muted small">{{ npcShown.length }}</span></h2>
          <div class="people-grid">
            <div v-for="n in allNpcs ? npcShown : npcShown.slice(0, NPC_MANY)" :key="n.id" class="person" :class="{ gone: deadish(n) }">
              <EntryLink :id="n.id" icon />
              <span v-if="about(n)" class="muted small">{{ about(n) }}</span>
            </div>
          </div>
          <button v-if="!allNpcs && npcShown.length > NPC_MANY" type="button" class="link-btn small" @click="allNpcs = true">Show all {{ npcShown.length }}</button>
          <p v-if="!npcShown.length" class="muted small">{{ npcs.length ? 'No NPC matches.' : 'No NPCs yet.' }}</p>
        </section>

        <h2 class="people-orgs-head">Organizations <span class="muted small">{{ shown.length }}</span></h2>
        <div class="orgs-filter">
          <div class="seg wrap">
            <button :class="{ on: !typeFilter }" @click="typeFilter = ''">All</button>
            <button v-for="t in types" :key="t" :class="{ on: typeFilter === t }" @click="typeFilter = typeFilter === t ? '' : t">{{ optionLabel('organization.orgType', t) }}</button>
            <button v-if="orgs.some(o => !o.fields.orgType)" :class="{ on: typeFilter === '—' }" title="Organizations without a type" @click="typeFilter = typeFilter === '—' ? '' : '—'">No type</button>
          </div>
        </div>

        <section v-for="g in groups" :key="g.region?.id ?? '~'" class="org-group">
          <h2><EntryLink v-if="g.region" :id="g.region.id" /><span v-else>No seat</span> <span class="muted small">{{ g.list.length }}</span></h2>
          <div class="org-cards">
            <article v-for="o in g.list" :key="o.id" class="card org-card">
              <header>
                <a class="org-name" :href="hrefEntry(o.id)">{{ o.name }}</a>
                <span v-if="o.fields.orgType" class="badge">{{ optionLabel('organization.orgType', o.fields.orgType) }}</span>
              </header>
              <p v-if="o.fields.seat" class="org-line"><TypeIcon type="place" /> <EntryLink :id="o.fields.seat" /></p>
              <p v-if="leader(o)" class="org-line"><AppIcon ui="crown" /> <EntryLink :id="leader(o)!.id" /><span v-if="leader(o)!.role" class="muted small"> · {{ leader(o)!.role }}</span></p>
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
          <h3><AppIcon ui="overview" /> People</h3>
          <ul class="rel compact">
            <li v-for="p in people" :key="p.label"><span><TypeIcon :type="p.type" /></span><a :href="p.href">{{ p.label }}</a></li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>
