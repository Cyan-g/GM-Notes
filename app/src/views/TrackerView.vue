<script setup lang="ts">
// Initiative tracker: turn order, HP, conditions, and the statblock of whoever is acting.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Combatant, Id, Statblock } from '../model/types'
import { byType, get, touch } from '../store'
import { CONDITIONS, mod, newCombatantId, statsOf } from '../encounter'
import { addCombatant, addPlayers, applyHp, clearTracker, loadEncounter, nextTurn, partyOf, removeCombatant, rollInitiative, sortByInitiative, tracker } from '../tracker'
import EntryLink from '../components/EntryLink.vue'
import EntryPicker from '../components/edit/EntryPicker.vue'
import StatblockView from '../components/Statblock.vue'
import EncounterTable from '../components/EncounterTable.vue'

const t = computed(() => tracker())
const selected = ref<string | null>(null)
const focus = computed(() => t.value.combatants.find(c => c.id === selected.value) ?? t.value.combatants[t.value.turn])
const focusStats = computed(() => statsOf(get(focus.value?.entry)) as Statblock | undefined)
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

function setNum(c: Combatant, key: 'init' | 'ac' | 'maxHp' | 'tempHp' | 'initMod', raw: string) {
  const v = raw.trim() === '' ? undefined : Number(raw)
  if (key === 'init') c.init = v ?? null
  else if (key === 'initMod') c.initMod = v ?? 0
  else { (c as any)[key] = v; if (key === 'maxHp' && c.hp == null) c.hp = v }
  touch()
}
function hpInput(c: Combatant, ev: Event) {
  const el = ev.target as HTMLInputElement
  if (applyHp(c, el.value)) el.value = ''
}
function addCondition(c: Combatant, v: string) { if (v && !c.conditions.includes(v)) { c.conditions.push(v); touch() } }
function removeCondition(c: Combatant, v: string) { c.conditions = c.conditions.filter(x => x !== v); touch() }
const hpClass = (c: Combatant) => c.hp == null || !c.maxHp ? '' : c.hp <= 0 ? 'down' : c.hp <= c.maxHp / 2 ? 'bloodied' : ''

function onKey(ev: KeyboardEvent) {
  const el = ev.target as HTMLElement
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
  if (ev.key === 'n' || ev.key === ' ') { ev.preventDefault(); nextTurn() }
  if (ev.key === 'p') nextTurn(-1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
function clearAll() { if (confirm('Clear the tracker? Player characters stay, with their HP restored.')) clearTracker() }
</script>

<template>
  <div class="tracker-view">
    <header class="list-head">
      <h1><span class="icon">⚔</span>Initiative <span v-if="t.round" class="count">round {{ t.round }}</span></h1>
      <div class="cal-nav">
        <button title="Previous turn (P)" :disabled="t.turn < 0" @click="nextTurn(-1)">◀</button>
        <button class="primary" title="Next turn (N or Space)" :disabled="!t.combatants.length" @click="nextTurn()">{{ t.turn < 0 ? 'Start combat' : 'Next turn ▶' }}</button>
      </div>
    </header>

    <div class="card tracker-tools">
      <label><span>Encounter</span><EntryPicker :model-value="t.encounter ?? null" :types="['encounter']" placeholder="Load an encounter…" @update:model-value="load" /></label>
      <label><span>Party</span>
        <span class="row">
          <select v-model="partyCampaign"><option value="">All player characters ({{ partyOf().length }})</option><option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }} ({{ partyOf(c.id).length }})</option></select>
          <button @click="addParty">Add</button>
        </span>
      </label>
      <label><span>Add creature or character</span><EntryPicker add :types="['creature', 'npc', 'pc']" placeholder="Name…" @pick="addEntry" /></label>
      <label><span>…or anything</span><input v-model="freeName" placeholder="e.g. Goblin" @keydown.enter="addFree" /></label>
      <span class="spacer" />
      <button title="Roll d20 + Dex for every monster without an initiative" @click="rollInitiative()">🎲 Roll for monsters</button>
      <button @click="sortByInitiative">Sort</button>
      <button class="danger" @click="clearAll">Clear</button>
    </div>

    <div class="tracker-layout">
      <div class="table-wrap">
        <table class="grid tracker">
          <thead><tr><th class="num">Init</th><th>Name</th><th class="num">AC</th><th class="num">HP</th><th>Damage / heal</th><th>Conditions</th><th /></tr></thead>
          <tbody>
            <tr v-for="(c, i) in t.combatants" :key="c.id" :class="[{ current: i === t.turn, player: c.isPlayer, sel: c.id === selected }, hpClass(c)]" @click="selected = c.id">
              <td class="num"><input type="number" class="short init" :value="c.init ?? ''" :placeholder="(c.initMod >= 0 ? '+' : '') + c.initMod" @change="setNum(c, 'init', ($event.target as HTMLInputElement).value)" /></td>
              <td class="name">
                <span v-if="i === t.turn" class="turn-mark">▶</span>
                <EntryLink v-if="c.entry" :id="c.entry" :label="c.name" />
                <span v-else>{{ c.name }}</span>
                <span v-if="c.isPlayer" class="badge">PC</span>
              </td>
              <td class="num"><input type="number" class="short" :value="c.ac ?? ''" @change="setNum(c, 'ac', ($event.target as HTMLInputElement).value)" /></td>
              <td class="num hp-cell">
                <b>{{ c.hp ?? '—' }}</b><span class="muted">/</span><input type="number" class="short max" :value="c.maxHp ?? ''" title="Max HP" @change="setNum(c, 'maxHp', ($event.target as HTMLInputElement).value)" />
                <span v-if="c.tempHp" class="temp" title="Temporary HP">+{{ c.tempHp }}</span>
              </td>
              <td><input class="hp-input" placeholder="-7, +5, =20" title="Number = damage, + heals, = sets" @keydown.enter="hpInput(c, $event)" @change="hpInput(c, $event)" /></td>
              <td>
                <span class="chips">
                  <span v-for="x in c.conditions" :key="x" class="chip cond">{{ x }}<button class="x" @click.stop="removeCondition(c, x)">×</button></span>
                  <select class="cond-add" :value="''" @change="addCondition(c, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
                    <option value="">＋</option>
                    <option v-for="x in CONDITIONS.filter(x => !c.conditions.includes(x))" :key="x" :value="x">{{ x }}</option>
                  </select>
                </span>
              </td>
              <td><button class="x" title="Remove" @click.stop="removeCombatant(c.id)">×</button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!t.combatants.length" class="muted pad">Load an encounter, add your party, or add creatures one by one.</p>
      </div>

      <aside class="tracker-side">
        <StatblockView v-if="focus && focusStats" :sb="focusStats" :name="focus.name" />
        <div v-else-if="focus" class="card"><h3>{{ focus.name }}</h3><p class="muted small">No statblock for this one.</p></div>
        <div v-if="encounter" class="card">
          <h3>Encounter: <EntryLink :id="encounter.id" /></h3>
          <EncounterTable :lines="(encounter.fields.creatures as any[]) ?? []" />
        </div>
      </aside>
    </div>
  </div>
</template>
