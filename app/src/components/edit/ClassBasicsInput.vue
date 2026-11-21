<script setup lang="ts">
// A class's basics on its Edit page: hit die, spellcasting, saves, proficiencies, skills, cantrips and prepared spells
// by level, feat levels, the subclass level and multiclassing. Each shows the class's current value; the 12 SRD classes
// start from the app's built-in values (marked "standard"), and anything changed here is stored on the entry and wins.
// "Reset" puts one back to the standard value.
import { computed } from 'vue'
import type { ClassBasics } from '../../model/types'
import { builtInBasics } from '../../classRules'
import { DICE } from '../../model/classes'
import { SKILLS } from '../../sheet'
import { ABILITY_KEYS, ABILITY_SHORT } from '../../abilityBonus'

type Key = keyof ClassBasics
const props = defineProps<{ cls: string }>()
const model = defineModel<ClassBasics | undefined>()
const own = computed<ClassBasics>(() => model.value ?? {})
const base = computed(() => builtInBasics(props.cls))
/** What the class has now: its own value where it sets one, else the standard one. */
const cur = computed<ClassBasics>(() => ({ ...base.value, ...own.value }))
const isOwn = (k: Key) => own.value[k] !== undefined

function set<K extends Key>(k: K, v: ClassBasics[K] | undefined) {
  const next: ClassBasics = { ...own.value }
  if (v === undefined || JSON.stringify(v) === JSON.stringify(base.value[k])) delete next[k]
  else next[k] = v
  model.value = Object.keys(next).length ? next : undefined
}
const reset = (k: Key) => set(k, undefined)
const toggle = <T,>(list: T[] | undefined, x: T) => (list ?? []).includes(x) ? (list ?? []).filter(y => y !== x) : [...(list ?? []), x]

const CASTERS: { id: NonNullable<ClassBasics['caster']>; label: string }[] = [
  { id: 'none', label: 'No spellcasting' }, { id: 'full', label: 'Full caster (Wizard, Cleric…)' }, { id: 'half', label: 'Half caster (Paladin, Ranger)' },
  { id: 'third', label: 'Third caster (Eldritch Knight)' }, { id: 'pact', label: 'Pact Magic (Warlock)' }, { id: 'artificer', label: 'Artificer (half, rounded up)' },
]
const ARMOR = ['Light', 'Medium', 'Heavy', 'Shield']
const WEAPONS = ['Simple', 'Martial']
const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1)
const casts = computed(() => (cur.value.caster ?? 'none') !== 'none')
/** One number per level for a by-level table (cantrips, prepared spells). */
function setAt(k: 'cantrips' | 'prepared', i: number, v: string) {
  const list = [...(cur.value[k] ?? Array(20).fill(0))]
  while (list.length < 20) list.push(list.at(-1) ?? 0)
  list[i] = Math.max(0, Number(v) || 0)
  set(k, list)
}
const num = (ev: Event) => { const v = (ev.target as HTMLInputElement).value.trim(); return v === '' ? undefined : Number(v) }
const mc = computed(() => cur.value.multiclass ?? { primary: [], armor: [], weapons: [], tools: [] })
const setMc = (patch: Partial<NonNullable<ClassBasics['multiclass']>>) => set('multiclass', { ...mc.value, ...patch })
const tag = (k: Key) => (isOwn(k) ? 'changed' : base.value[k] !== undefined ? 'standard' : '')
</script>

