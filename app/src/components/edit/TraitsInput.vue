<script setup lang="ts">
// The features of a class or subclass (and the traits of a race, background, feat or item) on its Edit page: one card
// each, a class's grouped under its levels, with a level's "+ Feature here". Folded, a card shows its level, name and
// what it does in chips; opened, it's a TraitCard. This component keeps the list: adding, ordering (a class's within its
// level), copying and removing features.
import { computed, ref } from 'vue'
import type { Trait } from '../../model/types'
import { newTraitId } from '../../species'
import { choiceSummary } from '../../traitEditing'
import TraitCard from './TraitCard.vue'
import TraitChips from '../TraitChips.vue'

const model = defineModel<Trait[] | undefined>()
const props = defineProps<{ /** The entry's type: a class's or subclass's features are grouped by level. */ entryType?: string; /** Its class, for "Warlock level". */ className?: string; /** A subclass's levels to expect features at (its class's other subclasses'): shown even while empty. */ expectedLevels?: number[]; /** A subrace's: its main races' traits, one of which a trait may replace. */ parentTraits?: { id: string; name: string }[]; /** The entry's name: a feat's feature starts with it. */ entryName?: string }>()
const forClass = computed(() => props.entryType === 'class' || props.entryType === 'subclass')
const word = computed(() => (forClass.value || props.entryType === 'feat' ? 'feature' : 'trait'))
const levelWord = computed(() => (forClass.value && props.className ? `${props.className} level` : forClass.value ? 'Level' : 'Character level'))
/** "Warlock lv" in a card's header ("Lv" for a race's or background's trait). */
const shortLevelWord = computed(() => (forClass.value && props.className ? `${props.className} lv` : 'Lv'))
const list = computed(() => model.value ?? [])
/** Grouped under level headings: a class's features always, other traits once some come after level 1. */
const grouped = computed(() => forClass.value || list.value.some(t => (t.level ?? 1) > 1))
const save = (l: Trait[]) => { model.value = l.length ? l : undefined }
function put(i: number, t: Trait) { const l = [...list.value]; l[i] = t; save(l) }
const lv = (t: Trait) => t.level ?? 1

// ---- order and grouping ----
/** The cards in order: a class's by level (then as listed), anything else as listed. */
const order = computed(() => list.value.map((_, i) => i).sort((a, b) => (grouped.value ? lv(list.value[a]) - lv(list.value[b]) : 0) || a - b))
/** The cards by level (a class's), with the expected levels that have none yet; one group for anything else. */
const sections = computed(() => {
  const all = order.value.map((i, pos) => ({ i, pos }))
  if (!grouped.value) return [{ level: 0, cards: all }]
  const levels = new Set([...all.map(c => lv(list.value[c.i])), ...(props.expectedLevels ?? [])])
  return [...levels].sort((a, b) => a - b).map(level => ({ level, cards: all.filter(c => lv(list.value[c.i]) === level) }))
})
/** Up and down among the cards as shown: a class's only within its level (the level sets its place). */
const canMove = (pos: number, by: number) => { const j = pos + by; return j >= 0 && j < order.value.length && (!grouped.value || lv(list.value[order.value[j]]) === lv(list.value[order.value[pos]])) }
function move(pos: number, by: number) {
  if (!canMove(pos, by)) return
  const l = [...list.value], a = order.value[pos], b = order.value[pos + by]
  ;[l[a], l[b]] = [l[b], l[a]]
  save(l)
}

// ---- adding, copying, removing ----
const opened = ref<string | null>(null)
/** A new feature at a level (by default the last one's). */
function add(at?: number) {
  const id = newTraitId(), level = at ?? (forClass.value && order.value.length ? lv(list.value[order.value.at(-1)!]) : 1)
  save([...list.value, { id, name: forClass.value ? 'New feature' : 'New trait', ...(level > 1 ? { level } : {}) }])
  opened.value = id
}
/** A feat's first feature: named like the feat (its effects and choices are added to it). */
function startFromCard() { const id = newTraitId(); save([{ id, name: props.entryName! }]); opened.value = id }
/** A copy of a feature right after it (a new id, so characters' picks and uses stay with the original). */
function duplicate(i: number) {
  const t = list.value[i], id = newTraitId(), l = [...list.value]
  l.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(t)), id, name: `${t.name} (copy)` })
  save(l)
  opened.value = id
}
function remove(i: number) { if (confirm(`Remove the ${word.value} “${list.value[i].name}”? Characters lose its choices and uses.`)) save(list.value.filter((_, k) => k !== i)) }
/** The other features, for "cast like another feature". */
const othersOf = (i: number) => list.value.filter((_, k) => k !== i).map(x => ({ id: x.id, name: x.name }))
</script>

<template>
  <div class="traits-input">
    <template v-for="sec in sections" :key="sec.level">
      <h4 v-if="grouped" class="trait-level-head">{{ levelWord }} {{ sec.level }}
        <button type="button" class="link-btn small" :title="`A new ${word} at ${levelWord.toLowerCase()} ${sec.level}`" @click="add(sec.level)">+ {{ forClass ? 'Feature' : 'Trait' }} here</button></h4>
      <p v-if="forClass && !sec.cards.length" class="muted small trait-gap">No feature yet: the other {{ className }} subclasses have one at this level.</p>
      <details v-for="{ i, pos } in sec.cards" :key="list[i].id" class="trait-card" :open="opened === list[i].id">
        <summary>
          <span v-if="forClass || lv(list[i]) > 1" class="lv-badge" :title="`Gained at ${levelWord.toLowerCase()} ${lv(list[i])}`">Lv {{ lv(list[i]) }}</span>
          <b>{{ list[i].name || `Unnamed ${word}` }}</b>
          <span v-if="list[i].replaces" class="chip">replaces {{ parentTraits?.find(p => p.id === list[i].replaces)?.name ?? 'a main race trait' }}</span>
          <TraitChips :t="list[i]" />
          <span v-if="list[i].choice" class="chip">choice: {{ choiceSummary(list[i].choice!) }}{{ list[i].choice!.steps?.length ? ', more by level' : '' }}</span>
        </summary>
        <TraitCard :trait="list[i]" :level-word="levelWord" :short-level-word="shortLevelWord" :word="word" :for-class="forClass" :grouped="grouped"
          :can-up="canMove(pos, -1)" :can-down="canMove(pos, 1)" :parent-traits="parentTraits" :others="othersOf(i)"
          @update="t => put(i, t)" @up="move(pos, -1)" @down="move(pos, 1)" @copy="duplicate(i)" @remove="remove(i)" />
      </details>
    </template>
    <button v-if="entryType === 'feat' && !list.length && entryName" type="button" class="chip-btn primary" title="A feature named like the feat, coming with it: add its effects, choices and spells" @click="startFromCard">Start from the card</button>
    <button type="button" class="chip-btn" @click="add()">+ {{ word === 'feature' ? 'Feature' : 'Trait' }}</button>
  </div>
</template>
