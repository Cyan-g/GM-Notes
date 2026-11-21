<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import TypeIcon from '../components/TypeIcon.vue'
import { NOTE_TYPES, isShared } from '../sync'
import PlayerNotes from '../components/PlayerNotes.vue'
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { TYPES, byKey, type FieldDef } from '../model/schema'
import { childrenOf, get, placePath, playerMode, entries, state } from '../store'
import { go, hrefEntry, hrefFamily, hrefList, hrefTab, type EntryTab } from '../router'
import type { UiIcon } from '../icons/ui'
import SpellbookView from './SpellbookView.vue'
import InventoryTab from '../components/InventoryTab.vue'
import ClassOverview from '../components/ClassOverview.vue'
import SubclassInfo from '../components/SubclassInfo.vue'
import RaceGlance from '../components/RaceGlance.vue'
import BackgroundGlance from '../components/BackgroundGlance.vue'
import FeatInfo from '../components/FeatInfo.vue'
import UpcastTable from '../components/UpcastTable.vue'
import { statsOf } from '../encounter'
import CompanionsTab from '../components/CompanionsTab.vue'
import CraftingView from './CraftingView.vue'
import FamilyTree from '../components/FamilyTree.vue'
import { familySize } from '../family'
import MapView from '../components/MapView.vue'
import SubTree from '../components/SubTree.vue'
import Sunburst from '../components/Sunburst.vue'
import { ui } from '../ui'
import { changed, createEntry, isEmpty } from '../edit'
import EntryLink from '../components/EntryLink.vue'
import EntryHeader from '../components/EntryHeader.vue'
import MarkdownView from '../components/MarkdownView.vue'
import FieldValue from '../components/FieldValue.vue'
import FieldGroupCard from '../components/FieldGroupCard.vue'
import StatblockView from '../components/Statblock.vue'
import MembersCard from '../components/MembersCard.vue'
import SessionSide from '../components/SessionSide.vue'
import CampaignSessions from '../components/CampaignSessions.vue'
import RaceMembers from '../components/RaceMembers.vue'
import RelationCards from '../components/RelationCards.vue'
import AddToTracker from '../components/AddToTracker.vue'
import ItemCard from '../components/ItemCard.vue'
import SpellCard from '../components/SpellCard.vue'
import CharacterSheet from '../components/CharacterSheet.vue'
import PcNotes from '../components/PcNotes.vue'
import AttacksCard from '../components/AttacksCard.vue'
import FeatCard from '../components/FeatCard.vue'
import TraitList from '../components/TraitList.vue'
import { traitsOf } from '../model/traits'
import TimelineChart from '../components/TimelineChart.vue'
import TimelineList from '../components/TimelineList.vue'
import { allItems, filterItems } from '../timeline'
import SubraceCards from '../components/SubraceCards.vue'
import NpcRoleplay from '../components/NpcRoleplay.vue'
import DeityGlance from '../components/DeityGlance.vue'
import TextLinks from '../components/TextLinks.vue'
import OrgCards from '../components/OrgCards.vue'
import PartyRenown from '../components/PartyRenown.vue'
import StandingCard from '../components/StandingCard.vue'
import OrgsHere from '../components/OrgsHere.vue'
import PlaceCards from '../components/PlaceCards.vue'
import PartyHere from '../components/PartyHere.vue'
import OutlineCard from '../components/OutlineCard.vue'
import { featsGrantedBy } from '../lookup'
import { bodyParts as cutBody, setBodyPart, type BodyPart } from '../bodyParts'

