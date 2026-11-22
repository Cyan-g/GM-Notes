<script setup lang="ts">
// The wizard's class step: the class and level (a class without rules: its hit die), and the class's page for its
// lore, table and features. The subclass is a step of its own (WzSubclassStep).
import Dropdown from '../Dropdown.vue'
import { dieOfDraft, rules, wizard } from '../../wizard'
import { DICE } from '../../model/classes'
import { ABILITY_SHORT } from '../../model/dnd'
import { useDraft } from '../../composables/useDraft'
import { inputNumber as num, inputValue as val } from '../../dom'
import WizardPage from '../WizardPage.vue'

const { d, r, classes, classPage } = useDraft()
function setClass(cls: string) {
  Object.assign(wizard.d, { cls, subclass: undefined, skills: [], tools: [], cantrips: [], spells: [], book: [], classKit: 0 })
}
</script>

<template>
  <div class="wz-tiles">
    <button v-for="c in classes" :key="c.id" type="button" class="wz-tile" :class="{ on: d.cls === c.id }" @click="setClass(c.id)">
      <b>{{ c.label }}</b><small class="muted">{{ rules({ ...d, cls: c.id }) ? `${dieOfDraft({ ...d, cls: c.id, die: undefined })} · ${rules({ ...d, cls: c.id })!.saves.map(a => ABILITY_SHORT[a]).join(' ')}` : 'filled in by hand' }}</small>
    </button>
  </div>
  <div class="wz-row">
    <label>Level <input type="number" min="1" max="20" :value="d.level" @change="wizard.d.level = Math.min(20, Math.max(1, num($event) || 1))" /></label>
    <label v-if="d.cls && !r">Hit die
      <Dropdown :value="dieOfDraft(d)" @change="wizard.d.die = val($event)"><option v-for="x in DICE" :key="x" :value="x">{{ x }}</option></Dropdown>
    </label>
  </div>
  <!-- the class's page, for its lore, table and features -->
  <WizardPage v-if="classPage" :e="classPage" :title="`About the ${classPage.name}`" />
</template>
