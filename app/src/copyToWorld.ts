// Copying an entry to another of your worlds (the desktop app's known worlds): it goes with everything it uses, like
// an export (transfer.ts), with DM-only text and entries players don't know. What the other world lacks of those is
// listed first; they can come along or stay out (the references to them become plain names). The copy waits in that
// world's folder; the app switches there, and on opening a world its waiting copies go through the import preview
// one after another, where anything that world has already can keep its own version.
import { markRaw, watch } from 'vue'
import type { Entry, Id } from './model/types'
import { desktop } from './storage/desktop'
import { bundleOf, planExport, readImport, type ExportPlan } from './transfer'
import { withProgress } from './progress'
import { ui } from './ui'
import { switchWorld, type KnownWorld } from './worlds'

/** What another world has, as far as telling what a copy needs: each entry's id, type and names. */
export interface TheirEntry { id: string; type: string; name: string; aliases: string[] }

const norm = (s: string) => s.trim().toLowerCase()

/** The copy of an entry: it and everything it uses, except `without`. */
export const copyPlan = (id: Id, without?: Set<Id>): ExportPlan | null =>
  planExport(id, { dmText: true, hidden: true, textLinks: false, skip: [], exclude: without?.size ? e => without.has(e.id) : undefined })

/** Whether the other world has this entry (the same one, or one of its type by that name). */
export function hasIn(e: Entry, theirs: TheirEntry[]): boolean {
  return theirs.some(t => t.type === e.type && (t.id === e.id || [t.name, ...t.aliases].some(n => norm(n) === norm(e.name))))
}
/** What the copy takes along that the other world doesn't have (the entry itself aside). */
export const missingIn = (plan: ExportPlan, theirs: TheirEntry[]): Entry[] => plan.entries.filter(e => e.id !== plan.start?.id && !hasIn(e, theirs))

/** Put the copy into the other world and switch there; the import preview comes up when it opens. */
export async function copyTo(world: KnownWorld, id: Id, without?: Set<Id>) {
  const plan = copyPlan(id, without)
  if (!plan) throw new Error('This entry can\'t be copied.')
  const bundle = await withProgress(`Copying to ${world.title}`, () => bundleOf(plan))
  await desktop!.worlds.copyTo(world.dir, JSON.stringify(bundle))
  // the other world opens on its home page (this entry may not be there yet), with the import preview over it
  location.hash = '#/'
  await switchWorld(world)
}

// ---- on opening a world: its waiting copies, one import preview after another ----
const waiting: { name: string; text: string }[] = []
async function showNext() {
  const c = waiting.shift()
  if (!c) return
  try {
    const plan = await withProgress('Reading the copy', () => readImport(new File([c.text], c.name, { type: 'application/json' })))
    plan.bundle = markRaw(plan.bundle)
    ui.importPlan = plan
  } catch (e) {
    alert(`A copy for this world couldn't be read: ${(e as Error).message}`)
    void showNext()
  }
}
/** Take the copies waiting for the open world and show the first. */
export async function takeCopies() {
  if (!desktop?.worlds.takeCopies) return
  waiting.push(...await desktop.worlds.takeCopies())
  if (!ui.importPlan) void showNext()
}
watch(() => ui.importPlan, p => { if (!p && waiting.length) void showNext() })