<template>
  <div class="class-basics">
    <p class="muted small">What the class gives a character. <template v-if="Object.keys(builtInBasics(cls)).length > 4">The SRD's values are filled in; anything you change here wins.</template><template v-else>Fill these in so the wizard, level-up and spell slots know this class.</template></p>

    <div class="cb-grid">
      <label class="cb-row"><span>Hit die</span>
        <select :value="cur.hitDie" @change="set('hitDie', ($event.target as HTMLSelectElement).value)"><option v-for="d in DICE" :key="d" :value="d">{{ d }}</option></select>
        <span class="cb-tag" :class="tag('hitDie')">{{ tag('hitDie') }}</span><button v-if="isOwn('hitDie')" type="button" class="link-btn small" @click="reset('hitDie')">Reset</button></label>
      <label class="cb-row"><span>Subclass at level</span>
        <input type="number" min="1" max="20" :value="cur.subclassLevel" @change="set('subclassLevel', num($event))" />
        <span class="cb-tag" :class="tag('subclassLevel')">{{ tag('subclassLevel') }}</span><button v-if="isOwn('subclassLevel')" type="button" class="link-btn small" @click="reset('subclassLevel')">Reset</button></label>
    </div>

    <h4>Saving throws <span class="cb-tag" :class="tag('saves')">{{ tag('saves') }}</span><button v-if="isOwn('saves')" type="button" class="link-btn small" @click="reset('saves')">Reset</button></h4>
    <div class="seg cb-toggles"><button v-for="a in ABILITY_KEYS" :key="a" type="button" :class="{ on: cur.saves?.includes(a) }" @click="set('saves', toggle(cur.saves, a))">{{ ABILITY_SHORT[a] }}</button></div>

    <h4>Proficiencies <span class="cb-tag" :class="isOwn('armor') || isOwn('weapons') || isOwn('tools') ? 'changed' : tag('armor')">{{ isOwn('armor') || isOwn('weapons') || isOwn('tools') ? 'changed' : tag('armor') }}</span>
      <button v-if="isOwn('armor') || isOwn('weapons') || isOwn('tools')" type="button" class="link-btn small" @click="reset('armor'); reset('weapons'); reset('tools')">Reset</button></h4>
    <div class="cb-line"><span class="muted small">Armor</span><div class="seg cb-toggles"><button v-for="x in ARMOR" :key="x" type="button" :class="{ on: cur.armor?.includes(x) }" @click="set('armor', toggle(cur.armor, x))">{{ x }}</button></div></div>
    <div class="cb-line"><span class="muted small">Weapons</span><div class="seg cb-toggles"><button v-for="x in WEAPONS" :key="x" type="button" :class="{ on: cur.weapons?.includes(x) }" @click="set('weapons', toggle(cur.weapons, x))">{{ x }}</button></div></div>
    <label class="cb-line"><span class="muted small">Tools</span><input :value="(cur.tools ?? []).join(', ')" placeholder="e.g. Thieves' Tools" @change="set('tools', ($event.target as HTMLInputElement).value.split(',').map(x => x.trim()).filter(Boolean))" /></label>

    <h4>Skills <span class="cb-tag" :class="tag('skills')">{{ tag('skills') }}</span><button v-if="isOwn('skills')" type="button" class="link-btn small" @click="reset('skills')">Reset</button></h4>
    <div class="cb-line"><span class="muted small">Pick</span><input class="cb-num" type="number" min="0" max="18" :value="cur.skills?.count ?? 2" @change="set('skills', { count: num($event) ?? 0, from: cur.skills?.from ?? [] })" />
      <span class="muted small">from {{ cur.skills?.from?.length ? '' : 'any skill (none ticked)' }}</span></div>
    <div class="cb-skills"><button v-for="sk in SKILLS" :key="sk.name" type="button" class="chip-btn" :class="{ on: cur.skills?.from?.includes(sk.name) }" @click="set('skills', { count: cur.skills?.count ?? 2, from: toggle(cur.skills?.from, sk.name) })">{{ sk.name }}</button></div>

    <h4>Spellcasting <span class="cb-tag" :class="isOwn('caster') || isOwn('casting') ? 'changed' : tag('caster')">{{ isOwn('caster') || isOwn('casting') ? 'changed' : tag('caster') }}</span>
      <button v-if="isOwn('caster') || isOwn('casting')" type="button" class="link-btn small" @click="reset('caster'); reset('casting')">Reset</button></h4>
    <div class="cb-line">
      <select :value="cur.caster ?? 'none'" aria-label="Spell slots" @change="set('caster', ($event.target as HTMLSelectElement).value as ClassBasics['caster'])"><option v-for="c in CASTERS" :key="c.id" :value="c.id">{{ c.label }}</option></select>
      <select v-if="casts" :value="cur.casting ?? ''" aria-label="Casting ability" @change="set('casting', (($event.target as HTMLSelectElement).value || undefined) as ClassBasics['casting'])"><option value="">Casting ability…</option><option v-for="a in ABILITY_KEYS" :key="a" :value="a">{{ ABILITY_SHORT[a] }}</option></select>
    </div>
    <template v-if="casts">
      <div class="cb-levels">
        <table class="grid cb-table">
          <thead><tr><th>Level</th><th v-for="l in LEVELS" :key="l">{{ l }}</th></tr></thead>
          <tbody>
            <tr><th>Cantrips <button v-if="isOwn('cantrips')" type="button" class="link-btn small" @click="reset('cantrips')">Reset</button></th>
              <td v-for="(l, i) in LEVELS" :key="l"><input type="number" min="0" :value="cur.cantrips?.[i] ?? 0" :aria-label="`Cantrips at level ${l}`" @change="setAt('cantrips', i, ($event.target as HTMLInputElement).value)" /></td></tr>
            <tr><th>Prepared <button v-if="isOwn('prepared')" type="button" class="link-btn small" @click="reset('prepared')">Reset</button></th>
              <td v-for="(l, i) in LEVELS" :key="l"><input type="number" min="0" :value="cur.prepared?.[i] ?? 0" :aria-label="`Prepared spells at level ${l}`" @change="setAt('prepared', i, ($event.target as HTMLInputElement).value)" /></td></tr>
          </tbody>
        </table>
      </div>
      <label class="cb-line"><span class="muted small">Spellbook spells at level 1 (+2 a level)</span><input class="cb-num" type="number" min="0" :value="cur.spellbook ?? ''" placeholder="none" @change="set('spellbook', num($event) ?? 0)" /></label>
    </template>

    <h4>Feat levels <span class="cb-tag" :class="tag('featLevels')">{{ tag('featLevels') }}</span><button v-if="isOwn('featLevels')" type="button" class="link-btn small" @click="reset('featLevels')">Reset</button></h4>
    <div class="cb-skills"><button v-for="l in LEVELS" :key="l" type="button" class="chip-btn cb-lv" :class="{ on: cur.featLevels?.includes(l) }" @click="set('featLevels', toggle(cur.featLevels, l).sort((a, b) => a - b))">{{ l }}</button></div>

    <h4>Multiclassing <span class="cb-tag" :class="tag('multiclass')">{{ tag('multiclass') }}</span><button v-if="isOwn('multiclass')" type="button" class="link-btn small" @click="reset('multiclass')">Reset</button></h4>
    <div class="cb-line"><span class="muted small">Needs 13 in</span>
      <div class="seg cb-toggles"><button v-for="a in ABILITY_KEYS" :key="a" type="button" :class="{ on: mc.primary.includes(a) }" @click="setMc({ primary: toggle(mc.primary, a) })">{{ ABILITY_SHORT[a] }}</button></div>
      <label v-if="mc.primary.length > 1" class="small"><input type="checkbox" :checked="!!mc.any" @change="setMc({ any: ($event.target as HTMLInputElement).checked || undefined })" /> one of them is enough</label></div>
    <div class="cb-line"><span class="muted small">Gives</span>
      <div class="seg cb-toggles"><button v-for="x in [...ARMOR, ...WEAPONS]" :key="x" type="button" :class="{ on: [...mc.armor, ...mc.weapons].includes(x) }" @click="ARMOR.includes(x) ? setMc({ armor: toggle(mc.armor, x) }) : setMc({ weapons: toggle(mc.weapons, x) })">{{ x }}</button></div></div>
    <div class="cb-line"><label class="small">Tools <input :value="mc.tools.join(', ')" @change="setMc({ tools: ($event.target as HTMLInputElement).value.split(',').map(x => x.trim()).filter(Boolean) })" /></label>
      <label class="small">Skills <input class="cb-num" type="number" min="0" :value="mc.skills ?? 0" @change="setMc({ skills: num($event) || undefined })" /></label>
      <label class="small">Instruments <input class="cb-num" type="number" min="0" :value="mc.instruments ?? 0" @change="setMc({ instruments: num($event) || undefined })" /></label></div>
  </div>
</template>
