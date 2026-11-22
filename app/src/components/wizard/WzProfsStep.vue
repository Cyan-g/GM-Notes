<script setup lang="ts">
// The wizard's proficiencies step: what the class gives (or, for a class without rules, its saves, armor, weapons
// and how many skills), what the species and background give, then the skills, tools and languages to pick. The
// skills sit under their abilities with the numbers they come to (as the sheet works them out), and what picking one
// would make it.
import { computed } from 'vue'
import { languageRule, pickedLanguages, wizard } from '../../wizard'
import { ABILITY_KEYS, ABILITY_NAME, ABILITY_SHORT, SKILLS } from '../../model/dnd'
import { grantOptions } from '../../species'
import { entries, listOptions } from '../../store'
import { useDraft } from '../../composables/useDraft'
import { inputNumber as num } from '../../dom'
import ProfChips from '../ProfChips.vue'
import { useDraftSheet } from '../../composables/useDraftSheet'
import { signed, type Ability } from '../../model/dnd'

const { d, r, granted, grantedSkills } = useDraft()
const skillFrom = computed(() => (r.value?.skills.from.length ? r.value.skills.from : SKILLS.map(s => s.name)))
const skillCount = computed(() => (r.value ? r.value.skills.count : d.value.ownSkillCount))
function toggleSkill(k: string) {
  const l = d.value.skills
  wizard.d.skills = l.includes(k) ? l.filter(x => x !== k) : l.length < skillCount.value ? [...l, k] : l
}
const { abilities, skills, prof } = useDraftSheet()
const skillsOf = (a: Ability) => skills.value.filter(x => x.ability === a)
const skillsLeft = computed(() => Math.max(0, skillCount.value - d.value.skills.length))
/** Whether a skill can be picked now: on the class's list, not given already, with a pick left. */
const canPick = (k: string) => skillFrom.value.includes(k) && !grantedSkills.value.has(k) && (d.value.skills.includes(k) || skillsLeft.value > 0)
const toolItems = computed(() => entries.value.filter(e => e.type === 'item' && ['Tool', 'Instrument'].includes(String(e.fields.kind))).map(e => ({ id: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label)))
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
      <span class="seg"><button v-for="a in ABILITY_KEYS" :key="a" type="button" :class="{ on: d.ownSaves.includes(a) }" @click="toggleIn('ownSaves', a)">{{ ABILITY_SHORT[a] }}</button></span></div>
    <div class="wz-row"><span>Armor</span>
      <span class="seg"><button v-for="o in armorTypes" :key="o.id" type="button" :class="{ on: d.ownArmor.includes(o.id) }" @click="toggleIn('ownArmor', o.id)">{{ o.label }}</button></span></div>
    <div class="wz-row"><span>Weapons</span>
      <span class="seg"><button v-for="w in ['Simple', 'Martial']" :key="w" type="button" :class="{ on: d.ownWeapons.includes(w) }" @click="toggleIn('ownWeapons', w)">{{ w }}</button></span></div>
    <div class="wz-row"><label>Skills to pick <input type="number" min="0" max="8" class="wz-small" :value="d.ownSkillCount" @change="wizard.d.ownSkillCount = num($event)" /></label></div>
  </template>
  <p v-if="granted.length" class="small"><b>From the species and background:</b>{{ ' ' }}<template v-for="(g, i) in granted" :key="i"><template v-if="i">, </template>{{ grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id }} <span class="muted">({{ g.from }})</span></template></p>
  <h3>Skills <span class="muted small">{{ d.skills.length }} of {{ skillCount }} picked</span></h3>
  <p class="small muted">A skill you're proficient in adds your proficiency bonus ({{ signed(prof) }}) to its ability's modifier. Pick {{ skillCount }} from the class's list (the ones you can click); each shows what it comes to now, and → what it would with proficiency.</p>
  <div class="wz-ab-grid" :class="{ 'wz-todo': skillsLeft > 0 }" :data-left="skillsLeft ? `${skillsLeft} left` : undefined">
    <section v-for="x in abilities" :key="x.a" class="wz-ab-card">
      <header><b>{{ ABILITY_NAME[x.a] }}</b><span class="wz-ab-score">{{ x.score }} <span class="muted">({{ signed(x.mod) }})</span></span></header>
      <div class="wz-ab-save" :class="{ on: x.saveProf }">Saving throw <b>{{ signed(x.save) }}</b><span v-if="x.saveProf" class="muted small"> proficient</span></div>
      <button v-for="s in skillsOf(x.a)" :key="s.name" type="button" class="wz-skill-row"
              :class="{ on: d.skills.includes(s.name), given: grantedSkills.has(s.name), can: canPick(s.name) && !d.skills.includes(s.name) }"
              :disabled="!canPick(s.name)" :aria-pressed="d.skills.includes(s.name) || grantedSkills.has(s.name)"
              :title="grantedSkills.has(s.name) ? `Already from ${grantedSkills.get(s.name)}` : !skillFrom.includes(s.name) ? 'Not on the class list' : !canPick(s.name) ? `${skillCount} picked: take one back to pick this` : ''"
              @click="toggleSkill(s.name)">
        <span class="wz-skill-tick">{{ d.skills.includes(s.name) || grantedSkills.has(s.name) ? '✓' : '' }}</span>
        <span class="wz-skill-name">{{ s.name }}<small v-if="grantedSkills.has(s.name)" class="muted"> · {{ grantedSkills.get(s.name) }}</small><small v-if="s.level === 2" class="muted"> · expertise</small></span>
        <b>{{ signed(s.bonus) }}</b>
        <small v-if="canPick(s.name) && !d.skills.includes(s.name) && !s.level" class="wz-skill-then">→ {{ signed(s.bonus + prof) }}</small>
      </button>
    </section>
  </div>
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
