<script setup lang="ts">
// On the play sheet, beside hit points and uses: the spells switched on in the Spellbook (Bless, Shield of Faith) and
// the features switched on in the features list (Rage), each with what it does and ✕ to end it. The sheet's numbers
// count them; a long rest ends them all.
import { computed } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { editSheet } from '../sheet'
import { state } from '../store'
import { activeEffectsOf, activeSpells, toggleActive } from '../spells'
import { describeEffects } from '../gear'
import { isOn, speciesTraits, toggleOn, withScale } from '../species'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const ro = computed(() => !!state.readOnly)
const list = computed(() => activeSpells(props.s))
const features = computed(() => speciesTraits(props.pc, props.s).filter(a => a.active && a.trait.toggle && isOn(a, props.s)))
const endFeature = (key: string) => { if (!ro.value) editSheet(props.pc, x => toggleOn(x, key)) }
const end = (id: string) => { if (!ro.value) editSheet(props.pc, x => toggleActive(x, id)) }
</script>

<template>
  <div v-if="list.length || features.length" class="cs-hp cs-active">
    <span class="cs-label">Active</span>
    <div v-for="a in features" :key="a.key" class="cs-active-row">
      <b>{{ a.trait.name }}</b>
      <span class="muted small">{{ describeEffects((a.trait.effects ?? []).map(f => withScale(f, a))).join(' · ') }}</span>
      <button class="link-btn" :disabled="ro" title="End it" @click="endFeature(a.key)">✕</button>
    </div>
    <div v-for="e in list" :key="e.id" class="cs-active-row">
      <b><EntryLink :id="e.id" /></b>
      <span class="muted small">{{ describeEffects(activeEffectsOf(e)).join(' · ') }}</span>
      <button class="link-btn" :disabled="ro" title="End it" @click="end(e.id)">✕</button>
    </div>
  </div>
</template>
