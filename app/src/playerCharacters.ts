// Players' characters at the DM's table. A player whose world follows the DM's links a character to a campaign the DM
// shares (the campaign is known to players); while connected to the DM's live session, their app sends it, with the
// entries it uses that the DM's world doesn't have (their own items, feats, spells…, and the family they made up for
// it), its pictures, again a few seconds after each change, and the list of characters still linked. The DM's app
// keeps them marked as the player's (sync.ts fromPlayer), never published to other players; one no longer linked
// stays, marked as such, until the DM removes it. The DM's own entries are never changed by what a player sends.
//
// The character is the player's and read-only at the DM's, except the parts both change (sharedParts.ts): its HP and
// conditions, its inventory and money, and its relations. Of those, each side keeps the newer change: the player's
// app sends its side with the character, the DM's app sends its side to that player's app (now, or when it next
// connects). A relation to something the player can't see stays with the DM.
//
// The DM can take a player's character out of a campaign (partySync.ts): their app is told and takes it out too, and
// until it has, what it sends of that character is left aside (so the old link doesn't bring it back).
import { reactive, watch } from 'vue'
import type { CharacterSheet, Entry, Id, PlayerShare } from './model/types'
import { db, state, touch } from './store'
import { applyImport, bundleOf, canExport, planExport, readImport, stable, type Bundle, type ExportOptions } from './transfer'
import { silently } from './progress'
import { desktop } from './storage/desktop'
import { carryOutRemovals, live, removalsOf, sendChanges, syncStatus, whoAmI } from './sync'
import { pendingRemovals, relinked, type Removals } from './partySync'
import { currentPc } from './sheet'
import { editSheet } from './sheetData'
import { addRelation, changed } from './edit'
import { SAME, copyParts, dmMap, mergePayload, payloadOf, stampChanges, type IdMap, type RelationChanges, type RelationScope, type SharedPayload } from './sharedParts'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

// ---------- both sides ----------

/** Mark what changed of a character's shared parts on this side (the sheet is only written when something did). */
function stampPc(pc: Entry, sc: RelationScope, m: IdMap) {
  const s = pc.fields.sheet as CharacterSheet | undefined
  if (!s || !state.worldId) return
  const copy = clone(s)
  if (stampChanges(copy, sc, m, state.worldId)) editSheet(pc, x => { x.sync = copy.sync })
}
/** Make the relation changes a merge asks for. */
function applyRelations(rc: RelationChanges) {
  const d = db()
  for (const a of rc.add) {
    const r = addRelation(a.a, a.b, a.kind)
    for (const k of ['role', 'note', 'from', 'to'] as const) if (a[k] != null) (r as unknown as Record<string, unknown>)[k] = a[k]
    r.visibility = 'known'
  }
  for (const u of rc.update) {
    const r = d.relations.find(x => x.id === u.id) as unknown as Record<string, unknown> | undefined
    if (r) for (const k of ['role', 'note', 'from', 'to'] as const) { const v = (u.value as Record<string, unknown>)[k]; if (v == null || v === '') delete r[k]; else r[k] = v }
  }
  if (rc.remove.length) { const gone = new Set(rc.remove); d.relations = d.relations.filter(r => !gone.has(r.id)) }
  if (rc.add.length + rc.update.length + rc.remove.length) touch()
}
/** The combat tracker shows a character's conditions from its own list: after a merge, the sheet's. */
function trackerFollows(pc: Entry) {
  const list = (pc.fields.sheet as CharacterSheet | undefined)?.conditions ?? []
  for (const c of state.db?.tracker?.combatants ?? []) if (c.entry === pc.id && c.conditions.join() !== list.join()) c.conditions = [...list]
}
/** Take the other side's newer parts into a character. */
function mergeInto(pc: Entry, p: SharedPayload, m: IdMap) {
  const trial = clone(pc.fields.sheet ?? {}) as CharacterSheet
  if (!mergePayload(trial, p, db().relations, m).sheet) return
  let rel: RelationChanges = { add: [], update: [], remove: [] }
  editSheet(pc, x => { rel = mergePayload(x, p, db().relations, m).rel })
  applyRelations(rel)
  trackerFollows(pc)
}

// ---------- a player's side ----------

