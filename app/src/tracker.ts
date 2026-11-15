// The initiative tracker's state lives in the database, so a fight survives closing the browser.
import type { Combatant, Entry, Id, Tracker } from './model/types'
import { byType, db, get, touch } from './store'
import { combatantsFrom, playerCombatant } from './encounter'
import type { EncounterLine } from './model/types'

export function tracker(): Tracker {
  const d = db()
  if (!d.tracker) d.tracker = { round: 0, turn: -1, combatants: [] }
  return d.tracker
}

const d20 = () => 1 + Math.floor(Math.random() * 20)

export function loadEncounter(id: Id, replace = true) {
  const e = get(id)
  if (!e) return
  const t = tracker()
  const monsters = combatantsFrom((e.fields.creatures as EncounterLine[] | undefined) ?? [])
  if (replace) {
    const players = t.combatants.filter(c => c.isPlayer).map(c => ({ ...c, init: null, conditions: [] }))
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
  return campaign ? pcs.filter(p => ((p.fields.campaigns as Id[] | undefined) ?? []).includes(campaign)) : pcs
}

export function addPlayers(pcs: Entry[]) {
  const t = tracker()
  for (const pc of pcs) if (!t.combatants.some(c => c.entry === pc.id)) t.combatants.push(playerCombatant(pc))
  touch()
}

export function addCombatant(c: Combatant) { tracker().combatants.push(c); touch() }

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
  for (const c of tracker().combatants) if (c.init == null && (includePlayers || !c.isPlayer)) c.init = d20() + c.initMod
  sortByInitiative()
}

export function sortByInitiative() {
  const t = tracker()
  const current = t.combatants[t.turn]?.id
  t.combatants.sort((a, b) => (b.init ?? -99) - (a.init ?? -99) || b.initMod - a.initMod || Number(b.isPlayer) - Number(a.isPlayer))
  if (current) t.turn = t.combatants.findIndex(c => c.id === current)
  touch()
}

export function nextTurn(step = 1) {
  const t = tracker()
  const n = t.combatants.length
  if (!n) return
  if (t.turn < 0) { sortByInitiative(); t.turn = 0; t.round = 1; touch(); return }
  let turn = t.turn + step
  if (turn >= n) { turn = 0; t.round++ }
  if (turn < 0) { turn = n - 1; t.round = Math.max(1, t.round - 1) }
  t.turn = turn
  touch()
}

/** "-7" damages, "+5" heals, "=20" sets. Damage takes temporary HP first. */
export function applyHp(c: Combatant, input: string) {
  const m = input.trim().match(/^([+\-=]?)\s*(\d+)$/)
  if (!m) return false
  const n = Number(m[2])
  const op = m[1] || '-'
  if (op === '=') c.hp = n
  else if (op === '+') c.hp = c.maxHp != null ? Math.min(c.maxHp, (c.hp ?? 0) + n) : (c.hp ?? 0) + n
  else {
    let dmg = n
    if (c.tempHp) { const used = Math.min(c.tempHp, dmg); c.tempHp -= used; dmg -= used }
    c.hp = (c.hp ?? 0) - dmg
  }
  touch()
  return true
}

export function clearTracker(keepPlayers = true) {
  const t = tracker()
  t.combatants = keepPlayers ? t.combatants.filter(c => c.isPlayer).map(c => ({ ...c, init: null, conditions: [], hp: c.maxHp, tempHp: undefined })) : []
  t.round = 0
  t.turn = -1
  t.encounter = undefined
  touch()
}
