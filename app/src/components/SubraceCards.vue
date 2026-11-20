<script setup lang="ts">
// A race's subraces on its page: each with its ability score bonus, size and speed when they differ from the main
// race's, and its traits (a subrace has the main race's traits as well).
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { entries } from '../store'
import { abilityBonusText } from '../abilityBonus'
import { traitsOf } from '../species'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ race: Entry }>()
const subs = computed(() => entries.value.filter(e => e.type === 'race' && e.fields.parent === props.race.id).sort((a, b) => a.name.localeCompare(b.name)))
const differs = (e: Entry, k: 'size' | 'speed') => e.fields[k] && e.fields[k] !== props.race.fields[k]
const grand = (e: Entry) => entries.value.filter(x => x.type === 'race' && x.fields.parent === e.id).length
</script>

<template>
  <div v-if="subs.length" class="card subrace-cards">
    <h3>Subraces <span class="muted small">{{ subs.length }} · each also has the {{ race.name }}'s traits</span></h3>
    <div v-for="s in subs" :key="s.id" class="subrace-card">
      <div class="sr-head"><EntryLink :id="s.id" />
        <span v-if="s.fields.abilityIncrease" class="muted small">{{ abilityBonusText(s.fields.abilityIncrease) }}</span>
        <span v-if="differs(s, 'size')" class="muted small">{{ s.fields.size }}</span>
        <span v-if="differs(s, 'speed')" class="muted small">speed {{ s.fields.speed }}</span>
        <span v-if="grand(s)" class="muted small">{{ grand(s) }} subraces of its own</span>
      </div>
      <span v-if="traitsOf(s).length" class="chips"><span v-for="t in traitsOf(s)" :key="t.id" class="chip" :title="t.text">{{ t.name }}</span></span>
      <span v-else class="muted small">No traits of its own yet.</span>
    </div>
  </div>
</template>
