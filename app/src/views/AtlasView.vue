<script setup lang="ts">
// The World menu's dashboard: the whole world as rings, every map, what's coming up in the calendar,
// and the factions at a glance.
import { computed, ref } from 'vue'
import type { Entry, Pin, WorldDate } from '../model/types'
import { byType, db, formatDate, isCurrent, placePath, relationsOf } from '../store'
import { hrefEntry, hrefMap } from '../router'
import { addDays, dayNumber } from '../calendar'
import Sunburst from '../components/Sunburst.vue'
import DataImage from '../components/DataImage.vue'
import EntryLink from '../components/EntryLink.vue'
import TimelineView from './TimelineView.vue'

/** The World menu's dashboard has two tabs: the atlas itself and the timeline. */
defineProps<{ tab?: 'timeline' }>()

const places = computed(() => byType.value.get('place') ?? [])
const roots = computed(() => places.value.filter(p => !p.fields.parent).sort((a, b) => a.name.localeCompare(b.name)))
const rootId = ref<string | null>(null)
const root = computed(() => roots.value.find(r => r.id === rootId.value) ?? roots.value[0])

// ---- maps: every place with a map picture, outermost first ----
const maps = computed(() => places.value.filter(p => p.fields.map)
  .map(p => ({ p, path: placePath(p.id).slice(0, -1).map(x => x.name), pins: ((p.fields.pins) ?? []).length }))
  .sort((a, b) => a.path.length - b.path.length || a.p.name.localeCompare(b.p.name)))

// ---- coming up: holidays (every year) and dated events after today, within the next year ----
const cal = computed(() => db().meta.calendar)
const today = computed(() => db().meta.today)
const upcoming = computed(() => {
  const c = cal.value, t = today.value, tn = dayNumber(c, t)
  const out: { when: WorldDate; days: number; label: string; id?: string; kind: 'holiday' | 'event' }[] = []
  for (const h of c.holidays ?? []) {
    let when: WorldDate = { year: t.year, month: h.month, day: h.day }
    if (dayNumber(c, when) < tn) when = { ...when, year: t.year + 1 }
    out.push({ when, days: dayNumber(c, when) - tn, label: h.name, kind: 'holiday' })
  }
  for (const e of byType.value.get('event') ?? []) {
    const d = e.fields.date
    if (!d?.year) continue
    const n = dayNumber(c, { year: d.year, month: d.month ?? 1, day: d.day ?? 1 })
    if (n >= tn && n - tn <= 366) out.push({ when: d, days: n - tn, label: e.name, id: e.id, kind: 'event' })
  }
  return out.sort((a, b) => a.days - b.days).slice(0, 8)
})
const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

// ---- factions: top-level organizations with members and seat ----
const factions = computed(() => (byType.value.get('organization') ?? [])
  .filter(o => !o.fields.parent)
  .map(o => ({ o, members: (relationsOf.value.get(o.id) ?? []).filter(r => r.kind === 'member' && r.b === o.id && isCurrent(r)).length }))
  .sort((a, b) => b.members - a.members || a.o.name.localeCompare(b.o.name)))
const seat = (o: Entry) => o.fields.seat
</script>

<template>
  <div class="atlas">
    <header class="list-head">
      <h1><span class="icon">🗺</span>Atlas</h1>
      <span class="muted">{{ places.length }} places · {{ maps.length }} maps</span>
    </header>
    <nav class="tabs">
      <a href="#/atlas" :class="{ on: tab !== 'timeline' }">🗺 Atlas</a>
      <a href="#/atlas/timeline" :class="{ on: tab === 'timeline' }">⏳ Timeline</a>
      <a href="#/calendar">📅 Calendar</a>
    </nav>

    <TimelineView v-if="tab === 'timeline'" embedded />
    <div v-else class="atlas-grid">
      <div class="atlas-main">
        <section v-if="root" class="card atlas-world">
          <h3>
            <span>The world</span>
            <select v-if="roots.length > 1" :value="root.id" @change="rootId = ($event.target as HTMLSelectElement).value">
              <option v-for="r in roots" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </h3>
          <Sunburst :id="root.id" :key="root.id" :max="640" :rings="3" />
        </section>

        <section class="card">
          <h3>Maps <span class="muted small">{{ maps.length }}</span></h3>
          <div class="map-gallery">
            <a v-for="m in maps" :key="m.p.id" class="map-tile" :href="hrefMap(m.p.id)" :title="`Open the map of ${m.p.name}`">
              <DataImage :path="m.p.fields.map" :alt="m.p.name" />
              <span class="map-tile-text">
                <b>{{ m.p.name }}</b>
                <span class="muted small">{{ m.path.slice(1).join(' › ') || m.path.join(' › ') }}<template v-if="m.pins"> · {{ m.pins }} pins</template></span>
              </span>
            </a>
          </div>
        </section>
      </div>

      <aside class="atlas-side">
        <section class="card">
          <h3>Today</h3>
          <p class="atlas-today"><a href="#/calendar">{{ formatDate(today) }}</a></p>
          <ul v-if="upcoming.length" class="rel">
            <li v-for="u in upcoming" :key="u.kind + u.label + u.days">
              <span>{{ u.kind === 'holiday' ? '🎉' : '⏳' }}</span>
              <EntryLink v-if="u.id" :id="u.id" /><b v-else>{{ u.label }}</b>
              <span class="when">{{ inDays(u.days) }}</span>
            </li>
          </ul>
          <p v-else class="muted small">Nothing on the calendar in the next year.</p>
        </section>

        <section class="card">
          <h3>Factions <span class="muted small">{{ factions.length }}</span></h3>
          <ul class="rel">
            <li v-for="f in factions" :key="f.o.id">
              <EntryLink :id="f.o.id" icon />
              <span v-if="seat(f.o)" class="role">· <EntryLink :id="seat(f.o)!" /></span>
              <span class="when">{{ f.members }} {{ f.members === 1 ? 'member' : 'members' }}</span>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>
