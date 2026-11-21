// The SRD 5.2.1 monsters (seed/srd-monsters.json, read from the SRD's text): loaded when first needed, found by name.
// A creature that names one as its SRD monster uses its stats, with whatever the creature sets on top.
import { computed, shallowRef } from 'vue'
import type { Statblock } from './model/types'

interface SrdMonster { name: string; statblock: Statblock }
const data = shallowRef<Map<string, SrdMonster> | null>(null)
let loading: Promise<void> | null = null
/** Load the monsters (once). */
export function loadSrdMonsters(): Promise<void> {
  loading ??= import('./seed/srd-monsters.json').then(m => { data.value = new Map((m.default.monsters as SrdMonster[]).map(x => [x.name.toLowerCase(), x])) })
  return loading
}
/** The monsters' names, for a picker (empty until loaded). */
export const srdMonsterNames = computed(() => (data.value ? [...data.value.values()].map(x => x.name) : []))
/** An SRD monster by name: exactly, else the one name that starts with it ("Sahuagin" → Sahuagin Warrior). */
export function srdMonster(name?: string): SrdMonster | undefined {
  if (!name) return undefined
  if (!data.value) { void loadSrdMonsters(); return undefined }
  const n = name.trim().toLowerCase()
  const exact = data.value.get(n)
  if (exact) return exact
  const starts = [...data.value.values()].filter(x => x.name.toLowerCase().startsWith(n + ' '))
  return starts.length === 1 ? starts[0] : undefined
}
/** A statblock with its SRD monster's stats under it: the SRD's, then what the creature sets itself. */
export function withSrd(sb: Statblock | undefined): Statblock | undefined {
  if (!sb?.srd) return sb
  const base = srdMonster(sb.srd)?.statblock
  if (!base) return sb
  const own = Object.fromEntries(Object.entries(sb).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)))
  return { ...base, ...own }
}
