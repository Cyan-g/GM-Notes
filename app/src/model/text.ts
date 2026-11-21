// Text helpers shared by the app and the seed script: names for matching, ids made from names, and the DM-only
// (:::secret) blocks of an entry's text. Pure: nothing here reads the database.

/**
 * A name for matching, so the same name written another way still matches: no accents, lower case, no apostrophes,
 * other punctuation and spaces dropped ("Mariner's Armor" = "marinersarmor"). With `sep` the words stay apart
 * instead ("mariners armor"), for matching word by word.
 */
export const norm = (s: string, sep = '') => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/['\u2019\u2018`\u00b4]/g, '').replace(/[^a-z0-9]+/g, sep).trim()

/**
 * An id made from a name: no accents, lower case, no apostrophes, words joined by hyphens ("Mariner's Armor" →
 * "mariners-armor"); "entry" for a name with nothing left. Stored ids come from it, so it must not change.
 */
export const slug = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entry'

/** A DM-only block: ":::secret" on a line of its own, then the text (captured), then ":::" on a line of its own. */
export const SECRET_BLOCK = /^:::secret\s*\n([\s\S]*?)\n:::\s*$/gm
/** A text without its DM-only blocks. */
export const stripSecrets = (text: string) => text.replace(SECRET_BLOCK, '')
/** Whether a text has a DM-only block. */
export const hasSecrets = (text: string) => /^:::secret/m.test(text)
