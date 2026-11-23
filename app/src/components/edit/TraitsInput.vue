<script setup lang="ts">
// The features of a class or subclass (and the traits of a race, background, feat or item) on its Edit page: one card
// each, a class's grouped under its levels. An open card has a header (its level, its name, moving, copying and
// removing it), its text, then only the parts it uses, each a TraitSection with what's set in a few words: effects,
// proficiencies, spells (TraitOptionFields), the player's choice (options such as invocations fold to one row each),
// limited uses (a sentence, with what it comes to by level), a scaling value, a switch, how its spells are cast. The
// parts it doesn't use are chips in the Add row at the bottom.
import Dropdown from '../Dropdown.vue'
import { computed, reactive, ref } from 'vue'
import type { Trait, TraitChoice, TraitOption } from '../../model/types'
import { byLevel, choiceWords, newTraitId, usesLabel as usesWords } from '../../species'
import { listOptions } from '../../store'
import { ABILITY_KEYS, ABILITY_NAME, profBonus } from '../../model/dnd'
import TraitOptionFields from './TraitOptionFields.vue'
import ChoiceFields from './ChoiceFields.vue'
import StepsInput from './StepsInput.vue'
import TraitChips from '../TraitChips.vue'
import TraitSection from './TraitSection.vue'
import { inputValue as val } from '../../dom'

const model = defineModel<Trait[] | undefined>()
const props = defineProps<{ /** The entry's type: a class's or subclass's features are grouped by level. */ entryType?: string; /** Its class, for "Warlock level". */ className?: string; /** A subclass's levels to expect features at (its class's other subclasses'): shown even while empty. */ expectedLevels?: number[]; /** A subrace's: its main races' traits, one of which a trait may replace. */ parentTraits?: { id: string; name: string }[]; /** The entry's name: a feat's feature starts with it. */ entryName?: string }>()
const forClass = computed(() => props.entryType === 'class' || props.entryType === 'subclass')
const word = computed(() => (forClass.value || props.entryType === 'feat' ? 'feature' : 'trait'))
const levelWord = computed(() => (forClass.value && props.className ? `${props.className} level` : forClass.value ? 'Level' : 'Character level'))
/** Grouped under level headings: a class's features always, other traits once some come after level 1. */
const grouped = computed(() => forClass.value || list.value.some(t => (t.level ?? 1) > 1))
const list = computed(() => model.value ?? [])
const save = (l: Trait[]) => { model.value = l.length ? l : undefined }
function put(i: number, t: Trait) { const l = [...list.value]; l[i] = t; save(l) }
const patch = (i: number, p: Partial<Trait>) => {
  const t: Trait = { ...list.value[i], ...p }
  if (!t.level || t.level <= 1) delete t.level
  for (const k of ['uses', 'choice', 'scale', 'onSheet', 'spellLists', 'castWith', 'toggle', 'replaces'] as const) if (t[k] == null) delete t[k]
  put(i, t)
}
const lv = (t: Trait) => t.level ?? 1
/** The cards in order: a class's by level (then as listed), anything else as listed. */
const order = computed(() => list.value.map((_, i) => i).sort((a, b) => (grouped.value ? lv(list.value[a]) - lv(list.value[b]) : 0) || a - b))
/** The cards by level (a class's), with the expected levels that have none yet; one group for anything else. */
const sections = computed(() => {
  const all = order.value.map((i, pos) => ({ i, pos }))
  if (!grouped.value) return [{ level: 0, cards: all }]
  const levels = new Set([...all.map(c => lv(list.value[c.i])), ...(props.expectedLevels ?? [])])
  return [...levels].sort((a, b) => a - b).map(level => ({ level, cards: all.filter(c => lv(list.value[c.i]) === level) }))
})
const opened = ref<string | null>(null)
/** A new feature at a level (by default the last one's). */
const add = (at?: number) => {
  const id = newTraitId(), level = at ?? (forClass.value && order.value.length ? lv(list.value[order.value.at(-1)!]) : 1)
  save([...list.value, { id, name: forClass.value ? 'New feature' : 'New trait', ...(level > 1 ? { level } : {}) }])
  opened.value = id
}
/** A feat's first feature: named like the feat (its effects and choices are added to it). */
const startFromCard = () => { const id = newTraitId(); save([{ id, name: props.entryName! }]); opened.value = id }
/** A copy of a feature right after it (a new id, so characters' picks and uses stay with the original). */
function duplicate(i: number) {
  const t = list.value[i], id = newTraitId(), l = [...list.value]
  l.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(t)), id, name: `${t.name} (copy)` })
  save(l)
  opened.value = id
}
/** "Warlock lv" in a card's header ("Lv" for a race's or background's trait). */
const shortLevelWord = computed(() => (forClass.value && props.className ? `${props.className} lv` : 'Lv'))
const remove = (i: number) => { if (confirm(`Remove the ${word.value} “${list.value[i].name}”? Characters lose its choices and uses.`)) save(list.value.filter((_, k) => k !== i)) }
/** Up and down among the cards as shown: a class's only within its level (the level sets its place). */
const canMove = (pos: number, by: number) => { const j = pos + by; return j >= 0 && j < order.value.length && (!grouped.value || lv(list.value[order.value[j]]) === lv(list.value[order.value[pos]])) }
function move(pos: number, by: number) {
  if (!canMove(pos, by)) return
  const l = [...list.value], a = order.value[pos], b = order.value[pos + by]
  ;[l[a], l[b]] = [l[b], l[a]]
  save(l)
}

