<script setup lang="ts">
// A feat as it reads in a rulebook: kind, prerequisites, the ability score increase, then what it does.
import { computed } from 'vue'
import type { Entry, Id } from '../model/types'
import { get } from '../store'
import { hrefEntry } from '../router'
import EntryLink from './EntryLink.vue'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ e: Entry; title?: boolean; source?: boolean }>()
const f = computed(() => props.e.fields)
const requires = computed(() => ((f.value.requires as Id[] | undefined) ?? []).filter(id => get(id)))
const hasPrereq = computed(() => f.value.level || requires.value.length || f.value.prerequisite)
</script>

<template>
  <div class="feat-card">
    <div class="feat-head">
      <a v-if="title" class="feat-name" :href="hrefEntry(e.id)">{{ e.name }}</a>
      <span v-if="f.category" class="badge">{{ f.category }}</span>
      <span v-if="source && f.source" class="muted small">from <EntryLink :id="f.source" /></span>
    </div>
    <p v-if="hasPrereq" class="feat-line"><b>Prerequisite:</b>
      <template v-if="f.level"> Level {{ f.level }}+</template><template v-if="f.level && (requires.length || f.prerequisite)">,</template>
      <template v-for="(id, i) in requires" :key="id"><template v-if="i">, </template> <EntryLink :id="id" /></template><template v-if="requires.length && f.prerequisite">,</template>
      <template v-if="f.prerequisite"> {{ f.prerequisite }}</template>
    </p>
    <p v-if="f.abilityIncrease" class="feat-line"><b>Ability score increase:</b> {{ f.abilityIncrease }}</p>
    <MarkdownView v-if="f.summary" class="feat-text" :source="String(f.summary)" />
  </div>
</template>
