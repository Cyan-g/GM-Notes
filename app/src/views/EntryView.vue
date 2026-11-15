<script setup lang="ts">
import { computed } from 'vue'
import type { Entry, Relation, Statblock, WorldDate } from '../model/types'
import { TYPES, RELATION_KINDS, type FieldDef } from '../model/schema'
import { backlinks, byType, childrenOf, dateKey, db, formatDate, get, placePath, relationsOf, entries } from '../store'
import { go, hrefEntry, hrefList, hrefMap } from '../router'
import MapView from '../components/MapView.vue'
import type { Pin } from '../model/types'
import { loadEncounter } from '../tracker'
import EntryLink from '../components/EntryLink.vue'
import MarkdownView from '../components/MarkdownView.vue'
import FieldValue from '../components/FieldValue.vue'
import StatblockView from '../components/Statblock.vue'
import MembersCard from '../components/MembersCard.vue'
import DataImage from '../components/DataImage.vue'
import ItemCard from '../components/ItemCard.vue'
import SpellCard from '../components/SpellCard.vue'
import { describe } from '../describe'
import TimelineChart from '../components/TimelineChart.vue'
import TimelineList from '../components/TimelineList.vue'
import { allItems, filterItems } from '../timeline'

const props = defineProps<{ id: string }>()
const e = computed(() => get(props.id))
const def = computed(() => e.value ? TYPES[e.value.type] : undefined)
const today = computed(() => db().meta.today)

const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length)
const shown = (f: FieldDef, x: Entry) => !f.when || f.when.is.includes(String(x.fields[f.when.field] ?? ''))

/** Simple fields grouped for the side card; big ones (statblock, recipe, stock) go elsewhere. */
const groups = computed(() => {
  const x = e.value
  if (!x || !def.value) return []
  if (x.type === 'item' || x.type === 'spell') return []
  const big = ['statblock', 'recipe', 'stock', 'combatants']
  const out = new Map<string, { def: FieldDef; value: unknown }[]>()
  for (const f of def.value.fields) {
    if (big.includes(f.kind) || f.key === 'parent' || f.key === 'map' || f.key === 'pins' || !shown(f, x) || empty(x.fields[f.key])) continue
    const g = f.group ?? 'Details'
    if (!out.has(g)) out.set(g, [])
    out.get(g)!.push({ def: f, value: x.fields[f.key] })
  }
  return [...out]
})
const bigFields = computed(() => {
  const x = e.value
  if (!x || !def.value) return []
  return def.value.fields.filter(f => ['recipe', 'stock', 'combatants'].includes(f.kind) && shown(f, x) && !empty(x.fields[f.key]))
})
const statblock = computed(() => e.value?.fields.statblock as Statblock | undefined)
const raceText = computed(() => e.value?.fields.raceText as string | undefined)

const crumbs = computed(() => {
  const x = e.value
  if (!x) return []
  if (x.type === 'place') return placePath(x.id).slice(0, -1)
  const chain: Entry[] = []
  let p = get(x.fields.parent as string)
  while (p && chain.length < 10) { chain.unshift(p); p = get(p.fields.parent as string) }
  return chain
})

const range = (from?: WorldDate, to?: WorldDate) => {
  if (!from && !to) return ''
  return `${from ? formatDate(from) : '?'} – ${to ? formatDate(to) : 'now'}`
}
const ended = (r: Relation) => r.to && dateKey(r.to) < dateKey(today.value)

/** Relations grouped by how they read from this entry's side. */
const relGroups = computed(() => {
  const x = e.value
  if (!x) return []
  const out = new Map<string, { other: string; r: Relation }[]>()
  for (const r of relationsOf.value.get(x.id) ?? []) {
    const k = RELATION_KINDS[r.kind]
    const mine = r.a === x.id
    const label = mine ? k.forward : k.reverse
    if (x.type === 'organization' && r.kind === 'member' && !mine) continue // shown in MembersCard
    if (!out.has(label)) out.set(label, [])
    out.get(label)!.push({ other: mine ? r.b : r.a, r })
  }
  for (const list of out.values()) list.sort((p, q) => Number(!!ended(p.r)) - Number(!!ended(q.r)) || (get(p.other)?.name ?? '').localeCompare(get(q.other)?.name ?? ''))
  return [...out]
})

