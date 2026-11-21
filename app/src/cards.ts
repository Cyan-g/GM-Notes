// Printable cards (poker size, 63 x 88 mm, nine to a page): what a spell's or an item's card says. The layout, the
// fitting of long texts and the PDF are in PrintCards.vue. DM-only text never goes on a card: cards go to the table.
import type { Entry, Id } from './model/types'
import { TYPES, byKey } from './model/schema'
import { db, fieldLabel, get, optionLabel, state, touch } from './store'
import { describe } from './describe'
import { describeEffect, effectsOf, howCast, regainText, spellsOf, worksWhileOf } from './gear'
import { describeRequirements } from './requirements'
import { areaText, attackOrSave } from './spells'
import { stripSecrets } from './model/text'

// ---- how the cards look, kept with the world ----
export interface CardStyle {
  /** Title and rule colour: the theme's accent, one picked colour, or by spell school / item rarity. */
  color: 'theme' | 'custom' | 'kind'
  custom?: string
  /** Font ids (theme.ts FONTS / TEXT_FONTS), or 'theme' for the theme's own. */
  headFont: string
  textFont: string
  /** The text's starting size in pt (it shrinks to 6.5 pt to fit). */
  size: number
  paper: 'white' | 'parchment'
  corners: 'square' | 'rounded'
  /** A thin frame in the card's colour inside the cut line. */
  frame: boolean
  show: { facts: boolean; foot: boolean; credit: boolean; cutLines: boolean; picture: boolean }
}
export const DEFAULT_STYLE: CardStyle = {
  color: 'theme', headFont: 'theme', textFont: 'theme', size: 8.5, paper: 'white', corners: 'square', frame: false,
  show: { facts: true, foot: true, credit: true, cutLines: true, picture: true },
}
export const cardStyle = (): CardStyle => {
  const s = state.db?.meta.cardStyle
  return { ...DEFAULT_STYLE, ...(s ?? {}), show: { ...DEFAULT_STYLE.show, ...(s?.show ?? {}) } }
}
export function setCardStyle(patch: Partial<CardStyle>) {
  db().meta.cardStyle = { ...cardStyle(), ...patch }
  touch()
}
/** Colours by spell school and item rarity, for "by kind". */
const SCHOOL: Record<string, string> = {
  Abjuration: '#2f6fb0', Conjuration: '#c27c0e', Divination: '#6b7f8f', Enchantment: '#b0407a',
  Evocation: '#c0392b', Illusion: '#7a4fb0', Necromancy: '#3c4a3e', Transmutation: '#2e8b57',
}
const RARITY: Record<string, string> = {
  Common: '#6b6b6b', Uncommon: '#2e8b3a', Rare: '#2f6fb0', 'Very rare': '#7a3fb0', Legendary: '#d2691e', Artifact: '#b8860b',
}
/** A card's colour by its kind (school or rarity); the item colour for mundane items. */
export const kindColor = (c: Card) => (c.kind === 'spell' ? SCHOOL[c.school ?? ''] : RARITY[c.rarity ?? '']) ?? '#6b5a45'

export interface Card {
  id: Id
  kind: 'spell' | 'item'
  /** Spell school / item rarity (option ids), for colouring by kind. */
  school?: string
  rarity?: string
  title: string
  /** "3rd-level evocation", "Magical Melee (Quarterstaff) · rare". */
  sub: string
  /** The item's picture (a data path), shown small beside the title. */
  image?: string
  /** Small marks after the subline: C (concentration), R (ritual), attunement. */
  marks: string[]
  /** Label and value pairs in a grid under the title. */
  facts: [string, string][]
  /** The text, a paragraph (Markdown) each, so a long one can continue on another card. */
  paras: string[]
  /** Classes of a spell; properties of a weapon. */
  foot: string
  /** "SRD 5.2.1 · CC BY 4.0" on cards from the SRD. */
  credit: string
}

export const CARD_TYPES = ['spell', 'item'] as const
export const printable = (e: Entry | undefined) => !!e && (CARD_TYPES as readonly string[]).includes(e.type)

