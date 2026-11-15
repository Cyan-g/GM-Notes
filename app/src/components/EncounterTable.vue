<script setup lang="ts">
// The creatures of an encounter with their numbers and total XP.
import { computed } from 'vue'
import type { EncounterLine } from '../model/types'
import { lineInfo } from '../encounter'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ lines: EncounterLine[] }>()
const rows = computed(() => props.lines.map(l => ({ l, ...lineInfo(l) })))
const total = computed(() => rows.value.reduce((s, r) => s + (r.xp ?? 0) * r.l.count, 0))
const unknownXp = computed(() => rows.value.some(r => r.xp == null))
const count = computed(() => props.lines.reduce((s, l) => s + l.count, 0))
</script>

<template>
  <table class="mini">
    <thead><tr><th class="num">#</th><th>Creature</th><th class="num">CR</th><th class="num">AC</th><th class="num">HP</th><th class="num">XP</th></tr></thead>
    <tbody>
      <tr v-for="(r, i) in rows" :key="i">
        <td class="num">{{ r.l.count }}×</td>
        <td><EntryLink v-if="r.entry" :id="r.entry.id" /><span v-else>{{ r.name }} <span class="muted small" title="No entry for this creature yet">(no entry)</span></span></td>
        <td class="num">{{ r.cr ?? '' }}</td>
        <td class="num">{{ r.ac ?? '' }}</td>
        <td class="num">{{ r.hp ?? '' }}</td>
        <td class="num">{{ r.xp != null ? (r.xp * r.l.count).toLocaleString() : '' }}</td>
      </tr>
    </tbody>
    <tfoot><tr><td colspan="5">{{ count }} creature{{ count === 1 ? '' : 's' }}{{ unknownXp ? ' · some without stats' : '' }}</td><td class="num">{{ total.toLocaleString() }} XP</td></tr></tfoot>
  </table>
</template>
