<script setup lang="ts">
// Combat: initiative order, HP, conditions, and the statblock of whoever is acting.
import Dropdown from '../components/Dropdown.vue'
import ConditionIcon from '../components/ConditionIcon.vue'
import AppIcon from '../components/AppIcon.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Combatant, Id, Statblock } from '../model/types'
import { byType, get, touch } from '../store'
import { newCombatantId, statsOf } from '../encounter'
import { addCombatant, addEntryToTracker, addPlayers, clearTracker, isParty, loadEncounter, nextTurn, partyOf, rollInitiative, sortByInitiative, fighterStats, tracker } from '../tracker'
import { hrefEntry } from '../router'
import EntryLink from '../components/EntryLink.vue'
import EntryPicker from '../components/edit/EntryPicker.vue'
import StatblockView from '../components/Statblock.vue'
import CombatantCard from '../components/CombatantCard.vue'

const t = computed(() => tracker())
const selected = ref<string | null>(null)
const encounter = computed(() => get(t.value.encounter))
const campaigns = computed(() => byType.value.get('campaign') ?? [])
const partyCampaign = ref<string>((encounter.value?.fields.campaign) ?? '')

function load(id: string | null) {
  if (!id) return
  if (t.value.round && t.value.combatants.length && !confirm(`Replace the fight in round ${t.value.round} with ${get(id)?.name ?? 'this encounter'}?`)) return
  loadEncounter(id)
  const c = get(id)?.fields.campaign
  if (c) partyCampaign.value = c
  selected.value = null
}
function addParty() { addPlayers(partyOf(partyCampaign.value || undefined)) }
const addEntry = (id: Id) => addEntryToTracker(id)
const freeName = ref('')
function addFree() {
  const n = freeName.value.trim()
  if (!n) return
  addCombatant({ id: newCombatantId(), name: n, isPlayer: false, init: null, initMod: 0, conditions: [] })
  freeName.value = ''
}
function addAlly(id: Id) {
  addEntry(id)
  const c = t.value.combatants.at(-1)
  if (c && c.entry === id) { c.side = 'party'; touch() }
}

// ---- the two sides and the order of play ----
const party = computed(() => t.value.combatants.filter(isParty))
const enemies = computed(() => t.value.combatants.filter(c => !isParty(c)))
/**
 * The initiative order around whoever is acting: they stand in the middle, those who went before them to the
 * left (oldest at the far left), those still to come to the right. "↻" marks where a new round begins.
 * Before combat starts, the first in line takes the middle.
 */
type StripItem = { kind: 'chip'; c: Combatant } | { kind: 'wrap'; round: number }
const order = computed(() => {
  const list = t.value.combatants
  const n = list.length
  if (!n) return { left: [] as StripItem[], centre: null as Combatant | null, right: [] as StripItem[] }
  const at = Math.max(0, t.value.turn)
  // Before combat nobody has gone yet: everyone after the first waits on the right.
  // On the left only turns that were really taken: none before combat, and in round 1 only this round's.
  const half = Math.floor((n - 1) / 2)
  const L = t.value.turn < 0 ? 0 : t.value.round <= 1 ? Math.min(half, at) : half, R = n - 1 - L
  const idx = (k: number) => ((k % n) + n) % n
  const round = t.value.round
  const leftIdx = Array.from({ length: L }, (_, k) => idx(at - L + k))
  const rightIdx = Array.from({ length: R }, (_, k) => idx(at + 1 + k))
  const build = (ids: number[], side: 'left' | 'right') => {
    const out: StripItem[] = []
    ids.forEach((i, k) => {
      // The first in initiative starts a round: the current one on the left, the next one on the right.
      if (i === 0 && (side === 'right' || k > 0)) out.push({ kind: 'wrap', round: side === 'right' ? round + 1 : round })
      out.push({ kind: 'chip', c: list[i] })
    })
    return out
  }
  const left = build(leftIdx, 'left')
  // The current turn holder opens a round: the marker sits just left of them.
  if (at === 0 && L > 0 && round > 0) left.push({ kind: 'wrap', round })
  return { left, centre: list[at], right: build(rightIdx, 'right') }
})
const current = (c: Combatant) => t.value.combatants[t.value.turn]?.id === c.id
const stripState = (c: Combatant) => { const s = fighterStats(c); return s.hp == null || !s.maxHp ? '' : s.hp <= 0 ? 'down' : s.hp <= s.maxHp / 2 ? 'bloodied' : '' }
const hpPct = (c: Combatant) => { const s = fighterStats(c); return s.maxHp ? Math.max(0, Math.min(100, ((s.hp ?? 0) / s.maxHp) * 100)) : null }
// Typing an initiative re-sorts the order straight away.
watch(() => t.value.combatants.map(c => c.init).join(','), () => sortByInitiative())

