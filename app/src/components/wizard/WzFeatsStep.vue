<script setup lang="ts">
// The wizard's feats step, a tab each: the Origin feat (the background's, or one the player picks under the "Any
// Origin feat" rule), the feats a trait gives (a Human's Versatile), and a feat at each level that gives one (an
// Ability Score Improvement is a feat too). Each tab: its feats as a list, the one looked at beside it as its card,
// and for the picked one what it asks to choose (Magic Initiate's spell list and spells) and the scores it raises.
import { computed } from 'vue'
import { bonusAdds, casts, dieOfDraft, draftPc, draftSheet, featLevels, finalScores, originOf, pickOrigin, wizard } from '../../wizard'
import type { Entry } from '../../model/types'
import { unmet } from '../../requirements'
import { choiceCandidates, choiceOpen, featBonusFor, isClassOrigin, speciesTraits, type ActiveTrait } from '../../species'
import { ABILITY_KEYS, ABILITY_NAME, signed, type Ability } from '../../model/dnd'
import { entries, get, optionLabel } from '../../store'
import { useDraft } from '../../composables/useDraft'
import { featsAllowed, isAsiFeat } from '../../rules'
import FeatScoreTable from '../FeatScoreTable.vue'
import { useDraftSheet } from '../../composables/useDraftSheet'
import FeatCard from '../FeatCard.vue'
import WzChooser, { type ChooserItem } from './WzChooser.vue'
import WzTraitChoices from './WzTraitChoices.vue'
import EntryLink from '../EntryLink.vue'

const { d, r } = useDraft()
const draftNow = useDraftSheet()
const feats = computed(() => entries.value.filter(e => e.type === 'feat').sort((a, b) => a.name.localeCompare(b.name)))
const featsFor = (boon: boolean) => {
  // the Ruleset's "Ability Score Improvement only": that feat alone, at every feat level
  if (!featsAllowed()) return feats.value.filter(f => isAsiFeat(f.name))
  const want = boon ? 'Epic Boon' : 'General Feat'
  const of = feats.value.filter(f => f.fields.category === want)
  return of.length ? of : feats.value.filter(f => f.fields.category !== 'Origin Feat')
}
const levels = computed(() => featLevels(d.value))
// ---- the tabs: Origin feat, the feats traits give, then the levels ----
const traits = computed(() => speciesTraits(draft.value.pc, draft.value.sh))
/** Traits that give a feat (Versatile: an Origin feat of the player's choice). */
const grants = computed(() => traits.value.filter(a => !isClassOrigin(a.race) && a.active && a.trait.choice?.kind === 'feat'))
/** Whether a feat (taken by `via`) still asks something. */
const featOpen = (id: string | undefined, via: string) => !!id && traits.value.some(a => a.race.type === 'feat' && a.race.id === id && (a.via ?? 'origin') === via && a.active && choiceOpen(a))
interface Tab { key: string; label: string; open: boolean; level?: { level: number; boon: boolean }; a?: ActiveTrait }
const origin = computed(() => originOf(d.value))
const tabs = computed<Tab[]>(() => [
  ...(origin.value || pickOrigin() ? [{ key: 'origin', label: `Origin feat${origin.value ? `: ${get(origin.value)?.name}` : ''}`, open: (pickOrigin() && !origin.value) || featOpen(origin.value, 'origin') }] : []),
  ...grants.value.map(a => ({ key: a.key, label: `${a.trait.name}${a.picks[0] ? `: ${get(a.picks[0])?.name}` : ''}`, open: choiceOpen(a) || featOpen(a.picks[0], a.trait.name), a })),
  ...levels.value.map(l => ({ key: `level${l.level}`, label: `Level ${l.level}${featAt(l.level)?.feat ? `: ${get(featAt(l.level)!.feat)?.name}` : ''}`, open: !featAt(l.level)?.feat, level: l })),
])
/** The tab shown: the one asked for (a step's "set it up in Feats"), else the first with something open, else the first. */
const tab = computed(() => tabs.value.find(x => x.key === wizard.featTab) ?? tabs.value.find(x => x.open) ?? tabs.value[0])
const level = computed(() => tab.value?.level)
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
// ---- the Origin feat, and the feats traits give ----
const originItems = computed<ChooserItem[]>(() => feats.value.filter(f => f.fields.category === 'Origin Feat').map(f => ({ id: f.id, label: f.name, hint: f.id === get(d.value.background)?.fields.originFeat ? 'the background’s' : '' })))
const setOrigin = (id: string) => { wizard.d.originFeat = id }
/** The feats a trait's choice offers (Versatile: Origin feats), one already had (not repeatable) dimmed. */
function grantItems(a: ActiveTrait): ChooserItem[] {
  const had = new Set(traits.value.filter(x => x.race.type === 'feat' && x.via !== a.trait.name).map(x => x.race.id))
  return choiceCandidates(a.trait.choice!).map(o => {
    const f = get(o.id), dup = !!f && had.has(f.id) && !f.fields.repeatable
    return { id: o.id, label: o.label, hint: dup ? 'you have it already' : f?.fields.repeatable && had.has(o.id) ? 'repeatable' : '', off: dup }
  })
}
function setGrant(a: ActiveTrait, id: string) {
  const all = { ...(wizard.d.species.picks ?? {}) }
  if ((all[a.key] ?? [])[0] === id) delete all[a.key]; else all[a.key] = [id]
  wizard.d.species = { ...wizard.d.species, picks: all }
}

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
/** Where a score before a feat comes from: the base, the bonus, the feats before it. */
function beforeTip(lv: number, a: Ability) {
  const base = d.value.base[a] ?? 10, bonus = bonusAdds(d.value)[a] ?? 0, feats = scoresBefore(lv)[a] - Math.min(20, base + bonus)
  return [`Base ${base}`, bonus && `bonus ${signed(bonus)}`, feats && `earlier feats ${signed(feats)}`].filter(Boolean).join(' · ')
}
</script>

