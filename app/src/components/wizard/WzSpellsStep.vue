<script setup lang="ts">
// The wizard's spells step: a tab per spell level (Cantrips, 1st, 2nd… with how many are taken), the level's spells as
// small tiles (name, school, what it rolls or the save, casting time if not an action, C and R), a name filter and
// Damage / Healing / Utility chips, and beside them the card of the spell looked at. A click looks at a spell; a
// second click (or the card's button) takes it. A cantrip is taken; a spell is prepared (a class without a book), or
// for a Wizard goes into the spellbook, prepared too while prepared spells are left. Preparing is optional: the
// Spellbook does it later as well.
import { computed, ref } from 'vue'
import type { Entry, Id } from '../../model/types'
import { ownedSpells, spellChoices, spellCounts, wizard } from '../../wizard'
import { ORD } from '../../model/dnd'
import { rollsOf, saveText } from '../../spells'
import { get } from '../../store'
import { hrefEntry } from '../../router'
import { useDraft } from '../../composables/useDraft'
import EntryLink from '../EntryLink.vue'
import SpellCard from '../SpellCard.vue'

const { d } = useDraft()
const sc = computed(() => spellChoices(d.value))
const counts = computed(() => spellCounts(d.value))
/** The name filter, kept by the wizard while it's open (going to another step and back keeps it). */
const spellFilter = defineModel<string>('filter', { default: '' })
const isCantrip = (id: Id) => sc.value.cantrips.some(e => e.id === id)
/** Why the last pick did nothing (everything of its kind taken), for the line above the list. */
const full = ref('')
function toggleSpell(key: 'cantrips' | 'spells' | 'book', id: Id, max?: number) {
  const l = d.value[key]
  if (l.includes(id)) { wizard.d[key] = l.filter(x => x !== id); full.value = ''; return }
  // all taken: say so (nothing happens otherwise)
  if (max != null && l.length >= max) { full.value = `${max} of ${max} ${key === 'cantrips' ? 'cantrips' : key === 'book' ? 'spellbook spells' : 'prepared spells'} taken: take one back to choose another.`; return }
  full.value = ''
  if (key === 'spells') wizard.d.book = d.value.book.filter(x => x !== id)
  if (key === 'book') wizard.d.spells = d.value.spells.filter(x => x !== id)
  wizard.d[key] = [...l, id]
}
/** The spells the character has already from elsewhere (species, background, feats, class features). */
const owned = computed(() => ownedSpells(d.value))
const hasIt = (id: Id) => owned.value.get(id)?.join(', ')
const picked = computed(() => [...d.value.cantrips, ...d.value.spells, ...d.value.book])
const isPicked = (id: Id) => picked.value.includes(id)

// ---- the level tabs ----
interface Tab { key: string; label: string; list: Entry[]; taken: number; open: boolean }
const tabs = computed<Tab[]>(() => {
  const out: Tab[] = []
  if (counts.value.cantrips !== 0 && sc.value.cantrips.length) {
    const left = counts.value.cantrips != null && d.value.cantrips.length < counts.value.cantrips
    out.push({ key: 'c', label: `Cantrips ${d.value.cantrips.length}${counts.value.cantrips != null ? ` / ${counts.value.cantrips}` : ''}`, list: sc.value.cantrips, taken: d.value.cantrips.length, open: left })
  }
  const bookLeft = bookCaster.value && Math.min(counts.value.book!, sc.value.spells.length) > d.value.spells.length + d.value.book.length
  for (const lv of [...new Set(sc.value.spells.map(e => Number(e.fields.level)))].sort((a, b) => a - b)) {
    const list = sc.value.spells.filter(e => Number(e.fields.level) === lv)
    const taken = list.filter(e => isPicked(e.id)).length
    out.push({ key: String(lv), label: `${ORD[lv]}${taken ? ` · ${taken}` : ''}`, list, taken, open: bookLeft })
  }
  return out
})
const tabKey = ref<string | null>(null)
/** The tab shown: the one clicked, else the first with something still to take, else the first. */
const tab = computed(() => tabs.value.find(x => x.key === tabKey.value) ?? tabs.value.find(x => x.open) ?? tabs.value[0])

