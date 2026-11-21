<script setup lang="ts">
// The sharing button in the top bar, one place for connecting. The DM: "Share" opens Share with players, and while
// hosting it shows the live session ("● Live · 2", "· auto" when changes go out on their own). A player's world that
// follows the DM's: how its updates arrive ("● Live", "○ Not connected", "Updated 20:15"), and a panel to connect
// to the live session and check for updates.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import LiveJoin from './LiveJoin.vue'
import { playerMode, state } from '../store'
import { ui } from '../ui'
import { desktop } from '../storage/desktop'
import { autoSend, checkShared, connectLive, live, syncStatus } from '../sync'

const follow = computed(() => state.db?.follow)
const auto = computed(() => !!state.db?.meta.sharing?.autoSend)
const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')

// ---- the DM ----
const hostTitle = computed(() => {
  if (!live.host.hosting) return live.hostError ? `Hosting didn't start when the world opened: ${live.hostError}` : 'Share the world with your players: live at the table, or through a shared folder'
  const sent = autoSend.sent || live.host.published
  return [`Hosting a live session; code ${live.host.code}.`, live.host.players.length ? `Connected: ${live.host.players.join(', ')}.` : 'No players connected yet.',
    auto.value ? `Changes go out on their own${sent ? `; last sent ${time(sent)}` : ''}.` : 'Click to send.', autoSend.error && `Last automatic send failed: ${autoSend.error}`].filter(Boolean).join(' ')
})

// ---- a player ----
const open = ref(false)
const reconnecting = ref(false)
const LIVE_STATE = { off: 'not connected', searching: 'looking for the DM…', connected: 'connected', 'wrong-code': 'the code changed' } as const
const liveText = computed(() => LIVE_STATE[live.player.state])
const connected = computed(() => live.player.state === 'connected')
const label = computed(() => {
  if (live.via.live && connected.value) return '● Live'
  if (syncStatus.error) return '⚠ Not updated'
  if (live.via.live && !live.via.folder) return '○ Not connected'
  return syncStatus.checked ? `Updated ${time(syncStatus.checked)}` : 'Shared world'
})
function toggle() { open.value = !open.value; reconnecting.value = live.via.live ? live.player.state === 'off' || live.player.state === 'wrong-code' : false }
async function chosen(s: { host: string; port: number; worldId: string }, code: string) { await connectLive(s, code); reconnecting.value = false }

const root = ref<HTMLElement | null>(null)
function outside(ev: PointerEvent) { if (open.value && !root.value?.contains(ev.target as Node)) open.value = false }
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && open.value) { ev.stopPropagation(); open.value = false } }
onMounted(() => { document.addEventListener('pointerdown', outside); window.addEventListener('keydown', onKey, true) })
onUnmounted(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', onKey, true) })
</script>

<template>
  <div v-if="desktop && (follow || !playerMode)" ref="root" class="session-box">
    <template v-if="!follow">
      <button v-if="live.host.hosting" class="live-tag" :title="hostTitle" @click="ui.publishOpen = true">● Live · {{ live.host.players.length }}<template v-if="auto"> · auto</template></button>
      <button v-else class="live-tag off" :class="{ warn: live.hostError }" :title="hostTitle" @click="ui.publishOpen = true"><AppIcon ui="share" /> Share</button>
    </template>
    <template v-else>
      <button class="live-tag" :class="{ off: !(live.via.live && connected), warn: !!syncStatus.error }" :aria-expanded="open" aria-haspopup="dialog"
              :title="`Shared by your DM from ${follow.title}`" @click="toggle">{{ label }}</button>
      <div v-if="open" class="theme-panel session-panel" role="dialog" aria-label="Shared world">
        <h4>{{ follow.title }}</h4>
        <p class="small muted">Shared by your DM. Their entries here are read-only and stay up to date on their own.</p>
        <template v-if="live.via.live || reconnecting">
          <p class="small"><b>Live session:</b> {{ liveText }}<template v-if="connected"> to {{ live.player.host }}</template>. While your DM hosts on this network, updates arrive the moment they're sent.</p>
          <p v-if="live.player.state === 'wrong-code'" class="error small">Your DM made a new code. Ask them for it.</p>
        </template>
        <LiveJoin v-if="reconnecting" :world-id="follow.worldId" @chosen="chosen" @cancel="reconnecting = false" />
        <div v-else class="world-actions">
          <button type="button" @click="reconnecting = true">{{ !live.via.live ? 'Connect to a live session…' : live.player.state === 'off' ? 'Connect…' : 'Use another code…' }}</button>
          <button v-if="live.via.folder || !connected" type="button" :disabled="syncStatus.busy" @click="checkShared(true)"><AppIcon ui="download" /> Check for updates</button>
        </div>
        <p v-if="live.via.folder" class="small muted">Also from the shared folder, checked every 5 minutes{{ syncStatus.checked ? `; last at ${time(syncStatus.checked)}` : '' }}.</p>
        <p v-if="syncStatus.error" class="error small">{{ syncStatus.error }}</p>
        <p v-else-if="syncStatus.note" class="small">{{ syncStatus.note }}</p>
      </div>
    </template>
  </div>
</template>
