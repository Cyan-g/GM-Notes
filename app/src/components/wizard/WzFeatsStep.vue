<script setup lang="ts">
// The wizard's feats step: a feat at each level that gives one (an Ability Score Improvement is a feat too), with
// the scores its ability bonus raises.
import { computed } from 'vue'
import { featLevels, finalScores, wizard } from '../../wizard'
import { ABILITY_KEYS, ABILITY_NAME } from '../../model/dnd'
import { entries, get } from '../../store'
import { useDraft } from '../../composables/useDraft'
import { inputValue as val } from '../../dom'
import SpreadPicker from '../SpreadPicker.vue'

const { d } = useDraft()
const feats = computed(() => entries.value.filter(e => e.type === 'feat').sort((a, b) => a.name.localeCompare(b.name)))
const featsFor = (boon: boolean) => {
  const want = boon ? 'Epic Boon' : 'General Feat'
  const of = feats.value.filter(f => f.fields.category === want)
  return of.length ? of : feats.value.filter(f => f.fields.category !== 'Origin Feat')
}
const featAt = (level: number) => d.value.feats.find(f => f.level === level)
function setFeat(level: number, feat: string) {
  wizard.d.feats = [...d.value.feats.filter(f => f.level !== level), ...(feat ? [{ level, feat, choice: { picks: [] } }] : [])]
}
function setFeatChoice(level: number, choice: { alt?: boolean; picks: (keyof typeof ABILITY_NAME)[][] }) {
  wizard.d.feats = d.value.feats.map(f => (f.level === level ? { ...f, choice } : f))
}
/** The scores a feat's + buttons start from: with the bonus and the feats taken before its level. */
const scoresBefore = (level: number) => finalScores({ ...d.value, feats: d.value.feats.filter(f => f.level < level) }) as Record<(typeof ABILITY_KEYS)[number], number>
</script>

<template>
  <p class="muted small">A feat at each of these levels; an Ability Score Improvement is a feat too.</p>
  <div v-for="f in featLevels(d)" :key="f.level" class="wz-choice" :class="{ open: !featAt(f.level)?.feat }">
    <b>Level {{ f.level }}</b> <span class="muted small">{{ f.boon ? 'Epic Boon' : 'feat' }}</span>
    <select :value="featAt(f.level)?.feat ?? ''" @change="setFeat(f.level, val($event))">
      <option value="">Choose…</option>
      <option v-for="x in featsFor(f.boon)" :key="x.id" :value="x.id">{{ x.name }}</option>
    </select>
    <template v-if="get(featAt(f.level)?.feat)?.fields.abilityIncrease">
      <SpreadPicker :key="featAt(f.level)!.feat" :bonus="get(featAt(f.level)!.feat)!.fields.abilityIncrease!" :scores="scoresBefore(f.level)" :model-value="featAt(f.level)!.choice" @update:model-value="c => setFeatChoice(f.level, c)" />
    </template>
  </div>
</template>
