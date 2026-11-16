<script setup lang="ts">
// The caster's spellbook: attack bonus and save DC, spell slots to tick off, and the prepared spells
// with their attack or save worked out. Replaces the Obsidian "Spell Tome" note.
import { computed, ref } from 'vue'
import type { Entry, Id, Spellbook } from '../model/types'
import { db, get, touch } from '../store'
import { newEntry } from '../ui'
import { hrefEntry } from '../router'
import SpellModal from '../components/SpellModal.vue'
import EntryPicker from '../components/edit/EntryPicker.vue'

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

const book = computed<Spellbook>(() => {
  const d = db()
  if (!d.spellbook) d.spellbook = { slots: ORD.map(() => ({ max: 0, used: 0 })), known: [], prepared: [], always: [] }
  return d.spellbook
})
const editSlots = ref(false)
const shownSlots = computed(() => book.value.slots.map((s, i) => ({ ...s, i })).filter(s => editSlots.value || s.max > 0))

// ---- changes ----
function setNum(key: 'attackBonus' | 'saveDC' | 'preparedMax', v: string) {
  const n = v.trim() === '' ? undefined : Number(v)
  if (n === undefined || Number.isFinite(n)) { book.value[key] = n; touch() }
}
function setMax(i: number, v: string) {
  const s = book.value.slots[i]
  s.max = Math.max(0, Math.min(9, Math.floor(Number(v) || 0)))
  s.used = Math.min(s.used, s.max)
  touch()
}
/** Pip p of a level: filled pips are slots left. Clicking a filled one spends it, an empty one gives it back. */
function pip(i: number, p: number) {
  const s = book.value.slots[i]
  const left = s.max - s.used
  s.used = p < left ? s.used + 1 : s.used - 1
  touch()
}
function longRest() { for (const s of book.value.slots) s.used = 0; touch() }
/** Cast a levelled spell: spend a slot of its level, or the lowest higher one left. */
function cast(e: Entry) {
  const lvl = Number(e.fields.level)
  const i = book.value.slots.findIndex((s, k) => k >= lvl - 1 && s.used < s.max)
  if (i < 0) return
  book.value.slots[i].used++
  touch()
}
const canCast = (e: Entry) => {
  const lvl = Number(e.fields.level)
  return lvl > 0 && book.value.slots.some((s, k) => k >= lvl - 1 && s.used < s.max)
}
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
  if (f.spellType === 'Saving throw') return `${f.savingThrow ? String(f.savingThrow).slice(0, 3).toUpperCase() + ' ' : ''}save DC ${book.value.saveDC ?? '?'}`
  if (f.spellType === 'Attack') return `Spell attack ${book.value.attackBonus != null ? (book.value.attackBonus >= 0 ? '+' : '') + book.value.attackBonus : '?'}`
  return String(f.spellType ?? '')
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
const full = computed(() => book.value.preparedMax != null && book.value.prepared.length > book.value.preparedMax)
</script>