const props = defineProps<{ id: string; tab?: EntryTab }>()
const e = computed(() => get(props.id))
/** People have a second tab with their family tree. */
const hasFamily = computed(() => e.value?.type === 'npc' || e.value?.type === 'pc')
const onFamily = computed(() => hasFamily.value && props.tab === 'family')
const onInv = computed(() => e.value?.type === 'pc' && props.tab === 'inventory')
const onBook = computed(() => e.value?.type === 'pc' && props.tab === 'spellbook')
const onBench = computed(() => e.value?.type === 'pc' && props.tab === 'crafting')
const onPals = computed(() => e.value?.type === 'pc' && props.tab === 'companions')
const onOverview = computed(() => !onFamily.value && !onInv.value && !onBook.value && !onBench.value && !onPals.value)
const def = computed(() => e.value ? TYPES[e.value.type] : undefined)
/** The tabs after Overview: a player character's gear, spells and crafting first; the family tree last. */
const tabs = computed(() => {
  const x = e.value
  if (!x) return []
  const family = { href: hrefFamily(x.id), on: onFamily.value, icon: 'family' as UiIcon, label: 'Family tree', count: familySize(x.id) }
  if (x.type !== 'pc') return [family]
  const s = x.fields.sheet
  return [
    { href: hrefTab(x.id, 'inventory'), on: onInv.value, icon: 'otherItems' as UiIcon, label: 'Inventory', count: s?.inventory?.length },
    { href: hrefTab(x.id, 'spellbook'), on: onBook.value, icon: 'spellbook' as UiIcon, label: 'Spellbook', count: s?.spellbook?.prepared?.length },
    { href: hrefTab(x.id, 'crafting'), on: onBench.value, icon: 'workbench' as UiIcon, label: 'Workbench', count: s?.crafting?.known?.length },
    { href: hrefTab(x.id, 'companions'), on: onPals.value, icon: 'link' as UiIcon, label: 'Companions', count: s?.companions?.length },
    family,
  ]
})

const shown = (f: FieldDef, x: Entry) => !f.when || f.when.is.includes(String(byKey(x.fields)[f.when.field] ?? ''))

const NPC_ELSEWHERE = ['race', 'gender', 'age', 'occupation', 'attitude', 'status', 'statusSince']
/** Simple fields grouped for the side card; big ones (statblock, recipe, stock) go elsewhere. */
const groups = computed(() => {
  const x = e.value
  if (!x || !def.value) return []
  if (x.type === 'item' || x.type === 'spell' || x.type === 'feat') return []
  const big = ['statblock', 'recipe', 'stock', 'combatants', 'ranks', 'sheet', 'classes', 'classBasics', 'speciesTraits']
  const out = new Map<string, { def: FieldDef; value: unknown }[]>()
  for (const f of def.value.fields) {
    // an NPC's race, gender and age are in the line under its name; status and attitude by the name; how to play them in their own card
    if (x.type === 'npc' && (NPC_ELSEWHERE.includes(f.key) || f.group === 'Roleplay')) continue
    // a deity's facts are in its glance card above the text (the rank and epithet under its name)
    if (x.type === 'deity') continue
    // a shop's keeper and prices are in its own card (PlaceCards)
    if (x.type === 'place' && ['markup', 'shopkeeper'].includes(f.key)) continue
    if (x.type === 'campaign' && f.key === 'partyAt') continue
    // an organization's attitude is by its name, its aims and offers in their own cards
    if (x.type === 'organization' && ['attitude', 'goals', 'secret', 'teaches'].includes(f.key)) continue
    if (big.includes(f.kind) || (x.type === 'pc' && f.key === 'level') || (x.type === 'creature' && f.key === 'creatureType') || (x.type === 'session' && ['campaign', 'number', 'date', 'playedOn', 'players'].includes(f.key)) || f.key === 'parent' || (x.type === 'subclass' && ['class', 'tagline'].includes(f.key)) || (x.type === 'race' && ['size', 'otherSizes', 'creatureType', 'speeds', 'abilityIncrease', 'languages', 'languageChoices'].includes(f.key)) || (x.type === 'background' && ['abilityIncrease', 'originFeat', 'originFeatNote', 'skillProfs', 'toolProfs', 'toolsAll', 'equipment'].includes(f.key)) || f.key === 'map' || f.key === 'pins' || f.kind === 'mapData' || !shown(f, x) || isEmpty(byKey(x.fields)[f.key])) continue
    const g = f.group ?? 'Details'
    if (!out.has(g)) out.set(g, [])
    out.get(g)!.push({ def: f, value: byKey(x.fields)[f.key] })
  }
  return [...out]
})
const bigFields = computed(() => {
  const x = e.value
  if (!x || !def.value) return []
  return def.value.fields.filter(f => ['recipe', 'stock', 'combatants', 'ranks', 'speciesTraits'].includes(f.kind) && shown(f, x) && !isEmpty(byKey(x.fields)[f.key]))
})
/** On a subrace's page: the traits of the races it's a subrace of, which its characters have too (nearest first). */
const inherited = computed(() => {
  const out: Entry[] = []
  let r = e.value?.type === 'race' ? get(e.value.fields.parent as string | undefined) : undefined
  while (r && r.type === 'race' && !out.includes(r) && r.id !== e.value!.id) { out.push(r); r = get(r.fields.parent as string | undefined) }
  return out.filter(x => traitsOf(x).length)
})
/** The main races' traits this subrace (or a race between) replaces with its own. */
const replacedHere = computed(() => new Set([e.value, ...inherited.value].flatMap(x => (x ? traitsOf(x).map(t => t.replaces).filter(Boolean) : [])) as string[]))
/** The feats an entry grants (an organization's fighting styles and the like). */
const grantedFeats = computed(() => (e.value ? featsGrantedBy(e.value.id) : []))
const ranksDef = computed(() => def.value?.fields.find(f => f.kind === 'ranks'))
/** The text cut where its ranks and granted feats go (bodyParts.ts). */
const bodyParts = computed(() => (e.value ? cutBody(e.value, grantedFeats.value.length > 0) : { parts: [] as BodyPart[], placed: new Set<string>() }))
/** Checklist boxes in the text can be ticked in read mode, except on a read-only or a shared entry (players tick their own notes). */
const canTick = computed(() => !state.readOnly && !shared.value)
const setPart = (p: BodyPart, md: string) => { if (e.value) setBodyPart(e.value, p, md) }
const scrollSpell = computed(() => (e.value?.type === 'item' && e.value.fields.kind === 'Scroll' ? get(e.value.fields.spell) : undefined))
const statblock = computed(() => statsOf(e.value))

