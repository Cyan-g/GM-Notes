<script setup lang="ts">
// What an item needs, on its Edit form (right column): whether it requires attunement, then who can use it — anyone,
// or only some characters, each check added on its own (a class or any spellcaster, a species, minimum scores, a
// skill) with a note for anything else. A character who doesn't fit can't equip it, or attune to it if it needs
// attunement (requirements.ts); heavy armor's Strength only slows (it's set with the armor).
import Dropdown from '../Dropdown.vue'
import { computed, ref } from 'vue'
import type { Entry, Requirements } from '../../model/types'
import { ABILITIES, SKILLS } from '../../model/dnd'
import { listOptions } from '../../store'
import { changed } from '../../edit'
import { describeRequirements } from '../../requirements'
import ProfChips from '../ProfChips.vue'
import EntryPicker from './EntryPicker.vue'
import EntryLink from '../EntryLink.vue'

const props = defineProps<{ e: Entry }>()
const f = computed(() => props.e.fields)
const req = computed<Requirements>(() => f.value.requirements ?? {})
/** Checks other than heavy armor's Strength (set with the armor). */
const someone = computed(() => !!(req.value.classes?.length || req.value.spellcaster || req.value.races?.length || req.value.skills?.length || req.value.note || (req.value.scores ?? []).some(x => !(f.value.armorType === 'Heavy' && x.ability === 'str'))))
const restricted = ref(someone.value)
/** At its defaults (anyone, no attunement) it's one line until "change" opens the controls. */
const editing = ref(!!f.value.attunement || someone.value)

function putReq(p: Partial<Requirements>) {
  const n: Requirements = { ...req.value, ...p }
  for (const k of Object.keys(n) as (keyof Requirements)[]) { const v = n[k]; if (v == null || v === false || v === '' || (Array.isArray(v) && !v.length)) delete n[k] }
  if ((n.scores?.length ?? 0) < 2) delete n.anyScore
  if (Object.keys(n).length) f.value.requirements = n; else delete f.value.requirements
  changed(props.e)
}
function setRestricted(on: boolean) {
  if (!on && someone.value) {
    if (!confirm(`Let anyone use it (removes: ${describeRequirements(props.e)})?`)) return
    const str = (req.value.scores ?? []).filter(x => f.value.armorType === 'Heavy' && x.ability === 'str')
    putReq({ classes: undefined, spellcaster: undefined, races: undefined, skills: undefined, note: undefined, scores: str })
  }
  restricted.value = on
}
function toggleAttune() { if (f.value.attunement) delete f.value.attunement; else f.value.attunement = true; changed(props.e) }

type Check = 'classes' | 'spellcaster' | 'races' | 'scores' | 'skills' | 'note'
const CHECKS: { id: Check; label: string; hint: string }[] = [
  { id: 'classes', label: 'A class', hint: 'only characters of these classes (a druid’s staff)' },
  { id: 'spellcaster', label: 'Any spellcaster', hint: 'anyone who can cast spells' },
  { id: 'races', label: 'A species', hint: 'only characters of these races or their subraces' },
  { id: 'scores', label: 'Ability scores', hint: 'minimum scores' },
  { id: 'skills', label: 'A skill', hint: 'proficiency in a skill' },
  { id: 'note', label: 'Something else', hint: 'written down, not checked' },
]
const added = ref<Set<Check>>(new Set())
const isOn = (c: Check) => added.value.has(c) || (c === 'spellcaster' ? !!req.value.spellcaster : c === 'note' ? !!req.value.note : c === 'scores' ? (req.value.scores ?? []).some(x => !(f.value.armorType === 'Heavy' && x.ability === 'str')) : !!(req.value[c] as unknown[] | undefined)?.length)
const shown = computed(() => CHECKS.filter(c => isOn(c.id)))
const offered = computed(() => CHECKS.filter(c => !isOn(c.id)))
function add(c: Check) {
  added.value = new Set([...added.value, c])
  if (c === 'spellcaster') putReq({ spellcaster: true })
  if (c === 'scores') putReq({ scores: [...(req.value.scores ?? []), { ability: 'int', min: 13 }] })
}
function remove(c: Check) {
  added.value = new Set([...added.value].filter(x => x !== c))
  if (c === 'scores') putReq({ scores: (req.value.scores ?? []).filter(x => f.value.armorType === 'Heavy' && x.ability === 'str') })
  else putReq({ [c]: undefined } as Partial<Requirements>)
}
const scores = computed(() => (req.value.scores ?? []).map((x, i) => ({ x, i })).filter(({ x }) => !(f.value.armorType === 'Heavy' && x.ability === 'str')))
const setScore = (i: number, p: Partial<NonNullable<Requirements['scores']>[number]>) => putReq({ scores: (req.value.scores ?? []).map((x, k) => (k === i ? { ...x, ...p } : x)) })
const skillOptions = SKILLS.map(s => ({ id: s.name, label: s.name }))
</script>

