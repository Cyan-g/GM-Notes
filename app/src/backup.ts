// Copying the data folder somewhere else, and going back to one of the app's own backups.
import { save, state } from './store'
import type { Storage } from './storage/storage'

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/**
 * Copy the database, pictures and files into `<backup folder>/GM-Notes-backup-<world>-<date>/`. The database is copied by
 * SQLite itself, so the copy is complete and consistent. The app's own backups folder isn't copied.
 */
export async function backupTo(dest: Storage, onProgress: (done: number, total: number) => void): Promise<string> {
  const src = state.storage!
  await save()
  // Named after the world, so copies of several worlds in one backup folder don't mix up.
  const world = (state.db?.meta.title ?? 'world').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'world'
  const folder = `GM-Notes-backup-${world}-${stamp()}`
  const files: string[] = []
  for (const dir of ['images', 'files']) for (const n of await src.list(dir)) files.push(`${dir}/${n}`)
  let done = 0
  onProgress(0, files.length + 1)
  await state.backend!.copyTo('backup', `${folder}/dndesk.sqlite`)
  onProgress(++done, files.length + 1)
  for (const f of files) {
    const blob = await src.readBlob(f)
    if (blob) await dest.writeBlob(`${folder}/${f}`, blob)
    onProgress(++done, files.length + 1)
  }
  // Remember the date without counting it as an edit.
  state.db!.meta.externalBackup = new Date().toISOString()
  await save()
  return folder
}

/** The app's automatic backups in data/backups, newest first. */
export async function listBackups(): Promise<string[]> {
  return (await state.storage!.list('backups')).filter(n => n.endsWith('.sqlite')).sort().reverse()
}

/** Replace the database with a backup (the current one is kept as a backup first), then start over with it. */
export async function restoreBackup(name: string) {
  await save()
  await state.backend!.restore(name)
  location.reload()
}

export const daysSince = (iso?: string) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400000) : null)
