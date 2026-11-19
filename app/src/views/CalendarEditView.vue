<script setup lang="ts">
// Edit the world calendar: months, leap day, weekdays, moons, eras, holidays and the timeline's colours.
// Weekdays and moon phases are anchored at today: today keeps the weekday and phase picked here, whatever else
// changes. Dates follow their month when months are moved or one before them is removed. Dates in a removed last
// month keep its number (adding a month back brings them back), dates in another removed month keep only their
// year, and days past a shortened month's end stay as they are; saving lists those first.
import AppIcon from '../components/AppIcon.vue'
import { computed, reactive, ref } from 'vue'
import type { Calendar, Database, WorldDate } from '../model/types'
import { SCHEMA, byKey } from '../model/schema'
import { db, entries, formatDate, listOptions, state, touch } from '../store'
import { ERA_START, dayNumber, eraShort, monthDays, moonPhase, PHASE_NAMES } from '../calendar'
import { go, hrefEntry } from '../router'

type Category = Database['meta']['eventCategories'][number]
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const ro = computed(() => !!state.readOnly)
const today = computed(() => db().meta.today)
const old = db().meta.calendar

type Draft = Omit<Calendar, 'months'> & { months: { name: string; days: number; from?: number }[] }
const cal = reactive<Draft>(clone(old))
/** Each month remembers its number before editing, so dates can follow it. */
cal.months.forEach((m, i) => { m.from = i + 1 })
cal.eras.sort((a, b) => a.fromYear - b.fromYear)
const PHASES = PHASE_NAMES
/** Today's weekday, and per moon today's exact phase (0–1) plus the eighth picked here (null: left as it is). */
const todayWeekday = ref(Math.max(0, ((old.firstWeekDay + dayNumber(old, today.value)) % (old.weekdays.length || 7) + (old.weekdays.length || 7)) % (old.weekdays.length || 7)))
const phases = reactive(cal.moons.map((_, i) => ({ exact: moonPhase(old, today.value, i) ?? 0, picked: null as number | null })))
const eighth = (p: number) => Math.round(p * 8) % 8

// ---- timeline colours: one per event category (managed in Archive → Lists) and for sessions ----
const stored = clone(db().meta.eventCategories)
const colors = reactive<Category[]>([
  ...[...listOptions('event.category').map(o => o.id), 'Session'].map(name => stored.find(c => c.name === name) ?? { id: name, name, color: '' }),
  ...stored.filter(c => c.name !== 'Session' && !listOptions('event.category').some(o => o.id === c.name)),
])
const catLabel = (c: Category) => (c.name === 'Session' ? 'Sessions' : listOptions('event.category').find(o => o.id === c.name)?.label ?? c.name)
const inList = (c: Category) => c.name === 'Session' || listOptions('event.category').some(o => o.id === c.name)

// ---- editing rows ----
function move<T>(list: T[], i: number, by: number) {
  const j = i + by
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
}
/** The leap day and holidays follow their month as months move; a removed month's holidays need a new one (0). */
function renumber(to: (m: number) => number | undefined) {
  if (cal.leapMonth != null) cal.leapMonth = to(cal.leapMonth)
  for (const h of cal.holidays) h.month = to(h.month) ?? 0
}
function removeMonth(i: number) {
  cal.months.splice(i, 1)
  renumber(m => (m === i + 1 ? undefined : m > i + 1 ? m - 1 : m))
}
function moveMonth(i: number, by: number) {
  const j = i + by
  if (j < 0 || j >= cal.months.length) return
  move(cal.months, i, by)
  renumber(m => (m === i + 1 ? j + 1 : m === j + 1 ? i + 1 : m))
}
function removeWeekday(i: number) {
  cal.weekdays.splice(i, 1)
  if (todayWeekday.value >= cal.weekdays.length) todayWeekday.value = Math.max(0, cal.weekdays.length - 1)
}
const addMoon = () => { cal.moons.push({ name: `Moon ${cal.moons.length + 1}`, cycle: 28, offset: 0 }); phases.push({ exact: 0, picked: 0 }) }
const removeMoon = (i: number) => { cal.moons.splice(i, 1); phases.splice(i, 1) }
const addEra = () => cal.eras.push({ name: 'New era', fromYear: Math.max(1, ...cal.eras.map(e => e.fromYear + 1)) })
const firstEra = (i: number) => i === 0
const eraFrom = (i: number) => (cal.eras[i].fromYear <= ERA_START ? '' : cal.eras[i].fromYear)
function setEraFrom(i: number, raw: string) {
  const n = raw.trim() === '' ? ERA_START : Math.trunc(Number(raw))
  if (!Number.isNaN(n)) cal.eras[i].fromYear = n
}
const addHoliday = () => cal.holidays.push({ name: 'New holiday', month: 1, day: 1 })

