<script setup lang="ts">
// The caster's spellbook: attack bonus and save DC, spell slots to tick off, and the prepared spells
// with their attack or save worked out.
import AppIcon from '../components/AppIcon.vue'
import { computed, ref } from 'vue'
import { optionLabel } from '../store'
import type { Entry, Id, Spellbook } from '../model/types'
import { db, get, touch } from '../store'
import { activeSpellbook, currentPc, editSheet, longRest, sheetOf, spellStats } from '../sheet'
import { castFromItem, grantedSpells, restItems, unuse, type GrantedSpell } from '../gear'
import { classesOf } from '../model/classes'
import { restSlots, setSlotCount, slotFor, slotRows, useSlot, type SlotRow } from '../slots'
import type { Entry as PcEntry } from '../model/types'
import EntryLink from '../components/EntryLink.vue'
import { newEntry } from '../ui'
import { hrefEntry } from '../router'
import SpellModal from '../components/SpellModal.vue'
import EntryPicker from '../components/edit/EntryPicker.vue'

/** On a character's page (their tab) it's theirs; on its own page, the current character's or the world's. */
const props = defineProps<{ pc?: PcEntry }>()
const owner = computed(() => props.pc ?? currentPc.value)
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

// The current character's spellbook, or the world's when no character is current.
const book = computed<Spellbook>(() => activeSpellbook(props.pc))
// The caster is the current character: their sheet gives attack and DC. Without one, the numbers are typed in.
const caster = owner
const fromSheet = computed(() => (caster.value ? spellStats(caster.value) : undefined))
const attack = computed(() => fromSheet.value?.attack ?? book.value.attackBonus)
const dc = computed(() => fromSheet.value?.dc ?? book.value.saveDC)
const editSlots = ref(false)
/** The slot rows: worked out from the character's classes (or typed), pact slots, Mystic Arcanum. */
const rows = computed(() => slotRows(book.value, owner.value))
/** A character with classes: the counts are the rules' unless typed in. */
const classesKnown = computed(() => !!owner.value && classesOf(owner.value).length > 0)
const shownSlots = computed(() => rows.value.filter(r => r.kind !== 'arcanum' && (editSlots.value || r.max > 0)))
const arcana = computed(() => rows.value.filter(r => r.kind === 'arcanum'))
const rowLabel = (r: SlotRow) => (r.kind === 'pact' ? `Pact · ${ORD[r.level - 1]}` : ORD[r.level - 1])

// ---- changes ----
function setNum(key: 'attackBonus' | 'saveDC' | 'preparedMax', v: string) {
  const n = v.trim() === '' ? undefined : Number(v)
  if (n === undefined || Number.isFinite(n)) { book.value[key] = n; touch() }
}
/** A typed count. With classes it replaces the rules' count (↺ goes back); without, it is the count. */
function setMax(r: SlotRow, v: string) {
  const n = Math.max(0, Math.min(9, Math.floor(Number(v) || 0)))
  if (classesKnown.value && r.kind === 'slot' && r.rule == null && n === r.max) return
  setSlotCount(book.value, r, n)
  touch()
}
function resetMax(r: SlotRow) { setSlotCount(book.value, r, null); touch() }
/** Pip p of a row: filled pips are slots left. Clicking a filled one spends it, an empty one gives it back. */
function pip(r: SlotRow, p: number) {
  useSlot(book.value, r, p < r.max - r.used ? 1 : -1)
  touch()
}
/** A character's long rest is the whole one (HP and hit dice too); the world's book only gets its slots back. */
function rest() {
  if (owner.value) { longRest(owner.value); return }
  restSlots(book.value, 'long')
  touch()
}
/** Cast a levelled spell: spend a slot of its level, or the lowest higher one left. */
function cast(e: Entry) {
  const r = slotFor(rows.value, Number(e.fields.level))
  if (!r) return
  useSlot(book.value, r, 1)
  touch()
}
const canCast = (e: Entry) => {
  const lvl = Number(e.fields.level)
  return lvl > 0 && !!slotFor(rows.value, lvl)
}
// ---- spells from the items the character uses (gear.ts): cast for charges, once per rest, at will, or prepared ----
const granted = computed(() => (owner.value ? grantedSpells(sheetOf(owner.value)) : []))
const castItem = (g: GrantedSpell) => { if (owner.value) editSheet(owner.value, s => castFromItem(s, g)) }
const giveBack = (g: GrantedSpell) => { if (owner.value) editSheet(owner.value, s => unuse(s, g)) }
const shortRest = () => { if (owner.value) editSheet(owner.value, s => { restItems(s, 'short'); restSlots(s.spellbook, 'short') }) }
const hasShort = computed(() => granted.value.some(g => g.spell.how === 'short') || rows.value.some(r => r.kind === 'pact'))

