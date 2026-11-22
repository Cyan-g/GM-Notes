<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import { computed } from 'vue'
import { DASHBOARDS } from '../dashboards'
import { column } from '../columns'
import { entries } from '../store'
import { hrefDashboard } from '../router'
import { newEntry } from '../ui'
import DataTable from '../components/DataTable.vue'

const props = defineProps<{ id: string; view?: string }>()
const dash = computed(() => DASHBOARDS.find(d => d.id === props.id))
const view = computed(() => dash.value?.views.find(v => v.name === props.view) ?? dash.value?.views[0])
const rows = computed(() => (view.value ? entries.value.filter(view.value.filter) : []))
// the recipes' Profit only where some recipe makes one (a world whose items are worth what goes into them has none)
const cols = computed(() => (view.value?.cols ?? []).filter(c => c !== '@margin' || rows.value.some(e => { const m = column('@margin').value(e); return typeof m === 'number' && m !== 0 })))
</script>

<template>
  <div v-if="dash && view" class="dashboard">
    <header class="list-head">
      <h1><span class="icon"><AppIcon :ui="dash.uiIcon" :type="dash.typeIcon" :text="dash.icon" /></span>{{ dash.title }}</h1>
      <button v-if="view.creates" class="primary" @click="newEntry(view.creates, view.createFields)">＋ New</button>
    </header>
    <nav v-if="dash.views.length > 1" class="tabs">
      <a v-for="v in dash.views" :key="v.name" :href="hrefDashboard(dash.id, v.name)" :class="{ on: v === view }">{{ v.name }}</a>
    </nav>
    <DataTable :key="dash.id + view.name" :rows="rows" :cols="cols" :facets="view.facets" :sort="view.sort" :limit="view.limit" :creates="view.creates" />
  </div>
  <div v-else class="empty-state"><h1>No such dashboard</h1></div>
</template>
