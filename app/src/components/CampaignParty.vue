<script setup lang="ts">
// The party at the top of a campaign's page: a card per character with what the DM looks up at the table (class and
// level, AC, HP, passive Perception, spell save DC), and characters added or taken out right here. One's own
// characters name their campaigns themselves; a player's shared one (read-only here) is put in the campaign's list.
import { computed } from 'vue'
import type { Entry, Id } from '../model/types'
import { playerMode, state } from '../store'
import { changed } from '../edit'
import { membersOf } from '../sessions'
import { classText } from '../model/classes'
import { levelOf, partyLine } from '../sheet'
import { sheetOf } from '../sheetData'
import { isShared } from '../sync'
import EntryLink from './EntryLink.vue'
import EntryPicker from './edit/EntryPicker.vue'

const props = defineProps<{ campaign: Entry }>()
const party = computed(() => membersOf(props.campaign.id).sort((a, b) => a.name.localeCompare(b.name)))
const canEdit = computed(() => !state.readOnly && !playerMode.value)
const line = (p: Entry) => partyLine(p)
const hp = (p: Entry) => { const s = sheetOf(p), max = line(p).maxHp; return max != null ? `${s?.hp ?? max} / ${max}` : '—' }

function add(id: Id) {
  const p = party.value.find(x => x.id === id) ? undefined : (state.db?.entries[id])
  if (!p || p.type !== 'pc') return
  if (isShared(p)) {
    const c = props.campaign
    c.fields.members = [...new Set([...(c.fields.members ?? []), id])]
    changed(c)
  } else {
    p.fields.campaigns = [...new Set([...(p.fields.campaigns ?? []), props.campaign.id])]
    changed(p)
  }
}
function drop(p: Entry) {
  const c = props.campaign
  if (!confirm(`Take ${p.name} out of ${c.name}?`)) return
  if ((c.fields.members ?? []).includes(p.id)) { c.fields.members = (c.fields.members ?? []).filter(x => x !== p.id); changed(c) }
  if ((p.fields.campaigns ?? []).includes(c.id) && !isShared(p)) { p.fields.campaigns = (p.fields.campaigns ?? []).filter(x => x !== c.id); changed(p) }
}
</script>

<template>
  <section class="campaign-party">
    <h2>Party <span class="muted small">{{ party.length }}</span></h2>
    <div class="cp-cards">
      <div v-for="p in party" :key="p.id" class="card cp-card">
        <div class="cp-head"><EntryLink :id="p.id" icon /><button v-if="canEdit" type="button" class="x" :title="`Take ${p.name} out of this campaign`" @click="drop(p)">×</button></div>
        <div class="small muted">{{ classText(p, state.db?.meta) || `Level ${levelOf(p)}` }}<template v-if="p.fields.player"> · {{ p.fields.player }}</template></div>
        <dl class="cp-stats">
          <div><dt>AC</dt><dd>{{ line(p).ac }}</dd></div>
          <div><dt>HP</dt><dd>{{ hp(p) }}</dd></div>
          <div title="Passive Perception"><dt>Perc.</dt><dd>{{ line(p).perception }}</dd></div>
          <div v-if="line(p).spellDc" title="Spell save DC"><dt>DC</dt><dd>{{ line(p).spellDc }}</dd></div>
        </dl>
      </div>
      <div v-if="canEdit" class="card cp-card cp-add">
        <EntryPicker add :types="['pc']" :exclude="party.map(p => p.id)" no-create placeholder="＋ Add a character…" @pick="add" />
      </div>
    </div>
    <p v-if="!party.length && !canEdit" class="muted small">No characters in this campaign yet.</p>
  </section>
</template>
