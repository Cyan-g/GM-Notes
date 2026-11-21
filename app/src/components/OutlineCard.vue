<script setup lang="ts">
// "On this page": the headings of a long text, each a click away (a dungeon's rooms, a city's districts).
// Read from the rendered page, so hidden empty sections and DM-only parts in player mode aren't listed.
import { nextTick, onMounted, ref, watch } from 'vue'
import type { Entry } from '../model/types'
import { playerMode } from '../store'

const props = defineProps<{ e: Entry }>()
const heads = ref<{ text: string; level: number; el: HTMLElement }[]>([])
async function collect() {
  await nextTick()
  const els = [...document.querySelectorAll<HTMLElement>('.entry-main .md h1, .entry-main .md h2, .entry-main .md h3')]
  const all = els.map(el => ({ text: el.textContent?.trim() ?? '', level: Number(el.tagName[1]), el })).filter(h => h.text)
  // a heading every room repeats ("exits") says nothing about where it leads: left out
  const count = new Map<string, number>()
  for (const h of all) count.set(h.text.toLowerCase(), (count.get(h.text.toLowerCase()) ?? 0) + 1)
  heads.value = all.filter(h => (count.get(h.text.toLowerCase()) ?? 0) < 3)
}
onMounted(collect)
watch(() => [props.e.id, props.e.body, playerMode.value], collect)
const top = (h: { level: number }) => Math.min(...heads.value.map(x => x.level)) === h.level
const go = (el: HTMLElement) => el.scrollIntoView({ block: 'start', behavior: 'smooth' })
</script>

<template>
  <div v-if="heads.length >= 5" class="card outline-card">
    <h3>On this page</h3>
    <ul class="outline-list">
      <li v-for="(h, i) in heads" :key="i" :class="{ sub: !top(h) }"><button type="button" class="link-btn" @click="go(h.el)">{{ h.text }}</button></li>
    </ul>
  </div>
</template>
