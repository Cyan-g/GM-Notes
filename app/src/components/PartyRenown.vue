<script setup lang="ts">
// The party's renown with an organization: each character's number (the DM hands it out), the rank it earns and
// what the next one takes. Characters show once they have renown or belong; others are a pick away.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { byType, playerMode, state } from '../store'
import { editSheet } from '../sheet'
import { membersOf, rankForRenown, renownOf, ranksOf } from '../org'
import EntryLink from './EntryLink.vue'
import EntryPicker from './edit/EntryPicker.vue'

const props = defineProps<{ org: Entry }>()
const canEdit = computed(() => !state.readOnly && !playerMode.value)
const pcs = computed(() => byType.value.get('pc') ?? [])
const memberIds = computed(() => new Set(membersOf(props.org).map(r => r.a)))
const rows = computed(() => pcs.value.filter(pc => renownOf(pc, props.org.id) != null || memberIds.value.has(pc.id))
  .map(pc => { const n = renownOf(pc, props.org.id); return { pc, n, ...(n != null ? rankForRenown(props.org, n) : {}) } }))
const hasRanks = computed(() => ranksOf(props.org).some(r => r.renown != null))
function setRenown(pc: Entry, raw: string) {
  const v = raw.trim() === '' ? undefined : Math.max(0, Math.round(Number(raw)) || 0)
  editSheet(pc, s => {
    const m = { ...(s.renown ?? {}) }
    if (v == null) delete m[props.org.id]; else m[props.org.id] = v
    if (Object.keys(m).length) s.renown = m; else delete s.renown
  })
}
const add = (id: string) => { const pc = pcs.value.find(p => p.id === id); if (pc) setRenown(pc, '0') }
</script>

<template>
  <div v-if="rows.length || (canEdit && pcs.length)" class="card party-renown">
    <h3>The party</h3>
    <div v-for="r in rows" :key="r.pc.id" class="renown-row">
      <EntryLink :id="r.pc.id" icon />
      <label class="small muted">renown <input type="number" min="0" class="short" :value="r.n ?? ''" :disabled="!canEdit" placeholder="—" @change="setRenown(r.pc, ($event.target as HTMLInputElement).value)" /></label>
      <span v-if="hasRanks && r.n != null" class="small">
        <b v-if="r.rank">{{ r.rank.title }}</b><span v-else class="muted">no rank yet</span>
        <span v-if="r.next" class="muted"> · {{ r.next.title }} at {{ r.next.renown }}</span>
      </span>
    </div>
    <EntryPicker v-if="canEdit && rows.length < pcs.length" add :types="['pc']" :exclude="rows.map(r => r.pc.id)" placeholder="＋ a character's renown…" @pick="add" />
  </div>
</template>
