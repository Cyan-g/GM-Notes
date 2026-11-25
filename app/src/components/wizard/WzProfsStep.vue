<script setup lang="ts">
// The wizard's proficiencies step: what the class gives (or, for a class without rules, its saves, armor, weapons
// and how many skills), what the species and background give, then the skills, tools and languages to pick. The
// skills sit under their abilities with the numbers they come to (as the sheet works them out), and what picking one
// would make it.
import { computed } from 'vue'
import type { Entry } from '../../model/types'
import { languageRule, pickedLanguages, wizard } from '../../wizard'
import { ABILITY_KEYS, ABILITY_NAME, ABILITY_SHORT, SKILLS, ABILITY_UPPER } from '../../model/dnd'
import { grantOptions, isToolKind } from '../../species'
import { entries, listOptions } from '../../store'
import { useDraft } from '../../composables/useDraft'
import { inputNumber as num } from '../../dom'
import ProfChips from '../ProfChips.vue'
import { useDraftSheet } from '../../composables/useDraftSheet'
import SkillGrid from '../SkillGrid.vue'
import { pickFrame } from '../../skillFrames'
import { skillLevel } from '../../sheet'
import { signed, type Ability } from '../../model/dnd'

const { d, r, granted, grantedSkills } = useDraft()
const skillFrom = computed(() => (r.value?.skills.from.length ? r.value.skills.from : SKILLS.map(s => s.name)))
const skillCount = computed(() => (r.value ? r.value.skills.count : d.value.ownSkillCount))
function toggleSkill(k: string) {
  const l = d.value.skills
  wizard.d.skills = l.includes(k) ? l.filter(x => x !== k) : l.length < skillCount.value ? [...l, k] : l
}
const { abilities, skills, prof, sheet } = useDraftSheet()
const skillsOf = (a: Ability) => skills.value.filter(x => x.ability === a)
const skillsLeft = computed(() => Math.max(0, skillCount.value - d.value.skills.length))
/** Whether a skill can be picked now: on the class's list, not given already, with a pick left. */
/** The class's skill picks: only its list, its count; what the species and background give stays as it is. */
const classFrame = computed(() => pickFrame({
  candidates: skillFrom.value, picked: d.value.skills, count: skillCount.value, prof: prof.value,
  levelOf: n => skillLevel(sheet.value, n), had: n => grantedSkills.value.get(n), toggle: toggleSkill,
}))
const fromOf = (n: string) => grantedSkills.value.get(n) ?? (d.value.skills.includes(n) ? 'the class' : undefined)
const canPick = (k: string) => skillFrom.value.includes(k) && !grantedSkills.value.has(k) && (d.value.skills.includes(k) || skillsLeft.value > 0)
/** An artisan's tool kind (Smith's Tools, Calligrapher's Supplies, Cook's Utensils), not Thieves' Tools, a kit or a game set. */
const artisan = (e: { name: string }) => /(supplies|tools|utensils)$/i.test(e.name.trim()) && !/thieves|navigator/i.test(e.name)
/** What the class's tool choice offers, from its words: musical instruments, artisan's tools, or both ("artisan's tools
 * or musical instrument", a Monk's); kinds only (Lyre, not Elmar's Lyre). Words naming neither: every tool and instrument. */
