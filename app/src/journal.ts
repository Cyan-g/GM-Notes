// The campaign journal's state across its components (components/journal): the session just made in the book, which
// opens ready to write on.
import { ref, type ComputedRef, type InjectionKey } from 'vue'
import type { Id } from './model/types'
import type { PageShape } from './components/journal/bookShape'

export const writeOnOpen = ref<Id | null>(null)

/** A page turning over (the book is made anew for each page's address, so this outlives it): from which page, which way. */
export const turning = ref<{ campaign: Id; from: number; dir: 'fwd' | 'back' } | null>(null)
let timer = 0
export function startTurn(campaign: Id, from: number, dir: 'fwd' | 'back') {
  clearTimeout(timer)
  turning.value = { campaign, from, dir }
  // (it ends when the page has landed, endTurn; this only in case its animation never ends)
  timer = window.setTimeout(endTurn, 3000)
}
/** The turning page has landed: the book shows the open spread alone again. (Not on a timer from the start: the turn's
 * animation starts only once its pages have rendered, so a timer would cut its last frames off.) */
export function endTurn() {
  clearTimeout(timer)
  turning.value = null
}

/** The entry being written on a journal's right page (a session's notes, the campaign's overview): its left page shows
 * the preview meanwhile. */
export const writingOn = ref<Id | null>(null)

/** The open book's shape (bookShape.ts), from JournalBook to its pages: their frames are drawn from it. */
export const bookShapeKey: InjectionKey<ComputedRef<{ l: PageShape; r: PageShape } | null>> = Symbol('bookShape')
