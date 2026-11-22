// The initiative tracker's state is saved with the world, so a fight survives closing the app.
import type { Combatant, DeathSaveState, Entry, Id, Tracker } from './model/types'
import { byType, db, get, touch } from './store'
import { combatantsFrom, newCombatantId, playerCombatant, statsOf } from './encounter'
import { concentrationDc, mod } from './model/dnd'
import { armorClass, initiative, maxHpOf } from './sheet'
import { concentrationAdv, deathSaveAdv, gearTotals } from './effects'
import { sheetOf, sheetToEdit } from './sheetData'
import { changed } from './edit'
import { isShared } from './sync'
import { deathSaveFromDamage, isDead, noDeathSaves, settleDeathSaves } from './conditions'

export function tracker(): Tracker {
  const d = db()
  if (!d.tracker) d.tracker = { round: 0, turn: -1, combatants: [] }
  return d.tracker
}

const d20 = () => 1 + Math.floor(Math.random() * 20)

// ---- a combatant's numbers: a player character's come from their sheet ----

/** The character whose sheet a combatant's numbers come from. */
const sheetPc = (c: Combatant) => (c.isPlayer && c.entry ? get(c.entry) : undefined)
/** A party member's advantage on Concentration saves (War Caster) and death saves (Durable), from their sheet. */
export function saveRollNotes(c: Combatant): { conc?: string; death?: string } {
  const pc = sheetPc(c), s = pc && sheetOf(pc)
  if (!s) return {}
  const t = gearTotals(s)
  return { conc: concentrationAdv(t), death: deathSaveAdv(t) }
}

export interface FighterStats {
  hp?: number; maxHp?: number; tempHp?: number; ac?: number; initMod: number
  /** AC and initiative come from the sheet; HP too once the sheet has a max HP. */
  acFromSheet: boolean; hpFromSheet: boolean
}
export function fighterStats(c: Combatant): FighterStats {
  const pc = sheetPc(c)
  const s = pc && sheetOf(pc)
  if (!s) return { hp: c.hp, maxHp: c.maxHp, tempHp: c.tempHp, ac: c.ac, initMod: c.initMod, acFromSheet: false, hpFromSheet: false }
  const max = maxHpOf(s)
  const linked = max != null
  // A player's character sent from their app is read-only here: the fight keeps its own HP, starting from the sheet's.
  if (isShared(pc)) return { ac: armorClass(s).ac, initMod: initiative(s), acFromSheet: true, hpFromSheet: false, hp: c.hp ?? s.hp ?? max, maxHp: max ?? c.maxHp, tempHp: c.tempHp }
  return {
    ac: armorClass(s).ac, initMod: initiative(s), acFromSheet: true, hpFromSheet: linked,
    hp: linked ? s.hp ?? max : c.hp, maxHp: linked ? max : c.maxHp, tempHp: linked ? s.tempHp : c.tempHp,
  }
}
/**
 * Changes HP (and temporary HP): on the sheet for a linked character, else on the combatant. Dropping to 0 ends
 * concentration, and knocks a party member unconscious; back above 0, they wake and their death saves end.
 */
export function setHp(c: Combatant, hp: number | undefined, temp: number | undefined) {
  const pc = sheetPc(c)
  const before = fighterStats(c)
  const wasDown = before.hp != null && before.hp <= 0
  if (hp != null && hp <= 0 && !wasDown && before.maxHp) {
    c.conditions = c.conditions.filter(x => x !== 'Concentrating')
    delete c.concChecks
    if (c.rounds) delete c.rounds.Concentrating
    if (isParty(c) && !c.conditions.includes('Unconscious')) c.conditions = [...c.conditions, 'Unconscious']
  }
  if (wasDown && (hp ?? 0) > 0) c.conditions = c.conditions.filter(x => x !== 'Unconscious')
  if (pc && before.hpFromSheet) {
    const s = sheetToEdit(pc)
    s.hp = hp
    s.tempHp = temp || undefined
    changed(pc)
  } else {
    c.hp = hp
    c.tempHp = temp || undefined
  }
  if ((hp ?? 0) > 0) setDeathSaves(c, undefined)
  touch()
}
const isDown = (c: Combatant) => { const s = fighterStats(c); return s.hp != null && s.hp <= 0 && !!s.maxHp }

