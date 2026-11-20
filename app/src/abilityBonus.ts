// Ability score bonuses of races and feats (their abilityIncrease field): fixed bonuses ("+2 Con"), picks the player
// makes ("+1 to one score", "+1 Strength or Dexterity"), an alternative set of picks, and a cap on the raised score.
// Kept as data only: nothing here changes a character sheet. The character creation wizard will offer it.
import type { Abilities, AbilityBonus, AbilityPick } from './model/types'

type Ability = keyof Abilities
export const ABILITY_KEYS: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
export const ABILITY_SHORT: Record<Ability, string> = { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' }
export const ABILITY_NAME: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six']
const sign = (n: number) => (n < 0 ? `−${-n}` : `+${n}`)
const orList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0] ?? '')

function pickText(p: AbilityPick, other: boolean): string {
  const n = p.count ?? 1
  if (p.among?.length) {
    if (n === 1) return `${sign(p.amount)} ${orList(p.among.map(a => ABILITY_NAME[a]))}`
    return `${sign(p.amount)} to ${WORDS[n] ?? n} of ${p.among.map(a => ABILITY_SHORT[a]).join(', ')}`
  }
  return `${sign(p.amount)} to ${WORDS[n] ?? n} ${other ? 'other ' : ''}score${n === 1 ? '' : 's'}`
}
const picksText = (ps: AbilityPick[], fixed: boolean) => ps.map((p, i) => pickText(p, fixed || i > 0)).join(', ')

/** "+2 Con, +1 Wis", "+1 to all scores", "+2 to one score or +1 to two scores (max 20)". */
export function abilityBonusText(b: AbilityBonus | undefined): string {
  if (!b) return ''
  const fixed = ABILITY_KEYS.filter(a => b.fixed?.[a]).sort((x, y) => b.fixed![y]! - b.fixed![x]!)
  const all = fixed.length === 6 && fixed.every(a => b.fixed![a] === b.fixed!.str)
  const parts = [all ? `${sign(b.fixed!.str!)} to all scores` : fixed.map(a => `${sign(b.fixed![a]!)} ${ABILITY_SHORT[a]}`).join(', ')]
  // Every pick from the same few scores (a 2024 background): "Str, Dex or Con: +2 to one, +1 to another or +1 to all three".
  const picks = [...(b.pick ?? []), ...(b.orPick ?? [])], among = picks[0]?.among
  const same = !fixed.length && picks.length > 1 && among && among.length > 1 && picks.every(p => p.among?.join() === among.join())
  if (same) {
    const plain = (ps: AbilityPick[]) => ps.map((p, i) => {
      const n = p.count ?? 1
      return `${sign(p.amount)} ${n === among.length ? `to all ${WORDS[n] ?? n}` : n > 1 ? `to ${WORDS[n] ?? n}` : i ? 'to another' : 'to one'}`
    }).join(', ')
    const one = plain(b.pick ?? []), two = plain(b.orPick ?? [])
    parts.push(`${orList(among.map(a => ABILITY_SHORT[a]))}: ${two ? `${one} or ${two}` : one}`)
  } else {
    const pick = picksText(b.pick ?? [], fixed.length > 0), or = picksText(b.orPick ?? [], fixed.length > 0)
    if (pick) parts.push(or ? `${pick} or ${or}` : pick)
  }
  let text = parts.filter(Boolean).join(', ')
  if (b.max) text += ` (max ${b.max})`
  return [text, b.note].filter(Boolean).join('. ')
}

/** Leaves out what's empty; undefined when nothing is left. */
export function cleanBonus(b: AbilityBonus): AbilityBonus | undefined {
  const c: AbilityBonus = {}
  const fixed = Object.fromEntries(ABILITY_KEYS.filter(a => b.fixed?.[a]).map(a => [a, b.fixed![a]]))
  if (Object.keys(fixed).length) c.fixed = fixed
  const picks = (ps?: AbilityPick[]) => (ps ?? []).filter(p => p.amount).map(p => {
    const q: AbilityPick = { amount: p.amount }
    if ((p.count ?? 1) > 1) q.count = p.count
    if (p.among?.length) q.among = ABILITY_KEYS.filter(a => p.among!.includes(a))
    return q
  })
  const pick = picks(b.pick), orPick = picks(b.orPick)
  if (pick.length) c.pick = pick
  if (orPick.length) { if (pick.length) c.orPick = orPick; else c.pick = orPick }
  if (b.max) c.max = b.max
  if (b.note?.trim()) c.note = b.note.trim()
  return Object.keys(c).length ? c : undefined
}

const abilityOf = (word: string): Ability | undefined => ABILITY_KEYS.find(a => word.toLowerCase().startsWith(a))
const countOf = (word: string) => { const n = WORDS.indexOf(word.toLowerCase()); return n > 0 ? n : Number(word) || 1 }

