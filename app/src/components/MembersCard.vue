<script setup lang="ts">
// Members of an organization as of a chosen year: who was in, who had left, who came later.
import { computed, ref } from 'vue'
import type { Entry, Relation } from '../model/types'
import { db, formatDate, get, playerMode, relationsOf, state } from '../store'
import { addRelation, relationChanged } from '../edit'
import { ranksOf } from '../org'
import EntryLink from './EntryLink.vue'
import EntryPicker from './edit/EntryPicker.vue'

const props = defineProps<{ org: Entry }>()
const year = ref<number>(db().meta.today.year)

const members = computed(() => (relationsOf.value.get(props.org.id) ?? []).filter(r => r.kind === 'member' && r.b === props.org.id))
const split = computed(() => {
  const y = year.value
  const now: Relation[] = [], before: Relation[] = [], later: Relation[] = []
  for (const r of members.value) {
    if (r.from && r.from.year > y) later.push(r)
    else if (r.to && r.to.year < y) before.push(r)
    else now.push(r)
  }
  // by rank (highest first, as the ranks are listed), then by name
  const order = ranksOf(props.org).map(k => k.title.toLowerCase())
  const at = (r: Relation) => { const i = order.indexOf((r.role ?? '').toLowerCase()); return i < 0 ? order.length : i }
  const byName = (a: Relation, b: Relation) => at(a) - at(b) || (get(a.a)?.name ?? '').localeCompare(get(b.a)?.name ?? '')
  return { now: now.sort(byName), before: before.sort(byName), later: later.sort(byName) }
})
// ---- adding a member with a rank ----
const canEdit = computed(() => !state.readOnly && !playerMode.value)
const newRank = ref('')
function addMember(id: string) {
  const r = addRelation(id, props.org.id, 'member')
  if (newRank.value.trim()) { r.role = newRank.value.trim(); relationChanged(r) }
}
const range = (r: Relation) => (r.from || r.to) ? `${r.from ? formatDate(r.from) : '?'} – ${r.to ? formatDate(r.to) : 'now'}` : ''
</script>

<template>
  <div class="card members-card">
    <h3>Members <span class="muted small">as of</span>
      <input type="number" class="short" :value="year" @change="year = Number(($event.target as HTMLInputElement).value) || db().meta.today.year" />
    </h3>
    <ul class="rel">
      <li v-for="r in split.now" :key="r.id"><EntryLink :id="r.a" icon /><span v-if="r.role" class="role">{{ r.role }}</span><span class="when">{{ range(r) }}</span></li>
    </ul>
    <p v-if="!split.now.length" class="muted small">Nobody known in {{ year }}.</p>
    <div v-if="canEdit" class="members-add">
      <EntryPicker add :types="['npc', 'pc', 'creature', 'deity', 'organization']" :exclude="[org.id, ...members.map(r => r.a)]" placeholder="＋ member…" @pick="addMember" />
      <span class="muted small">as</span>
      <input v-model="newRank" class="short" :list="`ranks-${org.id}`" :placeholder="ranksOf(org).length ? 'rank' : 'role'" title="Their rank or role (optional)" />
      <datalist :id="`ranks-${org.id}`"><option v-for="k in ranksOf(org)" :key="k.title" :value="k.title" /></datalist>
    </div>
    <details v-if="split.before.length">
      <summary class="muted small">Earlier members ({{ split.before.length }})</summary>
      <ul class="rel ended-list">
        <li v-for="r in split.before" :key="r.id"><EntryLink :id="r.a" icon /><span v-if="r.role" class="role">{{ r.role }}</span><span class="when">{{ range(r) }}</span></li>
      </ul>
    </details>
    <details v-if="split.later.length">
      <summary class="muted small">Joined later ({{ split.later.length }})</summary>
      <ul class="rel ended-list">
        <li v-for="r in split.later" :key="r.id"><EntryLink :id="r.a" icon /><span v-if="r.role" class="role">{{ r.role }}</span><span class="when">{{ range(r) }}</span></li>
      </ul>
    </details>
  </div>
</template>
