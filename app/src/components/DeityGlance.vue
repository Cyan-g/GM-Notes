<script setup lang="ts">
// A deity at a glance, above its text: domains (linked to their cleric subclass where the world has one),
// portfolio, where it dwells, who worships it, its symbol, holy days and the subclasses it's a patron of.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { db } from '../store'
import { domainSubclass, holidays, placeNamed } from '../deity'
import EntryLink from './EntryLink.vue'
import DataImage from './DataImage.vue'

const props = defineProps<{ e: Entry }>()
const f = computed(() => props.e.fields)
const domains = computed(() => ((f.value.domains as string[] | undefined) ?? []).map(d => ({ name: d, sub: domainSubclass(d) })))
const portfolio = computed(() => (f.value.portfolio as string[] | undefined) ?? [])
const realm = computed(() => ({ text: String(f.value.realm ?? ''), place: placeNamed(f.value.realm as string | undefined) }))
const plane = computed(() => ({ text: String(f.value.plane ?? ''), place: placeNamed(f.value.plane as string | undefined) }))
const months = computed(() => db().meta.calendar.months)
const holyDays = computed(() => ((f.value.holyDays as string[] | undefined) ?? []).map(n => {
  const h = holidays().find(x => x.name === n)
  return { name: n, when: h && months.value[h.month - 1] ? `${h.day} ${months.value[h.month - 1].name}` : '' }
}))
const patronOf = computed(() => (f.value.patronOf as string[] | undefined) ?? [])
const any = computed(() => domains.value.length || portfolio.value.length || realm.value.text || plane.value.text || f.value.worshippers || f.value.symbol || f.value.symbolImage || holyDays.value.length || patronOf.value.length)
</script>

<template>
  <section v-if="any" class="card deity-glance">
    <dl>
      <template v-if="domains.length">
        <dt>Domains</dt>
        <dd>
          <span class="chips"><template v-for="d in domains" :key="d.name"><EntryLink v-if="d.sub" :id="d.sub.id" :label="d.name" class="chip" /><span v-else class="chip">{{ d.name }}</span></template></span>
          <span class="muted small"> · its clerics choose {{ domains.length === 1 ? 'the' : 'from' }} {{ domains.map(d => d.name).join(domains.length === 2 ? ' or ' : ', ') }} domain{{ domains.length === 1 ? '' : 's' }}</span>
        </dd>
      </template>
      <template v-if="portfolio.length"><dt>Portfolio</dt><dd>{{ portfolio.join(', ') }}</dd></template>
      <template v-if="realm.text || plane.text">
        <dt>Dwells in</dt>
        <dd>
          <template v-if="realm.text"><EntryLink v-if="realm.place" :id="realm.place.id" /><template v-else>{{ realm.text }}</template></template>
          <template v-if="realm.text && plane.text">, in </template>
          <template v-if="plane.text"><EntryLink v-if="plane.place" :id="plane.place.id" /><template v-else>{{ plane.text }}</template></template>
        </dd>
      </template>
      <template v-if="f.worshippers"><dt>Worshipped by</dt><dd>{{ f.worshippers }}</dd></template>
      <template v-if="f.symbol || f.symbolImage">
        <dt>Symbol</dt>
        <dd class="deity-symbol-view"><DataImage v-if="f.symbolImage" :path="String(f.symbolImage)" :alt="`${e.name}'s symbol`" class="deity-symbol-img" />{{ f.symbol }}</dd>
      </template>
      <template v-if="holyDays.length"><dt>Holy days</dt><dd>{{ holyDays.map(h => h.when ? `${h.name} (${h.when})` : h.name).join(', ') }}</dd></template>
      <template v-if="patronOf.length"><dt>Patron of</dt><dd><template v-for="(id, i) in patronOf" :key="id"><template v-if="i">, </template><EntryLink :id="id" /></template></dd></template>
    </dl>
  </section>
</template>
