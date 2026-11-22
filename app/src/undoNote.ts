// A short note after an action that's easy to do by mistake at the table (a rest, removing a spell): what it did, and
// an Undo for a few seconds (UndoNote.vue shows it). Undo puts the sheet back as it was just before.
import { reactive } from 'vue'
import type { CharacterSheet, Entry } from './model/types'
import { changed } from './edit'

export const undoNote = reactive<{ text: string; undo?: () => void; n: number }>({ text: '', n: 0 })
let timer: ReturnType<typeof setTimeout> | undefined

/** Show a note; with `undo`, an Undo button. It goes after `ms`, or on the next note. */
export function noteUndo(text: string, undo?: () => void, ms = 10000) {
  undoNote.text = text
  undoNote.undo = undo
  undoNote.n++
  clearTimeout(timer)
  timer = setTimeout(closeNote, ms)
}
export function closeNote() { clearTimeout(timer); undoNote.text = ''; undoNote.undo = undefined }

/** A copy of a PC's stored sheet as it is now. */
export const snapSheet = (pc: Entry): CharacterSheet | undefined => (pc.fields.sheet ? JSON.parse(JSON.stringify(pc.fields.sheet)) : undefined)
/** Put a PC's sheet back to a copy (an Undo). */
export const restoreSheet = (pc: Entry, before: CharacterSheet | undefined) => () => {
  if (before) pc.fields.sheet = before
  else delete pc.fields.sheet
  changed(pc)
}
