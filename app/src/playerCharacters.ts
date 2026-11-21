// Players' characters at the DM's table. A player whose world follows the DM's links a character to a campaign the DM
// shares (the campaign is known to players); while connected to the DM's live session, their app sends it, with the
// entries it uses that the DM's world doesn't have (their own items, feats, spells…) and its pictures, again a few
// seconds after each change, and the list of characters still linked. The DM's app keeps them read-only, marked as the
// player's (sync.ts fromPlayer), never published to other players; one no longer linked stays, marked as such, until
// the DM removes it. The DM's own entries are never changed by what a player sends.
import { reactive, watch } from 'vue'
import type { Entry, Id, PlayerShare } from './model/types'
import { db, state, touch } from './store'
import { applyImport, bundleOf, planExport, readImport, stable, type Bundle } from './transfer'
import { silently } from './progress'
import { desktop } from './storage/desktop'
import { live, syncStatus, whoAmI } from './sync'
import { currentPc } from './sheet'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

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
    const characters: { id: Id; bundle: Bundle }[] = []
    for (const pc of pcs) {
      // everything the character uses, except what the DM shared (they have it) and other characters
      const plan = planExport(pc.id, { dmText: true, hidden: true, textLinks: false, skip: ['pc'], exclude: e => shared.has(e.id) })
      if (!plan) continue
      const bundle = await silently(() => bundleOf(plan))
      if (lastSent.get(pc.id) !== keyOf(bundle)) characters.push({ id: pc.id, bundle })
    }
    const ids = pcs.map(p => p.id)
    if (!characters.length && ids.join('|') === lastRoster) return
    // the DM sees the player's name (the character's Player field), else their current character's
    const who = String(currentPc.value?.fields.player ?? pcs.find(p => p.fields.player)?.fields.player ?? '').trim() || whoAmI()
    const r = await desktop.live.sendCharacters(JSON.stringify({ player: state.worldId, who, ids, characters }))
    if (r.ok) {
      for (const c of characters) lastSent.set(c.id, keyOf(c.bundle))
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
watch(() => state.savedAt, () => { if (state.db?.follow && live.player.state === 'connected') sendSoon(5000) }, { flush: 'sync' })

// ---------- the DM's side ----------

/** Characters arrive one message after another, each applied in full before the next. */
let queue: Promise<void> = Promise.resolve()
if (desktop?.live) desktop.live.onCharacter(msg => { queue = queue.then(() => receive(msg)).catch(e => console.error('A player\'s characters', e)) })

/** Bring what a player sent into the DM's world: their characters and their own entries, read-only. */
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
    await silently(() => applyImport(plan))
    for (const i of plan.items) if (!i.here || mine.has(i.here.id)) p.entries[i.entry.id] = i.ready.id
    const id = p.entries[c.id]
    if (!id) continue
    if (!p.characters[c.id]) arrived.push(db().entries[id]?.name ?? 'a character')
    p.characters[c.id] = { id }
  }
  // characters no longer linked (or deleted) stay, marked
  const linked = new Set(Array.isArray(raw.ids) ? raw.ids.filter((x): x is string => typeof x === 'string') : [])
  for (const [their, c] of Object.entries(p.characters)) { if (linked.has(their)) delete c.gone; else c.gone = true }
  p.received = new Date().toISOString()
  touch()
  if (arrived.length) syncStatus.note = `${arrived.join(' and ')} arrived from ${arrived.includes(who) ? 'its player' : who}'s app: read-only here, kept up to date while they're connected.`
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