const crumbs = computed(() => {
  const x = e.value
  if (!x) return []
  if (x.type === 'place') return placePath(x.id).slice(0, -1)
  const chain: Entry[] = []
  let p = get(x.fields.parent)
  while (p && chain.length < 10) { chain.unshift(p); p = get(p.fields.parent) }
  return chain
})

/** Timeline items involving this entry (not the entry itself when it's an event). */
const history = computed(() => {
  const x = e.value
  if (!x || ['event', 'session', 'item', 'spell', 'creature'].includes(x.type)) return []
  return filterItems(allItems.value, { focus: x.id }).filter(it => it.entry !== x.id)
})

const children = computed(() => (e.value ? childrenOf.value.get(e.value.id) ?? [] : []))

/** Shared by the DM's world this one follows: read-only here. */
const shared = computed(() => isShared(e.value))
/** A new item like this one, to make a variant of it (opened in its editor). */
function copyItem() {
  const x = e.value!
  const n = createEntry(x.type, `${x.name} (copy)`, JSON.parse(JSON.stringify(x.fields)))
  n.body = String(x.body ?? '')
  changed(n)
  go(hrefEntry(n.id) + '/edit')
}
const campaignNotes = computed(() => e.value?.type === 'campaign'
  ? entries.value.filter(n => (n.type === 'note' && n.fields.campaign === e.value!.id) || (n.type === 'pc' && ((n.fields.campaigns) ?? []).includes(e.value!.id))) : [])
</script>

