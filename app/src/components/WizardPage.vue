<script setup lang="ts">
// The full page of what's picked in the character wizard, under the choices: a class's or species' lore text and
// its facts (the class table, the species' size and speed) and features or traits, as on its own page. Each part
// folds; what's folded stays folded on the next class (remembered on this computer).
import { pickOrigin } from '../wizard'
import { computed, ref } from 'vue'
import type { Entry } from '../model/types'
import { classLabel } from '../classRules'
import { traitsOf } from '../model/traits'
import { formatMoney, get } from '../store'
import { abilityBonusText } from '../abilityBonus'
import MarkdownView from './MarkdownView.vue'
import ClassOverview from './ClassOverview.vue'
import RaceGlance from './RaceGlance.vue'
import TraitList from './TraitList.vue'

/** `level`: a class's or subclass's features up to it come first, as a line ("At level 3: …"). */
const props = defineProps<{ e: Entry; title?: string; level?: number; /** In a pop-up: no heading of its own. */ bare?: boolean }>()
const traits = computed(() => traitsOf(props.e))
// a description that's only the source line ("Source: System Reference Document 5.2.1") isn't one
const hasLore = computed(() => !!props.e.body.trim() && !/^\*?\s*source:[^\n]*\*?$/i.test(props.e.body.trim()))
/** A subrace's main race's traits it keeps. */
const inherited = computed(() => {
  const p = props.e.type === 'race' ? get(props.e.fields.parent as string | undefined) : undefined
  if (!p) return []
  const replaced = new Set(traits.value.map(t => t.replaces).filter(Boolean))
  return traitsOf(p).filter(t => !replaced.has(t.id))
})
const parentName = computed(() => get(props.e.fields.parent as string | undefined)?.name ?? '')
/** A background's equipment in words: the items and coins, or the coins instead. */
const equipmentText = computed(() => {
  const eq = props.e.fields.equipment
  if (!eq) return ''
  const items = (eq.items ?? []).map(l => `${l.amount && l.amount > 1 ? l.amount + ' × ' : ''}${l.item ? get(l.item)?.name ?? l.name ?? l.item : l.name ?? (l.among?.length ? 'one of ' + l.among.map(id => get(id)?.name ?? id).join(', ') : '?')}`).join(', ')
  return [items && `${items}${eq.money ? ` and ${formatMoney(eq.money)}` : ''}`, eq.instead && `or ${formatMoney(eq.instead)}`].filter(Boolean).join(' ')
})
const isClass = computed(() => props.e.type === 'class' || props.e.type === 'subclass')
/** A class's or subclass's features up to the chosen level, and the next one after it. */
const upTo = computed(() => (isClass.value && props.level ? traits.value.filter(t => (t.level ?? 1) <= props.level!) : []))
const next = computed(() => (isClass.value && props.level ? traits.value.filter(t => (t.level ?? 1) > props.level!).sort((a, b) => (a.level ?? 1) - (b.level ?? 1))[0] : undefined))
const KEY = 'gm-notes:wizard-folded'
const folded = ref<string[]>((() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } })())
/** Whether a part (lore, table, features) is open; folding it remembers that for every page. */
const isOpen = (part: string) => !folded.value.includes(part)
function toggled(part: string, ev: Event) {
  const open = (ev.target as HTMLDetailsElement).open
  if (open === isOpen(part)) return
  folded.value = open ? folded.value.filter(x => x !== part) : [...folded.value, part]
  try { localStorage.setItem(KEY, JSON.stringify(folded.value)) } catch { /* just for now */ }
}
</script>

<template>
  <section class="wz-page">
    <h3 v-if="!bare" class="wz-page-head">{{ title ?? e.name }}</h3>
    <p v-if="upTo.length || next" class="wz-at-level small">
      <b>At level {{ level }}:</b>
      <span v-for="t in upTo" :key="t.id" class="chip" :title="(t.text ?? '').slice(0, 300)">{{ t.name }}</span>
      <span v-if="!upTo.length" class="muted">nothing yet</span>
      <span v-if="next" class="muted"> · next: {{ next.name }} ({{ next.level }})</span>
    </p>
    <!-- a background's facts: the abilities its increase goes to, skills, tool, Origin feat, equipment -->
    <dl v-if="e.type === 'background'" class="facts wz-bg-facts small">
      <template v-if="e.fields.abilityIncrease"><dt>Ability scores</dt><dd>{{ abilityBonusText(e.fields.abilityIncrease) }}</dd></template>
      <template v-if="e.fields.skillProfs?.length"><dt>Skills</dt><dd>{{ e.fields.skillProfs.join(', ') }}</dd></template>
      <template v-if="e.fields.toolProfs?.length"><dt>Tool</dt><dd>{{ e.fields.toolProfs.map(t => get(t)?.name ?? t).join(', ') }}</dd></template>
      <template v-if="e.fields.originFeat && !pickOrigin()"><dt>Origin feat</dt><dd>{{ get(e.fields.originFeat)?.name ?? e.fields.originFeat }}</dd></template>
      <template v-if="e.fields.equipment"><dt>Equipment</dt><dd>{{ equipmentText }}</dd></template>
    </dl>
    <details v-if="hasLore" class="wz-fold" :open="isOpen('lore')" @toggle="toggled('lore', $event)">
      <summary>{{ e.type === 'race' ? 'About them' : 'Description' }}</summary>
      <MarkdownView :source="e.body" />
    </details>
    <details v-if="e.type === 'class'" class="wz-fold" :open="isOpen('table')" @toggle="toggled('table', $event)">
      <summary>Class table</summary>
      <ClassOverview :e="e" />
    </details>
    <RaceGlance v-else-if="e.type === 'race'" :e="e" no-actions />
    <details v-if="traits.length" class="wz-fold" :open="isOpen('features')" @toggle="toggled('features', $event)">
      <summary>{{ isClass ? 'Features' : 'Traits' }} <span class="muted small">{{ traits.length }}</span></summary>
      <TraitList :traits="traits" :by-level="isClass ? classLabel(e) : undefined" :lineage="e.type === 'race' && e.fields.parent ? e.name : undefined" />
    </details>
    <!-- a subrace also has its main race's traits (but those it replaces): named, they're on that race's page -->
    <p v-if="inherited.length" class="small wz-inherited"><b>Also from {{ parentName }}:</b>{{ ' ' }}<span v-for="t in inherited" :key="t.id" class="chip" :title="(t.text ?? '').slice(0, 300)">{{ t.name }}</span></p>
  </section>
</template>
