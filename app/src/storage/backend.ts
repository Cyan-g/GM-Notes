// Where the world is stored: the SQLite database in the data folder (electron/db.cjs). The desktop app reaches it
// through the main process; during development the dev server opens the same file (read-only unless `?write`).
import type { Database, Entry, Id, Relation } from '../model/types'
import { desktop } from './desktop'

/** What one save sends: only what changed since the last one. */
export interface Changes {
  /** The revision the changes build on; -1 overwrites whatever is there. */
  rev: number
  version?: number
  meta?: Database['meta']
  /** The play state: a key set to null is removed. */
  play?: Partial<Record<'tracker' | 'spellbook' | 'crafting' | 'follow' | 'playerNotes', unknown>>
  upsert: Entry[]
  remove: Id[]
  relUpsert: Relation[]
  relRemove: string[]
  /** Entries whose replaced version is kept in the history even if one was kept a moment ago. */
  keep?: Id[]
  /** Changes that came from another device: which one made each and when ("entry:<id>" → line), for the change log. */
  origin?: Record<string, { at: string; device: string }>
}
export interface Loaded {
  empty?: true; data?: Database; rev?: number; converted?: { entries: number; relations: number }
  /** The world's permanent ID (desktop app). */
  worldId?: string
  /** The same ID is in another folder that still holds a world: this one may be a copy. */
  copyOf?: { title: string; dir: string }
}
export interface Version { saved: string; deleted: boolean; entry: Entry }

export interface Backend {
  readonly label: string
  /** Changes aren't written (the dev server without `?write`). */
  readonly readOnly: boolean
  load(types: string[], kinds: string[]): Promise<Loaded>
  create(d: Database, types: string[], kinds: string[]): Promise<number>
  /** Returns the new revision. Throws an error whose message starts with "Conflict" if another copy saved first. */
  save(c: Changes): Promise<number>
  history(id: Id): Promise<Version[]>
  deleted(): Promise<{ saved: string; entry: Entry }[]>
  /** A consistent copy of the database: into data/ (`root` data) or the backup folder. */
  copyTo(root: 'data' | 'backup', rel: string): Promise<void>
  /** Replace the database with one of data/backups (the app reloads afterwards). */
  restore(name: string): Promise<void>
}

const conflict = (e: unknown) => {
  const m = (e as Error).message ?? String(e)
  return /another copy of the app/.test(m) ? new Error(`Conflict: ${m.replace(/^.*Error: /, '')}`) : new Error(m.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
}

export class DesktopBackend implements Backend {
  readonly readOnly = false
  constructor(readonly label: string) {}
  private get db() { return desktop!.db }
  async load(types: string[], kinds: string[]) { try { return await this.db.load(types, kinds) } catch (e) { throw conflict(e) } }
  async create(d: Database, types: string[], kinds: string[]) { try { return await this.db.create(JSON.parse(JSON.stringify(d)), types, kinds) } catch (e) { throw conflict(e) } }
  async save(c: Changes) { try { return await this.db.save(JSON.parse(JSON.stringify(c))) } catch (e) { throw conflict(e) } }
  history(id: Id) { return this.db.history(id) }
  deleted() { return this.db.deleted() }
  async copyTo(root: 'data' | 'backup', rel: string) { try { await this.db.copyTo(root, rel) } catch (e) { throw conflict(e) } }
  async restore(name: string) { try { await this.db.restore(name) } catch (e) { throw conflict(e) } }
}

/** Development: the dev server opens data/dndesk.sqlite. Without `?write` in the address nothing is written. */
export class DevBackend implements Backend {
  readonly readOnly = !new URLSearchParams(location.search).has('write')
  readonly label = this.readOnly ? 'dev server (read-only)' : 'dev server'
  private rev = 0
  private async call<T>(method: string, ...args: unknown[]): Promise<T> {
    const r = await fetch(`/__db/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(this.readOnly ? {} : { 'x-dndesk-write': '1' }) }, body: JSON.stringify(args) })
    const body = await r.json()
    if (!r.ok) throw conflict(new Error(body.error))
    return body.result as T
  }
  async load(types: string[], kinds: string[]) { const l = await this.call<Loaded>('load', types, kinds); this.rev = l.rev ?? 0; return l }
  create(d: Database, types: string[], kinds: string[]) { return this.call<number>('create', d, types, kinds) }
  async save(c: Changes) { return this.readOnly ? c.rev : (this.rev = await this.call<number>('save', c)) }
  history(id: Id) { return this.call<Version[]>('history', id) }
  deleted() { return this.call<{ saved: string; entry: Entry }[]>('deleted') }
  async copyTo(root: 'data' | 'backup', rel: string) { if (!this.readOnly) await this.call('copyTo', root, rel) }
  async restore(name: string) { if (!this.readOnly) await this.call('restore', name) }
}
