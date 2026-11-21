<script setup lang="ts">
// The start screen: opens the data folder (a path picked once and remembered, or the dev server's), offers to start
// a new world in a folder without one (5e, empty, or from a world's file; as the DM or a player), and lists the
// worlds to open. `ready` turns true once a world is open; the screen hides itself then.
import { computed, onMounted, ref, watch } from 'vue'
import { createWorld, open, save, state, type WorldStart } from '../store'
import { stage, withProgress } from '../progress'
import { FORMAT as EXPORT_FORMAT, applyImport, readImport } from '../transfer'
import { DesktopStorage, desktop, folderName } from '../storage/desktop'
import { HttpStorage } from '../storage/storage'
import { DesktopBackend, DevBackend } from '../storage/backend'
import { startSharing, syncStatus } from '../sync'
import { PENDING_JOIN, PENDING_NEW_WORLD } from '../worlds'
import WorldList from './WorldList.vue'

const ready = defineModel<boolean>('ready', { default: false })
const phase = ref<'starting' | 'need-folder' | 'new-world' | 'ready'>('starting')
watch(phase, p => { ready.value = p === 'ready' })
const startError = ref('')
/** The chosen data folder has no world in it yet: offered to start a new one there (a player's own copy). */
const emptyName = ref('')
const worldName = ref('')
/** The new world's starting content and mode: 5e starts as a player's copy, an empty world as the DM's, unless picked. */
const worldStart = ref<WorldStart | 'file'>('srd')
const modePicked = ref<'dm' | 'player' | null>(null)
const worldMode = computed(() => modePicked.value
  ?? (worldStart.value === 'srd' ? 'player' : worldStart.value === 'file' ? (worldFile.value?.dmText === false ? 'player' : 'dm') : 'dm'))

// ---- a new world from a world's file (⚙ → Export the world): only what's in the file ----
const worldFile = ref<{ file: File; from: string; exported: string; entries: number; dmText?: boolean } | null>(null)
const fileInput = ref<HTMLInputElement>()
function pickWorldFile() { worldStart.value = 'file'; fileInput.value?.click() }
async function readWorldFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  startError.value = ''
  try {
    const b = JSON.parse(await file.text())
    if (b?.format !== EXPORT_FORMAT || !Array.isArray(b.entries)) throw new Error(`${file.name} isn't a world's file. Use one made with Settings → Export the world.`)
    if (b.main) throw new Error(`${file.name} holds one entry and what it links to, not a world. Start a world, then import it with Settings → Import from a file.`)
    worldFile.value = { file, from: String(b.from ?? ''), exported: String(b.exported ?? ''), entries: b.entries.length, dmText: b.dmText }
    worldStart.value = 'file'
    if (!worldName.value.trim() && b.from) worldName.value = String(b.from)
  } catch (e) {
    worldFile.value = null
    startError.value = e instanceof SyntaxError ? `${file.name} isn't a file this app can read.` : (e as Error).message
  }
}

/** Open the data folder: a path picked once with the system dialog and remembered (or the dev server's). */
async function start(dir?: string) {
  startError.value = ''
  try {
    const found = desktop
      ? await open(new DesktopBackend(folderName(dir!)), new DesktopStorage('data', folderName(dir!)))
      : await open(new DevBackend(), new HttpStorage())
    if (found) phase.value = 'ready'
    else { emptyName.value = desktop ? folderName(dir!) : 'data'; phase.value = 'new-world' }
  } catch (e) {
    startError.value = (e as Error).message
    phase.value = 'need-folder'
  }
}

onMounted(async () => {
  if (!desktop) return start()
  const dir = await desktop.getFolder('data')
  if (dir) await start(dir)
  else phase.value = 'need-folder'
  // "New world…" made the folder and reloaded: start the world there with the name given.
  let pending: string | null = null, joining = false
  try {
    pending = sessionStorage.getItem(PENDING_NEW_WORLD); joining = !!sessionStorage.getItem(PENDING_JOIN)
    sessionStorage.removeItem(PENDING_NEW_WORLD); sessionStorage.removeItem(PENDING_JOIN)
  } catch { /* asked on the start screen */ }
  // a joined world takes the 5e start in player mode; a new one asks for its start on the start screen
  if (pending && phase.value === 'new-world') { worldName.value = pending; if (joining) await startWorld() }
  // A world that follows a shared one: up to date on start, then every few minutes; a DM's: hosting, if they asked.
  else if (phase.value === 'ready') await startSharing()
  if (joining && syncStatus.note) syncStatus.note = `Joined. ${syncStatus.note}`
})

