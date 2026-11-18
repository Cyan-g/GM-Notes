// Pictures and attached files in the data folder go through this interface, so the pages don't care whether
// they run in the desktop app (desktop.ts) or against the dev server (below). The world itself is in the database
// (backend.ts).

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
}

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
}