<template>
  <p v-if="!editing" class="small item-needs-line">Anyone can use it, no attunement · <button type="button" class="link-btn" @click="editing = true">change</button></p>
  <div v-else class="feat-prereqs item-needs">
    <label class="fp-switch"><input type="checkbox" :checked="!!f.attunement" @change="toggleAttune" /> <b>Requires attunement</b></label>
    <span class="muted small">Who can use it{{ f.attunement ? ' (attune to it)' : ' (equip it)' }}:</span>
    <div class="seg fp-mode">
      <button type="button" :class="{ on: !restricted }" @click="setRestricted(false)">Anyone</button>
      <button type="button" :class="{ on: restricted }" @click="setRestricted(true)">Only some characters</button>
    </div>
    <template v-if="restricted">
      <div v-for="c in shown" :key="c.id" class="fp-row">
        <span class="fp-label">{{ c.label }}</span>
        <div class="fp-value">
          <ProfChips v-if="c.id === 'classes'" :values="req.classes ?? []" :suggest="listOptions('class')" placeholder="Add a class…" @change="v => putReq({ classes: v })" />
          <span v-else-if="c.id === 'spellcaster'" class="small">Anyone who can cast spells{{ req.classes?.length ? ', or one of the classes' : '' }}.</span>
          <template v-else-if="c.id === 'races'">
            <span v-for="id in req.races ?? []" :key="id" class="chip"><EntryLink :id="id" /><button type="button" class="link-btn" title="Remove" @click="putReq({ races: (req.races ?? []).filter(x => x !== id) })">×</button></span>
            <EntryPicker add :types="['race']" :exclude="req.races ?? []" placeholder="Add a race (subraces count)…" @pick="id => putReq({ races: [...(req.races ?? []), id] })" />
          </template>
          <template v-else-if="c.id === 'scores'">
            <span v-for="{ x, i } in scores" :key="i" class="req-score">
              <Dropdown :value="x.ability" aria-label="Ability" @change="setScore(i, { ability: ($event.target as HTMLSelectElement).value as any })"><option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.label }}</option></Dropdown>
              <input type="number" min="1" max="30" class="effect-value" :value="x.min" aria-label="Minimum" @change="setScore(i, { min: Number(($event.target as HTMLInputElement).value) || 13 })" />+
              <button type="button" class="link-btn" title="Remove" @click="putReq({ scores: (req.scores ?? []).filter((_, k) => k !== i) })">×</button>
            </span>
            <button type="button" class="chip-btn" @click="putReq({ scores: [...(req.scores ?? []), { ability: 'wis', min: 13 }] })">＋ Score</button>
          </template>
          <ProfChips v-else-if="c.id === 'skills'" :values="req.skills ?? []" :suggest="skillOptions" placeholder="Add a skill…" @change="v => putReq({ skills: v })" />
          <input v-else-if="c.id === 'note'" class="effect-text" :value="req.note ?? ''" placeholder="e.g. only its rightful owner (not checked)" @change="putReq({ note: ($event.target as HTMLInputElement).value.trim() })" />
        </div>
        <button type="button" class="link-btn fp-x" :title="`Remove the ${c.label.toLowerCase()} check`" @click="remove(c.id)">×</button>
      </div>
      <div v-if="offered.length" class="fp-add">
        <span class="muted small">{{ shown.length ? 'Add another:' : 'Who may use it?' }}</span>
        <button v-for="c in offered" :key="c.id" type="button" class="chip-btn" :title="c.hint" @click="add(c.id)">＋ {{ c.label }}</button>
      </div>
    </template>
  </div>
</template>
