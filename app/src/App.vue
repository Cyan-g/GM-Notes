<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createWorld, get, open, overwrite, save, state } from './store'
import { ui } from './ui'
import { DesktopStorage, desktop, folderName, type UpdateInfo } from './storage/desktop'
import { HttpStorage } from './storage/storage'
import { DesktopBackend, DevBackend } from './storage/backend'
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
import CalendarEditView from './views/CalendarEditView.vue'
import TrackerView from './views/TrackerView.vue'
import SpellbookView from './views/SpellbookView.vue'
import CraftingView from './views/CraftingView.vue'
import AtlasView from './views/AtlasView.vue'
import OrgsView from './views/OrgsView.vue'
import MapPage from './views/MapPage.vue'
import DataView from './views/DataView.vue'
import ListsView from './views/ListsView.vue'
import NewEntryDialog from './components/NewEntryDialog.vue'
import ImportDialog from './components/ImportDialog.vue'
import ExportDialog from './components/ExportDialog.vue'
import LinkPreview from './components/LinkPreview.vue'
import WorldList from './components/WorldList.vue'
import { PENDING_NEW_WORLD, settleCopy } from './worlds'
import { go, hrefEntry } from './router'
import { toggleFavourite } from './edit'
import { syncTitle } from './title'

syncTitle()

const phase = ref<'starting' | 'need-folder' | 'new-world' | 'ready'>('starting')
const startError = ref('')
/** The chosen data folder has no world in it yet: offered to start a new one there (a player's own copy). */
const emptyName = ref('')
const worldName = ref('')

/** A new version of the desktop app: downloaded and ready to install (Windows), or out to download (Mac). */
const update = ref<UpdateInfo | null>(null)
desktop?.onUpdate(info => { update.value = info })
async function installUpdate() { if (state.dirty) await save(); desktop!.installUpdate() }

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
  let pending: string | null = null
  try { pending = sessionStorage.getItem(PENDING_NEW_WORLD); sessionStorage.removeItem(PENDING_NEW_WORLD) } catch { /* asked on the start screen */ }
  if (pending && phase.value === 'new-world') { worldName.value = pending; await startWorld() }
})

async function startWorld() {
  startError.value = ''
  try {
    await createWorld(state.backend!, state.storage!, worldName.value)
    phase.value = 'ready'
  } catch (e) { startError.value = (e as Error).message }
}

async function choose() {
  const dir = await desktop?.pickFolder('data')
  if (dir) await start(dir)
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
      <button v-if="state.conflict" class="danger" @click="overwrite">Overwrite with this window's version</button>
      <button v-else-if="state.error" @click="save()">Try again</button>
    </div>
    <div v-if="state.problems.some(p => p.serious) && !state.readOnly && !state.error" class="save-banner" role="status">
      <span>⚠ The data check found {{ state.problems.filter(p => p.serious).length }} serious problem(s) in the data. Nothing was changed.</span>
      <a class="button" href="#/data">Show them</a>
    </div>
    <div v-if="state.copyOf" class="save-banner" role="status">
      <span>This world looks like a copy of “{{ state.copyOf.title }}” ({{ state.copyOf.dir }}): both have the same world ID.</span>
      <button title="Give this one its own ID; players following the other world won't get this one" @click="settleCopy(true)">Make it a separate world</button>
      <button title="Forget the old folder in the list of worlds" @click="settleCopy(false)">It's the same world, moved</button>
    </div>
    <div v-if="state.converted" class="save-banner update-banner" role="status">
      <span>✓ Your data moved into the database (dndesk.sqlite): {{ state.converted.entries }} entries and {{ state.converted.relations }} relations, all checked. The old eldoria.json and session.json stay in the data folder, untouched.</span>
      <button @click="state.converted = null">OK</button>
    </div>
    <div v-if="update" class="save-banner update-banner" role="status">
      <template v-if="update.state === 'ready'"><span>⬆ DnDesk {{ update.version }} is downloaded.</span><button class="primary" @click="installUpdate">Restart and update</button></template>
      <template v-else><span>⬆ DnDesk {{ update.version }} is out.</span><button class="primary" @click="desktop!.open(update.url!)">Download</button></template>
      <button @click="update = null">Later</button>
    </div>
    <main class="main">
      <HomeView v-if="route.current.name === 'home'" />
      <ListView v-else-if="route.current.name === 'list'" :type="route.current.type" />
      <CalendarEditView v-else-if="route.current.name === 'calendar' && route.current.edit" />
      <CalendarView v-else-if="route.current.name === 'calendar'" :year="route.current.year" :month="route.current.month" />
      <TrackerView v-else-if="route.current.name === 'tracker'" />
      <SpellbookView v-else-if="route.current.name === 'spellbook'" />
      <CraftingView v-else-if="route.current.name === 'crafting'" />
      <AtlasView v-else-if="route.current.name === 'atlas'" :tab="route.current.tab" />
      <OrgsView v-else-if="route.current.name === 'orgs'" />
      <DataView v-else-if="route.current.name === 'data'" />
      <ListsView v-else-if="route.current.name === 'lists'" />
      <MapPage v-else-if="route.current.name === 'map'" :id="route.current.id" :pin="route.current.pin" :key="'map-' + route.current.id" />
      <DashboardView v-else-if="route.current.name === 'dashboard'" :id="route.current.id" :view="route.current.view" />
      <EncounterView v-else-if="route.current.name === 'entry' && get(route.current.id)?.type === 'encounter'" :id="route.current.id" :key="'enc-' + route.current.id" />
      <EditView v-else-if="route.current.name === 'entry' && route.current.edit" :id="route.current.id" :key="'edit-' + route.current.id" />
      <EntryView v-else-if="route.current.name === 'entry'" :id="route.current.id" :tab="route.current.tab" :key="route.current.id" />
    </main>
    <QuickSwitcher v-model="ui.switcher" />
    <NewEntryDialog v-model="ui.newOpen" :type="ui.newType" :fields="ui.newFields" />
    <ImportDialog v-model="ui.importPlan" />
    <ExportDialog v-model="ui.worldExport" />
    <LinkPreview />
  </div>

  <div v-else class="start">
    <div class="start-card">
      <h1>DnDesk</h1>
      <template v-if="phase === 'starting'"><p class="muted">Opening…</p></template>
      <template v-else-if="phase === 'new-world'">
        <p>“{{ emptyName }}” has no world in it yet.</p>
        <p class="muted small">Start a new one here, for example as a player keeping what your DM shares. It comes with the dropdown lists, a standard calendar to make your own, races, subclasses, spells, feats and tools.
          It starts in player mode; ⚙ → DM mode switches.</p>
        <input v-model="worldName" placeholder="Name, e.g. your character's name" @keydown.enter="startWorld" />
        <button class="primary" @click="startWorld">Start a new world here</button>
        <button v-if="desktop" @click="choose">Choose another folder…</button>
        <p v-if="startError" class="error">{{ startError }}</p>
      </template>
      <template v-else>
        <template v-if="desktop">
          <h4 class="start-sub">Your worlds</h4>
          <WorldList />
        </template>
        <p v-if="desktop" class="muted small">Or choose a <b>data</b> folder (or the folder that holds it).</p>
        <p v-else>The dev server couldn't open the data.</p>
        <button v-if="desktop" class="primary" @click="choose">Choose folder…</button>
        <p v-if="startError" class="error">{{ startError }}</p>
      </template>
    </div>
  </div>
</template>
