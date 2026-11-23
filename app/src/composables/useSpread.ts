// An ability score increase placed point by point (SpreadPicker, the creator's scores table): + and − per score, the
// points going where the bonus allows (Ability Score Improvement: +2 to one or +1 to two), never past its maximum.
// Fills in a BonusChoice once every point is placed, so the rest of the app reads it like any other pick.
import { computed, ref, watch, type Ref } from 'vue'
import type { AbilityBonus } from '../model/types'
import { bonusApplied, pickable, type BonusChoice } from '../abilityBonus'
import { ABILITY_KEYS, type Ability } from '../model/dnd'

interface Slot { group: number; amount: number; among: Ability[] }

export function useSpread(bonus: Ref<AbilityBonus | undefined>, scores: Ref<Record<Ability, number>>, choice: Ref<BonusChoice>, set: (c: BonusChoice) => void) {
  const adds = ref<Partial<Record<Ability, number>>>({})
  /** The points as a choice already made places them (coming back to a step), without the bonus's fixed part. */
  function fromChoice(): Partial<Record<Ability, number>> {
    const b = bonus.value
    if (!b) return {}
    const all = bonusApplied(b, choice.value), out: Partial<Record<Ability, number>> = {}
    for (const a of ABILITY_KEYS) { const v = (all[a] ?? 0) - (b.fixed?.[a] ?? 0); if (v > 0) out[a] = v }
    return out
  }
  adds.value = fromChoice()
  watch(bonus, () => { adds.value = fromChoice() })
  const cap = computed(() => bonus.value?.max ?? 20)
  const fixed = (a: Ability) => bonus.value?.fixed?.[a] ?? 0
  /** The ways to spend the points: the pick, and its alternative (alt). Each slot is one score raised by `amount`. */
  const variants = computed(() => {
    const b = bonus.value
    if (!b) return []
    return ([[b.pick, false], [b.orPick, true]] as const).filter(([g]) => g?.length)
      .map(([g, alt]) => ({ alt, slots: g!.flatMap((p, group) => Array.from({ length: p.count ?? 1 }, () => ({ group, amount: p.amount, among: pickable(b, p) }))) as Slot[] }))
  })
  const points = computed(() => Math.max(0, ...variants.value.map(v => v.slots.reduce((n, s) => n + s.amount, 0))))
  const spent = computed(() => Object.values(adds.value).reduce((n, v) => n + (v ?? 0), 0))
  /** Each raised score in its own slot: partly (`done` false: a slot may still take more) or exactly, all slots used. */
  function assign(a: Partial<Record<Ability, number>>, slots: Slot[], done: boolean): Map<Ability, Slot> | null {
    const want = (Object.entries(a) as [Ability, number][]).filter(([, v]) => v > 0)
    if (done && want.length !== slots.length) return null
    const used = new Set<number>(), out = new Map<Ability, Slot>()
    const go = (i: number): boolean => {
      if (i === want.length) return true
      const [ab, v] = want[i]
      for (let k = 0; k < slots.length; k++) {
        const s = slots[k]
        if (used.has(k) || !s.among.includes(ab) || (done ? s.amount !== v : s.amount < v)) continue
        used.add(k); out.set(ab, s)
        if (go(i + 1)) return true
        used.delete(k); out.delete(ab)
      }
      return false
    }
    return go(0) ? out : null
  }
  /** Whether one more point can go to a score. */
  const canAdd = (a: Ability) => {
    if (spent.value >= points.value || scores.value[a] + fixed(a) + (adds.value[a] ?? 0) >= cap.value) return false
    const next = { ...adds.value, [a]: (adds.value[a] ?? 0) + 1 }
    return variants.value.some(v => assign(next, v.slots, false))
  }
  /** Whether a score can take a point at all (the bonus lets it go there). */
  const allowed = (a: Ability) => variants.value.some(v => v.slots.some(s => s.among.includes(a)))
  function add(a: Ability, by: number) {
    const n = Math.max(0, (adds.value[a] ?? 0) + by)
    const next = { ...adds.value }
    if (n) next[a] = n; else delete next[a]
    adds.value = next
    // every point placed: the choice the app reads, else nothing picked yet
    for (const v of variants.value) {
      const m = spent.value === points.value ? assign(next, v.slots, true) : null
      if (!m) continue
      const picks: Ability[][] = []
      for (const [ab, s] of m) (picks[s.group] ??= []).push(ab)
      set({ ...(v.alt ? { alt: true } : {}), picks: Array.from({ length: picks.length }, (_, i) => picks[i] ?? []) })
      return
    }
    set({ picks: [] })
  }
  return { adds, cap, fixed, points, spent, canAdd, allowed, add }
}