<template>
  <div class="spellbook">
    <header class="list-head">
      <h1><span class="icon">📖</span>Spellbook</h1>
      <div class="row-btns">
        <button title="Every slot back" @click="longRest">🌙 Long rest</button>
        <button @click="newEntry('spell')">＋ New spell</button>
      </div>
    </header>

    <div class="sbk-top">
      <section class="card sbk-stats">
        <h3>Spellcasting</h3>
        <label><span>Spell attack</span><input type="number" :value="book.attackBonus" @change="setNum('attackBonus', ($event.target as HTMLInputElement).value)" /></label>
        <label><span>Save DC</span><input type="number" :value="book.saveDC" @change="setNum('saveDC', ($event.target as HTMLInputElement).value)" /></label>
        <label><span>Prepared</span><b :class="{ over: full }">{{ book.prepared.length }}</b> / <input type="number" min="0" :value="book.preparedMax" @change="setNum('preparedMax', ($event.target as HTMLInputElement).value)" /></label>
      </section>

      <section class="card sbk-slots">
        <h3>Spell slots <button class="link-btn" @click="editSlots = !editSlots">{{ editSlots ? 'Done' : 'Edit' }}</button></h3>
        <div class="slot-cols">
        <div v-for="s in shownSlots" :key="s.i" class="slot-row">
          <span class="slot-lvl">{{ ORD[s.i] }}</span>
          <span class="pips">
            <button v-for="p in s.max" :key="p" class="pip" :class="{ on: p - 1 < s.max - s.used }"
                    :title="p - 1 < s.max - s.used ? 'Spend this slot' : 'Get this slot back'" @click="pip(s.i, p - 1)" />
          </span>
          <span class="slot-left">{{ s.max - s.used }} / {{ s.max }}</span>
          <input v-if="editSlots" class="slot-max" type="number" min="0" max="9" :value="s.max" title="Slots of this level" @change="setMax(s.i, ($event.target as HTMLInputElement).value)" />
        </div>
        </div>
        <p v-if="!shownSlots.length" class="muted small">No slots yet: click Edit to set them.</p>
      </section>
    </div>

    <div class="sbk-columns">
      <section class="card sbk-list drop-zone" :class="{ over: over === 'known' }"
               @dragover="dragOver($event, 'known')" @dragleave.self="over = null" @drop.prevent="drop('known')">
        <h3>Known spells <span class="muted small">{{ knownList.length }}</span></h3>
        <table v-if="knownList.length" class="grid">
          <thead><tr><th>Spell</th><th>Level</th><th>School</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in knownList" :key="e.id" :class="{ dim: isPrepared(e.id), dragging: dragging?.id === e.id }"
                :draggable="!isPrepared(e.id)" :title="isPrepared(e.id) ? '' : 'Drag to Prepared spells'"
                @dragstart="dragStart($event, e.id, 'known')" @dragend="dragEnd">
              <td><a :href="hrefEntry(e.id)" class="spell-link" @click="openSpell($event, e.id)">{{ e.name }}</a></td>
              <td>{{ levelLabel(e) }}</td>
              <td>{{ e.fields.school ?? '' }}</td>
              <td class="sbk-actions">
                <span v-if="isPrepared(e.id)" class="muted small">prepared</span>
                <span v-else class="drag-handle" aria-hidden="true">⠿</span>
                <button class="link-btn x" title="Remove from the spellbook" @click="forget(e.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted small">No spells in the book yet.</p>
        <EntryPicker add :types="['spell']" :exclude="book.known" placeholder="Add a spell to the book…" @pick="learn" />
      </section>

      <section class="card sbk-list drop-zone" :class="{ over: over === 'prepared' }"
               @dragover="dragOver($event, 'prepared')" @dragleave.self="over = null" @drop.prevent="drop('prepared')">
        <h3>Prepared spells <span class="muted small" :class="{ over: full }">{{ book.prepared.length }}<template v-if="book.preparedMax != null"> / {{ book.preparedMax }}</template><template v-if="book.always.length"> + {{ book.always.length }} always</template></span></h3>
        <table v-if="preparedList.length" class="grid">
          <thead><tr><th>Spell</th><th>Level</th><th>Attack / save</th><th title="Concentration · Ritual">C/R</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in preparedList" :key="e.id" :class="{ dragging: dragging?.id === e.id }" draggable="true"
                title="Drag back to Known spells to unprepare" @dragstart="dragStart($event, e.id, 'prepared')" @dragend="dragEnd">
              <td>
                <button class="link-btn always" :class="{ on: book.always.includes(e.id) }" :title="alwaysTitle(e.id)" @click="toggleAlways(e.id)">★</button>
                <a :href="hrefEntry(e.id)" class="spell-link" @click="openSpell($event, e.id)">{{ e.name }}</a>
              </td>
              <td>{{ levelLabel(e) }}</td>
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
