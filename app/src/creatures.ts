// Creatures' statblocks: what the app writes from their numbers — an attack's line from its ability and proficiency,
// the Spellcasting action from its spell lists, the legendary actions' opening line, the speed line — and the checks
// that point out what imported text left behind (an unknown condition, saves in the skills, stray periods).
import type { Abilities, Feature, StatAttack, Statblock } from './model/types'

type Ability = keyof Abilities
const ABILITY_NAME: Record<Ability, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`

/** Proficiency bonus by challenge rating. */
export function crProf(cr?: string): number {
  const n = !cr ? 0 : cr.includes('/') ? 0 : Number(cr) || 0
  return 2 + Math.floor(Math.max(0, n - 1) / 4)
}
export const modOf = (sb: Statblock, a: Ability) => Math.floor(((sb.abilities?.[a] ?? 10) - 10) / 2)
/** The average of dice ("3d6" → 10). */
export function diceAverage(dice: string): number {
  return dice.replace(/\s/g, '').split('+').reduce((n, part) => {
    const m = part.match(/^(\d*)d(\d+)$/i)
    return n + (m ? Math.floor((Number(m[1] || 1) * (Number(m[2]) + 1)) / 2) : Number(part) || 0)
  }, 0)
}

/** An attack's line, 2024 style: "Melee Attack Roll: +4, reach 5 ft. Hit: 12 (3d6 + 2) Necrotic damage." */
export function attackText(sb: Statblock, a: StatAttack): string {
  const mod = modOf(sb, a.ability) + (a.bonus ?? 0), hit = mod + crProf(sb.cr) + 0
  const kind = a.kind === 'melee' ? 'Melee Attack Roll' : a.kind === 'ranged' ? 'Ranged Attack Roll' : 'Melee or Ranged Attack Roll'
  const where = [a.kind !== 'ranged' && `reach ${a.reach ?? 5} ft.`, a.kind !== 'melee' && `range ${a.range || '30/120'} ft.`].filter(Boolean).join(' or ')
  const avg = Math.max(1, diceAverage(a.dice) + mod)
  const dmg = `${avg} (${a.dice}${mod ? ` ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}` : ''}) ${a.type} damage`
  return `${kind}: ${signed(hit)}, ${where} Hit: ${dmg}${a.plus ? ` plus ${a.plus}` : ''}.${a.extra ? ' ' + a.extra.trim() : ''}`
}
/** A feature's text as shown: an attack's written from its numbers, else as typed. */
export const featureText = (sb: Statblock, f: Feature) => (f.attack ? attackText(sb, f.attack) : f.text)

/** The Spellcasting action written from the creature's spell lists. */
export function spellcastingFeature(sb: Statblock, name: string): Feature | undefined {
  const sc = sb.spellcasting
  if (!sc?.lists.some(l => l.spells.length)) return undefined
  const m = modOf(sb, sc.ability), dc = 8 + crProf(sb.cr) + m, atk = crProf(sb.cr) + m
  const who = name ? `The ${name.toLowerCase()}` : 'It'
  const lists = sc.lists.filter(l => l.spells.length).map(l => `**${l.label}:** ${l.spells.map(id => `[[${id}]]`).join(', ')}`).join('\n\n')
  return {
    name: 'Spellcasting',
    text: `${who} casts one of the following spells, ${sc.noMaterial ? 'requiring no Material components and ' : ''}using ${ABILITY_NAME[sc.ability]} as the spellcasting ability (spell save DC ${dc}, ${signed(atk)} to hit with spell attacks):\n\n${lists}`,
  }
}
/** The legendary actions' opening line, with their uses. */
export function legendaryIntro(sb: Statblock, name: string): string {
  const who = name ? `the ${name.toLowerCase()}` : 'it'
  if (!sb.legendaryUses) return ''
  return `Legendary Action Uses: ${sb.legendaryUses}${sb.legendaryLair ? ` (${sb.legendaryLair} in Lair)` : ''}. Immediately after another creature's turn, ${who} can expend a use to take one of the following actions. ${who[0].toUpperCase() + who.slice(1)} regains all expended uses at the start of each of its turns.`
}
/** Legendary Resistance as a trait, when it has some and no trait of that name. */
export function legendaryResistanceFeature(sb: Statblock, name: string): Feature | undefined {
  if (!sb.legendaryResistance || (sb.traits ?? []).some(t => /^legendary resistance/i.test(t.name))) return undefined
  const who = name ? `the ${name.toLowerCase()}` : 'it'
  return { name: `Legendary Resistance (${sb.legendaryResistance}/Day${sb.legendaryResistanceLair ? `, or ${sb.legendaryResistanceLair}/Day in Lair` : ''})`, text: `If ${who} fails a saving throw, it can choose to succeed instead.` }
}

