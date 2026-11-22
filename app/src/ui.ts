// Small bits of UI state shared between components.
import { withProgress } from './progress'
import { markRaw, reactive } from 'vue'
import type { EntryType, Id } from './model/types'
import { readImport, type ImportPlan } from './transfer'

export const ui = reactive({
  switcher: false,
  newOpen: false,
  newType: undefined as EntryType | undefined,
  newFields: {} as Record<string, unknown>,
  /** Subregions card: nested list instead of rings. */
  treeAsList: false,
  /** An exported file waiting to be imported (the import dialog shows it). */
  importPlan: null as ImportPlan | null,
  /** Where the next page scrolls to when it opens ('choices': a character's choices card on the Edit page). */
  scrollTo: '' as string,
  /** The Export the world dialog. */
  worldExport: false,
  /** The Publish for players dialog. */
  publishOpen: false,
  /** Level up asked for from the Edit button's menu: the character whose sheet opens its dialog. */
  levelUp: null as string | null,
  /** My devices: this world synced with the user's other computers (DevicesDialog.vue). */
  devices: false,
  /** Cards to print (PrintCards.vue): a title for the file, and one or more sets to choose from. */
  printCards: null as null | { name: string; sets: { label: string; ids: Id[] }[] },
})

/** Opens the card printing for some entries (spells, items); several sets offer a choice (e.g. prepared or known). */
export function printCards(name: string, sets: { label: string; ids: Id[] }[]) {
  ui.printCards = { name, sets: sets.filter(x => x.ids.length) }
}

export function newEntry(type?: EntryType, fields: Record<string, unknown> = {}) {
  // A new character is made with the creation wizard; newBlankEntry skips it.
  if (type === 'pc' && !Object.keys(fields).length) { location.hash = '/new-character'; return }
  newBlankEntry(type, fields)
}
/** The New entry dialog, for any type (a character without the wizard). */
export function newBlankEntry(type?: EntryType, fields: Record<string, unknown> = {}) {
  ui.newType = type
  ui.newFields = fields
  ui.newOpen = true
}

/** Read an exported file and show what importing it would do. */
async function startImport(file: File) {
  try {
    const plan = await withProgress('Reading the file', () => readImport(file))
    plan.bundle = markRaw(plan.bundle)
    ui.importPlan = plan
  } catch (e) { alert((e as Error).message) }
}

/** Let the user pick an exported file (an entry or a world). */
export function pickImport() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' })
  input.onchange = () => { const f = input.files?.[0]; if (f) startImport(f) }
  input.click()
}