<template>
  <div v-if="tabs.length > 1" class="seg wz-feat-levels" role="tablist" aria-label="Feats">
    <button v-for="x in tabs" :key="x.key" type="button" role="tab" :class="{ on: tab?.key === x.key, 'wz-todo': x.open }" :aria-selected="tab?.key === x.key" @click="wizard.featTab = x.key">
      {{ x.label }}<span v-if="x.open" class="wz-need small"> to choose</span>
    </button>
  </div>

  <!-- the Origin feat -->
  <template v-if="tab?.key === 'origin'">
    <WzChooser v-if="pickOrigin()" key="origin" :items="originItems" :picked="origin" :need="!origin" label="Origin feats"
               intro="Click an Origin feat on the left to see what it does; clicking takes it. Your background's is picked to start with." @pick="setOrigin">
      <template #detail="{ item, picked }">
        <p v-if="!picked" class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it as your Origin feat.</p>
        <WzTraitChoices v-if="picked" which="feat" :feat="item.id" via="origin" />
        <FeatCard v-if="get(item.id)" :e="get(item.id)!" title />
      </template>
    </WzChooser>
    <div v-else-if="origin" class="wz-feat-fixed">
      <p class="small">From your background <EntryLink :id="d.background" />: <b>{{ get(origin)?.name }}</b>.</p>
      <WzTraitChoices which="feat" :feat="origin" via="origin" />
      <FeatCard v-if="get(origin)" :e="get(origin)!" title />
    </div>
  </template>

  <!-- a feat a trait gives (Versatile) -->
  <WzChooser v-else-if="tab?.a" :key="tab.key" :items="grantItems(tab.a)" :picked="tab.a.picks[0]" :need="!tab.a.picks.length" :label="`Feats for ${tab.a.trait.name}`"
             :intro="`${tab.a.trait.name} (${tab.a.race.name}) gives a feat: click one on the left to see what it does; clicking takes it.`" @pick="id => setGrant(tab!.a!, id)">
    <template #detail="{ item, picked }">
      <p v-if="!picked && item.off" class="small wz-need-line">Not this one: {{ item.hint }}.</p>
      <p v-else-if="!picked" class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it for {{ tab!.a!.trait.name }}.</p>
      <WzTraitChoices v-if="picked" which="feat" :feat="item.id" :via="tab!.a!.trait.name" />
      <FeatCard v-if="get(item.id)" :e="get(item.id)!" title />
    </template>
  </WzChooser>

  <!-- a feat at a level -->
  <template v-else-if="level">
    <p v-if="tabs.length === 1" class="small muted">A {{ level.boon ? 'Epic Boon' : 'feat' }} at level {{ level.level }}; an Ability Score Improvement is a feat too.</p>
    <WzChooser :key="level.level" :items="items" :picked="featAt(level.level)?.feat" :need="!featAt(level.level)?.feat" :intro="`Click a feat on the left to see what it does; clicking takes it at level ${level.level}.`" :label="`Feats for level ${level.level}`" @pick="id => setFeat(level!.level, id)">
      <template #detail="{ item, picked }">
        <p v-if="!picked && item.off" class="small wz-need-line">Not yet: {{ item.hint }}.</p>
        <p v-else-if="!picked" class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it at level {{ level!.level }}.</p>
        <div v-if="picked && get(item.id)?.fields.abilityIncrease" class="wz-choice">
          <b>Its ability increase</b>
          <FeatScoreTable :key="item.id" :bonus="featBonusFor(get(item.id), r ? r.saves : d.ownSaves)!" :before="scoresBefore(level!.level)" :before-tip="a => beforeTip(level!.level, a)" counted
                          :s="draftNow.sheet.value" :prof="draftNow.prof.value" :level="d.level" :primary="draftNow.primary.value.list" :hp="draftNow.hp.value" :die="dieOfDraft(d)"
                          :casting="draftNow.casting.value" :spell="draftNow.spell.value" :model-value="featAt(level!.level)!.choice" @update:model-value="c => setFeatChoice(level!.level, c)" />
        </div>
        <WzTraitChoices v-if="picked" which="feat" :feat="item.id" via="sheet" />
        <FeatCard v-if="get(item.id)" :e="get(item.id)!" title />
      </template>
    </WzChooser>
  </template>
</template>