// ---- in play: uses, a switch, a scaling value ----
function setUses(i: number, on: boolean) { patch(i, { uses: on ? { count: 1, recharge: 'long' } : undefined }) }
type Uses = NonNullable<Trait['uses']>
const countKinds = computed(() => [
  { id: 'n', label: 'a number' }, { id: 'pb', label: 'proficiency bonus' }, { id: 'level', label: forClass.value ? levelWord.value : 'character level' },
  ...ABILITY_KEYS.map(a => ({ id: a, label: `${a.toUpperCase()} modifier` })),
])
const countKind = (u: Uses) => (typeof u.count === 'number' ? 'n' : u.count)
const setUse = (i: number, p: Partial<Uses>) => {
  const u: Uses = { ...list.value[i].uses!, ...p }
  for (const k of ['times', 'plus', 'steps', 'shortBack'] as const) if (!u[k] || (Array.isArray(u[k]) && !(u[k] as unknown[]).length)) delete u[k]
  patch(i, { uses: u })
}
/** Uses opened as a pool (× the count) or by level before a value is set. */
const poolOpen = reactive(new Set<string>()), stepsOpen = reactive(new Set<string>()), listsOpen = reactive(new Set<string>())
function openPool(i: number) { poolOpen.add(list.value[i].id); setUse(i, { times: 2 }) }
/** "uses" or "points" (a pool) after the count. */
const usesWord = (t: Trait) => ((t.uses?.times ?? 1) > 1 ? 'points' : 'uses')
const usesLabel = (t: Trait) => usesWords(t).replace('/', ' per ').replace(/ rest\b/, ' rest').replace('level', forClass.value ? levelWord.value.toLowerCase() : 'level')
/** What the uses come to by level, as the sheet counts them: "4 at level 3 · 7 at level 6 …", or the modifier in words. */
function usesPreview(t: Trait): string {
  const u = t.uses!, times = u.times ?? 1, plus = u.plus ?? 0, from = lv(t)
  if (typeof u.count === 'string' && u.count !== 'pb' && u.count !== 'level' && !u.steps?.length) {
    return `${u.count.toUpperCase()} modifier (at least 1)${times > 1 ? ` × ${times}` : ''}${plus ? ` + ${plus}` : ''}`
  }
  const at = (l: number) => {
    const n = u.count === 'pb' ? profBonus(l) : u.count === 'level' ? l : typeof u.count === 'number' ? u.count : 1
    return byLevel(u.steps, l, n) * times + plus
  }
  const levels = [...new Set([from, ...(u.steps ?? []).map(x => x[0]), 5, 10, 15, 20].filter(l => l >= from && l <= 20))].sort((a, b) => a - b)
  const shown: string[] = []
  let last: number | undefined
  for (const l of levels) { const n = at(l); if (n !== last) shown.push(`${n} at level ${l}`); last = n }
  return shown.length === 1 && levels.length > 1 ? `always ${at(from)}` : shown.join(' · ')
}
const scaleSummary = (t: Trait) => [t.scale!.label, (t.scale!.steps ?? []).filter(x => x[1]).map(x => x[1]).join(' → ')].filter(Boolean).join(': ')
const choiceSummary = (t: Trait) => {
  const c = t.choice!
  return c.kind === 'option' ? `${c.count ?? 1} of ${c.options?.length ?? 0} options` : `${c.count ?? 1} ${kindLabel(c)}`
}
const castSummary = (t: Trait) => (t.castWith?.sameAs != null ? `as ${list.value.find(x => x.id === t.castWith!.sameAs)?.name ?? 'another'}` : `the player picks: ${(t.castWith?.among ?? []).map(a => a.toUpperCase()).join(', ')}`)
/** Whether a feature gives spells (its own, a spell choice's, its options'): only then does its casting ability matter. */
const hasSpells = (t: Trait) => !!(t.spells?.length || t.choice?.kind === 'spell' || t.choice?.options?.some(o => o.spells?.length || o.choices?.some(c => c.kind === 'spell')))
/** Take a part off a feature, after asking. */
function dropPart(i: number, part: 'choice' | 'scale', words: string) {
  if (confirm(`Take ${words} off “${list.value[i].name || 'this'}”?`)) patch(i, { [part]: undefined })
}
const setScale = (i: number, label: string, steps: [number, string][] | undefined) =>
  patch(i, { scale: label.trim() ? { label: label.trim(), steps: steps ?? [[lv(list.value[i]), '']] } : undefined })

