// The names of the app's automatic database backups (data/backups/dndesk-<date and time>.sqlite), and which of them to
// thin out as they age.

/** The folder in the data folder the automatic backups go to. */
export const BACKUP_DIR = 'backups'
/** An automatic backup's date and time in its file name: "2026-11-21-14-05-09". */
export const stampOf = (t: Date) => { const p = (n: number) => String(n).padStart(2, '0'); return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}-${p(t.getHours())}-${p(t.getMinutes())}-${p(t.getSeconds())}` }
/** An automatic backup's file name, with the parts of its date and time. */
export const BACKUP_NAME = /^dndesk-(\d{4})-(\d\d)-(\d\d)-(\d\d)-(\d\d)-(\d\d)\.sqlite$/

/**
 * Which automatic backups to keep: everything from the last 2 hours, then the newest of each hour for 2 days,
 * of each day for 2 months, and of each month for good. Files the app didn't name itself are never touched.
 */
export function backupsToDelete(names: string[], now = Date.now()): string[] {
  const dated = names.flatMap(n => {
    const m = n.match(BACKUP_NAME)
    return m ? [{ n, t: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() }] : []
  }).sort((a, b) => b.t - a.t)
  const H = 3600e3, D = 24 * H
  const seen = new Set<string>()
  const drop: string[] = []
  for (const { n, t } of dated) {
    const age = now - t, at = new Date(t)
    if (age < 2 * H) continue
    const bucket = age < 2 * D ? `h${at.getFullYear()}-${at.getMonth()}-${at.getDate()}-${at.getHours()}`
      : age < 60 * D ? `d${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`
      : `m${at.getFullYear()}-${at.getMonth()}`
    if (seen.has(bucket)) drop.push(n)
    else seen.add(bucket)
  }
  return drop
}
