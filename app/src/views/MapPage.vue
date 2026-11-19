<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import { computed, ref } from 'vue'
import { get, placePath } from '../store'
import { hrefMap } from '../router'
import EntryLink from '../components/EntryLink.vue'
import MapView from '../components/MapView.vue'

const props = defineProps<{ id: string; pin?: string }>()
const place = computed(() => get(props.id))
const editing = ref(false)
const path = computed(() => (place.value ? placePath(place.value.id).slice(0, -1) : []))
/** Places above this one that have a map of their own. */
const upMaps = computed(() => path.value.filter(p => p.fields.map).reverse())
</script>

<template>
  <div v-if="place" class="map-page">
    <header class="list-head">
      <h1><span class="icon"><AppIcon ui="atlas" /></span>{{ place.name }}</h1>
      <div class="cal-nav">
        <a v-for="p in upMaps" :key="p.id" class="button" :href="hrefMap(p.id)" :title="'Map of ' + p.name">↑ {{ p.name }}</a>
        <a class="button" :href="'#/e/' + place.id">Page</a>
        <button :class="{ primary: editing }" @click="editing = !editing">{{ editing ? 'Done' : '✎ Edit pins' }}</button>
      </div>
    </header>
    <nav class="crumbs"><template v-for="(c, i) in path" :key="c.id"><span v-if="i" class="sep">›</span><EntryLink :id="c.id" /></template></nav>
    <MapView :key="place.id + String(editing)" :place="place" :editable="editing" tall :focus-pin="pin" />
  </div>
  <div v-else class="empty-state"><h1>No such place</h1></div>
</template>
