// Whether what's shown can be changed: not when the world is read-only, nor on an entry that's read-only here (shared
// by the DM, or a player's character the DM has). The entry's page provides the latter for every card on it.
import { computed, inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import { state } from '../store'

const LOCKED: InjectionKey<ComputedRef<boolean>> = Symbol('locked')
const SHARED_OK: InjectionKey<ComputedRef<boolean>> = Symbol('sharedOk')

/** The entry's page: whether its entry is read-only here, for the cards on it. */
export const provideLocked = (locked: ComputedRef<boolean>) => provide(LOCKED, locked)

/** The entry's page: whether the parts both sides change (HP, conditions, inventory: sharedParts.ts) may change though it's locked. */
export const provideSharedEditable = (ok: ComputedRef<boolean>) => provide(SHARED_OK, ok)
/** True when the shared parts (HP, conditions, inventory) may not be changed here: a player's character at the DM's may. */
export function useReadOnlyShared(): ComputedRef<boolean> {
  const locked = inject(LOCKED, null), ok = inject(SHARED_OK, null)
  return computed(() => !!state.readOnly || (!!locked?.value && !ok?.value))
}

/** True when nothing may be changed here. */
export function useReadOnly(): ComputedRef<boolean> {
  const locked = inject(LOCKED, null)
  return computed(() => !!state.readOnly || !!locked?.value)
}
