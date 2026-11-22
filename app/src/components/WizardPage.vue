<script setup lang="ts">
// The full page of what's picked in the character wizard, under the choices: a class's or species' lore text and
// its facts (the class table, the species' size and speed) and features or traits, as on its own page. Each part
// folds; what's folded stays folded on the next class (remembered on this computer).
import { computed, ref } from 'vue'
import type { Entry } from '../model/types'
import { classLabel } from '../classRules'
import { traitsOf } from '../model/traits'
import { hrefEntry } from '../router'
import MarkdownView from './MarkdownView.vue'
import ClassOverview from './ClassOverview.vue'
import RaceGlance from './RaceGlance.vue'
import TraitList from './TraitList.vue'

const props = defineProps<{ e: Entry; title?: string }>()
const traits = computed(() => traitsOf(props.e))
const isClass = computed(() => props.e.type === 'class' || props.e.type === 'subclass')
const KEY = 'gm-notes:wizard-folded'
const folded = ref<string[]>((() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } })())
/** Whether a part (lore, table, features) is open; folding it remembers that for every page. */
const isOpen = (part: string) => !folded.value.includes(part)
function toggled(part: string, ev: Event) {
  const open = (ev.target as HTMLDetailsElement).open
  if (open === isOpen(part)) return
  folded.value = open ? folded.value.filter(x => x !== part) : [...folded.value, part]
  try { localStorage.setItem(KEY, JSON.stringify(folded.value)) } catch { /* just for now */ }
}
</script>

<template>
  <section class="wz-page">
    <h3 class="wz-page-head">{{ title ?? e.name }} <a :href="hrefEntry(e.id)" class="small" target="_self" title="Its own page">open its page</a></h3>
    <details v-if="e.body.trim()" class="wz-fold" :open="isOpen('lore')" @toggle="toggled('lore', $event)">
      <summary>{{ e.type === 'race' ? 'About them' : 'Description' }}</summary>
      <MarkdownView :source="e.body" />
    </details>
    <details v-if="e.type === 'class'" class="wz-fold" :open="isOpen('table')" @toggle="toggled('table', $event)">
      <summary>Class table</summary>
      <ClassOverview :e="e" />
    </details>
    <RaceGlance v-else-if="e.type === 'race'" :e="e" no-actions />
    <details v-if="traits.length" class="wz-fold" :open="isOpen('features')" @toggle="toggled('features', $event)">
      <summary>{{ isClass ? 'Features' : 'Traits' }} <span class="muted small">{{ traits.length }}</span></summary>
      <TraitList :traits="traits" :by-level="isClass ? classLabel(e) : undefined" :lineage="e.type === 'race' && e.fields.parent ? e.name : undefined" />
    </details>
  </section>
</template>
