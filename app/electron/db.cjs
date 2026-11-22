// The world's database: one SQLite file, data/dndesk.sqlite. Used by the desktop app (main.cjs) and by the
// dev server (vite.config.ts), through Node's built-in SQLite.
//
// The file itself enforces what must always hold: every entry has a known type, an id and a name, its fields are a
// JSON object; relations only connect entries that exist and are of a known kind (deleting an entry deletes its
// relations). Saves are one transaction each: they apply completely or not at all. Earlier versions of changed and
// deleted entries are kept in `history`.
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const FILE = 'dndesk.sqlite'
/** A changed entry's previous version is kept at most this often, so typing doesn't store every keystroke. */
const HISTORY_EVERY_MS = 10 * 60 * 1000
/** And at most this many versions per entry. */
const HISTORY_KEEP = 40
/** What's kept as plain settings: the world's meta data and the play state. */
const PLAY_KEYS = ['tracker', 'spellbook', 'crafting', 'follow', 'playerNotes']
/**
 * Settings that belong to this copy of the world, not to the world, so they're never logged for other devices:
 * `follow` (a player's link to their DM's world), and in meta the look (theme, printed cards), DM or player mode, this
 * computer's sharing set-up, when it last saved, made a backup copy or published, and the character it has open.
 */
const LOCAL_PLAY = new Set(['follow'])
const LOCAL_META = new Set(['theme', 'cardStyle', 'mode', 'sharing', 'edited', 'externalBackup', 'lastPublished', 'currentCharacter'])
/** Pictures and attached files are logged; backups and anything else in the folder are not. */
const LOGGED_FILE = /^(images|files)\/[^/\\]+$/
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL CHECK (json_valid(value))
);
CREATE TABLE IF NOT EXISTS entry_types (type TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS relation_kinds (kind TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS entries (
  id         TEXT PRIMARY KEY CHECK (length(id) > 0),
  type       TEXT NOT NULL REFERENCES entry_types(type),
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  aliases    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases) AND json_type(aliases) = 'array'),
  tags       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
  fields     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(fields) AND json_type(fields) = 'object'),
  body       TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('secret', 'known')),
  image      TEXT,
  files      TEXT CHECK (files IS NULL OR (json_valid(files) AND json_type(files) = 'array')),
  created    TEXT NOT NULL,
  updated    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_type ON entries(type);
