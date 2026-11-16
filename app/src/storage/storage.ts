// All disk access goes through this interface, so the app doesn't care
// whether it talks to a picked folder (built app) or the dev server.

export interface Storage {
  readonly label: string
  readText(path: string): Promise<string | null>
  readBlob(path: string): Promise<Blob | null>
  writeText(path: string, text: string): Promise<void>
  writeBlob(path: string, blob: Blob): Promise<void>
  list(dir: string): Promise<string[]>
  remove(path: string): Promise<void>
  /** A URL an <img> can show. */
  fileUrl(path: string): Promise<string | null>
  /** When a file was last written and how big it is, to notice changes made elsewhere. Null if unknown. */
  stat(path: string): Promise<FileStamp | null>
}

export interface FileStamp { modified: number; size: number }

// ---------- dev server (npm run dev) ----------

export class HttpStorage implements Storage {
  /**
   * The dev server reads the live data folder, so it's read-only unless the address has `?write`:
   * a stray reload of a test tab must never save over edits made in the real app.
   */
  private readonly ro = !new URLSearchParams(location.search).has('write')
  readonly label = this.ro ? 'dev server (read-only)' : 'dev server'
  private base = '/__data/'
  private enc(p: string) { return this.base + p.split('/').map(encodeURIComponent).join('/') }

  async readText(path: string) {
    const r = await fetch(this.enc(path), { cache: 'no-store' })
    return r.ok ? r.text() : null
  }
  async readBlob(path: string) {
    const r = await fetch(this.enc(path), { cache: 'no-store' })
    return r.ok ? r.blob() : null
  }
  async writeText(path: string, text: string) {
    if (this.ro) return
    const r = await fetch(this.enc(path), { method: 'PUT', body: text })
    if (!r.ok) throw new Error(`Saving ${path} failed (${r.status})`)
  }
  async writeBlob(path: string, blob: Blob) {
    if (this.ro) return
    const r = await fetch(this.enc(path), { method: 'PUT', body: blob })
    if (!r.ok) throw new Error(`Saving ${path} failed (${r.status})`)
  }
  async list(dir: string) {
    const r = await fetch(this.enc(dir.replace(/\/?$/, '/')), { cache: 'no-store' })
    return r.ok ? (await r.json()) as string[] : []
  }
  async remove(path: string) { if (this.ro) return; await fetch(this.enc(path), { method: 'DELETE' }) }
  async fileUrl(path: string) { return this.enc(path) }
  async stat(path: string) {
    const r = await fetch(this.enc(path) + '?stat', { cache: 'no-store' })
    return r.ok ? (await r.json()) as FileStamp : null
  }
}

// ---------- picked folder (File System Access API: Edge, Chrome, Brave with the flag on) ----------

export class FolderStorage implements Storage {
  private urls = new Map<string, string>()
  constructor(private root: FileSystemDirectoryHandle) {}
  get label() { return this.root.name }

  private async dir(parts: string[], create: boolean) {
    let d = this.root
    for (const p of parts) d = await d.getDirectoryHandle(p, { create })
    return d
  }
  private async file(path: string, create: boolean) {
    const parts = path.split('/').filter(Boolean)
    const name = parts.pop()!
    return (await this.dir(parts, create)).getFileHandle(name, { create })
  }

  async readText(path: string) {
    try { return await (await (await this.file(path, false)).getFile()).text() }
    catch (e) { if ((e as DOMException).name === 'NotFoundError') return null; throw e }
  }
  async readBlob(path: string) {
    try { return await (await this.file(path, false)).getFile() }
    catch (e) { if ((e as DOMException).name === 'NotFoundError') return null; throw e }
  }
  // createWritable writes to a temporary swap file and only replaces the
  // real file on close(), so a crash mid-save leaves the old file intact.
  async writeText(path: string, text: string) { await this.writeBlob(path, new Blob([text], { type: 'application/json' })) }
  async writeBlob(path: string, blob: Blob) {
    const w = await (await this.file(path, true)).createWritable()
    await w.write(blob)
    await w.close()
    const old = this.urls.get(path)
    if (old) { URL.revokeObjectURL(old); this.urls.delete(path) }
  }
  async list(dir: string) {
    try {
      const d = await this.dir(dir.split('/').filter(Boolean), false)
      const names: string[] = []
      for await (const [name] of (d as any).entries()) names.push(name)
      return names
    } catch { return [] }
  }
  async remove(path: string) {
    const parts = path.split('/').filter(Boolean)
    const name = parts.pop()!
    try { await (await this.dir(parts, false)).removeEntry(name) } catch { /* already gone */ }
  }
  async stat(path: string) {
    try { const f = await (await this.file(path, false)).getFile(); return { modified: f.lastModified, size: f.size } }
    catch { return null }
  }
  async fileUrl(path: string) {
    const hit = this.urls.get(path)
    if (hit) return hit
    try {
      const url = URL.createObjectURL(await (await this.file(path, false)).getFile())
      this.urls.set(path, url)
      return url
    } catch { return null }
  }
}

// ---------- remembering the picked folder between visits ----------

const IDB = 'eldoria'
function idb(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(IDB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('handles')
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  })
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb()
  return new Promise(ok => {
    const r = db.transaction('handles').objectStore('handles').get(key)
    r.onsuccess = () => ok(r.result as T)
    r.onerror = () => ok(undefined)
  })
}
async function idbSet(key: string, value: unknown) {
  const db = await idb()
  return new Promise<void>(ok => {
    const t = db.transaction('handles', 'readwrite')
    t.objectStore('handles').put(value, key)
    t.oncomplete = () => ok()
  })
}

export const folderApiAvailable = () => typeof (window as any).showDirectoryPicker === 'function'

/** Folder used last time, if the browser still lets us use it without asking. */
export async function rememberedFolder(): Promise<{ handle: FileSystemDirectoryHandle; granted: boolean } | null> {
  try {
    const handle = await idbGet<FileSystemDirectoryHandle>('data')
    if (!handle) return null
    const state = await (handle as any).queryPermission({ mode: 'readwrite' })
    return { handle, granted: state === 'granted' }
  } catch { return null }
}

/** Ask again for a remembered folder. Must be called from a click. */
export async function regrant(handle: FileSystemDirectoryHandle) {
  return (await (handle as any).requestPermission({ mode: 'readwrite' })) === 'granted'
}

/** A folder the user picked to copy backups into, remembered between visits. */
export async function rememberedBackupFolder() {
  try { return (await idbGet<FileSystemDirectoryHandle>('backup')) ?? null } catch { return null }
}
export async function pickBackupFolder(): Promise<FileSystemDirectoryHandle> {
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: 'eldoria-backup', mode: 'readwrite' })
  await idbSet('backup', handle)
  return handle
}

/** Let the user pick the data folder. Must be called from a click. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: 'eldoria-data', mode: 'readwrite' })
  await idbSet('data', handle)
  return handle
}