// ---- the choice ----
const CHOICE_KINDS: { id: TraitChoice['kind']; label: string }[] = [
  { id: 'skill', label: 'Pick skills' }, { id: 'language', label: 'Pick languages' },
  { id: 'tool', label: 'Pick tools' }, { id: 'skillTool', label: 'Pick skills or tools' }, { id: 'expertise', label: 'Pick skills for Expertise' }, { id: 'feat', label: 'Pick feats' },
  { id: 'mastery', label: 'Pick weapons to master' }, { id: 'spell', label: 'Pick spells' }, { id: 'option', label: 'Pick options' },
]
const newChoice = (k: TraitChoice['kind']): TraitChoice => (k === 'spell' ? { kind: k, count: 1, spell: { level: 'Cantrip', how: 'atWill' } } : { kind: k, count: 1 })
function setSubChoice(i: number, k: number, n: number, c: TraitChoice | undefined) {
  const o = list.value[i].choice!.options![k], l = [...(o.choices ?? [])]
  if (c) l[n] = c; else l.splice(n, 1)
  const next: TraitOption = { ...o, choices: l }
  if (!l.length) delete next.choices
  setOption(i, k, next)
}
function setChoiceKind(i: number, kind: string) {
  if (!kind) return patch(i, { choice: undefined })
  const k = kind as TraitChoice['kind']
  patch(i, { choice: k === 'option' ? { kind: k, options: [{ id: newTraitId(), name: 'Option 1' }, { id: newTraitId(), name: 'Option 2' }] } : newChoice(k) })
}
const setChoice = (i: number, p: Partial<TraitChoice>) => patch(i, { choice: { ...list.value[i].choice!, ...p } })
const setOption = (i: number, k: number, o: TraitOption) => { const opts = [...(list.value[i].choice?.options ?? [])]; opts[k] = o; setChoice(i, { options: opts }) }
const openOption = ref<string | null>(null)
const addOption = (i: number) => {
  const id = newTraitId()
  setChoice(i, { options: [...(list.value[i].choice?.options ?? []), { id, name: `Option ${(list.value[i].choice?.options?.length ?? 0) + 1}` }] })
  openOption.value = id
}
const removeOption = (i: number, k: number) => {
  const o = list.value[i].choice?.options?.[k]
  if (o && confirm(`Remove the option “${o.name}”?`)) setChoice(i, { options: (list.value[i].choice?.options ?? []).filter((_, n) => n !== k) })
}
const optFilter = ref<Record<string, string>>({})
const shownOptions = (t: Trait) => {
  const q = (optFilter.value[t.id] ?? '').trim().toLowerCase(), all = (t.choice?.options ?? []).map((o, k) => ({ o, k }))
  return q ? all.filter(({ o }) => o.name.toLowerCase().includes(q) || (o.text ?? '').toLowerCase().includes(q)) : all
}
const optionName = (t: Trait, id?: string) => t.choice?.options?.find(o => o.id === id)?.name
const needsText = (t: Trait, o: TraitOption) => [o.needs?.level && `Lv ${o.needs.level}+`, o.needs?.option && optionName(t, o.needs.option)].filter(Boolean).join(', ')

