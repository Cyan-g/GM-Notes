// The campaign journal's state across its components (components/journal): the session just made in the book, which
// opens ready to write on.
import { ref } from 'vue'
import type { Id } from './model/types'

export const writeOnOpen = ref<Id | null>(null)

/** A page turning over (the book is made anew for each page's address, so this outlives it): from which page, which way. */
export const turning = ref<{ campaign: Id; from: number; dir: 'fwd' | 'back' } | null>(null)
let timer = 0
export function startTurn(campaign: Id, from: number, dir: 'fwd' | 'back') {
  clearTimeout(timer)
  turning.value = { campaign, from, dir }
  timer = window.setTimeout(() => { turning.value = null }, 600)
}

/** The entry being written on a journal's right page (a session's notes, the campaign's overview): its left page shows
 * the preview meanwhile. */
export const writingOn = ref<Id | null>(null)