export function loadEncounter(id: Id, replace = true) {
  const e = get(id)
  if (!e) return
  const t = tracker()
  const monsters = combatantsFrom((e.fields.creatures) ?? [])
  if (replace) {
    // The encounter's own party if it has one (keeping the HP of those already in the tracker), else whoever is there.
    const fresh = (c: Combatant): Combatant => ({ ...c, init: null, conditions: c.conditions.filter(x => x === 'Exhaustion'), rounds: undefined, concChecks: undefined })
    const party = (e.fields.party) ?? []
    const players = party.length
      ? party.map(id => get(id)).filter((p): p is Entry => !!p).map(p => { const had = t.combatants.find(c => c.entry === p.id); return had ? fresh(had) : playerCombatant(p) })
      : t.combatants.filter(c => c.isPlayer).map(fresh)
    t.combatants = [...players, ...monsters]
    t.round = 0
    t.turn = -1
  } else t.combatants.push(...monsters)
  t.encounter = id
  touch()
}

/** The player characters of a campaign, or every PC when there's no campaign. */
export function partyOf(campaign?: Id): Entry[] {
  const pcs = byType.value.get('pc') ?? []
  return campaign ? pcs.filter(p => ((p.fields.campaigns) ?? []).includes(campaign)) : pcs
}

export function addPlayers(pcs: Entry[]) {
  const t = tracker()
  for (const pc of pcs) if (!t.combatants.some(c => c.entry === pc.id)) t.combatants.push(playerCombatant(pc))
  touch()
}

export function addCombatant(c: Combatant) { tracker().combatants.push(c); touch() }
/** A creature or NPC as an enemy, with its statblock's numbers ("Goblin 2" when there's one already); a character as a player. */
export function addEntryToTracker(id: Id) {
  const e = get(id)
  if (!e) return
  if (e.type === 'pc') { addPlayers([e]); return }
  const sb = statsOf(e)
  const same = tracker().combatants.filter(c => c.entry === id).length
  addCombatant({ id: newCombatantId(), name: same ? `${e.name} ${same + 1}` : e.name, entry: id, isPlayer: false, init: null, initMod: mod(sb?.abilities?.dex), hp: sb?.hp, maxHp: sb?.hp, ac: sb?.ac, conditions: [] })
}

export function removeCombatant(id: string) {
  const t = tracker()
  const i = t.combatants.findIndex(c => c.id === id)
  if (i < 0) return
  t.combatants.splice(i, 1)
  if (i < t.turn) t.turn--
  if (t.turn >= t.combatants.length) t.turn = t.combatants.length ? 0 : -1
  touch()
}

/** Roll for everyone without an initiative (monsters by default; players usually say their own). */
export function rollInitiative(includePlayers = false) {
  for (const c of tracker().combatants) if (c.init == null && (includePlayers || !c.isPlayer)) c.init = d20() + fighterStats(c).initMod
  sortByInitiative()
}

export function sortByInitiative() {
  const t = tracker()
  const current = t.combatants[t.turn]?.id
  t.combatants.sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || fighterStats(b).initMod - fighterStats(a).initMod || Number(b.isPlayer) - Number(a.isPlayer))
  if (current) t.turn = t.combatants.findIndex(c => c.id === current)
  touch()
}

/** Party and allies stand on the left, enemies on the right. */
export const isParty = (c: Combatant) => (c.side ? c.side === 'party' : c.isPlayer)
/** Fallen enemies are skipped; fallen party members still get their turn (death saves). */
const skipped = (c: Combatant) => !isParty(c) && isDown(c)

/** Conditions with rounds left count down at the end of the combatant's turn, and end at 0. */
function endTurn(c: Combatant) {
  if (!c.rounds) return
  for (const [x, n] of Object.entries(c.rounds)) {
    if (n > 1) c.rounds[x] = n - 1
    else { delete c.rounds[x]; c.conditions = c.conditions.filter(y => y !== x) }
  }
  if (!Object.keys(c.rounds).length) delete c.rounds
}