/** Maps that have a pin for this entry. */
const onMaps = computed(() => {
  const x = e.value
  if (!x) return []
  return entries.value.flatMap(p => ((p.fields.pins as Pin[] | undefined) ?? []).filter(pin => pin.entry === x.id).map(pin => ({ place: p, pin })))
})

const lead = computed(() => (e.value ? describe(e.value) : ''))

/** The few facts that belong right under the name: affiliations, home, rulers, leaders. */
const LEADER = /(leader|head|chief|duke|duchess|king|queen|abbess|abbot|master|captain|high priest|archbishop|matriarch|patriarch|lord|lady|commander|general|elder)/i
const facts = computed(() => {
  const x = e.value
  if (!x) return []
  const rs = (relationsOf.value.get(x.id) ?? []).filter(r => !ended(r))
  const out: { label: string; items: { id: string; note?: string }[] }[] = []
  const add = (label: string, items: { id: string; note?: string }[]) => { if (items.length) out.push({ label, items }) }
  if (x.type === 'npc' || x.type === 'pc') {
    add('Member of', rs.filter(r => r.kind === 'member' && r.a === x.id).map(r => ({ id: r.b, note: r.role })))
    add('Lives in', rs.filter(r => r.kind === 'lives-in' && r.a === x.id).map(r => ({ id: r.b })))
    add('Rules', rs.filter(r => r.kind === 'rules' && r.a === x.id).map(r => ({ id: r.b })))
    add('Worships', rs.filter(r => r.kind === 'worships' && r.a === x.id).map(r => ({ id: r.b })))
  } else if (x.type === 'organization') {
    add('Led by', rs.filter(r => r.kind === 'member' && r.b === x.id && r.role && LEADER.test(r.role)).map(r => ({ id: r.a, note: r.role })))
  } else if (x.type === 'place') {
    add('Ruled by', rs.filter(r => r.kind === 'rules' && r.b === x.id).map(r => ({ id: r.a, note: r.role })))
  }
  return out
})

/** Timeline items involving this entry (not the entry itself when it's an event). */
const history = computed(() => {
  const x = e.value
  if (!x || ['event', 'session', 'item', 'spell', 'creature'].includes(x.type)) return []
  return filterItems(allItems.value, { focus: x.id }).filter(it => it.entry !== x.id)
})

const children = computed(() => (e.value ? childrenOf.value.get(e.value.id) ?? [] : []))

const mentions = computed(() => {
  const x = e.value
  if (!x) return []
  const related = new Set((relationsOf.value.get(x.id) ?? []).flatMap(r => [r.a, r.b]))
  const kids = new Set(children.value.map(c => c.id))
  return [...(backlinks.value.get(x.id) ?? [])].map(get).filter((m): m is Entry => !!m && !related.has(m.id) && !kids.has(m.id))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
})

// ---- type-specific lists ----
const raceMembers = computed(() => e.value?.type === 'race'
  ? entries.value.filter(n => (n.type === 'npc' || n.type === 'pc') && n.fields.race === e.value!.id).sort((a, b) => String(a.fields.subrace ?? '').localeCompare(String(b.fields.subrace ?? '')) || a.name.localeCompare(b.name))
  : [])
const usedIn = computed(() => e.value?.type === 'item'
  ? entries.value.filter(n => ((n.fields.recipe as { item: string }[]) ?? []).some(l => l.item === e.value!.id)) : [])
const soldAt = computed(() => e.value?.type === 'item'
  ? entries.value.filter(n => ((n.fields.stock as { item: string }[]) ?? []).some(l => l.item === e.value!.id)) : [])
