<script setup lang="ts">
// On the play sheet of a Druid with Wild Shape: the forms they know (the player adds them from the world's Beasts
// within their level's limits) with Shift, and while shifted, the form's statblock beside what they keep.
import { computed } from 'vue'
import type { CharacterSheet, Entry, Id } from '../model/types'
import { useReadOnly } from '../composables/useReadOnly'
import { editSheet } from '../sheetData'
import { get } from '../store'
import { statsOf } from '../encounter'
import { usesOf } from '../classHelpers'
import { druidLevel, fittingBeasts, formRules, formsOf, returnToForm, setForms, shift, unfit, wildShapeOf } from '../wildShape'
import { noteUndo, restoreSheet, snapSheet } from '../undoNote'
import EntryLink from './EntryLink.vue'
import EntryPicker from './edit/EntryPicker.vue'
import StatblockView from './Statblock.vue'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const ro = useReadOnly()
const a = computed(() => wildShapeOf(props.pc, props.s))
const rules = computed(() => (a.value ? formRules(props.pc, a.value) : undefined))
const uses = computed(() => (a.value ? usesOf(props.pc, a.value) : { left: 0, max: 0 }))
const forms = computed(() => formsOf(props.s).map(id => get(id)).filter((e): e is Entry => !!e))
const offer = computed(() => (rules.value ? fittingBeasts(rules.value).map(e => e.id).filter(id => !formsOf(props.s).includes(id)) : []))
const form = computed(() => get(props.s.wildShape?.form))
const formStats = computed(() => statsOf(form.value))
const lvl = computed(() => druidLevel(props.pc))
const hours = computed(() => Math.max(1, Math.floor(lvl.value / 2)))
const crOf = (e: Entry) => statsOf(e)?.cr

function add(id: Id) { if (!ro.value) editSheet(props.pc, x => setForms(x, [...formsOf(x), id])) }
function remove(id: Id) { if (!ro.value) editSheet(props.pc, x => setForms(x, formsOf(x).filter(f => f !== id))) }
function go(id: Id) {
  if (ro.value || !a.value || !uses.value.left) return
  const before = snapSheet(props.pc)
  editSheet(props.pc, x => shift(x, props.pc, a.value!, id))
  noteUndo(`Wild Shape: ${get(id)?.name}, ${lvl.value} temporary HP`, restoreSheet(props.pc, before))
}
function back() { if (!ro.value) editSheet(props.pc, x => returnToForm(x)) }
</script>

<template>
  <section v-if="a && rules" class="cs-hp wild-shape" :class="{ shifted: !!form }">
    <div class="ws-head">
      <span class="cs-label">Wild Shape</span>
      <span class="small"><b>{{ uses.left }}</b> / {{ uses.max }} uses</span>
      <span v-if="form" class="chip">as {{ form.name }}</span>
      <span class="spacer" />
      <button v-if="form" type="button" class="chip-btn" :disabled="ro" title="Return to your normal form (a bonus action)" @click="back">Return</button>
    </div>

    <!-- shifted: what they keep and what changes, beside the form's statblock -->
    <div v-if="form" class="ws-shifted">
      <ul class="ws-rules small">
        <li>Lasts up to <b>{{ hours }} hour{{ hours === 1 ? '' : 's' }}</b>. It ends early if you return (a bonus action), shift again, are Incapacitated, or die.</li>
        <li>You keep your HP, Hit Dice, Intelligence, Wisdom and Charisma, class features, languages and proficiencies. You use the form's other numbers, senses, speed and actions.</li>
        <li>You got <b>{{ lvl }}</b> temporary HP when you shifted.</li>
        <li>You can't cast spells (Beast Spells at Druid level 18), but shifting doesn't end concentration.</li>
      </ul>
      <StatblockView v-if="formStats" :sb="formStats" :name="form.name" class="ws-stats" />
      <p v-else class="muted small">{{ form.name }} has no stats yet.</p>
    </div>

    <!-- the known forms -->
    <div v-else class="ws-forms">
      <span class="muted small">Known forms {{ forms.length }} of {{ rules.count }} · Beasts up to CR {{ rules.crText }}{{ rules.fly ? '' : ', no Fly Speed' }}</span>
      <div class="ws-list">
        <span v-for="e in forms" :key="e.id" class="ws-form" :class="{ unfit: unfit(e, rules) }" :title="unfit(e, rules) ? `Not a form at this level: ${unfit(e, rules)}` : ''">
          <EntryLink :id="e.id" /> <span class="muted small">CR {{ crOf(e) ?? '?' }}</span>
          <button type="button" class="chip-btn" :disabled="ro || !uses.left || !!unfit(e, rules)" :title="uses.left ? `Shift into ${e.name}: a use, and ${lvl} temporary HP` : 'No use left: back on a long rest (one on a short rest)'" @click="go(e.id)">Shift</button>
          <button type="button" class="x" :disabled="ro" title="Forget this form" @click="remove(e.id)">×</button>
        </span>
        <EntryPicker v-if="!ro && forms.length < rules.count" add :types="['creature']" :only="offer" no-create placeholder="＋ Add a form…" @pick="add" />
      </div>
      <p v-if="!offer.length && forms.length < rules.count" class="muted small">The world has no other Beast within these limits.</p>
    </div>
  </section>
</template>
