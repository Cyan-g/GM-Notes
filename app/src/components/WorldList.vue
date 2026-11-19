<script setup lang="ts">
// The known worlds, to open one, start a new one or open a world's folder. Shown in ⚙ → Switch world, under the
// world's name at the top left, and on the start screen.
import AppIcon from './AppIcon.vue'
import { onMounted, ref } from 'vue'
import { forgetWorld, joinWorld, loadWorlds, newWorld, openWorldFolder, switchWorld, worlds } from '../worlds'
import { desktop } from '../storage/desktop'

const emit = defineEmits<{ done: [] }>()
const naming = ref(false)
const name = ref('')
onMounted(loadWorlds)
const when = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '' : d.toLocaleDateString() }
/** Join: the worlds found in a shared folder. */
const found = ref<{ folder: string; worlds: { worldId: string; title: string; published: string }[] } | null>(null)
async function scan() { found.value = await desktop!.shared.scan() }
async function create() {
  if (!name.value.trim()) return
  await newWorld(name.value)
  emit('done')
}
</script>

<template>
  <div class="world-list">
    <ul v-if="worlds.list.length">
      <li v-for="w in worlds.list" :key="w.dir" :class="{ current: w.current, gone: !w.exists }">
        <button class="world-open" :disabled="w.current || !w.exists" :title="w.dir" @click="switchWorld(w)">
          <span class="world-name">{{ w.current ? '● ' : '' }}{{ w.title }}</span>
          <span class="hint">{{ w.current ? 'open' : !w.exists ? 'folder missing' : when(w.opened) }}</span>
        </button>
        <button v-if="!w.current" class="link-btn x" :title="`Take ${w.title} off the list (its folder stays)`" @click="forgetWorld(w)">✕</button>
      </li>
    </ul>
    <p v-else-if="worlds.loaded" class="muted small">No worlds yet.</p>
    <form v-if="naming" class="world-new" @submit.prevent="create">
      <input v-model="name" placeholder="Name of the new world" aria-label="Name of the new world" />
      <button type="submit" class="primary" :disabled="!name.trim()">Create</button>
      <button type="button" @click="naming = false">Cancel</button>
      <p class="muted small">{{ worlds.worldsDir ? `It gets its own folder in ${worlds.worldsDir}.` : 'First, choose the folder your worlds go in; each new world gets its own folder in it.' }}</p>
    </form>
    <div v-else-if="found" class="world-join">
      <p class="small">In {{ found.folder }}:</p>
      <ul v-if="found.worlds.length">
        <li v-for="w in found.worlds" :key="w.worldId">
          <span><b>{{ w.title }}</b> <span class="muted small">published {{ when(w.published) }}</span></span>
          <button type="button" class="primary" @click="joinWorld(found.folder, w)">Join</button>
        </li>
      </ul>
      <p v-else class="muted small">No published worlds in that folder. Pick the folder your DM shared (not one inside it), and check it's synced to this computer.</p>
      <div class="world-actions"><button type="button" @click="scan">Another folder…</button><button type="button" @click="found = null">Cancel</button></div>
    </div>
    <div v-else class="world-actions">
      <button type="button" @click="naming = true">＋ New world…</button>
      <button type="button" title="A world your DM publishes in a shared folder (e.g. Google Drive)" @click="scan"><AppIcon ui="download" /> Join a shared world…</button>
      <button type="button" @click="openWorldFolder">Open a world folder…</button>
    </div>
  </div>
</template>