export function nextTurn(step = 1) {
  const t = tracker()
  const n = t.combatants.length
  if (!n) return
  if (t.turn < 0) { sortByInitiative(); t.turn = 0; t.round = 1; touch(); return }
  if (step > 0) endTurn(t.combatants[t.turn])
  let turn = t.turn
  for (let k = 0; k < n; k++) {
    turn += step
    if (turn >= n) { turn = 0; t.round++ }
    if (turn < 0) { turn = n - 1; t.round = Math.max(1, t.round - 1) }
    if (!skipped(t.combatants[turn])) break
  }
  t.turn = turn
  // a creature regains its legendary actions at the start of its turn
  if (step > 0) delete t.combatants[turn].legendaryUsed
  touch()
}

/**
 * "-7" damages, "+5" heals, "=20" sets, "t5" gives temporary HP. Damage takes temporary HP first, asks for a
 * concentration save from someone concentrating, and is a failed death save for a party member already at 0.
 */
export function applyHp(c: Combatant, input: string) {
  const m = input.trim().toLowerCase().match(/^([+\-=t]?)\s*(\d+)$/)
  if (!m) return false
  const n = Number(m[2])
  const op = m[1] || '-'
  const s = fighterStats(c)
  let hp = s.hp, temp = s.tempHp
  if (op === 't') temp = Math.max(temp ?? 0, n) || undefined
  else if (op === '=') hp = n
  else if (op === '+') {
    // three failed death saves: dead; healing brings them back only if the DM says so (a revivify)
    if (isDead(deathSavesOf(c)) && !window.confirm(`${c.name} is dead (three failed death saves). Heal them anyway?`)) return true
    hp = s.maxHp != null ? Math.min(s.maxHp, Math.max(0, hp ?? 0) + n) : (hp ?? 0) + n
  }
  else {
    if (!n) return true
    const wasDown = hp != null && hp <= 0
    let dmg = n
    if (temp) { const used = Math.min(temp, dmg); temp -= used; dmg -= used }
    hp = Math.max(0, (hp ?? 0) - dmg)
    if (c.conditions.includes('Concentrating') && hp > 0) c.concChecks = [...(c.concChecks ?? []), concentrationDc(n)]
    if (wasDown && isParty(c)) addDeathSave(c, false)
  }
  setHp(c, hp, temp)
  return true
}

/** A death saving throw: three successes and the character is stable, three failures and they die. */
export function addDeathSave(c: Combatant, ok: boolean, by = 1) {
  const d = deathSavesOf(c)
  // a success counts on from where the boxes are; damage ends being stable (deathSaveFromDamage)
  setDeathSaves(c, ok ? { ok: Math.min(3, d.ok + by), fail: d.fail } : deathSaveFromDamage(d, by))
  touch()
}
/** A combatant's death saves: their sheet's for a character whose HP is on it (one set of boxes), else their own. */
export function deathSavesOf(c: Combatant): DeathSaveState {
  const pc = sheetPc(c)
  const own = pc && fighterStats(c).hpFromSheet ? sheetOf(pc)?.deathSaves : c.deathSaves
  return own ?? { ok: 0, fail: 0 }
}
export function setDeathSaves(c: Combatant, d: DeathSaveState | undefined) {
  const pc = sheetPc(c)
  const keep = d && !noDeathSaves(d) ? settleDeathSaves(d) : undefined
  if (pc && fighterStats(c).hpFromSheet) {
    if (!keep && !sheetOf(pc)?.deathSaves) return
    const s = sheetToEdit(pc)
    if (keep) s.deathSaves = keep; else delete s.deathSaves
    changed(pc)
  } else if (keep) c.deathSaves = keep
  else delete c.deathSaves
}

/** End the fight: monsters go. Player characters stay; those without a sheet's HP get their full HP back. */
export function clearTracker(keepPlayers = true) {
  const t = tracker()
  t.combatants = keepPlayers
    ? t.combatants.filter(c => c.isPlayer).map(c => {
      const own = !fighterStats(c).hpFromSheet
      // exhaustion outlasts the fight (a long rest takes it away)
      return { ...c, init: null, conditions: c.conditions.filter(x => x === 'Exhaustion'), rounds: undefined, concChecks: undefined, deathSaves: undefined, ...(own ? { hp: c.maxHp, tempHp: undefined } : {}) }
    })
    : []
  t.round = 0
  t.turn = -1
  t.encounter = undefined
  touch()
}
