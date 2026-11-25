<script setup lang="ts">
// A feat's prerequisites on its Edit page, step by step: first whether it has any; then whether they're only written
// (shown on the card, not checked) or checked by the app (level-up greys the feat out); then, when checked, each
// check added on its own — a level, feats it needs, minimum scores, spellcasting, a feature, a class, a race, a skill.
import Dropdown from '../Dropdown.vue'
import { computed, ref } from 'vue'
import type { Entry, Requirements } from '../../model/types'
import { TYPES } from '../../model/schema'
import { ABILITIES, SKILLS } from '../../model/dnd'
import { listOptions } from '../../store'
import { featureNames } from '../../species'
import { changed } from '../../edit'
import { describeRequirements } from '../../requirements'
import FieldInput from './FieldInput.vue'
import ProfChips from '../ProfChips.vue'
import EntryPicker from './EntryPicker.vue'
import EntryLink from '../EntryLink.vue'

const props = defineProps<{ e: Entry }>()
const f = computed(() => props.e.fields)
const req = computed<Requirements>(() => f.value.requirements ?? {})
const requiresDef = TYPES.feat.fields.find(x => x.key === 'requires')!

/** What's checked: a level, needed feats, or any requirement. */
const checks = computed(() => !!f.value.level || !!(f.value.requires as string[] | undefined)?.length || !!f.value.requirements)
const has = computed(() => checks.value || !!f.value.prerequisite || opened.value)
const opened = ref(false)
const mode = ref<'written' | 'checked'>(checks.value || !f.value.prerequisite ? 'checked' : 'written')

function clearChecks() { delete f.value.level; delete f.value.requires; delete f.value.requirements }
function setOn(on: boolean) {
  if (on) { opened.value = true; return }
  const what = [f.value.prerequisite, describeRequirements(props.e), f.value.level && `level ${f.value.level}`].filter(Boolean).join(', ')
  if (what && !confirm(`Remove this feat's prerequisites (${what})?`)) return
  opened.value = false
  clearChecks(); delete f.value.prerequisite
  changed(props.e)
}
function setMode(m: 'written' | 'checked') {
  if (m === mode.value) return
  if (m === 'written' && checks.value) {
    // keep what it said: the checks become the written line
    const text = [f.value.level && `Level ${f.value.level}+`, describeRequirements(props.e)].filter(Boolean).join(', ')
    if (!confirm('Stop checking these prerequisites? They stay as written text on the card.')) return
    if (!f.value.prerequisite && text) f.value.prerequisite = text
    clearChecks()
    changed(props.e)
  }
  mode.value = m
}
function setText(v: string) { if (v.trim()) f.value.prerequisite = v.trim(); else delete f.value.prerequisite; changed(props.e) }

// ---- the checks ----
type Check = 'level' | 'feats' | 'scores' | 'spellcaster' | 'features' | 'classes' | 'races' | 'skills'
const CHECKS: { id: Check; label: string; hint: string }[] = [
  { id: 'level', label: 'Level', hint: 'a character level (General feats: 4, Epic Boons: 19)' },
  { id: 'feats', label: 'Another feat', hint: 'feats the character must have first' },
  { id: 'scores', label: 'Ability scores', hint: 'minimum scores, all or one of them' },
  { id: 'spellcaster', label: 'Spellcasting', hint: 'the character can cast spells' },
  { id: 'features', label: 'A feature', hint: 'a feature the character has, by name (Fighting Style)' },
  { id: 'classes', label: 'A class', hint: 'a class the character has' },
  { id: 'races', label: 'A species', hint: 'a race or subrace' },
  { id: 'skills', label: 'A skill', hint: 'proficiency in a skill' },
]
const added = ref<Set<Check>>(new Set())
const isOn = (c: Check) => added.value.has(c) || (c === 'level' ? !!f.value.level : c === 'feats' ? !!(f.value.requires as string[] | undefined)?.length : c === 'spellcaster' ? !!req.value.spellcaster : !!(req.value[c] as unknown[] | undefined)?.length)
const shown = computed(() => CHECKS.filter(c => isOn(c.id)))
const offered = computed(() => CHECKS.filter(c => !isOn(c.id)))
function putReq(p: Partial<Requirements>) {
  const n: Requirements = { ...req.value, ...p }
  for (const k of Object.keys(n) as (keyof Requirements)[]) { const v = n[k]; if (v == null || v === false || v === '' || (Array.isArray(v) && !v.length)) delete n[k] }
  if ((n.scores?.length ?? 0) < 2) delete n.anyScore
  if (Object.keys(n).length) f.value.requirements = n; else delete f.value.requirements
  changed(props.e)
}
function add(c: Check) {
  added.value = new Set([...added.value, c])
  if (c === 'level') { f.value.level = f.value.category === 'Epic Boon' ? 19 : 4; changed(props.e) }
  if (c === 'scores') putReq({ scores: [{ ability: 'str', min: 13 }] })
  if (c === 'spellcaster') putReq({ spellcaster: true })
}
function remove(c: Check) {
  added.value = new Set([...added.value].filter(x => x !== c))
  if (c === 'level') { delete f.value.level; changed(props.e) }
  else if (c === 'feats') { delete f.value.requires; changed(props.e) }
  else putReq({ [c]: undefined } as Partial<Requirements>)
}
function setLevel(v: string) { const n = Number(v); if (n > 0) f.value.level = Math.min(20, n); else delete f.value.level; changed(props.e) }
const scores = computed(() => req.value.scores ?? [])
const setScore = (i: number, p: Partial<NonNullable<Requirements['scores']>[number]>) => putReq({ scores: scores.value.map((x, k) => (k === i ? { ...x, ...p } : x)) })
const skillOptions = SKILLS.map(s => ({ id: s.name, label: s.name }))
</script>