/** A player's characters linked to a campaign their DM shares. */
export function linkedCharacters(): Entry[] {
  const d = state.db
  if (!d?.follow) return []
  const shared = new Set(d.follow.ids)
  return Object.values(d.entries).filter(e => e.type === 'pc' && !shared.has(e.id)
    && ((e.fields.campaigns as Id[] | undefined) ?? []).some(c => shared.has(c) && d.entries[c]?.type === 'campaign'))
}

/** What the last send did, for the session button. */
export const characterSend = reactive({ sent: '', error: '' })
/** What was last sent of each character, to send only what changed; cleared on (re)connecting. */
const lastSent = new Map<Id, string>()
let lastRoster: string | null = null
let sending = false
let timer: number | undefined
/** The family relations a family tree is drawn from. */
const FAMILY = new Set(['parent', 'sibling', 'spouse'])
/**
 * The player's own entries in a character's family (a mother or a brother they made up), through parents, spouses
 * and siblings, also past what the DM shared: they're linked to it only by relations, which an export doesn't follow.
 */
function familyOf(pcId: Id, shared: Set<Id>): Id[] {
  const d = state.db!
  const seen = new Set<Id>([pcId]), own: Id[] = [], queue = [pcId]
  while (queue.length) {
    const x = queue.shift()!
    for (const r of d.relations) {
      if (!FAMILY.has(r.kind) || (r.a !== x && r.b !== x)) continue
      const y = r.a === x ? r.b : r.a, e = d.entries[y]
      if (!e || seen.has(y)) continue
      seen.add(y)
      // other characters stay out (a linked one goes on its own); the DM's entries are walked through, not sent
      if (e.type === 'pc') continue
      if (!shared.has(y)) own.push(y)
      queue.push(y)
    }
  }
  return own
}
/** What goes to the DM with a character: everything it uses and its family, except what the DM shared. */
function planFor(pc: Entry, shared: Set<Id>) {
  const opts: ExportOptions = { dmText: true, hidden: true, textLinks: false, skip: ['pc'], exclude: e => shared.has(e.id) }
  const plan = planExport(pc.id, opts)
  if (!plan) return undefined
  const own = new Set(plan.entries.map(e => e.id))
  for (const id of familyOf(pc.id, shared)) {
    if (own.has(id)) continue
    for (const e of planExport(id, opts)?.entries ?? []) if (!own.has(e.id)) { own.add(e.id); plan.entries.push(e) }
  }
  // relations go as shared parts (sharedParts.ts), each with its own time
  plan.relations = []
  return { plan, own }
}
/** A player's side of a character's relations: their whole world is theirs to see. */
const playerScope = (own: Set<Id>): RelationScope => ({ relations: state.db!.relations, own, visible: id => !!state.db!.entries[id] })
/** A bundle without the moment it was made, to tell whether anything changed. */
const keyOf = (b: Bundle) => stable({ ...b, exported: undefined })

/** Send the linked characters that changed (all of them with `force`), and which are still linked. */
async function sendCharacters() {
  const d = state.db
  if (!desktop?.live || !d?.follow || state.readOnly || live.player.state !== 'connected' || sending) return
  sending = true
  try {
    const shared = new Set(d.follow.ids)
    const pcs = linkedCharacters()
    const characters: { id: Id; bundle: Bundle; shared: SharedPayload; seen?: Removals }[] = []
    for (const pc of pcs) {
      const x = planFor(pc, shared)
      if (!x) continue
      const sc = playerScope(x.own)
      stampPc(pc, sc, SAME)
      const bundle = await silently(() => bundleOf(x.plan))
      const payload = payloadOf((pc.fields.sheet ?? {}) as CharacterSheet, sc, SAME)
      // the DM's removals from campaigns this app has carried out: a link made after them is a new one
      const seen = d.meta.campaignRemovals?.[pc.id]
      if (lastSent.get(pc.id) !== keyOf(bundle) + stable(payload) + stable(seen ?? null)) characters.push({ id: pc.id, bundle, shared: payload, ...(seen ? { seen } : {}) })
    }
    const ids = pcs.map(p => p.id)
    if (!characters.length && ids.join('|') === lastRoster) return
    // the DM sees the player's name (the character's Player field), else their current character's
    const who = String(currentPc.value?.fields.player ?? pcs.find(p => p.fields.player)?.fields.player ?? '').trim() || whoAmI()
    const r = await desktop.live.sendCharacters(JSON.stringify({ player: state.worldId, who, ids, characters }))
    if (r.ok) {
      for (const c of characters) lastSent.set(c.id, keyOf(c.bundle) + stable(c.shared) + stable(c.seen ?? null))
      lastRoster = ids.join('|')
      characterSend.sent = new Date().toISOString()
      characterSend.error = ''
    } else characterSend.error = r.error ?? 'Not sent.'
  } catch (e) {
    characterSend.error = (e as Error).message
  } finally { sending = false }
}
function sendSoon(ms: number) { clearTimeout(timer); timer = window.setTimeout(sendCharacters, ms) }
// On connecting, everything goes (the DM's app may have restarted); after that, what changed, once edits pause.
watch(() => live.player.state, s => { if (s === 'connected') { lastSent.clear(); lastRoster = null; sendSoon(1500) } })
watch(() => state.savedAt, () => { if (state.db?.follow && live.player.state === 'connected') sendSoon(2500) }, { flush: 'sync' })

