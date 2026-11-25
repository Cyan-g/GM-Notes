<script setup lang="ts">
// An item's requirements (requirements.ts): minimum scores, classes or any spellcaster, races, skill
// proficiencies and a note. Empty parts are left out, and nothing at all clears the field.
import Dropdown from '../Dropdown.vue'
import { computed } from 'vue'
import type { Requirements } from '../../model/types'
import { ABILITIES, SKILLS } from '../../model/dnd'
import { listOptions } from '../../store'
import { featureNames } from '../../species'
import ProfChips from '../ProfChips.vue'
import EntryPicker from './EntryPicker.vue'
import EntryLink from '../EntryLink.vue'

const model = defineModel<Requirements | undefined>()
const props = defineProps<{ /** Offer "has feature" (a feat's prerequisites). */ features?: boolean }>()
const r = computed<Requirements>(() => model.value ?? {})
function put(patch: Partial<Requirements>) {
  const n: Requirements = { ...r.value, ...patch }
  for (const k of Object.keys(n) as (keyof Requirements)[]) {
    const v = n[k]
    if (v == null || v === false || v === '' || (Array.isArray(v) && !v.length)) delete n[k]
  }
  model.value = Object.keys(n).length ? n : undefined
}
const scores = computed(() => r.value.scores ?? [])
const setScore = (i: number, patch: Partial<NonNullable<Requirements['scores']>[number]>) => put({ scores: scores.value.map((x, k) => (k === i ? { ...x, ...patch } : x)) })
const classOptions = computed(() => listOptions('class'))
const skillOptions = SKILLS.map(s => ({ id: s.name, label: s.name }))
</script>

<template>
  <div class="req-input">
    <div class="req-row">
      <span class="req-label">Scores</span>
      <span v-for="(x, i) in scores" :key="i" class="req-score">
        <Dropdown :value="x.ability" aria-label="Ability" @change="setScore(i, { ability: ($event.target as HTMLSelectElement).value as any })">
          <option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.short }}</option>
        </Dropdown>
        <input type="number" min="1" max="30" class="effect-value" :value="x.min" aria-label="Minimum" @change="setScore(i, { min: Number(($event.target as HTMLInputElement).value) || 10 })" />
        <button type="button" class="link-btn" title="Remove" @click="put({ scores: scores.filter((_, k) => k !== i) })">×</button>
      </span>
      <button type="button" class="chip-btn" @click="put({ scores: [...scores, { ability: 'str', min: 13 }] })">＋ Score</button>
      <label v-if="scores.length > 1" class="small effect-check"><input type="checkbox" :checked="!!r.anyScore" @change="put({ anyScore: ($event.target as HTMLInputElement).checked })" /> one of them is enough</label>
    </div>
    <div v-if="features" class="req-row">
      <span class="req-label">Has feature</span>
      <ProfChips :values="r.features ?? []" :suggest="featureNames()" :create="(x: string) => x" placeholder="e.g. Fighting Style…" @change="v => put({ features: v })" />
    </div>
    <div class="req-row">
      <span class="req-label">Class</span>
      <ProfChips :values="r.classes ?? []" :suggest="classOptions" placeholder="Add a class…" @change="v => put({ classes: v })" />
      <label class="small effect-check"><input type="checkbox" :checked="!!r.spellcaster" @change="put({ spellcaster: ($event.target as HTMLInputElement).checked })" /> or any spellcaster</label>
    </div>
    <div class="req-row">
      <span class="req-label">Race</span>
      <span v-for="id in r.races ?? []" :key="id" class="chip"><EntryLink :id="id" /><button type="button" class="link-btn" title="Remove" @click="put({ races: (r.races ?? []).filter(x => x !== id) })">×</button></span>
      <EntryPicker add :types="['race']" :exclude="r.races ?? []" placeholder="Add a race (subraces count)…" @pick="id => put({ races: [...(r.races ?? []), id] })" />
    </div>
    <div class="req-row">
      <span class="req-label">Proficient in</span>
      <ProfChips :values="r.skills ?? []" :suggest="skillOptions" placeholder="Add a skill…" @change="v => put({ skills: v })" />
    </div>
    <div class="req-row">
      <span class="req-label">Note</span>
      <input class="effect-text" :value="r.note ?? ''" placeholder="Anything else (not checked)" @change="put({ note: ($event.target as HTMLInputElement).value.trim() })" />
    </div>
  </div>
</template>
