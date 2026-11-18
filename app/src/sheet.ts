// A player character's sheet: what's stored on the PC entry (fields.sheet) and the numbers worked out from it
// with the 5e rules: modifiers, proficiency bonus, saves, skills, armor class, attacks and spellcasting.
import type { Abilities, CharacterSheet, Entry, Id } from './model/types'
import { get } from './store'

export type Ability = keyof Abilities
export const ABILITIES: { key: Ability; label: string; short: string }[] = [
  { key: 'str', label: 'Strength', short: 'STR' }, { key: 'dex', label: 'Dexterity', short: 'DEX' },
  { key: 'con', label: 'Constitution', short: 'CON' }, { key: 'int', label: 'Intelligence', short: 'INT' },
  { key: 'wis', label: 'Wisdom', short: 'WIS' }, { key: 'cha', label: 'Charisma', short: 'CHA' },
]
export const SKILLS: { name: string; ability: Ability }[] = [
  { name: 'Acrobatics', ability: 'dex' }, { name: 'Animal Handling', ability: 'wis' }, { name: 'Arcana', ability: 'int' },
  { name: 'Athletics', ability: 'str' }, { name: 'Deception', ability: 'cha' }, { name: 'History', ability: 'int' },
  { name: 'Insight', ability: 'wis' }, { name: 'Intimidation', ability: 'cha' }, { name: 'Investigation', ability: 'int' },
  { name: 'Medicine', ability: 'wis' }, { name: 'Nature', ability: 'int' }, { name: 'Perception', ability: 'wis' },
  { name: 'Performance', ability: 'cha' }, { name: 'Persuasion', ability: 'cha' }, { name: 'Religion', ability: 'int' },
  { name: 'Sleight of Hand', ability: 'dex' }, { name: 'Stealth', ability: 'dex' }, { name: 'Survival', ability: 'wis' },
]
/** The ability each class casts with. */
const CASTING: Record<string, Ability> = {
  artificer: 'int', wizard: 'int', bard: 'cha', paladin: 'cha', sorcerer: 'cha', warlock: 'cha', cleric: 'wis', druid: 'wis', ranger: 'wis',
}

export const blankSheet = (): CharacterSheet => ({
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saves: [], skills: {}, inventory: [], features: [],
})
export const sheetOf = (pc: Entry): CharacterSheet | undefined => pc.fields.sheet as CharacterSheet | undefined

export const mod = (score?: number) => (score == null ? 0 : Math.floor((score - 10) / 2))
export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)
export const levelOf = (pc: Entry) => Math.min(20, Math.max(1, Number(pc.fields.level) || 1))
export const profBonus = (level: number) => 2 + Math.floor((level - 1) / 4)

export const saveBonus = (s: CharacterSheet, a: Ability, prof: number) => mod(s.abilities[a]) + (s.saves.includes(a) ? prof : 0)
export const skillBonus = (s: CharacterSheet, name: string, prof: number) => {
  const sk = SKILLS.find(x => x.name === name)!
  return mod(s.abilities[sk.ability]) + (s.skills[name] ?? 0) * prof
}
export const passivePerception = (s: CharacterSheet, prof: number) => 10 + skillBonus(s, 'Perception', prof)

/** The ability a character casts with: picked on the sheet, else the one their class uses. */
export function castingAbility(pc: Entry, s: CharacterSheet): Ability | undefined {
  if (s.spellAbility) return s.spellAbility
  const cls = String(pc.fields.class ?? '').toLowerCase()
  return Object.entries(CASTING).find(([c]) => cls.includes(c))?.[1]
}

// ---------- what the inventory adds up to ----------

const equipped = (s: CharacterSheet) => s.inventory.filter(l => l.equipped).map(l => get(l.item)).filter((e): e is Entry => !!e)
/** A "+1" written in an item's Bonus field (not the "+2 AC" of a shield). */
const magicBonus = (e: Entry) => { const m = String(e.fields.bonus ?? '').match(/^\s*\+(\d+)\s*$/); return m ? Number(m[1]) : 0 }

/**
 * Armor class from what's worn: body armor ("14 + dex(max 2)", "16"), plus shields and other worn bonuses
 * ("+2", or "+2 AC" in Bonus). Without body armor it's 10 + DEX. A number typed on the sheet wins.
 */
export function armorClass(s: CharacterSheet): { ac: number; from: string } {
  if (s.acOverride != null) return { ac: s.acOverride, from: 'typed on the sheet' }
  const dex = mod(s.abilities.dex)
  let base = 10 + dex, from = 'unarmored', extra = 0
  const parts: string[] = []
  for (const e of equipped(s)) {
    const text = String(e.fields.armorClass ?? '').toLowerCase()
    const body = text.match(/^\s*(\d+)\s*(\+\s*dex(?:\s*\(\s*max\s*(\d+)\s*\))?)?/)
    const plus = text.match(/^\s*\+\s*(\d+)/)
    if (e.fields.kind === 'Armor' && body) {
      base = Number(body[1]) + (body[2] ? (body[3] ? Math.min(dex, Number(body[3])) : dex) : 0) + magicBonus(e)
      from = e.name
    } else if (e.fields.kind === 'Armor' && plus) { extra += Number(plus[1]) + magicBonus(e); parts.push(e.name) }
    const ac = String(e.fields.bonus ?? '').match(/\+\s*(\d+)\s*ac/i)
    if (ac) { extra += Number(ac[1]); parts.push(e.name) }
  }
  return { ac: base + extra + (s.acBonus ?? 0), from: [from, ...parts].join(' + ') }
}

export interface Attack { id: Id; name: string; toHit: number; damage: string; type?: string; note?: string }

/** One attack per equipped weapon: finesse weapons use the better of STR and DEX, ranged ones DEX. */
export function attacks(s: CharacterSheet, prof: number): Attack[] {
  return equipped(s).filter(e => e.fields.kind === 'Weapon').map(e => {
    const props = ((e.fields.properties as string[] | undefined) ?? []).map(p => p.toLowerCase())
    const ranged = props.includes('ammunition') || /bow|crossbow|sling|blowgun|dart/i.test(`${e.name} ${e.fields.subtype ?? ''}`)
    const str = mod(s.abilities.str), dex = mod(s.abilities.dex)
    const m = props.includes('finesse') ? Math.max(str, dex) : ranged ? dex : str
    const magic = magicBonus(e)
    const dice = String(e.fields.damage ?? '').trim()
    const dmg = m + magic
    const damage = dice ? dice.split('/').map(d => `${d.trim()}${dmg ? ' ' + signed(dmg).replace('−', '− ').replace('+', '+ ') : ''}`).join(' / ') : '—'
    return { id: e.id, name: e.name, toHit: m + prof + magic, damage, type: e.fields.damageType as string | undefined, note: e.fields.range as string | undefined }
  })
}

/** Total weight carried, in lb. */
export const carried = (s: CharacterSheet) => s.inventory.reduce((t, l) => t + (Number(get(l.item)?.fields.weight) || 0) * (l.qty || 0), 0)

/** What the initiative tracker takes from a PC: AC, HP and the DEX for initiative. */
export function trackerStats(pc: Entry) {
  const s = sheetOf(pc)
  if (!s) return undefined
  return { ac: armorClass(s).ac, hp: s.hp ?? s.maxHp, maxHp: s.maxHp, initMod: mod(s.abilities.dex) + (s.initBonus ?? 0) }
}