/** The DM's side of this player's characters: their newer changes come in (HP, conditions, items, relations). */
function receiveShared(raw: string) {
  const d = state.db
  let msg: unknown
  try { msg = JSON.parse(raw) } catch { return }
  if (!d?.follow || state.readOnly || !isObj(msg) || msg.to !== state.worldId || !Array.isArray(msg.characters)) return
  // characters the DM took out of a campaign come out of it here too
  if (isObj(msg.removals)) carryOutRemovals(msg.removals as Record<Id, Removals>)
  const shared = new Set(d.follow.ids)
  for (const c of msg.characters) {
    if (!isObj(c) || typeof c.id !== 'string' || !isObj(c.shared)) continue
    const pc = d.entries[c.id]
    if (!pc || pc.type !== 'pc' || shared.has(pc.id)) continue
    const x = planFor(pc, shared)
    if (!x) continue
    stampPc(pc, playerScope(x.own), SAME)
    mergeInto(pc, c.shared as unknown as SharedPayload, SAME)
  }
}
if (desktop?.live?.onShared) desktop.live.onShared(raw => { try { receiveShared(raw) } catch (e) { console.error('The DM\'s side of a character', e) } })

// ---------- the DM's side ----------

/** Every player's entries here, to tell them from the DM's own. */
const allPlayers = () => new Set(Object.values(db().meta.fromPlayers ?? {}).flatMap(p => Object.values(p.entries)))
/**
 * The DM's side of a player's character relations: the player's entries, and what the DM shares with players
 * (known to them). A relation to anything else (a DM-only NPC, another player's character) stays here.
 */
function dmScope(p: PlayerShare): RelationScope {
  const d = db(), own = new Set(Object.values(p.entries)), others = allPlayers()
  return {
    relations: d.relations, own,
    visible: id => own.has(id) || (!others.has(id) && !!d.entries[id] && d.entries[id].type !== 'pc' && d.entries[id].visibility === 'known' && canExport(d.entries[id])),
  }
}
const mapOf = (p: PlayerShare) => dmMap(p.entries, id => db().entries[id])

/** Characters arrive one message after another, each applied in full before the next. */
let queue: Promise<void> = Promise.resolve()
if (desktop?.live) desktop.live.onCharacter(msg => { queue = queue.then(() => receive(msg)).catch(e => console.error('A player\'s characters', e)) })

