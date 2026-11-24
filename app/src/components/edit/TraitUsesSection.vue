<script setup lang="ts">
// A feature's limited uses on its Edit page, as a sentence: "[Warlock level] + [1] uses, back on a [long rest] and [0]
// back on a short rest", with "Pool ×…" (points spent a few at a time) and "Changes by level…" added on demand, and
// what it comes to on the sheet by level (traitEditing.ts).
import { computed, ref } from 'vue'
import Dropdown from '../Dropdown.vue'
import StepsInput from './StepsInput.vue'
import TraitSection from './TraitSection.vue'
import { cleanUses, countKind, countKinds, usesPreview, type Uses } from '../../traitEditing'
import { usesLabel } from '../../species'
import { inputValue as val } from '../../dom'

const props = defineProps<{ uses: Uses; /** The level the feature comes at (the preview starts there). */ traitLevel: number; /** What "level" counts ("Warlock level"). */ levelLabel: string }>()
const emit = defineEmits<{ update: [Uses | undefined] }>()
const set = (p: Partial<Uses>) => emit('update', cleanUses({ ...props.uses, ...p }))
const poolOpen = ref(false), stepsOpen = ref(false)
const pool = computed(() => !!props.uses.times || poolOpen.value)
const steps = computed(() => !!props.uses.steps?.length || stepsOpen.value)
function openPool() { poolOpen.value = true; set({ times: 2 }) }
/** "uses" or "points" (a pool) after the count. */
const word = computed(() => ((props.uses.times ?? 1) > 1 ? 'points' : 'uses'))
const summary = computed(() => usesLabel({ id: '', name: '', uses: props.uses }).replace('/', ' per ').replace('level', props.levelLabel.toLowerCase()))
/** The preview, unless it only repeats the level steps' own line. */
const preview = computed(() => (!props.uses.steps?.length || props.uses.times || props.uses.plus ? usesPreview(props.uses, props.traitLevel) : ''))
</script>

<template>
  <TraitSection title="Limited uses" :summary="summary" @remove="emit('update', undefined)">
    <div class="trait-row fuses">
      <Dropdown :value="countKind(uses)" aria-label="How many" @change="set({ count: val($event) === 'n' ? 1 : val($event) as Uses['count'] })">
        <option v-for="c in countKinds(levelLabel)" :key="c.id" :value="c.id">{{ c.label }}</option>
      </Dropdown>
      <input v-if="typeof uses.count === 'number'" type="number" min="1" class="fnum" :value="uses.count" aria-label="Uses" @change="set({ count: Number(val($event)) || 1 })" />
      <template v-if="pool"><span title="A pool: this many times the count (Lay on Hands: 5 × level)">×</span><input type="number" min="1" class="fnum" :value="uses.times ?? 2" aria-label="Times the count (a pool)" @change="set({ times: Number(val($event)) > 1 ? Number(val($event)) : undefined })" /></template>
      <span title="Added to the count (Healing Light: level + 1)">+</span><input type="number" min="0" class="fnum" :value="uses.plus ?? 0" aria-label="Added to the count" @change="set({ plus: Number(val($event)) > 0 ? Number(val($event)) : undefined })" />
      <span>{{ word }}, back on a</span>
      <Dropdown :value="uses.recharge" aria-label="Back on" @change="set({ recharge: val($event) as 'short' | 'long' })">
        <option value="short">short rest</option>
        <option value="long">long rest</option>
      </Dropdown>
      <template v-if="uses.recharge === 'long'"><span class="small muted">and</span><input type="number" min="0" class="fnum" :value="uses.shortBack ?? 0" title="Given back on a short rest (Rage: 1)" aria-label="Given back on a short rest" @change="set({ shortBack: Number(val($event)) || undefined })" /><span class="small muted">back on a short rest</span></template>
    </div>
    <div v-if="!pool || !steps" class="trait-row">
      <button v-if="!pool" type="button" class="chip-btn" title="A pool of points spent a few at a time (Lay on Hands: 5 × level)" @click="openPool">Pool ×…</button>
      <button v-if="!steps" type="button" class="chip-btn" title="A different number at some levels (Rage: 2, 3 at level 3, 4 at level 6…)" @click="stepsOpen = true">Changes by level…</button>
    </div>
    <StepsInput v-if="steps" numeric label="Uses" :model-value="uses.steps" @update:model-value="v => set({ steps: v as [number, number][] | undefined })" />
    <p v-if="preview" class="fpreview">On the sheet: {{ preview }}</p>
  </TraitSection>
</template>
