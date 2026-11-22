<script setup lang="ts">
// After a sync: what was changed on two devices before they talked. The newer change was kept; the other version is
// in the entry's History (on this device when this one's lost, on the other one when it won).
import { computed } from 'vue'
import { devices } from '../devicesync/devices'
import { get } from '../store'
import EntryLink from './EntryLink.vue'

const list = computed(() => {
  const seen = new Map<string, (typeof devices.conflicts)[number]>()
  for (const c of devices.conflicts) seen.set(`${c.kind}:${c.key}`, c)
  return [...seen.values()]
})
const close = () => { devices.conflicts.splice(0) }
</script>

<template>
  <div v-if="list.length" class="sync-notice" role="status">
    <p class="small"><b>Changed on two devices</b> before they synced; the newer change was kept:</p>
    <ul class="small">
      <li v-for="c in list.slice(0, 8)" :key="`${c.kind}:${c.key}`">
        <EntryLink v-if="c.kind === 'entry' && get(c.key)" :id="c.key" /><span v-else>{{ c.name }}</span>
        <span class="muted"> · {{ c.kept === 'here' ? 'this device\'s' : `${c.device}'s` }} version kept{{ c.kind === 'entry' && c.kept === 'theirs' ? ', yours is in its History' : '' }}</span>
      </li>
      <li v-if="list.length > 8" class="muted">and {{ list.length - 8 }} more</li>
    </ul>
    <button type="button" class="chip-btn" @click="close">OK</button>
  </div>
</template>