/** Bring what a player sent into the DM's world: their characters and their own entries. */
async function receive(raw: unknown) {
  const d = state.db
  // only into the world being hosted, by its DM
  if (!d || state.readOnly || d.follow || !live.host.hosting) return
  if (!isObj(raw) || typeof raw.player !== 'string' || !raw.player || raw.player.length > 100 || !Array.isArray(raw.characters) || raw.characters.length > 20) return
  const who = typeof raw.who === 'string' && raw.who.trim() ? raw.who.trim().slice(0, 60) : 'A player'
  const all = (db().meta.fromPlayers ??= {})
  const p: PlayerShare = (all[raw.player] ??= { who, received: '', characters: {}, entries: {} })
  p.who = who
  const arrived: string[] = []
  for (const c of raw.characters) {
    if (!isObj(c) || typeof c.id !== 'string' || !isObj(c.bundle)) continue
    // taken out of a campaign by the DM: left aside until the player's app has taken it out too; linked again after
    // that (the player's to do), the removal is over
    const known = p.characters[c.id]
    if (known?.removed) {
      const seen = isObj(c.seen) ? c.seen as Removals : undefined
      if (pendingRemovals(known.removed, seen).length) continue
      const camps = (c.bundle.entries as Entry[] | undefined)?.find(e => isObj(e) && e.id === c.id)?.fields?.campaigns
      for (const x of relinked(known.removed, seen, Array.isArray(camps) ? camps as Id[] : [])) delete known.removed[x]
      if (!Object.keys(known.removed).length) delete known.removed
    }
    // the DM's side of the shared parts, as it is before the player's copy replaces the character; none until both
    // sides have synced once (a character from before: the player's side is the newer one), nor from an app too old
    // to send its side (then the player's copy is taken as it is, as before)
    const was = p.entries[c.id] ? db().entries[p.entries[c.id]] : undefined
    const synced = !!(was?.fields.sheet as CharacterSheet | undefined)?.sync && isObj(c.shared)
    if (was && synced) stampPc(was, dmScope(p), mapOf(p))
    const before = was && synced ? clone(was.fields.sheet as CharacterSheet) : undefined
    const mine = new Set(Object.values(p.entries))
    const file = new File([JSON.stringify(c.bundle)], 'character.json', { type: 'application/json' })
    let plan
    try {
      plan = await silently(() => readImport(file, {
        // what this player sent before is updated; a character is always their own; anything else may be one the DM has
        claim: e => { const here = p.entries[e.id]; return here && db().entries[here] ? here : e.type === 'pc' ? null : undefined },
      }))
    } catch (e) { console.error(`${who}'s character`, e); continue }
    // the DM's own entries (and other players') are used as they are, never changed
    for (const i of plan.items) if (i.here && !mine.has(i.here.id)) i.take = false
    // relations come as shared parts
    plan.relations = { add: [], change: [] }
    await silently(() => applyImport(plan))
    for (const i of plan.items) if (!i.here || mine.has(i.here.id)) p.entries[i.entry.id] = i.ready.id
    const id = p.entries[c.id], pc = id ? db().entries[id] : undefined
    if (!pc) continue
    // the shared parts: the DM's side back in place, then whatever of the player's is newer
    editSheet(pc, s => {
      if (before) { copyParts(before, s); s.sync = before.sync }
      // the first time: the player's parts as they came; their relations still to make here
      else s.sync = { vitals: s.sync?.vitals, inventory: s.sync?.inventory }
    })
    if (isObj(c.shared)) mergeInto(pc, c.shared as unknown as SharedPayload, mapOf(p))
    if (!p.characters[c.id]) arrived.push(pc.name || 'a character')
    p.characters[c.id] = { ...p.characters[c.id], id }
  }
  // characters no longer linked (or deleted) stay, marked
  const linked = new Set(Array.isArray(raw.ids) ? raw.ids.filter((x): x is string => typeof x === 'string') : [])
  for (const [their, c] of Object.entries(p.characters)) { if (linked.has(their)) delete c.gone; else c.gone = true }
  p.received = new Date().toISOString()
  touch()
  if (arrived.length) syncStatus.note = `${arrived.join(' and ')} arrived from ${arrived.includes(who) ? 'its player' : who}'s app: kept up to date while they're connected. Their HP, conditions, inventory and relations you can change too.`
  // the DM's newer side goes back to them
  shareSoon(1000)
}

/** What was last sent to each player's app of their characters' shared parts; cleared when players (re)connect. */
const sharedSent = new Map<string, string>()
let sharing = false
let shareTimer: number | undefined
/**
 * An item the DM puts in a player's inventory that players don't know of yet becomes known (it's in their hands
 * now) and goes out with the next send. Returns its name, if one did.
 */