// ---- where stored dates end up ----
/** A month's new number: where it moved to, the same number when it's past the new end, or null when it was removed. */
function newMonth(m: number): number | null {
  const i = cal.months.findIndex(x => x.from === m)
  return i >= 0 ? i + 1 : m > cal.months.length ? m : null
}
function remap<D extends WorldDate | undefined>(d: D): D {
  if (!d?.month) return d
  const m = newMonth(d.month)
  return (m == null ? { year: d.year } : { ...d, month: m }) as D
}
/** Why a date (before editing) won't fit the edited calendar, if it won't. */
function misfit(d: WorldDate | undefined): string | null {
  if (!d?.month) return null
  const m = newMonth(d.month)
  if (m == null) return `${formatDate(d)}: its month is removed, it keeps only the year`
  if (m > cal.months.length) return `${formatDate(d)}: its month is removed, it shows as “Month ${m}” until a month is added back`
  if (d.day && d.day > monthDays(cal as Calendar, d.year, m)) return `${formatDate(d)}: the month is shorter now`
  return null
}
const dateKeys = new Map(SCHEMA.map(t => [t.type, t.fields.filter(f => f.kind === 'date').map(f => f.key)]))
const outside = computed(() => {
  const out: { label: string; why: string; href?: string }[] = []
  const tm = today.value.month ? newMonth(today.value.month) : 1
  if (tm == null || tm > cal.months.length) out.push({ label: 'Today', why: `${formatDate(today.value)}: its month is removed, today moves to 1 ${cal.months[0]?.name ?? ''}` })
  else { const t = misfit(today.value); if (t) out.push({ label: 'Today', why: t }) }
  for (const e of entries.value) for (const k of dateKeys.get(e.type) ?? []) {
    const why = misfit(byKey(e.fields)[k] as WorldDate | undefined)
    if (why) out.push({ label: e.name, why, href: hrefEntry(e.id) })
  }
  for (const r of db().relations) for (const d of [r.from, r.to]) {
    const why = misfit(d)
    if (why) out.push({ label: `A connection of ${db().entries[r.a]?.name ?? r.a}`, why, href: hrefEntry(r.a) })
  }
  for (const h of cal.holidays) if (cal.months[h.month - 1] && h.day > cal.months[h.month - 1].days) out.push({ label: h.name, why: `day ${h.day} is past the end of ${cal.months[h.month - 1].name}` })
  return out
})

// ---- saving ----
const problems = computed(() => {
  const p: string[] = []
  if (!cal.name.trim()) p.push('The calendar needs a name.')
  if (!cal.months.length) p.push('The calendar needs at least one month.')
  if (cal.months.some(m => !m.name.trim() || !(m.days >= 1))) p.push('Every month needs a name and at least one day.')
  if (!cal.weekdays.length || cal.weekdays.some(w => !w.trim())) p.push('There must be at least one weekday, each with a name.')
  if (cal.moons.some(m => !m.name.trim() || !(m.cycle > 0))) p.push('Every moon needs a name and a cycle of more than 0 days.')
  if (cal.eras.some(e => !e.name.trim())) p.push('Every era needs a name.')
  if (cal.holidays.some(h => !h.name.trim())) p.push('Every holiday needs a name.')
  for (const h of cal.holidays) if (!cal.months[h.month - 1]) p.push(`Pick a month for ${h.name || 'the holiday'}: its month was removed.`)
  return p
})
const confirmOutside = ref(false)
const dirty = ref(false)
const mark = () => { dirty.value = true; confirmOutside.value = false }