<template>
  <article v-if="e && def" class="entry">
    <nav class="crumbs">
      <a class="crumb-root" :href="hrefList(e.type)"><TypeIcon :type="e.type" /> {{ def.plural }}</a>
      <template v-for="c in crumbs" :key="c.id"><span class="sep">›</span><EntryLink :id="c.id" /></template>
    </nav>
    <EntryHeader :e="e" />

    <MapView v-if="e.fields.map" :place="e" banner />
    <nav v-if="hasFamily" class="tabs entry-tabs">
      <a :href="hrefEntry(e.id)" :class="{ on: onOverview }">Overview</a>
      <a v-for="t in tabs" :key="t.label" :href="t.href" :class="{ on: t.on }"><AppIcon :ui="t.icon" /> {{ t.label }} <span v-if="t.count" class="muted small">{{ t.count }}</span></a>
    </nav>
    <FamilyTree v-if="onFamily" :id="e.id" />
    <InventoryTab v-else-if="onInv" :pc="e" />
    <SpellbookView v-else-if="onBook" :pc="e" />
    <CraftingView v-else-if="onBench" :pc="e" />
    <CompanionsTab v-else-if="onPals" :pc="e" />
    <div v-else class="entry-grid">
      <div class="entry-main">

        <!-- An item's card takes the main two thirds; its recipe is the first card on the right (as when editing). -->
        <div v-if="e.type === 'item'" class="item-top">
          <ItemCard :e="e" />
          <div v-if="!state.readOnly && !playerMode" class="copy-row"><button type="button" class="chip-btn" title="A new item with the same fields, effects, spells and features: a +2 version, a cursed one" @click="copyItem">Copy as new item</button></div>
        </div>
        <!-- A scroll shows the spell it holds. -->
        <section v-if="scrollSpell" class="scroll-spell">
          <h2><TypeIcon type="spell" /> <EntryLink :id="scrollSpell.id" /></h2>
          <SpellCard :e="scrollSpell" />
        </section>
        <SpellCard v-if="e.type === 'spell'" :e="e" />
        <UpcastTable v-if="e.type === 'spell'" :e="e" />
        <div v-if="e.type === 'spell' && !state.readOnly && !playerMode" class="copy-row"><button type="button" class="chip-btn" title="A new spell with the same stats, rolls and text, to make a variant of it" @click="copyItem">Copy as new spell</button></div>
        <CharacterSheet v-if="e.type === 'pc'" :pc="e" />
        <StatblockView v-if="statblock && e.type === 'creature'" :sb="statblock" :name="e.name" class="wide" />
        <AddToTracker v-if="statblock && e.type === 'creature' && !state.readOnly && !playerMode" :id="e.id" />
        <FeatCard v-if="e.type === 'feat'" :e="e" source />
        <FeatInfo v-if="e.type === 'feat'" :e="e" />
        <SubclassInfo v-if="e.type === 'subclass'" :e="e" />
        <RaceGlance v-if="e.type === 'race'" :e="e" />
        <DeityGlance v-if="e.type === 'deity'" :e="e" />
        <BackgroundGlance v-if="e.type === 'background'" :e="e" />
        <template v-for="(p, i) in e.type === 'pc' ? [] : bodyParts.parts" :key="i">
          <MarkdownView v-if="p.md" :source="p.md" :tasks="canTick" :keep-end="i < bodyParts.parts.length - 1" @update:source="v => setPart(p, v)" />
          <FieldValue v-else-if="p.insert === 'ranks' && ranksDef" :def="ranksDef" :value="e.fields.ranks" :entry="e" />
          <div v-else-if="p.insert === 'feats'" class="feat-list"><FeatCard v-for="f in grantedFeats" :key="f.id" :e="f" title /></div>
        </template>
        <p v-if="!e.body && !['item', 'spell', 'feat', 'creature', 'encounter', 'pc'].includes(e.type)" class="muted">No text yet<template v-if="!state.readOnly"> — <a :href="hrefEntry(e.id) + '/edit'">✎ Edit</a> to write some</template>.</p>
        <PlayerNotes v-if="shared && NOTE_TYPES.includes(e.type)" :entry="e" />

        <ClassOverview v-if="e.type === 'class'" :e="e" />
        <section v-for="f in e.type === 'item' ? [] : bigFields.filter(f => f.kind !== 'classBasics' && !(bodyParts.placed.has('ranks') && f.kind === 'ranks'))" :key="f.key">
          <h2>{{ e.type === 'feat' && f.kind === 'speciesTraits' ? 'On the sheet' : f.label }}</h2>
          <FieldValue :def="f" :value="byKey(e.fields)[f.key]" :entry="e" />
        </section>

        <section v-for="r in inherited" :key="'from-' + r.id">
          <h2>From <EntryLink :id="r.id" /></h2>
          <TraitList :traits="traitsOf(r).filter(t => !replacedHere.has(t.id))" :lineage="e.name" :parent="r.name" />
          <p v-if="traitsOf(r).some(t => replacedHere.has(t.id))" class="muted small">{{ e.name }} replaces: {{ traitsOf(r).filter(t => replacedHere.has(t.id)).map(t => `${t.name} (by ${traitsOf(e).find(x => x.replaces === t.id)?.name})`).join(', ') }}</p>
        </section>

        <section v-if="grantedFeats.length && !bodyParts.placed.has('feats')">
          <h2>Feats</h2>
          <div class="feat-list"><FeatCard v-for="f in grantedFeats" :key="f.id" :e="f" title /></div>
        </section>

        <CampaignSessions v-if="e.type === 'campaign'" :campaign="e" />
        <section v-if="campaignNotes.length">
          <h2>Characters & notes</h2>
          <ul class="plain"><li v-for="n in campaignNotes" :key="n.id"><EntryLink :id="n.id" icon /></li></ul>
        </section>

        <section v-if="history.length" class="history">
          <h2>Timeline</h2>
          <TimelineChart :items="history" :focus="e.id" />
          <TimelineList :items="history" />
        </section>

        <RaceMembers v-if="e.type === 'race'" :race="e" />
      </div>

      <aside class="entry-side">
        <PartyHere v-if="e.type === 'place'" :place="e" />
        <OutlineCard v-if="e.type !== 'pc'" :e="e" />
        <SessionSide v-if="e.type === 'session'" :e="e" />
        <div v-for="f in e.type === 'item' ? bigFields.filter(x => x.kind !== 'speciesTraits') : []" :key="f.key" class="card side-big">
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

        <FieldGroupCard v-for="[g, fs] in e.type === 'pc' ? [] : groups" :key="g" :title="g" :fields="fs" :entry="e" />

        <NpcRoleplay v-if="e.type === 'npc'" :e="e" />
        <TextLinks v-if="e.type === 'deity' || e.type === 'organization'" :e="e" />
        <StatblockView v-if="statblock && e.type !== 'creature'" :sb="statblock" :name="e.name" />
        <AddToTracker v-if="statblock && e.type === 'npc' && !state.readOnly && !playerMode" :id="e.id" />

        <MembersCard v-if="e.type === 'organization'" :org="e" />
        <PartyRenown v-if="e.type === 'organization' && !playerMode" :org="e" />
        <OrgCards v-if="e.type === 'organization'" :e="e" />
        <PlaceCards v-if="e.type === 'place'" :e="e" />
        <OrgsHere v-if="e.type === 'place'" :place="e" />
        <!-- A character's attacks and proficiencies instead of the relation cards (Equipped and the inventory are under the sheet). -->
        <AttacksCard v-if="e.type === 'pc'" :pc="e" />
        <StandingCard v-if="e.type === 'pc'" :pc="e" />
        <!-- A character's details and appearance come after what they carry. -->
        <FieldGroupCard v-for="[g, fs] in e.type === 'pc' ? groups : []" :key="'pc-' + g" :title="g" :fields="fs" :entry="e" />

        <RelationCards :e="e" />
        <!-- a player character's notes beside the sheet, where other pages list what mentions them -->
        <PcNotes v-if="e.type === 'pc'" :pc="e" />
      </aside>
    </div>
  </article>
  <div v-else class="empty-state">
    <h1>Not found</h1>
    <p>There's no entry with the id <code>{{ id }}</code>.</p>
  </div>
</template>