function parsePart(part: string, b: AbilityBonus): AbilityPick | 'fixed' | undefined {
  // "Increase either Strength or Dexterity by 1"
  let m = part.match(/^increase\s+(?:either\s+|one of\s+)?(.+?)\s+by\s+(\d+)$/i)
  if (m) {
    const among = m[1].split(/,\s*|\s+or\s+/).map(abilityOf)
    return among.every(Boolean) ? { amount: Number(m[2]), ...(among.length < 6 ? { among: among as Ability[] } : {}) } : undefined
  }
  // "+1 to one score", "+1 to two"
  m = part.match(/^\+(\d+)\s+to\s+(one|two|three|four|five|six|\d+)(?:\s+(?:other\s+|different\s+)?(?:ability\s+)?scores?)?$/i)
  if (m) return { amount: Number(m[1]), count: countOf(m[2]) }
  // "+1 Strength or Dexterity", "+1 Intelligence, Wisdom or Charisma"
  m = part.match(/^\+(\d+)\s+(.+\s+or\s+.+)$/i)
  if (m) {
    const among = m[2].split(/,\s*|\s+or\s+/).map(abilityOf)
    return among.every(Boolean) ? { amount: Number(m[1]), among: among as Ability[] } : undefined
  }
  // "+2 Str, +1 Cha"
  const fixed = part.split(/,\s*|\s+and\s+/).map(x => x.match(/^([+\-−]\d+)\s+(\w+)$/))
  if (fixed.every(x => x && abilityOf(x[2]))) {
    for (const x of fixed) { const a = abilityOf(x![2])!; (b.fixed ??= {})[a] = (b.fixed[a] ?? 0) + Number(x![1].replace('−', '-')) }
    return 'fixed'
  }
  return undefined
}

/** Reads a bonus written as text (what the field held before data version 27); what it can't read stays as a note. */
export function parseAbilityBonus(text: string): AbilityBonus | undefined {
  let t = text.trim().replace(/\.$/, '')
  if (!t) return undefined
  const b: AbilityBonus = {}
  const max = t.match(/\s*\(?\s*(?:,\s*)?(?:up to\s+)?(?:a\s+)?max(?:imum)?(?:\s+of)?\s+(\d+)\s*\)?$/i)
  if (max) { b.max = Number(max[1]); t = t.slice(0, max.index).trim() }
  const all = t.match(/^\+(\d+)\s+to\s+(?:all|every)\b/i)
  if (all) { b.fixed = Object.fromEntries(ABILITY_KEYS.map(a => [a, Number(all[1])])); return b }
  // An alternative: "+2 to one score or +1 to two"
  const alts = t.split(/\s+or\s+(?=\+)/i)
  if (alts.length === 2) {
    const [x, y] = alts.map(a => parsePart(a, b))
    if (x && y && x !== 'fixed' && y !== 'fixed') return { ...b, pick: [x], orPick: [y] }
    return { note: text.trim() }
  }
  const r = parsePart(t, b)
  if (!r) return { note: text.trim() }
  if (r !== 'fixed') b.pick = [r]
  return b
}

// ---- choosing: what the player picks for a bonus's picks (the character creation wizard) ----

/** The player's picks for a bonus: which set (the picks, or the alternative ones) and the scores chosen for each pick. */
export interface BonusChoice { alt?: boolean; picks: Ability[][] }
/** The picks a choice works through. */
export const picksIn = (b: AbilityBonus | undefined, c?: BonusChoice): AbilityPick[] => ((c?.alt && b?.orPick?.length ? b.orPick : b?.pick) ?? [])
/** The scores a pick can take: its `among` list, else any; never one already raised by the bonus's fixed part. */
export const pickable = (b: AbilityBonus, p: AbilityPick): Ability[] => (p.among?.length ? p.among : ABILITY_KEYS).filter(a => !b.fixed?.[a])
/** How many scores are still to be chosen. */
export function bonusOpen(b: AbilityBonus | undefined, c?: BonusChoice): number {
  return picksIn(b, c).reduce((n, p, i) => n + Math.max(0, (p.count ?? 1) - (c?.picks[i]?.length ?? 0)), 0)
}
/** What the bonus adds with these picks: the fixed part and every chosen score. */
export function bonusApplied(b: AbilityBonus | undefined, c?: BonusChoice): Partial<Abilities> {
  const out: Partial<Abilities> = { ...(b?.fixed ?? {}) }
  picksIn(b, c).forEach((p, i) => { for (const a of (c?.picks[i] ?? []).slice(0, p.count ?? 1)) out[a] = (out[a] ?? 0) + p.amount })
  return out
}
