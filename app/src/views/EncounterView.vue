<script setup lang="ts">
// An encounter is something you prepare and then run, so it has one page that is both view and editor:
// where and when, who fights on the party's side, and the creatures. No text, picture or relations.
import { computed } from 'vue'
import type { EncounterLine, Id } from '../model/types'
import { TYPES } from '../model/schema'
import { get } from '../store'
import { changed, deleteEntry } from '../edit'
import { go, hrefList } from '../router'
import { lineInfo } from '../encounter'
import { loadEncounter, partyOf } from '../tracker'
import FieldInput from '../components/edit/FieldInput.vue'

const props = defineProps<{ id: string }>()
const e = computed(() => get(props.id))
const field = (key: string) => TYPES.encounter.fields.find(f => f.key === key)!

const campaign = computed(() => e.value?.fields.campaign as Id | undefined)
const party = computed(() => (e.value?.fields.party as Id[] | undefined) ?? [])
const campaignParty = computed(() => (campaign.value ? partyOf(campaign.value) : []))
function useCampaignParty() {
  const x = e.value!
  x.fields.party = campaignParty.value.map(p => p.id)
  changed(x)
}

// ---- totals ----
const lines = computed(() => (e.value?.fields.creatures as EncounterLine[] | undefined) ?? [])
const count = computed(() => lines.value.reduce((s, l) => s + l.count, 0))
const xp = computed(() => lines.value.reduce((s, l) => s + (lineInfo(l).xp ?? 0) * l.count, 0))
const unknownXp = computed(() => lines.value.some(l => lineInfo(l).xp == null))

function setName(v: string) { if (v.trim()) { e.value!.name = v.trim(); changed(e.value!) } }
function run() { loadEncounter(props.id); go('#/tracker') }
function remove() {
  if (!confirm(`Delete “${e.value!.name}”?\n\nThe backups in data/backups still have it if you change your mind.`)) return
  deleteEntry(props.id)
  go(hrefList('encounter'))
}
</script>

<template>
  <article v-if="e" class="entry encounter-page">
    <header class="enc-head">
      <span class="icon">⚔</span>
      <input class="name-input" :value="e.name" aria-label="Name" @change="setName(($event.target as HTMLInputElement).value)" />
      <span class="muted small">changes save automatically</span>
      <span class="spacer" />
      <button class="danger" @click="remove">Delete</button>
      <button class="primary" :disabled="!lines.length && !party.length" title="Load it into the encounter tracker, with this party" @click="run">▶ Run</button>
    </header>

    <div class="enc-grid">
      <section class="card enc-setup">
        <h3>Setting</h3>
        <label class="sheet-field"><span>Campaign</span><FieldInput :def="field('campaign')" :entry="e" /></label>
        <label class="sheet-field"><span>Session</span><FieldInput :def="field('session')" :entry="e" /></label>
        <label class="sheet-field"><span>Where</span><FieldInput :def="field('location')" :entry="e" /></label>

        <h3 class="enc-party-title">
          <span>🛡 Party</span>
          <button v-if="campaignParty.length" type="button" class="chip-btn" :title="`Set the party to the ${campaignParty.length} player characters of the campaign`" @click="useCampaignParty">Use the campaign's party</button>
        </h3>
        <FieldInput :def="field('party')" :entry="e" />
        <p class="muted small">{{ party.length ? 'They join the fight when you run it.' : 'Empty: running it keeps whoever is already in the tracker.' }}</p>
      </section>

      <section class="card enc-creatures">
        <h3>
          <span>☠ Creatures</span>
          <span class="muted small">{{ count }} creature{{ count === 1 ? '' : 's' }} · {{ xp.toLocaleString() }} XP<template v-if="unknownXp"> · some without stats</template></span>
        </h3>
        <FieldInput :def="field('creatures')" :entry="e" />
      </section>
    </div>
  </article>
  <p v-else class="muted pad">This encounter doesn't exist.</p>
</template>