const sessions = computed(() => e.value?.type === 'campaign'
  ? (byType.value.get('session') ?? []).filter(s => s.fields.campaign === e.value!.id).sort((a, b) => (a.fields.number as number ?? 0) - (b.fields.number as number ?? 0) || a.name.localeCompare(b.name))
  : [])
const campaignNotes = computed(() => e.value?.type === 'campaign'
  ? entries.value.filter(n => (n.type === 'note' && n.fields.campaign === e.value!.id) || (n.type === 'pc' && ((n.fields.campaigns as string[]) ?? []).includes(e.value!.id))) : [])
const siblings = computed(() => {
  const x = e.value
  if (x?.type !== 'session' || !x.fields.campaign) return null
  const list = (byType.value.get('session') ?? []).filter(s => s.fields.campaign === x.fields.campaign).sort((a, b) => (a.fields.number as number ?? 0) - (b.fields.number as number ?? 0))
  const i = list.findIndex(s => s.id === x.id)
  return { prev: list[i - 1], next: list[i + 1] }
})
</script>

<template>
  <article v-if="e && def" class="entry">
    <nav class="crumbs">
      <a :href="hrefList(e.type)">{{ def.plural }}</a>
      <template v-for="c in crumbs" :key="c.id"><span class="sep">›</span><EntryLink :id="c.id" /></template>
    </nav>
    <header class="entry-head" :class="{ 'has-portrait': e.image }">
      <a class="button edit-btn" :href="hrefEntry(e.id, true)" title="Edit (E)">✎ Edit</a>
      <DataImage v-if="e.image" :path="e.image" :alt="e.name" class="portrait head-portrait" />
      <div class="head-text">
      <div class="title-line">
        <h1><span class="icon">{{ def.icon }}</span>{{ e.name }}</h1>
        <div class="sub">
          <span class="badge">{{ def.label }}</span>
          <span v-if="e.visibility === 'secret'" class="badge dm-only" title="Players don't know this entry yet">DM only</span>
          <span v-if="e.aliases.length" class="aliases">also: {{ e.aliases.join(' · ') }}</span>
          <span v-for="t in e.tags" :key="t" class="tag">#{{ t }}</span>
        </div>
      </div>
      <p v-if="lead" class="lead">{{ lead }}</p>
      <div v-if="facts.length" class="facts">
        <span v-for="f in facts" :key="f.label" class="fact">
          <span class="fact-label">{{ f.label }}</span>
          <template v-for="(it, i) in f.items" :key="it.id"><template v-if="i">, </template><EntryLink :id="it.id" /><span v-if="it.note" class="role"> ({{ it.note }})</span></template>
        </span>
      </div>
      </div>
    </header>

    <MapView v-if="e.fields.map" :place="e" banner />
    <div class="entry-grid">
      <div class="entry-main">
        <div v-if="siblings" class="pager">
          <EntryLink v-if="siblings.prev" :id="siblings.prev.id" :label="'← ' + siblings.prev.name" />
          <span v-else />
          <EntryLink v-if="siblings.next" :id="siblings.next.id" :label="siblings.next.name + ' →'" />
        </div>

        <div v-if="e.type === 'encounter'" class="run-bar"><button class="primary" @click="loadEncounter(e.id); go('#/tracker')">▶ Run in initiative tracker</button></div>
        <ItemCard v-if="e.type === 'item'" :e="e" />
        <SpellCard v-if="e.type === 'spell'" :e="e" />
        <StatblockView v-if="statblock && e.type === 'creature'" :sb="statblock" :name="e.name" class="wide" />
        <MarkdownView v-if="e.body" :source="e.body" />
        <p v-else-if="!['item', 'spell', 'creature', 'encounter'].includes(e.type)" class="muted">No text yet.</p>

        <section v-for="f in bigFields" :key="f.key">
          <h2>{{ f.label }}</h2>
          <FieldValue :def="f" :value="e.fields[f.key]" :entry="e" />
        </section>

        <section v-if="sessions.length">
          <h2>Sessions</h2>
          <ol class="plain">
            <li v-for="s in sessions" :key="s.id"><EntryLink :id="s.id" /> <span class="muted">{{ formatDate(s.fields.date as WorldDate) }}</span></li>
          </ol>
        </section>
        <section v-if="campaignNotes.length">
          <h2>Characters & notes</h2>
          <ul class="plain"><li v-for="n in campaignNotes" :key="n.id"><EntryLink :id="n.id" icon /></li></ul>
        </section>

        <section v-if="history.length" class="history">
          <h2>History</h2>
          <TimelineChart :items="history" :focus="e.id" />
          <TimelineList :items="history" />
        </section>

        <section v-if="raceMembers.length">
          <h2>{{ e.name }} characters</h2>
          <table class="mini">
            <thead><tr><th>Name</th><th>Subrace</th></tr></thead>
            <tbody><tr v-for="n in raceMembers" :key="n.id"><td><EntryLink :id="n.id" icon /></td><td>{{ n.fields.subrace }}</td></tr></tbody>
          </table>
        </section>
      </div>

      <aside class="entry-side">
        <div v-if="raceText" class="card warn">Race was typed as “{{ raceText }}” and doesn't match a race entry.</div>

        <div v-for="[g, fs] in groups" :key="g" class="card">
          <h3>{{ g }}</h3>
          <dl>
            <template v-for="f in fs" :key="f.def.key">
              <dt>{{ f.def.label }}</dt>
              <dd><FieldValue :def="f.def" :value="f.value" :entry="e" /></dd>
            </template>
          </dl>
        </div>

        <StatblockView v-if="statblock && e.type !== 'creature'" :sb="statblock" :name="e.name" />

        <MembersCard v-if="e.type === 'organization'" :org="e" />

        <div v-for="[label, list] in relGroups" :key="label" class="card">
          <h3>{{ label[0].toUpperCase() + label.slice(1) }}</h3>
          <ul class="rel">
            <li v-for="{ other, r } in list" :key="r.id" :class="{ ended: ended(r) }">
              <EntryLink :id="other" icon />
              <span v-if="r.role" class="role">{{ r.role }}</span>
              <span v-if="r.from || r.to" class="when">{{ range(r.from, r.to) }}</span>
            </li>
          </ul>
        </div>

        <div v-if="children.length" class="card">
          <h3>{{ e.type === 'place' ? 'Places within' : 'Part of this' }}</h3>
          <ul class="rel"><li v-for="c in children" :key="c.id"><EntryLink :id="c.id" icon /> <span class="role">{{ c.fields.placeType || c.fields.orgType }}</span></li></ul>
        </div>

        <div v-if="usedIn.length" class="card">
          <h3>Used in</h3>
          <ul class="rel"><li v-for="c in usedIn" :key="c.id"><EntryLink :id="c.id" icon /></li></ul>
        </div>
        <div v-if="soldAt.length" class="card">
          <h3>Sold at</h3>
          <ul class="rel"><li v-for="c in soldAt" :key="c.id"><EntryLink :id="c.id" icon /></li></ul>
        </div>

        <div v-if="onMaps.length" class="card">
          <h3>On the map</h3>
          <ul class="rel"><li v-for="m in onMaps" :key="m.place.id + m.pin.id"><a :href="hrefMap(m.place.id, m.pin.id)">🗺 {{ m.place.name }}</a></li></ul>
        </div>

        <div v-if="mentions.length" class="card">
          <h3>Mentioned in</h3>
          <ul class="rel"><li v-for="m in mentions" :key="m.id"><EntryLink :id="m.id" icon /></li></ul>
        </div>
      </aside>
    </div>
  </article>
  <div v-else class="empty-state">
    <h1>Not found</h1>
    <p>There's no entry with the id <code>{{ id }}</code>.</p>
  </div>
</template>
