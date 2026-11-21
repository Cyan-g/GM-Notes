<script setup lang="ts">
// The wizard's spells step: cantrips and prepared spells up to the class's limits, and for a wizard the further
// spellbook spells, all filtered by name.
import { computed } from 'vue'
import type { Entry, Id } from '../../model/types'
import { ownedSpells, spellChoices, spellCounts, wizard } from '../../wizard'
import { ORD } from '../../model/dnd'
import { useDraft } from '../../composables/useDraft'
import EntryLink from '../EntryLink.vue'

const { d } = useDraft()
const sc = computed(() => spellChoices(d.value))
const counts = computed(() => spellCounts(d.value))
/** The name filter, kept by the wizard while it's open (going to another step and back keeps it). */
const spellFilter = defineModel<string>('filter', { default: '' })
const shown = (list: Entry[]) => { const q = spellFilter.value.trim().toLowerCase(); return q ? list.filter(e => e.name.toLowerCase().includes(q)) : list }
const byLevel = computed(() => {
  const m = new Map<string, Entry[]>()
  for (const e of shown(sc.value.spells)) { const k = String(e.fields.level); if (!m.has(k)) m.set(k, []); m.get(k)!.push(e) }
  return [...m].sort((a, b) => Number(a[0]) - Number(b[0]))
})
function toggleSpell(key: 'cantrips' | 'spells' | 'book', id: Id, max?: number) {
  const l = d.value[key]
  if (l.includes(id)) { wizard.d[key] = l.filter(x => x !== id); return }
  if (max != null && l.length >= max) return
  if (key === 'spells') wizard.d.book = d.value.book.filter(x => x !== id)
  wizard.d[key] = [...l, id]
}
/** The spells the character has already from elsewhere (species, background, feats, class features). */
const owned = computed(() => ownedSpells(d.value))
const hasIt = (id: Id) => owned.value.get(id)?.join(', ')
const bookMax = computed(() => (counts.value.book != null ? Math.max(0, counts.value.book - d.value.spells.length) : undefined))
</script>

<template>
  <p class="small">
    <template v-if="counts.cantrips != null">{{ d.cantrips.length }} of {{ counts.cantrips }} cantrips · {{ d.spells.length }} of {{ counts.prepared }} prepared spells</template>
    <template v-else>{{ d.cantrips.length }} cantrips · {{ d.spells.length }} spells (no limit known for this class)</template>
    <template v-if="sc.maxLevel"> · up to {{ ORD[sc.maxLevel] }} level</template>
    <template v-if="counts.book != null"> · spellbook {{ d.spells.length + d.book.length }} of {{ counts.book }}</template>
  </p>
  <p v-if="owned.size" class="small">Already has: <template v-for="([id, from], i) in [...owned]" :key="id"><template v-if="i">, </template><EntryLink :id="id" /> <span class="muted">({{ from.join(', ') }})</span></template>. Marked ✓ below.</p>
  <input v-model="spellFilter" class="wz-filter" placeholder="Filter by name…" />
  <template v-if="sc.cantrips.length && counts.cantrips !== 0">
    <h3>Cantrips</h3>
    <div class="wz-skills">
      <button v-for="e in shown(sc.cantrips)" :key="e.id" type="button" class="chip-btn" :class="{ on: d.cantrips.includes(e.id), had: hasIt(e.id) }" :title="hasIt(e.id) ? `Already has it: ${hasIt(e.id)}` : undefined" @click="toggleSpell('cantrips', e.id, counts.cantrips)">{{ e.name }}<span v-if="hasIt(e.id)" class="wz-had">✓ {{ hasIt(e.id) }}</span></button>
    </div>
  </template>
  <template v-for="[lvl, list] in byLevel" :key="lvl">
    <h3>{{ ORD[Number(lvl)] }} level</h3>
    <div class="wz-skills">
      <span v-for="e in list" :key="e.id" class="wz-spell">
        <button type="button" class="chip-btn" :class="{ on: d.spells.includes(e.id), had: hasIt(e.id) }" :title="hasIt(e.id) ? `Prepared. Already has it: ${hasIt(e.id)}` : 'Prepared'" @click="toggleSpell('spells', e.id, counts.prepared)">{{ e.name }}<span v-if="hasIt(e.id)" class="wz-had">✓ {{ hasIt(e.id) }}</span></button>
        <button v-if="counts.book != null && !d.spells.includes(e.id)" type="button" class="chip-btn wz-book" :class="{ on: d.book.includes(e.id) }" title="In the spellbook, not prepared" @click="toggleSpell('book', e.id, bookMax)">📖</button>
      </span>
    </div>
  </template>
  <p v-if="!sc.cantrips.length && !sc.spells.length" class="muted small">The world has no spells for this class (a spell's Classes field lists who can cast it).</p>
</template>
