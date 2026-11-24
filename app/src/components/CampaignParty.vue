<script setup lang="ts">
// The party at the top of a campaign's page: a card per character with what the DM looks up at the table (class and
// level, AC, HP, passive Perception, spell save DC), and characters added or taken out right here. One's own
// characters name their campaigns themselves; a player's shared one (read-only here) is put in the campaign's list.
// Taking a player's character out tells their app to take it out too (partySync.ts). In a campaign players know of,
// each character shows to the other players as an NPC, unless the DM keeps it out; on a player's copy of the
// campaign those NPCs (partyOf) are its party, as cards with their class and species.
import { computed } from 'vue'
import type { Entry, Id } from '../model/types'
import { get, playerMode, state } from '../store'
import { byKey } from '../model/schema'
import { changed } from '../edit'
import { touch } from '../store'
import { removeFromCampaign } from '../playerCharacters'
import { membersOf } from '../sessions'
import { classText } from '../model/classes'
import { levelOf, partyLine } from '../sheet'
import { sheetOf } from '../sheetData'
import { fromPlayer, isShared } from '../sync'
import EntryLink from './EntryLink.vue'
import EntryPicker from './edit/EntryPicker.vue'

const props = defineProps<{ campaign: Entry }>()
// a player's copy of the DM's campaign: the other characters, as the NPCs the DM's app sent (their own are below it)
const party = computed(() => (isShared(props.campaign)
  ? Object.values(state.db?.entries ?? {}).filter(x => x.type === 'npc' && ((byKey(x.fields).partyOf as Id[] | undefined) ?? []).includes(props.campaign.id))
  : membersOf(props.campaign.id)).sort((a, b) => a.name.localeCompare(b.name)))
const nameOf = (v: unknown) => get(String(v))?.name ?? String(v)
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
  const c = props.campaign, theirs = !!fromPlayer(p) && (p.fields.campaigns ?? []).includes(c.id)
  if (!confirm(`Take ${p.name} out of ${c.name}?${theirs ? ' Its player linked it; their app takes it out too (now, or when it next connects), and they can link it again.' : ''}`)) return
  removeFromCampaign(p, c.id)
}

// ---- what the other players see ----
/** Whether players know of the campaign: then its characters show to them as NPCs. */
const seen = computed(() => props.campaign.visibility === 'known')
const hidden = (p: Entry) => (state.db?.meta.partyHidden ?? []).includes(p.id)
function toggleHidden(p: Entry) {
  const m = state.db!.meta, l = new Set(m.partyHidden ?? [])
  if (l.has(p.id)) l.delete(p.id); else l.add(p.id)
  m.partyHidden = l.size ? [...l] : undefined
  touch()
}
</script>

<template>
  <section class="campaign-party">
    <h2>Party <span class="muted small">{{ party.length }}</span></h2>
    <div class="cp-cards">
      <div v-for="p in party" :key="p.id" class="card cp-card">
        <div class="cp-head"><EntryLink :id="p.id" icon /><button v-if="canEdit" type="button" class="x" :title="`Take ${p.name} out of this campaign`" @click="drop(p)">×</button></div>
        <div v-if="p.type === 'npc'" class="small muted">{{ p.fields.occupation }}<template v-if="p.fields.race"> · {{ nameOf(p.fields.race) }}</template></div>
        <div v-else class="small muted">{{ classText(p, state.db?.meta) || `Level ${levelOf(p)}` }}<template v-if="p.fields.player"> · {{ p.fields.player }}</template></div>
        <dl v-if="p.type === 'pc'" class="cp-stats">
          <div><dt>AC</dt><dd>{{ line(p).ac }}</dd></div>
          <div><dt>HP</dt><dd>{{ hp(p) }}</dd></div>
          <div title="Passive Perception"><dt>Perc.</dt><dd>{{ line(p).perception }}</dd></div>
          <div v-if="line(p).spellDc" title="Spell save DC"><dt>DC</dt><dd>{{ line(p).spellDc }}</dd></div>
        </dl>
        <button v-if="canEdit && seen" type="button" class="chip-toggle cp-party-toggle" :class="{ hidden: hidden(p) }"
                :title="hidden(p) ? 'Players don’t see this character; show it to them as an NPC' : 'Players see this character as an NPC (name, picture, species, class and level, looks and description); keep it out'"
                @click="toggleHidden(p)">{{ hidden(p) ? 'Hidden from players' : 'Shown to players' }}</button>
      </div>
      <div v-if="canEdit" class="card cp-card cp-add">
        <EntryPicker add :types="['pc']" :exclude="party.map(p => p.id)" no-create placeholder="＋ Add a character…" @pick="add" />
      </div>
    </div>
    <p v-if="!party.length && !canEdit" class="muted small">{{ isShared(campaign) ? 'No other characters in this campaign yet.' : 'No characters in this campaign yet.' }}</p>
  </section>
</template>
