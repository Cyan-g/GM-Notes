// Encounter maths: XP by challenge rating, and turning encounter lines into tracker combatants.
import type { Combatant, EncounterLine, Entry, Statblock } from './model/types'
import { get } from './store'
import { withSrd } from './srd'
import { sheetOf, trackerStats } from './sheet'
import { mod } from './model/dnd'

const XP: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900,
  '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000,
  '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
}
export const xpFor = (cr?: string) => (cr ? XP[cr.trim()] : undefined)
/** A creature's statblock: its own, on top of its SRD monster's when it names one. */
export function statsOf(e?: Entry, depth = 0): Statblock | undefined {
  const sb = e?.fields.statblock as Statblock | undefined
  // based on a creature of this world: its stats (themselves maybe on an SRD monster), with this one's on top
  const base = sb?.base && depth < 5 ? statsOf(get(sb.base), depth + 1) : undefined
  if (!base) return withSrd(sb)
  const own = Object.fromEntries(Object.entries(sb!).filter(([k, v]) => k !== 'base' && v != null && v !== '' && !(Array.isArray(v) && !v.length)))
  return { ...base, ...own }
}

export function lineInfo(l: EncounterLine) {
  const e = get(l.creature)
  const sb = statsOf(e)
  return {
    name: e?.name ?? l.name ?? '?',
    entry: e,
    hp: l.hp ?? sb?.hp,
    ac: l.ac ?? sb?.ac,
    initMod: l.init ?? mod(sb?.abilities?.dex),
    cr: sb?.cr,
    xp: xpFor(sb?.cr),
  }
}

let seq = 0
export const newCombatantId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`

/** One combatant per creature: "Mummy 1", "Mummy 2", … */
export function combatantsFrom(lines: EncounterLine[]): Combatant[] {
  const out: Combatant[] = []
  for (const l of lines) {
    const info = lineInfo(l)
    for (let i = 1; i <= Math.max(1, l.count); i++) {
      out.push({
        id: newCombatantId(), name: l.count > 1 ? `${info.name} ${i}` : info.name, entry: info.entry?.id,
        isPlayer: false, init: null, initMod: info.initMod, hp: info.hp, maxHp: info.hp, ac: info.ac, conditions: [],
      })
    }
  }
  return out
}

export function playerCombatant(pc: Entry): Combatant {
  // From the character sheet (a character without one starts with nothing filled in).
  const t = trackerStats(pc)
  return { id: newCombatantId(), name: pc.name, entry: pc.id, isPlayer: true, init: null, initMod: t?.initMod ?? 0, hp: t?.hp, maxHp: t?.maxHp, ac: t?.ac, conditions: [...(sheetOf(pc)?.conditions ?? [])] }
}
