<script setup lang="ts">
// A month of the world calendar: holidays, events, sessions and moon phases, plus moving "today".
import { computed, ref, watch } from 'vue'
import type { Entry, WorldDate } from '../model/types'
import { db, entries, formatDate, touch } from '../store'
import { addDays, monthDays, moonMark, weekday } from '../calendar'
import { go } from '../router'
import { newEntry } from '../ui'
import EntryLink from '../components/EntryLink.vue'

const props = defineProps<{ year?: number; month?: number }>()
const cal = computed(() => db().meta.calendar)
const today = computed(() => db().meta.today)
const year = computed(() => props.year ?? today.value.year)
const month = computed(() => props.month ?? today.value.month ?? 1)
const href = (y: number, m: number) => `#/calendar/${y}/${m}`

function shift(n: number) {
  let y = year.value, m = month.value + n
  const count = cal.value.months.length
  while (m < 1) { m += count; y-- }
  while (m > count) { m -= count; y++ }
  go(href(y, m))
}

const same = (a: WorldDate | undefined, y: number, m: number, d?: number) => !!a && a.year === y && a.month === m && (d == null || a.day === d)
const dated = computed(() => entries.value.filter(e => (e.type === 'event' || e.type === 'session' || e.type === 'writing') && e.fields.date))

/** Things on each day of the shown month, and things dated to the month without a day. */
const items = computed(() => {
  const y = year.value, m = month.value
  const byDay = new Map<number, Entry[]>()
  const monthOnly: Entry[] = []
  for (const e of dated.value) {
    const d = e.fields.date
    if (!d) continue
    if (d.year !== y || d.month !== m) continue
    if (!d.day) { monthOnly.push(e); continue }
    if (!byDay.has(d.day)) byDay.set(d.day, [])
    byDay.get(d.day)!.push(e)
  }
  return { byDay, monthOnly }
})
const holidays = computed(() => cal.value.holidays.filter(h => h.month === month.value))

const cells = computed(() => {
  const y = year.value, m = month.value
  const n = monthDays(cal.value, y, m)
  const lead = weekday(cal.value, { year: y, month: m, day: 1 })
  const out: ({ day: number; moon: string | null } | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= n; d++) out.push({ day: d, moon: moonMark(cal.value, { year: y, month: m, day: d }) })
  while (out.length % cal.value.weekdays.length) out.push(null)
  return out
})

const selected = ref<number | null>(null)
watch(() => [year.value, month.value], () => { selected.value = same(today.value, year.value, month.value) ? today.value.day ?? null : null }, { immediate: true })
const selDate = computed<WorldDate | null>(() => (selected.value ? { year: year.value, month: month.value, day: selected.value } : null))

const colorOf = (e: Entry) => e.type === 'session' ? db().meta.eventCategories.find(c => c.name === 'Session')?.color
  : db().meta.eventCategories.find(c => c.name === e.fields.category)?.color

// ---- moving today ----
function setToday(d: WorldDate) {
  db().meta.today = { year: d.year, month: d.month, day: d.day }
  touch()
}
function advance(n: number) {
  setToday(addDays(cal.value, today.value, n))
  go(href(db().meta.today.year, db().meta.today.month ?? 1))
}
const yearInput = (v: string) => { const y = Number(v); if (v.trim() && !Number.isNaN(y)) go(href(y, month.value)) }
</script>

<template>
  <div class="calendar-view">
    <header class="list-head">
      <h1><span class="icon">📅</span>{{ cal.months[month - 1]?.name }} <input class="year-input" type="number" :value="year" @change="yearInput(($event.target as HTMLInputElement).value)" /> <span class="muted era">{{ year < 0 ? 'BC' : 'AC' }}</span></h1>
      <div class="cal-nav">
        <button title="Previous month" @click="shift(-1)">‹</button>
        <button @click="go(href(today.year, today.month ?? 1))">Today</button>
        <button title="Next month" @click="shift(1)">›</button>
      </div>
    </header>

    <div class="card today-bar">
      <span>Today in the world: <b>{{ weekday(cal, today) >= 0 ? cal.weekdays[weekday(cal, today)] + ', ' : '' }}{{ formatDate(today) }}</b></span>
      <span class="spacer" />
      <span class="muted small">Move time:</span>
      <button @click="advance(-1)">−1 day</button>
      <button @click="advance(1)">+1 day</button>
      <button @click="advance(7)">+1 week</button>
      <button @click="advance(30)">+30 days</button>
    </div>

    <div class="cal-layout">
      <div>
        <div v-if="items.monthOnly.length || holidays.length" class="month-notes">
          <span v-for="h in holidays" :key="h.name" class="badge holiday">🎉 {{ h.day }}: {{ h.name }}</span>
          <span v-for="e in items.monthOnly" :key="e.id" class="badge">This month: <EntryLink :id="e.id" /></span>
        </div>
        <div class="cal-grid" :style="{ '--cols': cal.weekdays.length }">
          <div v-for="w in cal.weekdays" :key="w" class="cal-wd">{{ w.slice(0, 3) }}</div>
          <template v-for="(c, i) in cells" :key="i">
            <div v-if="!c" class="cal-cell empty" />
            <div v-else class="cal-cell" :class="{ today: same(today, year, month, c.day), sel: selected === c.day }" @click="selected = c.day">
              <div class="cal-day"><span>{{ c.day }}</span><span v-if="c.moon" class="moon" :title="c.moon.slice(3)">{{ c.moon.slice(0, 2) }}</span></div>
              <div v-for="h in holidays.filter(h => h.day === c.day)" :key="h.name" class="cal-item holiday">{{ h.name }}</div>
              <a v-for="e in items.byDay.get(c.day) ?? []" :key="e.id" class="cal-item" :href="'#/e/' + e.id" :style="{ '--c': colorOf(e) ?? 'var(--accent-2)' }" @click.stop>{{ e.name }}</a>
            </div>
          </template>
        </div>
      </div>

      <aside v-if="selDate" class="card day-panel">
        <h3>{{ cal.weekdays[weekday(cal, selDate)] }}, {{ formatDate(selDate) }}</h3>
        <p v-if="moonMark(cal, selDate)" class="muted small">{{ moonMark(cal, selDate) }}</p>
        <ul class="rel">
          <li v-for="h in holidays.filter(h => h.day === selected)" :key="h.name">🎉 {{ h.name }}</li>
          <li v-for="e in items.byDay.get(selected!) ?? []" :key="e.id"><EntryLink :id="e.id" icon /></li>
        </ul>
        <p v-if="!(items.byDay.get(selected!)?.length) && !holidays.some(h => h.day === selected)" class="muted small">Nothing on this day.</p>
        <div class="day-actions">
          <button @click="newEntry('event', { date: selDate, category: 'Historical Events' })">＋ Event</button>
          <button @click="newEntry('session', { date: selDate })">＋ Session</button>
          <button v-if="!same(today, selDate.year, selDate.month!, selDate.day)" @click="setToday(selDate)">Make this today</button>
        </div>
      </aside>
    </div>
  </div>
</template>
