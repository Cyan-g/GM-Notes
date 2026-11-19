// Travel on a map: its scale (two points a known distance apart), routes of several legs, and how long a route
// takes at a pace or in a vehicle. On foot or mounted the party travels 8 hours a day (5e); ships and the like
// sail around the clock. A difficult-terrain leg goes at half speed. The arrival date counts from today in the world.
import type { MapRoute, MapScale, WorldDate } from './model/types'
import { state, touch } from './store'
import { addDays } from './calendar'

export interface TravelMode { id: string; label: string; mph: number; allDay?: boolean }

/** The 5e paces (18 / 24 / 30 miles in an 8-hour day) and vehicles (Dungeon Master's Guide). */
export const DEFAULT_MODES: TravelMode[] = [
  { id: 'slow', label: 'Slow pace (foot or mount)', mph: 2.25 },
  { id: 'normal', label: 'Normal pace (foot or mount)', mph: 3 },
  { id: 'fast', label: 'Fast pace (foot or mount)', mph: 3.75 },
  { id: 'rowboat', label: 'Rowboat', mph: 1.5, allDay: true },
  { id: 'keelboat', label: 'Keelboat', mph: 1, allDay: true },
  { id: 'sailing-ship', label: 'Sailing ship', mph: 2, allDay: true },
  { id: 'warship', label: 'Warship', mph: 2.5, allDay: true },
  { id: 'longship', label: 'Longship', mph: 3, allDay: true },
  { id: 'galley', label: 'Galley', mph: 4, allDay: true },
  { id: 'airship', label: 'Airship', mph: 8, allDay: true },
]
/** The default paces and vehicles, then the world's own (which can also change a default by its id). */
export function travelModes(): TravelMode[] {
  const own = state.db?.meta.travelModes ?? []
  return [...DEFAULT_MODES.filter(d => !own.some(o => o.id === d.id)), ...own]
}
export const modeOf = (id: string | undefined) => travelModes().find(m => m.id === id) ?? DEFAULT_MODES[1]
export function setOwnModes(l: TravelMode[]) {
  if (!state.db) return
  if (l.length) state.db.meta.travelModes = l; else delete state.db.meta.travelModes
  touch()
}

type Pt = { x: number; y: number }
/** One map unit (mile or foot) per pixel of the map as it was when the scale was set. */
const unitsPerPx = (s: MapScale) => s.distance / Math.max(1e-9, Math.hypot((s.b.x - s.a.x) * s.w, (s.b.y - s.a.y) * s.h))
/** The distance between two points on a map, in its unit (points are fractions of its width and height). */
export const legLength = (s: MapScale, p: Pt, q: Pt) => Math.hypot((q.x - p.x) * s.w, (q.y - p.y) * s.h) * unitsPerPx(s)
export const toMiles = (n: number, unit: MapScale['unit']) => (unit === 'ft' ? n / 5280 : n)
export const legs = (s: MapScale, points: Pt[]) => points.slice(1).map((q, i) => legLength(s, points[i], q))

/** Hours on the move along a route (difficult legs at half speed). */
export function travelHours(s: MapScale, r: Pick<MapRoute, 'points' | 'difficult'>, mode: TravelMode): number {
  return legs(s, r.points).reduce((h, d, i) => h + toMiles(d, s.unit) / (mode.mph * ((r.difficult ?? []).includes(i) ? 0.5 : 1)), 0)
}
/** "40 min", "5 h 20 min", "3 days 2 h" (days of 8 hours on the road, or 24 for an all-day vehicle). */
export function formatTravel(hours: number, mode: TravelMode): string {
  const perDay = mode.allDay ? 24 : 8
  const mins = Math.round(hours * 60)
  if (mins < 60) return `${mins} min`
  const days = Math.floor(hours / perDay)
  const restMin = Math.round((hours - days * perDay) * 60)
  const h = Math.floor(restMin / 60), m = restMin % 60
  const dayPart = days ? `${days} day${days === 1 ? '' : 's'}` : ''
  const hourPart = h || m ? `${h ? h + ' h' : ''}${h && m && !days ? ' ' : ''}${m && !days ? m + ' min' : ''}` : ''
  return [dayPart, hourPart].filter(Boolean).join(' ')
}
/** The day the party arrives, setting out today in the world: a trip within a travel day arrives the same day. */
export function arrival(hours: number, mode: TravelMode): WorldDate | undefined {
  const db = state.db
  if (!db?.meta.calendar || !db.meta.today) return undefined
  const days = Math.max(0, Math.ceil(hours / (mode.allDay ? 24 : 8) - 1e-9) - 1)
  return addDays(db.meta.calendar, db.meta.today, days)
}
export const formatDistance = (n: number, unit: MapScale['unit']) =>
  unit === 'ft' ? `${Math.round(n).toLocaleString()} ft` : `${n < 10 ? Math.round(n * 10) / 10 : Math.round(n).toLocaleString()} mi`