function makeGivenKnown(pc: Entry, p: PlayerShare): string[] {
  const own = new Set(Object.values(p.entries)), named: string[] = []
  const sh = pc.fields.sheet as CharacterSheet | undefined
  for (const l of [...(sh?.inventory ?? []), ...(sh?.treasury ?? [])]) {
    const e = l.item ? db().entries[l.item] : undefined
    if (!e || own.has(e.id) || e.visibility === 'known' || !canExport(e)) continue
    e.visibility = 'known'
    changed(e)
    named.push(e.name)
  }
  return named
}
/** Send each connected player's app the DM's side of their characters (what changed since the last send). */
async function sendShared() {
  const d = state.db
  if (!desktop?.live?.sendShared || !d || d.follow || state.readOnly || !live.host.hosting || sharing) return
  sharing = true
  try {
    const known: string[] = []
    for (const [player, p] of Object.entries(d.meta.fromPlayers ?? {})) {
      const sc = dmScope(p), m = mapOf(p)
      const characters: { id: Id; shared: SharedPayload }[] = []
      const removals = removalsOf(p)
      for (const [their, c] of Object.entries(p.characters)) {
        const pc = c.gone ? undefined : d.entries[c.id]
        // not before the player's side has come once (it's the newer one then)
        if (!pc || !(pc.fields.sheet as CharacterSheet | undefined)?.sync) continue
        known.push(...makeGivenKnown(pc, p))
        stampPc(pc, sc, m)
        characters.push({ id: their, shared: payloadOf(pc.fields.sheet as CharacterSheet, sc, m) })
      }
      if (!characters.length && !removals) continue
      const text = JSON.stringify({ to: player, characters, ...(removals ? { removals } : {}) })
      if (sharedSent.get(player) === text) continue
      const r = await desktop.live.sendShared(text)
      // not connected now: it goes when they connect
      if (r.ok && r.sent) sharedSent.set(player, text)
    }
    if (known.length) {
      syncStatus.note = `Now known to players (given to a character): ${[...new Set(known)].join(', ')}.`
      await sendChanges()
    }
  } catch (e) { console.error('Sending players their characters', e) } finally { sharing = false }
}
function shareSoon(ms: number) { clearTimeout(shareTimer); shareTimer = window.setTimeout(sendShared, ms) }
// after the DM's changes (once edits pause), and to players who (re)connect
watch(() => state.savedAt, () => { if (state.db && !state.db.follow && live.host.hosting && Object.keys(state.db.meta.fromPlayers ?? {}).length) shareSoon(1500) }, { flush: 'sync' })
watch(() => (live.host.hosting ? live.host.players.join('|') : ''), () => { sharedSent.clear(); shareSoon(1500) })

/** The player's share and their id of a character they sent, if it is one. */
export function playerOf(id: Id): { p: PlayerShare; their: Id } | undefined {
  for (const p of Object.values(db().meta.fromPlayers ?? {})) for (const [their, c] of Object.entries(p.characters)) if (c.id === id) return { p, their }
  return undefined
}
/** The campaigns the DM took a player's character out of (none for anyone else's). */
export function removedFrom(id: Id): Id[] { const w = playerOf(id); return w ? Object.keys(w.p.characters[w.their].removed ?? {}) : [] }

/**
 * Take a character out of a campaign. One the DM made simply leaves it; a player's leaves it here, and their app is
 * told to take it out too (now, or when it next connects or syncs), until then what it sends of it is left aside.
 */
export function removeFromCampaign(pc: Entry, campaign: Id) {
  const c = db().entries[campaign]
  if (c && ((c.fields.members as Id[] | undefined) ?? []).includes(pc.id)) { c.fields.members = (c.fields.members as Id[]).filter(x => x !== pc.id); changed(c) }
  const linked = ((pc.fields.campaigns as Id[] | undefined) ?? []).includes(campaign)
  if (linked) { pc.fields.campaigns = (pc.fields.campaigns as Id[]).filter(x => x !== campaign); changed(pc) }
  const who = playerOf(pc.id)
  if (who && linked) {
    const k = who.p.characters[who.their]
    k.removed = { ...k.removed, [campaign]: new Date().toISOString() }
    touch()
    shareSoon(300)
    if (db().meta.sharing?.autoSend && live.host.hosting) sendChanges()
  }
}

/** The DM removes a player's character (its own things stay; they may be used elsewhere). */
export function removePlayerCharacter(id: Id) {
  const d = db()
  for (const p of Object.values(d.meta.fromPlayers ?? {})) {
    for (const [their, c] of Object.entries(p.characters)) if (c.id === id) delete p.characters[their]
    for (const [their, here] of Object.entries(p.entries)) if (here === id) delete p.entries[their]
  }
  delete d.entries[id]
  d.relations = d.relations.filter(r => r.a !== id && r.b !== id)
  touch()
}
