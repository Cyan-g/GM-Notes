// The world's ruleset: rules that can be switched on and off or work one way or another, kept as presets in the
// world (meta.rules), one of them active. The Ruleset page shows them, searchable; the rest of the app asks `rule(id)`.
// A world without presets plays by the defaults (the "Standard" preset is made the first time something changes).
import { computed } from 'vue'
import { db, state, touch } from './store'
import { STANDARD_CURRENCY, cleanCurrency, mainWorth, type Currency } from './money'

export interface RuleOption { id: string; label: string; text?: string }
export interface RuleDef {
  id: string
  /** What it's about, for grouping on the page ("Equipment", "Advancement"). */
  group: string
  label: string
  /** What the rule does, in a sentence or two. */
  text: string
  options: RuleOption[]
  /** The option of the Standard preset. */
  default: string
  /** More words to find it by. */
  keywords?: string
  /** A number instead of options (the point buy budget, the level cap): its range, and what it counts. */
  number?: { min: number; max: number; unit?: string }
  /** The currency editor instead of options (its value is the currency as JSON; money.ts). */
  currency?: true
}
export interface RulePreset { id: string; name: string; values: Record<string, string> }
export interface RulesMeta { presets: RulePreset[]; active: string }

/** The rules there are, in page order. More follow as the app learns them. */
export const RULES: RuleDef[] = [
  {
    id: 'carryingCapacity', group: 'Equipment', label: 'Carrying capacity',
    text: 'Whether what a character carries is weighed against their Strength. The Inventory shows the total either way.',
    options: [
      { id: 'off', label: 'Not tracked', text: 'Weight is shown, nothing is checked.' },
      { id: 'capacity', label: 'Capacity', text: 'Up to Strength × 15 lb (× 30 for Large, × 7.5 for Tiny); more than that is flagged.' },
      { id: 'encumbrance', label: 'Encumbrance (variant)', text: 'Over Strength × 5 lb: −10 ft speed. Over Strength × 10 lb: −20 ft speed and disadvantage on ability checks, attack rolls and Strength, Dexterity and Constitution saves.' },
      { id: 'slots', label: 'Inventory slots', text: 'Items take slots instead of weight: 1 each, an item under a pound its weight (20 arrows share a slot), unless its page says otherwise. As many slots as the Strength score, at least 10; more than that is flagged.' },
    ],
    default: 'off', keywords: 'weight encumbered load heavy slots gear shadowdark',
  },
  {
    id: 'coinWeight', group: 'Equipment', label: 'Coin weight',
    text: 'Whether the coins in a purse count toward what a character carries.',
    options: [
      { id: 'off', label: 'Weightless', text: 'Coins weigh nothing.' },
      { id: 'on', label: '50 coins to the pound', text: 'Every 50 coins weigh 1 lb (with inventory slots: every 100 coins after the first 100 take a slot).' },
    ],
    default: 'off', keywords: 'money gold coins weight purse',
  },
  {
    id: 'currency', group: 'Equipment', label: 'Currency',
    text: 'The coins of the world, from the smallest up, and what each is worth in the one below it. Amounts are kept as a number of the smallest coin and shown broken into coins; the main coin is what the rules count in (crafting, prices by rarity) and what a number without a coin means.',
    options: [], currency: true,
    default: '', keywords: 'money coins currency gold silver copper electrum platinum gp sp cp ep pp exchange',
  },
  {
    id: 'attunementSlots', group: 'Equipment', label: 'Attunement slots',
    text: 'How many magic items a character can be attuned to at once.',
    options: [], number: { min: 1, max: 10, unit: 'items' },
    default: '3', keywords: 'attune attunement magic items limit',
  },
  {
    id: 'craftingPace', group: 'Equipment', label: 'Crafting time',
    text: 'How long making an item takes on the Workbench, from what it is worth.',
    options: [
      { id: 'value', label: 'By value', text: 'Time from its value, counted straight through (brewing, distilling).' },
      { id: '2024', label: 'A day per 10 GP (2024)', text: 'One day of 8 hours of work for every 10 GP of its price.' },
      { id: 'workweek', label: 'A workweek per 50 GP', text: 'One workweek (5 days of 8 hours) for every 50 GP of its price.' },
    ],
    default: 'value', keywords: 'crafting workbench brewing time days downtime',
  },
  {
    id: 'experience', group: 'Advancement', label: 'Experience points',
    text: 'How characters level up: when the DM says so, or by experience points from encounters.',
    options: [
      { id: 'milestone', label: 'Milestones', text: 'No experience points; characters level up at story milestones.' },
      { id: 'xp', label: 'Experience points', text: 'Characters have XP on their sheet, with what the next level needs.' },
    ],
    default: 'milestone', keywords: 'xp level up advancement',
  },
  {
    id: 'levelCap', group: 'Advancement', label: 'Highest level',
    text: 'The level characters stop at: lower for a low-level campaign (6 for an "E6" game).',
    options: [], number: { min: 1, max: 20, unit: 'level' },
    default: '20', keywords: 'level cap maximum e6 limit',
  },
  {
    id: 'feats', group: 'Advancement', label: 'Feats',
    text: 'What a character takes at the levels that give a feat (4, 8, 12, 16 and 19 for most classes).',
    options: [
      { id: 'feats', label: 'Feat or Ability Score Improvement', text: 'Any feat they qualify for; Ability Score Improvement is one of them.' },
      { id: 'asi', label: 'Ability Score Improvement only', text: 'No other feats: +2 to one score or +1 to two.' },
    ],
    default: 'feats', keywords: 'feat asi ability score improvement optional',
  },
  {
    id: 'hpLevel', group: 'Advancement', label: 'Hit points per level',
    text: 'What a new level adds to the hit point maximum (plus the Constitution modifier), in the creator and the level-up.',
    options: [
      { id: 'choice', label: 'Average or rolled', text: "The player takes the die's average or rolls it, each level." },
      { id: 'average', label: 'Always the average', text: "The die's average, no rolling." },
      { id: 'rolled', label: 'Always rolled', text: 'The player rolls the die each level and types what it shows.' },
      { id: 'max', label: 'Always the maximum', text: "The die's highest number (a generous house rule)." },
    ],
    default: 'choice', keywords: 'hp hit points hit die roll average level up',
  },
  {
    id: 'hpFirst', group: 'Advancement', label: 'Hit points at level 1',
    text: 'What the first level gives (plus the Constitution modifier).',
    options: [
      { id: 'max', label: "The die's maximum", text: 'A d8 class starts with 8.' },
      { id: 'rolled', label: 'Rolled', text: 'The die is rolled at level 1 too.' },
    ],
    default: 'max', keywords: 'hp hit points first level start',
  },
  {
    id: 'halfCasterStart', group: 'Advancement', label: "Half casters' first spell slots",
    text: 'When Paladins and Rangers (and other half casters) get their first spell slots.',
    options: [
      { id: '2024', label: 'At level 1 (2024)', text: 'Their class level halved, rounded up, from level 1; in a multiclass too.' },
      { id: '2014', label: 'At level 2 (2014)', text: 'From level 2, their level halved and rounded up; in a multiclass, rounded down.' },
    ],
    default: '2024', keywords: 'paladin ranger spell slots half caster multiclass',
  },
  // Where a new character's ability score increase can come from: the creator offers the ones switched on, and the
  // player takes one of them.
  {
    id: 'bonusBackground', group: 'Character creation', label: 'Ability increase: the background’s (2024)',
    text: 'Whether the creator offers the background’s ability score increase (+2 and +1, or +1 to three, among its abilities).',
    options: [{ id: 'on', label: 'Offered' }, { id: 'off', label: 'Not offered' }],
    default: 'on', keywords: 'asi ability scores background creation bonus',
  },
  {
    id: 'bonusSpecies', group: 'Character creation', label: 'Ability increase: the species’ with its subrace’s (2014)',
    text: 'Whether the creator offers the species’ ability score increase, with the subrace’s added to it (a Mountain Dwarf: the Dwarf’s +2 Con and its own +2 Str).',
    options: [{ id: 'on', label: 'Offered' }, { id: 'off', label: 'Not offered' }],
    default: 'on', keywords: 'asi ability scores race species subrace creation bonus',
  },
  {
    id: 'bonusSubrace', group: 'Character creation', label: 'Ability increase: the subrace’s alone',
    text: 'Whether the creator offers just the subrace’s own ability score increase, without the main species’ (a species without subraces: its own).',
    options: [{ id: 'on', label: 'Offered' }, { id: 'off', label: 'Not offered' }],
    default: 'off', keywords: 'asi ability scores race species subrace creation bonus',
  },
  {
    id: 'originFeat', group: 'Character creation', label: 'Origin feat',
    text: 'Where a new character’s Origin feat comes from. Its choices (Magic Initiate’s spell list and spells) are made in the creator’s Feats step either way.',
    options: [
      { id: 'background', label: 'The background’s (2024)', text: 'Each background gives its own Origin feat.' },
      { id: 'any', label: 'Any Origin feat', text: 'The player picks any Origin feat in the Feats step; the background’s is picked to start with, and the background no longer gives it.' },
    ],
    default: 'background', keywords: 'origin feat background magic initiate creation',
  },
  {
    id: 'bonusCustom', group: 'Character creation', label: 'Ability increase: typed in',
    text: 'Whether the player may type the bonus for each score themselves.',
    options: [{ id: 'on', label: 'Offered' }, { id: 'off', label: 'Not offered' }],
    default: 'on', keywords: 'asi ability scores custom creation bonus',
  },
  {
    id: 'scoreArray', group: 'Character creation', label: 'Ability scores: standard array',
    text: 'Whether the creator offers the standard array (15, 14, 13, 12, 10, 8).',
    options: [{ id: 'on', label: 'Offered' }, { id: 'off', label: 'Not offered' }],
    default: 'on', keywords: 'ability scores method array',
  },
  {
    id: 'scorePointBuy', group: 'Character creation', label: 'Ability scores: point buy',
    text: 'Whether the creator offers point buy.',
    options: [{ id: 'on', label: 'Offered' }, { id: 'off', label: 'Not offered' }],
    default: 'on', keywords: 'ability scores method point buy',
  },
  {
    id: 'scoreTyped', group: 'Character creation', label: 'Ability scores: rolled or typed in',
    text: 'Whether the creator offers scores typed in (rolled at the table, or agreed). If no method is offered, this one is.',
    options: [{ id: 'on', label: 'Offered' }, { id: 'off', label: 'Not offered' }],
    default: 'on', keywords: 'ability scores method roll 4d6 typed',
  },
  {
    id: 'pointBuy', group: 'Character creation', label: 'Point buy: points',
    text: 'How many points point buy gives to spend.',
    options: [], number: { min: 0, max: 60, unit: 'points' },
    default: '27', keywords: 'point buy budget points',
  },
  {
    id: 'pointBuyMax', group: 'Character creation', label: 'Point buy: highest score',
    text: 'The highest score point buy can reach (before any bonus). Each step past 15 costs 2 points.',
    options: [
      { id: '15', label: '15', text: '15 costs 9 points.' },
      { id: '16', label: '16', text: '16 costs 11 points.' },
      { id: '17', label: '17', text: '17 costs 13 points.' },
    ],
    default: '15', keywords: 'point buy maximum highest score',
  },
  {
    id: 'multiclassing', group: 'Advancement', label: 'Multiclassing',
    text: 'Whether a character can take a level in another class when they level up.',
    options: [
      { id: 'on', label: 'Allowed, with prerequisites', text: 'A new class needs 13 in its main score and in those of the classes the character has (the DM can still allow it).' },
      { id: 'free', label: 'Allowed, no prerequisites', text: 'Any class can be taken, whatever the scores.' },
      { id: 'off', label: 'Not allowed', text: 'Characters level up in the class they have.' },
    ],
    default: 'on', keywords: 'multiclass class level up prerequisites',
  },
  {
    id: 'exhaustion', group: 'Conditions', label: 'Exhaustion',
    text: 'What each level of exhaustion does to a character, counted on their sheet.',
    options: [
      { id: '2024', label: 'Levels lower rolls (2024)', text: 'Each level: −2 to D20 tests and −5 ft speed. Level 6 is death. A long rest removes one level.' },
      { id: '2014', label: 'Effects by level (2014)', text: '1: disadvantage on ability checks. 2: speed halved. 3: disadvantage on attack rolls and saves. 4: hit point maximum halved. 5: speed 0. 6: death.' },
    ],
    default: '2024', keywords: 'tired condition levels',
  },
  {
    id: 'hitDiceLongRest', group: 'Resting', label: 'Hit Dice on a long rest',
    text: 'How many spent Hit Dice a long rest gives back.',
    options: [
      { id: 'all', label: 'All of them (2024)', text: 'Every spent Hit Die comes back.' },
      { id: 'half', label: 'Half the level (2014)', text: 'Up to half the character’s level in Hit Dice (at least one) comes back.' },
    ],
    default: 'all', keywords: 'rest hit dice healing recovery',
  },
  {
    id: 'inspiration', group: 'Play', label: 'Heroic Inspiration',
    text: 'Whether characters can have inspiration (a star on their sheet the DM hands out), and what spending it does.',
    options: [
      { id: 'heroic', label: 'Heroic Inspiration (2024)', text: 'Spend it to reroll any one die right after rolling it, and use the new roll. A character has it or not; gaining it again, they can give it to a character who lacks it.' },
      { id: 'classic', label: 'Inspiration (2014)', text: 'Spend it for advantage on one attack roll, saving throw or ability check.' },
      { id: 'off', label: 'Not used', text: 'No inspiration: the star leaves the sheet.' },
    ],
    default: 'heroic', keywords: 'inspiration heroic reroll advantage reward star',
  },
  {
    id: 'untrainedShield', group: 'Equipment', label: 'Shield without training',
    text: 'What a Shield does for a character who lacks training with it.',
    options: [
      { id: '2024', label: 'No AC from it (2024)', text: 'The Shield adds nothing to Armor Class without training.' },
      { id: '2014', label: 'AC, with drawbacks (2014)', text: 'The Shield adds its AC, but the character has disadvantage on Strength and Dexterity rolls and can’t cast spells.' },
    ],
    default: '2024', keywords: 'shield armor class ac proficiency untrained',
  },
  {
    id: 'restLength', group: 'Resting', label: 'Rest lengths',
    text: 'How long a short and a long rest take.',
    options: [
      { id: 'standard', label: 'Standard', text: 'A short rest is 1 hour, a long rest 8 hours.' },
      { id: 'gritty', label: 'Gritty realism (variant)', text: 'A short rest is 8 hours, a long rest 7 days.' },
      { id: 'heroic', label: 'Epic heroism (variant)', text: 'A short rest is 5 minutes, a long rest 1 hour.' },
    ],
    default: 'standard', keywords: 'rest short long gritty heroic time',
  },
  {
    id: 'longRestHp', group: 'Resting', label: 'Hit points on a long rest',
    text: 'What a long rest does for hit points.',
    options: [
      { id: 'all', label: 'All of them', text: 'The character wakes with full hit points.' },
      { id: 'none', label: 'None: spend Hit Dice (variant)', text: 'No hit points come back by themselves; the character spends Hit Dice, as on a short rest.' },
    ],
    default: 'all', keywords: 'rest long hp hit points healing slow natural',
  },
  {
    id: 'crits', group: 'Combat', label: 'Critical hits',
    text: 'The damage of a critical hit, shown with each attack.',
    options: [
      { id: 'double', label: 'Double the dice', text: "Roll the attack's damage dice twice, then add the modifiers." },
      { id: 'max', label: 'Maximum plus a roll (house rule)', text: "The dice's highest total, plus one normal roll of them, plus the modifiers." },
    ],
    default: 'double', keywords: 'critical hit crit damage 20',
  },
  {
    id: 'initiative', group: 'Combat', label: 'Initiative',
    text: 'Who rolls initiative when a fight starts on the tracker.',
    options: [
      { id: 'each', label: 'Each creature', text: 'Every character and monster rolls its own.' },
      { id: 'kind', label: 'Each kind of monster', text: 'Characters roll their own; monsters of the same kind share one roll.' },
      { id: 'side', label: 'Each side (variant)', text: 'The party shares one roll and the enemies another.' },
    ],
    default: 'each', keywords: 'initiative combat tracker order side group',
  },
  {
    id: 'concentrationCap', group: 'Conditions', label: 'Concentration save DC',
    text: 'The Constitution save to keep concentrating after taking damage: DC 10 or half the damage, whichever is higher.',
    options: [
      { id: '2024', label: 'At most 30 (2024)', text: 'The DC is never higher than 30.' },
      { id: '2014', label: 'No limit (2014)', text: 'Half the damage, however high.' },
    ],
    default: '2024', keywords: 'concentration con save dc damage',
  },
]
export const ruleDef = (id: string) => RULES.find(r => r.id === id)