/** The speed line: a walking speed first (0 ft. when it has none but others), then the others. */
export function speedText(speed?: string): string {
  const parts = (speed ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!parts.length) return ''
  const isOther = (p: string) => /^(fly|swim|climb|burrow)\b/i.test(p) || /^\d+\s*ft\.?\s*(fly|swim|climb|burrow)\b/i.test(p)
  // "40 ft. fly" (imported text) reads as "fly 40 ft."
  const fixed = parts.map(p => { const m = p.match(/^(\d+)\s*ft\.?\s*(fly|swim|climb|burrow)\b\s*(.*)$/i); return m ? `${m[2].toLowerCase()} ${m[1]} ft.${m[3] ? ' ' + m[3] : ''}` : p })
  return isOther(parts[0]) ? ['0 ft.', ...fixed].join(', ') : fixed.join(', ')
}

// ---- what imported text left behind ----
const CONDS = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious']
const ABILITY_WORDS: Record<string, Ability> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha', str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha' }
export interface StatProblem { key: string; text: string; fix: string; apply: (sb: Statblock) => Statblock }
/** The closest condition to a misspelt one ("Grapple4d" → Grappled), if one is close. */
function closestCondition(w: string): string | undefined {
  const s = w.toLowerCase().replace(/[^a-z]/g, '')
  return CONDS.find(c => c.toLowerCase().startsWith(s.slice(0, 5)) && s.length >= 5)
}
export function statProblems(sb: Statblock): StatProblem[] {
  const out: StatProblem[] = []
  // condition immunities that aren't conditions
  for (const w of (sb.conditionImmunities ?? '').split(/\s*[,;]\s*/).filter(Boolean)) {
    if (CONDS.some(c => c.toLowerCase() === w.toLowerCase())) continue
    const c = closestCondition(w)
    out.push({
      key: 'cond-' + w, text: `“${w}” in the condition immunities isn't a condition.`, fix: c ? `Make it ${c}` : 'Remove it',
      apply: x => ({ ...x, conditionImmunities: (x.conditionImmunities ?? '').split(/\s*[,;]\s*/).filter(Boolean).map(y => (y === w ? c : y)).filter(Boolean).join(', ') || undefined }),
    })
  }
  // abilities in the skills text: they're saving throws
  const skills = (sb.skills ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const asSaves = skills.filter(s => ABILITY_WORDS[s.replace(/\s*[+−-]\s*\d+$/, '').toLowerCase()])
  if (asSaves.length) out.push({
    key: 'saves', text: `The skills list abilities (${asSaves.join(', ')}): those are saving throws.`, fix: 'Move them to the saves',
    apply: x => {
      const saves = [...(x.saves ?? '').split(',').map(s => s.trim()).filter(Boolean)]
      for (const s of asSaves) {
        const m = s.match(/^(.*?)\s*([+−-]\s*\d+)$/), a = ABILITY_WORDS[(m?.[1] ?? s).toLowerCase()]
        const label = a[0].toUpperCase() + a.slice(1)
        if (!saves.some(v => v.toLowerCase().startsWith(a))) saves.push(`${label} ${(m?.[2] ?? '').replace(/\s/g, '').replace('−', '-')}`.trim())
      }
      const rest = skills.filter(s => !asSaves.includes(s))
      return { ...x, saves: saves.join(', ') || undefined, skills: rest.join(', ') || undefined }
    },
  })
  // feature names ending in a period (the statblock adds its own)
  for (const k of ['traits', 'actions', 'bonusActions', 'reactions', 'legendary', 'lair'] as const) {
    const bad = (sb[k] ?? []).filter(f => /\.\s*$/.test(f.name))
    if (bad.length) out.push({
      key: 'dots-' + k, text: `${bad.map(f => `“${f.name}”`).join(', ')}: the name ends in a period, so it shows two.`, fix: 'Remove the periods',
      apply: x => ({ ...x, [k]: (x[k] ?? []).map(f => ({ ...f, name: f.name.replace(/[.\s]+$/, '') })) }),
    })
  }
  return out
}
