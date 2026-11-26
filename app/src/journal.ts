// The campaign journal's state across its components (components/journal): the session just made in the book, which
// opens ready to write on.
import { ref, type ComputedRef, type InjectionKey } from 'vue'
import type { Id } from './model/types'
import type { PageShape } from './components/journal/bookShape'

export const writeOnOpen = ref<Id | null>(null)

/** The entry being written on a journal's right page (a session's notes, the campaign's overview): its left page shows
 * the preview meanwhile. */
export const writingOn = ref<Id | null>(null)

/** The open book's shape (bookShape.ts), from JournalBook to its pages: their frames are drawn from it. */
export const bookShapeKey: InjectionKey<ComputedRef<{ l: PageShape; r: PageShape } | null>> = Symbol('bookShape')
