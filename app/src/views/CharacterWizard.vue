<script setup lang="ts">
// The character creation wizard (wizard.ts): step by step from class and level to a finished character with sheet,
// spellbook and inventory. Steps can be visited in any order; each says what it still needs, and the summary makes the
// character. Uses what the world has: its classes, species, backgrounds, feats, spells and items.
import { computed, ref, watch } from 'vue'
import type { Entry, Id } from '../model/types'
import {
  POINTS, POINT_COST, STANDARD_ARRAY, backgroundGold, backgroundKit, backgrounds, bonusAdds, bonusOf, casts, dieOfDraft,
  draftPc, featLevels, finalScores, hpOf, itemNamed, kitsOf, makeCharacter, pointsSpent, resetWizard, rules, species, subracesOf, mainRace,
  spellChoices, spellCounts, steps, subclassesOf, wizard,
} from '../wizard'
import { SUBCLASS_LEVEL } from '../classRules'
import { ABILITY_KEYS, ABILITY_NAME, ABILITY_SHORT, abilityBonusText } from '../abilityBonus'
import { DICE } from '../model/classes'
import { SKILLS, mod, signed, currentPc, setCurrent } from '../sheet'
import { choiceOpen, grantOptions, isClassOrigin, scaleAt, setCastAbility, setPicks as setTraitPicks, speciesGrants, speciesTraits, type ActiveTrait } from '../species'
import { entries, formatMoney, get, listOptions, playerMode } from '../store'
import { go, hrefEntry } from '../router'
import { newBlankEntry } from '../ui'
import { renderInline } from '../markdown'
import AppIcon from '../components/AppIcon.vue'
import EntryLink from '../components/EntryLink.vue'
import BonusPicker from '../components/BonusPicker.vue'
import ProfChips from '../components/ProfChips.vue'
import TraitChips from '../components/TraitChips.vue'
import TraitChoicePicker from '../components/TraitChoicePicker.vue'
import MarkdownView from '../components/MarkdownView.vue'