// ---- statblock pop-up ----
const shown = ref<string | null>(null)
const shownC = computed(() => t.value.combatants.find(c => c.id === shown.value))
const shownStats = computed(() => statsOf(get(shownC.value?.entry)) as Statblock | undefined)

function onKey(ev: KeyboardEvent) {
  const el = ev.target as HTMLElement
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
  if (ev.key === 'n' || ev.key === ' ') { ev.preventDefault(); nextTurn() }
  if (ev.key === 'p') nextTurn(-1)
  if (ev.key === 'Escape') shown.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
function clearAll() { if (confirm('Clear the tracker? Player characters stay, with their HP restored.')) clearTracker() }
</script>

<template>
  <div class="tracker-view">
    <header class="list-head">
      <h1><span class="icon"><AppIcon ui="combat" /></span>Combat <span v-if="t.round" class="count">round {{ t.round }}</span></h1>
      <span v-if="encounter" class="muted"><EntryLink :id="encounter.id" icon /></span>
      <span class="spacer" />
      <button v-if="t.combatants.length" title="Roll d20 + Dex for every monster without an initiative" @click="rollInitiative()"><AppIcon ui="dice" /> Roll for monsters</button>
      <button v-if="t.combatants.length" class="danger" title="End the fight: monsters go, player characters stay, keeping the HP on their sheets" @click="clearAll">Clear</button>
      <div class="cal-nav">
        <button title="Previous turn (P)" :disabled="t.turn < 0" @click="nextTurn(-1)">◀</button>
        <button class="primary" title="Next turn (N or Space)" :disabled="!t.combatants.length" @click="nextTurn()"><template v-if="t.turn < 0"><AppIcon ui="combat" /> Start combat</template><template v-else>Next ▶</template></button>
      </div>
    </header>

    <!-- The order of play: whoever is acting in the middle, earlier turns to the left, upcoming to the right. -->
    <div class="init-strip card" :class="{ empty: !t.combatants.length }">
      <span v-if="!t.combatants.length" class="muted small">The initiative order shows up here once there's someone in the fight.</span>
      <template v-else>
        <div class="init-side left">
          <template v-for="(it, k) in order.left" :key="it.kind === 'chip' ? it.c.id : 'w' + k">
            <span v-if="it.kind === 'wrap'" class="init-wrap" :title="`Round ${it.round} starts`">↻ {{ it.round || '' }}</span>
            <button v-else type="button" class="init-chip done" :class="[stripState(it.c), { party: isParty(it.c), sel: selected === it.c.id }]"
                    :title="`${it.c.name}${it.c.init != null ? ' · initiative ' + it.c.init : ''} · already went`" @click="selected = it.c.id">
              <span class="init-num">{{ it.c.init ?? '–' }}</span><span class="init-name">{{ it.c.name }}</span>
              <span v-if="it.c.conditions.length" class="init-cond" :title="it.c.conditions.join(', ')"><ConditionIcon v-for="x in it.c.conditions" :key="x" :name="x" /></span>
              <span v-if="hpPct(it.c) != null" class="init-hp"><span :style="{ width: hpPct(it.c) + '%' }" /></span>
            </button>
          </template>
        </div>
        <button v-if="order.centre" type="button" class="init-chip centre" :class="[stripState(order.centre), { now: t.turn >= 0, party: isParty(order.centre), sel: selected === order.centre.id }]"
                :title="t.turn >= 0 ? `${order.centre.name}'s turn` : `${order.centre.name} goes first`" @click="selected = order.centre!.id">
          <span class="init-num">{{ order.centre.init ?? '–' }}</span><span class="init-name">{{ order.centre.name }}</span>
          <span v-if="order.centre.conditions.length" class="init-cond" :title="order.centre.conditions.join(', ')"><ConditionIcon v-for="x in order.centre.conditions" :key="x" :name="x" /></span>
          <span v-if="hpPct(order.centre) != null" class="init-hp"><span :style="{ width: hpPct(order.centre) + '%' }" /></span>
        </button>
        <div class="init-side right">
          <template v-for="(it, k) in order.right" :key="it.kind === 'chip' ? it.c.id : 'w' + k">
            <span v-if="it.kind === 'wrap'" class="init-wrap" :title="`Round ${it.round} starts`">↻ {{ it.round || '' }}</span>
            <button v-else type="button" class="init-chip" :class="[stripState(it.c), { party: isParty(it.c), sel: selected === it.c.id }]"
                    :title="`${it.c.name}${it.c.init != null ? ' · initiative ' + it.c.init : ''}`" @click="selected = it.c.id">
              <span class="init-num">{{ it.c.init ?? '–' }}</span><span class="init-name">{{ it.c.name }}</span>
              <span v-if="it.c.conditions.length" class="init-cond" :title="it.c.conditions.join(', ')"><ConditionIcon v-for="x in it.c.conditions" :key="x" :name="x" /></span>
              <span v-if="hpPct(it.c) != null" class="init-hp"><span :style="{ width: hpPct(it.c) + '%' }" /></span>
            </button>
          </template>
        </div>
      </template>
    </div>

    <div class="sides">
      <section class="side-col">
        <h2 class="side-title"><AppIcon ui="shield" /> Party &amp; allies <span class="muted small">{{ party.length }}</span></h2>
        <CombatantCard v-for="c in party" :key="c.id" :c="c" :current="current(c)" :selected="selected === c.id" @select="selected = c.id" @stats="shown = c.id" />
        <!-- Adding: a big card while the side is empty, a slim one under the fighters after. -->
        <div class="card side-add" :class="{ slim: party.length }">
          <label><span>Party</span>
            <span class="row">
              <Dropdown v-model="partyCampaign"><option value="">All player characters ({{ partyOf().length }})</option><option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }} ({{ partyOf(c.id).length }})</option></Dropdown>
              <button @click="addParty">Add</button>
            </span>
          </label>
          <label><span>Ally</span><EntryPicker add :types="['npc', 'creature', 'pc']" placeholder="Add an ally by name…" @pick="addAlly" /></label>
        </div>
      </section>
      <section class="side-col enemies">
        <h2 class="side-title"><AppIcon ui="skull" /> Enemies <span v-if="enemies.length" class="muted small">{{ enemies.filter(c => stripState(c) !== 'down').length }} / {{ enemies.length }} standing</span></h2>
        <CombatantCard v-for="c in enemies" :key="c.id" :c="c" :current="current(c)" :selected="selected === c.id" @select="selected = c.id" @stats="shown = c.id" />
        <div class="card side-add" :class="{ slim: enemies.length }">
          <label><span>Encounter</span><EntryPicker :model-value="t.encounter ?? null" :types="['encounter']" placeholder="Load an encounter…" @update:model-value="load" /></label>
          <label><span>Enemy</span><EntryPicker add :types="['creature', 'npc']" placeholder="Add a creature by name…" @pick="addEntry" /></label>
          <label><span>…or anything</span>
            <span class="row"><input v-model="freeName" placeholder="e.g. Goblin" @keydown.enter="addFree" /><button :disabled="!freeName.trim()" @click="addFree">Add</button></span>
          </label>
        </div>
      </section>
    </div>

    <div v-if="shownC" class="modal-back" @mousedown.self="shown = null">
      <div class="modal" role="dialog" :aria-label="shownC.name">
        <header class="modal-head">
          <h2>{{ shownC.name }}</h2>
          <span class="spacer" />
          <a v-if="shownC.entry" class="button" :href="hrefEntry(shownC.entry)" @click="shown = null">Open page</a>
          <button class="x" title="Close (Esc)" @click="shown = null">×</button>
        </header>
        <StatblockView v-if="shownStats" :sb="shownStats" :name="shownC.name" />
        <p v-else class="muted small">No statblock for this one.</p>
      </div>
    </div>
  </div>
</template>
