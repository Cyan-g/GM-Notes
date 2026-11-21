// Several worlds in one app: each world lives in its own folder and has a permanent ID (made the first time it
// opens). The desktop app keeps the list of known worlds; switching saves the open one and reloads the pages.
import { reactive } from 'vue'
import { desktop } from './storage/desktop'
import { save, state } from './store'
import { withProgress } from './progress'

export interface KnownWorld { id: string; title: string; dir: string; opened: string; exists: boolean; current: boolean; inApp?: boolean }

export const worlds = reactive({ list: [] as KnownWorld[], worldsDir: null as string | null, loaded: false })

/** Read the list of known worlds (desktop only). */
export async function loadWorlds() {
  if (!desktop) return
  const r = await desktop.worlds.list()
  worlds.list = r.worlds
  worlds.worldsDir = r.worldsDir
  worlds.loaded = true
}

/** Saved before leaving the open world. */
async function leave() { if (state.db && (state.dirty || state.saving)) await save() }

export async function switchWorld(w: KnownWorld) {
  if (w.current) return
  await leave()
  await desktop!.worlds.switch(w.dir)
  location.reload()
}

/** Pick any folder that holds a world (or a folder for a world started elsewhere). */
export async function openWorldFolder() {
  await leave()
  if (await desktop!.pickFolder('data')) location.reload()
}

/** The name a new world is started with after the reload (see App.vue). */
export const PENDING_NEW_WORLD = 'dndesk:new-world'

/** Make a folder for a new world in the worlds folder and start it there. */
export async function newWorld(name: string) {
  await leave()
  const dir = await desktop!.worlds.create(name.trim() || 'New world')
  if (!dir) return
  try { sessionStorage.setItem(PENDING_NEW_WORLD, name.trim() || 'New world') } catch { /* the start screen asks for the name instead */ }
  location.reload()
}

/** Move a world into the app's own folder (the open one is saved first; the app starts again with it). */
export async function moveWorld(w: KnownWorld) {
  if (w.current) await leave()
  await withProgress(`Moving ${w.title}`, () => desktop!.worlds.move(w.dir))
  if (w.current) location.reload()
  else await loadWorlds()
}

export async function forgetWorld(w: KnownWorld) {
  await desktop!.worlds.forget(w.dir)
  await loadWorlds()
}

/** The open world turned out to be a copy of another: give it its own ID, or treat it as the same world, moved. */
export async function settleCopy(separate: boolean) {
  const title = state.db?.meta.title
  if (separate) state.worldId = await desktop!.worlds.newId(title)
  else await desktop!.worlds.moved(title)
  state.copyOf = null
  await loadWorlds()
}

/** Set after "Join": the new world syncs from its shared folder once it's started (see App.vue). */
export const PENDING_JOIN = 'dndesk:join'

/** Make a new world that follows a world published in a shared folder. */
export async function joinWorld(folder: string, w: { worldId: string; title: string }) {
  await leave()
  const dir = await desktop!.worlds.create(w.title)
  if (!dir) return
  await desktop!.shared.follow(folder, w.worldId)
  try { sessionStorage.setItem(PENDING_NEW_WORLD, w.title); sessionStorage.setItem(PENDING_JOIN, '1') } catch { /* the start screen asks instead */ }
  location.reload()
}

/** Make a new world that follows a DM world through its live session on this network. */
export async function joinLive(s: { host: string; port: number; worldId: string; title: string }, code: string) {
  await leave()
  const dir = await desktop!.worlds.create(s.title || 'Shared world')
  if (!dir) return
  await desktop!.shared.follow(null, s.worldId, { host: s.host, port: s.port, code })
  try { sessionStorage.setItem(PENDING_NEW_WORLD, s.title || 'Shared world'); sessionStorage.setItem(PENDING_JOIN, '1') } catch { /* the start screen asks instead */ }
  location.reload()
}