const d = computed(() => wizard.d)
const all = computed(() => steps(d.value))
const step = computed(() => all.value.find(s => s.id === wizard.step) ?? all.value[0])
const at = computed(() => all.value.findIndex(s => s.id === step.value.id))
const move = (by: number) => { const s = all.value[at.value + by]; if (s) { wizard.step = s.id; window.scrollTo(0, 0) } }
const openCount = computed(() => all.value.reduce((n, s) => n + s.open.length, 0))
const val = (ev: Event) => (ev.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
const num = (ev: Event) => Number(val(ev)) || 0

// ---- class ----
const classes = computed(() => listOptions('class'))
const r = computed(() => rules(d.value))
const subclasses = computed(() => (d.value.cls ? subclassesOf(d.value.cls) : []))
function setClass(cls: string) {
  Object.assign(wizard.d, { cls, subclass: undefined, skills: [], tools: [], cantrips: [], spells: [], book: [], classKit: 0 })
}
watch(() => d.value.level, () => { if (d.value.level < SUBCLASS_LEVEL) wizard.d.subclass = undefined })

// ---- species and background ----
const raceList = computed(() => species())
/** The main race picked, and its subraces (the character gets the subrace once one is picked). */
const main = computed(() => mainRace(d.value.race))
const subs = computed(() => subracesOf(main.value?.id))
const bgList = computed(() => backgrounds())
const pc = computed(() => draftPc(d.value))
const choices = computed(() => speciesTraits(pc.value).filter(a => !isClassOrigin(a.race) && a.active && (a.trait.choice || a.trait.castWith?.among?.length)))
/** The class's and subclass's features at the chosen level, by where they come from. */
const classFeatures = computed(() => speciesTraits(pc.value).filter(a => isClassOrigin(a.race) && a.active))
const featureGroups = computed(() => [...new Map(classFeatures.value.map(a => [a.race.id, a.race])).values()].map(r => ({ r, list: classFeatures.value.filter(a => a.race.id === r.id) })))
const pickFeature = (a: ActiveTrait, picks: string[]) => { const holder = { species: { ...wizard.d.species } } as Parameters<typeof setTraitPicks>[0]; setTraitPicks(holder, a.key, picks); wizard.d.species = holder.species! }
function setPicks(a: ActiveTrait, picks: string[]) {
  const all = { ...(wizard.d.species.picks ?? {}) }
  if (picks.filter(Boolean).length) all[a.key] = picks.filter(Boolean); else delete all[a.key]
  wizard.d.species = { ...wizard.d.species, picks: all }
}
/** Pick the ability a trait's spells are cast with (Elven Lineage: Int, Wis or Cha). */
const setCast = (a: ActiveTrait, ab: string) => { const holder = { species: { ...wizard.d.species } } as Parameters<typeof setCastAbility>[0]; setCastAbility(holder, a.key, ab as Parameters<typeof setCastAbility>[2]); wizard.d.species = holder.species! }

// ---- ability scores ----
const bonus = computed(() => bonusOf(d.value))
const adds = computed(() => bonusAdds(d.value))
const scores = computed(() => finalScores(d.value))
function setMethod(m: typeof wizard.d.method) {
  wizard.d.method = m
  wizard.d.base = m === 'pointbuy' ? Object.fromEntries(ABILITY_KEYS.map(a => [a, 8])) : m === 'typed' ? Object.fromEntries(ABILITY_KEYS.map(a => [a, 10])) : {}
}
const arrayLeft = (a: string) => STANDARD_ARRAY.filter((n, i) => {
  const usedBy = ABILITY_KEYS.filter(k => d.value.base[k] === n && k !== a).length
  return STANDARD_ARRAY.slice(0, i).filter(x => x === n).length >= usedBy
})
const setBase = (a: string, n: number | undefined) => { wizard.d.base = { ...wizard.d.base, [a]: n } }
const buy = (a: keyof typeof ABILITY_NAME, by: number) => {
  const n = (d.value.base[a] ?? 8) + by
  if (n < 8 || n > 15) return
  if (by > 0 && pointsSpent(d.value) - (POINT_COST[d.value.base[a] ?? 8] ?? 0) + POINT_COST[n] > POINTS) return
  setBase(a, n)
}
const speciesBonusText = computed(() => {
  for (let x = get(d.value.race); x; x = get(x.fields.parent as Id | undefined)) if (x.fields.abilityIncrease) return abilityBonusText(x.fields.abilityIncrease)
  return ''
})
const setBonusFrom = (f: typeof wizard.d.bonusFrom) => { wizard.d.bonusFrom = f; wizard.d.bonusChoice = { picks: [] } }
const featAdds = (a: keyof typeof ABILITY_NAME) => scores.value[a] - Math.min(20, (d.value.base[a] ?? 10) + (adds.value[a] ?? 0))

// ---- proficiencies ----
const granted = computed(() => speciesGrants(pc.value))
const grantedSkills = computed(() => new Map(granted.value.filter(g => g.kind === 'skill').map(g => [g.id, g.from])))
const skillFrom = computed(() => (r.value?.skills.from.length ? r.value.skills.from : SKILLS.map(s => s.name)))
const skillCount = computed(() => (r.value ? r.value.skills.count : d.value.ownSkillCount))
function toggleSkill(k: string) {
  const l = d.value.skills
  wizard.d.skills = l.includes(k) ? l.filter(x => x !== k) : l.length < skillCount.value ? [...l, k] : l
}
const toolItems = computed(() => entries.value.filter(e => e.type === 'item' && ['Tool', 'Instrument'].includes(String(e.fields.kind))).map(e => ({ id: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label)))
const languages = computed(() => listOptions('language'))
const armorTypes = computed(() => listOptions('item.armorType').filter(o => o.id !== 'Clothing'))
const toggleIn = (key: 'ownSaves' | 'ownArmor' | 'ownWeapons', v: string) => {
  const l = wizard.d[key] as string[]
  ;(wizard.d[key] as string[]) = l.includes(v) ? l.filter(x => x !== v) : [...l, v]
}

// ---- feats ----
const feats = computed(() => entries.value.filter(e => e.type === 'feat').sort((a, b) => a.name.localeCompare(b.name)))
const featsFor = (boon: boolean) => {
  const want = boon ? 'Epic Boon' : 'General Feat'
  const of = feats.value.filter(f => f.fields.category === want)
  return of.length ? of : feats.value.filter(f => f.fields.category !== 'Origin Feat')
}
const featAt = (level: number) => d.value.feats.find(f => f.level === level)
function setFeat(level: number, feat: string) {
  wizard.d.feats = [...d.value.feats.filter(f => f.level !== level), ...(feat ? [{ level, feat, choice: { picks: [] } }] : [])]
}
function setFeatChoice(level: number, choice: { alt?: boolean; picks: (keyof typeof ABILITY_NAME)[][] }) {
  wizard.d.feats = d.value.feats.map(f => (f.level === level ? { ...f, choice } : f))
}

// ---- hit points ----
const dieSize = computed(() => Number(dieOfDraft(d.value).replace(/\D/g, '')) || 8)
const setRoll = (i: number, v: string) => { const l = [...d.value.hpRolls]; l[i] = v === '' ? undefined : Math.max(1, Math.min(dieSize.value, Number(v) || 1)); wizard.d.hpRolls = l }

// ---- equipment ----
const kits = computed(() => r.value?.equipment ?? [])
const bgKit = computed(() => backgroundKit(d.value))
const bgGold = computed(() => backgroundGold(d.value))
const taken = computed(() => kitsOf(d.value))

// ---- spells ----
const sc = computed(() => spellChoices(d.value))
const counts = computed(() => spellCounts(d.value))
const spellFilter = ref('')
const shown = (list: Entry[]) => { const q = spellFilter.value.trim().toLowerCase(); return q ? list.filter(e => e.name.toLowerCase().includes(q)) : list }
const byLevel = computed(() => {
  const m = new Map<string, Entry[]>()
  for (const e of shown(sc.value.spells)) { const k = String(e.fields.level); if (!m.has(k)) m.set(k, []); m.get(k)!.push(e) }
  return [...m].sort((a, b) => Number(a[0]) - Number(b[0]))
})
function toggleSpell(key: 'cantrips' | 'spells' | 'book', id: Id, max?: number) {
  const l = d.value[key]
  if (l.includes(id)) { wizard.d[key] = l.filter(x => x !== id); return }
  if (max != null && l.length >= max) return
  if (key === 'spells') wizard.d.book = d.value.book.filter(x => x !== id)
  wizard.d[key] = [...l, id]
}
const bookMax = computed(() => (counts.value.book != null ? Math.max(0, counts.value.book - d.value.spells.length) : undefined))

// ---- make it ----
function create() {
  if (openCount.value && !confirm(`${openCount.value} thing${openCount.value === 1 ? ' is' : 's are'} still open. Make the character anyway?`)) return
  const e = makeCharacter(wizard.d)
  if (!currentPc.value) setCurrent(e.id)
  resetWizard()
  go(hrefEntry(e.id))
}
function startOver() { if (confirm('Clear everything chosen so far?')) resetWizard() }
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
</script>

<template>
  <div class="wizard-page">
    <header class="list-head">
      <h1><span class="icon"><AppIcon type="pc" /></span>New character</h1>
      <span class="muted small">Step by step; every step can be changed until the character is made.
        <button class="link-btn" @click="newBlankEntry('pc')">Make a blank one instead</button> · <button class="link-btn" @click="startOver">Start over</button></span>
    </header>

    <div class="wizard-grid">
      <nav class="card wizard-steps">
        <button v-for="(s, i) in all" :key="s.id" type="button" class="wz-step" :class="{ on: s.id === step.id, done: !s.open.length && i < all.length - 1 }" @click="wizard.step = s.id">
          <span class="wz-dot">{{ s.open.length ? i + 1 : '✓' }}</span>{{ s.label }}
          <small v-if="s.open.length" class="muted">{{ s.open.length }} open</small>
        </button>
      </nav>

      <section class="card wizard-body">
        <h2>{{ step.label }}</h2>
        <p v-if="step.open.length" class="wz-open small">Still to choose: {{ step.open.join(', ') }}</p>

        <!-- class and level -->
        <template v-if="step.id === 'class'">
          <div class="wz-tiles">
            <button v-for="c in classes" :key="c.id" type="button" class="wz-tile" :class="{ on: d.cls === c.id }" @click="setClass(c.id)">
              <b>{{ c.label }}</b><small class="muted">{{ rules({ ...d, cls: c.id }) ? `${dieOfDraft({ ...d, cls: c.id, die: undefined })} · ${rules({ ...d, cls: c.id })!.saves.map(a => ABILITY_SHORT[a]).join(' ')}` : 'filled in by hand' }}</small>
            </button>
          </div>
          <div class="wz-row">
            <label>Level <input type="number" min="1" max="20" :value="d.level" @change="wizard.d.level = Math.min(20, Math.max(1, num($event) || 1))" /></label>
            <label v-if="d.cls && !r">Hit die
              <select :value="dieOfDraft(d)" @change="wizard.d.die = val($event)"><option v-for="x in DICE" :key="x" :value="x">{{ x }}</option></select>
            </label>
          </div>
          <div v-if="d.cls && d.level >= SUBCLASS_LEVEL" class="wz-row">
            <label>Subclass
              <select :value="d.subclass ?? ''" @change="wizard.d.subclass = val($event) || undefined">
                <option value="">{{ subclasses.length ? 'Choose…' : 'none in this world' }}</option>
                <option v-for="s in subclasses" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </label>
          </div>
        </template>

        <!-- species and background -->
        <template v-else-if="step.id === 'origin'">
          <div class="wz-row">
            <label>Species
              <select :value="main?.id ?? ''" @change="wizard.d.race = val($event) || undefined">
                <option value="">Choose…</option>
                <option v-for="x in raceList" :key="x.id" :value="x.id">{{ x.name }}{{ subracesOf(x.id).length ? ` (${subracesOf(x.id).length} subrace${subracesOf(x.id).length === 1 ? '' : 's'})` : '' }}</option>
              </select>
            </label>
            <label v-if="subs.length">Subrace
              <select :value="d.race !== main?.id ? d.race : ''" @change="wizard.d.race = val($event) || main?.id">
                <option value="">Choose…</option>
                <option v-for="x in subs" :key="x.id" :value="x.id">{{ x.name }}</option>
              </select>
            </label>
            <label>Background
              <select :value="d.background ?? ''" @change="wizard.d.background = val($event) || undefined">
                <option value="">{{ bgList.length ? 'Choose…' : 'none in this world' }}</option>
                <option v-for="x in bgList" :key="x.id" :value="x.id">{{ x.name }}</option>
              </select>
            </label>
          </div>
          <p v-if="d.background" class="small">
            <EntryLink :id="d.background" />: <template v-if="get(d.background)?.fields.originFeat">Origin feat <EntryLink :id="String(get(d.background)?.fields.originFeat)" /><template v-if="get(d.background)?.fields.originFeatNote"> ({{ get(d.background)?.fields.originFeatNote }})</template>; </template>
            skills {{ (get(d.background)?.fields.skillProfs ?? []).join(', ') || '—' }}
          </p>
          <div v-for="a in choices" :key="a.key" class="wz-choice" :class="{ open: choiceOpen(a) }">
            <b>{{ a.trait.name }}</b> <span class="muted small">{{ a.race.name }}</span>
            <p v-if="a.trait.text" class="small md" v-html="renderInline(a.trait.text)" />
            <template v-if="a.trait.choice?.kind === 'option'">
              <select :value="a.option?.id ?? ''" @change="setPicks(a, [val($event)])">
                <option value="">Choose…</option>
                <option v-for="o in a.trait.choice!.options ?? []" :key="o.id" :value="o.id">{{ o.name }}</option>
              </select>
              <TraitChips v-if="a.option" :t="a.option" />
            </template>
            <TraitChoicePicker v-else-if="a.trait.choice" :a="a" @pick="p => setPicks(a, p)" />
            <label v-if="a.trait.castWith?.among?.length" class="small wz-cast">Casts its spells with
              <select :value="a.cast ?? ''" @change="setCast(a, val($event))">
                <option value="">Choose…</option>
                <option v-for="ab in a.trait.castWith.among" :key="ab" :value="ab">{{ ABILITY_NAME[ab] }}</option>
              </select>
            </label>
          </div>
        </template>

        <!-- ability scores -->
        <template v-else-if="step.id === 'scores'">
          <div class="seg">
            <button type="button" :class="{ on: d.method === 'array' }" @click="setMethod('array')">Standard array</button>
            <button type="button" :class="{ on: d.method === 'pointbuy' }" @click="setMethod('pointbuy')">Point buy</button>
            <button type="button" :class="{ on: d.method === 'typed' }" @click="setMethod('typed')">Typed in</button>
          </div>
          <p v-if="d.method === 'array'" class="muted small">Give each of 15, 14, 13, 12, 10 and 8 to one score.</p>
          <p v-else-if="d.method === 'pointbuy'" class="small" :class="{ 'wz-bad': pointsSpent(d) > POINTS }">{{ POINTS - pointsSpent(d) }} of {{ POINTS }} points left (scores 8 to 15; 14 costs 7, 15 costs 9).</p>
          <table class="wz-scores">
            <thead><tr><th /><th>Base</th><th>Bonus</th><th v-if="featLevels(d).length">Feats</th><th>Score</th><th>Mod</th></tr></thead>
            <tbody>
              <tr v-for="a in ABILITY_KEYS" :key="a">
                <th>{{ ABILITY_NAME[a] }}</th>
                <td>
                  <select v-if="d.method === 'array'" :value="d.base[a] ?? ''" @change="setBase(a, val($event) ? Number(val($event)) : undefined)">
                    <option value="">—</option>
                    <option v-for="n in [...new Set(arrayLeft(a))]" :key="n" :value="n">{{ n }}</option>
                  </select>
                  <span v-else-if="d.method === 'pointbuy'" class="wz-buy">
                    <button type="button" class="chip-btn" @click="buy(a, -1)">−</button><b>{{ d.base[a] ?? 8 }}</b><button type="button" class="chip-btn" @click="buy(a, 1)">＋</button>
                  </span>
                  <input v-else type="number" min="1" max="30" :value="d.base[a] ?? ''" @change="setBase(a, num($event) || undefined)" />
                </td>
                <td>
                  <input v-if="d.bonusFrom === 'custom'" type="number" min="-5" max="5" class="wz-small" :value="d.custom[a] ?? ''" placeholder="0" @change="wizard.d.custom = { ...d.custom, [a]: num($event) || undefined }" />
                  <template v-else>{{ adds[a] ? signed(adds[a]!) : '' }}</template>
                </td>
                <td v-if="featLevels(d).length">{{ featAdds(a) ? signed(featAdds(a)) : '' }}</td>
                <td><b v-flash="scores[a]">{{ scores[a] }}</b></td>
                <td>{{ signed(mod(scores[a])) }}</td>
              </tr>
            </tbody>
          </table>
          <h3>Ability score bonus</h3>
          <div class="seg">
            <button type="button" :class="{ on: d.bonusFrom === 'background' }" @click="setBonusFrom('background')">Background's</button>
            <button type="button" :class="{ on: d.bonusFrom === 'species' }" @click="setBonusFrom('species')">Species'</button>
            <button type="button" :class="{ on: d.bonusFrom === 'custom' }" @click="setBonusFrom('custom')">Custom</button>
          </div>
          <p class="muted small">
            <template v-if="d.bonusFrom === 'background'">{{ d.background ? abilityBonusText(get(d.background)?.fields.abilityIncrease) || 'This background gives none.' : 'Choose a background first.' }}</template>
            <template v-else-if="d.bonusFrom === 'species'">{{ d.race ? speciesBonusText || 'This species gives none.' : 'Choose a species first.' }}</template>
            <template v-else>Type the bonus for each score in the table.</template>
          </p>
          <BonusPicker v-if="bonus && d.bonusFrom !== 'custom'" v-model="wizard.d.bonusChoice" :bonus="bonus" />
        </template>

        <!-- proficiencies -->
        <template v-else-if="step.id === 'profs'">
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
          <h3>Languages</h3>
          <ProfChips :values="d.languages" :suggest="languages" :create="(x: string) => x" placeholder="Add a language…" @change="v => wizard.d.languages = v" />
        </template>

        <!-- class features -->
        <template v-else-if="step.id === 'features'">
          <p class="muted small">What the class{{ d.subclass ? ' and subclass give' : ' gives' }} at level {{ d.level }}; the sheet keeps them up to date as the character levels up. Make the choices here or later on the sheet.</p>
          <template v-for="g in featureGroups" :key="g.r.id">
            <h3><EntryLink :id="g.r.id" /></h3>
            <div v-for="a in g.list" :key="a.key" class="wz-feature" :class="{ open: choiceOpen(a) }">
              <details>
                <summary><b>{{ a.trait.name }}</b> <span class="muted small">level {{ a.trait.level ?? 1 }}</span>
                  <span v-if="scaleAt(a)" class="chip">{{ a.trait.scale!.label }} {{ scaleAt(a) }}</span></summary>
                <MarkdownView v-if="a.trait.text" class="small" :source="a.trait.text" />
              </details>
              <TraitChoicePicker v-if="a.trait.choice" :a="a" @pick="p => pickFeature(a, p)" />
            </div>
          </template>
        </template>

        <!-- feats -->
        <template v-else-if="step.id === 'feats'">
          <p class="muted small">A feat at each of these levels; an Ability Score Improvement is a feat too.</p>
          <div v-for="f in featLevels(d)" :key="f.level" class="wz-choice" :class="{ open: !featAt(f.level)?.feat }">
            <b>Level {{ f.level }}</b> <span class="muted small">{{ f.boon ? 'Epic Boon' : 'feat' }}</span>
            <select :value="featAt(f.level)?.feat ?? ''" @change="setFeat(f.level, val($event))">
              <option value="">Choose…</option>
              <option v-for="x in featsFor(f.boon)" :key="x.id" :value="x.id">{{ x.name }}</option>
            </select>
            <template v-if="get(featAt(f.level)?.feat)?.fields.abilityIncrease">
              <BonusPicker :bonus="get(featAt(f.level)!.feat)!.fields.abilityIncrease!" :model-value="featAt(f.level)!.choice" @update:model-value="c => setFeatChoice(f.level, c)" />
            </template>
          </div>
        </template>

        <!-- hit points -->
        <template v-else-if="step.id === 'hp'">
          <p class="small">{{ dieOfDraft(d) }} per level, with the Constitution modifier ({{ signed(mod(scores.con)) }}) each level. Level 1 takes the die's maximum; later levels the average unless you type a roll.</p>
          <table class="wz-scores">
            <tbody>
              <tr><th>Level 1</th><td>{{ dieSize }}</td></tr>
              <tr v-for="l in d.level - 1" :key="l"><th>Level {{ l + 1 }}</th>
                <td><input type="number" min="1" :max="dieSize" class="wz-small" :value="d.hpRolls[l - 1] ?? ''" :placeholder="String(dieSize / 2 + 1)" @change="setRoll(l - 1, val($event))" /></td></tr>
            </tbody>
          </table>
          <p><b>Hit points: <span v-flash="hpOf(d)">{{ hpOf(d) }}</span></b> <span class="muted small">(the species' or gear's extra HP comes on top on the sheet)</span></p>
        </template>

        <!-- equipment -->
        <template v-else-if="step.id === 'gear'">
          <template v-if="kits.length">
            <h3>From the class</h3>
            <label v-for="(k, i) in kits" :key="i" class="wz-kit">
              <input type="radio" :checked="d.classKit === i" @change="wizard.d.classKit = i" />
              <span><b>{{ String.fromCharCode(65 + i) }}</b> {{ k.items.map(l => `${l.amount ? l.amount + ' × ' : ''}${l.name}`).join(', ') }}<template v-if="k.items.length && k.money"> and </template>{{ k.money ? formatMoney(k.money) : '' }}</span>
            </label>
          </template>
          <p v-else-if="d.cls" class="muted small">This class has no starting equipment here; add it on the sheet.</p>
          <template v-if="bgKit || bgGold">
            <h3>From the background</h3>
            <label v-if="bgKit" class="wz-kit"><input type="radio" :checked="d.bgKit === 'items'" @change="wizard.d.bgKit = 'items'" />
              <span><b>A</b> {{ bgKit.items.map(l => `${l.amount ? l.amount + ' × ' : ''}${l.name}`).join(', ') }}<template v-if="bgKit.money"> and {{ formatMoney(bgKit.money) }}</template></span></label>
            <label v-if="bgGold" class="wz-kit"><input type="radio" :checked="d.bgKit === 'money'" @change="wizard.d.bgKit = 'money'" />
              <span><b>B</b> {{ formatMoney(bgGold) }}</span></label>
          </template>
          <h3>Goes into the inventory</h3>
          <p class="small"><template v-for="(l, i) in taken.items" :key="i"><template v-if="i">, </template>{{ l.amount ? l.amount + ' × ' : '' }}<EntryLink v-if="itemNamed(l.name)" :id="itemNamed(l.name)!.id" /><span v-else class="muted">{{ l.name }}</span></template>
            <template v-if="taken.money">; {{ formatMoney(taken.money) }}</template></p>
          <p class="muted small">Linked items are the world's; the rest go in by name.</p>
        </template>

        <!-- spells -->
        <template v-else-if="step.id === 'spells'">
          <p class="small">
            <template v-if="counts.cantrips != null">{{ d.cantrips.length }} of {{ counts.cantrips }} cantrips · {{ d.spells.length }} of {{ counts.prepared }} prepared spells</template>
            <template v-else>{{ d.cantrips.length }} cantrips · {{ d.spells.length }} spells (no limit known for this class)</template>
            <template v-if="sc.maxLevel"> · up to {{ ORD[sc.maxLevel] }} level</template>
            <template v-if="counts.book != null"> · spellbook {{ d.spells.length + d.book.length }} of {{ counts.book }}</template>
          </p>
          <input v-model="spellFilter" class="wz-filter" placeholder="Filter by name…" />
          <template v-if="sc.cantrips.length && counts.cantrips !== 0">
            <h3>Cantrips</h3>
            <div class="wz-skills">
              <button v-for="e in shown(sc.cantrips)" :key="e.id" type="button" class="chip-btn" :class="{ on: d.cantrips.includes(e.id) }" @click="toggleSpell('cantrips', e.id, counts.cantrips)">{{ e.name }}</button>
            </div>
          </template>
          <template v-for="[lvl, list] in byLevel" :key="lvl">
            <h3>{{ ORD[Number(lvl)] }} level</h3>
            <div class="wz-skills">
              <span v-for="e in list" :key="e.id" class="wz-spell">
                <button type="button" class="chip-btn" :class="{ on: d.spells.includes(e.id) }" :title="'Prepared'" @click="toggleSpell('spells', e.id, counts.prepared)">{{ e.name }}</button>
                <button v-if="counts.book != null && !d.spells.includes(e.id)" type="button" class="chip-btn wz-book" :class="{ on: d.book.includes(e.id) }" title="In the spellbook, not prepared" @click="toggleSpell('book', e.id, bookMax)">📖</button>
              </span>
            </div>
          </template>
          <p v-if="!sc.cantrips.length && !sc.spells.length" class="muted small">The world has no spells for this class (a spell's Classes field lists who can cast it).</p>
        </template>

        <!-- name and story -->
        <template v-else-if="step.id === 'details'">
          <div class="wz-form">
            <label>Name <input :value="d.name" placeholder="The character's name" @input="wizard.d.name = val($event)" /></label>
            <label v-if="!playerMode">Player <input :value="d.player" @input="wizard.d.player = val($event)" /></label>
            <label v-for="(v, k) in d.looks" :key="k">{{ k.charAt(0).toUpperCase() + k.slice(1) }} <input :value="v" @input="wizard.d.looks = { ...d.looks, [k]: val($event) }" /></label>
          </div>
          <label class="wz-story">Story <textarea rows="6" :value="d.story" placeholder="Where they come from, what they want… (Markdown)" @input="wizard.d.story = val($event)" /></label>
        </template>

        <!-- summary -->
        <template v-else-if="step.id === 'summary'">
          <p class="wz-sum-head"><b>{{ d.name || 'Unnamed' }}</b>, level {{ d.level }} {{ classes.find(c => c.id === d.cls)?.label ?? 'no class' }}<template v-if="d.subclass"> ({{ get(d.subclass)?.name }})</template>
            <template v-if="d.race"> · {{ get(d.race)?.name }}</template><template v-if="d.background"> · {{ get(d.background)?.name }}</template></p>
          <div class="wz-sum-scores">
            <span v-for="a in ABILITY_KEYS" :key="a" class="wz-score"><small>{{ ABILITY_SHORT[a].toUpperCase() }}</small><b>{{ scores[a] }}</b><small>{{ signed(mod(scores[a])) }}</small></span>
          </div>
          <p class="small"><b>HP</b> {{ hpOf(d) }} · <b>Hit dice</b> {{ d.level }}{{ dieOfDraft(d) }} · <b>Saves</b> {{ (r ? r.saves : d.ownSaves).map(a => ABILITY_SHORT[a]).join(', ') || '—' }}</p>
          <p class="small"><b>Skills</b> {{ [...d.skills, ...grantedSkills.keys()].sort().join(', ') || '—' }}</p>
          <p class="small"><b>Feats</b> {{ [get(get(d.background)?.fields.originFeat)?.name, ...d.feats.filter(f => featLevels(d).some(x => x.level === f.level)).map(f => get(f.feat)?.name)].filter(Boolean).join(', ') || '—' }}</p>
          <p class="small"><b>Equipment</b> {{ taken.items.map(l => (l.amount ? l.amount + ' × ' : '') + l.name).join(', ') || '—' }}<template v-if="taken.money">; {{ formatMoney(taken.money) }}</template></p>
          <p v-if="casts(d)" class="small"><b>Spells</b> {{ [...d.cantrips, ...d.spells].map(id => get(id)?.name).join(', ') || '—' }}</p>
          <p v-if="openCount" class="wz-open small">Still open: {{ all.flatMap(s => s.open).join(', ') }}</p>
          <button type="button" class="primary wz-make" @click="create">Make the character</button>
        </template>

        <footer class="wizard-foot">
          <button type="button" :disabled="!at" @click="move(-1)">← Back</button>
          <button v-if="at < all.length - 1" type="button" class="primary" @click="move(1)">Next: {{ all[at + 1].label }} →</button>
        </footer>
      </section>
    </div>
  </div>
</template>