function save() {
  if (ro.value || problems.value.length) return
  if (outside.value.length && !confirmOutside.value) { confirmOutside.value = true; return }
  const next = clone(cal) as Calendar
  next.name = next.name.trim()
  next.months = next.months.map(m => ({ name: m.name.trim(), days: Math.trunc(m.days) }))
  next.weekdays = next.weekdays.map(w => w.trim())
  if (next.leapMonth == null || next.leapMonth > next.months.length) delete next.leapMonth
  next.eras = next.eras.map(e => ({ name: e.name.trim(), ...(e.short?.trim() ? { short: e.short.trim() } : {}), fromYear: e.fromYear })).sort((a, b) => a.fromYear - b.fromYear)
  next.holidays = next.holidays.map(h => ({ name: h.name.trim(), month: h.month, day: h.day, ...(h.note?.trim() ? { note: h.note.trim() } : {}) }))
    .sort((a, b) => a.month - b.month || a.day - b.day)
  // Stored dates follow their months.
  const moved = cal.months.some((m, i) => m.from !== i + 1) || cal.months.length !== old.months.length
  if (moved) {
    const d = db()
    d.meta.today = remap(d.meta.today)
    if (!d.meta.today.month || d.meta.today.month > next.months.length) d.meta.today = { year: d.meta.today.year, month: 1, day: 1 }
    for (const e of Object.values(d.entries)) for (const k of dateKeys.get(e.type) ?? []) {
      const f = byKey(e.fields)
      if ((f[k] as WorldDate | undefined)?.month) f[k] = remap(f[k] as WorldDate)
    }
    for (const r of d.relations) {
      if (r.from?.month) r.from = remap(r.from)
      if (r.to?.month) r.to = remap(r.to)
    }
  }
  // Anchor the weekday and the moons at today, in the new calendar.
  const n = dayNumber(next, today.value)
  const w = next.weekdays.length
  next.firstWeekDay = (((todayWeekday.value - n) % w) + w) % w
  next.moons = next.moons.map((m, i) => {
    const p = phases[i].picked != null ? phases[i].picked! / 8 : phases[i].exact
    const offset = (((p * m.cycle - n) % m.cycle) + m.cycle) % m.cycle
    return { name: m.name.trim(), cycle: m.cycle, offset: Math.round(offset * 1e6) / 1e6 }
  })
  db().meta.calendar = next
  db().meta.eventCategories = colors.filter(c => c.color).map(c => ({ id: c.id, name: c.name, color: c.color }))
  touch()
  go('#/calendar')
}
</script>

