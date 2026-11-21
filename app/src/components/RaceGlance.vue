<script setup lang="ts">
// At the top of a race's page: what a character of it is at a glance (size, creature type, speeds, senses,
// languages, ability score increase, traits and lineages), a subrace's values filled in from its main race, and
// "Copy as new race" for a DM to start a homebrew one from it.
import { computed } from 'vue'
import type { Entry, Speeds } from '../model/types'
import { fieldLabel, playerMode, state } from '../store'
import { TYPES } from '../model/schema'
import { abilityBonusText } from '../abilityBonus'
import { parentRaces } from '../species'
import { traitsOf } from '../model/traits'
import { changed, createEntry } from '../edit'
import { go, hrefEntry } from '../router'
import EntryLink from './EntryLink.vue'

/** `noActions`: shown somewhere it's only read (the character wizard), without "Copy as new race". */
const props = defineProps<{ e: Entry; noActions?: boolean }>()
const chain = computed(() => [props.e, ...parentRaces(props.e)])
/** The traits a character of this race has: the main races' except those a subrace replaces. */
const replaced = computed(() => new Set(chain.value.flatMap(x => traitsOf(x).map(t => t.replaces).filter(Boolean)) as string[]))
const allTraits = computed(() => chain.value.flatMap(x => traitsOf(x).filter(t => x === props.e || !replaced.value.has(t.id))))
/** A field from the race, else the nearest main race that has it, with where it came from. */
function pick<T>(get: (x: Entry) => T | undefined): { v: T; from?: Entry } | undefined {
  for (const x of chain.value) { const v = get(x); if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) return { v, from: x === props.e ? undefined : x } }
  return undefined
}
const def = (k: string) => TYPES.race.fields.find(f => f.key === k)
const size = computed(() => pick(x => x.fields.size ? [fieldLabel(def('size'), x.fields.size), ...((x.fields.otherSizes as string[] | undefined) ?? []).map(s => fieldLabel(def('size'), s))].join(' or ') : undefined))
const type = computed(() => pick(x => x.fields.creatureType as string | undefined))
const speeds = computed(() => {
  const all: Speeds = {}
  for (const x of [...chain.value].reverse()) Object.assign(all, Object.fromEntries(Object.entries(x.fields.speeds ?? {}).filter(([, v]) => v != null && v !== '')))
  const parts = [all.walk != null && `${all.walk} ft`, ...(['swim', 'fly', 'climb', 'burrow'] as const).filter(k => all[k]).map(k => `${k} ${all[k]} ft${k === 'fly' && all.hover ? ' (hover)' : ''}`), all.note].filter(Boolean)
  return parts.join(', ')
})
/** Senses its traits give (Darkvision 60 ft), the longest of each. */
const senses = computed(() => {
  const best = new Map<string, number>()
  for (const t of allTraits.value) for (const f of t.effects ?? []) if (f.on === 'sense') { const k = f.sense ?? 'Darkvision'; best.set(k, Math.max(best.get(k) ?? 0, Number(f.value) || 0)) }
  return [...best].map(([k, v]) => `${k} ${v} ft`).join(', ')
})
/** Its languages and how many more the player picks: "Common, Elvish, 1 more of your choice". */
const languages = computed(() => pick(x => {
  const l = (x.fields.languages as string[] | undefined) ?? [], n = Number(x.fields.languageChoices) || 0
  return l.length || n ? [l.length ? fieldLabel(def('languages'), l) : '', n ? `${n} more of your choice` : ''].filter(Boolean).join(', ') : undefined
}))
const bonus = computed(() => pick(x => (x.fields.abilityIncrease ? abilityBonusText(x.fields.abilityIncrease) : undefined)))
const traitCount = computed(() => allTraits.value.length)
const lineages = computed(() => allTraits.value.filter(t => t.choice?.kind === 'option' && (t.choice.count ?? 1) === 1).map(t => `${t.name} (${t.choice!.options?.length ?? 0})`))
const canEdit = computed(() => !state.readOnly && !playerMode.value)
function copy() {
  const n = createEntry('race', `${props.e.name} (copy)`, JSON.parse(JSON.stringify(props.e.fields)))
  n.body = String(props.e.body ?? '').replace(/\s*\*Source: System Reference Document[^*]*\*\s*$/i, '').trim()
  changed(n)
  go(hrefEntry(n.id) + '/edit')
}
</script>

<template>
  <section class="race-glance">
    <dl>
      <template v-if="e.fields.parent"><dt>Subrace of</dt><dd><EntryLink :id="String(e.fields.parent)" /></dd></template>
      <template v-if="size"><dt>Size</dt><dd>{{ size.v }} <small v-if="size.from" class="muted">from {{ size.from.name }}</small></dd></template>
      <template v-if="type"><dt>Type</dt><dd>{{ type.v }} <small v-if="type.from" class="muted">from {{ type.from.name }}</small></dd></template>
      <template v-if="speeds"><dt>Speed</dt><dd>{{ speeds }}</dd></template>
      <template v-if="senses"><dt>Senses</dt><dd>{{ senses }}</dd></template>
      <template v-if="languages"><dt>Languages</dt><dd>{{ languages.v }} <small v-if="languages.from" class="muted">from {{ languages.from.name }}</small></dd></template>
      <template v-if="bonus"><dt>Ability scores</dt><dd>{{ bonus.v }} <small v-if="bonus.from" class="muted">from {{ bonus.from.name }}</small></dd></template>
      <dt>Traits</dt><dd>{{ traitCount }}<template v-if="lineages.length"> · choose: {{ lineages.join(', ') }}</template></dd>
    </dl>
    <button v-if="canEdit && !noActions" type="button" class="chip-btn" title="A new race with the same fields, traits and text, to make your own from" @click="copy">Copy as new race</button>
  </section>
</template>
