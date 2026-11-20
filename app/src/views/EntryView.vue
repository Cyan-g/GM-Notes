<script setup lang="ts">
import { printable } from '../cards'
import AppIcon from '../components/AppIcon.vue'
import TypeIcon from '../components/TypeIcon.vue'
import EntryIcon from '../components/EntryIcon.vue'
import { NOTE_TYPES, isShared } from '../sync'
import PlayerNotes from '../components/PlayerNotes.vue'
import { currentPc, setCurrent } from '../sheet'
import { computed, ref } from 'vue'
import type { Entry, Relation, Statblock, WorldDate } from '../model/types'
import { TYPES, RELATION_KINDS, byKey, type FieldDef } from '../model/schema'
import { backlinks, byType, childrenOf, dateKey, db, formatDate, get, hiddenFromPlayers, placePath, playerMode, relationsOf, entries, state } from '../store'
import { go, hrefEntry, hrefFamily, hrefList, hrefMap, hrefTab, type EntryTab } from '../router'
import SpellbookView from './SpellbookView.vue'
import CraftingView from './CraftingView.vue'
import FamilyTree from '../components/FamilyTree.vue'
import { familySize } from '../family'
import MapView from '../components/MapView.vue'
import SubTree from '../components/SubTree.vue'
import Sunburst from '../components/Sunburst.vue'
import { newEntry, ui, printCards } from '../ui'
import { changed, isFavourite, toggleFavourite } from '../edit'
import type { Pin } from '../model/types'
import EntryLink from '../components/EntryLink.vue'
import ExportDialog from '../components/ExportDialog.vue'
import HistoryDialog from '../components/HistoryDialog.vue'
import { canExport } from '../transfer'
import MarkdownView from '../components/MarkdownView.vue'
import FieldValue from '../components/FieldValue.vue'
import StatblockView from '../components/Statblock.vue'
import MembersCard from '../components/MembersCard.vue'
import SessionSide from '../components/SessionSide.vue'
import { nextSessionNo, sessionsOf } from '../sessions'
import DataImage from '../components/DataImage.vue'
import ItemCard from '../components/ItemCard.vue'
import SpellCard from '../components/SpellCard.vue'
import CharacterSheet from '../components/CharacterSheet.vue'
import PcNotes from '../components/PcNotes.vue'
import AttacksCard from '../components/AttacksCard.vue'
import FeatCard from '../components/FeatCard.vue'
import TraitList from '../components/TraitList.vue'
import { traitsOf } from '../species'
import { describe } from '../describe'
import TimelineChart from '../components/TimelineChart.vue'
import TimelineList from '../components/TimelineList.vue'
import { allItems, filterItems } from '../timeline'
import SubraceCards from '../components/SubraceCards.vue'

const props = defineProps<{ id: string; tab?: EntryTab }>()
const e = computed(() => get(props.id))
/** People have a second tab with their family tree. */
const hasFamily = computed(() => e.value?.type === 'npc' || e.value?.type === 'pc')
const onFamily = computed(() => hasFamily.value && props.tab === 'family')
const onBook = computed(() => e.value?.type === 'pc' && props.tab === 'spellbook')
const onBench = computed(() => e.value?.type === 'pc' && props.tab === 'crafting')
const onOverview = computed(() => !onFamily.value && !onBook.value && !onBench.value)
const def = computed(() => e.value ? TYPES[e.value.type] : undefined)
const today = computed(() => db().meta.today)

const empty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length)
const shown = (f: FieldDef, x: Entry) => !f.when || f.when.is.includes(String(byKey(x.fields)[f.when.field] ?? ''))

