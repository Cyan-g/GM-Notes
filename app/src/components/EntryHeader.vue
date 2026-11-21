<script setup lang="ts">
// The head of an entry's page: its actions (favourite, history, card, export, edit), its picture, and under its name
// the badges (kind, status, attitude, DM only), its other names, its one-line description and the facts that belong
// right there (entryFacts.ts).
import { computed, ref } from 'vue'
import type { Entry } from '../model/types'
import { TYPES } from '../model/schema'
import { playerMode, state } from '../store'
import { printable } from '../cards'
import { isShared } from '../sync'
import { currentPc, setCurrent } from '../sheet'
import { hrefEntry } from '../router'
import { printCards } from '../ui'
import { isFavourite, toggleFavourite } from '../edit'
import { canExport } from '../transfer'
import { describe } from '../describe'
import { statusText } from '../npc'
import { factsOf } from '../entryFacts'
import { isPlayable } from '../species'
import AppIcon from './AppIcon.vue'
import EntryIcon from './EntryIcon.vue'
import EntryLink from './EntryLink.vue'
import ExportDialog from './ExportDialog.vue'
import HistoryDialog from './HistoryDialog.vue'
import DataImage from './DataImage.vue'
import AttitudeBadge from './AttitudeBadge.vue'
import DmOnlyBadge from './DmOnlyBadge.vue'

const props = defineProps<{ e: Entry }>()
const def = computed(() => TYPES[props.e.type])
/** Shared by the DM's world this one follows: read-only here. */
const shared = computed(() => isShared(props.e))
const exporting = ref(false)
const showHistory = ref(false)
/** "Dead since 86 AC", by the name. */
const status = computed(() => (props.e.type === 'npc' ? statusText(props.e) : ''))
// Places show their kind as the badge, so a place has no lead line of its own; items and spells show their line
// inside their card.
const lead = computed(() => (!['place', 'item', 'spell', 'feat'].includes(props.e.type) ? describe(props.e, { parent: false }) : ''))
const facts = computed(() => factsOf(props.e))
</script>

<template>
  <header class="entry-head" :class="{ 'has-portrait': e.image && e.type !== 'pc' && e.type !== 'item' }">
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
    <!-- an item's picture is on its card -->
    <DataImage v-if="e.image && e.type !== 'pc' && e.type !== 'item'" :path="e.image" :alt="e.name" class="portrait head-portrait" />
    <div class="head-text">
    <div class="title-line">
      <h1><span class="icon"><EntryIcon :e="e" /></span>{{ e.name }}</h1>
      <div class="sub">
        <span class="badge">{{ (e.type === 'place' && e.fields.placeType) || (e.type === 'item' && e.fields.kind) || def.label }}</span>
        <!-- A character: whether the Spellbook, Workbench and Character menu use them. -->
        <button v-if="e.type === 'pc'" class="chip-toggle current-toggle" :class="{ on: currentPc?.id === e.id }" :disabled="!!state.readOnly"
                :title="currentPc?.id === e.id ? 'The Spellbook, Workbench and Character menu use this character' : 'Use this character in the Spellbook, Workbench and Character menu'"
                @click="setCurrent(currentPc?.id === e.id ? undefined : e.id)"><AppIcon ui="star" :class="{ off: !(currentPc?.id === e.id) }" /> {{ currentPc?.id === e.id ? 'Current character' : 'Make current' }}</button>
        <span v-if="status" class="badge npc-status-badge" :class="'st-' + String(e.fields.status).toLowerCase()">{{ status }}</span>
        <AttitudeBadge :e="e" title="How they stand with the party" />
        <span v-if="e.type === 'race' && !isPlayable(e)" class="badge" :title="e.fields.notPlayable ? 'Left out of the character wizard' : 'Its main race is marked not playable, so the character wizard leaves it out'">not playable</span>
        <DmOnlyBadge v-if="e.visibility === 'secret' && !playerMode && e.type !== 'pc'" title="Players don't know this entry yet" />
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
</template>
