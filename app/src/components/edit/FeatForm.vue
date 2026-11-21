<script setup lang="ts">
// A feat's Edit form: what it is on top; what it gives on the left, what it takes to get it on the right.
import type { Entry } from '../../model/types'
import { TYPES } from '../../model/schema'
import { toggleField } from '../../edit'
import FieldInput from './FieldInput.vue'
import FeatPrereqs from './FeatPrereqs.vue'

defineProps<{ entry: Entry }>()
/** A field's definition by its key. */
const fieldOf = (k: string) => TYPES.feat.fields.find(f => f.key === k)
</script>

<template>
  <div class="feat-form">
    <div class="ff-top">
      <label v-for="k in ['category', 'source']" :key="k" class="sheet-field"><span>{{ fieldOf(k)!.label }}</span><FieldInput :id="`f-${k}`" :def="fieldOf(k)!" :entry="entry" /></label>
    </div>
    <div class="ff-col ff-gives">
      <h4>What it gives</h4>
      <div class="sheet-field"><span>Ability score increase</span><FieldInput :def="fieldOf('abilityIncrease')!" :entry="entry" /></div>
      <p class="muted small">Its effects, choices and spells: <b>Features</b>, below the card.</p>
    </div>
    <div class="ff-col ff-needs">
      <h4>What it needs</h4>
      <FeatPrereqs :e="entry" />
      <label class="fp-switch ff-repeat" title="It can be taken more than once (another version each time, where its text says so)"><input type="checkbox" :checked="!!entry.fields.repeatable" @change="toggleField(entry, 'repeatable')" /> Can be taken more than once (repeatable)</label>
    </div>
  </div>
</template>