/** Simple fields grouped for the side card; big ones (statblock, recipe, stock) go elsewhere. */
const groups = computed(() => {
  const x = e.value
  if (!x || !def.value) return []
  if (x.type === 'item' || x.type === 'spell' || x.type === 'feat') return []
  const big = ['statblock', 'recipe', 'stock', 'combatants', 'ranks', 'sheet', 'classes', 'speciesTraits']
  const out = new Map<string, { def: FieldDef; value: unknown }[]>()
  for (const f of def.value.fields) {
    if (big.includes(f.kind) || (x.type === 'pc' && f.key === 'level') || (x.type === 'creature' && f.key === 'creatureType') || (x.type === 'session' && ['campaign', 'number', 'date', 'playedOn', 'players'].includes(f.key)) || f.key === 'parent' || f.key === 'map' || f.key === 'pins' || f.kind === 'mapData' || !shown(f, x) || empty(byKey(x.fields)[f.key])) continue
    const g = f.group ?? 'Details'
    if (!out.has(g)) out.set(g, [])
    out.get(g)!.push({ def: f, value: byKey(x.fields)[f.key] })
  }
  return [...out]
})
const bigFields = computed(() => {
  const x = e.value
  if (!x || !def.value) return []
  return def.value.fields.filter(f => ['recipe', 'stock', 'combatants', 'ranks', 'speciesTraits'].includes(f.kind) && shown(f, x) && !empty(byKey(x.fields)[f.key]))
})
/** On a subrace's page: the traits of the races it's a subrace of, which its characters have too (nearest first). */
const inherited = computed(() => {
  const out: Entry[] = []
  let r = e.value?.type === 'race' ? get(e.value.fields.parent as string | undefined) : undefined
  while (r && r.type === 'race' && !out.includes(r) && r.id !== e.value!.id) { out.push(r); r = get(r.fields.parent as string | undefined) }
  return out.filter(x => traitsOf(x).length)
})
/** The feats an entry grants (an organization's fighting styles and the like). */
const grantedFeats = computed(() => (e.value ? (byType.value.get('feat') ?? []).filter(f => f.fields.source === e.value!.id).sort((a, b) => a.name.localeCompare(b.name)) : []))
const ranksDef = computed(() => def.value?.fields.find(f => f.kind === 'ranks'))
/**
 * The text cut where data belongs inside it: an organization's ranks at the end of its "Structure" section
 * (before another table there), and granted feats right under a "Feats" heading. What has no heading to go
 * under is shown after the text instead.
 */
