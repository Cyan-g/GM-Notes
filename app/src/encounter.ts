// Encounter maths: XP by challenge rating, and turning encounter lines into tracker combatants.
import type { Combatant, EncounterLine, Entry, Statblock } from './model/types'
import { get } from './store'

const XP: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900,
  '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000,
  '17': 18000, '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
  '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
}
export const xpFor = (cr?: string) => (cr ? XP[cr.trim()] : undefined)
export const statsOf = (e?: Entry) => e?.fields.statblock as Statblock | undefined
export const mod = (score?: number) => (score == null ? 0 : Math.floor((score - 10) / 2))

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
  const sb = statsOf(pc)
  return { id: newCombatantId(), name: pc.name, entry: pc.id, isPlayer: true, init: null, initMod: mod(sb?.abilities?.dex), hp: sb?.hp, maxHp: sb?.hp, ac: sb?.ac, conditions: [] }
}

/** A small picture for every condition, for the toggles on the combatant cards. */
export const CONDITION_ICONS: Record<string, string> = {
  Blinded: '🙈', Charmed: '💕', Deafened: '🔇', Exhaustion: '😩', Frightened: '😱', Grappled: '🤼', Incapacitated: '💫',
  Invisible: '👻', Paralyzed: '⚡', Petrified: '🗿', Poisoned: '🤢', Prone: '🛌', Restrained: '⛓', Stunned: '😵',
  Unconscious: '💤', Concentrating: '🎯',
}
export const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Concentrating']