// ---- known / prepared ----
function learn(id: Id) { if (!book.value.known.includes(id)) { book.value.known.push(id); touch() } }
function forget(id: Id) {
  const b = book.value
  b.known = b.known.filter(x => x !== id); b.prepared = b.prepared.filter(x => x !== id); b.always = b.always.filter(x => x !== id)
  touch()
}
const isPrepared = (id: Id) => book.value.prepared.includes(id) || book.value.always.includes(id)
function prepare(id: Id) { learn(id); if (!isPrepared(id)) { book.value.prepared.push(id); touch() } }
function unprepare(id: Id) { book.value.prepared = book.value.prepared.filter(x => x !== id); book.value.always = book.value.always.filter(x => x !== id); touch() }
/** Always prepared <-> prepared (always-prepared spells don't count against the limit). */
function toggleAlways(id: Id) {
  const b = book.value
  if (b.always.includes(id)) { b.always = b.always.filter(x => x !== id); b.prepared.push(id) }
  else { b.prepared = b.prepared.filter(x => x !== id); b.always.push(id) }
  touch()
}

// ---- lists ----
const levelOf = (e: Entry) => (e.fields.level === 'Cantrip' ? 0 : Number(e.fields.level) || 0)
const spells = (ids: Id[]) => ids.map(id => get(id)).filter((e): e is Entry => !!e)
  .sort((a, b) => levelOf(a) - levelOf(b) || a.name.localeCompare(b.name))
const knownList = computed(() => spells(book.value.known))
const preparedList = computed(() => spells([...book.value.always, ...book.value.prepared]))
/** What the spell asks for, with this caster's numbers filled in. */
function check(e: Entry) {
  const f = e.fields
  if (f.spellType === 'Saving throw') return `${f.savingThrow ? optionLabel('ability', f.savingThrow).slice(0, 3).toUpperCase() + ' ' : ''}save DC ${dc.value ?? '?'}`
  if (f.spellType === 'Attack') return `Spell attack ${attack.value != null ? (attack.value >= 0 ? '+' : '') + attack.value : '?'}`
  return optionLabel('spell.spellType', f.spellType)
}
const alwaysTitle = (id: Id) => (book.value.always.includes(id)
  ? "Always prepared (doesn't count). Click to make it a normal prepared spell"
  : 'Make it always prepared')

// ---- drag and drop between the columns ----
const dragging = ref<{ id: Id; from: 'known' | 'prepared' } | null>(null)
const over = ref<'known' | 'prepared' | null>(null)
function dragStart(ev: DragEvent, id: Id, from: 'known' | 'prepared') {
  dragging.value = { id, from }
  ev.dataTransfer?.setData('text/plain', id)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}
function dragEnd() { dragging.value = null; over.value = null }
function dragOver(ev: DragEvent, to: 'known' | 'prepared') {
  if (!dragging.value || dragging.value.from === to) return
  ev.preventDefault()
  over.value = to
}
function drop(to: 'known' | 'prepared') {
  const d = dragging.value
  if (d && d.from !== to) { if (to === 'prepared') prepare(d.id); else unprepare(d.id) }
  dragEnd()
}

