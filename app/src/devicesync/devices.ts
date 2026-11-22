// Taking another device's changes into the open world (step 2 of syncing; the network brings the batches later).
// The merge itself is merge.ts; here it's applied to the world in memory and saved, with each change marked as
// the other device's in the change log (so it isn't sent back as new) and every replaced entry kept in History.
import { desktop } from '../storage/desktop'
import { db, keepVersion, save, state, syncSave, touch } from '../store'
import { applyPlan, planMerge, type Conflict, type Line, type SyncBatch } from './merge'

export interface MergeResult { changed: number; conflicts: Conflict[]; skipped: number; files: { need: string[]; gone: string[] } }

/** This world's changes after `seq` in its log, as another device would get them. */
export async function batchSince(seq: number, limit?: number): Promise<SyncBatch> {
  return desktop!.sync.batch(seq, limit)
}

/** Take `batch` (another device's changes) into the open world and save. `since`: when the two last talked. */
export async function mergeBatch(batch: SyncBatch, since = ''): Promise<MergeResult> {
  if (!desktop || !state.db || state.readOnly) throw new Error('This world can\'t take changes right now.')
  const keys = [...new Set(batch.items.map(x => `${x.kind}:${x.key}`))]
  const local: Record<string, Line> = await desktop.sync.lines(keys)
  // anything waiting to be saved here goes first, so its time is in the log before comparing
  if (state.dirty) await save()
  const plan = planMerge(db(), batch, local, since)
  const changed = applyPlan(db(), plan)
  if (changed) {
    for (const id of plan.keep) keepVersion.add(id)
    syncSave.origin = { ...syncSave.origin, ...plan.origin }
    syncSave.removals += plan.delEntries.length
    touch()
    await save()
  }
  return { changed, conflicts: plan.conflicts, skipped: plan.skipped, files: plan.files }
}