const bodyParts = computed(() => {
  const x = e.value
  if (!x) return { parts: [] as { md?: string; from?: number; to?: number; insert?: 'ranks' | 'feats' }[], placed: new Set<string>() }
  const lines = x.body.split('\n')
  const heading = (name: string) => lines.findIndex(l => new RegExp(`^#{1,6}\\s+${name}\\s*$`, 'i').test(l.trim()))
  const sectionEnd = (h: number) => {
    const level = lines[h].trim().match(/^#+/)![0].length
    const end = lines.findIndex((l, i) => i > h && /^#{1,6}\s/.test(l.trim()) && l.trim().match(/^#+/)![0].length <= level)
    return end < 0 ? lines.length : end
  }
  const cuts: { at: number; insert: 'ranks' | 'feats' }[] = []
  if (x.type === 'organization' && !empty(x.fields.ranks)) {
    const h = heading('structure')
    if (h >= 0) {
      const end = sectionEnd(h)
      const table = lines.findIndex((l, i) => i > h && i < end && l.trim().startsWith('|'))
      cuts.push({ at: table > 0 ? table : end, insert: 'ranks' })
    }
  }
  if (grantedFeats.value.length) {
    const h = heading('feats?')
    if (h >= 0) cuts.push({ at: h + 1, insert: 'feats' })
  }
  cuts.sort((p, q) => p.at - q.at)
  const parts: { md?: string; from?: number; to?: number; insert?: 'ranks' | 'feats' }[] = []
  let from = 0
  for (const c of cuts) {
    const md = lines.slice(from, c.at).join('\n')
    if (md.trim()) parts.push({ md, from, to: c.at })
    parts.push({ insert: c.insert })
    from = c.at
  }
  const rest = lines.slice(from).join('\n')
  if (rest.trim()) parts.push({ md: rest, from, to: lines.length })
  return { parts, placed: new Set(cuts.map(c => c.insert)) }
})
/** Checklist boxes in the text can be ticked in read mode, except on a read-only or a shared entry (players tick their own notes). */
const canTick = computed(() => !state.readOnly && !shared.value)
/** A ticked box: its part of the text, changed, goes back in its place. */
function setPart(p: { from?: number; to?: number }, md: string) {
  const x = e.value
  if (!x || p.from == null || p.to == null) return
  const lines = x.body.split('\n')
  x.body = [...lines.slice(0, p.from), md, ...lines.slice(p.to)].join('\n')
  changed(x)
}
const scrollSpell = computed(() => (e.value?.type === 'item' && e.value.fields.kind === 'Scroll' ? get(e.value.fields.spell) : undefined))
const statblock = computed(() => e.value?.fields.statblock)

const crumbs = computed(() => {
  const x = e.value
  if (!x) return []
  if (x.type === 'place') return placePath(x.id).slice(0, -1)
  const chain: Entry[] = []
  let p = get(x.fields.parent)
  while (p && chain.length < 10) { chain.unshift(p); p = get(p.fields.parent) }
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
    if (inFacts.value.has(r.id)) continue // shown under the name
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
  return entries.value.flatMap(p => ((p.fields.pins) ?? []).filter(pin => pin.entry === x.id).map(pin => ({ place: p, pin })))
})

// A place's kind shows as its badge, so a place has no lead line of its own.
// Places show their kind as the badge; items and spells show their line inside their card.
const lead = computed(() => (e.value && !['place', 'item', 'spell', 'feat'].includes(e.value.type) ? describe(e.value, { parent: false }) : ''))

/** The few facts that belong right under the name: affiliations, home, rulers, leaders. */
const LEADER = /\b(leader|head|chief|duke|duchess|king|queen|abbess|abbot|master|captain|high priest|archbishop|matriarch|patriarch|lord|lady|commander|general|elder)\b/i
const facts = computed(() => {
  const x = e.value
  if (!x) return []
  const rs = (relationsOf.value.get(x.id) ?? []).filter(r => !ended(r))
  const out: { label: string; items: { id: string; note?: string; rel: string }[] }[] = []
  const add = (label: string, items: { id: string; note?: string; rel: string }[]) => { if (items.length) out.push({ label, items }) }
  if (x.type === 'npc' || x.type === 'pc') {
    add('Member of', rs.filter(r => r.kind === 'member' && r.a === x.id).map(r => ({ id: r.b, note: r.role, rel: r.id })))
    add('Lives in', rs.filter(r => r.kind === 'lives-in' && r.a === x.id).map(r => ({ id: r.b, rel: r.id })))
    add('Rules', rs.filter(r => r.kind === 'rules' && r.a === x.id).map(r => ({ id: r.b, rel: r.id })))
    add('Worships', rs.filter(r => r.kind === 'worships' && r.a === x.id).map(r => ({ id: r.b, rel: r.id })))
  } else if (x.type === 'organization') {
    add('Led by', rs.filter(r => r.kind === 'member' && r.b === x.id && r.role && LEADER.test(r.role)).map(r => ({ id: r.a, note: r.role, rel: r.id })))
  } else if (x.type === 'place') {
    add('Ruled by', rs.filter(r => r.kind === 'rules' && r.b === x.id).map(r => ({ id: r.a, note: r.role, rel: r.id })))
  }
  return out
})
/** The relations already in the facts line, left out of the side cards (ended ones still show there). */
const inFacts = computed(() => new Set(facts.value.flatMap(f => f.items.map(i => i.rel))))

/** Timeline items involving this entry (not the entry itself when it's an event). */
const history = computed(() => {
  const x = e.value
  if (!x || ['event', 'session', 'item', 'spell', 'creature'].includes(x.type)) return []
  return filterItems(allItems.value, { focus: x.id }).filter(it => it.entry !== x.id)
})

const children = computed(() => (e.value ? childrenOf.value.get(e.value.id) ?? [] : []))

/** Shared by the DM's world this one follows: read-only here. */
const shared = computed(() => isShared(e.value))
/** The characters with this spell in their spellbook, or this item in their inventory. */
const knownBy = computed(() => (e.value?.type === 'spell' ? (byType.value.get('pc') ?? []).filter(p => p.fields.sheet?.spellbook?.known?.includes(e.value!.id)) : []))
const carriedBy = computed(() => (e.value?.type === 'item' ? (byType.value.get('pc') ?? []).filter(p => p.fields.sheet?.inventory?.some(l => l.item === e.value!.id && l.qty > 0)) : []))
const mentions = computed(() => {
  const x = e.value
  if (!x) return []
  const related = new Set((relationsOf.value.get(x.id) ?? []).flatMap(r => [r.a, r.b]))
  // Leave out what another card already lists.
  const kids = new Set([...children.value, ...usedIn.value, ...soldAt.value, ...raceMembers.value, ...knownBy.value, ...carriedBy.value].map(c => c.id))
  return [...(backlinks.value.get(x.id) ?? [])].map(get).filter((m): m is Entry => !!m && !related.has(m.id) && !kids.has(m.id) && !hiddenFromPlayers(m))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
})

// ---- type-specific lists ----
/** Everyone of this race or of one of its subraces (any depth). */
const raceMembers = computed(() => {
  if (e.value?.type !== 'race') return []
  const ids = new Set<string>([e.value.id])
  for (let grew = true; grew;) { grew = false; for (const r of byType.value.get('race') ?? []) if (!ids.has(r.id) && !!r.fields.parent && ids.has(r.fields.parent)) { ids.add(r.id); grew = true } }
  return entries.value.filter(n => (n.type === 'npc' || n.type === 'pc') && !!n.fields.race && ids.has(n.fields.race))
    .sort((a, b) => subraceName(a).localeCompare(subraceName(b)) || a.name.localeCompare(b.name))
})
const subraceName = (n: Entry) => (n.fields.race === e.value?.id ? '' : get(n.fields.race)?.name ?? '')
const hasSubraceMembers = computed(() => raceMembers.value.some(n => subraceName(n)))
const usedIn = computed(() => e.value?.type === 'item'
  ? entries.value.filter(n => ((n.fields.recipe as { item: string }[]) ?? []).some(l => l.item === e.value!.id)) : [])
const soldAt = computed(() => e.value?.type === 'item'
  ? entries.value.filter(n => ((n.fields.stock as { item: string }[]) ?? []).some(l => l.item === e.value!.id)) : [])
/** A new session of this campaign, numbered after the last one. */
function newSession() {
  newEntry('session', { campaign: e.value!.id, number: nextSessionNo(e.value!.id) })
}
const exporting = ref(false)
const showHistory = ref(false)
const sessions = computed(() => e.value?.type === 'campaign'
  ? sessionsOf(e.value.id) : [])
const campaignNotes = computed(() => e.value?.type === 'campaign'
  ? entries.value.filter(n => (n.type === 'note' && n.fields.campaign === e.value!.id) || (n.type === 'pc' && ((n.fields.campaigns) ?? []).includes(e.value!.id))) : [])
</script>

<template>
  <article v-if="e && def" class="entry">
    <nav class="crumbs">
      <a class="crumb-root" :href="hrefList(e.type)"><TypeIcon :type="e.type" /> {{ def.plural }}</a>
      <template v-for="c in crumbs" :key="c.id"><span class="sep">›</span><EntryLink :id="c.id" /></template>
    </nav>
    <header class="entry-head" :class="{ 'has-portrait': e.image && e.type !== 'pc' }">
      <div class="head-actions">
        <button class="fav-btn" :class="{ on: isFavourite(e.id) }" :title="isFavourite(e.id) ? 'Remove from favourites (F)' : 'Add to favourites (F)'" :aria-pressed="isFavourite(e.id)" @click="toggleFavourite(e.id)"><AppIcon ui="star" :class="{ off: !(isFavourite(e.id)) }" /></button>
        <button class="export-btn" title="Earlier versions of this entry" @click="showHistory = true"><AppIcon ui="history" /> History</button>
        <button v-if="printable(e)" class="export-btn" title="Print this as a card (PDF, poker size)" @click="printCards(e.name, [{ label: 'This one', ids: [e.id] }])"><AppIcon ui="cards" /> Card</button>
        <button v-if="canExport(e)" class="export-btn" title="Save as a file to share (someone else can import it)" @click="exporting = true"><AppIcon ui="exportFile" /> Export</button>
        <a v-if="!shared" class="button edit-btn" :href="hrefEntry(e.id, true)" title="Edit (E)">✎ Edit</a>
        <span v-else class="badge shared-badge" :title="`Shared by your DM from ${state.db?.follow?.title}; updated from there`"><AppIcon ui="download" /> from {{ state.db?.follow?.title }}</span>
      </div>
      <ExportDialog v-if="canExport(e)" v-model="exporting" :id="e.id" />
      <HistoryDialog v-if="showHistory" :entry="e" @close="showHistory = false" />
      <DataImage v-if="e.image && e.type !== 'pc'" :path="e.image" :alt="e.name" class="portrait head-portrait" />
      <div class="head-text">
      <div class="title-line">
        <h1><span class="icon"><EntryIcon :e="e" /></span>{{ e.name }}</h1>
        <div class="sub">
          <span class="badge">{{ (e.type === 'place' && e.fields.placeType) || (e.type === 'item' && e.fields.kind) || def.label }}</span>
          <!-- A character: whether the Spellbook, Workbench and Character menu use them. -->
          <button v-if="e.type === 'pc'" class="chip-toggle current-toggle" :class="{ on: currentPc?.id === e.id }" :disabled="!!state.readOnly"
                  :title="currentPc?.id === e.id ? 'The Spellbook, Workbench and Character menu use this character' : 'Use this character in the Spellbook, Workbench and Character menu'"
                  @click="setCurrent(currentPc?.id === e.id ? undefined : e.id)"><AppIcon ui="star" :class="{ off: !(currentPc?.id === e.id) }" /> {{ currentPc?.id === e.id ? 'Current character' : 'Make current' }}</button>
          <span v-if="e.visibility === 'secret'" class="badge dm-only" title="Players don't know this entry yet">DM only</span>
          <span v-if="e.aliases.length" class="aliases">also: {{ e.aliases.join(' · ') }}</span>
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
    <nav v-if="hasFamily" class="tabs entry-tabs">
      <a :href="hrefEntry(e.id)" :class="{ on: onOverview }">Overview</a>
      <a :href="hrefFamily(e.id)" :class="{ on: onFamily }"><AppIcon ui="family" /> Family tree <span v-if="familySize(e.id)" class="muted small">{{ familySize(e.id) }}</span></a>
      <template v-if="e.type === 'pc'">
        <a :href="hrefTab(e.id, 'spellbook')" :class="{ on: onBook }"><AppIcon ui="spellbook" /> Spellbook <span v-if="e.fields.sheet?.spellbook?.prepared?.length" class="muted small">{{ e.fields.sheet.spellbook.prepared.length }}</span></a>
        <a :href="hrefTab(e.id, 'crafting')" :class="{ on: onBench }"><AppIcon ui="workbench" /> Workbench <span v-if="e.fields.sheet?.crafting?.known?.length" class="muted small">{{ e.fields.sheet.crafting.known.length }}</span></a>
      </template>
    </nav>
    <FamilyTree v-if="onFamily" :id="e.id" />
    <SpellbookView v-else-if="onBook" :pc="e" />
    <CraftingView v-else-if="onBench" :pc="e" />
    <div v-else class="entry-grid">
      <div class="entry-main">

        <!-- An item's card takes the main two thirds; its recipe is the first card on the right (as when editing). -->
        <div v-if="e.type === 'item'" class="item-top">
          <ItemCard :e="e" />
        </div>
        <!-- A scroll shows the spell it holds. -->
        <section v-if="scrollSpell" class="scroll-spell">
          <h2><TypeIcon type="spell" /> <EntryLink :id="scrollSpell.id" /></h2>
          <SpellCard :e="scrollSpell" />
        </section>
        <SpellCard v-if="e.type === 'spell'" :e="e" />
        <CharacterSheet v-if="e.type === 'pc'" :pc="e" />
        <StatblockView v-if="statblock && e.type === 'creature'" :sb="statblock" :name="e.name" class="wide" />
        <FeatCard v-if="e.type === 'feat'" :e="e" source />
        <template v-for="(p, i) in e.type === 'pc' ? [] : bodyParts.parts" :key="i">
          <MarkdownView v-if="p.md" :source="p.md" :tasks="canTick" @update:source="v => setPart(p, v)" />
          <FieldValue v-else-if="p.insert === 'ranks' && ranksDef" :def="ranksDef" :value="e.fields.ranks" :entry="e" />
          <div v-else-if="p.insert === 'feats'" class="feat-list"><FeatCard v-for="f in grantedFeats" :key="f.id" :e="f" title /></div>
        </template>
        <p v-if="!e.body && !['item', 'spell', 'feat', 'creature', 'encounter', 'pc'].includes(e.type)" class="muted">No text yet<template v-if="!state.readOnly"> — <a :href="hrefEntry(e.id) + '/edit'">✎ Edit</a> to write some</template>.</p>
        <PcNotes v-if="e.type === 'pc'" :pc="e" />
        <PlayerNotes v-if="shared && NOTE_TYPES.includes(e.type)" :entry="e" />

        <section v-for="f in e.type === 'item' ? [] : bigFields.filter(f => !(bodyParts.placed.has('ranks') && f.kind === 'ranks'))" :key="f.key">
          <h2>{{ f.label }}</h2>
          <FieldValue :def="f" :value="byKey(e.fields)[f.key]" :entry="e" />
        </section>

        <section v-for="r in inherited" :key="'from-' + r.id">
          <h2>From <EntryLink :id="r.id" /></h2>
          <TraitList :traits="traitsOf(r)" :lineage="e.name" :parent="r.name" />
        </section>

        <section v-if="grantedFeats.length && !bodyParts.placed.has('feats')">
          <h2>Feats</h2>
          <div class="feat-list"><FeatCard v-for="f in grantedFeats" :key="f.id" :e="f" title /></div>
        </section>

        <section v-if="e.type === 'campaign'">
          <h2>Sessions</h2>
          <details v-if="sessions.length > 10" class="older-sessions">
            <summary>Show the {{ sessions.length - 10 }} earlier sessions</summary>
            <ol class="plain">
              <li v-for="s in sessions.slice(0, -10)" :key="s.id"><EntryLink :id="s.id" /> <span class="muted">{{ formatDate(s.fields.date) }}</span></li>
            </ol>
          </details>
          <ol v-if="sessions.length" class="plain">
            <li v-for="s in sessions.slice(-10)" :key="s.id"><EntryLink :id="s.id" /> <span class="muted">{{ formatDate(s.fields.date) }}</span></li>
          </ol>
          <button class="new-session" @click="newSession">+ New session</button>
        </section>
        <section v-if="campaignNotes.length">
          <h2>Characters & notes</h2>
          <ul class="plain"><li v-for="n in campaignNotes" :key="n.id"><EntryLink :id="n.id" icon /></li></ul>
        </section>

        <section v-if="history.length" class="history">
          <h2>Timeline</h2>
          <TimelineChart :items="history" :focus="e.id" />
          <TimelineList :items="history" />
        </section>

        <section v-if="raceMembers.length">
          <h2>{{ e.name }} characters</h2>
          <table class="mini">
            <thead><tr><th>Name</th><th v-if="hasSubraceMembers">Subrace</th></tr></thead>
            <tbody><tr v-for="n in raceMembers" :key="n.id"><td><EntryLink :id="n.id" icon /></td><td v-if="hasSubraceMembers"><EntryLink v-if="subraceName(n)" :id="n.fields.race" /></td></tr></tbody>
          </table>
        </section>
      </div>

      <aside class="entry-side">
        <SessionSide v-if="e.type === 'session'" :e="e" />
        <div v-for="f in e.type === 'item' ? bigFields : []" :key="f.key" class="card side-big">
          <h3>{{ f.label }}</h3>
          <FieldValue :def="f" :value="byKey(e.fields)[f.key]" :entry="e" />
        </div>
        <SubraceCards v-if="e.type === 'race'" :race="e" />
        <div v-if="children.length && e.type !== 'race'" class="card subregions">
          <h3>{{ e.type === 'place' ? 'Subregions' : 'Part of this' }}
            <span class="seg small-seg"><button type="button" :class="{ on: !ui.treeAsList }" @click="ui.treeAsList = false">◎ Rings</button><button type="button" :class="{ on: ui.treeAsList }" @click="ui.treeAsList = true">☰ List</button></span></h3>
          <SubTree v-if="ui.treeAsList" :id="e.id" />
          <Sunburst v-else :id="e.id" :key="'sb-' + e.id" />
        </div>


        <div v-for="[g, fs] in e.type === 'pc' ? [] : groups" :key="g" class="card">
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
        <!-- A character's attacks and proficiencies instead of the relation cards (Equipped and the inventory are under the sheet). -->
        <AttacksCard v-if="e.type === 'pc'" :pc="e" />
        <!-- A character's details and appearance come after what they carry. -->
        <div v-for="[g, fs] in e.type === 'pc' ? groups : []" :key="'pc-' + g" class="card">
          <h3>{{ g }}</h3>
          <dl>
            <template v-for="f in fs" :key="f.def.key">
              <dt>{{ f.def.label }}</dt>
              <dd><FieldValue :def="f.def" :value="f.value" :entry="e" /></dd>
            </template>
          </dl>
        </div>

        <div v-for="[label, list] in ['pc', 'spell', 'feat'].includes(e.type) ? [] : relGroups" :key="label" class="card">
          <h3>{{ label[0].toUpperCase() + label.slice(1) }}</h3>
          <ul class="rel rel-scroll">
            <li v-for="{ other, r } in list" :key="r.id" :class="{ ended: ended(r) }">
              <EntryLink :id="other" icon />
              <span v-if="r.role" class="role">{{ r.role }}</span>
              <span v-if="r.from || r.to" class="when">{{ range(r.from, r.to) }}</span>
            </li>
          </ul>
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
          <ul class="rel"><li v-for="m in onMaps" :key="m.place.id + m.pin.id"><a :href="hrefMap(m.place.id, m.pin.id)"><AppIcon ui="map" /> {{ m.place.name }}</a></li></ul>
        </div>

        <div v-if="knownBy.length" class="card">
          <h3>Known by</h3>
          <ul class="plain"><li v-for="p in knownBy" :key="p.id"><EntryLink :id="p.id" icon /></li></ul>
        </div>
        <div v-if="carriedBy.length" class="card">
          <h3>Carried by</h3>
          <ul class="plain"><li v-for="p in carriedBy" :key="p.id"><EntryLink :id="p.id" icon /> <span class="muted small">× {{ p.fields.sheet!.inventory.filter(l => l.item === e!.id).reduce((n, l) => n + l.qty, 0) }}</span></li></ul>
        </div>
        <div v-if="mentions.length && !(e.type === 'pc' && playerMode)" class="card">
          <h3>Mentioned in <span class="muted small">{{ mentions.length }}</span></h3>
          <ul class="rel mentions-list"><li v-for="m in mentions" :key="m.id"><EntryLink :id="m.id" icon /></li></ul>
        </div>
      </aside>
    </div>
  </article>
  <div v-else class="empty-state">
    <h1>Not found</h1>
    <p>There's no entry with the id <code>{{ id }}</code>.</p>
  </div>
</template>