async function startWorld() {
  startError.value = ''
  try {
    if (worldStart.value === 'file') {
      const f = worldFile.value
      if (!f) { pickWorldFile(); return }
      // an empty world, then everything in the file, with its calendar and today's date
      await withProgress('Starting the world', async () => {
        await createWorld(state.backend!, state.storage!, worldName.value, 'empty', worldMode.value)
        const plan = await readImport(f.file)
        if (plan.world) plan.world.take = true
        await applyImport(plan)
        await stage('Starting the world', 'Saving')
        await save()
      })
    } else await createWorld(state.backend!, state.storage!, worldName.value, worldStart.value, worldMode.value)
    phase.value = 'ready'
    // A joined world gets its shared world right away.
    await startSharing()
  } catch (e) { startError.value = (e as Error).message }
}

async function choose() {
  const dir = await desktop?.pickFolder('data')
  if (dir) await start(dir)
}
</script>

<template>
  <div v-if="!(phase === 'ready' && state.db)" class="start">
    <div class="start-card">
      <h1>GM Notes</h1>
      <template v-if="phase === 'starting'"><p class="muted">Opening…</p></template>
      <template v-else-if="phase === 'new-world'">
        <p>“{{ emptyName }}” has no world in it yet. Start a new one here.</p>
        <input v-model="worldName" class="start-name" placeholder="Name, e.g. your campaign or your character's name" aria-label="Name of the new world" @keydown.enter="startWorld" />
        <h4 class="start-sub">Start with</h4>
        <div class="start-choices" role="radiogroup" aria-label="Start with">
          <label class="start-choice" :class="{ on: worldStart === 'srd' }">
            <input v-model="worldStart" type="radio" value="srd" />
            <b>D&amp;D 5e</b>
            <span class="muted small">The spells, feats and other rules content of the SRD 5.2.1, races, subclasses and tools, every dropdown list, and a standard calendar to make your own.</span>
          </label>
          <label class="start-choice" :class="{ on: worldStart === 'empty' }">
            <input v-model="worldStart" type="radio" value="empty" />
            <b>Empty world</b>
            <span class="muted small">No entries, a plain calendar, and in the dropdown lists only the options the app relies on. For your own system or setting.</span>
          </label>
          <button type="button" class="start-choice" :class="{ on: worldStart === 'file' }" role="radio" :aria-checked="worldStart === 'file'" @click="pickWorldFile">
            <b>From a file…</b>
            <span v-if="worldFile" class="muted small"><b>{{ worldFile.file.name }}</b>: {{ worldFile.from || 'a world' }}, {{ worldFile.entries }} entries{{ worldFile.exported ? `, exported ${new Date(worldFile.exported).toLocaleDateString()}` : '' }}{{ worldFile.dmText === false ? ', without DM-only text' : '' }}. Click to pick another.</span>
            <span v-else class="muted small">A world's file, made with Settings → Export the world: its entries, lists, calendar and pictures, nothing else.</span>
          </button>
          <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="readWorldFile" />
        </div>
        <div class="start-mode" role="radiogroup" aria-label="Who are you">
          <label><input type="radio" :checked="worldMode === 'dm'" @change="modePicked = 'dm'" /> I'm the DM</label>
          <label><input type="radio" :checked="worldMode === 'player'" @change="modePicked = 'player'" /> I'm a player</label>
          <span class="muted small">Settings → DM mode switches later.</span>
        </div>
        <button class="primary" @click="startWorld">Start the new world</button>
        <button v-if="desktop" @click="choose">Choose another folder…</button>
        <p v-if="startError" class="error">{{ startError }}</p>
      </template>
      <template v-else>
        <template v-if="desktop">
          <h4 class="start-sub">Your worlds</h4>
          <WorldList />
        </template>
        <p v-if="desktop" class="muted small">New and joined worlds are kept in GM Notes' own folder. Have a world in a folder already? <button class="link-btn" @click="choose">Open its folder…</button></p>
        <p v-else>The dev server couldn't open the data.</p>
        <p v-if="startError" class="error">{{ startError }}</p>
      </template>
    </div>
  </div>
</template>
