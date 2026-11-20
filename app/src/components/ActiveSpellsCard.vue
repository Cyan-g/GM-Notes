<script setup lang="ts">
// On the play sheet, beside hit points and uses: the spells switched on in the Spellbook (Bless, Shield of Faith),
// each with what it does while active and ✕ to end it. The sheet's numbers count them; a long rest ends them all.
import { computed } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { editSheet } from '../sheet'
import { state } from '../store'
import { activeEffectsOf, activeSpells, toggleActive } from '../spells'
import { describeEffects } from '../gear'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const ro = computed(() => !!state.readOnly)
const list = computed(() => activeSpells(props.s))
const end = (id: string) => { if (!ro.value) editSheet(props.pc, x => toggleActive(x, id)) }
</script>

<template>
  <div v-if="list.length" class="cs-hp cs-active">
    <span class="cs-label">Active spells</span>
    <div v-for="e in list" :key="e.id" class="cs-active-row">
      <b><EntryLink :id="e.id" /></b>
      <span class="muted small">{{ describeEffects(activeEffectsOf(e)).join(' · ') }}</span>
      <button class="link-btn" :disabled="ro" title="End it" @click="end(e.id)">✕</button>
    </div>
  </div>
</template>
