// The party between the DM and the players, the parts that take no store (tests/partySync.mjs):
// - The DM takes a player's character out of a campaign: the DM's world keeps when (PlayerShare.characters[].removed),
//   and tells that player's app (live, and in the publish for a shared folder), which takes the campaign off the
//   character and remembers it did (meta.campaignRemovals). What the player sends of the character is left aside until
//   their app says it has (`seen`); a link they make again after that is theirs to make, and brings it back.
// - Players see the other characters of their campaigns as NPCs: a copy with who they are and how they look, no sheet.
import type { Entry, Id } from './model/types'

/** Campaign id → when the DM took a character out of it. */
export type Removals = Record<Id, string>

/** The removals a player's app hasn't carried out yet: what it sends of the character is left aside meanwhile. */
export const pendingRemovals = (removed: Removals | undefined, seen: Removals | undefined): Id[] =>
  Object.entries(removed ?? {}).filter(([c, at]) => seen?.[c] !== at).map(([c]) => c)

/** The campaigns the player linked the character to again after their app took it out: those removals are over. */
export const relinked = (removed: Removals | undefined, seen: Removals | undefined, campaigns: Id[]): Id[] =>
  Object.entries(removed ?? {}).filter(([c, at]) => seen?.[c] === at && campaigns.includes(c)).map(([c]) => c)

/** The removals the DM sent that a player's app still has to carry out. */
export const toCarryOut = (removals: Removals | undefined, done: Removals | undefined): [Id, string][] =>
  Object.entries(removals ?? {}).filter(([c, at]) => typeof at === 'string' && done?.[c] !== at)

/** What players see of a party member's character: their name, picture, species, class and level, looks and text. */
const LOOKS = ['race', 'gender', 'age', 'born', 'hair', 'eyes', 'skin', 'clothing'] as const

/**
 * A character as an NPC for the other players (`occupation`: "Wizard 5"; the DM-only text goes when it's published).
 * `partyOf`: the campaigns it plays in, so a player's campaign page shows it in its party; `playedBy`: the character's
 * Player field (who plays it).
 */
export function partyNpc(pc: Entry, occupation: string, partyOf: Id[] = []): Entry {
  const fields: Record<string, unknown> = {}
  for (const k of LOOKS) { const v = (pc.fields as Record<string, unknown>)[k]; if (v != null && v !== '') fields[k] = v }
  if (occupation) fields.occupation = occupation
  if (partyOf.length) fields.partyOf = [...partyOf]
  const player = (pc.fields as Record<string, unknown>).player
  if (typeof player === 'string' && player.trim()) fields.playedBy = player.trim()
  return {
    id: pc.id, type: 'npc', name: pc.name, aliases: [...(pc.aliases ?? [])], tags: [], fields: fields as Entry['fields'],
    body: pc.body ?? '', visibility: 'known', ...(pc.image ? { image: pc.image } : {}), created: pc.created, updated: pc.updated,
  }
}
