// Parts of a form added on demand: a part shows once it has something in it or was added with its "＋" button, and
// its × takes it away again (clearing what it held). The parts not shown yet are the ones offered as buttons.
import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'

export interface PartsOptions<K extends string> {
  /** Parts not offered as a button (a secret in a player's own world); shown anyway when they have something. */
  hidden?: (k: K) => boolean
  /** What closing a part does besides hiding it: usually clearing its fields. */
  onClose?: (k: K) => void
  /** The question to ask before closing a part that has something in it; no question closes it right away. */
  confirmClose?: (k: K) => string | undefined
}

/** The parts shown and the ones that can be added, in the order of `keys`; `has` tells whether a part has data. */
export function useParts<K extends string>(keys: MaybeRefOrGetter<readonly K[]>, has: (k: K) => boolean, o: PartsOptions<K> = {}) {
  const opened = ref(new Set<K>()) as Ref<Set<K>>
  const shown = computed(() => toValue(keys).filter(k => has(k) || opened.value.has(k)))
  const addable = computed(() => toValue(keys).filter(k => !shown.value.includes(k) && !o.hidden?.(k)))
  function open(k: K) { opened.value = new Set([...opened.value, k]) }
  function close(k: K) {
    const ask = has(k) ? o.confirmClose?.(k) : undefined
    if (ask && !confirm(ask)) return
    const s = new Set(opened.value); s.delete(k); opened.value = s
    o.onClose?.(k)
  }
  return { shown, addable, open, close }
}
