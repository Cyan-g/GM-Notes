// The desktop app (Electron): the data folder is read and written directly through electron/preload.cjs.
// No permission prompts, no folder handle that can go stale.
import type { Storage } from './storage'

export interface UpdateInfo { state: 'ready' | 'available'; version: string; url?: string }
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
  db: {
    load(types: string[], kinds: string[]): Promise<import('./backend').Loaded>
    create(d: unknown, types: string[], kinds: string[]): Promise<number>
    save(c: unknown): Promise<number>
    history(id: string): Promise<import('./backend').Version[]>
    deleted(): Promise<{ saved: string; entry: import('../model/types').Entry }[]>
    copyTo(root: string, rel: string): Promise<boolean>
    restore(name: string): Promise<boolean>
  }
  worlds: {
    list(): Promise<{ current: string | null; worldsDir: string | null; worlds: import('../worlds').KnownWorld[] }>
    switch(dir: string): Promise<boolean>
    forget(dir: string): Promise<boolean>
    create(name: string): Promise<string | null>
    newId(title?: string): Promise<string>
    moved(title?: string): Promise<boolean>
  }
  onUpdate(cb: (info: UpdateInfo) => void): void
  installUpdate(): Promise<boolean>
}

/** The desktop bridge, if this runs in the desktop app. */
export const desktop: Bridge | undefined = (window as unknown as { dndesk?: Bridge }).dndesk

export type DesktopRoot = 'data' | 'backup'

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
