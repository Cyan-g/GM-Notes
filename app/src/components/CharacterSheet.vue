<script setup lang="ts">
// A player character's sheet, filled in right here: scores, proficiencies, HP, inventory and features.
// Under it, what they wear and wield (Equipped) sits beside the inventory, half and half.
// Modifiers, saves, skills, AC, attacks and spellcasting are worked out from them.
// On the character's page it's for play: only what changes at the table (HP, hit dice, inspiration, inventory).
// On the Edit page (`build`) it also opens what's set when building the character: classes and their levels
// (multiclassing), max HP, AC, speed, scores, proficiencies, spellcasting and features.
// Hit dice come from the classes, one pool per die size, each spent on its own.
import Dropdown from './Dropdown.vue'
import { useReadOnly } from '../composables/useReadOnly'
import AppIcon from './AppIcon.vue'
import ConditionIcon from './ConditionIcon.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { CharacterSheet, ClassLine, DeathSaveState, Entry, Id, Proficiencies } from '../model/types'
import { byType, get, listOptions, setList, state } from '../store'
import { CLASS_DIE, DICE, classText, classesOf } from '../model/classes'
import { dieOf } from '../classRules'
import { changed } from '../edit'
import { hrefEntry, hrefTab } from '../router'
import {
  armorClass, attacks, baseMaxHp, canAttune, canEquip, castingAbility, conHpPart, hitDiceOf, initiative, levelOf, maxHpOf, passivePerception, setMaxHp, profsOf, saveBonus,
  skillBonus, skillLevel, speedOf, baseSpeed, otherSpeeds, longRest, shortRest, restSummary,
} from '../sheet'
import { profsToEdit, sheetOrBlank, sheetToEdit } from '../sheetData'
import { noteUndo, restoreSheet, snapSheet } from '../undoNote'
import { ABILITIES, SKILLS, concentrationDc, dieSize, mod, profBonus, signed, type Ability } from '../model/dnd'
import { advOf, breakdown, concentrationAdv, deathSaveAdv, gearTotals, scoreBreakdown, scoreWith, sum, type Part } from '../effects'
import { chargesLeft, setCharges, type RegainRoll } from '../items'
import ProfChips from './ProfChips.vue'
import ItemModal from './ItemModal.vue'
import GearToggles from './GearToggles.vue'
import PcPortrait from './PcPortrait.vue'
import FeatureList from './FeatureList.vue'
import FeatureChoices from './FeatureChoices.vue'
import UsesCard from './UsesCard.vue'
import { rule } from '../rules'
import ActiveSpellsCard from './ActiveSpellsCard.vue'
import ConditionsBar from './ConditionsBar.vue'
import DeathSaves from './DeathSaves.vue'
import LevelUpModal from './LevelUpModal.vue'
import { XP_AT } from '../sheet'
import { endConcentration, hpChanged, isDead, noDeathSaves, settleDeathSaves } from '../conditions'
import { featOfFeature, originFeatOf, picksLeft, speciesEffects, speciesExpertise, speciesGrants, speciesSizes, speciesTraits } from '../species'
import { ui } from '../ui'

const props = defineProps<{ pc: Entry; build?: boolean }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
/** Build-time parts are locked unless the sheet is being edited. */
const build = computed(() => !!props.build && !ro.value)
const locked = computed(() => !build.value)
/** The stored sheet, or a blank one until the first change stores it. */
const s = computed<CharacterSheet>(() => sheetOrBlank(props.pc))
const level = computed(() => levelOf(props.pc))
const prof = computed(() => profBonus(level.value))
const ac = computed(() => armorClass(s.value))
const atks = computed(() => attacks(s.value, prof.value))
const cast = computed(() => castingAbility(props.pc, s.value))
// ---- what the active gear changes (effects.ts): the numbers below include it, a ✦ marks them, hovering says why ----
const gt = computed(() => gearTotals(s.value))
/** Senses, resistances, immunities and feature lines from gear (the species' and features' are listed with them). */
const fromGear = computed(() => {
  const sp = new Set(speciesEffects(props.pc, s.value).map(x => x.name)), mine = (x: { from: string }) => !sp.has(x.from)
  return { senses: gt.value.senses.filter(mine), resistances: gt.value.resistances.filter(mine), immunities: gt.value.immunities.filter(mine), damageImmunities: gt.value.damageImmunities.filter(mine), features: gt.value.features.filter(mine) }
})
/** Choices the character's classes, species and background still wait for. */
/** Picks still to make on the Edit page (invocations left, a lineage, a casting ability…). */
const openChoices = computed(() => speciesTraits(props.pc, s.value).filter(a => a.active).reduce((n, a) => n + picksLeft(a), 0))
const scoreOf = (a: Ability) => scoreWith(s.value, a, gt.value)
const scoreTip = (a: Ability) => scoreBreakdown(s.value, a, gt.value)
/** A total's tooltip: what it is without gear, then each item's part. */
const tipOf = (total: number, parts: Part[], fmt = signed) => breakdown(`${fmt(total - sum(parts))} without gear`, parts)
/** Advantage or disadvantage from gear on a skill or a save (they cancel out). */
const skillAdv = (name: string) => advOf(gt.value.skillAdv[name])
const saveAdv = (a: Ability) => advOf(gt.value.saveAdv[a])
const saveParts = (a: Ability) => [...gt.value.saves, ...(gt.value.save[a] ?? [])]
const initTotal = computed(() => initiative(s.value))
const maxHp = computed(() => maxHpOf(s.value))
/** What max HP is made of beyond the number set: a CON change since, and gear or features. */
const hpParts = computed(() => [conHpPart(s.value), ...gt.value.maxHp].filter(p => !!p))
const castMod = computed(() => (cast.value ? mod(scoreOf(cast.value)) : 0))
const spellDC = computed(() => 8 + prof.value + castMod.value + sum(gt.value.spellDC))
const spellAtk = computed(() => prof.value + castMod.value + sum(gt.value.spellAttack))

