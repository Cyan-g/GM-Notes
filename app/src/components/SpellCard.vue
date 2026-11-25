<script setup lang="ts">
// A spell as it reads in a spellbook.
import { computed } from 'vue'
import { optionLabel } from '../store'
import type { Entry } from '../model/types'
import { describe } from '../describe'
import MarkdownView from './MarkdownView.vue'
import { activeEffectsOf, areaText, growthText, rollText, rollsOf, saveText } from '../spells'
import { describeEffects } from '../effects'
import UpcastTable from './UpcastTable.vue'

/** `upcast`: the rolls at each slot level (or character level, a cantrip) under them, on the spell's own page. */
const props = defineProps<{ e: Entry; upcast?: boolean }>()
const rolls = computed(() => rollsOf(props.e))
const active = computed(() => describeEffects(activeEffectsOf(props.e)))
const f = computed(() => props.e.fields)
const components = computed(() => [f.value.verbal && 'V', f.value.somatic && 'S', f.value.material && `M (${f.value.material === 'yes' ? 'material' : f.value.material})`].filter(Boolean).join(', '))
const grid = computed(() => ([
  ['Casting time', [f.value.castingTime, f.value.ritual && '(ritual)'].filter(Boolean).join(' ')],
  ['Range', [f.value.range, areaText(f.value.area) && `(${areaText(f.value.area)})`].filter(Boolean).join(' ')],
  ['Components', components.value],
  ['Duration', [f.value.concentration && 'Concentration,', f.value.duration].filter(Boolean).join(' ')],
] as [string, string][]))
</script>

<template>
  <div class="spell-card">
    <div class="sc-line">{{ describe(e) }}<template v-if="f.spellType"> · {{ optionLabel('spell.spellType', f.spellType) }}</template><template v-if="f.savingThrow"> · {{ saveText(e) }}</template></div>
    <div class="sc-grid">
      <div v-for="[k, v] in grid" :key="k"><b>{{ k }}</b><span>{{ v || '—' }}</span></div>
    </div>
    <MarkdownView v-if="f.summary" class="sc-text" :source="String(f.summary)" />
    <!-- what it rolls, causes and does while active, as data -->
    <div v-if="rolls.length || f.conditions?.length || active.length" class="sc-data">
      <div v-for="(r, i) in rolls" :key="i"><b>{{ rollText(e, r) }}</b><span v-if="r.note" class="muted">, {{ r.note }}</span><span v-if="growthText(e, r)" class="muted small"> ({{ growthText(e, r) }})</span></div>
      <div v-if="f.conditions?.length" class="small"><span class="muted">Can cause:</span> <span class="chips"><span v-for="c in f.conditions" :key="c" class="chip">{{ c }}</span></span></div>
      <div v-if="active.length" class="small"><span class="muted">While active:</span> <span class="chips"><span v-for="(x, i) in active" :key="i" class="chip">{{ x }}</span></span></div>
      <UpcastTable v-if="upcast" :e="e" />
    </div>
    <div v-if="f.classes?.length" class="sc-classes"><span class="muted small">Classes:</span> <span class="chips"><span v-for="c in f.classes" :key="c" class="chip">{{ optionLabel('class', c) }}</span></span></div>
  </div>
</template>
