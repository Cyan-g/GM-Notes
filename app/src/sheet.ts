// A player character's sheet: what's stored on the PC entry (fields.sheet) and the numbers worked out from it
// with the 5e rules: modifiers, proficiency bonus, saves, skills, armor class, attacks and spellcasting.
import { computed, reactive } from 'vue'
import type { Abilities, CharacterSheet, Crafting, Entry, Id, InventoryLine, Spellbook } from './model/types'
import { db, get, state, touch } from './store'

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
/** A PC's sheet for reading, with anything never filled in at its default. */
export const sheetOf = (pc: Entry): CharacterSheet | undefined =>
  pc.fields.sheet ? { ...blankSheet(), ...(pc.fields.sheet as Partial<CharacterSheet>) } : undefined
/** A PC's stored sheet for changing: created, or completed, as needed. */
export function sheetToEdit(pc: Entry): CharacterSheet {
  const s = (pc.fields.sheet ??= {}) as Partial<CharacterSheet>
  const blank = blankSheet() as unknown as Record<string, unknown>
  for (const k of ['abilities', 'saves', 'skills', 'inventory', 'features']) if ((s as Record<string, unknown>)[k] == null) (s as Record<string, unknown>)[k] = blank[k]
  return s as CharacterSheet
}

// ---------- the current character ----------

/** The character the Spellbook, the Workbench and the Character menu are about. */
export const currentPc = computed(() => { const e = get(state.db?.meta.currentCharacter); return e?.type === 'pc' ? e : undefined })
export function setCurrent(id: Id | undefined) {
  const m = db().meta
  if (id) m.currentCharacter = id; else delete m.currentCharacter
  touch()
}

const ORD = 9
const emptyBook = (): Spellbook => ({ slots: Array.from({ length: ORD }, () => ({ max: 0, used: 0 })), known: [], prepared: [], always: [] })
/** The spellbook in use: the current character's, or (with no current character) the world's. */
export function activeSpellbook(): Spellbook {
  const pc = currentPc.value
  if (pc) {
    const s = pc.fields.sheet as Partial<CharacterSheet> | undefined
    if (s?.spellbook) return s.spellbook
    return (sheetToEdit(pc).spellbook = emptyBook())
  }
  const d = db()
  return (d.spellbook ??= emptyBook())
}

/** An item and how many: an ingredient in the pouch, or something crafted. */
export interface Held { item: Id; qty: number }
/**
 * The Workbench's data: the current character's (recipes and tools on the sheet, ingredients and crafted
 * things in the inventory) or, with no current character, the world's own.
 */
export interface Bench {
  tools: string[]
  known: Id[]
  list(which: 'pouch' | 'made'): Held[]
  /** Add (or with a negative n, take out) some of an item. */
  add(which: 'pouch' | 'made', id: Id, n: number): void
  set(which: 'pouch' | 'made', id: Id, qty: number): void
  setTools(t: string[]): void
  setKnown(k: Id[]): void
}
const isIngredient = (id: Id) => get(id)?.fields.kind === 'Ingredient'

export function activeBench(): Bench {
  const pc = currentPc.value
  if (!pc) {
    const d = db()
    const c: Crafting = (d.crafting ??= { tools: [], known: [], pouch: [], made: [] })
    const tidy = (w: 'pouch' | 'made') => { c[w] = c[w].filter(p => p.qty > 0) }
    return {
      tools: c.tools, known: c.known,
      list: w => c[w],
      add(w, id, n) { const l = c[w].find(p => p.item === id); if (l) l.qty += n; else c[w].push({ item: id, qty: n }); tidy(w); touch() },
      set(w, id, qty) { const l = c[w].find(p => p.item === id); if (l) l.qty = qty; tidy(w); touch() },
      setTools(t) { c.tools = t; touch() },
      setKnown(k) { c.known = k; touch() },
    }
  }
  const raw = pc.fields.sheet as Partial<CharacterSheet> | undefined
  const inv = raw?.inventory ?? []
  const wanted = (w: 'pouch' | 'made', id: Id) => (w === 'pouch') === isIngredient(id)
  const edit = (fn: (s: CharacterSheet) => void) => { const s = sheetToEdit(pc); fn(s); s.inventory = s.inventory.filter(l => !l.item || l.qty > 0); pc.updated = new Date().toISOString(); touch() }
  const crafting = () => (sheetToEdit(pc).crafting ??= { tools: [], known: [] })
  return {
    tools: raw?.crafting?.tools ?? [], known: raw?.crafting?.known ?? [],
    // The pouch is the ingredients in the inventory; "crafted" is everything else made from a recipe.
    list: w => inv.filter(l => l.item && wanted(w, l.item) && (w === 'pouch' || (get(l.item)?.fields.recipe as unknown[] | undefined)?.length)).map(l => ({ item: l.item!, qty: l.qty })),
    add(_w, id, n) { edit(s => { const l = s.inventory.find(x => x.item === id); if (l) l.qty += n; else if (n > 0) s.inventory.push({ item: id, qty: n }) }) },
    set(_w, id, qty) { edit(s => { const l = s.inventory.find(x => x.item === id); if (l) l.qty = qty }) },
    setTools(t) { crafting().tools = t; touch() },
    setKnown(k) { crafting().known = k; touch() },
  }
}

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

/** A character's spell attack bonus and save DC, from their sheet; undefined without a casting ability. */
export function spellStats(pc: Entry): { attack: number; dc: number; ability: Ability } | undefined {
  // Only once the scores are filled in; until then the spellbook's typed numbers count.
  if (!(pc.fields.sheet as Partial<CharacterSheet> | undefined)?.abilities) return undefined
  const s = sheetOf(pc)!
  const a = castingAbility(pc, s)
  if (!a) return undefined
  const p = profBonus(levelOf(pc)), m = mod(s.abilities[a])
  return { attack: p + m, dc: 8 + p + m, ability: a }
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
    return { id: e.id, name: e.name, toHit: m + prof + magic, damage, type: (e.fields.damageType as string[] | undefined)?.join('/'), note: e.fields.range as string | undefined }
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

// ---------- inventory: what can be done with a line, and dragging lines around ----------

/** Weapons and armor can be equipped. */
export const canEquip = (l: InventoryLine) => ['Weapon', 'Armor'].includes(String(get(l.item)?.fields.kind ?? ''))
/** Attunement: only items marked "Requires attunement" (and anything already attuned, so it can be taken off). */
export const canAttune = (l: InventoryLine) => !!l.attuned || !!get(l.item)?.fields.attunement

/** Change a PC's sheet and mark the PC as changed (nothing happens in a tab that doesn't save). */
export function editSheet(pc: Entry, fn: (s: CharacterSheet) => void) {
  if (state.readOnly) return
  fn(sheetToEdit(pc))
  pc.updated = new Date().toISOString()
  touch()
}

/** The inventory line being dragged: from the inventory, or out of the equipped or attunement list. */
export const dragged = reactive<{ pc: Id | null; i: number; from: 'inventory' | 'equipped' | 'attuned' }>({ pc: null, i: -1, from: 'inventory' })
export function startDrag(ev: DragEvent, pc: Entry, i: number, from: 'inventory' | 'equipped' | 'attuned') {
  Object.assign(dragged, { pc: pc.id, i, from })
  ev.dataTransfer?.setData('text/plain', get(sheetOf(pc)?.inventory[i]?.item)?.name ?? '')
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}
export const endDrag = () => { dragged.pc = null }
/** The line being dragged, if it belongs to this PC. */
export const draggedLine = (pc: Entry) => (dragged.pc === pc.id ? sheetOf(pc)?.inventory[dragged.i] : undefined)