// ---- spell pop-up: a plain click opens it; middle-click, Ctrl/Cmd/Shift-click or "open in new tab" use the link ----
const shown = ref<Id | null>(null)
const shownEntry = computed(() => (shown.value ? get(shown.value) : undefined))
function openSpell(ev: MouseEvent, id: Id) {
  if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return
  ev.preventDefault()
  shown.value = id
}
const levelLabel = (e: Entry) => (levelOf(e) ? ORD[levelOf(e) - 1] : 'Cantrip')
/** The known spells matching the search box. */
const knownQ = ref('')
const knownShown = computed(() => { const q = knownQ.value.trim().toLowerCase(); return q ? knownList.value.filter(e => e.name.toLowerCase().includes(q)) : knownList.value })
const full = computed(() => book.value.preparedMax != null && book.value.prepared.length > book.value.preparedMax)
</script>

<template>
  <div class="spellbook">
    <header class="list-head">
      <h1 v-if="!pc"><span class="icon"><AppIcon ui="spellbook" /></span>Spellbook<span v-if="owner" class="head-of">of <EntryLink :id="owner.id" /></span></h1>
      <div class="row-btns">
        <button v-if="hasShort" title="Pact slots and once-per-short-rest item spells back" @click="shortRest"><AppIcon ui="shortRest" /> Short rest</button>
        <button :title="owner ? 'Full HP, every spell slot and half the hit dice back' : 'Every spell slot back'" @click="rest"><AppIcon ui="longRest" /> {{ owner ? 'Long rest' : 'Restore spell slots' }}</button>
        <button @click="newEntry('spell')">＋ New spell</button>
      </div>
    </header>

    <div class="sbk-top">
      <section class="card sbk-stats">
        <h3>Spellcasting
          <span v-if="fromSheet" class="muted small" title="From the character sheet">{{ fromSheet.ability.toUpperCase() }}</span>
          <span v-else-if="caster" class="muted small" title="The character sheet has no casting ability yet: the numbers are typed here">no casting ability</span>
          <span v-else class="muted small" title="No current character: make one current on their sheet to use their spellbook and numbers">world's book</span>
        </h3>
        <template v-if="fromSheet">
          <label><span>Spell attack</span><b>{{ fromSheet.attack >= 0 ? '+' : '' }}{{ fromSheet.attack }}</b></label>
          <label><span>Save DC</span><b>{{ fromSheet.dc }}</b></label>
        </template>
        <template v-else>
          <label><span>Spell attack</span><input type="number" :value="book.attackBonus" @change="setNum('attackBonus', ($event.target as HTMLInputElement).value)" /></label>
          <label><span>Save DC</span><input type="number" :value="book.saveDC" @change="setNum('saveDC', ($event.target as HTMLInputElement).value)" /></label>
        </template>
        <label><span>Prepared</span><b :class="{ over: full }">{{ book.prepared.length }}</b> / <input type="number" min="0" :value="book.preparedMax" @change="setNum('preparedMax', ($event.target as HTMLInputElement).value)" /></label>
      </section>

      <section class="card sbk-slots">
        <h3>Spell slots <button class="link-btn" @click="editSlots = !editSlots">{{ editSlots ? 'Done' : 'Edit' }}</button></h3>
        <div class="slot-cols">
        <div v-for="s in shownSlots" :key="s.key" class="slot-row" :class="{ pact: s.kind === 'pact' }">
          <span class="slot-lvl" :title="s.kind === 'pact' ? 'Warlock pact slots: all of this level, back on a short rest' : undefined">{{ rowLabel(s) }}</span>
          <span class="pips">
            <button v-for="p in s.max" :key="p" class="pip" :class="{ on: p - 1 < s.max - s.used }"
                    :title="p - 1 < s.max - s.used ? 'Spend this slot' : 'Get this slot back'" @click="pip(s, p - 1)" />
          </span>
          <span class="slot-left">{{ s.max - s.used }} / {{ s.max }}</span>
          <template v-if="editSlots">
            <input class="slot-max" type="number" min="0" max="9" :value="s.max" :title="classesKnown ? 'Slots of this level: typing a number replaces the one from the class levels' : 'Slots of this level'" @change="setMax(s, ($event.target as HTMLInputElement).value)" />
            <button v-if="s.rule != null" class="link-btn small" :title="`Back to the class levels' ${s.rule}`" @click="resetMax(s)">↺ {{ s.rule }}</button>
          </template>
          <span v-else-if="s.rule != null" class="slot-own" :title="`Typed in; the class levels give ${s.rule}`">✎</span>
        </div>
        <div v-for="a in arcana" :key="a.key" class="slot-row arcanum">
          <span class="slot-lvl" title="Mystic Arcanum: one casting of a spell of this level per long rest">Arcanum · {{ ORD[a.level - 1] }}</span>
          <span class="pips"><button class="pip" :class="{ on: !a.used }" :title="a.used ? 'Get it back' : 'Use it'" @click="pip(a, 0)" /></span>
          <span class="slot-left">{{ 1 - a.used }} / 1</span>
        </div>
        </div>
        <p v-if="!shownSlots.length && !arcana.length" class="muted small">{{ classesKnown ? 'Their classes give no spell slots.' : 'No slots yet: click Edit to set them.' }}</p>
        <p v-else-if="classesKnown && !editSlots" class="muted small slot-src">From the class levels{{ rows.some(r => r.rule != null) ? ', with typed changes (✎)' : '' }}.</p>
      </section>
    </div>

    <div class="sbk-columns">
      <section class="card sbk-list drop-zone" :class="{ over: over === 'known' }"
               @dragover="dragOver($event, 'known')" @dragleave.self="over = null" @drop.prevent="drop('known')">
        <h3>Known spells <span class="muted small">{{ knownList.length }}</span>
          <input v-if="knownList.length > 1" v-model="knownQ" class="sbk-search" type="search" placeholder="Find…" aria-label="Find a known spell" />
        </h3>
        <div v-if="knownList.length" class="sbk-scroll">
        <table class="grid">
          <thead><tr><th>Spell</th><th>Level</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in knownShown" :key="e.id" :class="{ dim: isPrepared(e.id), dragging: dragging?.id === e.id }"
                :draggable="!isPrepared(e.id)" :title="isPrepared(e.id) ? '' : 'Drag to Prepared spells'"
                @dragstart="dragStart($event, e.id, 'known')" @dragend="dragEnd">
              <td><a :href="hrefEntry(e.id)" class="spell-link" @click="openSpell($event, e.id)">{{ e.name }}</a></td>
              <td>{{ levelLabel(e) }}</td>
              <td class="sbk-actions">
                <span v-if="isPrepared(e.id)" class="muted small">prepared</span>
                <span v-else class="drag-handle" aria-hidden="true">⠿</span>
                <button class="link-btn x" title="Remove from the spellbook" @click="forget(e.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!knownShown.length" class="muted small">No known spell matches.</p>
        </div>
        <p v-else class="muted small">No spells in the book yet.</p>
        <EntryPicker add :types="['spell']" :exclude="book.known" placeholder="Add a spell to the book…" @pick="learn" />
      </section>

      <!-- the right-hand column: prepared spells, then the spells the character's items grant -->
      <div class="sbk-col">
      <section class="card sbk-list drop-zone" :class="{ over: over === 'prepared' }"
               @dragover="dragOver($event, 'prepared')" @dragleave.self="over = null" @drop.prevent="drop('prepared')">
        <h3>Prepared spells <span class="muted small" :class="{ over: full }">{{ book.prepared.length }}<template v-if="book.preparedMax != null"> / {{ book.preparedMax }}</template><template v-if="book.always.length"> + {{ book.always.length }} always</template></span></h3>
        <table v-if="preparedList.length" class="grid">
          <thead><tr><th>Spell</th><th>Level</th><th>School</th><th>Casting time</th><th>Range</th><th>Duration</th><th>Attack / save</th><th title="Concentration · Ritual">C/R</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in preparedList" :key="e.id" :class="{ dragging: dragging?.id === e.id }" draggable="true"
                title="Drag back to Known spells to unprepare" @dragstart="dragStart($event, e.id, 'prepared')" @dragend="dragEnd">
              <td>
                <button class="link-btn always" :class="{ on: book.always.includes(e.id) }" :title="alwaysTitle(e.id)" @click="toggleAlways(e.id)"><AppIcon ui="star" /></button>
                <a :href="hrefEntry(e.id)" class="spell-link" @click="openSpell($event, e.id)">{{ e.name }}</a>
              </td>
              <td>{{ levelLabel(e) }}</td>
              <td>{{ optionLabel('spell.school', e.fields.school) }}</td>
              <td>{{ e.fields.castingTime ?? '' }}</td>
              <td>{{ e.fields.range ?? '' }}</td>
              <td>{{ e.fields.duration ?? '' }}</td>
              <td class="sbk-check">{{ check(e) }}</td>
              <td>{{ [e.fields.concentration && 'C', e.fields.ritual && 'R'].filter(Boolean).join(' ') }}</td>
              <td class="sbk-actions">
                <button v-if="levelOf(e)" class="chip-btn" :disabled="!canCast(e)" :title="canCast(e) ? 'Spend a slot of this level (or the next free higher one)' : 'No slot left for this level'" @click="cast(e)">Cast</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted small drop-hint">Drag spells here from Known spells to prepare them.</p>
      </section>
      <section v-if="granted.length" class="card sbk-list sbk-items">
        <h3>From items <span class="muted small">{{ granted.length }}</span>

        </h3>
        <table class="grid">
          <thead><tr><th>Spell</th><th>Level</th><th>Item</th><th>How</th><th>Casting time</th><th>Range</th><th>Attack / save</th><th></th></tr></thead>
          <tbody>
            <tr v-for="g in granted" :key="g.i + '-' + g.k" :class="{ dim: !g.ready }">
              <td><a :href="hrefEntry(g.spell.spell)" class="spell-link" @click="openSpell($event, g.spell.spell)">{{ get(g.spell.spell)!.name }}</a></td>
              <td>{{ levelLabel(get(g.spell.spell)!) }}</td>
              <td><EntryLink :id="g.item.id" /></td>
              <td>{{ g.status }}</td>
              <td>{{ get(g.spell.spell)!.fields.castingTime ?? '' }}</td>
              <td>{{ get(g.spell.spell)!.fields.range ?? '' }}</td>
              <td class="sbk-check">{{ check(get(g.spell.spell)!) }}</td>
              <td class="sbk-actions">
                <template v-if="g.spell.how === 'prepared'"><span class="muted small" title="Cast with your own spell slots, from Prepared spells' Cast or the slots above">own slots</span></template>
                <template v-else-if="g.spell.how === 'atWill'"><span class="muted small">at will</span></template>
                <button v-else-if="g.ready" class="chip-btn" :title="g.spell.how === 'charges' ? 'Spend the charges' : 'Mark it used until the rest'" @click="castItem(g)">Cast</button>
                <button v-else-if="g.spell.how !== 'charges'" class="link-btn small" title="Give this use back" @click="giveBack(g)">↺</button>
                <span v-else class="muted small">no charges</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      </div>
    </div>

    <SpellModal v-if="shown" :id="shown" @close="shown = null">
      <template #actions>
        <button v-if="!isPrepared(shown)" class="chip-btn" @click="prepare(shown!)">Prepare</button>
        <template v-else>
          <button v-if="shownEntry && levelOf(shownEntry)" class="chip-btn" :disabled="!canCast(shownEntry)" @click="cast(shownEntry)">Cast</button>
          <button class="chip-btn" @click="unprepare(shown!)">Unprepare</button>
        </template>
      </template>
    </SpellModal>
  </div>
</template>
