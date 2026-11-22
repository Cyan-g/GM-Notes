// Encounter maths: XP by challenge rating, and turning encounter lines into tracker combatants.
import type { Combatant, EncounterLine, Entry, Statblock } from './model/types'
import { get } from './store'
import { withSrd } from './srd'
import { trackerStats } from './sheet'
import { sheetOf } from './sheetData'
import { mod } from './model/dnd'
import { entryNamed } from './lookup'

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

/** The creature a line typed by name stands for: the world's creature with exactly that name (a "Mummy" line). */
export const creatureByName = (l: EncounterLine) => (!l.creature && l.name ? entryNamed('creature', l.name) : undefined)

export function lineInfo(l: EncounterLine) {
  const e = get(l.creature) ?? creatureByName(l)
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

// ---- difficulty (2024): the XP budget per character, by level ----
const BUDGET: [number, number, number][] = [
  [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100], [600, 1000, 1400], [750, 1300, 1700],
  [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100], [1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400],
  [2900, 4900, 6200], [3300, 5400, 7800], [3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000],
]
/**
 * How hard an encounter's XP is for a party (2024): the party's Low, Moderate and High budgets (each character's by
 * level, added up) and where the XP falls.
 */
export function difficulty(xp: number, levels: number[]): { label: string; low: number; moderate: number; high: number } | undefined {
  if (!levels.length) return undefined
  const sum = (k: 0 | 1 | 2) => levels.reduce((n, l) => n + BUDGET[Math.min(20, Math.max(1, l)) - 1][k], 0)
  const low = sum(0), moderate = sum(1), high = sum(2)
  const label = xp <= low ? (xp < low / 2 ? 'Trivial' : 'Low') : xp <= moderate ? 'Moderate' : xp <= high ? 'High' : 'Beyond High'
  return { label, low, moderate, high }
}

export function playerCombatant(pc: Entry): Combatant {
  // From the character sheet (a character without one starts with nothing filled in).
  const t = trackerStats(pc)
  return { id: newCombatantId(), name: pc.name, entry: pc.id, isPlayer: true, init: null, initMod: t?.initMod ?? 0, hp: t?.hp, maxHp: t?.maxHp, ac: t?.ac, conditions: [...(sheetOf(pc)?.conditions ?? [])] }
}