const STANDARD = 'standard'
/** The world's presets (the Standard one first if there are none stored yet). */
export const presets = computed<RulePreset[]>(() => state.db?.meta.rules?.presets ?? [{ id: STANDARD, name: 'Standard', values: {} }])
export const activePreset = computed<RulePreset>(() => presets.value.find(p => p.id === state.db?.meta.rules?.active) ?? presets.value[0])
/** The ability score increases the creator offers, in order (a world from before the switches keeps what its old
 * "Ability score increase" rule allowed). */
export function bonusSources(): ('background' | 'species' | 'subrace' | 'custom')[] {
  const v = activePreset.value.values, old = v.abilityIncrease
  const on = (id: string, fallback: string) => (v[id] ?? fallback) === 'on'
  const out: ('background' | 'species' | 'subrace' | 'custom')[] = []
  if (on('bonusBackground', old === 'species' ? 'off' : 'on')) out.push('background')
  if (on('bonusSpecies', old === 'background' ? 'off' : 'on')) out.push('species')
  if (on('bonusSubrace', 'off')) out.push('subrace')
  if (on('bonusCustom', 'on') || !out.length) out.push('custom')
  return out
}
/** How a rule works in the active preset. */
export const rule = (id: string): string => activePreset.value.values[id] ?? ruleDef(id)?.default ?? ''
/** A number rule's value (the point buy budget, the level cap), kept in its range. */
export function ruleNumber(id: string): number {
  const d = ruleDef(id), n = Number(rule(id))
  const v = Number.isFinite(n) ? n : Number(d?.default ?? 0)
  return d?.number ? Math.min(d.number.max, Math.max(d.number.min, Math.round(v))) : v
}
/** How long a short and a long rest take (the Ruleset's "Rest lengths"), in words. */
export function restLengths(): { short: string; long: string } {
  const r = rule('restLength')
  return r === 'gritty' ? { short: '8 hours', long: '7 days' } : r === 'heroic' ? { short: '5 minutes', long: '1 hour' } : { short: '1 hour', long: '8 hours' }
}
/** Whether a long rest gives hit points back by itself (else the character spends Hit Dice: slow natural healing). */
export const longRestHeals = () => rule('longRestHp') !== 'none'
/** The highest level characters reach (the Ruleset's level cap, 20 standard). */
export const levelCap = () => ruleNumber('levelCap')
/** Whether the levels that give a feat offer any feat, or only the Ability Score Improvement (the Ruleset's "Feats"). */
export const featsAllowed = () => rule('feats') !== 'asi'
/** The Ability Score Improvement feat (by name: worlds name it the same). */
export const isAsiFeat = (name: string) => /^ability score improvement$/i.test(name.trim())
/** The ability score methods the creator offers (typed in, if none is). */
export function scoreMethods(): ('array' | 'pointbuy' | 'typed')[] {
  const out: ('array' | 'pointbuy' | 'typed')[] = []
  if (rule('scoreArray') === 'on') out.push('array')
  if (rule('scorePointBuy') === 'on') out.push('pointbuy')
  if (rule('scoreTyped') === 'on' || !out.length) out.push('typed')
  return out
}
/** Whether a preset's rule differs from the Standard default. */
export const changedFromDefault = (p: RulePreset, id: string) =>
  id === 'currency' ? JSON.stringify(presetCurrency(p)) !== STANDARD_JSON : p.values[id] != null && p.values[id] !== ruleDef(id)?.default

