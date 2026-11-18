// Small bits of UI state shared between components.
import { markRaw, reactive } from 'vue'
import type { EntryType } from './model/types'
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
  /** The Export the world dialog. */
  worldExport: false,
  /** The character sheet shows its build controls (scores, proficiencies, features…), not just what changes in play. */
  sheetEdit: false,
})

export function newEntry(type?: EntryType, fields: Record<string, unknown> = {}) {
  ui.newType = type
  ui.newFields = fields
  ui.newOpen = true
}

/** Read an exported file and show what importing it would do. */
async function startImport(file: File) {
  try {
    const plan = await readImport(file)
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