// ---- spells cast with ----
type Cast = NonNullable<Trait['castWith']>
type Ab = NonNullable<Cast['among']>[number]
const castMode = (t: Trait) => (t.castWith?.sameAs != null ? 'same' : t.castWith ? 'pick' : '')
function setCastMode(i: number, mode: string) {
  const others = list.value.filter((_, k) => k !== i)
  patch(i, { castWith: mode === 'pick' ? { among: ['int', 'wis', 'cha'] } : mode === 'same' ? { sameAs: others[0]?.id ?? '' } : undefined })
}
function toggleCast(i: number, ab: Ab) {
  const s = new Set(list.value[i].castWith?.among ?? [])
  if (s.has(ab)) s.delete(ab); else s.add(ab)
  patch(i, { castWith: { among: ABILITY_KEYS.filter(a => s.has(a)) } })
}
function toggleList(i: number, id: string) {
  const l = new Set(list.value[i].spellLists ?? [])
  if (l.has(id)) l.delete(id); else l.add(id)
  patch(i, { spellLists: l.size ? [...l] : undefined })
}
const kindLabel = (c: TraitChoice) => choiceWords(c, c.count ?? 1)
</script>

<template>
  <div class="traits-input">
    <template v-for="sec in sections" :key="sec.level">
      <h4 v-if="grouped" class="trait-level-head">{{ levelWord }} {{ sec.level }}
        <button type="button" class="link-btn small" :title="`A new ${word} at ${levelWord.toLowerCase()} ${sec.level}`" @click="add(sec.level)">+ {{ forClass ? 'Feature' : 'Trait' }} here</button></h4>
      <p v-if="forClass && !sec.cards.length" class="muted small trait-gap">No feature yet: the other {{ className }} subclasses have one at this level.</p>
    <template v-for="{ i, pos } in sec.cards" :key="list[i].id">
      <details class="trait-card" :open="opened === list[i].id">
        <summary>
          <span v-if="forClass || lv(list[i]) > 1" class="lv-badge" :title="`Gained at ${levelWord.toLowerCase()} ${lv(list[i])}`">Lv {{ lv(list[i]) }}</span>
          <b>{{ list[i].name || `Unnamed ${word}` }}</b>
          <span v-if="list[i].replaces" class="chip">replaces {{ parentTraits?.find(p => p.id === list[i].replaces)?.name ?? 'a main race trait' }}</span>
          <TraitChips :t="list[i]" />
          <span v-if="list[i].choice" class="chip">choice: {{ list[i].choice!.kind === 'option' ? `${list[i].choice!.count ?? 1} of ${list[i].choice!.options?.length ?? 0} options` : `${list[i].choice!.count ?? 1} ${kindLabel(list[i].choice!)}` }}{{ list[i].choice!.steps?.length ? ', more by level' : '' }}</span>
        </summary>

        <!-- header: the level it comes at, its name, and moving, copying and removing it -->
        <div class="fhead">
          <label class="fhead-lv" :title="forClass ? `A character gets it when their ${levelWord.toLowerCase()} reaches this` : `From this ${levelWord.toLowerCase()} on`">{{ shortLevelWord }} <input type="number" min="1" max="20" :value="lv(list[i])" :aria-label="levelWord" @change="patch(i, { level: Number(val($event)) || 1 })" /></label>
          <input class="fhead-name" :value="list[i].name" :placeholder="`Name of the ${word}`" :aria-label="`Name of the ${word}`" @input="patch(i, { name: val($event) })" />
          <label v-if="parentTraits?.length" class="small" title="This trait takes the place of the main race's: characters of this subrace don't get that one">Replaces
            <Dropdown :value="list[i].replaces ?? ''" @change="patch(i, { replaces: val($event) || undefined })">
              <option value="">nothing (adds to them)</option>
              <option v-for="p in parentTraits" :key="p.id" :value="p.id">{{ p.name }}</option>
            </Dropdown></label>
          <span class="fhead-actions">
            <button type="button" class="link-btn" :disabled="!canMove(pos, -1)" :title="`Move up${grouped ? ' (within its level)' : ''}`" aria-label="Move up" @click="move(pos, -1)">↑</button>
            <button type="button" class="link-btn" :disabled="!canMove(pos, 1)" :title="`Move down${grouped ? ' (within its level)' : ''}`" aria-label="Move down" @click="move(pos, 1)">↓</button>
            <button type="button" class="link-btn" :title="`A copy of this ${word}, right after it`" :aria-label="`Copy this ${word}`" @click="duplicate(i)">⧉</button>
            <button type="button" class="link-btn danger" :title="`Remove this ${word}`" :aria-label="`Remove this ${word}`" @click="remove(i)">✕</button>
          </span>
        </div>

        <TraitOptionFields no-name :model-value="list[i]" :trait-level="lv(list[i])" :by-level="levelWord" @update:model-value="v => put(i, v as Trait)">
          <template #sections>
            <!-- the choice for the player -->
            <TraitSection v-if="list[i].choice" title="Player’s choice" :summary="choiceSummary(list[i])" @remove="dropPart(i, 'choice', 'the player’s choice')">
              <div class="trait-row">
                <Dropdown :value="list[i].choice!.kind" aria-label="What the player picks" @change="setChoiceKind(i, val($event))">
                  <option v-for="c in CHOICE_KINDS" :key="c.id" :value="c.id">{{ c.label }}</option>
                </Dropdown>
                <ChoiceFields :model-value="list[i].choice!" @update:model-value="v => patch(i, { choice: v })" />
              </div>
              <div v-if="list[i].choice!.kind === 'option'" class="trait-options-edit">
                <div class="trait-row">
                  <b class="small">{{ list[i].choice!.options?.length ?? 0 }} options</b>
                  <input v-if="(list[i].choice!.options?.length ?? 0) > 6" v-model="optFilter[list[i].id]" type="search" class="sp-filter" placeholder="Filter options…" aria-label="Filter the options" />
                </div>
                <details v-for="{ o, k } in shownOptions(list[i])" :key="o.id" class="trait-option-card" :open="openOption === o.id">
                  <summary><b>{{ o.name }}</b> <span v-if="needsText(list[i], o)" class="sp-prereq">{{ needsText(list[i], o) }}</span> <TraitChips :t="o" />
                    <span v-if="o.choices?.length" class="chip">+ {{ o.choices.length }} choice{{ o.choices.length > 1 ? 's' : '' }}</span></summary>
                  <TraitOptionFields :model-value="o" :trait-level="lv(list[i])" :siblings="list[i].choice!.options!.map(x => ({ id: x.id, name: x.name }))" :level-word="forClass ? levelWord : 'level'" :by-level="levelWord" @update:model-value="v => setOption(i, k, v)">
                    <template #add>
                      <button type="button" class="chip-btn" title="A choice the player makes once this option is picked (Pact of the Tome: cantrips)" @click="setSubChoice(i, k, (o.choices ?? []).length, newChoice('spell'))">+ Choice with this option</button>
                    </template>
                  </TraitOptionFields>
                  <div v-for="(c, n) in o.choices ?? []" :key="n" class="trait-row">
                    <span class="small muted">Comes with a choice:</span>
                    <Dropdown :value="c.kind" aria-label="What's picked" @change="setSubChoice(i, k, n, newChoice(val($event) as TraitChoice['kind']))">
                      <option v-for="ck in CHOICE_KINDS.filter(x => x.id !== 'option')" :key="ck.id" :value="ck.id">{{ ck.label }}</option>
                    </Dropdown>
                    <ChoiceFields with-label :model-value="c" @update:model-value="v => setSubChoice(i, k, n, v)" />
                    <button type="button" class="link-btn" title="Remove this choice" @click="setSubChoice(i, k, n, undefined)">×</button>
                  </div>
                  <div class="trait-row"><span class="spacer" /><button type="button" class="link-btn small danger" @click="removeOption(i, k)">Remove this option</button></div>
                </details>
                <p v-if="!shownOptions(list[i]).length" class="muted small">No option matches.</p>
                <button type="button" class="chip-btn" @click="addOption(i)">+ Option</button>
              </div>
            </TraitSection>

            <!-- limited uses, as a sentence, with what it comes to by level -->
            <TraitSection v-if="list[i].uses" title="Limited uses" :summary="usesLabel(list[i])" @remove="patch(i, { uses: undefined })">
              <div class="trait-row fuses">
                <Dropdown :value="countKind(list[i].uses!)" aria-label="How many" @change="setUse(i, { count: val($event) === 'n' ? 1 : val($event) as Uses['count'] })">
                  <option v-for="c in countKinds" :key="c.id" :value="c.id">{{ c.label }}</option>
                </Dropdown>
                <input v-if="typeof list[i].uses!.count === 'number'" type="number" min="1" class="fnum" :value="list[i].uses!.count" aria-label="Uses" @change="setUse(i, { count: Number(val($event)) || 1 })" />
                <template v-if="list[i].uses!.times || poolOpen.has(list[i].id)"><span title="A pool: this many times the count (Lay on Hands: 5 × level)">×</span><input type="number" min="1" class="fnum" :value="list[i].uses!.times ?? 2" aria-label="Times the count (a pool)" @change="setUse(i, { times: Number(val($event)) > 1 ? Number(val($event)) : undefined })" /></template>
                <span title="Added to the count (Healing Light: level + 1)">+</span><input type="number" min="0" class="fnum" :value="list[i].uses!.plus ?? 0" aria-label="Added to the count" @change="setUse(i, { plus: Number(val($event)) > 0 ? Number(val($event)) : undefined })" />
                <span>{{ usesWord(list[i]) }}, back on a</span>
                <Dropdown :value="list[i].uses!.recharge" aria-label="Back on" @change="setUse(i, { recharge: val($event) as 'short' | 'long' })">
                  <option value="short">short rest</option>
                  <option value="long">long rest</option>
                </Dropdown>
                <template v-if="list[i].uses!.recharge === 'long'"><span class="small muted">and</span><input type="number" min="0" class="fnum" :value="list[i].uses!.shortBack ?? 0" title="Given back on a short rest (Rage: 1)" aria-label="Given back on a short rest" @change="setUse(i, { shortBack: Number(val($event)) || undefined })" /><span class="small muted">back on a short rest</span></template>
              </div>
              <div class="trait-row">
                <button v-if="!list[i].uses!.times && !poolOpen.has(list[i].id)" type="button" class="chip-btn" title="A pool of points spent a few at a time (Lay on Hands: 5 × level)" @click="openPool(i)">Pool ×…</button>
                <button v-if="!list[i].uses!.steps?.length && !stepsOpen.has(list[i].id)" type="button" class="chip-btn" title="A different number at some levels (Rage: 2, 3 at level 3, 4 at level 6…)" @click="stepsOpen.add(list[i].id)">Changes by level…</button>
              </div>
              <StepsInput v-if="list[i].uses!.steps?.length || stepsOpen.has(list[i].id)" numeric label="Uses" :model-value="list[i].uses!.steps" @update:model-value="v => setUse(i, { steps: v as [number, number][] | undefined })" />
              <p v-if="!list[i].uses!.steps?.length || list[i].uses!.times || list[i].uses!.plus" class="fpreview">On the sheet: {{ usesPreview(list[i]) }}</p>
            </TraitSection>

            <!-- a value that grows with the level -->
            <TraitSection v-if="list[i].scale" title="Scaling value" :summary="scaleSummary(list[i])" @remove="dropPart(i, 'scale', 'the scaling value')">
              <div class="trait-row">
                <label class="small">Called <input class="steps-label" :value="list[i].scale!.label" placeholder="e.g. Sneak Attack" @change="setScale(i, val($event) || list[i].scale!.label, list[i].scale!.steps)" /></label>
              </div>
              <StepsInput :label="list[i].scale!.label" placeholder="+2 or 1d6" :model-value="list[i].scale!.steps" @update:model-value="v => setScale(i, list[i].scale!.label, v as [number, string][] | undefined)" />
            </TraitSection>

            <!-- switched on and off in play -->
            <TraitSection v-if="list[i].toggle" title="On/off switch" summary="switched on and off in play; its effects count only while it’s on (Rage)" @remove="patch(i, { toggle: undefined })" />

            <!-- listed on the sheet -->
            <TraitSection v-if="list[i].onSheet" title="On the sheet" :summary="list[i].onSheet === 'show' ? 'always listed in play' : 'never listed in play'" @remove="patch(i, { onSheet: undefined })">
              <div class="trait-row">
                <Dropdown :value="list[i].onSheet" aria-label="Listed on the sheet" @change="patch(i, { onSheet: val($event) as Trait['onSheet'] })">
                  <option value="show">always listed in play</option><option value="hide">never listed in play</option>
                </Dropdown>
                <span class="small muted">Without this, it's listed when there's something to use or read there.</span>
              </div>
            </TraitSection>

            <!-- the ability its spells are cast with -->
            <TraitSection v-if="list[i].castWith" title="Casting ability" :summary="castSummary(list[i])" @remove="patch(i, { castWith: undefined })">
              <div class="trait-row">
                <Dropdown :value="castMode(list[i])" aria-label="Its spells are cast with" title="The ability its spells (and its picked option's) are cast with, where a spell doesn't name one" @change="setCastMode(i, val($event))">
                  <option value="pick">the player's pick</option><option value="same">the same as another {{ word }}</option>
                </Dropdown>
                <div v-if="castMode(list[i]) === 'pick'" class="seg wrap">
                  <button v-for="ab in ABILITY_KEYS" :key="ab" type="button" :class="{ on: list[i].castWith?.among?.includes(ab) }" @click="toggleCast(i, ab)">{{ ABILITY_NAME[ab] }}</button>
                </div>
                <Dropdown v-else-if="castMode(list[i]) === 'same'" :value="list[i].castWith?.sameAs" aria-label="As which" @change="patch(i, { castWith: { sameAs: val($event) } })">
                  <option v-for="o in list.filter(x => x.id !== list[i].id)" :key="o.id" :value="o.id">{{ o.name }}</option>
                </Dropdown>
              </div>
            </TraitSection>

            <!-- more spell lists for its class (Magical Secrets) -->
            <TraitSection v-if="list[i].spellLists?.length || listsOpen.has(list[i].id)" title="Extra spell lists" :summary="(list[i].spellLists ?? []).join(', ') || 'none picked yet'" @remove="listsOpen.delete(list[i].id); patch(i, { spellLists: undefined })">
              <p class="small muted">Its class can also take spells from these lists (Magical Secrets).</p>
              <div class="seg wrap">
                <button v-for="o in listOptions('class')" :key="o.id" type="button" :class="{ on: list[i].spellLists?.includes(o.id) }" @click="toggleList(i, o.id)">{{ o.label }}</button>
              </div>
            </TraitSection>
          </template>

          <template #add>
            <button v-if="!list[i].choice" type="button" class="chip-btn" title="The player picks skills, a language, feats, spells or one of several options" @click="setChoiceKind(i, 'skill')">+ Player’s choice</button>
            <button v-if="!list[i].uses" type="button" class="chip-btn" title="Used a number of times, back on a rest" @click="setUses(i, true)">+ Limited uses</button>
            <button v-if="!list[i].scale" type="button" class="chip-btn" title="A value that grows with the level (Rage Damage, Sneak Attack)" @click="setScale(i, 'Value', undefined)">+ Scaling value</button>
            <button v-if="!list[i].toggle" type="button" class="chip-btn" title="Switched on and off in play (Rage): its effects only count while it's on" @click="patch(i, { toggle: true })">+ On/off switch</button>
            <button v-if="!list[i].onSheet" type="button" class="chip-btn" title="Listed on the sheet always, or never (by default: when there's something to use or read there)" @click="patch(i, { onSheet: 'show' })">+ On the sheet</button>
            <button v-if="!list[i].castWith && hasSpells(list[i])" type="button" class="chip-btn" title="The ability its spells are cast with: the player's pick, or as another feature" @click="setCastMode(i, 'pick')">+ Casting ability</button>
            <button v-if="forClass && !list[i].spellLists?.length && !listsOpen.has(list[i].id)" type="button" class="chip-btn" title="Its class can also take spells from other lists (Magical Secrets)" @click="listsOpen.add(list[i].id)">+ Extra spell lists</button>
          </template>
        </TraitOptionFields>
      </details>
    </template>
    </template>
    <button v-if="entryType === 'feat' && !list.length && entryName" type="button" class="chip-btn primary" title="A feature named like the feat, coming with it: add its effects, choices and spells" @click="startFromCard">Start from the card</button>
    <button type="button" class="chip-btn" @click="add()">+ {{ word === 'feature' ? 'Feature' : 'Trait' }}</button>
  </div>
</template>