const STANDARD_JSON = JSON.stringify(STANDARD_CURRENCY)
/** A currency without one of its coins: the coin above it takes over its ratio (no electrum: 1 gp = 10 sp). */
export function withoutCoin(c: Currency, i: number): Currency {
  if (c.coins.length < 2) return c
  const coins = c.coins.map(x => ({ ...x }))
  if (i === 0) coins[1].per = 1
  else if (coins[i + 1]) coins[i + 1].per *= coins[i].per
  const gone = coins.splice(i, 1)[0]
  return cleanCurrency({ coins, main: c.main === gone.abbr ? (coins[Math.min(i, coins.length - 1)]).abbr : c.main })
}
/** A preset's currency (a world from before the currency kept its "Electrum pieces" switch: off is no electrum). */
export function presetCurrency(p: RulePreset): Currency {
  const raw = p.values.currency
  if (raw) { try { return cleanCurrency(JSON.parse(raw)) } catch { /* unreadable: the standard */ } }
  return p.values.electrum === 'off' ? withoutCoin(STANDARD_CURRENCY, STANDARD_CURRENCY.coins.findIndex(x => x.abbr === 'ep')) : STANDARD_CURRENCY
}
const activeCurrency = computed(() => presetCurrency(activePreset.value))
/** The world's coins (the Ruleset's "Currency"). */
export const currency = (): Currency => activeCurrency.value
/** What the main coin (gold) is worth in base coins: the rules' "gp" (crafting, rarity prices) count in it. */
export const mainCoin = () => mainWorth(currency())
/** Set the active preset's currency (the standard one is stored as no value). */
export function setCurrency(c: Currency) {
  const m = meta(), p = m.presets.find(x => x.id === m.active) ?? m.presets[0]
  const json = JSON.stringify(cleanCurrency(c))
  delete p.values.electrum
  if (json === STANDARD_JSON) delete p.values.currency; else p.values.currency = json
  touch()
}

