<script setup lang="ts">
import PrintCards from './components/PrintCards.vue'
import AppIcon from './components/AppIcon.vue'
import ProgressBar from './components/ProgressBar.vue'
import { onMounted, onUnmounted, ref } from 'vue'
import { get, overwrite, save, state } from './store'
import { ui } from './ui'
import { desktop, type UpdateInfo } from './storage/desktop'
import { goBack, goForward, route } from './router'
import { startFlash } from './flash'
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
import RulesetView from './views/RulesetView.vue'
import CharacterWizard from './views/CharacterWizard.vue'
import NewEntryDialog from './components/NewEntryDialog.vue'
import ImportDialog from './components/ImportDialog.vue'
import ExportDialog from './components/ExportDialog.vue'
import LinkPreview from './components/LinkPreview.vue'
import TipLayer from './components/TipLayer.vue'
import StartScreen from './components/StartScreen.vue'
import PublishDialog from './components/PublishDialog.vue'
import { checkShared, isShared, syncStatus } from './sync'
import { settleCopy } from './worlds'
import { go, hrefEntry } from './router'
import { toggleFavourite } from './edit'
import { syncTitle } from './title'

syncTitle()
startFlash()

/** A world is open (StartScreen opens it). */
const ready = ref(false)
/** A new version of the desktop app: downloaded and ready to install (Windows), or out to download (Mac). */
const update = ref<UpdateInfo | null>(null)
desktop?.onUpdate(info => { update.value = info })
async function installUpdate() { if (state.dirty) await save(); desktop!.installUpdate() }

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
function onKey(ev: KeyboardEvent) {
  const mod = ev.ctrlKey || ev.metaKey
  if (mod && ev.key.toLowerCase() === 'k') { ev.preventDefault(); ui.switcher = !ui.switcher }
  else if (mod && ev.key.toLowerCase() === 's') { ev.preventDefault(); save() }
  // back and forward as in a browser, but not while typing (Alt+arrows move by word there)
  else if (ev.altKey && !mod && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && !typing(ev.target)) {
    ev.preventDefault()
    if (ev.key === 'ArrowLeft') goBack(); else goForward()
  }
  else if (!mod && !ev.altKey && !typing(ev.target) && route.current.name === 'entry' && !ui.switcher && !ui.newOpen) {
    if (ev.key === 'e' && !route.current.edit && !isShared(get(route.current.id))) { ev.preventDefault(); go(hrefEntry(route.current.id, true)) }
    else if (ev.key === 'f' && !route.current.edit) { ev.preventDefault(); toggleFavourite(route.current.id) }
    else if (ev.key === 'Escape' && route.current.edit) go(hrefEntry(route.current.id))
  }
}
// Warn before closing the tab while a save is still pending.
const reload = () => location.reload()
function beforeUnload(ev: BeforeUnloadEvent) { if (state.dirty || state.saving) { save(); ev.preventDefault() } }
/** The mouse's side buttons: back (button 3) and forward (button 4). */
function onMouseUp(ev: MouseEvent) {
  if (ev.button === 3) { ev.preventDefault(); goBack() }
  else if (ev.button === 4) { ev.preventDefault(); goForward() }
}
onMounted(() => { window.addEventListener('keydown', onKey); window.addEventListener('mouseup', onMouseUp); window.addEventListener('beforeunload', beforeUnload) })
onUnmounted(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouseUp); window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <div v-if="ready && state.db" class="shell">
    <TopBar @search="ui.switcher = true" />
    <div v-if="state.readOnly || state.error" class="save-banner" :class="{ err: state.conflict || !!state.error }" role="alert">
      <span><AppIcon :ui="state.readOnly ? 'padlock' : 'warning'" /> {{ state.readOnly || state.error }}</span>
      <button @click="reload">Reload</button>
      <button v-if="state.conflict" class="danger" @click="overwrite">Overwrite with this window's version</button>
      <button v-else-if="state.error" @click="save()">Try again</button>
    </div>
    <div v-if="state.problems.some(p => p.serious) && !state.readOnly && !state.error" class="save-banner" role="status">
      <span><AppIcon ui="warning" /> The data check found {{ state.problems.filter(p => p.serious).length }} serious problem(s) in the data. Nothing was changed.</span>
      <a class="button" href="#/data">Show them</a>
    </div>
    <div v-if="syncStatus.note || syncStatus.error" class="save-banner" :class="{ 'update-banner': !syncStatus.error }" role="status">
      <span><template v-if="syncStatus.error"><AppIcon ui="warning" /> {{ syncStatus.error }}</template><template v-else>✓ {{ syncStatus.note }}</template></span>
      <button v-if="syncStatus.error" :disabled="syncStatus.busy" @click="checkShared(true)">Try again</button>
      <button @click="syncStatus.note = ''; syncStatus.error = ''">OK</button>
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
      <template v-if="update.state === 'downloading'"><span><AppIcon ui="upgrade" /> Downloading GM Notes {{ update.version }}… {{ update.percent ?? 0 }} %</span>
        <progress class="update-progress" :value="update.percent ?? 0" max="100" /></template>
      <template v-else-if="update.state === 'ready'"><span><AppIcon ui="upgrade" /> GM Notes {{ update.version }} is downloaded.</span><button class="primary" @click="installUpdate">Restart and update</button></template>
      <template v-else-if="update.state === 'failed'"><span><AppIcon ui="upgrade" /> GM Notes {{ update.version }} couldn't be downloaded; it's tried again the next time the app starts.</span></template>
      <template v-else><span><AppIcon ui="upgrade" /> GM Notes {{ update.version }} is out.</span><button class="primary" @click="desktop!.open(update.url!)">Download</button></template>
      <button @click="update = null">{{ update.state === 'ready' || update.state === 'available' ? 'Later' : update.state === 'failed' ? 'OK' : 'Hide' }}</button>
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
      <RulesetView v-else-if="route.current.name === 'rules'" />
      <CharacterWizard v-else-if="route.current.name === 'wizard'" />
      <MapPage v-else-if="route.current.name === 'map'" :id="route.current.id" :pin="route.current.pin" :key="'map-' + route.current.id" />
      <DashboardView v-else-if="route.current.name === 'dashboard'" :id="route.current.id" :view="route.current.view" />
      <EncounterView v-else-if="route.current.name === 'entry' && get(route.current.id)?.type === 'encounter'" :id="route.current.id" :key="'enc-' + route.current.id" />
      <EditView v-else-if="route.current.name === 'entry' && route.current.edit" :id="route.current.id" :key="'edit-' + route.current.id" />
      <EntryView v-else-if="route.current.name === 'entry'" :id="route.current.id" :tab="route.current.tab" :key="route.current.id" />
    </main>
    <QuickSwitcher v-model="ui.switcher" />
    <PrintCards v-if="ui.printCards" />
    <NewEntryDialog v-model="ui.newOpen" :type="ui.newType" :fields="ui.newFields" />
    <ImportDialog v-model="ui.importPlan" />
    <ExportDialog v-model="ui.worldExport" />
    <PublishDialog v-model="ui.publishOpen" />
    <LinkPreview />
    <TipLayer />
  </div>

  <StartScreen v-model:ready="ready" />
  <ProgressBar />
</template>