// ---- what each spell does, in short, and the Damage / Healing / Utility chips ----
type Sort = 'damage' | 'healing' | 'utility'
function sortOf(e: Entry): Sort {
  const rolls = rollsOf(e)
  if (rolls.some(r => r.kind === 'damage')) return 'damage'
  if (rolls.length || e.fields.spellType === 'Healing') return 'healing'
  if (/\b\d+d\d+\b[^.]{0,40}\bdamage\b/i.test(String(e.fields.summary ?? ''))) return 'damage'
  return 'utility'
}
const sortFilter = ref<Sort | ''>('')
const SCHOOL: Record<string, string> = { Abjuration: 'Abj', Conjuration: 'Conj', Divination: 'Div', Enchantment: 'Ench', Evocation: 'Evoc', Illusion: 'Illus', Necromancy: 'Necro', Transmutation: 'Trans' }
/** The tile's facts: school, its dice or save, casting time when not an action, C and R. */
function facts(e: Entry): string[] {
  const out: string[] = []
  const school = String(e.fields.school ?? '')
  if (school) out.push(SCHOOL[school] ?? school.slice(0, 5))
  const dmg = rollsOf(e).find(r => r.kind === 'damage'), heal = rollsOf(e).find(r => r.kind !== 'damage')
  const save = saveText(e)
  if (save) out.push(save)
  else if (e.fields.spellType === 'Attack') out.push('attack')
  if (dmg) out.push(dmg.dice)
  else if (heal) out.push(`heal ${heal.dice}`)
  const cast = String(e.fields.castingTime ?? '').toLowerCase()
  if (/reaction/.test(cast)) out.push('reaction')
  else if (/bonus/.test(cast)) out.push('bonus')
  else if (/minute|hour/.test(cast)) out.push(cast.split(',')[0])
  if (e.fields.concentration) out.push('C')
  if (e.fields.ritual) out.push('R')
  return out
}
const tiles = computed(() => {
  const q = spellFilter.value.trim().toLowerCase()
  return (tab.value?.list ?? []).filter(e => (!q || e.name.toLowerCase().includes(q)) && (!sortFilter.value || sortOf(e) === sortFilter.value))
    .slice().sort((a, b) => a.name.localeCompare(b.name))
})

// ---- looking and taking: a click looks, a second click takes (or the card's button) ----
const looked = ref<Id | null>(null)
const lookedEntry = computed(() => (looked.value ? get(looked.value) : undefined))
function clickTile(id: Id) { if (looked.value === id) pick(id); else looked.value = id }
function keyTile(ev: KeyboardEvent, id: Id) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); looked.value = id; pick(id) } }
/** What's still to pick in the list (cantrips; a Wizard's spellbook spells), for its tag. */
const spellsLeft = computed(() => {
  const c = counts.value.cantrips != null ? counts.value.cantrips - d.value.cantrips.length : 0
  const b = counts.value.book != null ? Math.min(counts.value.book, sc.value.spells.length) - d.value.spells.length - d.value.book.length : 0
  return [c > 0 && `${c} cantrip${c === 1 ? '' : 's'}`, b > 0 && `${b} spellbook spell${b === 1 ? '' : 's'}`].filter(Boolean).join(', ') + (c > 0 || b > 0 ? ' left' : '')
})
/** A spellbook class (Wizard): its spells go into the book. */
const bookCaster = computed(() => counts.value.book != null)
const inBook = (id: Id) => d.value.spells.includes(id) || d.value.book.includes(id)
/** A Wizard's click: into the book (prepared while there's room), or out of it. */
function toBook(id: Id) {
  if (inBook(id)) { wizard.d.spells = d.value.spells.filter(x => x !== id); wizard.d.book = d.value.book.filter(x => x !== id); full.value = ''; return }
  const max = counts.value.book!
  if (d.value.spells.length + d.value.book.length >= max) { full.value = `${max} of ${max} spellbook spells taken: take one out to choose another.`; return }
  full.value = ''
  if (counts.value.prepared == null || d.value.spells.length < counts.value.prepared) wizard.d.spells = [...d.value.spells, id]
  else wizard.d.book = [...d.value.book, id]
}
/** In the book: prepared, or only in the book. */
function togglePrepared(id: Id) {
  if (d.value.spells.includes(id)) { wizard.d.spells = d.value.spells.filter(x => x !== id); wizard.d.book = [...d.value.book, id]; full.value = ''; return }
  if (counts.value.prepared != null && d.value.spells.length >= counts.value.prepared) { full.value = `${counts.value.prepared} of ${counts.value.prepared} prepared spells taken: unprepare one first.`; return }
  full.value = ''
  wizard.d.book = d.value.book.filter(x => x !== id); wizard.d.spells = [...d.value.spells, id]
}
function pick(id: Id) {
  if (isCantrip(id)) toggleSpell('cantrips', id, counts.value.cantrips)
  else if (bookCaster.value) toBook(id)
  else toggleSpell('spells', id, counts.value.prepared)
}
</script>