function edit(fn: (s: CharacterSheet) => void) {
  if (ro.value) return
  fn(sheetToEdit(props.pc))
  changed(props.pc)
}
const num = (ev: Event) => { const v = (ev.target as HTMLInputElement).value.trim(); return v === '' ? undefined : Number(v) }
const text = (ev: Event) => (ev.target as HTMLInputElement).value.trim() || undefined
/** What inspiration does under the world's rules (Ruleset), for the star's tooltip. */
const inspirationTip = computed(() => (rule('inspiration') === 'classic' ? 'Inspiration: spend it for advantage on one attack roll, saving throw or ability check' : 'Heroic Inspiration: spend it to reroll any one die right after rolling it'))
/** Feet typed as "35" or "35 ft"; nothing typed (or no number) is none. */
const feet = (ev: Event) => { const m = (ev.target as HTMLInputElement).value.match(/\d+/); return m ? Number(m[0]) : undefined }
/** The typed speed as shown: "35 ft". */
const ft = (n: number | undefined) => (n != null ? `${n} ft` : '')
function setLevel(ev: Event) {
  if (locked.value) return
  const v = num(ev)
  if (v == null) delete props.pc.fields.level; else props.pc.fields.level = Math.min(20, Math.max(1, Math.round(v)))
  changed(props.pc)
}

// ---- classes: each with its level, subclass and (for a class without a standard one) hit die ----
const classes = computed(() => classesOf(props.pc))
const classLabel = computed(() => classText(props.pc, state.db?.meta, id => get(id)?.name))
function setClasses(fn: (l: ClassLine[]) => void) {
  if (locked.value) return
  const l: ClassLine[] = JSON.parse(JSON.stringify(classes.value))
  fn(l)
  if (l.length) { props.pc.fields.classLevels = l; delete props.pc.fields.level } else delete props.pc.fields.classLevels
  changed(props.pc)
}
const classOptions = (cur: string) => listOptions('class').filter(o => o.id === cur || !classes.value.some(l => l.class === o.id))
const subclassesOf = (cls: string) => (byType.value.get('subclass') ?? []).filter(e => e.fields.class === cls)
function addClass() {
  const free = classOptions('')[0]
  if (!free) return
  // The first class takes over a plain level the character had.
  setClasses(l => l.push({ class: free.id, level: l.length ? 1 : Math.min(20, Math.max(1, Number(props.pc.fields.level) || 1)) }))
}
const setClass = (i: number, cls: string) => setClasses(l => { l[i] = { class: cls, level: l[i].level } })
const setClassLevel = (i: number, v: number | undefined) => setClasses(l => { l[i].level = Math.min(20, Math.max(1, Math.round(v ?? 1))) })
const setSubclass = (i: number, id: string) => setClasses(l => { if (id) l[i].subclass = id; else delete l[i].subclass })
const setDie = (i: number, die: string) => setClasses(l => { if (die && die !== CLASS_DIE[l[i].class]) l[i].die = die; else delete l[i].die })
const levelOver = computed(() => classes.value.reduce((n, l) => n + (Number(l.level) || 0), 0) > 20)

// ---- hit dice: one pool per die size ----
const pools = computed(() => hitDiceOf(props.pc, s.value))
function setLeft(die: string, total: number, v: number | undefined) {
  edit(x => {
    const spent = Math.min(total, Math.max(0, total - (v ?? total)))
    const m = { ...(x.hitDiceSpent ?? {}) }
    if (spent) m[die] = spent; else delete m[die]
    if (Object.keys(m).length) x.hitDiceSpent = m; else delete x.hitDiceSpent
  })
}

const toggleSave = (a: Ability) => build.value && edit(x => { x.saves = x.saves.includes(a) ? x.saves.filter(y => y !== a) : [...x.saves, a] })
/**
 * Skill proficiency cycles: none → proficient → expertise → none. A skill the background, species, class or a feat
 * gives can't be taken away here: a click only switches expertise on it.
 */
