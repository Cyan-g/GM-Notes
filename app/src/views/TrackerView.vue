<script setup lang="ts">
// Initiative tracker: turn order, HP, conditions, and the statblock of whoever is acting.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Combatant, Id, Statblock } from '../model/types'
import { byType, get, touch } from '../store'
import { mod, newCombatantId, statsOf } from '../encounter'
import { addCombatant, addPlayers, clearTracker, isParty, loadEncounter, nextTurn, partyOf, rollInitiative, sortByInitiative, tracker } from '../tracker'
import { hrefEntry } from '../router'
import EntryLink from '../components/EntryLink.vue'
import EntryPicker from '../components/edit/EntryPicker.vue'
import StatblockView from '../components/Statblock.vue'
import CombatantCard from '../components/CombatantCard.vue'

const t = computed(() => tracker())
const selected = ref<string | null>(null)
const encounter = computed(() => get(t.value.encounter))
const campaigns = computed(() => byType.value.get('campaign') ?? [])
const partyCampaign = ref<string>((encounter.value?.fields.campaign as string) ?? '')

function load(id: string | null) {
  if (!id) return
  loadEncounter(id)
  const c = get(id)?.fields.campaign as string | undefined
  if (c) partyCampaign.value = c
  selected.value = null
}
function addParty() { addPlayers(partyOf(partyCampaign.value || undefined)) }
function addEntry(id: Id) {
  const e = get(id)!
  if (e.type === 'pc') { addPlayers([e]); return }
  const sb = statsOf(e)
  const same = t.value.combatants.filter(c => c.entry === id).length
  addCombatant({ id: newCombatantId(), name: same ? `${e.name} ${same + 1}` : e.name, entry: id, isPlayer: false, init: null, initMod: mod(sb?.abilities?.dex), hp: sb?.hp, maxHp: sb?.hp, ac: sb?.ac, conditions: [] })
}
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
/** The initiative order starting with whoever is acting; the ones after the wrap are next round. */
const order = computed(() => {
  const list = t.value.combatants.map((c, i) => ({ c, i }))
  const at = Math.max(0, t.value.turn)
  return { now: list.slice(at), next: list.slice(0, at) }
})
const current = (c: Combatant) => t.value.combatants[t.value.turn]?.id === c.id
const stripState = (c: Combatant) => (c.hp == null || !c.maxHp ? '' : c.hp <= 0 ? 'down' : c.hp <= c.maxHp / 2 ? 'bloodied' : '')
const hpPct = (c: Combatant) => (c.maxHp ? Math.max(0, Math.min(100, ((c.hp ?? 0) / c.maxHp) * 100)) : null)
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
      <h1><span class="icon">⚔</span>Encounter <span v-if="t.round" class="count">round {{ t.round }}</span></h1>
      <span v-if="encounter" class="muted"><EntryLink :id="encounter.id" icon /></span>
      <span class="spacer" />
      <button v-if="t.combatants.length" title="Roll d20 + Dex for every monster without an initiative" @click="rollInitiative()">🎲 Roll for monsters</button>
      <button v-if="t.combatants.length" class="danger" title="End the fight: monsters go, player characters stay with full HP" @click="clearAll">Clear</button>
      <div class="cal-nav">
        <button title="Previous turn (P)" :disabled="t.turn < 0" @click="nextTurn(-1)">◀</button>
        <button class="primary" title="Next turn (N or Space)" :disabled="!t.combatants.length" @click="nextTurn()">{{ t.turn < 0 ? '⚔ Start combat' : 'Next ▶' }}</button>
      </div>
    </header>

    <!-- The order of play, starting with whoever is acting. -->
    <div class="init-strip card" :class="{ empty: !t.combatants.length }">
      <span v-if="!t.combatants.length" class="muted small">The initiative order shows up here once there's someone in the fight.</span>
      <template v-for="(part, pi) in [order.now, order.next]" :key="pi">
        <span v-if="pi === 1 && part.length" class="init-wrap" :title="`Round ${t.round + 1}`">↻ {{ t.round ? t.round + 1 : '' }}</span>
        <button v-for="{ c } in part" :key="c.id" type="button" class="init-chip"
                :class="[stripState(c), { now: current(c), party: isParty(c), sel: selected === c.id }]"
                :title="`${c.name}${c.init != null ? ' · initiative ' + c.init : ''}`" @click="selected = c.id">
          <span class="init-num">{{ c.init ?? '–' }}</span>
          <span class="init-name">{{ c.name }}</span>
          <span v-if="c.conditions.length" class="init-cond" :title="c.conditions.join(', ')">{{ c.conditions.length }}</span>
          <span v-if="hpPct(c) != null" class="init-hp"><span :style="{ width: hpPct(c) + '%' }" /></span>
        </button>
      </template>
    </div>

    <div class="sides">
      <section class="side-col">
        <h2 class="side-title">🛡 Party &amp; allies <span class="muted small">{{ party.length }}</span></h2>
        <CombatantCard v-for="c in party" :key="c.id" :c="c" :current="current(c)" :selected="selected === c.id" @select="selected = c.id" @stats="shown = c.id" />
        <!-- Adding: a big card while the side is empty, a slim one under the fighters after. -->
        <div class="card side-add" :class="{ slim: party.length }">
          <label><span>Party</span>
            <span class="row">
              <select v-model="partyCampaign"><option value="">All player characters ({{ partyOf().length }})</option><option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }} ({{ partyOf(c.id).length }})</option></select>
              <button @click="addParty">Add</button>
            </span>
          </label>
          <label><span>Ally</span><EntryPicker add :types="['npc', 'creature', 'pc']" placeholder="Add an ally by name…" @pick="addAlly" /></label>
        </div>
      </section>
      <section class="side-col enemies">
        <h2 class="side-title">☠ Enemies <span v-if="enemies.length" class="muted small">{{ enemies.filter(c => !(c.hp != null && c.hp <= 0)).length }} / {{ enemies.length }} standing</span></h2>
        <CombatantCard v-for="c in enemies" :key="c.id" :c="c" :current="current(c)" :selected="selected === c.id" @select="selected = c.id" @stats="shown = c.id" />
        <div class="card side-add" :class="{ slim: enemies.length }">
          <label><span>Encounter</span><EntryPicker :model-value="t.encounter ?? null" :types="['encounter']" placeholder="Load an encounter…" @update:model-value="load" /></label>
          <label><span>Enemy</span><EntryPicker add :types="['creature', 'npc', 'pc']" placeholder="Add a creature by name…" @pick="addEntry" /></label>
          <label><span>…or anything</span><input v-model="freeName" placeholder="e.g. Goblin, then Enter" @keydown.enter="addFree" /></label>
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
