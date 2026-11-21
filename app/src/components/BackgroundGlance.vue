<script setup lang="ts">
// A background's page, main column: what it gives at a glance (ability scores, Origin feat with its version, skills,
// tools — all, or one to pick — and starting equipment, items linked where the world has them), its Origin feat in
// full, and the characters who have it.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { entries, formatMoney, get } from '../store'
import { abilityBonusText } from '../abilityBonus'
import { itemNamed } from '../lookup'
import EntryLink from './EntryLink.vue'
import FeatCard from './FeatCard.vue'

const props = defineProps<{ e: Entry }>()
const f = computed(() => props.e.fields)
const feat = computed(() => get(f.value.originFeat))
const tools = computed(() => (f.value.toolProfs ?? []).filter(Boolean))
/** Equipment lines, a name matched to the world's item where it has one. */
const kit = computed(() => (f.value.equipment?.items ?? []).map(l => ({ amount: l.amount ?? 1, id: l.item ?? (l.name ? itemNamed(l.name)?.id : undefined), name: l.name })))
const people = computed(() => entries.value.filter(x => (x.type === 'pc' || x.type === 'npc') && x.fields.background === props.e.id).sort((a, b) => a.name.localeCompare(b.name)))
</script>

<template>
  <section class="race-glance bg-glance">
    <dl>
      <template v-if="f.abilityIncrease"><dt>Ability scores</dt><dd>{{ abilityBonusText(f.abilityIncrease) }}</dd></template>
      <template v-if="feat"><dt>Origin feat</dt><dd><EntryLink :id="feat.id" /><template v-if="f.originFeatNote"> ({{ f.originFeatNote }})</template></dd></template>
      <template v-if="f.skillProfs?.length"><dt>Skills</dt><dd>{{ f.skillProfs.join(', ') }}</dd></template>
      <template v-if="tools.length"><dt>Tools</dt><dd><template v-if="tools.length > 1">{{ f.toolsAll ? 'all of: ' : 'one of: ' }}</template><template v-for="(t, i) in tools" :key="t"><template v-if="i">, </template><EntryLink :id="t" /></template></dd></template>
      <template v-if="kit.length || f.equipment?.money || f.equipment?.instead"><dt>Equipment</dt><dd>
        <template v-for="(l, i) in kit" :key="i"><template v-if="i">, </template><template v-if="l.amount > 1">{{ l.amount }} × </template><EntryLink v-if="l.id" :id="l.id" /><template v-else>{{ l.name }}</template></template>
        <template v-if="f.equipment?.money">{{ kit.length ? ' and ' : '' }}{{ formatMoney(f.equipment.money) }}</template>
        <template v-if="f.equipment?.instead">; or {{ formatMoney(f.equipment.instead) }} instead</template></dd></template>
    </dl>
  </section>
  <section v-if="feat" class="bg-feat-full">
    <h2>Origin feat: <EntryLink :id="feat.id" /></h2>
    <FeatCard :e="feat" />
  </section>
  <section v-if="people.length" class="bg-people">
    <h2>{{ e.name }} characters</h2>
    <table class="mini"><tbody><tr v-for="n in people" :key="n.id"><td><EntryLink :id="n.id" icon /></td></tr></tbody></table>
  </section>
</template>
