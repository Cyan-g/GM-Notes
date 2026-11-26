// A world's file picked to start a new world from (world list → From a file…): the app reloads into the new world's
// folder before the world is made, so the file waits here (this computer's browser storage) until the start screen
// takes it.
const DB = 'gm-notes-pending', STORE = 'files', KEY = 'new-world'

function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  })
}
function run<T>(mode: IDBTransactionMode, job: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(d => new Promise<T>((ok, fail) => {
    const req = job(d.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => { ok(req.result); d.close() }
    req.onerror = () => { fail(req.error); d.close() }
  }))
}

/** Keep the file for the start screen. */
export const keepWorldFile = (file: File) => run('readwrite', s => s.put(file, KEY))
/** The file kept, if any; it's gone from the storage once taken. */
export async function takeWorldFile(): Promise<File | null> {
  try {
    const f = await run<File | undefined>('readonly', s => s.get(KEY) as IDBRequest<File | undefined>)
    await run('readwrite', s => s.delete(KEY))
    return f ?? null
  } catch { return null }
}