const cycleSkill = (name: string) => build.value && edit(x => {
  const v = x.skills[name]
  if (grantedSkill(name)) { if (v === 2) delete x.skills[name]; else x.skills[name] = 2; return }
  if (!v) x.skills[name] = 1; else if (v === 1) x.skills[name] = 2; else delete x.skills[name]
})
/** Where a skill the character has anyway comes from (background, species, class, feat), if it does. */
const grantedSkill = (name: string) => given.value.find(g => g.kind === 'skill' && g.id === name)?.from
/** How a skill shows while editing: what's typed, at least proficient when it's granted, expertise from a feature. */
const buildLevel = (name: string) => (speciesExpertise(props.pc, s.value).has(name) ? 2 : Math.max(s.value.skills[name] ?? 0, grantedSkill(name) ? 1 : 0))
const skillTitle = (name: string) => {
  const from = grantedSkill(name)
  if (from) return `Proficient from ${from}: always. Click for expertise${s.value.skills[name] === 2 ? ' (on)' : ''}`
  return 'Click: proficient, expertise, none'
}
const skillsOf = (a: Ability) => SKILLS.filter(sk => sk.ability === a)
// ---- the Origin feat: the background's unless the sheet names another, or none ----
const background = computed(() => get(props.pc.fields.background as Id | undefined))
const bgFeat = computed(() => get(background.value?.fields.originFeat as Id | undefined))
const originFeats = computed(() => (byType.value.get('feat') ?? []).filter(e => e.fields.category === 'Origin Feat' && e.id !== bgFeat.value?.id).sort((a, b) => a.name.localeCompare(b.name)))
const originValue = computed(() => (s.value.originFeat === null ? 'none' : s.value.originFeat ?? ''))
function setOrigin(v: string) {
  const before = originFeatOf(props.pc, s.value)?.id
  edit(x => {
    if (v === '') delete x.originFeat; else x.originFeat = v === 'none' ? null : v
    // a feature line that was the old Origin feat (the wizard writes one) goes with it
    if (before) x.features = x.features.filter(f => featOfFeature(f)?.id !== before)
  })
}
const skillMark = (name: string) => ({ 1: '●', 2: '◉' } as Record<number, string>)[(build.value ? buildLevel(name) : skillLevel(s.value, name)) ?? 0] ?? '○'

/** Damage or healing typed into the HP box: "-7" or "+5"; temp HP soaks damage first. */
function hit(ev: Event) {
  const input = ev.target as HTMLInputElement
  const n = Number(input.value)
  input.value = ''
  if (!n) return
  edit(x => {
    const before = x.hp ?? maxHp.value ?? 0
    let hp = before
    if (n < 0) {
      let dmg = -n
      const soak = Math.min(x.tempHp ?? 0, dmg)
      if (soak) { x.tempHp = (x.tempHp ?? 0) - soak || undefined; dmg -= soak }
      hp = Math.max(0, hp - dmg)
      // still standing and concentrating: a CON save to keep it
      if ((hp > 0 || !maxHp.value) && x.conditions?.includes('Concentrating')) concDc.value = concentrationDc(-n)
    } else {
      // three failed death saves: dead; healing brings them back only if the player or DM says so (a revivify)
      if (isDead(x.deathSaves) && !window.confirm(`${props.pc.name} is dead (three failed death saves). Heal them anyway?`)) return
      hp = maxHp.value != null ? Math.min(maxHp.value, hp + n) : hp + n
    }
    x.hp = hp
    if (maxHp.value) hpChanged(props.pc, x, before, hp, n < 0)
  })
}
/** Typed straight into the current HP box. */
function setHpNow(ev: Event) {
  edit(x => {
    const before = x.hp ?? maxHp.value ?? 0
    x.hp = num(ev)
    if (maxHp.value) hpChanged(props.pc, x, before, x.hp ?? maxHp.value, (x.hp ?? before) < before)
  })
}
/** The CON save the last damage asks for while concentrating (gone once answered). */
const concDc = ref<number | null>(null)
const concDone = (kept: boolean) => { if (!kept) edit(x => endConcentration(props.pc, x)); concDc.value = null }
const dying = computed(() => !build.value && !!maxHp.value && (s.value.hp ?? maxHp.value) <= 0)
const setSaves = (d: DeathSaveState) => edit(x => { if (noDeathSaves(d)) delete x.deathSaves; else x.deathSaves = settleDeathSaves(d) })
// a rest says what it gave back, with Undo (a stray click at the table)
function restNow(kind: 'short' | 'long') {
  if (ro.value) return
  const before = snapSheet(props.pc)
  rolls.value = kind === 'long' ? longRest(props.pc) : shortRest(props.pc)
  noteUndo(restSummary(props.pc, before, kind), () => { restoreSheet(props.pc, before)(); rolls.value = [] })
}
const rest = () => restNow('long')
const short = () => restNow('short')
/** Item charges a rest gives back by a dice roll: the player rolls and types the number. */
const rolls = ref<RegainRoll[]>([])
function addCharges(r: RegainRoll, v: string) {
  const n = Math.max(0, Number(v) || 0)
  if (n) edit(x => { const l = x.inventory[r.i], item = get(l?.item); if (l && item) setCharges(x, r.i, (chargesLeft(l, item) ?? 0) + n) })
  rolls.value = rolls.value.filter(x => x !== r)
}

// ---- items in the attack lines open in a pop-up ----
const shown = ref<number | null>(null)
const shownLine = computed(() => (shown.value != null ? s.value.inventory[shown.value] : undefined))
const showItem = (id: string) => { const i = s.value.inventory.findIndex(l => l.item === id); if (i >= 0) shown.value = i }

