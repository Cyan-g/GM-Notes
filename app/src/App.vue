<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createWorld, get, open, overwrite, save, state } from './store'
import { ui } from './ui'
import { DesktopStorage, desktop, folderName, type UpdateInfo } from './storage/desktop'
import { FolderStorage, HttpStorage, folderApiAvailable, newWorldFolder, pickFolder, regrant, rememberFolder, rememberedFolder } from './storage/storage'
import { route } from './router'
import TopBar from './components/TopBar.vue'
import QuickSwitcher from './components/QuickSwitcher.vue'
import HomeView from './views/HomeView.vue'
import ListView from './views/ListView.vue'
import EntryView from './views/EntryView.vue'
import EditView from './views/EditView.vue'
import EncounterView from './views/EncounterView.vue'
import DashboardView from './views/DashboardView.vue'
import CalendarView from './views/CalendarView.vue'
import TrackerView from './views/TrackerView.vue'
import SpellbookView from './views/SpellbookView.vue'
import CraftingView from './views/CraftingView.vue'
import AtlasView from './views/AtlasView.vue'
import OrgsView from './views/OrgsView.vue'
import MapPage from './views/MapPage.vue'
import DataView from './views/DataView.vue'
import NewEntryDialog from './components/NewEntryDialog.vue'
import ImportDialog from './components/ImportDialog.vue'
import LinkPreview from './components/LinkPreview.vue'
import { go, hrefEntry } from './router'
import { toggleFavourite } from './edit'
import { syncTitle } from './title'

syncTitle()

const phase = ref<'starting' | 'need-folder' | 'no-api' | 'new-world' | 'ready'>('starting')
const remembered = ref<FileSystemDirectoryHandle | null>(null)
const startError = ref('')

/** A picked folder without a world in it: offered to start a new one there (a player's own copy). */
const emptyFolder = ref<FileSystemDirectoryHandle | null>(null)
const emptyName = ref('')
const worldName = ref('')

async function useHandle(h: FileSystemDirectoryHandle) {
  try {
    const s = new FolderStorage(h)
    if (await s.readText('eldoria.json') == null) { emptyFolder.value = h; emptyName.value = h.name; phase.value = 'new-world'; return }
    await open(s)
    phase.value = 'ready'
  } catch (e) {
    startError.value = (e as Error).message
    phase.value = 'need-folder'
  }
}

/** A new version of the desktop app: downloaded and ready to install (Windows), or out to download (Mac). */
const update = ref<UpdateInfo | null>(null)
desktop?.onUpdate(info => { update.value = info })
async function installUpdate() { if (state.dirty) await save(); desktop!.installUpdate() }

/** The desktop app: the data folder is a path, picked once with the system dialog and remembered. */
async function useDesktop(dir: string) {
  try {
    const s = new DesktopStorage('data', folderName(dir))
    if (await s.readText('eldoria.json') == null) { emptyName.value = folderName(dir); phase.value = 'new-world'; return }
    await open(s)
    phase.value = 'ready'
  } catch (e) {
    startError.value = (e as Error).message
    phase.value = 'need-folder'
  }
}

onMounted(async () => {
  if (desktop) {
    const dir = await desktop.getFolder('data')
    if (dir) return useDesktop(dir)
    phase.value = 'need-folder'
    return
  }
  if (import.meta.env.DEV) {
    try { await open(new HttpStorage()); phase.value = 'ready' }
    catch (e) { startError.value = (e as Error).message; phase.value = 'need-folder' }
    return
  }
  if (!folderApiAvailable()) { phase.value = 'no-api'; return }
  const r = await rememberedFolder()
  if (r?.granted) return useHandle(r.handle)
  remembered.value = r?.handle ?? null
  phase.value = 'need-folder'
})

async function startWorld() {
  startError.value = ''
  if (desktop) {
    try { await createWorld(new DesktopStorage('data', emptyName.value), worldName.value); phase.value = 'ready' }
    catch (e) { startError.value = (e as Error).message }
    return
  }
  if (!emptyFolder.value) return
  try {
    const dir = await newWorldFolder(emptyFolder.value)
    await rememberFolder(dir)
    await createWorld(new FolderStorage(dir), worldName.value)
    phase.value = 'ready'
  } catch (e) { startError.value = (e as Error).message }
}

