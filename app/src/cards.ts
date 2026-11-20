// Printable cards (poker size, 63 x 88 mm, nine to a page): what a spell's or an item's card says. The layout, the
// fitting of long texts and the PDF are in PrintCards.vue. DM-only text never goes on a card: cards go to the table.
import type { Entry, Id } from './model/types'
import { TYPES, byKey } from './model/schema'
import { fieldLabel, get, optionLabel } from './store'
import { describe } from './describe'
import { attackOrSave } from './columns'
import { describeEffect, effectsOf, howCast, spellsOf } from './gear'
import { describeRequirements } from './requirements'

export interface Card {
  id: Id
  kind: 'spell' | 'item'
  title: string
  /** "3rd-level evocation", "Magical Melee (Quarterstaff) · rare". */
  sub: string
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

const SECRET = /^:::secret\s*\n[\s\S]*?\n:::\s*$/gm
const SOURCE = /\n*\*Source: System Reference Document ([\d.]+) \(CC BY 4\.0\)\.\*\s*$/
/** A text's paragraphs, without DM-only blocks and the SRD source line (the card has its own credit). */
function paragraphs(text: unknown): { paras: string[]; credit: string } {
  let t = String(text ?? '').replace(SECRET, '').trim()
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
    id: e.id, kind: 'spell', title: e.name, sub: cap(describe(e, { parent: false })),
    marks: [f.concentration && 'C', f.ritual && 'R'].filter(Boolean) as string[],
    facts: ([
      ['Casting time', String(f.castingTime ?? '')],
      ['Range', String(f.range ?? '')],
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
  const when = f.attunement ? 'While attuned' : f.kind === 'Weapon' ? 'While wielded' : 'While worn'
  const rarity = f.rarity ? L('rarity').toLowerCase() : ''
  return {
    id: e.id, kind: 'item', title: e.name,
    sub: cap([describe(e, { parent: false }) || L('kind'), rarity].filter(Boolean).join(' · ')),
    marks: [],
    facts: ([
      ['Damage', [f.damage, f.damageType?.length && L('damageType').replace(/, /g, ' or ').toLowerCase()].filter(Boolean).join(' ')],
      ['Range', String(f.range ?? '')],
      ['Armor class', String(f.armorClass ?? '')],
      [f.attunement ? 'Attunement by' : 'Requires', describeRequirements(e)],
      ['Charges', f.charges ? [f.charges, f.recharge && `regains ${f.recharge}`].filter(Boolean).join(', ') : ''],
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
