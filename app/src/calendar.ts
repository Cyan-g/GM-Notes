// Date arithmetic for the world calendar: month lengths, leap years, weekdays, moon phases, eras.
import type { Calendar, WorldDate } from './model/types'

/** An era's start meaning "from the beginning of time". */
export const ERA_START = -999999

/** The standard calendar a new world starts with: Gregorian months and leap day, the real moon, BC and AD. */
export function defaultCalendar(): Calendar {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return {
    name: 'Calendar',
    months: months.map((name, i) => ({ name, days: days[i] })),
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    // 1 January of year 1 was a Monday; the moon is new on 6 January 2000 at 18:14.
    leapMonth: 2, firstWeekDay: 1,
    moons: [{ name: 'Moon', cycle: 29.530588853, offset: 19.051057 }],
    eras: [{ name: 'Before Christ', short: 'BC', fromYear: ERA_START }, { name: 'Anno Domini', short: 'AD', fromYear: 1 }],
    holidays: [],
  }
}

/** The era a year falls in: the last one starting at or before it, or the first era for years before them all. */
export function eraOf(cal: Calendar | undefined, year: number) {
  const eras = [...(cal?.eras ?? [])].sort((a, b) => a.fromYear - b.fromYear)
  return eras.filter(e => e.fromYear <= year).pop() ?? eras[0]
}
/** What an era shows in dates: its short name, or its initials. */
export const eraShort = (e: { name: string; short?: string }) => e.short?.trim() || e.name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase()
/** "892 AC", "120 BC"; years before 0 count backwards. Without eras, just the number. */
export function formatYear(cal: Calendar | undefined, year: number): string {
  const era = eraOf(cal, year)
  return era ? `${Math.abs(year)} ${eraShort(era)}` : String(year)
}

const isLeap = (cal: Calendar, y: number) => cal.leapMonth != null && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)

export function monthDays(cal: Calendar, year: number, month: number): number {
  const base = cal.months[month - 1]?.days ?? 30
  return base + (isLeap(cal, year) && month === cal.leapMonth ? 1 : 0)
}

const yearLen = (cal: Calendar) => cal.months.reduce((s, m) => s + m.days, 0)

/** Days from 1 January of year 1 to the start of `year` (negative before it). */
function daysBeforeYear(cal: Calendar, year: number) {
  const n = year - 1
  const leaps = cal.leapMonth != null ? Math.floor(n / 4) - Math.floor(n / 100) + Math.floor(n / 400) : 0
  return n * yearLen(cal) + leaps
}

/** A running day number: 0 is 1 January, year 1. */
export function dayNumber(cal: Calendar, d: WorldDate): number {
  let days = daysBeforeYear(cal, d.year)
  for (let m = 1; m < (d.month ?? 1); m++) days += monthDays(cal, d.year, m)
  return days + (d.day ?? 1) - 1
}

export function fromDayNumber(cal: Calendar, n: number): WorldDate {
  let year = Math.floor(n / (yearLen(cal) + 0.2425)) + 1
  while (daysBeforeYear(cal, year) > n) year--
  while (daysBeforeYear(cal, year + 1) <= n) year++
  let rest = n - daysBeforeYear(cal, year)
  let month = 1
  while (rest >= monthDays(cal, year, month)) { rest -= monthDays(cal, year, month); month++ }
  return { year, month, day: rest + 1 }
}

export const addDays = (cal: Calendar, d: WorldDate, n: number) => fromDayNumber(cal, dayNumber(cal, { year: d.year, month: d.month ?? 1, day: d.day ?? 1 }) + n)

/** Index into cal.weekdays. */
export function weekday(cal: Calendar, d: WorldDate): number {
  const w = cal.weekdays.length || 7
  return (((cal.firstWeekDay + dayNumber(cal, d)) % w) + w) % w
}

/** 0 = new moon, 0.5 = full moon. */
export function moonPhase(cal: Calendar, d: WorldDate, moon = 0): number | null {
  const m = cal.moons[moon]
  if (!m) return null
  const p = ((dayNumber(cal, d) + m.offset) % m.cycle) / m.cycle
  return (p + 1) % 1
}

/** The names of the eight phases, from new moon on (an eighth of the cycle each). */
export const PHASE_NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']

/** Only mark the four main phases, on the day closest to them (drawn by MoonPhase.vue). */
export function moonMark(cal: Calendar, d: WorldDate): { phase: number; name: string } | null {
  const m = cal.moons[0]
  if (!m) return null
  const p = moonPhase(cal, d)!
  const step = 1 / m.cycle
  for (const [target, name] of [[0, 'New moon'], [0.25, 'First quarter'], [0.5, 'Full moon'], [0.75, 'Last quarter']] as const) {
    let diff = Math.abs(p - target)
    diff = Math.min(diff, 1 - diff)
    if (diff < step / 2) return { phase: target, name }
  }
  return null
}
