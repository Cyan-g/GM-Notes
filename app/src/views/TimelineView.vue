<script setup lang="ts">
import Dropdown from '../components/Dropdown.vue'
import AppIcon from '../components/AppIcon.vue'
import { computed, reactive, watch } from 'vue'
import { optionLabel } from '../store'
import { allItems, filterItems, type TimelineFilter } from '../timeline'
import { db, formatDate } from '../store'
import TimelineChart from '../components/TimelineChart.vue'
import TimelineList from '../components/TimelineList.vue'
import EntryPicker from '../components/edit/EntryPicker.vue'

/** Inside the Atlas, which has its own heading. */
defineProps<{ embedded?: boolean }>()

const KEY = 'eldoria.timeline-filter'
const blank = (): TimelineFilter => ({ type: 'all', person: null, org: null, place: null, from: null, to: null })
function load(): TimelineFilter {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return blank() }
}
const f = reactive<TimelineFilter>(load())
watch(f, v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage blocked */ } }, { deep: true })
function clear() { Object.assign(f, blank()) }

const categories = computed(() => db().meta.eventCategories.map(c => c.name).filter(n => n !== 'Session'))
const items = computed(() => filterItems(allItems.value, f))
const num = (v: string) => (v.trim() === '' ? null : Number(v))
</script>

<template>
  <div class="timeline-view">
    <header v-if="!embedded" class="list-head">
      <h1><span class="icon"><AppIcon ui="timeline" /></span>Timeline <span class="count">{{ items.length }}</span></h1>
      <span class="muted">Today: <b>{{ formatDate(db().meta.today) }}</b></span>
    </header>
    <p v-else class="muted small tl-count">{{ items.length }} on the timeline · today is <b>{{ formatDate(db().meta.today) }}</b></p>

    <div class="tl-filters card">
      <label><span>Show</span>
        <Dropdown v-model="f.type">
          <option value="all">Everything</option>
          <option value="event">All events</option>
          <option v-for="c in categories" :key="c" :value="c">· {{ optionLabel('event.category', c) }}</option>
          <option value="relation">Memberships & roles</option>
          <option value="session">Sessions</option>
          <option value="writing">Writings</option>
        </Dropdown>
      </label>
      <label><span>Person</span><EntryPicker v-model="f.person" :types="['npc', 'pc', 'deity']" placeholder="Anyone" /></label>
      <label><span>Organization</span><EntryPicker v-model="f.org" :types="['organization']" placeholder="Any" /></label>
      <label><span>Place</span><EntryPicker v-model="f.place" :types="['place']" placeholder="Anywhere" /></label>
      <label><span>From year</span><input type="number" class="short" :value="f.from ?? ''" @change="f.from = num(($event.target as HTMLInputElement).value)" /></label>
      <label><span>To year</span><input type="number" class="short" :value="f.to ?? ''" @change="f.to = num(($event.target as HTMLInputElement).value)" /></label>
      <button @click="clear">Clear</button>
    </div>

    <section>
      <TimelineChart :items="items" :from="f.from" :to="f.to" />
    </section>
    <section>
      <h2>List</h2>
      <TimelineList :items="items" />
    </section>

    <details class="card help">
      <summary>How things get on the timeline</summary>
      <ul>
        <li><b>Events:</b> create an entry of type Event and give it a date. Link people and organizations with an “involved in” relation and places in “Where”.</li>
        <li><b>Memberships and roles:</b> any relation with a “from” or “until” date, such as “member of” with a role.</li>
        <li><b>Sessions:</b> only those with the tag <code>timeline</code>, and an in-world date.</li>
        <li><b>Writings:</b> books and letters with a “Written” date.</li>
      </ul>
    </details>
  </div>
</template>
