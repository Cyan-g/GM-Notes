<script setup lang="ts">
// The wizard's proficiencies step: what the class gives (or, for a class without rules, its saves, armor, weapons
// and how many skills), what the species and background give, then the skills, tools and languages to pick.
import { computed } from 'vue'
import { languageRule, pickedLanguages, wizard } from '../../wizard'
import { ABILITY_KEYS, ABILITY_NAME, ABILITY_SHORT, SKILLS } from '../../model/dnd'
import { grantOptions } from '../../species'
import { entries, listOptions } from '../../store'
import { useDraft } from '../../composables/useDraft'
import { inputNumber as num } from '../../dom'
import ProfChips from '../ProfChips.vue'

const { d, r, granted, grantedSkills } = useDraft()
const skillFrom = computed(() => (r.value?.skills.from.length ? r.value.skills.from : SKILLS.map(s => s.name)))
const skillCount = computed(() => (r.value ? r.value.skills.count : d.value.ownSkillCount))
function toggleSkill(k: string) {
  const l = d.value.skills
  wizard.d.skills = l.includes(k) ? l.filter(x => x !== k) : l.length < skillCount.value ? [...l, k] : l
}
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
  <p v-if="granted.length" class="small"><b>From the species and background:</b>
    <template v-for="(g, i) in granted" :key="i"><template v-if="i">, </template>{{ grantOptions(g.kind).find(o => o.id === g.id)?.label ?? g.id }} <span class="muted">({{ g.from }})</span></template></p>
  <h3>Skills <span class="muted small">{{ d.skills.length }} of {{ skillCount }}</span></h3>
  <div class="wz-skills">
    <button v-for="k in skillFrom" :key="k" type="button" class="chip-btn" :class="{ on: d.skills.includes(k) }" :disabled="grantedSkills.has(k) && !d.skills.includes(k)"
            :title="grantedSkills.has(k) ? `Already from ${grantedSkills.get(k)}` : ''" @click="toggleSkill(k)">{{ k }}</button>
  </div>
  <template v-if="r?.toolChoice">
    <h3>{{ r.toolChoice.count }} {{ r.toolChoice.what }} <span class="muted small">{{ d.tools.length }} of {{ r.toolChoice.count }}</span></h3>
    <ProfChips :values="d.tools" :suggest="toolItems" :create="(x: string) => x" placeholder="Add one, or type a name…" @change="v => wizard.d.tools = v.slice(0, r!.toolChoice!.count)" />
  </template>
  <h3>Languages <span v-if="langRule.picks" class="muted small">{{ langRule.speciesLists ? '' : 'Common and ' }}{{ picked.length }} of {{ langRule.picks }} to pick</span></h3>
  <p v-if="langRule.given.length" class="small"><span class="muted">Known from the species, background and class:</span> {{ langRule.given.map(g => `${listOptions('language').find(o => o.id === g.id)?.label ?? g.id} (${g.from})`).join(', ') }}</p>
  <ProfChips v-if="langRule.picks" :values="picked" :suggest="languages.filter(o => o.id !== 'Common' && !langRule.given.some(g => g.id === o.id))" :create="(x: string) => x"
             :placeholder="picked.length < langRule.picks ? 'Add a language…' : 'Remove one to pick another'" @change="setLanguages" />
  <p v-else class="muted small">{{ langRule.speciesLists ? 'The species says which languages it speaks; any extra comes from its traits\' choices above.' : 'No languages to pick.' }}</p>
</template>