<template>
  <div class="wz-spells">
    <div class="wz-sp-main">
      <p class="small wz-ch-top">
        <template v-if="counts.cantrips != null">{{ d.cantrips.length }} / {{ counts.cantrips }} cantrips · {{ d.spells.length }} / {{ counts.prepared }} prepared <span class="muted">(optional: the Spellbook prepares them later too)</span></template>
        <template v-else>{{ d.cantrips.length }} cantrips · {{ d.spells.length }} spells</template>
        <template v-if="sc.maxLevel"> · up to {{ ORD[sc.maxLevel] }} level</template>
        <template v-if="counts.book != null"> · spellbook {{ d.spells.length + d.book.length }} / {{ counts.book }}</template>
      </p>
      <p v-if="full" class="small wz-need-line" role="status">{{ full }}</p>
      <!-- a tab per level -->
      <div v-if="tabs.length" class="seg wz-sp-tabs" role="tablist" aria-label="Spell levels">
        <button v-for="x in tabs" :key="x.key" type="button" role="tab" :class="{ on: tab?.key === x.key, 'wz-todo': x.open }" :aria-selected="tab?.key === x.key" @click="tabKey = x.key">{{ x.label }}</button>
      </div>
      <!-- the name filter and what kind of spell -->
      <div class="wz-sp-filters">
        <input v-model="spellFilter" class="wz-filter" type="search" placeholder="Filter by name…" aria-label="Filter the spells by name" />
        <div class="seg" role="group" aria-label="Kind of spell">
          <button type="button" :class="{ on: !sortFilter }" @click="sortFilter = ''">All</button>
          <button type="button" :class="{ on: sortFilter === 'damage' }" @click="sortFilter = sortFilter === 'damage' ? '' : 'damage'">Damage</button>
          <button type="button" :class="{ on: sortFilter === 'healing' }" @click="sortFilter = sortFilter === 'healing' ? '' : 'healing'">Healing</button>
          <button type="button" :class="{ on: sortFilter === 'utility' }" @click="sortFilter = sortFilter === 'utility' ? '' : 'utility'">Utility</button>
        </div>
        <span class="muted small">{{ tiles.length }} shown · click to read, click again to take</span>
      </div>
      <!-- the level's spells as tiles -->
      <div class="wz-sp-grid" :class="{ 'wz-todo': tab?.open }" role="listbox" :aria-label="`${tab?.label ?? ''} spells`" aria-multiselectable="true">
        <button v-for="e in tiles" :key="e.id" type="button" class="wz-sp-tile" role="option" :aria-selected="isPicked(e.id)"
                :class="{ on: isPicked(e.id), looked: looked === e.id, had: !!hasIt(e.id) }" :title="hasIt(e.id) ? `Already has it: ${hasIt(e.id)}` : ''"
                @click="clickTile(e.id)" @keydown="keyTile($event, e.id)">
          <span class="wz-sp-name"><span class="wz-sp-tick">{{ isPicked(e.id) ? '✓' : '' }}</span>{{ e.name }}</span>
          <span class="wz-sp-facts">{{ facts(e).join(' · ') }}<template v-if="bookCaster && d.spells.includes(e.id)"> · prepared</template><template v-else-if="d.book.includes(e.id)"> · in the book</template></span>
        </button>
        <p v-if="!tiles.length" class="muted small">{{ sc.cantrips.length || sc.spells.length ? 'No spell matches.' : 'The world has no spells for this class (a spell\'s Classes field lists who can cast it).' }}</p>
      </div>
    </div>

    <!-- the spell looked at -->
    <div class="wz-ch-detail">
      <template v-if="lookedEntry">
        <div class="wz-spell-pick">
          <template v-if="isCantrip(lookedEntry.id)">
            <button type="button" class="chip-btn" :class="{ on: isPicked(lookedEntry.id), primary: !isPicked(lookedEntry.id) }" @click="toggleSpell('cantrips', lookedEntry.id, counts.cantrips)">{{ isPicked(lookedEntry.id) ? '✓ Cantrip taken' : 'Take this cantrip' }}</button>
          </template>
          <template v-else-if="bookCaster">
            <button type="button" class="chip-btn" :class="{ on: inBook(lookedEntry.id), primary: !inBook(lookedEntry.id) }" :title="inBook(lookedEntry.id) ? 'In the spellbook. Click to take it out' : 'Put it in the spellbook'" @click="toBook(lookedEntry.id)">{{ inBook(lookedEntry.id) ? '✓ In the spellbook' : 'Into the spellbook' }}</button>
            <button v-if="inBook(lookedEntry.id)" type="button" class="chip-btn" :class="{ on: d.spells.includes(lookedEntry.id) }" :title="d.spells.includes(lookedEntry.id) ? 'Prepared. Click to keep it in the book only' : 'Prepare it as well'" @click="togglePrepared(lookedEntry.id)">{{ d.spells.includes(lookedEntry.id) ? '✓ Prepared' : 'Prepare it' }}</button>
          </template>
          <button v-else type="button" class="chip-btn" :class="{ on: d.spells.includes(lookedEntry.id), primary: !d.spells.includes(lookedEntry.id) }" @click="toggleSpell('spells', lookedEntry.id, counts.prepared)">{{ d.spells.includes(lookedEntry.id) ? '✓ Prepared' : 'Prepare it' }}</button>
          <span v-if="hasIt(lookedEntry.id)" class="small muted">Already has it: {{ hasIt(lookedEntry.id) }}</span>
        </div>
        <h3 class="wz-page-head">{{ lookedEntry.name }} <a :href="hrefEntry(lookedEntry.id)" class="small" title="Its own page">open its page</a></h3>
        <SpellCard :e="lookedEntry" />
      </template>
      <div v-else class="wz-ch-intro">
        <p>Click a spell to read it here; click it again, or the button above its card, to take it.</p>
        <p class="muted small">The tabs hold each level; the chips show only spells that deal damage, heal, or do neither.</p>
      </div>
      <p v-if="owned.size" class="small muted">Already has: <template v-for="([id, from], i) in [...owned]" :key="id"><template v-if="i">, </template><EntryLink :id="id" /> ({{ from.join(', ') }})</template></p>
    </div>
  </div>
</template>
