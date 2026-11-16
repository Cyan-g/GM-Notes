<script setup lang="ts">
// A spell as it reads in a spellbook.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { describe } from '../describe'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ e: Entry }>()
const f = computed(() => props.e.fields as Record<string, any>)
const components = computed(() => [f.value.verbal && 'V', f.value.somatic && 'S', f.value.material && `M (${f.value.material === 'yes' ? 'material' : f.value.material})`].filter(Boolean).join(', '))
const grid = computed(() => ([
  ['Casting time', [f.value.castingTime, f.value.ritual && '(ritual)'].filter(Boolean).join(' ')],
  ['Range', f.value.range],
  ['Components', components.value],
  ['Duration', [f.value.concentration && 'Concentration,', f.value.duration].filter(Boolean).join(' ')],
] as [string, string][]))
</script>

<template>
  <div class="spell-card">
    <div class="sc-line">{{ describe(e) }}<template v-if="f.spellType"> · {{ f.spellType }}</template><template v-if="f.savingThrow"> · {{ f.savingThrow }} save</template></div>
    <div class="sc-grid">
      <div v-for="[k, v] in grid" :key="k"><b>{{ k }}</b><span>{{ v || '—' }}</span></div>
    </div>
    <MarkdownView v-if="f.summary" class="sc-text" :source="String(f.summary)" />
    <div v-if="f.classes?.length" class="sc-classes"><span class="muted small">Classes:</span> <span class="chips"><span v-for="c in f.classes" :key="c" class="chip">{{ c }}</span></span></div>
  </div>
</template>
