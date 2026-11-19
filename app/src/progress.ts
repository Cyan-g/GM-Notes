// Progress of a long job (exporting, importing, starting a world from a file), shown as a bar by ProgressBar.vue.
// A job runs in steps; between steps the page gets to draw, at most every 50 ms so small jobs don't slow down.
import { reactive } from 'vue'

export const progress = reactive({ active: false, title: '', label: '', done: 0, total: 0 })

let lastPaint = 0
const paint = () => new Promise<void>(r => setTimeout(r, 0))

/** Starts a job (or a new part of it): the bar shows `title`, and the part's `label`. `total` 0: no count yet. */
export async function stage(title: string, label: string, total = 0) {
  Object.assign(progress, { active: true, title, label, done: 0, total })
  lastPaint = performance.now()
  await paint()
}
/** One step of the current part done. */
export async function tick(done = progress.done + 1) {
  progress.done = done
  if (performance.now() - lastPaint > 50) { lastPaint = performance.now(); await paint() }
}
/** The job is over (done or failed). */
export function finish() { progress.active = false }

/** Runs a job with the bar up, taking it down at the end whatever happens. */
export async function withProgress<T>(title: string, job: () => Promise<T>): Promise<T> {
  await stage(title, '')
  try { return await job() } finally { finish() }
}
