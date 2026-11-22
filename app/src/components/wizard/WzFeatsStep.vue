<script setup lang="ts">
// The wizard's feats step: a feat at each level that gives one (an Ability Score Improvement is a feat too). One level
// at a time (the tabs above the list): its feats as a list, the one looked at beside it as its card, and for the
// picked one the scores its ability bonus raises.
import { computed, ref } from 'vue'
import { casts, draftPc, draftSheet, featLevels, finalScores, wizard } from '../../wizard'
import type { Entry } from '../../model/types'
import { unmet } from '../../requirements'
import { featBonusFor, speciesTraits } from '../../species'
import { ABILITY_KEYS, ABILITY_NAME } from '../../model/dnd'
import { entries, get, optionLabel } from '../../store'
import { useDraft } from '../../composables/useDraft'
import SpreadPicker from '../SpreadPicker.vue'
import FeatCard from '../FeatCard.vue'
import WzChooser, { type ChooserItem } from './WzChooser.vue'

const { d, r } = useDraft()
const feats = computed(() => entries.value.filter(e => e.type === 'feat').sort((a, b) => a.name.localeCompare(b.name)))
const featsFor = (boon: boolean) => {
  const want = boon ? 'Epic Boon' : 'General Feat'
  const of = feats.value.filter(f => f.fields.category === want)
  return of.length ? of : feats.value.filter(f => f.fields.category !== 'Origin Feat')
}
const levels = computed(() => featLevels(d.value))
/** The level whose feat is being chosen: the first without one, else the first. */
const chosenLevel = ref<number | null>(null)
const level = computed(() => levels.value.find(l => l.level === chosenLevel.value) ?? levels.value.find(l => !featAt(l.level)?.feat) ?? levels.value[0])
const featAt = (lv: number) => d.value.feats.find(f => f.level === lv)
// what a feat needs that the draft doesn't have (as the level-up dialog checks it): scores at that level, armor
// training, a spellcaster, features; and a feat taken at another level (only one that's repeatable comes again)
const draft = computed(() => { const sh = draftSheet(d.value); return { sh, pc: draftPc(d.value, sh) } })
const featureNames = computed(() => speciesTraits(draft.value.pc, draft.value.sh).map(a => a.trait.name.toLowerCase()))
function lacks(f: Entry, lv: number): string {
  const need = Number(f.fields.level) || 0
  if (need > lv) return `level ${need}+`
  if (!f.fields.repeatable && !/^ability score improvement$/i.test(f.name.trim()) && d.value.feats.some(x => x.feat === f.id && x.level !== lv)) return 'taken'
  const sc = scoresBefore(lv)
  const why = unmet(draft.value.pc, draft.value.sh, f, a => sc[a as keyof typeof sc] ?? 10, casts(d.value), n => featureNames.value.some(x => x === n.toLowerCase() || x.startsWith(n.toLowerCase())))
  return why.join(', ')
}
const items = computed<ChooserItem[]>(() => (level.value ? featsFor(level.value.boon) : []).map(f => {
  const why = lacks(f, level.value!.level)
  return { id: f.id, label: f.name, hint: why || String(f.fields.prerequisite ?? ''), off: !!why, title: f.fields.category ? optionLabel('feat.category', f.fields.category) : undefined }
}))
function setFeat(lv: number, feat: string) {
  const same = featAt(lv)?.feat === feat
  // one whose prerequisite isn't met can't be taken (the detail says why)
  if (!same && get(feat) && lacks(get(feat)!, lv)) return
  wizard.d.feats = [...d.value.feats.filter(f => f.level !== lv), ...(!same ? [{ level: lv, feat, choice: { picks: [] } }] : [])]
}
function setFeatChoice(lv: number, choice: { alt?: boolean; picks: (keyof typeof ABILITY_NAME)[][] }) {
  wizard.d.feats = d.value.feats.map(f => (f.level === lv ? { ...f, choice } : f))
}
/** The scores a feat's + buttons start from: with the bonus and the feats taken before its level. */
const scoresBefore = (lv: number) => finalScores({ ...d.value, feats: d.value.feats.filter(f => f.level < lv) }) as Record<(typeof ABILITY_KEYS)[number], number>
</script>

<template>
  <div v-if="levels.length > 1" class="seg wz-feat-levels" role="tablist" aria-label="Feat levels">
    <button v-for="l in levels" :key="l.level" type="button" role="tab" :class="{ on: level?.level === l.level }" :aria-selected="level?.level === l.level" @click="chosenLevel = l.level">
      Level {{ l.level }}<template v-if="featAt(l.level)?.feat">: {{ get(featAt(l.level)!.feat)?.name }}</template><span v-else class="wz-need small"> to choose</span>
    </button>
  </div>
  <p v-else-if="level" class="small muted">A {{ level.boon ? 'Epic Boon' : 'feat' }} at level {{ level.level }}; an Ability Score Improvement is a feat too.</p>
  <WzChooser v-if="level" :key="level.level" :items="items" :picked="featAt(level.level)?.feat" :need="!featAt(level.level)?.feat" :intro="`Click a feat on the left to see what it does; clicking takes it at level ${level.level}.`" :label="`Feats for level ${level.level}`" @pick="id => setFeat(level!.level, id)">
    <template #detail="{ item, picked }">
      <p v-if="!picked && item.off" class="small wz-need-line">Not yet: {{ item.hint }}.</p>
      <p v-else-if="!picked" class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it at level {{ level!.level }}.</p>
      <div v-if="picked && get(item.id)?.fields.abilityIncrease" class="wz-choice">
        <b>Its ability increase</b>
        <SpreadPicker :key="item.id" :bonus="featBonusFor(get(item.id), r ? r.saves : d.ownSaves)!" :scores="scoresBefore(level!.level)" :model-value="featAt(level!.level)!.choice" @update:model-value="c => setFeatChoice(level!.level, c)" />
      </div>
      <FeatCard v-if="get(item.id)" :e="get(item.id)!" title />
    </template>
  </WzChooser>
</template>