CREATE TABLE IF NOT EXISTS relations (
  id         TEXT PRIMARY KEY,
  a          TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  b          TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL REFERENCES relation_kinds(kind),
  role       TEXT,
  date_from  TEXT CHECK (date_from IS NULL OR json_valid(date_from)),
  date_to    TEXT CHECK (date_to IS NULL OR json_valid(date_to)),
  note       TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('secret', 'known')),
  CHECK (a <> b)
);
CREATE INDEX IF NOT EXISTS relations_a ON relations(a);
CREATE INDEX IF NOT EXISTS relations_b ON relations(b);
CREATE TABLE IF NOT EXISTS history (
  entry   TEXT NOT NULL,
  saved   TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  data    TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX IF NOT EXISTS history_entry ON history(entry, saved);
-- What changed, for syncing with the user's other devices: one row per thing (an entry, a relation, a setting, a picture
-- or file), its latest change only. The sequence number only grows, so a device asks "everything after N".
CREATE TABLE IF NOT EXISTS changes (
  seq    INTEGER PRIMARY KEY AUTOINCREMENT,
  kind   TEXT NOT NULL CHECK (kind IN ('entry', 'relation', 'setting', 'file')),
  key    TEXT NOT NULL,
  op     TEXT NOT NULL CHECK (op IN ('put', 'delete')),
  at     TEXT NOT NULL,
  device TEXT NOT NULL,
  UNIQUE (kind, key)
);
`

const j = v => (v == null ? null : JSON.stringify(v))
const p = s => (s == null ? undefined : JSON.parse(s))

function rowToEntry(r) {
  const e = { id: r.id, type: r.type, name: r.name, aliases: p(r.aliases), tags: p(r.tags), fields: p(r.fields), body: r.body, visibility: r.visibility, created: r.created, updated: r.updated }
  if (r.image != null) e.image = r.image
  if (r.files != null) e.files = p(r.files)
  return e
}
function rowToRelation(r) {
  const x = { id: r.id, a: r.a, b: r.b, kind: r.kind, visibility: r.visibility }
  if (r.role != null) x.role = r.role
  if (r.date_from != null) x.from = p(r.date_from)
  if (r.date_to != null) x.to = p(r.date_to)
  if (r.note != null) x.note = r.note
  return x
}

class WorldDb {
  /** Open (or create) the database in a data folder. */
  /** `device`: this computer's ID, written with each change made here (see the changes table). */
  constructor(dir, { readOnly = false, device = 'unknown' } = {}) {
    this.file = path.join(dir, FILE)
    this.readOnly = readOnly
    this.device = device
    this.db = new DatabaseSync(this.file, { readOnly })
    if (!readOnly) {
      // A rollback journal (not WAL): at rest the database is this one file, safe to copy or carry on a stick.
      this.db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;')
      this.db.exec(SCHEMA)
      // The log's own ID: a device that synced with an earlier log (before a restore, say) starts over from the top.
      if (!this.setting('changeLog')) this.setSetting('changeLog', crypto.randomUUID())
    }
    this.db.exec('PRAGMA foreign_keys = ON;')
  }
  static exists(dir) { return fs.existsSync(path.join(dir, FILE)) }

  /** Make sure every entry type and relation kind the app knows is allowed (new ones are added, none removed). */
  allow(types, kinds) {
    if (this.readOnly) return
    const t = this.db.prepare('INSERT OR IGNORE INTO entry_types(type) VALUES (?)')
    const k = this.db.prepare('INSERT OR IGNORE INTO relation_kinds(kind) VALUES (?)')
    this.tx(() => { for (const x of types) t.run(x); for (const x of kinds) k.run(x) })
  }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try { const r = fn(); this.db.exec('COMMIT'); return r } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
  setting(key) { const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? JSON.parse(r.value) : undefined }
  setSetting(key, value) {
    if (value === undefined || value === null) this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
    else this.db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value))
  }

  /** The whole world as the app holds it in memory, plus the revision it was saved at. */
  load() {
    const entries = {}
    for (const r of this.db.prepare('SELECT * FROM entries').all()) entries[r.id] = rowToEntry(r)
    const d = {
      version: this.setting('version') ?? 1,
      meta: this.setting('meta') ?? {},
      entries,
      relations: this.db.prepare('SELECT * FROM relations ORDER BY rowid').all().map(rowToRelation),
    }
    for (const k of PLAY_KEYS) { const v = this.setting(k); if (v != null) d[k] = v }
    return { data: d, rev: this.setting('rev') ?? 0 }
  }

  /** A new world, written in one go (the database must be empty). */
  create(d, types, kinds) {
    this.allow(types, kinds)
    if (this.db.prepare('SELECT count(*) AS n FROM entries').get().n) throw new Error('There already is a world here.')
    return this.save({ rev: this.setting('rev') ?? 0, version: d.version, meta: d.meta, play: Object.fromEntries(PLAY_KEYS.map(k => [k, d[k] ?? null])), upsert: Object.values(d.entries), remove: [], relUpsert: d.relations, relRemove: [] })
  }

  /**
   * Apply what changed since the last save, all or nothing. `rev` must be the revision the changes are based on
   * (anything else means another copy saved in between; -1 overwrites anyway). Returns the new revision.
   */
  save(c) {
    if (this.readOnly) throw new Error('This copy of the data is read-only.')
    return this.tx(() => {
      const rev = this.setting('rev') ?? 0
      if (c.rev !== -1 && c.rev !== rev) { const e = new Error('The data was saved by another copy of the app in the meantime.'); e.conflict = true; throw e }
      const now = new Date().toISOString()
      const old = this.db.prepare('SELECT * FROM entries WHERE id = ?')
      const lastHist = this.db.prepare('SELECT max(saved) AS t FROM history WHERE entry = ?')
      const addHist = this.db.prepare('INSERT INTO history(entry, saved, deleted, data) VALUES (?, ?, ?, ?)')
      // One line per changed thing in the changes table (its earlier line goes). `c.origin` says, for changes that came
      // from another device, which one and when ("entry:<id>" → { device, at }); everything else is this device's, now.
      const logRow = this.db.prepare('INSERT OR REPLACE INTO changes(kind, key, op, at, device) VALUES (?, ?, ?, ?, ?)')
      const log = (kind, key, op) => { const o = c.origin?.[`${kind}:${key}`]; logRow.run(kind, key, op, o?.at ?? now, o?.device ?? this.device) }
      const keep = id => {
        // Only the newest HISTORY_KEEP versions of an entry are kept.
        this.db.prepare('DELETE FROM history WHERE entry = ? AND rowid NOT IN (SELECT rowid FROM history WHERE entry = ? ORDER BY saved DESC LIMIT ?)').run(id, id, HISTORY_KEEP)
      }
      for (const id of c.relRemove ?? []) { this.db.prepare('DELETE FROM relations WHERE id = ?').run(id); log('relation', id, 'delete') }
      for (const id of c.remove ?? []) {
        const r = old.get(id)
        if (!r) continue
        addHist.run(id, now, 1, JSON.stringify(rowToEntry(r)))
        keep(id)
        this.db.prepare('DELETE FROM entries WHERE id = ?').run(id)
        log('entry', id, 'delete')
      }
      const up = this.db.prepare(`INSERT INTO entries(id, type, name, aliases, tags, fields, body, visibility, image, files, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET type = excluded.type, name = excluded.name, aliases = excluded.aliases, tags = excluded.tags,
          fields = excluded.fields, body = excluded.body, visibility = excluded.visibility, image = excluded.image, files = excluded.files,
          created = excluded.created, updated = excluded.updated`)
      // `keep`: entries whose replaced version is kept whatever its age (going back to an earlier version).
      const force = new Set(c.keep ?? [])
      for (const e of c.upsert ?? []) {
        const r = old.get(e.id)
        if (r) {
          const t = lastHist.get(e.id).t
          if (force.has(e.id) || !t || Date.parse(now) - Date.parse(t) > HISTORY_EVERY_MS) { addHist.run(e.id, now, 0, JSON.stringify(rowToEntry(r))); keep(e.id) }
        }
        up.run(e.id, e.type, e.name, j(e.aliases ?? []), j(e.tags ?? []), j(e.fields ?? {}), e.body ?? '', e.visibility, e.image ?? null, j(e.files), e.created, e.updated)
        log('entry', e.id, 'put')
      }
      const rel = this.db.prepare(`INSERT INTO relations(id, a, b, kind, role, date_from, date_to, note, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET a = excluded.a, b = excluded.b, kind = excluded.kind, role = excluded.role, date_from = excluded.date_from,
          date_to = excluded.date_to, note = excluded.note, visibility = excluded.visibility`)
      for (const r of c.relUpsert ?? []) { rel.run(r.id, r.a, r.b, r.kind, r.role ?? null, j(r.from), j(r.to), r.note ?? null, r.visibility); log('relation', r.id, 'put') }
      if (c.version != null) this.setSetting('version', c.version)
      // the world's settings: each top-level part of meta that changed, and each play setting that changed
      if (c.meta) {
        const was = this.setting('meta') ?? {}
        for (const k of new Set([...Object.keys(was), ...Object.keys(c.meta)])) {
          if (!LOCAL_META.has(k) && !same(was[k], c.meta[k])) log('setting', `meta.${k}`, c.meta[k] == null ? 'delete' : 'put')
        }
        this.setSetting('meta', c.meta)
      }
      for (const [k, v] of Object.entries(c.play ?? {})) {
        if (!PLAY_KEYS.includes(k)) continue
        if (!LOCAL_PLAY.has(k) && !same(this.setting(k), v)) log('setting', k, v == null ? 'delete' : 'put')
        this.setSetting(k, v)
      }
      this.setSetting('rev', rev + 1)
      return rev + 1
    })
  }

  /** A picture or file in images/ or files/ was written or removed (by this device, or as `origin` says). */
  logFile(rel, op, origin) {
    if (this.readOnly || !LOGGED_FILE.test(rel)) return
    this.db.prepare('INSERT OR REPLACE INTO changes(kind, key, op, at, device) VALUES (?, ?, ?, ?, ?)')
      .run('file', rel, op, origin?.at ?? new Date().toISOString(), origin?.device ?? this.device)
  }
  /** The log's ID and its last sequence number. */
  logState() {
    return { log: this.setting('changeLog'), seq: this.db.prepare('SELECT max(seq) AS n FROM changes').get().n ?? 0 }
  }
  /** What changed after sequence number `seq` (oldest first), at most `limit` lines. */
  changesSince(seq = 0, limit = 5000) {
    return this.db.prepare('SELECT seq, kind, key, op, at, device FROM changes WHERE seq > ? ORDER BY seq LIMIT ?').all(seq, limit)
  }
  /**
   * What changed after `seq`, for another device: each thing as it is now (an entry, a relation, a setting's value; a
   * picture or file by its path only), at most `limit` lines. An entry a relation in the batch points to comes along
   * when it changed again later (so the relation never arrives before its entry). `upTo` is the next `seq` to ask from.
   */
  changeBatch(seq = 0, limit = 2000) {
    const rows = this.changesSince(seq, limit)
    const upTo = rows.length ? rows[rows.length - 1].seq : seq
    const more = !!this.db.prepare('SELECT 1 FROM changes WHERE seq > ? LIMIT 1').get(upTo)
    const entryRow = this.db.prepare('SELECT * FROM entries WHERE id = ?'), relRow = this.db.prepare('SELECT * FROM relations WHERE id = ?')
    const line = this.db.prepare("SELECT seq, kind, key, op, at, device FROM changes WHERE kind = 'entry' AND key = ?")
    const have = new Set(rows.map(r => `${r.kind}:${r.key}`))
    for (const r of rows.slice()) {
      if (r.kind !== 'relation' || r.op !== 'put') continue
      const x = relRow.get(r.key)
      for (const id of x ? [x.a, x.b] : []) {
        const l = line.get(id)
        if (l && l.seq > upTo && !have.has(`entry:${id}`)) { rows.push(l); have.add(`entry:${id}`) }
      }
    }
    const meta = this.setting('meta') ?? {}
    const items = rows.map(r => {
      const item = { kind: r.kind, key: r.key, op: r.op, at: r.at, device: r.device }
      if (r.op !== 'put') return item
      if (r.kind === 'entry') { const x = entryRow.get(r.key); if (x) item.value = rowToEntry(x); else item.op = 'delete' }
      else if (r.kind === 'relation') { const x = relRow.get(r.key); if (x) item.value = rowToRelation(x); else item.op = 'delete' }
      else if (r.kind === 'setting') item.value = r.key.startsWith('meta.') ? meta[r.key.slice(5)] ?? null : this.setting(r.key) ?? null
      return item
    })
    return { log: this.setting('changeLog'), device: this.device, upTo, more, items }
  }
  /** This copy's latest change to each of `keys` ("entry:<id>", "setting:meta.today" …): when and on which device. */
  linesOf(keys) {
    const q = this.db.prepare('SELECT at, device FROM changes WHERE kind = ? AND key = ?')
    const out = {}
    for (const k of keys) { const i = k.indexOf(':'); const r = q.get(k.slice(0, i), k.slice(i + 1)); if (r) out[k] = { at: r.at, device: r.device } }
    return out
  }
  /** A new log ID (after the database was replaced by a backup): other devices then sync everything again. */
  newLog() { if (!this.readOnly) this.setSetting('changeLog', crypto.randomUUID()) }

  /** Earlier versions of an entry (newest first), including the last one if it was deleted. */
  history(id) {
    return this.db.prepare('SELECT saved, deleted, data FROM history WHERE entry = ? ORDER BY saved DESC').all(id)
      .map(r => ({ saved: r.saved, deleted: !!r.deleted, entry: JSON.parse(r.data) }))
  }
  /** Entries that were deleted (their last version), newest first. */
  deleted() {
    return this.db.prepare(`SELECT h.entry, h.saved, h.data FROM history h WHERE h.deleted = 1
      AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.id = h.entry) ORDER BY h.saved DESC`).all()
      .map(r => ({ saved: r.saved, entry: JSON.parse(r.data) }))
  }

  /** A complete, consistent copy of the database in another file (safe while it's in use). */
  copyTo(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (fs.existsSync(file)) fs.unlinkSync(file)
    this.db.prepare('VACUUM INTO ?').run(file)
  }
  /** SQLite's own check of the file. */
  integrity() { return this.db.prepare('PRAGMA integrity_check').get().integrity_check }
  close() { try { this.db.close() } catch {} }
}

/**
 * Create the database from the JSON files of earlier versions (eldoria.json and session.json), which stay
 * where they are. Checks afterwards that everything came through; on any difference the new file is removed.
 */
function convertFromJson(dir, types, kinds) {
  const world = JSON.parse(fs.readFileSync(path.join(dir, 'eldoria.json'), 'utf8'))
  let session = {}
  try { session = JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')) } catch {}
  for (const k of PLAY_KEYS) if (session[k]) world[k] = session[k]
  const file = path.join(dir, FILE)
  if (fs.existsSync(file)) throw new Error(`${FILE} already exists`)
  const w = new WorldDb(dir)
  try {
    w.create(world, types, kinds)
    const back = w.load().data
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
    const problems = []
    for (const [id, e] of Object.entries(world.entries)) if (!same(sortKeys(e), sortKeys(back.entries[id]))) problems.push(`entry ${id}`)
    if (Object.keys(back.entries).length !== Object.keys(world.entries).length) problems.push('entry count')
    const relBack = new Map(back.relations.map(r => [r.id, r]))
    for (const r of world.relations) if (!same(sortKeys(r), sortKeys(relBack.get(r.id)))) problems.push(`relation ${r.id}`)
    if (back.relations.length !== world.relations.length) problems.push('relation count')
    if (!same(sortKeys(back.meta), sortKeys(world.meta))) problems.push('meta')
    for (const k of PLAY_KEYS) if (!same(sortKeys(back[k] ?? null), sortKeys(world[k] ?? null))) problems.push(k)
    if (problems.length) throw new Error(`The converted data didn't match: ${problems.slice(0, 5).join(', ')}`)
    return { entries: Object.keys(back.entries).length, relations: back.relations.length }
  } catch (e) {
    w.close()
    try { fs.unlinkSync(file) } catch {}
    throw e
  } finally { w.close() }
}
const sortKeys = v => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v)

module.exports = { WorldDb, convertFromJson, FILE }