// ---- proficiencies: picked from the lists items use, so attacks, armor and the Workbench can check them ----
// editing shows only the typed ones; the species' are added on the sheet itself
const profs = computed(() => profsOf(s.value, build.value))
// Clothing needs no proficiency, so it isn't offered.
const armorTypes = computed(() => listOptions('item.armorType').filter(o => o.id !== 'Clothing'))
const tools = computed(() => (byType.value.get('item') ?? []).filter(e => e.fields.kind === 'Tool').map(e => ({ id: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label)))
/** A language typed on the sheet that isn't in the list yet is added to it. */
function newLanguage(label: string) {
  const l = listOptions('language')
  if (!l.some(o => o.id === label)) setList('language', [...l, { id: label, label }])
  return label
}
const setProfs = (k: Exclude<keyof Proficiencies, 'other'>, v: string[]) => edit(x => { profsToEdit(x)[k] = v })

// ---- features ----
const addFeature = () => edit(x => { x.features.push({ name: '', text: '' }) })
const castLabel = computed(() => (s.value.spellAbility ? s.value.spellAbility.toUpperCase() : cast.value ? `${cast.value.toUpperCase()} (class)` : 'None'))
/** Experience needed for each level (1…20), the same in 2014 and 2024. */
const xpNext = computed(() => XP_AT[level.value])
const sizes = computed(() => speciesSizes(props.pc))
const leveling = ref(false)
// Level up is in the Edit button's menu (EntryHeader): it asks for this character's dialog
watch(() => ui.levelUp, id => { if (id && id === props.pc.id) { leveling.value = true; ui.levelUp = null } }, { immediate: true })
const SKILL_LEVEL: Record<number, string> = { 1: 'Proficient', 2: 'Expertise' }

// ---- building: the hit points the dice give on average (the player may have rolled instead; their call) ----
const avgHp = computed(() => {
  const con = mod(scoreOf('con'))
  const lines = classes.value.length ? classes.value.map(l => ({ die: dieOf(l), n: Number(l.level) || 0 })) : [{ die: s.value.hitDie || 'd8', n: level.value }]
  let total = 0, first = true
  for (const l of lines) for (let k = 0; k < l.n; k++) { total += Math.max(1, (first ? (dieSize(l.die) || 8) : (dieSize(l.die) || 8) / 2 + 1) + con); first = false }
  return total || undefined
})
const avgText = computed(() => {
  const con = mod(scoreOf('con')), first = classes.value[0] ? dieOf(classes.value[0]) : s.value.hitDie || 'd8'
  return `${first} in full at level 1, the average after, ${signed(con)} CON each level`
})
// what the classes, species, background and feats give, shown greyed beside what's typed
const given = computed(() => speciesGrants(props.pc, s.value))
const givenOf = (k: 'armor' | 'weapon' | 'tool' | 'language') => given.value.filter(g => g.kind === k).map(g => ({ id: g.id, from: g.from }))
const otherOpen = ref(false)
// a feature added and left without a name or text goes when the editing ends
onBeforeUnmount(() => {
  if (!build.value) return
  const empty = (f: { name: string; text: string }) => !f.name.trim() && !f.text.trim()
  if (s.value.features?.some(empty)) edit(x => { x.features = x.features.filter(f => !empty(f)) })
})
</script>

<template>
  <div class="char-sheet" :class="{ ro }">
    <!-- building: the classes, each with its level, subclass and hit die -->
    <section v-if="build" class="cs-classes">
      <h4>Classes <span v-if="classes.length" class="muted small">level {{ level }}</span><button class="link-btn" :disabled="!classOptions('').length" @click="addClass">＋ Class</button></h4>
      <p v-if="!classes.length" class="muted small">No class yet: the level below counts on its own.</p>
      <div v-for="(l, i) in classes" :key="i" class="cs-class-row">
        <Dropdown :value="l.class" :aria-label="`Class ${i + 1}`" @change="setClass(i, ($event.target as HTMLSelectElement).value)">
          <option v-for="o in classOptions(l.class)" :key="o.id" :value="o.id">{{ o.label }}</option>
        </Dropdown>
        <label class="small">Level <input type="number" min="1" max="20" :value="l.level" @change="setClassLevel(i, num($event))" /></label>
        <Dropdown :value="l.subclass ?? ''" :aria-label="`Subclass of class ${i + 1}`" :disabled="!subclassesOf(l.class).length && !l.subclass" @change="setSubclass(i, ($event.target as HTMLSelectElement).value)">
          <option value="">{{ subclassesOf(l.class).length ? 'Subclass…' : 'No subclasses' }}</option>
          <option v-for="sc in subclassesOf(l.class)" :key="sc.id" :value="sc.id">{{ sc.name }}</option>
        </Dropdown>
        <Dropdown v-if="!CLASS_DIE[l.class]" :value="dieOf(l)" title="This class's hit die" @change="setDie(i, ($event.target as HTMLSelectElement).value)">
          <option v-for="d in DICE" :key="d" :value="d">{{ d }}</option>
        </Dropdown>
        <span v-else class="muted small" title="The class's hit die">{{ dieOf(l) }}</span>
        <button class="link-btn x" title="Remove this class" @click="setClasses(x => x.splice(i, 1))">✕</button>
      </div>
      <p v-if="levelOver" class="error small">The class levels add up to more than 20; the sheet counts 20.</p>
    </section>
    <!-- building: the choices the classes, species, background and feats ask for, right below the classes -->
    <FeatureChoices v-if="build" :pc="pc" :s="s" />
    <div class="cs-top" :class="{ 'with-portrait': !build, 'no-portrait': !build && !pc.image }">
    <PcPortrait v-if="!build" :pc="pc" />
    <div class="cs-top-right">
    <LevelUpModal v-if="leveling" :pc="pc" :s="s" @close="leveling = false" />
    <!-- the strip at the top: the numbers looked at most -->
    <!-- building: what the sheet works out, in one line; below it, what's set by hand -->
    <div v-if="build" class="cs-build">
      <p class="cs-summary small">
        <span>Level <b>{{ level }}</b></span><span>Proficiency <b>{{ signed(prof) }}</b></span><span>AC <b>{{ ac.ac }}</b></span><span>Speed <b>{{ speedOf(s) ?? '30 ft' }}</b></span><span>Initiative <b>{{ signed(initTotal) }}</b></span><span>Passive Perception <b>{{ passivePerception(s, prof) }}</b></span><span v-if="cast">Spell save DC <b>{{ spellDC }}</b></span>
      </p>
      <div class="cs-set">
        <label v-if="!classes.length"><span>Level</span><input type="number" min="1" max="20" :value="pc.fields.level ?? ''" placeholder="1" @change="setLevel" /></label>
        <label v-if="!classes.length"><span>Hit die</span><Dropdown :value="s.hitDie || 'd8'" @change="edit(x => x.hitDie = ($event.target as HTMLSelectElement).value)"><option v-for="d in DICE" :key="d" :value="d">{{ d }}</option></Dropdown></label>
        <div class="cs-set-hp">
          <label><span>Max HP</span><input type="number" :value="baseMaxHp(s) ?? ''" :placeholder="avgHp ? String(avgHp) : 'max'" title="Maximum HP" @change="edit(x => setMaxHp(x, num($event)))" /></label>
          <small v-if="avgHp && baseMaxHp(s) !== avgHp" class="muted" :title="avgText">average {{ avgHp }} <button type="button" class="link-btn" @click="edit(x => setMaxHp(x, avgHp))">use it</button></small>
        </div>
        <label><span>AC</span><input type="number" :value="s.acOverride ?? ''" :placeholder="`auto (${ac.ac})`" title="Type an AC to use instead of the worked-out one" @change="edit(x => x.acOverride = num($event))" /></label>
        <label><span>Speed</span><input :value="ft(s.speed)" :placeholder="ft(baseSpeed(s) ?? 30)" @change="edit(x => x.speed = feet($event))" /></label>
        <label v-if="sizes.length > 1" title="The species lets the player pick its size"><span>Size</span><Dropdown :value="s.size && sizes.includes(s.size) ? s.size : sizes[0]" @change="edit(x => x.size = ($event.target as HTMLSelectElement).value === sizes[0] ? undefined : ($event.target as HTMLSelectElement).value)"><option v-for="z in sizes" :key="z" :value="z">{{ z }}</option></Dropdown></label>
      </div>
    </div>
    <div v-else class="cs-strip">
      <label v-if="!classes.length" class="cs-stat"><span>Level</span><input type="number" min="1" max="20" :value="pc.fields.level ?? ''" placeholder="1" :disabled="locked" @change="setLevel" /></label>
      <div v-else class="cs-stat" :title="classLabel"><span>Level</span><b v-flash.neutral="level">{{ level }}</b></div>
      <div class="cs-stat"><span>Proficiency</span><b v-flash="prof">{{ signed(prof) }}</b></div>
      <div class="cs-stat cs-ac tip" :class="{ warn: ac.untrained.length }" :data-tip="ac.from + (ac.untrained.length ? ` — not proficient with ${ac.untrained.join(', ')}: disadvantage on STR and DEX rolls, no spellcasting` : '')"><span>Armor class<template v-if="ac.untrained.length"> <AppIcon ui="warning" /></template></span><b v-flash="ac.ac" :class="{ 'gear-mod': gt.ac.length }">{{ ac.ac }}</b>
        <input v-if="build" class="cs-mini" type="number" :value="s.acOverride ?? ''" placeholder="auto" title="Type an AC to use instead of the worked-out one" @change="edit(x => x.acOverride = num($event))" /></div>
      <label class="cs-stat" :class="{ tip: gt.speed.length }" :data-tip="breakdown(`${ft(baseSpeed(s) ?? 30)} without gear`, gt.speed)"><span :class="{ 'gear-mod': gt.speed.length }">Speed</span><input v-flash="locked ? speedOf(s) : s.speed" :value="(locked ? speedOf(s) : ft(s.speed)) ?? ''" :placeholder="ft(baseSpeed(s) ?? 30)" :disabled="locked" @change="edit(x => x.speed = feet($event))" /><small v-if="otherSpeeds(s)" class="muted cs-speeds">{{ otherSpeeds(s) }}</small></label>
      <label v-if="build && sizes.length > 1" class="cs-stat" title="The species lets the player pick its size"><span>Size</span><Dropdown :value="s.size && sizes.includes(s.size) ? s.size : sizes[0]" @change="edit(x => x.size = ($event.target as HTMLSelectElement).value === sizes[0] ? undefined : ($event.target as HTMLSelectElement).value)"><option v-for="z in sizes" :key="z" :value="z">{{ z }}</option></Dropdown></label>
      <label v-if="rule('experience') === 'xp'" class="cs-stat cs-xp" :title="xpNext ? `Level ${level + 1} at ${xpNext.toLocaleString()} XP` : 'Highest level'"><span>XP</span><input v-flash="s.xp ?? 0" type="number" min="0" :value="s.xp ?? ''" placeholder="0" :disabled="ro" @change="edit(x => x.xp = num($event) || undefined)" /><small v-if="xpNext" class="muted">/ {{ xpNext.toLocaleString() }}</small></label>
      <button v-if="!build && rule('inspiration') !== 'off'" class="cs-stat cs-insp" :class="{ on: s.inspiration }" :disabled="ro" :title="inspirationTip" @click="edit(x => x.inspiration = !x.inspiration || undefined)"><span>{{ rule('inspiration') === 'heroic' ? 'Heroic Inspiration' : 'Inspiration' }}</span><b><AppIcon ui="star" :class="{ off: !(s.inspiration) }" /></b></button>
    </div>

    <div v-if="!build" class="cs-hp-cards">
    <div class="cs-hp">
      <div class="cs-hp-main">
        <span class="cs-label">{{ build ? 'Maximum hit points' : 'Hit points' }}</span>
        <div class="cs-hp-row">
          <template v-if="!build">
            <input v-flash="s.hp ?? maxHp" class="cs-hp-now" type="number" :value="s.hp ?? maxHp ?? ''" placeholder="now" :disabled="ro" title="Current HP" @change="setHpNow" />
            <span class="muted">/</span>
          </template>
          <span :class="{ tip: hpParts.length && !build, 'gear-mod': gt.maxHp.length && !build }" :data-tip="build ? undefined : breakdown(`${s.maxHp ?? 0} set`, hpParts)"><input v-flash="build ? baseMaxHp(s) : maxHp" type="number" :value="(build ? baseMaxHp(s) : maxHp) ?? ''" :placeholder="'max'" :disabled="locked" title="Maximum HP" @change="edit(x => setMaxHp(x, num($event)))" /></span>
          <template v-if="!build">
            <span class="muted small">temp</span>
            <input v-flash="s.tempHp ?? 0" type="number" :value="s.tempHp ?? ''" placeholder="0" :disabled="ro" title="Temporary HP" @change="edit(x => x.tempHp = num($event) || undefined)" />
          </template>
        </div>
        <div v-if="maxHp && !build" class="cs-hp-bar"><i :style="{ width: Math.min(100, Math.round(100 * (s.hp ?? maxHp) / maxHp)) + '%' }" /></div>
      </div>
      <label v-if="!build" class="cs-hp-change"><span class="cs-label">Damage / heal</span><input placeholder="−7 or +5" :disabled="ro" @keydown.enter="hit" @change="hit" /></label>
      <DeathSaves v-if="dying" :saves="s.deathSaves ?? { ok: 0, fail: 0 }" :adv="deathSaveAdv(gt)" :ro="ro" @set="setSaves" @nat20="edit(x => { const b = x.hp ?? 0; x.hp = 1; hpChanged(pc, x, b, 1, false) })" />
      <div v-if="concDc != null && s.conditions?.includes('Concentrating')" class="cs-conc-check">
        <span>Concentration: <b>CON save DC {{ concDc }}</b><template v-if="concentrationAdv(gt)">, {{ concentrationAdv(gt) }}</template></span>
        <button type="button" class="chip-btn" @click="concDone(true)">Kept</button>
        <button type="button" class="chip-btn" @click="concDone(false)">Lost</button>
      </div>
    </div>
    <div class="cs-hp cs-dice">
      <!-- the character's conditions (shared with the combat tracker), with what they do -->
      <ConditionsBar v-if="!build" class="cs-dice-conds" :pc="pc" :s="s" />
      <div class="cs-hitdice">
        <span class="cs-label">Hit dice</span>
        <div v-for="p in pools" :key="p.die" class="cs-hp-row">
          <template v-if="!build">
            <input v-flash="p.total - p.spent" type="number" min="0" :max="p.total" :value="p.total - p.spent" :disabled="ro" :title="`${p.die} left`" @change="setLeft(p.die, p.total, num($event))" />
            <span class="muted">/ {{ p.total }}</span>
          </template>
          <span v-else>{{ p.total }} ×</span>
          <Dropdown v-if="build && !classes.length" class="cs-die" :value="s.hitDie || 'd8'" title="Hit die" @change="edit(x => x.hitDie = ($event.target as HTMLSelectElement).value)">
            <option v-for="d in DICE" :key="d" :value="d">{{ d }}</option>
          </Dropdown>
          <b v-else class="cs-die-label">{{ p.die }}</b>
        </div>
      </div>
      <div v-if="!build" class="cs-rests">
        <button class="cs-rest" :disabled="ro" title="Features, pact slots and item spells that recharge on a short rest come back. Spend Hit Dice by counting them down here" @click="short">Short rest</button>
        <div v-if="rolls.length" class="cs-regain">
          <div v-for="r in rolls" :key="r.i" class="cs-regain-row small">Roll <b>{{ r.dice }}</b> for {{ r.name }}'s charges:
            <input type="number" min="0" class="effect-value" placeholder="?" @keydown.enter="addCharges(r, ($event.target as HTMLInputElement).value)" @change="addCharges(r, ($event.target as HTMLInputElement).value)" />
            <button type="button" class="link-btn" title="Skip" @click="rolls = rolls.filter(x => x !== r)">×</button></div>
        </div>
        <button class="cs-rest" :disabled="ro" :title="`Full HP, no temp HP, every spell slot, ${rule('hitDiceLongRest') === 'half' ? 'half your' : 'all'} Hit Dice and one exhaustion level back`" @click="rest">Long rest</button>
      </div>
    </div>
    <!-- in play: the limited uses of features, to tick off without scrolling -->
    <UsesCard v-if="!build" :pc="pc" :s="s" />
    <ActiveSpellsCard v-if="!build" :pc="pc" :s="s" />
    </div>
    <!-- abilities, then attacks, spellcasting and proficiencies, in the same column -->
    <div class="cs-grid">
      <!-- one card per ability: score, modifier, saving throw and the skills that use it -->
      <section class="cs-abilities">
        <div v-for="a in ABILITIES" :key="a.key" class="cs-ability">
          <!-- name, modifier and the score in its box -->
          <div class="cs-ab-head">
            <span class="cs-short" :title="a.label">{{ a.short }}</span>
            <b v-flash="mod(scoreOf(a.key))" class="cs-mod" :class="{ 'gear-mod': scoreTip(a.key), tip: scoreTip(a.key) }" :data-tip="scoreTip(a.key)">{{ signed(mod(scoreOf(a.key))) }}</b>
            <input v-flash="scoreOf(a.key)" class="cs-score" type="number" min="1" max="30" :value="locked ? scoreOf(a.key) : s.abilities[a.key]" :disabled="locked" :title="scoreTip(a.key) ? undefined : `${a.label} score`" @change="edit(x => x.abilities[a.key] = num($event) ?? 10)" />
          </div>
          <!-- the saving throw, on its own band apart from the skills -->
          <button class="cs-skill cs-save" :class="{ on: s.saves.includes(a.key) }" :disabled="locked" :title="build ? `${a.label} saving throw: click for proficiency` : `${a.label} saving throw`" @click="toggleSave(a.key)">
            <span class="cs-dot">{{ s.saves.includes(a.key) ? '●' : '○' }}</span><b v-flash="saveBonus(s, a.key, prof)" :class="{ 'gear-mod': saveParts(a.key).length, tip: saveParts(a.key).length }" :data-tip="tipOf(saveBonus(s, a.key, prof), saveParts(a.key))">{{ signed(saveBonus(s, a.key, prof)) }}</b><span>Saving throw</span><i v-if="saveAdv(a.key).tip" class="cs-adv tip" :class="saveAdv(a.key).mode" :data-tip="saveAdv(a.key).tip">{{ saveAdv(a.key).mode ?? '±' }}</i>
          </button>
          <div class="cs-skills">
            <button v-for="sk in skillsOf(a.key)" :key="sk.name" class="cs-skill" :class="{ on: build ? buildLevel(sk.name) : s.skills[sk.name], given: build && grantedSkill(sk.name) }" :disabled="locked" :title="build ? skillTitle(sk.name) : SKILL_LEVEL[s.skills[sk.name] ?? 0] ?? ''" @click="cycleSkill(sk.name)">
              <span class="cs-dot">{{ skillMark(sk.name) }}</span><b v-flash="skillBonus(s, sk.name, prof)" :class="{ 'gear-mod': gt.skill[sk.name]?.length, tip: gt.skill[sk.name]?.length }" :data-tip="tipOf(skillBonus(s, sk.name, prof), gt.skill[sk.name] ?? [])">{{ signed(skillBonus(s, sk.name, prof)) }}</b><span>{{ sk.name }}</span><i v-if="skillAdv(sk.name).tip" class="cs-adv tip" :class="skillAdv(sk.name).mode" :data-tip="skillAdv(sk.name).tip">{{ skillAdv(sk.name).mode ?? '±' }}</i>
            </button>
            <p v-if="!skillsOf(a.key).length" class="cs-noskill">no skills</p>
          </div>
          <!-- what else scales with it, at the bottom: initiative (DEX), passive perception (WIS) -->
          <div v-if="a.key === 'dex'" class="cs-foot tip" :data-tip="tipOf(initTotal, gt.initiative) ?? 'Initiative: DEX modifier plus any bonus'"><span>Initiative</span><b v-flash="initTotal" :class="{ 'gear-mod': gt.initiative.length }">{{ signed(initTotal) }}</b></div>
          <div v-else-if="a.key === 'wis'" class="cs-foot" title="Passive perception: 10 + Perception"><span>Passive perception</span><b v-flash="passivePerception(s, prof)">{{ passivePerception(s, prof) }}</b></div>
        </div>
      </section>

      <!-- attacks, spellcasting, proficiencies -->
      <section class="cs-side">
        <template v-if="build">
        <h4>Spellcasting</h4>
        <div class="cs-cast">
          <Dropdown v-if="build" :value="s.spellAbility ?? ''" @change="edit(x => x.spellAbility = (($event.target as HTMLSelectElement).value || undefined) as Ability | undefined)">
            <option value="">{{ cast && !s.spellAbility ? `${cast.toUpperCase()} (class)` : 'None' }}</option>
            <option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.short }}</option>
          </Dropdown>
          <span v-else>{{ castLabel }}</span>
          <template v-if="cast"><span>Save DC <b v-flash="spellDC" :class="{ 'gear-mod tip': gt.spellDC.length }" :data-tip="tipOf(spellDC, gt.spellDC, String)">{{ spellDC }}</b></span><span>Attack <b v-flash="spellAtk" :class="{ 'gear-mod tip': gt.spellAttack.length }" :data-tip="tipOf(spellAtk, gt.spellAttack)">{{ signed(spellAtk) }}</b></span></template>
          <a :href="hrefTab(pc.id, 'spellbook')" class="small">Spellbook →</a>
        </div>
        </template>

        <template v-if="build">
        <h4>Proficiencies &amp; languages</h4>
        <div class="cs-profs">
          <ProfChips label="Armor" :values="profs.armor" :given="givenOf('armor')" :toggles="armorTypes" :disabled="locked" @change="setProfs('armor', $event)" />
          <ProfChips label="Weapons" :values="profs.weapons" :given="givenOf('weapon')" :toggles="listOptions('item.weaponCategory')" :suggest="listOptions('item.baseWeapon')" placeholder="Add a weapon…" :disabled="locked" @change="setProfs('weapons', $event)" />
          <ProfChips label="Tools" :values="profs.tools" :given="givenOf('tool')" :suggest="tools" placeholder="Add a tool…" :disabled="locked" @change="setProfs('tools', $event)" />
          <ProfChips label="Languages" :values="profs.languages" :given="givenOf('language')" :suggest="listOptions('language')" :create="newLanguage" placeholder="Add a language…" :disabled="locked" @change="setProfs('languages', $event)" />
          <p v-if="given.some(g => g.kind !== 'skill')" class="muted small">Greyed: from the classes, species, background and feats (they come by themselves).</p>
          <textarea v-if="build && (profs.other || otherOpen)" rows="2" :value="profs.other ?? ''" placeholder="Other proficiencies, e.g. vehicles (land)" @change="edit(x => profsToEdit(x).other = text($event))" />
          <button v-else-if="build" type="button" class="link-btn small cs-other-add" @click="otherOpen = true">＋ Other proficiencies</button>
          <p v-else-if="profs.other" class="cs-other">{{ profs.other }}</p>
        </div>
        </template>
      </section>
    </div>
    </div>
    </div>


    <!-- features and traits: in play right below the abilities, the uses on them clicked often -->
    <section class="cs-features">
      <h4>Features &amp; traits <button v-if="build" class="link-btn" @click="addFeature">＋ Add</button>
        <a v-if="!build && openChoices && !ro" class="sp-open small" :href="hrefEntry(pc.id, true)" :title="`${openChoices} pick${openChoices === 1 ? '' : 's'} still to make, on the Edit page`" @click="ui.scrollTo = 'choices'">{{ openChoices }} to pick ✎</a></h4>
      <template v-if="build">
        <label v-if="background || s.originFeat !== undefined" class="cs-origin"><span>Origin feat</span>
          <Dropdown :value="originValue" @change="setOrigin(($event.target as HTMLSelectElement).value)">
            <option value="">{{ bgFeat ? `${bgFeat.name}${background?.fields.originFeatNote ? ` (${background.fields.originFeatNote})` : ''}: from ${background?.name}` : `none from ${background?.name ?? 'the background'}` }}</option>
            <option v-for="f in originFeats" :key="f.id" :value="f.id">{{ f.name }} instead</option>
            <option value="none">None</option>
          </Dropdown>
          <small class="muted">{{ originValue === '' ? 'The background\'s; pick another if the DM allows it' : originValue === 'none' ? 'No Origin feat' : 'Instead of the background\'s' }}</small>
        </label>
        <div v-for="(f, i) in s.features" :key="i" class="cs-feature">
          <input :value="f.name" placeholder="Name, e.g. Bardic Inspiration (d6)" @change="edit(x => x.features[i].name = ($event.target as HTMLInputElement).value)" />
          <textarea rows="2" :value="f.text" placeholder="What it does" @change="edit(x => x.features[i].text = ($event.target as HTMLTextAreaElement).value)" />
          <button class="link-btn" title="Remove" @click="edit(x => x.features.splice(i, 1))">✕</button>
        </div>
      </template>
      <!-- everything from the classes, species, background, the sheet and the gear, each with its source (species.ts) -->
      <FeatureList v-else :pc="pc" :s="s" :gear="fromGear" />
      <details v-if="build" class="cs-auto-feats">
        <summary class="small">Features that come by themselves <span class="muted">(classes, species, background, feats): no need to add them</span></summary>
        <FeatureList :pc="pc" :s="s" :gear="fromGear" />
      </details>
      <p v-if="build && !s.features.length" class="muted small">＋ Add is for anything else: a boon, a homebrew feature, a feat by its name.</p>
    </section>

    <!-- the gear is on the Inventory tab; here its effects count in the numbers, and its charges are in the Uses card -->


    <ItemModal v-if="shownLine?.item" :id="shownLine.item" @close="shown = null">
      <template #actions>
        <span class="muted small">× {{ shownLine.qty }}</span>
        <GearToggles :pc="pc" :i="shown!" />
      </template>
    </ItemModal>
  </div>
</template>
