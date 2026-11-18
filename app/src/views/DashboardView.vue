<script setup lang="ts">
import { computed } from 'vue'
import { DASHBOARDS } from '../dashboards'
import { entries } from '../store'
import { hrefDashboard } from '../router'
import { newEntry } from '../ui'
import DataTable from '../components/DataTable.vue'

const props = defineProps<{ id: string; view?: string }>()
const dash = computed(() => DASHBOARDS.find(d => d.id === props.id))
const view = computed(() => dash.value?.views.find(v => v.name === props.view) ?? dash.value?.views[0])
const rows = computed(() => (view.value ? entries.value.filter(view.value.filter) : []))
</script>

<template>
  <div v-if="dash && view" class="dashboard">
    <header class="list-head">
      <h1><span class="icon">{{ dash.icon }}</span>{{ dash.title }}</h1>
      <button v-if="view.creates" class="primary" @click="newEntry(view.creates)">＋ New</button>
    </header>
    <nav v-if="dash.views.length > 1" class="tabs">
      <a v-for="v in dash.views" :key="v.name" :href="hrefDashboard(dash.id, v.name)" :class="{ on: v === view }">{{ v.name }}</a>
    </nav>
    <DataTable :key="dash.id + view.name" :rows="rows" :cols="view.cols" :facets="view.facets" :sort="view.sort" :limit="view.limit" :creates="view.creates" />
  </div>
  <div v-else class="empty-state"><h1>No such dashboard</h1></div>
</template>
