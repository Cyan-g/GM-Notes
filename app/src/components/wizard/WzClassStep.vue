<script setup lang="ts">
// The wizard's class step: the classes as a list (hit die and saves beside each), the level above it, and the class
// looked at beside the list: what it gives up to the chosen level first, then its description, table and features.
// The subclass is a step of its own (WzSubclassStep).
import Dropdown from '../Dropdown.vue'
import { computed } from 'vue'
import { dieOfDraft, rules, wizard } from '../../wizard'
import { classEntry } from '../../classRules'
import { DICE } from '../../model/classes'
import { ABILITY_SHORT } from '../../model/dnd'
import { useDraft } from '../../composables/useDraft'
import { inputNumber as num, inputValue as val } from '../../dom'
import WizardPage from '../WizardPage.vue'
import WzChooser, { type ChooserItem } from './WzChooser.vue'

const { d, r, classes } = useDraft()
// the world's classes first; one it has no page for (a class made by hand) after them, in a group of its own
const items = computed<ChooserItem[]>(() => classes.value.map(c => {
  const cr = rules({ ...d.value, cls: c.id }), page = classEntry(c.id)
  return { id: c.id, label: c.label, hint: cr ? `${dieOfDraft({ ...d.value, cls: c.id, die: undefined })} · ${cr.saves.map(a => ABILITY_SHORT[a]).join(' ')}` : 'by hand', ...(page ? {} : { group: 'Not in this world: by hand' }) }
}).sort((a, b) => Number(!!a.group) - Number(!!b.group)))
/** Another class: what was picked for the old one goes. */
function setClass(cls: string) {
  if (cls === d.value.cls) return
  Object.assign(wizard.d, { cls, subclass: undefined, skills: [], tools: [], cantrips: [], spells: [], book: [], classKit: 0 })
}
</script>

<template>
  <WzChooser :items="items" :picked="d.cls" label="Classes" :need="!d.cls" intro="Click a class on the left to see its hit die, saving throws, proficiencies and what it gets at each level. Clicking takes it; set the level in the header." @pick="setClass">
    <template #top>
      <div v-if="d.cls && !r" class="wz-row wz-ch-top">
        <label>Hit die
          <Dropdown :value="dieOfDraft(d)" @change="wizard.d.die = val($event)"><option v-for="x in DICE" :key="x" :value="x">{{ x }}</option></Dropdown>
        </label>
      </div>
    </template>
    <template #detail="{ item, picked }">
      <p v-if="!picked" class="small muted wz-ch-hint-line">Click {{ item.label }} on the left to take it.</p>
      <WizardPage v-if="classEntry(item.id)" :e="classEntry(item.id)!" :title="item.label" :level="d.level" />
      <p v-else class="muted small">This class has no page in the world; it's filled in by hand on the next steps.</p>
    </template>
  </WzChooser>
</template>
