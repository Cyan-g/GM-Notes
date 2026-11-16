// Copying the data folder somewhere else, and restoring from the app's own backups.
import type { Database } from './model/types'
import { adopt, save, state } from './store'
import type { Storage } from './storage/storage'

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/**
 * Copy the database, pictures and files into `<dest>/Eldoria-backup-<date>/`.
 * The app's own backups folder isn't copied: it would only repeat the database.
 */
export async function backupTo(dest: Storage, onProgress: (done: number, total: number) => void): Promise<string> {
  const src = state.storage!
  await save()
  const folder = `Eldoria-backup-${stamp()}`
  const files: string[] = ['eldoria.json', 'session.json']
  for (const dir of ['images', 'files']) for (const n of await src.list(dir)) files.push(`${dir}/${n}`)
  let done = 0
  onProgress(0, files.length)
  for (const f of files) {
    const blob = await src.readBlob(f)
    if (blob) await dest.writeBlob(`${folder}/${f}`, blob)
    onProgress(++done, files.length)
  }
  // Remember the date without counting it as an edit (so it doesn't arm the migration lock by itself).
  state.db!.meta.externalBackup = new Date().toISOString()
  await save()
  return folder
}

/** The app's automatic backups in data/backups, newest first. */
export async function listBackups(): Promise<string[]> {
  // The play-state copies (session-…) aren't versions of the world to go back to.
  return (await state.storage!.list('backups')).filter(n => n.endsWith('.json') && !n.startsWith('session-')).sort().reverse()
}

/** Replace the open database with a backup. The current one is kept as a backup first. */
export async function restoreBackup(name: string) {
  const s = state.storage!
  const text = await s.readText(`backups/${name}`)
  if (!text) throw new Error(`Couldn't read ${name}`)
  const db = JSON.parse(text) as Database
  if (!db.entries || !db.meta) throw new Error(`${name} doesn't look like a Eldoria database`)
  await save()
  const current = await s.readText('eldoria.json')
  if (current) await s.writeText(`backups/before-restore-${stamp()}.json`, current)
  adopt(db)
  await save()
}

export const daysSince = (iso?: string) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86400000) : null)
