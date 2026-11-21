// Whether what's shown can be changed: not when the world is read-only, nor on an entry that's read-only here (shared
// by the DM, or a player's character the DM has). The entry's page provides the latter for every card on it.
import { computed, inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import { state } from '../store'

const LOCKED: InjectionKey<ComputedRef<boolean>> = Symbol('locked')

/** The entry's page: whether its entry is read-only here, for the cards on it. */
export const provideLocked = (locked: ComputedRef<boolean>) => provide(LOCKED, locked)

/** True when nothing may be changed here. */
export function useReadOnly(): ComputedRef<boolean> {
  const locked = inject(LOCKED, null)
  return computed(() => !!state.readOnly || !!locked?.value)
}
