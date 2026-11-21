// A character's classes: each with its level, subclass and hit die. The total level is their sum; a character
// without classes keeps a plain level. Class ids are the "class" list's options (Archive → Lists); the standard
// ones are their own names, so the tables below find them even after a rename.
import type { CharacterSheet, ClassLine, Database, Entry } from './types'
import { labelIn, optionsIn, type ListOption } from './lists'
import { TYPES } from './schema'
import { CLASS_SVG } from '../icons/classes'
import { hitDieOf } from '../classRules'
import { dieSize } from './dnd'

/** The hit die each standard class brings. Another class picks its own (d8 until it does). */
export const CLASS_DIE: Record<string, string> = {
  Barbarian: 'd12', Fighter: 'd10', Paladin: 'd10', Ranger: 'd10',
  Artificer: 'd8', Bard: 'd8', Cleric: 'd8', Druid: 'd8', Monk: 'd8', Rogue: 'd8', Warlock: 'd8',
  Sorcerer: 'd6', Wizard: 'd6',
}
export const DICE = ['d12', 'd10', 'd8', 'd6']

/** A character's class lines (only well-formed ones). */
export function classesOf(pc: Entry): ClassLine[] {
  const v = pc.fields.classLevels
  return Array.isArray(v) ? v.filter(l => l && typeof l.class === 'string') : []
}
const clampLevel = (n: number) => Math.min(20, Math.max(1, Math.round(n) || 1))
/** The character's level: the sum of their class levels, or the plain level without classes. */
export function totalLevel(pc: Entry): number {
  const c = classesOf(pc)
  return clampLevel(c.length ? c.reduce((s, l) => s + (Number(l.level) || 0), 0) : Number(pc.fields.level) || 1)
}
export const dieOf = (l: ClassLine) => l.die || hitDieOf(l.class)
/** The class that defines the character: the highest level one, the first listed on a tie. */
export function mainClass(pc: Entry): ClassLine | undefined {
  return classesOf(pc).reduce<ClassLine | undefined>((best, l) => (!best || (Number(l.level) || 0) > (Number(best.level) || 0) ? l : best), undefined)
}

/** Hit dice by die size, biggest first: how many the levels give, how many are spent. */
export function hitDicePools(pc: Entry, s: CharacterSheet): { die: string; total: number; spent: number }[] {
  const totals = new Map<string, number>()
  const c = classesOf(pc)
  if (c.length) for (const l of c) totals.set(dieOf(l), (totals.get(dieOf(l)) ?? 0) + (Number(l.level) || 0))
  else totals.set(s.hitDie || 'd8', totalLevel(pc))
  return [...totals].filter(([, n]) => n > 0).sort((a, b) => dieSize(b[0]) - dieSize(a[0]))
    .map(([die, total]) => ({ die, total, spent: Math.min(total, s.hitDiceSpent?.[die] ?? 0) }))
}

/** A subclass name without its class in front ("Warlock - The Dusk Prince" → "The Dusk Prince"). */
export function withoutClass(name: string | undefined, cls: string): string | undefined {
  if (!name || !name.toLowerCase().startsWith(cls.toLowerCase())) return name
  const rest = name.slice(cls.length).replace(/^\s*[-–:]\s*/, '')
  return rest && rest !== name.slice(cls.length) ? rest : name
}

/** "Warlock 3 (The Dusk Prince) / Fighter 1"; without classes, "". */
export function classText(pc: Entry, meta: Database['meta'] | undefined, subclassName?: (id: string) => string | undefined): string {
  return classesOf(pc).map(l => {
    const cls = labelIn(meta, 'class', l.class)
    // "Warlock - The Dusk Prince" shows as "The Dusk Prince" after "Warlock 3".
    const sub = l.subclass ? withoutClass(subclassName?.(l.subclass), cls) : undefined
    return `${cls} ${l.level}${sub ? ` (${sub})` : ''}`
  }).join(' / ')
}

/** A character's class icon (game-icons.net SVG), by their main class; none for other entries or other classes. */
export function classIcon(e: Entry): { body: string; label: string } | undefined {
  if (e.type !== 'pc') return undefined
  const m = mainClass(e)
  const svg = m && CLASS_SVG[m.class]
  return svg ? { body: svg.body, label: m!.class } : undefined
}


/**
 * Class lines from the old free text ("Warlock/Fighter", "Druid and Cleric"): each name as the class list's option
 * with that id or name; `find` gives the id of a name that isn't one (adding it to the list). One class takes the
 * old level, several start at level 1 each.
 */
export function parseClassText(text: string, level: unknown, find: (name: string) => string): ClassLine[] {
  const names = text.split(/\s*(?:\/|,|&|\+|\band\b)\s*/i).map(n => n.trim()).filter(Boolean)
  return names.map(n => ({ class: find(n), level: names.length === 1 && Number(level) ? clampLevel(Number(level)) : 1 }))
}
/** `find` for parseClassText against a world's class list: the option by name, or a new option added to `list`. */
export function classFinder(meta: Database['meta'], list: ListOption[] = optionsIn(meta, 'class').map(o => ({ ...o }))) {
  return {
    list,
    find(name: string) {
      const low = name.toLowerCase()
      const o = list.find(x => x.id.toLowerCase() === low || x.label.toLowerCase() === low)
      if (o) return o.id
      const label = name.charAt(0).toUpperCase() + name.slice(1)
      list.push({ id: label, label })
      return label
    },
  }
}
