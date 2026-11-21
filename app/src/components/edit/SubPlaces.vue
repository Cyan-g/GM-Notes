<script setup lang="ts">
// The places inside this one, while editing it, and a new one made right inside.
import { computed } from 'vue'
import type { Entry } from '../../model/types'
import { byType } from '../../store'
import { newEntry } from '../../ui'
import EntryLink from '../EntryLink.vue'

const props = defineProps<{ place: Entry }>()
const kids = computed(() => (byType.value.get('place') ?? []).filter(p => p.fields.parent === props.place.id).sort((a, b) => a.name.localeCompare(b.name)))
</script>

<template>
  <div class="card sub-places">
    <h3>Places inside <span v-if="kids.length" class="muted small">{{ kids.length }}</span></h3>
    <p v-if="kids.length" class="chips"><EntryLink v-for="k in kids" :key="k.id" :id="k.id" class="chip" /></p>
    <button type="button" class="chip-btn" :title="`A new place, located in ${place.name}`" @click="newEntry('place', { parent: place.id })">＋ Place inside {{ place.name }}</button>
  </div>
</template>
