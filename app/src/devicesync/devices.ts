// Taking the user's other devices' changes into the open world. The network side is electron/devices.cjs: it
// finds the devices and says when one of them changed something; here those changes are fetched, merged (merge.ts)
// into the world in memory and saved, each marked as the other device's in the change log (so it isn't sent back as
// new), every replaced entry kept in History; pictures the changes point to are fetched after.
import { reactive } from 'vue'
import { desktop, type DeviceStatus } from '../storage/desktop'
import { db, keepVersion, save, state, syncSave, touch } from '../store'
import { applyPlan, planMerge, type Conflict, type Line, type SyncBatch } from './merge'

export interface MergeResult { changed: number; conflicts: Conflict[]; skipped: number; files: { need: string[]; gone: string[] }; origin: Record<string, Line> }

/** What the window shows about syncing: the devices, and what the last syncs brought (for a notice). */
export const devices = reactive({
  status: null as DeviceStatus | null,
  /** Changed on both devices since they last talked, newest last (cleared when the notice is closed). */
  conflicts: [] as (Conflict & { device: string })[],
  /** The last sync's error, if any. */
  error: '',
  busy: false,
})

/** This world's changes after `seq` in its log, as another device would get them. */
export async function batchSince(seq: number, limit?: number): Promise<SyncBatch> {
  return desktop!.sync.batch(seq, limit)
}

/** Take `batch` (another device's changes) into the open world and save. `since`: when the two last talked. */
export async function mergeBatch(batch: SyncBatch, since = ''): Promise<MergeResult> {
  if (!desktop || !state.db || state.readOnly) throw new Error('This world can\'t take changes right now.')
  // anything waiting to be saved here goes first, so its time is in the log before comparing
  if (state.dirty) await save()
  const keys = [...new Set(batch.items.map(x => `${x.kind}:${x.key}`))]
  const local: Record<string, Line> = await desktop.sync.lines(keys)
  const plan = planMerge(db(), batch, local, since)
  const changed = applyPlan(db(), plan)
  if (changed) {
    for (const id of plan.keep) keepVersion.add(id)
    syncSave.origin = { ...syncSave.origin, ...plan.origin }
    syncSave.removals += plan.delEntries.length
    touch()
    await save()
  }
  return { changed, conflicts: plan.conflicts, skipped: plan.skipped, files: plan.files, origin: plan.origin }
}

// ---- pulling from a device: one at a time, again if it changed while pulling ----
const queue = new Set<string>()
let running = false
async function pullAll() {
  if (running) return
  running = true
  devices.busy = true
  try {
    while (queue.size) {
      const id = queue.values().next().value as string
      queue.delete(id)
      try { await pullFrom(id); devices.error = '' } catch (e) { devices.error = (e as Error).message }
    }
  } finally { running = false; devices.busy = false }
}
/** Everything a device changed since this one last got its changes, batch by batch. */
async function pullFrom(id: string) {
  for (let round = 0; round < 50; round++) {
    if (!state.db || state.readOnly) return
    const { batch, since } = await desktop!.devices.pull(id)
    const r = await mergeBatch(batch, since)
    const name = devices.status?.devices.find(d => d.id === id)?.name ?? 'another device'
    devices.conflicts.push(...r.conflicts.map(c => ({ ...c, device: name })))
    for (const p of r.files.need) {
      try { await desktop!.devices.file(id, p, r.origin[`file:${p}`]) } catch { /* fetched next time it changes; the entry shows no picture until then */ }
    }
    await desktop!.devices.pulled(id, batch.upTo, batch.log)
    if (!batch.more) return
  }
}

// ---- what the screens use (DevicesDialog, DeviceJoin) ----
const plainError = (e: unknown) => new Error(String((e as Error).message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
async function call<T>(job: () => Promise<T>): Promise<T> { try { return await job() } catch (e) { throw plainError(e) } }
export async function refreshDevices() { if (desktop?.devices) devices.status = await desktop.devices.status() }
export async function setDeviceName(name: string) { devices.status = await call(() => desktop!.devices.setName(name)) }
export async function startPairing() { devices.status = await call(() => desktop!.devices.pairStart()) }
export async function stopPairing() { await call(() => desktop!.devices.pairStop()); await refreshDevices() }
export async function forgetDevice(id: string) { await call(() => desktop!.devices.forget(id)); await refreshDevices() }
/** Get a device's latest changes now (also happens by itself after each change there). */
export async function syncNow(id: string) { queue.add(id); await pullAll(); if (devices.error) throw new Error(devices.error) }
/** Computers on this network showing a pairing code. */
export const findPairing = () => call(() => desktop!.devices.find())
/**
 * Join the world another device is pairing, with its code: the copy is made in GM Notes' own folder and opened
 * (this page reloads). `target`: "host:port" or an address typed in.
 */
export async function joinDevice(target: string, code: string) {
  if (state.db && (state.dirty || state.saving)) await save()
  await call(() => desktop!.devices.join(target, code))
  location.reload()
}

/** Listen to the network side: device status, and "this device changed something". */
export function startDeviceSync() {
  if (!desktop?.devices) return
  desktop.devices.onStatus(s => { devices.status = s })
  desktop.devices.onChanged(id => { queue.add(id); void pullAll() })
  desktop.devices.status().then(s => { devices.status = s }).catch(() => {})
}