/** The stored rules, made on the first change. */
function meta(): RulesMeta {
  const m = db().meta
  return (m.rules ??= { presets: presets.value.map(p => ({ ...p, values: { ...p.values } })), active: activePreset.value.id })
}
const newId = () => 'r' + Math.random().toString(36).slice(2, 8)

/** Set how a rule works in the active preset. */
export function setRule(id: string, value: string) {
  const m = meta(), p = m.presets.find(x => x.id === m.active) ?? m.presets[0]
  if (value === ruleDef(id)?.default) delete p.values[id]; else p.values[id] = value
  touch()
}
/** A new preset, a copy of the active one, made active. */
export function addPreset(name: string) {
  const m = meta(), from = m.presets.find(x => x.id === m.active) ?? m.presets[0]
  const p: RulePreset = { id: newId(), name: name.trim() || 'New preset', values: { ...from.values } }
  m.presets.push(p)
  m.active = p.id
  touch()
}
export function renamePreset(id: string, name: string) {
  const p = meta().presets.find(x => x.id === id)
  if (p && name.trim()) { p.name = name.trim(); touch() }
}
/** Remove a preset (never the last one); the first is active then if this one was. */
export function deletePreset(id: string) {
  const m = meta()
  if (m.presets.length < 2) return
  m.presets = m.presets.filter(x => x.id !== id)
  if (m.active === id) m.active = m.presets[0].id
  touch()
}
export function setActivePreset(id: string) { const m = meta(); if (m.presets.some(x => x.id === id)) { m.active = id; touch() } }