const SOURCE = /\n*\*Source: System Reference Document ([\d.]+) \(CC BY 4\.0\)\.\*\s*$/
/** A text's paragraphs, without DM-only blocks and the SRD source line (the card has its own credit). */
function paragraphs(text: unknown): { paras: string[]; credit: string } {
  let t = stripSecrets(String(text ?? '')).trim()
  const m = t.match(SOURCE)
  if (m) t = t.slice(0, m.index).trim()
  // a table, a list or a stat block stays in one piece; everything else splits at blank lines
  const paras: string[] = []
  for (const block of t.split(/\n{2,}/)) {
    const prev = paras[paras.length - 1]
    if (prev && /^(\||- |\* )/.test(block) && /^(\||- |\* )/m.test(prev.split('\n').at(-1) ?? '')) paras[paras.length - 1] = `${prev}\n\n${block}`
    else if (block.trim()) paras.push(block.trim())
  }
  return { paras, credit: m ? `SRD ${m[1]} · CC BY 4.0` : '' }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function spellCard(e: Entry): Card {
  const f = e.fields
  const { paras, credit } = paragraphs(f.summary)
  const material = f.material && f.material !== 'yes' ? String(f.material) : ''
  const components = [f.verbal && 'V', f.somatic && 'S', f.material && (material ? 'M*' : 'M')].filter(Boolean).join(', ')
  const check = attackOrSave(e)
  return {
    id: e.id, kind: 'spell', school: f.school ? String(f.school) : undefined, title: e.name, sub: cap(describe(e, { parent: false })),
    marks: [f.concentration && 'C', f.ritual && 'R'].filter(Boolean) as string[],
    facts: ([
      ['Casting time', String(f.castingTime ?? '')],
      ['Range', [f.range, areaText(f.area) && `(${areaText(f.area)})`].filter(Boolean).join(' ')],
      ['Components', components],
      ['Duration', String(f.duration ?? '')],
    ] as [string, string][]).concat(check.endsWith('save') ? [['Save', check]] : check === 'Attack' ? [['Attack', 'Spell attack']] : []),
    paras: [...(material ? [`*\\* ${cap(material)}*`] : []), ...paras],
    foot: [...(f.classes ?? [])].map(c => optionLabel('class', c)).sort().join(' · '),
    credit,
  }
}

function itemCard(e: Entry): Card {
  const f = e.fields
  const L = (key: string) => fieldLabel(TYPES.item.fields.find(x => x.key === key), byKey(f)[key])
  const summary = paragraphs(f.summary), body = paragraphs(e.body)
  const effects = effectsOf(e).map(describeEffect).filter(Boolean)
  const spells = spellsOf(e).filter(x => get(x.spell))
  const w = worksWhileOf(e), when = w === 'attuned' ? 'While attuned' : w === 'carried' ? 'While carried' : f.kind === 'Weapon' ? 'While wielded' : 'While worn'
  const rarity = f.rarity ? L('rarity').toLowerCase() : ''
  return {
    id: e.id, kind: 'item', rarity: f.rarity ? String(f.rarity) : undefined, title: e.name, image: e.image,
    sub: cap([describe(e, { parent: false }) || L('kind'), rarity].filter(Boolean).join(' · ')),
    marks: [],
    facts: ([
      ['Damage', [f.damage, f.damageType?.length && L('damageType').replace(/, /g, ' or ').toLowerCase()].filter(Boolean).join(' ')],
      ['Range', String(f.range ?? '')],
      ['Armor class', String(f.armorClass ?? '')],
      [f.attunement ? 'Attunement by' : 'Requires', describeRequirements(e)],
      ['Charges', f.charges ? [f.charges, regainText(e) && `regains ${regainText(e)}`].filter(Boolean).join(', ') : ''],
    ] as [string, string][]).filter(([, v]) => v),
    paras: [
      ...summary.paras,
      ...(f.effect ? [`**Effect.** ${f.effect}`] : []),
      ...(effects.length ? [`**${when}:** ${effects.join('; ')}`] : []),
      ...(spells.length ? [`**Spells:** ${spells.map(x => `${get(x.spell)!.name} (${howCast(x)})`).join('; ')}`] : []),
      ...body.paras,
    ],
    foot: (f.properties ?? []).map(p => optionLabel('weaponProperty', p)).join(' · '),
    credit: summary.credit || body.credit,
  }
}

/** The cards of the given entries, in that order; entries that don't print as cards are left out. */
export function cardsOf(ids: Id[]): Card[] {
  return ids.map(get).filter((e): e is Entry => printable(e)).map(e => (e.type === 'spell' ? spellCard(e) : itemCard(e)))
}
