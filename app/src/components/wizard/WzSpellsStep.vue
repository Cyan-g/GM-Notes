<script setup lang="ts">
// The wizard's spells step: the class's cantrips and spells as a list grouped by level (the counts and a name filter
// above it, a ✓ by those the character already has from elsewhere), and the spell looked at beside it as its card.
// Clicking a cantrip takes it. Clicking a spell prepares it (a class without a book); a Wizard's goes into the
// spellbook, prepared too while prepared spells are left (the card's buttons change that). Preparing is optional:
// the Spellbook does it later as well.
import { computed, ref } from 'vue'
import type { Entry, Id } from '../../model/types'
import { ownedSpells, spellChoices, spellCounts, wizard } from '../../wizard'
import { ORD } from '../../model/dnd'
import { get } from '../../store'
import { hrefEntry } from '../../router'
import { useDraft } from '../../composables/useDraft'
import EntryLink from '../EntryLink.vue'
import SpellCard from '../SpellCard.vue'
import WzChooser, { type ChooserItem } from './WzChooser.vue'

const { d } = useDraft()
const sc = computed(() => spellChoices(d.value))
const counts = computed(() => spellCounts(d.value))
/** The name filter, kept by the wizard while it's open (going to another step and back keeps it). */
const spellFilter = defineModel<string>('filter', { default: '' })
const shown = (list: Entry[]) => { const q = spellFilter.value.trim().toLowerCase(); return q ? list.filter(e => e.name.toLowerCase().includes(q)) : list }
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
const items = computed<ChooserItem[]>(() => {
  const row = (e: Entry, group: string): ChooserItem => ({ id: e.id, label: e.name, group, hint: bookCaster.value && d.value.spells.includes(e.id) ? 'prepared' : d.value.book.includes(e.id) ? 'in the book' : '', mark: hasIt(e.id) ? ` ✓ ${hasIt(e.id)}` : undefined, title: hasIt(e.id) ? `Already has it: ${hasIt(e.id)}` : undefined })
  const cantrips = counts.value.cantrips !== 0 ? shown(sc.value.cantrips).map(e => row(e, 'Cantrips')) : []
  const spells = shown(sc.value.spells).sort((a, b) => Number(a.fields.level) - Number(b.fields.level) || a.name.localeCompare(b.name)).map(e => row(e, `${ORD[Number(e.fields.level)]} level`))
  return [...cantrips, ...spells]
})
const picked = computed(() => [...d.value.cantrips, ...d.value.spells, ...d.value.book])
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
  <WzChooser :items="items" :picked="picked" label="Spells" :empty="sc.cantrips.length || sc.spells.length ? 'No spell by that name.' : 'The world has no spells for this class (a spell\'s Classes field lists who can cast it).'" @pick="pick">
    <template #top>
      <p class="small wz-ch-top">
        <template v-if="counts.cantrips != null">{{ d.cantrips.length }} / {{ counts.cantrips }} cantrips · {{ d.spells.length }} / {{ counts.prepared }} prepared <span class="muted">(optional: the Spellbook prepares them later too)</span></template>
        <template v-else>{{ d.cantrips.length }} cantrips · {{ d.spells.length }} spells</template>
        <template v-if="sc.maxLevel"> · to {{ ORD[sc.maxLevel] }}</template>
        <template v-if="counts.book != null"> · book {{ d.spells.length + d.book.length }} / {{ counts.book }}</template>
      </p>
      <p v-if="full" class="small wz-need-line" role="status">{{ full }}</p>
      <input v-model="spellFilter" class="wz-filter" placeholder="Filter by name…" aria-label="Filter the spells by name" />
    </template>
    <template #detail="{ item, picked: on }">
      <div class="wz-spell-pick">
        <template v-if="isCantrip(item.id)">
          <button type="button" class="chip-btn" :class="{ on }" @click="toggleSpell('cantrips', item.id, counts.cantrips)">{{ on ? '✓ Cantrip taken' : 'Take this cantrip' }}</button>
        </template>
        <template v-else>
          <template v-if="bookCaster">
            <button type="button" class="chip-btn" :class="{ on: inBook(item.id) }" :title="inBook(item.id) ? 'In the spellbook. Click to take it out' : 'Put it in the spellbook (or click it in the list)'" @click="toBook(item.id)">{{ inBook(item.id) ? '✓ In the spellbook' : 'Into the spellbook' }}</button>
            <button v-if="inBook(item.id)" type="button" class="chip-btn" :class="{ on: d.spells.includes(item.id) }" :title="d.spells.includes(item.id) ? 'Prepared. Click to keep it in the book only' : 'Prepare it as well'" @click="togglePrepared(item.id)">{{ d.spells.includes(item.id) ? '✓ Prepared' : 'Prepare it' }}</button>
          </template>
          <button v-else type="button" class="chip-btn" :class="{ on: d.spells.includes(item.id) }" @click="toggleSpell('spells', item.id, counts.prepared)">{{ d.spells.includes(item.id) ? '✓ Prepared' : 'Prepare it' }}</button>
        </template>
        <span v-if="hasIt(item.id)" class="small muted">Already has it: {{ hasIt(item.id) }}</span>
      </div>
      <p v-if="owned.size" class="small muted">Already has: <template v-for="([id, from], i) in [...owned]" :key="id"><template v-if="i">, </template><EntryLink :id="id" /> ({{ from.join(', ') }})</template></p>
      <h3 class="wz-page-head">{{ item.label }} <a :href="hrefEntry(item.id)" class="small" title="Its own page">open its page</a></h3>
      <SpellCard v-if="get(item.id)" :e="get(item.id)!" />
    </template>
  </WzChooser>
</template>
