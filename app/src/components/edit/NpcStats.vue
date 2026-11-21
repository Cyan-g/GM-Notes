<script setup lang="ts">
// An NPC's stats: none until asked for. Then the creature form (based on one of the world's creatures or an SRD
// monster, or its own), with the finished statblock beside it; folded to one line once written.
import { computed, ref } from 'vue'
import type { Entry } from '../../model/types'
import { changed } from '../../edit'
import { statsOf } from '../../encounter'
import { get } from '../../store'
import { srdMonster } from '../../srd'
import CreatureForm from './CreatureForm.vue'
import StatblockView from '../Statblock.vue'

const props = defineProps<{ entry: Entry }>()
const sb = computed(() => props.entry.fields.statblock)
const full = computed(() => statsOf(props.entry))
const editing = ref(false)
/** "Mummy Lord (SRD) · CR 15 · AC 17 · HP 187" */
const line = computed(() => {
  const s = full.value, own = sb.value
  if (!s) return ''
  const base = own?.base ? get(own.base)?.name : own?.srd ? `${srdMonster(own.srd)?.name ?? own.srd} (SRD)` : ''
  return [base && `based on ${base}`, s.cr && `CR ${s.cr}`, s.ac != null && `AC ${s.ac}`, s.hp != null && `HP ${s.hp}`].filter(Boolean).join(' · ')
})
function remove() {
  if (!confirm(`Remove ${props.entry.name}'s stats?`)) return
  delete props.entry.fields.statblock
  editing.value = false
  changed(props.entry)
}
</script>

<template>
  <section class="card npc-stats" :class="{ open: editing }">
    <div class="npc-stats-head">
      <h3>Stats</h3>
      <span v-if="sb" class="muted small">{{ line || 'not filled in yet' }}</span>
      <span v-else-if="!editing" class="muted small">None: add them if they might fight, or for their skills and saves.</span>
      <span class="spacer" />
      <template v-if="sb || editing">
        <button type="button" class="chip-btn" @click="editing = !editing">{{ editing ? 'Fold' : '✎ Edit stats' }}</button>
        <button v-if="sb" type="button" class="link-btn small" @click="remove">Remove</button>
      </template>
      <button v-else type="button" class="chip-btn" @click="editing = true">＋ Add stats</button>
    </div>
    <div v-if="editing" class="npc-stats-body">
      <CreatureForm :entry="entry" />
      <div class="npc-stats-preview">
        <StatblockView v-if="full" :sb="full" :name="entry.name" />
        <p v-else class="muted small">The statblock shows up here as you fill it in. Start from one of your creatures or an SRD monster to fill it in one go.</p>
      </div>
    </div>
  </section>
</template>
