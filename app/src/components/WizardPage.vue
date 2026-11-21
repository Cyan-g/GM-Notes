<script setup lang="ts">
// The full page of what's picked in the character wizard, under the choices: a class's or species' lore text and
// its facts (the class table, the species' size and speed) and features or traits, as on its own page.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { classLabel, traitsOf } from '../species'
import { hrefEntry } from '../router'
import MarkdownView from './MarkdownView.vue'
import ClassOverview from './ClassOverview.vue'
import RaceGlance from './RaceGlance.vue'
import TraitList from './TraitList.vue'

const props = defineProps<{ e: Entry; title?: string }>()
const traits = computed(() => traitsOf(props.e))
const isClass = computed(() => props.e.type === 'class' || props.e.type === 'subclass')
</script>

<template>
  <section class="wz-page">
    <h3 class="wz-page-head">{{ title ?? e.name }} <a :href="hrefEntry(e.id)" class="small" target="_self" title="Its own page">open its page</a></h3>
    <MarkdownView v-if="e.body.trim()" :source="e.body" />
    <ClassOverview v-if="e.type === 'class'" :e="e" />
    <RaceGlance v-else-if="e.type === 'race'" :e="e" no-actions />
    <template v-if="traits.length">
      <h4 class="wz-page-sub">{{ isClass ? 'Features' : 'Traits' }}</h4>
      <TraitList :traits="traits" :by-level="isClass ? classLabel(e) : undefined" :lineage="e.type === 'race' && e.fields.parent ? e.name : undefined" />
    </template>
  </section>
</template>