<template>
  <div class="cal-edit">
    <header class="list-head">
      <h1><span class="icon"><AppIcon ui="calendar" /></span>Edit the calendar</h1>
      <span class="muted small">Today ({{ formatDate(today) }}) keeps the weekday and moon phases picked here.</span>
    </header>

    <form class="cal-edit-grid" @input="mark" @change="mark" @submit.prevent="save">
      <section class="card">
        <h3>Name</h3>
        <input v-model="cal.name" :disabled="ro" aria-label="Calendar name" />
      </section>

      <section class="card">
        <h3>Months <span class="muted small">{{ cal.months.reduce((s, m) => s + (m.days || 0), 0) }} days a year</span></h3>
        <table class="grid lists-table">
          <thead><tr><th></th><th>Month</th><th>Days</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(m, i) in cal.months" :key="i">
              <td class="lists-move">
                <button type="button" class="link-btn" :disabled="ro || i === 0" title="Move up" @click="moveMonth(i, -1); mark()">▲</button>
                <button type="button" class="link-btn" :disabled="ro || i === cal.months.length - 1" title="Move down" @click="moveMonth(i, 1); mark()">▼</button>
              </td>
              <td><input v-model="m.name" :disabled="ro" :aria-label="`Name of month ${i + 1}`" /></td>
              <td><input v-model.number="m.days" class="num" type="number" min="1" :disabled="ro" :aria-label="`Days in ${m.name}`" /></td>
              <td><button type="button" class="link-btn x" :disabled="ro || cal.months.length < 2" title="Remove this month" @click="removeMonth(i); mark()">✕</button></td>
            </tr>
          </tbody>
        </table>
        <p class="cal-edit-row">
          <button type="button" :disabled="ro" @click="cal.months.push({ name: `Month ${cal.months.length + 1}`, days: 30 }); mark()">＋ Month</button>
        </p>
        <label class="cal-edit-row">Leap day (every 4 years, except every 100, except every 400) in
          <select v-model="cal.leapMonth" :disabled="ro">
            <option :value="undefined">no month: no leap years</option>
            <option v-for="(m, i) in cal.months" :key="i" :value="i + 1">{{ m.name }}</option>
          </select>
        </label>
      </section>

      <section class="card">
        <h3>Weekdays</h3>
        <table class="grid lists-table">
          <tbody>
            <tr v-for="(w, i) in cal.weekdays" :key="i">
              <td class="lists-move">
                <button type="button" class="link-btn" :disabled="ro || i === 0" title="Move up" @click="move(cal.weekdays, i, -1); mark()">▲</button>
                <button type="button" class="link-btn" :disabled="ro || i === cal.weekdays.length - 1" title="Move down" @click="move(cal.weekdays, i, 1); mark()">▼</button>
              </td>
              <td><input v-model="cal.weekdays[i]" :disabled="ro" :aria-label="`Weekday ${i + 1}`" /></td>
              <td><button type="button" class="link-btn x" :disabled="ro || cal.weekdays.length < 2" title="Remove this weekday" @click="removeWeekday(i); mark()">✕</button></td>
            </tr>
          </tbody>
        </table>
        <p class="cal-edit-row"><button type="button" :disabled="ro" @click="cal.weekdays.push(`Day ${cal.weekdays.length + 1}`); mark()">＋ Weekday</button></p>
        <label class="cal-edit-row">Today, {{ formatDate(today) }}, is a
          <select v-model="todayWeekday" :disabled="ro">
            <option v-for="(w, i) in cal.weekdays" :key="i" :value="i">{{ w }}</option>
          </select>
        </label>
      </section>

      <section class="card">
        <h3>Moons</h3>
        <p v-if="!cal.moons.length" class="muted small">No moons: the calendar shows no moon phases.</p>
        <table v-else class="grid lists-table">
          <thead><tr><th>Moon</th><th>Cycle (days)</th><th>Phase today</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(m, i) in cal.moons" :key="i">
              <td><input v-model="m.name" :disabled="ro" :aria-label="`Name of moon ${i + 1}`" /></td>
              <td><input v-model.number="m.cycle" class="num" type="number" min="0.1" step="any" :disabled="ro" :aria-label="`Cycle of ${m.name}`" /></td>
              <td>
                <select :value="phases[i].picked ?? ''" :disabled="ro" :aria-label="`Phase of ${m.name} today`" @change="phases[i].picked = ($event.target as HTMLSelectElement).value === '' ? null : Number(($event.target as HTMLSelectElement).value)">
                  <option value="">{{ PHASES[eighth(phases[i].exact)] }} (as it is)</option>
                  <option v-for="(p, k) in PHASES" :key="k" :value="k">{{ p }}</option>
                </select>
              </td>
              <td><button type="button" class="link-btn x" :disabled="ro" title="Remove this moon" @click="removeMoon(i); mark()">✕</button></td>
            </tr>
          </tbody>
        </table>
        <p class="cal-edit-row"><button type="button" :disabled="ro" @click="addMoon(); mark()">＋ Moon</button></p>
      </section>

      <section class="card">
        <h3>Eras</h3>
        <p class="muted small">Dates show the era's short name, e.g. “892 {{ cal.eras.length ? eraShort(cal.eras[cal.eras.length - 1]) : 'AD' }}”. The first era also covers every year before it; years below 0 count backwards.</p>
        <p v-if="!cal.eras.length" class="muted small">No eras: dates show just the year.</p>
        <table v-else class="grid lists-table">
          <thead><tr><th>Era</th><th>Short</th><th>From year</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(e, i) in cal.eras" :key="i">
              <td><input v-model="e.name" :disabled="ro" :aria-label="`Name of era ${i + 1}`" /></td>
              <td><input v-model="e.short" class="short" :placeholder="eraShort({ name: e.name })" :disabled="ro" :aria-label="`Short name of ${e.name}`" /></td>
              <td><input class="num" type="number" :value="eraFrom(i)" :placeholder="firstEra(i) ? 'the start' : ''" :disabled="ro" :aria-label="`First year of ${e.name}`" @change="setEraFrom(i, ($event.target as HTMLInputElement).value)" /></td>
              <td><button type="button" class="link-btn x" :disabled="ro" title="Remove this era" @click="cal.eras.splice(i, 1); mark()">✕</button></td>
            </tr>
          </tbody>
        </table>
        <p class="cal-edit-row"><button type="button" :disabled="ro" @click="addEra(); mark()">＋ Era</button></p>
      </section>

      <section class="card">
        <h3>Holidays <span class="muted small">every year</span></h3>
        <p v-if="!cal.holidays.length" class="muted small">No holidays yet.</p>
        <table v-else class="grid lists-table">
          <thead><tr><th>Holiday</th><th>Day</th><th>Month</th><th>Note</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(h, i) in cal.holidays" :key="i">
              <td><input v-model="h.name" :disabled="ro" :aria-label="`Name of holiday ${i + 1}`" /></td>
              <td><input v-model.number="h.day" class="num" type="number" min="1" :max="cal.months[h.month - 1]?.days" :disabled="ro" :aria-label="`Day of ${h.name}`" /></td>
              <td>
                <select v-model="h.month" :disabled="ro" :aria-label="`Month of ${h.name}`">
                  <option v-for="(m, k) in cal.months" :key="k" :value="k + 1">{{ m.name }}</option>
                  <option v-if="!cal.months[h.month - 1]" :value="h.month">Pick a month (its month was removed)</option>
                </select>
              </td>
              <td><input v-model="h.note" :disabled="ro" :aria-label="`Note on ${h.name}`" /></td>
              <td><button type="button" class="link-btn x" :disabled="ro" title="Remove this holiday" @click="cal.holidays.splice(i, 1); mark()">✕</button></td>
            </tr>
          </tbody>
        </table>
        <p class="cal-edit-row"><button type="button" :disabled="ro" @click="addHoliday(); mark()">＋ Holiday</button></p>
      </section>

      <section class="card">
        <h3>Timeline colours</h3>
        <p class="muted small">The colour of each event category on the timeline and the calendar. The categories themselves are in <a href="#/lists">Archive → Lists</a> (Event · Category).</p>
        <table class="grid lists-table">
          <tbody>
            <tr v-for="c in colors" :key="c.name">
              <td>{{ catLabel(c) }} <span v-if="!inList(c)" class="muted small">(no longer a category)</span></td>
              <td>
                <input v-model="c.color" type="color" :disabled="ro" :aria-label="`Colour of ${catLabel(c)}`" />
                <button v-if="c.color" type="button" class="link-btn small" :disabled="ro" title="No colour of its own" @click="c.color = ''; mark()">clear</button>
                <span v-else class="muted small">none</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <div class="card cal-edit-save">
        <ul v-if="problems.length" class="error small"><li v-for="p in problems" :key="p">{{ p }}</li></ul>
        <div v-if="confirmOutside && outside.length" class="cal-edit-outside small">
          <p><b>{{ outside.length }} date(s) don't fit the new calendar.</b> Save anyway?</p>
          <ul>
            <li v-for="(o, i) in outside.slice(0, 12)" :key="i"><a v-if="o.href" :href="o.href" target="_blank">{{ o.label }}</a><template v-else>{{ o.label }}</template> <span class="muted">{{ o.why }}</span></li>
            <li v-if="outside.length > 12" class="muted">… and {{ outside.length - 12 }} more</li>
          </ul>
        </div>
        <p v-if="ro" class="error small">Nothing is being saved right now, so the calendar can't be changed.</p>
        <div class="actions">
          <button type="button" @click="go('#/calendar')">{{ dirty ? 'Cancel' : 'Back' }}</button>
          <button type="submit" class="primary" :disabled="ro || !!problems.length">{{ confirmOutside && outside.length ? 'Save anyway' : 'Save the calendar' }}</button>
        </div>
      </div>
    </form>
  </div>
</template>