async function reconnect() {
  startError.value = ''
  if (remembered.value && await regrant(remembered.value)) return useHandle(remembered.value)
  await choose()
}
async function choose() {
  startError.value = ''
  if (desktop) { const dir = await desktop.pickFolder('data'); if (dir) await useDesktop(dir); return }
  try { await useHandle(await pickFolder()) }
  catch (e) { if ((e as DOMException).name !== 'AbortError') startError.value = (e as Error).message }
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
function onKey(ev: KeyboardEvent) {
  const mod = ev.ctrlKey || ev.metaKey
  if (mod && ev.key.toLowerCase() === 'k') { ev.preventDefault(); ui.switcher = !ui.switcher }
  else if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); save() }
  else if (!mod && !ev.altKey && !typing(ev.target) && route.current.name === 'entry' && !ui.switcher && !ui.newOpen) {
    if (ev.key === 'e' && !route.current.edit) { ev.preventDefault(); go(hrefEntry(route.current.id, true)) }
    else if (ev.key === 'f' && !route.current.edit) { ev.preventDefault(); toggleFavourite(route.current.id) }
    else if (ev.key === 'Escape' && route.current.edit) go(hrefEntry(route.current.id))
  }
}
// Warn before closing the tab while a save is still pending.
const reload = () => location.reload()
function beforeUnload(ev: BeforeUnloadEvent) { if (state.dirty || state.saving) { save(); ev.preventDefault() } }
onMounted(() => { window.addEventListener('keydown', onKey); window.addEventListener('beforeunload', beforeUnload) })
onUnmounted(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <div v-if="phase === 'ready' && state.db" class="shell">
    <TopBar @search="ui.switcher = true" />
    <div v-if="state.readOnly || state.error" class="save-banner" :class="{ err: state.conflict || !!state.error }" role="alert">
      <span>{{ state.readOnly ? '🔒 ' + state.readOnly : '⚠ ' + state.error }}</span>
      <button @click="reload">Reload</button>
      <button v-if="state.conflict" class="danger" @click="overwrite">Overwrite with this tab's version</button>
      <button v-else-if="state.error" @click="save()">Try again</button>
    </div>
    <div v-if="state.problems.some(p => p.serious) && !state.readOnly && !state.error" class="save-banner" role="status">
      <span>⚠ The data check found {{ state.problems.filter(p => p.serious).length }} serious problem(s) in the data. Nothing was changed.</span>
      <a class="button" href="#/data" @click="state.problems = []">Show them</a>
    </div>
    <div v-if="update" class="save-banner update-banner" role="status">
      <template v-if="update.state === 'ready'"><span>⬆ DnDesk {{ update.version }} is downloaded.</span><button class="primary" @click="installUpdate">Restart and update</button></template>
      <template v-else><span>⬆ DnDesk {{ update.version }} is out.</span><button class="primary" @click="desktop!.open(update.url!)">Download</button></template>
      <button @click="update = null">Later</button>
    </div>
    <main class="main">
      <HomeView v-if="route.current.name === 'home'" />
      <ListView v-else-if="route.current.name === 'list'" :type="route.current.type" />
      <CalendarView v-else-if="route.current.name === 'calendar'" :year="route.current.year" :month="route.current.month" />
      <TrackerView v-else-if="route.current.name === 'tracker'" />
      <SpellbookView v-else-if="route.current.name === 'spellbook'" />
      <CraftingView v-else-if="route.current.name === 'crafting'" />
      <AtlasView v-else-if="route.current.name === 'atlas'" :tab="route.current.tab" />
      <OrgsView v-else-if="route.current.name === 'orgs'" />
      <DataView v-else-if="route.current.name === 'data'" />
      <MapPage v-else-if="route.current.name === 'map'" :id="route.current.id" :pin="route.current.pin" :key="'map-' + route.current.id" />
      <DashboardView v-else-if="route.current.name === 'dashboard'" :id="route.current.id" :view="route.current.view" />
      <EncounterView v-else-if="route.current.name === 'entry' && get(route.current.id)?.type === 'encounter'" :id="route.current.id" :key="'enc-' + route.current.id" />
      <EditView v-else-if="route.current.name === 'entry' && route.current.edit" :id="route.current.id" :key="'edit-' + route.current.id" />
      <EntryView v-else-if="route.current.name === 'entry'" :id="route.current.id" :tab="route.current.tab" :key="route.current.id" />
    </main>
    <QuickSwitcher v-model="ui.switcher" />
    <NewEntryDialog v-model="ui.newOpen" :type="ui.newType" :fields="ui.newFields" />
    <ImportDialog v-model="ui.importPlan" />
    <LinkPreview />
  </div>

  <div v-else class="start">
    <div class="start-card">
      <h1>DnDesk</h1>
      <template v-if="phase === 'starting'"><p class="muted">Opening…</p></template>
      <template v-else-if="phase === 'no-api'">
        <p>This browser can't open folders on your computer, so the app can't read or save your data.</p>
        <ul>
          <li><b>Edge or Chrome:</b> works out of the box.</li>
          <li><b>Brave:</b> open <code>brave://flags/#file-system-access-api</code>, set it to <i>Enabled</i>, restart Brave.</li>
          <li><b>Firefox / Safari:</b> not supported.</li>
        </ul>
      </template>
      <template v-else-if="phase === 'new-world'">
        <p>“{{ emptyName }}” has no world in it yet.</p>
        <p class="muted small">Start a new one here, for example as a player keeping the spells, recipes and maps your DM shares.
          It starts in player mode; ⚙ → DM mode switches.</p>
        <input v-model="worldName" placeholder="Name, e.g. your character's name" @keydown.enter="startWorld" />
        <button class="primary" @click="startWorld">Start a new world here</button>
        <button @click="choose">Choose another folder…</button>
        <p v-if="startError" class="error">{{ startError }}</p>
      </template>
      <template v-else>
        <p v-if="desktop">Choose your <b>data</b> folder (or the folder that holds it). DnDesk remembers it, so this is needed only once.</p>
        <p v-else>Choose the folder this file is in (or the <b>data</b> folder inside it). The browser remembers it, so this is needed only once.</p>
        <button v-if="remembered" class="primary" @click="reconnect">Open “{{ remembered.name }}” again</button>
        <button :class="{ primary: !remembered }" @click="choose">Choose folder…</button>
        <p v-if="startError" class="error">{{ startError }}</p>
      </template>
    </div>
  </div>
</template>
