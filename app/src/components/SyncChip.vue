<script setup lang="ts">
// The sync status in the top bar, only for a world with paired devices: "Synced with Laptop", "Syncing…" or
// "Laptop not reachable"; a click opens My devices.
import { computed } from 'vue'
import { devices } from '../devicesync/devices'
import { ui } from '../ui'
import AppIcon from './AppIcon.vue'

const list = computed(() => devices.status?.devices ?? [])
const on = computed(() => list.value.filter(d => d.state === 'connected'))
const label = computed(() => {
  if (devices.busy) return 'Syncing…'
  if (on.value.length) return on.value.length === 1 ? on.value[0].name : `${on.value.length} devices`
  return list.value.length === 1 ? `${list.value[0].name} away` : 'Devices away'
})
const title = computed(() => [
  ...list.value.map(d => `${d.name}: ${d.state === 'connected' ? 'connected' : 'not reachable'}`),
  devices.error ? `Last sync: ${devices.error}` : '',
  'Click for My devices',
].filter(Boolean).join('\n'))
</script>

<template>
  <button v-if="list.length" type="button" class="sync-chip" :class="{ live: on.length, err: !!devices.error }" :title="title" @click="ui.devices = true">
    <AppIcon ui="link" /> <span class="sync-label">{{ label }}</span>
  </button>
</template>
