<script setup lang="ts">
// The head of an entry's page: its actions (favourite, card, and Edit with a menu: level up, history, export, copy
// to another world), its picture, and under its name
// the badges (kind, status, attitude, DM only), its other names, its one-line description and the facts that belong
// right there (entryFacts.ts).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Entry } from '../model/types'
import { TYPES } from '../model/schema'
import { playerMode, state } from '../store'
import { printable } from '../cards'
import { fromPlayer, isShared, sharedBy } from '../sync'
import { removePlayerCharacter } from '../playerCharacters'
import { XP_AT, currentPc, levelOf, setCurrent } from '../sheet'
import { rule } from '../rules'
import { go, hrefEntry, route } from '../router'
import { printCards, ui } from '../ui'
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
import CopyDialog from './CopyDialog.vue'
import { desktop } from '../storage/desktop'
import HistoryDialog from './HistoryDialog.vue'
import DataImage from './DataImage.vue'
import AttitudeBadge from './AttitudeBadge.vue'
import DmOnlyBadge from './DmOnlyBadge.vue'

const props = defineProps<{ e: Entry }>()
const def = computed(() => TYPES[props.e.type])
/** Shared by the DM's world this one follows, or sent by a player: read-only here. */
const shared = computed(() => isShared(props.e))
const by = computed(() => sharedBy(props.e))
/** A player's character the DM has (sent from the player's app). */
const player = computed(() => fromPlayer(props.e))
function removeIt() {
  if (!confirm(`Remove ${props.e.name} from your world? ${player.value?.gone ? 'Its player no longer shares it.' : 'While its player shares it, it comes back the next time they\'re connected.'}`)) return
  removePlayerCharacter(props.e.id)
  go('#/')
}
const exporting = ref(false)
/** Copying it to another of your worlds (desktop app). */
const copying = ref(false)
const showHistory = ref(false)
/** "Dead since 86 AC", by the name. */
const status = computed(() => (props.e.type === 'npc' ? statusText(props.e) : ''))
// Places show their kind as the badge, so a place has no lead line of its own; items and spells show their line
// inside their card.
const lead = computed(() => (!['place', 'item', 'spell', 'feat'].includes(props.e.type) ? describe(props.e, { parent: false }) : ''))
const facts = computed(() => factsOf(props.e))

// ---- the Edit button's menu ----
const menu = ref(false)
const menuEl = ref<HTMLElement | null>(null)
/** A character of one's own can level up (not a shared one, not past 20, not in a read-only world). */
const canLevel = computed(() => props.e.type === 'pc' && !shared.value && !player.value && !state.readOnly && levelOf(props.e) < 20)
/** Enough XP for the next level (XP rule): the menu says so, and the button shows a dot. */
const ready = computed(() => canLevel.value && rule('experience') === 'xp' && (props.e.fields.sheet?.xp ?? 0) >= XP_AT[levelOf(props.e)])
function pick(job: () => void) { menu.value = false; job() }
/** Level up opens on the character's sheet: on its Overview, where the sheet is. */
function levelUp() { pick(() => { go(hrefEntry(props.e.id)); ui.levelUp = props.e.id }) }
const outside = (ev: PointerEvent) => { if (!menuEl.value?.contains(ev.target as Node)) menu.value = false }
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); menu.value = false } }
watch(menu, on => {
  if (on) { document.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', onKey, true) }
  else { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', onKey, true) }
})
onBeforeUnmount(() => { menu.value = false })
// another page or tab: the menu closes
watch(() => route.current, () => { menu.value = false })
</script>

<template>
  <header class="entry-head" :class="{ 'has-portrait': e.image && e.type !== 'pc' && e.type !== 'item' }">
    <div class="head-actions">
      <button class="fav-btn" :class="{ on: isFavourite(e.id) }" :title="isFavourite(e.id) ? 'Remove from favourites (F)' : 'Add to favourites (F)'" :aria-pressed="isFavourite(e.id)" @click="toggleFavourite(e.id)"><AppIcon ui="star" :class="{ off: !(isFavourite(e.id)) }" /></button>
      <button v-if="printable(e)" class="export-btn" title="Print this as a card (PDF, poker size)" @click="printCards(e.name, [{ label: 'This one', ids: [e.id] }])"><AppIcon ui="cards" /> Card</button>
      <span v-if="shared" class="badge shared-badge" :title="by?.title"><AppIcon ui="download" /> {{ by?.label }}</span>
      <!-- Edit, and beside it a menu: level up, history, export, copy to another world -->
      <div ref="menuEl" class="split-btn">
        <a v-if="!shared" class="button edit-btn" :href="hrefEntry(e.id, true)" title="Edit (E)">✎ Edit</a>
        <button type="button" class="split-more" :class="{ alone: shared, ready }" aria-haspopup="menu" :aria-expanded="menu"
                :title="ready ? 'More (enough XP to level up)' : canLevel ? 'Level up, history, export…' : 'History, export…'" @click="menu = !menu">{{ shared ? 'More' : '' }}<span class="split-arrow">▾</span></button>
        <div v-if="menu" class="menu-panel head-menu" role="menu">
          <button v-if="canLevel" type="button" class="menu-row" role="menuitem" title="Class, hit points, new features, feat and spells" @click="levelUp"><AppIcon ui="upgrade" /><span class="menu-label">Level up</span><span v-if="ready" class="menu-hint">ready</span></button>
          <button type="button" class="menu-row" role="menuitem" title="Earlier versions of this entry" @click="pick(() => showHistory = true)"><AppIcon ui="history" /><span class="menu-label">History</span></button>
          <button v-if="canExport(e)" type="button" class="menu-row" role="menuitem" title="Save as a file to share (someone else can import it)" @click="pick(() => exporting = true)"><AppIcon ui="exportFile" /><span class="menu-label">Export…</span></button>
          <button v-if="desktop && canExport(e)" type="button" class="menu-row" role="menuitem" title="Copy it, with what it uses, to another of your worlds" @click="pick(() => copying = true)"><AppIcon ui="share" /><span class="menu-label">Copy to…</span></button>
        </div>
      </div>
      <span v-if="player?.gone" class="badge" title="Its player unlinked it from your campaign or deleted it; this is the last version they sent">no longer shared</span>
      <button v-if="player && e.type === 'pc'" class="export-btn danger" title="Remove this character from your world" @click="removeIt">Remove</button>
    </div>
    <ExportDialog v-if="canExport(e)" v-model="exporting" :id="e.id" />
    <CopyDialog v-if="copying" v-model="copying" :id="e.id" />
    <HistoryDialog v-if="showHistory" :entry="e" @close="showHistory = false" />
    <!-- an item's picture is on its card -->
    <DataImage v-if="e.image && e.type !== 'pc' && e.type !== 'item'" :path="e.image" :alt="e.name" class="portrait head-portrait" />
    <div class="head-text">
    <div class="title-line">
      <h1><span class="icon"><EntryIcon :e="e" /></span>{{ e.name }}</h1>
      <div class="sub">
        <span class="badge">{{ (e.type === 'place' && e.fields.placeType) || (e.type === 'item' && e.fields.kind) || def.label }}</span>
        <!-- A character: whether the Spellbook, Workbench and Character menu use them. -->
        <button v-if="e.type === 'pc' && !player" class="chip-toggle current-toggle" :class="{ on: currentPc?.id === e.id }" :disabled="!!state.readOnly"
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
