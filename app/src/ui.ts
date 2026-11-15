// Small bits of UI state shared between components.
import { reactive } from 'vue'
import type { EntryType } from './model/types'

export const ui = reactive({
  switcher: false,
  newOpen: false,
  newType: undefined as EntryType | undefined,
  newFields: {} as Record<string, unknown>,
})

export function newEntry(type?: EntryType, fields: Record<string, unknown> = {}) {
  ui.newType = type
  ui.newFields = fields
  ui.newOpen = true
}
