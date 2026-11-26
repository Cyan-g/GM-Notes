<script setup lang="ts">
// The known worlds, to open one, and below them three ways to get another: an offline world (new, from a world's file,
// or from my other device), a local session (the DM's live session on this network) and online (the DM's shared
// folder). Shown in ⚙ → Switch world, under the world's name at the top left, and on the start screen.
import AppIcon from './AppIcon.vue'
import LiveJoin from './LiveJoin.vue'
import DeviceJoin from './DeviceJoin.vue'
import { onMounted, ref } from 'vue'
import { forgetWorld, joinLive, joinWorld, loadWorlds, moveWorld, newWorld, openWorldFolder, switchWorld, worlds } from '../worlds'
import { desktop } from '../storage/desktop'
import { FORMAT as EXPORT_FORMAT } from '../transfer'
import { keepWorldFile } from '../pendingFile'

const emit = defineEmits<{ done: [] }>()
const naming = ref(false)
const name = ref('')
onMounted(loadWorlds)
const when = (iso: string) => { const d = new Date(iso); return isNaN(+d) ? '' : d.toLocaleDateString() }
/** Join: the worlds found in a shared folder. */
const found = ref<{ folder: string; worlds: { worldId: string; title: string; published: string }[] } | null>(null)
async function scan() { found.value = await desktop!.shared.scan() }
/** Join: a DM's live session on this network. */
const joiningLive = ref(false)
const joiningDevice = ref(false)
const busy = ref('')
async function moving(w: import('../worlds').KnownWorld) {
  if (!confirm(`Move “${w.title}” into GM Notes' own folder?\n\nIt's copied there with its pictures, files and backups, then the app uses the copy. The old folder is renamed “… (moved to GM Notes)” and kept, so you can delete it yourself once all is well.`)) return
  busy.value = `Moving ${w.title}…`
  try { await moveWorld(w) } catch (e) { alert((e as Error).message) } finally { busy.value = '' }
}
async function create() {
  if (!name.value.trim()) return
  await newWorld(name.value)
  emit('done')
}
/** A new world from a world's file (Settings → Export the world): the file first, the world named after it; the start
 * screen then asks who you are and starts it from the file (StartScreen, pendingFile). */
const fileInput = ref<HTMLInputElement>()
const fileError = ref('')
async function fromFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  fileError.value = ''
  try {
    const b = JSON.parse(await file.text())
    if (b?.format !== EXPORT_FORMAT || !Array.isArray(b.entries)) throw new Error(`${file.name} isn't a world's file. Use one made with Settings → Export the world.`)
    if (b.main) throw new Error(`${file.name} holds one entry and what it links to, not a world. Start a world, then import it with Settings → Import from a file.`)
    await keepWorldFile(file)
    await newWorld(String(b.from ?? '').trim() || file.name.replace(/\.json$/i, ''))
  } catch (e) {
    fileError.value = e instanceof SyntaxError ? `${file.name} isn't a file this app can read.` : (e as Error).message
  }
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
        <button v-if="w.exists && !w.inApp" class="link-btn small" :title="`${w.dir}: move it into GM Notes' own folder, where new worlds go (the old folder is renamed, not deleted)`" @click="moving(w)">Move into GM Notes' folder</button>
        <button v-if="!w.current" class="link-btn x" :title="`Take ${w.title} off the list (its folder stays)`" @click="forgetWorld(w)">✕</button>
      </li>
    </ul>
    <p v-else-if="worlds.loaded" class="muted small">No worlds yet.</p>
    <p v-if="busy" class="muted small">{{ busy }} (a big world takes a moment)</p>

    <!-- an offline world: on this computer, no connection needed -->
    <section class="world-section">
      <h5>Offline world</h5>
      <form v-if="naming" class="world-new" @submit.prevent="create">
        <input v-model="name" placeholder="Name of the new world" aria-label="Name of the new world" />
        <button type="submit" class="primary" :disabled="!name.trim()">Create</button>
        <button type="button" @click="naming = false">Cancel</button>
        <p class="muted small">It's kept in GM Notes' own folder{{ worlds.worldsDir ? ` (${worlds.worldsDir})` : '' }}; ⚙ → Data shows it.</p>
      </form>
      <DeviceJoin v-else-if="joiningDevice" @cancel="joiningDevice = false" />
      <template v-else>
        <p class="muted small">On this computer: a new world, one from a world's file, or a copy of yours from your other device, kept in sync with it.</p>
        <div class="world-actions">
          <button type="button" @click="naming = true">＋ New world…</button>
          <button type="button" title="A world's file, made with Settings → Export the world" @click="fileInput?.click()"><AppIcon ui="download" /> From a file…</button>
          <button v-if="desktop?.devices" type="button" title="A world of yours on another computer, kept in sync with it" @click="joiningDevice = true"><AppIcon ui="link" /> Pair with my other device…</button>
        </div>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="fromFile" />
        <p v-if="fileError" class="warn-text small">{{ fileError }}</p>
        <!-- worlds live in GM Notes' own folder; one kept elsewhere (a USB stick, a synced folder) is rare -->
        <p class="muted small world-elsewhere">A world kept somewhere else (a USB stick, a synced folder)? <button type="button" class="link-btn small" @click="openWorldFolder">Open it from its folder…</button></p>
      </template>
    </section>
    <!-- a local session: the DM's live session at the table -->
    <section class="world-section">
      <h5>Local session</h5>
      <div v-if="joiningLive" class="world-join">
        <LiveJoin @chosen="(s, code) => joinLive(s, code)" @cancel="joiningLive = false" />
      </div>
      <template v-else>
        <p class="muted small">Your DM's live session, hosted from their GM Notes on this network (the same Wi-Fi).</p>
        <div class="world-actions"><button type="button" @click="joiningLive = true"><AppIcon ui="share" /> Join a live session…</button></div>
      </template>
    </section>
    <!-- online: the DM's shared folder -->
    <section class="world-section">
      <h5>Online</h5>
      <div v-if="found" class="world-join">
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
      <template v-else>
        <p class="muted small">A world your DM publishes in a shared online folder (e.g. Google Drive), synced to this computer.</p>
        <div class="world-actions"><button type="button" @click="scan"><AppIcon ui="download" /> Join a shared folder…</button></div>
      </template>
    </section>
  </div>
</template>