function offers(e: Entry): boolean {
  const what = r.value?.toolChoice?.what ?? '', inst = /instrument/i.test(what), art = /artisan/i.test(what), tool = /tool|kit|supplies/i.test(what)
  if (!inst && !art && !tool) return true
  return (inst && e.fields.kind === 'Instrument') || (art && e.fields.kind === 'Tool' && artisan(e)) || (tool && !art && e.fields.kind === 'Tool')
}
const toolItems = computed(() => entries.value.filter(e => isToolKind(e) && offers(e)).map(e => ({ id: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label)))
const languages = computed(() => listOptions('language'))
const langRule = computed(() => languageRule(d.value))
const picked = computed(() => pickedLanguages(d.value))
/** Common, plus the languages picked, no more than the rule allows. */
function setLanguages(v: string[]) {
  const given = new Set(langRule.value.given.map(g => g.id))
  wizard.d.languages = ['Common', ...v.filter(l => l !== 'Common' && !given.has(l)).slice(0, langRule.value.picks)]
}
const armorTypes = computed(() => listOptions('item.armorType').filter(o => o.id !== 'Clothing'))
const toggleIn = (key: 'ownSaves' | 'ownArmor' | 'ownWeapons', v: string) => {
  const l = wizard.d[key] as string[]
  ;(wizard.d[key] as string[]) = l.includes(v) ? l.filter(x => x !== v) : [...l, v]
}
</script>

<template>
  <template v-if="r">
    <p class="small"><b>From the class:</b> saves {{ r.saves.map(a => ABILITY_NAME[a]).join(' and ') }};
      armor {{ r.armor.join(', ') || 'none' }}; weapons {{ r.weapons.join(', ') }}<template v-if="r.tools.length">; {{ r.tools.join(', ') }}</template>.</p>
  </template>
  <template v-else-if="d.cls">
    <div class="wz-row"><span>Saving throws</span>
      <span class="chip-toggles"><button class="chip-toggle" v-for="a in ABILITY_KEYS" :key="a" type="button" :class="{ on: d.ownSaves.includes(a) }" @click="toggleIn('ownSaves', a)">{{ ABILITY_UPPER[a] }}</button></span></div>
    <div class="wz-row"><span>Armor</span>
      <span class="chip-toggles"><button class="chip-toggle" v-for="o in armorTypes" :key="o.id" type="button" :class="{ on: d.ownArmor.includes(o.id) }" @click="toggleIn('ownArmor', o.id)">{{ o.label }}</button></span></div>
    <div class="wz-row"><span>Weapons</span>
      <span class="chip-toggles"><button class="chip-toggle" v-for="w in listOptions('item.weaponCategory')" :key="w.id" type="button" :class="{ on: d.ownWeapons.includes(w.id) }" @click="toggleIn('ownWeapons', w.id)">{{ w.label }}</button></span></div>
    <div class="wz-row"><label>Skills to pick <input type="number" min="0" max="8" class="wz-small" :value="d.ownSkillCount" @change="wizard.d.ownSkillCount = num($event)" /></label></div>
  </template>
  <p v-if="granted.length" class="small"><b>From the species and background:</b>{{ ' ' }}<template v-for="(g, i) in granted" :key="i"><template v-if="i">, </template>{{ grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id }} <span class="muted">({{ g.from }})</span></template></p>
  <h3>Skills <span class="muted small">{{ d.skills.length }} of {{ skillCount }} picked</span></h3>
  <p class="small muted">○ not proficient · ● proficient · ◉ expertise. Proficiency adds {{ signed(prof) }} to the ability's modifier. Pick {{ skillCount }} from the class's list (the ones you can click, with → what proficiency makes them).</p>
  <!-- the skills as the sheet shows them, under their abilities: ○ ● ◉ and the numbers they come to -->
  <SkillGrid :s="sheet" :prof="prof" :frame="classFrame" :from="fromOf" :class="{ 'wz-todo': skillsLeft > 0 }" :data-left="skillsLeft ? `${skillsLeft} left` : undefined" />
  <template v-if="r?.toolChoice">
    <h3>{{ r.toolChoice.count }} {{ r.toolChoice.what }} <span class="muted small">{{ d.tools.length }} of {{ r.toolChoice.count }}</span></h3>
    <ProfChips :class="{ 'wz-todo': d.tools.length < r.toolChoice.count }" :values="d.tools" :suggest="toolItems" :create="(x: string) => x" placeholder="Add one, or type a name…" @change="v => wizard.d.tools = v.slice(0, r!.toolChoice!.count)" />
  </template>
  <h3>Languages <span v-if="langRule.picks" class="muted small">{{ langRule.speciesLists ? '' : 'Common and ' }}{{ picked.length }} of {{ langRule.picks }} to pick</span></h3>
  <p v-if="langRule.given.length" class="small"><span class="muted">Known from the species, background and class:</span> {{ langRule.given.map(g => `${listOptions('language').find(o => o.id === g.id)?.label ?? g.id} (${g.from})`).join(', ') }}</p>
  <ProfChips v-if="langRule.picks" :class="{ 'wz-todo': picked.length < langRule.picks }" :values="picked" :suggest="languages.filter(o => o.id !== 'Common' && !langRule.given.some(g => g.id === o.id))" :create="(x: string) => x"
             :placeholder="picked.length < langRule.picks ? 'Add a language…' : 'Remove one to pick another'" @change="setLanguages" />
  <p v-else class="muted small">{{ langRule.speciesLists ? 'The species says which languages it speaks, with none of the player\'s choice.' : 'No languages to pick.' }}</p>
</template>
