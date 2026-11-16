<script setup lang="ts">
// The caster's spellbook: attack bonus and save DC, spell slots to tick off, and the prepared spells
// with their attack or save worked out. Replaces the Obsidian "Spell Tome" note.
import { computed, ref } from 'vue'
import type { Entry, Id, Spellbook } from '../model/types'
import { db, get, touch } from '../store'
import { newEntry } from '../ui'
import EntryLink from '../components/EntryLink.vue'
import EntryPicker from '../components/edit/EntryPicker.vue'

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

const book = computed<Spellbook>(() => {
  const d = db()
  if (!d.spellbook) d.spellbook = { slots: ORD.map(() => ({ max: 0, used: 0 })), prepared: [], always: [] }
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
function add(list: 'prepared' | 'always', id: Id) {
  if (book.value.prepared.includes(id) || book.value.always.includes(id)) return
  book.value[list].push(id)
  touch()
}
function remove(list: 'prepared' | 'always', id: Id) { book.value[list] = book.value[list].filter(x => x !== id); touch() }
function move(id: Id, to: 'prepared' | 'always') {
  const from = to === 'always' ? 'prepared' : 'always'
  book.value[from] = book.value[from].filter(x => x !== id)
  book.value[to].push(id)
  touch()
}

// ---- tables ----
const levelOf = (e: Entry) => (e.fields.level === 'Cantrip' ? 0 : Number(e.fields.level) || 0)
const spells = (ids: Id[]) => ids.map(id => get(id)).filter((e): e is Entry => !!e)
  .sort((a, b) => levelOf(a) - levelOf(b) || a.name.localeCompare(b.name))
const groups = computed(() => [
  { key: 'always' as const, title: 'Always prepared', list: spells(book.value.always) },
  { key: 'prepared' as const, title: 'Prepared', list: spells(book.value.prepared) },
])
/** What the spell asks for, with this caster's numbers filled in. */
function check(e: Entry) {
  const f = e.fields
  if (f.spellType === 'Saving throw') return `${f.savingThrow ? String(f.savingThrow).slice(0, 3).toUpperCase() + ' ' : ''}save DC ${book.value.saveDC ?? '?'}`
  if (f.spellType === 'Attack') return `Spell attack ${book.value.attackBonus != null ? (book.value.attackBonus >= 0 ? '+' : '') + book.value.attackBonus : '?'}`
  return String(f.spellType ?? '')
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

    <section v-for="g in groups" :key="g.key" class="card sbk-list">
      <h3>{{ g.title }} <span class="muted small">{{ g.list.length }}</span></h3>
      <table v-if="g.list.length" class="grid">
        <thead><tr><th>Spell</th><th>Level</th><th>School</th><th>Casting time</th><th>Range</th><th>Attack / save</th><th title="Concentration">C</th><th title="Ritual">R</th><th></th></tr></thead>
        <tbody>
          <tr v-for="e in g.list" :key="e.id">
            <td><EntryLink :id="e.id" /></td>
            <td>{{ levelLabel(e) }}</td>
            <td>{{ e.fields.school ?? '' }}</td>
            <td>{{ e.fields.castingTime ?? '' }}</td>
            <td>{{ e.fields.range ?? '' }}</td>
            <td class="sbk-check">{{ check(e) }}</td>
            <td>{{ e.fields.concentration ? 'C' : '' }}</td>
            <td>{{ e.fields.ritual ? 'R' : '' }}</td>
            <td class="sbk-actions">
              <button v-if="levelOf(e)" class="chip-btn" :disabled="!canCast(e)" :title="canCast(e) ? 'Spend a slot of this level (or the next free higher one)' : 'No slot left for this level'" @click="cast(e)">Cast</button>
              <button class="link-btn" :title="g.key === 'always' ? 'Make it a normal prepared spell' : 'Always prepared'" @click="move(e.id, g.key === 'always' ? 'prepared' : 'always')">{{ g.key === 'always' ? '↓' : '↑' }}</button>
              <button class="link-btn x" title="Remove from the spellbook" @click="remove(g.key, e.id)">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted small">None yet.</p>
      <EntryPicker add :types="['spell']" :exclude="[...book.prepared, ...book.always]" :placeholder="`Add to ${g.title.toLowerCase()}: type a spell…`" @pick="(id: string) => add(g.key, id)" />
    </section>
  </div>
</template>
