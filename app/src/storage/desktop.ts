// The desktop app (Electron): the data folder is read and written directly through electron/preload.cjs.
// No permission prompts, no folder handle that can go stale.
import type { Storage } from './storage'

/** A new version: downloading (with how far, in percent), downloaded, failed to download, or out (Mac: a link). */
export interface UpdateInfo { state: 'downloading' | 'ready' | 'failed' | 'available'; version: string; percent?: number; url?: string }
interface Bridge {
  read(root: string, rel: string): Promise<Uint8Array | null>
  write(root: string, rel: string, bytes: Uint8Array): Promise<boolean>
  list(root: string, rel: string): Promise<string[]>
  remove(root: string, rel: string): Promise<boolean>
  getFolder(root: string): Promise<string | null>
  pickFolder(root: string): Promise<string | null>
  showFolder(root: string): Promise<boolean>
  info(): Promise<{ version: string; platform: string; packaged: boolean }>
  open(url: string): Promise<boolean>
  /** The page's print layout (the cards) as a PDF, saved where the user picks and opened; null if cancelled. */
  cardsPdf(pageSize: 'A4' | 'Letter', name: string): Promise<string | null>
  db: {
    load(types: string[], kinds: string[]): Promise<import('./backend').Loaded>
    create(d: unknown, types: string[], kinds: string[]): Promise<number>
    save(c: unknown): Promise<number>
    history(id: string): Promise<import('./backend').Version[]>
    deleted(): Promise<{ saved: string; entry: import('../model/types').Entry }[]>
    copyTo(root: string, rel: string): Promise<boolean>
    restore(name: string): Promise<boolean>
  }
  publish: { folder(): Promise<string | null>; pick(): Promise<string | null> }
  shared: {
    scan(): Promise<{ folder: string; worlds: { worldId: string; title: string; published: string; dataVersion: number }[] } | null>
    /** Follow a DM world through a folder, a live session, or both (null keeps the folder it has). */
    follow(folder: string | null, worldId: string, live?: LiveTarget & { code: string }): Promise<boolean>
    get(): Promise<{ folder?: string; worldId: string; live?: LiveTarget & { code: string } } | null>
  }
  live: {
    hostStatus(): Promise<HostStatus>
    start(title: string): Promise<HostStatus>
    stop(): Promise<boolean>
    newCode(): Promise<string>
    sent(): Promise<boolean>
    discover(): Promise<FoundSession[]>
    /** A found session, or an address typed in ("192.168.1.20" or with ":port"). */
    check(target: LiveTarget | string, code: string): Promise<{ ok: true; worldId: string; title: string; host: string; port: number } | { ok?: false; error: string }>
    follow(who: string): Promise<PlayerStatus>
    playerStatus(): Promise<PlayerStatus>
    onHost(cb: (s: HostStatus) => void): void
    onPlayer(cb: (s: PlayerStatus) => void): void
    onPublished(cb: (published: string) => void): void
    /** A player: send their characters (JSON) to the DM's live session. */
    sendCharacters(text: string): Promise<{ ok?: true; error?: string }>
    /** The DM: characters a player sent. */
    onCharacter(cb: (msg: unknown) => void): void
  }
  worlds: {
    list(): Promise<{ current: string | null; worldsDir: string | null; worlds: import('../worlds').KnownWorld[] }>
    switch(dir: string): Promise<boolean>
    forget(dir: string): Promise<boolean>
    create(name: string): Promise<string | null>
    newId(title?: string): Promise<string>
    moved(title?: string): Promise<boolean>
    /** Move a world into the app's worlds folder (the old folder is renamed, not deleted). */
    move(dir: string): Promise<string>
  }
  onUpdate(cb: (info: UpdateInfo) => void): void
  installUpdate(): Promise<boolean>
}

/** The desktop bridge, if this runs in the desktop app. */
export const desktop: Bridge | undefined = (window as unknown as { dndesk?: Bridge }).dndesk

export type DesktopRoot = 'data' | 'backup' | 'publish' | 'shared' | 'live'

// ---- live sessions on the local network (electron/live.cjs) ----
export interface LiveTarget { host: string; port: number }
export interface FoundSession extends LiveTarget { worldId: string; title: string }
export type HostStatus =
  | { hosting: false }
  | { hosting: true; port: number; code: string; title: string; addresses: string[]; players: string[]; published: string | null }
export interface PlayerStatus { state: 'off' | 'searching' | 'connected' | 'wrong-code'; host?: string; port?: number }

export class DesktopStorage implements Storage {
  private urls = new Map<string, string>()
  constructor(private root: DesktopRoot, readonly label: string) {}

  async readText(path: string) {
    const b = await desktop!.read(this.root, path)
    return b ? new TextDecoder().decode(b) : null
  }
  async readBlob(path: string) {
    const b = await desktop!.read(this.root, path)
    return b ? new Blob([b as BlobPart]) : null
  }
  async writeText(path: string, text: string) { await desktop!.write(this.root, path, new TextEncoder().encode(text)) }
  async writeBlob(path: string, blob: Blob) {
    await desktop!.write(this.root, path, new Uint8Array(await blob.arrayBuffer()))
    const old = this.urls.get(path)
    if (old) { URL.revokeObjectURL(old); this.urls.delete(path) }
  }
  list(dir: string) { return desktop!.list(this.root, dir) }
  async remove(path: string) { await desktop!.remove(this.root, path) }
  async fileUrl(path: string) {
    const hit = this.urls.get(path)
    if (hit) return hit
    const b = await this.readBlob(path)
    if (!b) return null
    const url = URL.createObjectURL(b)
    this.urls.set(path, url)
    return url
  }
}

/** The data folder's name for the title and the Data page: its last part, or the full path on request. */
export const folderName = (dir: string) => dir.split(/[\\/]/).filter(Boolean).pop() ?? dir