<template>
  <div class="feat-prereqs">
    <label class="check-chip fp-switch"><input type="checkbox" :checked="has" @change="setOn(($event.target as HTMLInputElement).checked)" /> <b>This feat has prerequisites</b></label>

    <template v-if="has">
      <div class="seg fp-mode">
        <button type="button" :class="{ on: mode === 'written' }" title="Shown on the card; the app doesn't check them" @click="setMode('written')">Written only</button>
        <button type="button" :class="{ on: mode === 'checked' }" title="Level-up greys the feat out for characters who don't meet them" @click="setMode('checked')">Checked by the app</button>
      </div>

      <label v-if="mode === 'written'" class="fp-text">Prerequisite <input :value="String(f.prerequisite ?? '')" placeholder="e.g. Level 4+, Strength 13+" @change="setText(($event.target as HTMLInputElement).value)" />
        <small class="muted">Shown on the card as written; not checked.</small></label>

      <template v-else>
        <div v-for="c in shown" :key="c.id" class="fp-row">
          <span class="fp-label">{{ c.label }}</span>
          <div class="fp-value">
            <template v-if="c.id === 'level'"><input type="number" min="1" max="20" class="effect-value" :value="f.level ?? ''" @change="setLevel(($event.target as HTMLInputElement).value)" /> <span class="muted small">or higher</span></template>
            <FieldInput v-else-if="c.id === 'feats'" :def="requiresDef" :entry="e" />
            <template v-else-if="c.id === 'scores'">
              <span v-for="(x, i) in scores" :key="i" class="req-score">
                <Dropdown :value="x.ability" aria-label="Ability" @change="setScore(i, { ability: ($event.target as HTMLSelectElement).value as any })"><option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.label }}</option></Dropdown>
                <input type="number" min="1" max="30" class="effect-value" :value="x.min" aria-label="Minimum" @change="setScore(i, { min: Number(($event.target as HTMLInputElement).value) || 13 })" />+
                <button type="button" class="link-btn" title="Remove" @click="putReq({ scores: scores.filter((_, k) => k !== i) })">×</button>
              </span>
              <button type="button" class="chip-btn" @click="putReq({ scores: [...scores, { ability: 'dex', min: 13 }] })">＋ Score</button>
              <div v-if="scores.length > 1" class="seg">
                <button type="button" :class="{ on: !req.anyScore }" @click="putReq({ anyScore: undefined })">all of them</button>
                <button type="button" :class="{ on: !!req.anyScore }" @click="putReq({ anyScore: true })">one of them is enough</button>
              </div>
            </template>
            <span v-else-if="c.id === 'spellcaster'" class="small">The character can cast spells (a Spellcasting or Pact Magic feature).</span>
            <ProfChips v-else-if="c.id === 'features'" :values="req.features ?? []" :suggest="featureNames()" :create="(x: string) => x" placeholder="e.g. Fighting Style…" @change="v => putReq({ features: v })" />
            <ProfChips v-else-if="c.id === 'classes'" :values="req.classes ?? []" :suggest="listOptions('class')" placeholder="Add a class…" @change="v => putReq({ classes: v })" />
            <template v-else-if="c.id === 'races'">
              <span v-for="id in req.races ?? []" :key="id" class="chip"><EntryLink :id="id" /><button type="button" class="link-btn" title="Remove" @click="putReq({ races: (req.races ?? []).filter(x => x !== id) })">×</button></span>
              <EntryPicker add :types="['race']" :exclude="req.races ?? []" placeholder="Add a race (subraces count)…" @pick="id => putReq({ races: [...(req.races ?? []), id] })" />
            </template>
            <ProfChips v-else-if="c.id === 'skills'" :values="req.skills ?? []" :suggest="skillOptions" placeholder="Add a skill…" @change="v => putReq({ skills: v })" />
          </div>
          <button type="button" class="link-btn fp-x" :title="`Remove the ${c.label.toLowerCase()} check`" @click="remove(c.id)">×</button>
        </div>
        <div v-if="offered.length" class="fp-add">
          <span class="muted small">{{ shown.length ? 'Add another check:' : 'What does it need?' }}</span>
          <button v-for="c in offered" :key="c.id" type="button" class="chip-btn" :title="c.hint" @click="add(c.id)">＋ {{ c.label }}</button>
        </div>
        <label class="fp-text">As written <small class="muted">(optional: shown on the card instead of the checks' own words)</small>
          <input :value="String(f.prerequisite ?? '')" :placeholder="[f.level && `Level ${f.level}+`, describeRequirements(e)].filter(Boolean).join(', ') || 'e.g. Strength or Dexterity 13+'" @change="setText(($event.target as HTMLInputElement).value)" /></label>
      </template>
    </template>
  </div>
</template>
