<script setup lang="ts">
// A creature's statblock as a form: buttons and boxes instead of statblock text. The free-text parts of the
// stored statblock ("30 ft., fly 30 ft. (hover)", "perception +5") are read into fields and written back the same way.
import SuggestInput from '../SuggestInput.vue'
import LinkTextarea from './LinkTextarea.vue'
import Dropdown from '../Dropdown.vue'
import { computed, onMounted, ref } from 'vue'
import { loadSrdMonsters, srdMonster, srdMonsterNames, withSrd } from '../../srd'
import { fieldOptions, get, listOptions, optionLabel } from '../../store'
import type { Abilities, Entry, Feature, Statblock } from '../../model/types'
import { TYPES } from '../../model/schema'
import { changed, isEmpty } from '../../edit'
import { statsOf, xpFor } from '../../encounter'
import TokenField from './TokenField.vue'
import EntryPicker from './EntryPicker.vue'
import EntryLink from '../EntryLink.vue'
import { attackText, statProblems } from '../../creatures'
import { ABILITY_KEYS, ABILITY_NAME, CONDITIONS, SKILLS as SKILL_LIST, crProf, mod, signed, type Ability } from '../../model/dnd'
import type { StatAttack } from '../../model/types'
import { inputValue as val } from '../../dom'

const props = defineProps<{ entry: Entry }>()
const sb = computed<Statblock>(() => (props.entry.fields.statblock) ?? {})

function set<K extends keyof Statblock>(key: K, v: Statblock[K] | undefined) {
  const next: Statblock = { ...sb.value }
  if (isEmpty(v)) delete next[key]
  else next[key] = v
  if (Object.keys(next).length) props.entry.fields.statblock = next
  else delete props.entry.fields.statblock
  changed(props.entry)
}
const num = (raw: string) => (raw.trim() === '' ? undefined : Number(raw))

// ---- identity: size, type (+ tags in brackets), alignment ----
/** The world's sizes (the Lists page); a statblock keeps the word. */
const SIZES = computed(() => listOptions('size').map(o => o.label))
const sizeIs = (s: string) => (sb.value.size ?? '').toLowerCase() === s.toLowerCase()
const TYPE_OPTIONS = computed(() => fieldOptions(TYPES.creature.fields.find(f => f.key === 'creatureType')))
const typeParts = computed(() => {
  const m = (sb.value.creatureType ?? '').match(/^\s*([^(]*?)\s*(?:\((.*)\))?\s*$/)
  return { base: m?.[1] ?? '', tags: m?.[2] ?? '' }
})
const typeValue = computed(() => {
  const t = (props.entry.fields.creatureType) ?? typeParts.value.base
  return TYPE_OPTIONS.value.find(o => o.id.toLowerCase() === t.toLowerCase() || o.label.toLowerCase() === t.toLowerCase())?.id ?? t
})
function setType(base: string, tags: string) {
  // (a creature's type is a field of its own too, for its list's filter)
  if (props.entry.type === 'creature') {
    if (base) props.entry.fields.creatureType = base
    else delete props.entry.fields.creatureType
  }
  const line = [optionLabel('creature.creatureType', base).toLowerCase(), tags.trim() ? `(${tags.trim()})` : ''].filter(Boolean).join(' ')
  set('creatureType', line || undefined)
}
const ALIGNMENTS = ['lawful good', 'neutral good', 'chaotic good', 'lawful neutral', 'neutral', 'chaotic neutral', 'lawful evil', 'neutral evil', 'chaotic evil', 'unaligned', 'any alignment']

// ---- challenge ----
const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))]
const prof = computed(() => crProf(sb.value.cr))

// ---- abilities ----
const modOf = (k: Ability) => mod(sb.value.abilities?.[k] ?? 10)
/** "+2", "-1": with a plain hyphen, since the statblock text is read back as numbers. */
const signedText = (n: number) => signed(n, '-')
function setAbility(k: Ability, raw: string) {
  const a: Abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...(sb.value.abilities ?? {}) }
  a[k] = raw === '' ? 10 : Number(raw)
  set('abilities', a)
}

// ---- hit points: the average of the hit dice, one click away ----
const hitDiceAvg = computed(() => {
  const m = (sb.value.hitDice ?? '').replace(/\s/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i)
  return m ? Math.floor((Number(m[1]) * (Number(m[2]) + 1)) / 2) + Number(m[3] ?? 0) : undefined
})

// ---- "name +N" lists: skills and saving throws ----
const SKILLS: Record<string, Ability> = Object.fromEntries(SKILL_LIST.map(s => [s.name, s.ability]))
type Bonus = { name: string; n: number | null }
const parseBonuses = (s?: string): Bonus[] => (s ?? '').split(',').map(t => t.trim()).filter(Boolean).map(t => {
  const m = t.match(/^(.*?)\s*([+-]\s*\d+)$/)
  return m ? { name: m[1], n: Number(m[2].replace(/\s/g, '')) } : { name: t, n: null }
})
const writeBonuses = (list: Bonus[]) => list.filter(b => b.name.trim()).map(b => (b.n == null ? b.name.trim() : `${b.name.trim()} ${signedText(b.n)}`)).join(', ') || undefined
const skills = computed(() => parseBonuses(sb.value.skills))
const skillOn = (s: string) => skills.value.find(b => b.name.toLowerCase() === s.toLowerCase())
const skillSuggest = (s: string) => modOf(SKILLS[s]) + prof.value
function toggleSkill(s: string) {
  set('skills', writeBonuses(skillOn(s) ? skills.value.filter(b => b.name.toLowerCase() !== s.toLowerCase()) : [...skills.value, { name: s, n: skillSuggest(s) }]))
}
function setSkillBonus(s: string, raw: string) { set('skills', writeBonuses(skills.value.map(b => (b.name.toLowerCase() === s.toLowerCase() ? { ...b, n: num(raw) ?? null } : b)))) }
/** Entries in the skills text that aren't skills (some statblocks list saving throws there). */
const otherSkills = computed(() => skills.value.filter(b => !Object.keys(SKILLS).some(s => s.toLowerCase() === b.name.toLowerCase())))

const saves = computed(() => parseBonuses(sb.value.saves))
const saveOf = (k: Ability) => saves.value.find(b => b.name.toLowerCase().startsWith(k))
function toggleSave(k: Ability) {
  const label = k[0].toUpperCase() + k.slice(1)
  const next = saveOf(k) ? saves.value.filter(b => b !== saveOf(k)) : [...saves.value, { name: label, n: modOf(k) + prof.value }]
  next.sort((a, b) => ABILITY_KEYS.findIndex(x => a.name.toLowerCase().startsWith(x)) - ABILITY_KEYS.findIndex(x => b.name.toLowerCase().startsWith(x)))
  set('saves', writeBonuses(next))
}
function setSaveBonus(k: Ability, raw: string) { set('saves', writeBonuses(saves.value.map(b => (b === saveOf(k) ? { ...b, n: num(raw) ?? null } : b)))) }

// ---- distances: speed and senses ("30 ft., fly 30 ft. (hover)", "darkvision 60 ft., passive Perception 15") ----
type Dist = { n?: number; note?: string }
function parseDistances(s: string | undefined, modes: string[], plain?: string) {
  const out: Record<string, Dist> = {}
  const rest: string[] = []
  let passive: number | undefined
  for (const raw of (s ?? '').split(',').map(t => t.trim()).filter(Boolean)) {
    const p = raw.match(/^passive\s+perception\s*(\d+)/i)
    if (p) { passive = Number(p[1]); continue }
    const m = raw.match(/^([a-z]+)?\s*(\d+)\s*ft\.?\s*([a-z]+)?\s*(.*)$/i)
    const mode = m && (m[1] ?? m[3] ?? plain)?.toLowerCase().replace(/^flying$/, 'fly')
    if (m && mode && modes.includes(mode) && !out[mode]) {
      const note = (m[1] ? [m[3], m[4]] : [m[4]]).filter(Boolean).join(' ').trim()
      out[mode] = { n: Number(m[2]), note: note || undefined }
    } else rest.push(raw)
  }
  return { out, rest, passive }
}
function writeDistances(out: Record<string, Dist>, modes: string[], plain: string | undefined, rest: string[], passive?: number) {
  const parts = modes.filter(k => out[k]?.n != null).map(k => `${k === plain ? '' : k + ' '}${out[k].n} ft.${out[k].note ? ' ' + out[k].note : ''}`)
  if (passive != null) parts.push(`passive Perception ${passive}`)
  return [...parts, ...rest].join(', ') || undefined
}
const SPEEDS = ['walk', 'fly', 'swim', 'climb', 'burrow']
const speed = computed(() => parseDistances(sb.value.speed, SPEEDS, 'walk'))
function setSpeed(mode: string, patch: Dist) {
  const p = speed.value
  const cur = { ...(p.out[mode] ?? {}), ...patch }
  const out = { ...p.out, [mode]: cur }
  if (cur.n == null) delete out[mode]
  set('speed', writeDistances(out, SPEEDS, 'walk', p.rest))
}
const hover = computed(() => /hover/i.test(speed.value.out.fly?.note ?? ''))
function toggleHover() {
  const note = speed.value.out.fly?.note ?? ''
  setSpeed('fly', { note: hover.value ? note.replace(/\(?hover\)?/i, '').trim() || undefined : [note, '(hover)'].filter(Boolean).join(' ') })
}

const SENSES = ['darkvision', 'blindsight', 'tremorsense', 'truesight']
const senses = computed(() => parseDistances(sb.value.senses, SENSES))
function setSense(mode: string, raw: string) {
  const p = senses.value
  const out = { ...p.out }
  const n = num(raw)
  if (n == null) delete out[mode]; else out[mode] = { ...(out[mode] ?? {}), n }
  set('senses', writeDistances(out, SENSES, undefined, p.rest, p.passive))
}
function setPassive(raw: string) { const p = senses.value; set('senses', writeDistances(p.out, SENSES, undefined, p.rest, num(raw))) }
const passiveSuggest = computed(() => 10 + (skillOn('Perception')?.n ?? modOf('wis')))
function setRest(which: 'speed' | 'senses', v?: string) {
  const extra = (v ?? '').split(',').map(t => t.trim()).filter(Boolean)
  if (which === 'speed') set('speed', writeDistances(speed.value.out, SPEEDS, 'walk', extra))
  else set('senses', writeDistances(senses.value.out, SENSES, undefined, extra, senses.value.passive))
}

// ---- damage and conditions ----
/** The world's damage types and languages (the Lists page), as words; languages with the statblock's usual extras. */
const DAMAGE = computed(() => fieldOptions(TYPES.item.fields.find(x => x.key === 'damageType')).map(o => o.label))
const LANGS = computed(() => [...listOptions('language').map(o => o.label), 'telepathy 60 ft.', "understands Common but can't speak"])
const NONMAGICAL = 'bludgeoning, piercing, and slashing from nonmagical attacks'

// ---- features: traits, actions, … one tab each ----
const FEATS: [keyof Statblock, string][] = [['traits', 'Traits'], ['actions', 'Actions'], ['bonusActions', 'Bonus actions'], ['reactions', 'Reactions'], ['legendary', 'Legendary actions'], ['lair', 'Lair actions']]
const feats = (k: keyof Statblock) => (sb.value[k] as Feature[] | undefined) ?? []
const tab = ref<keyof Statblock>(feats('traits').length || !feats('actions').length ? 'traits' : 'actions')
function setFeat(i: number, patch: Partial<Feature>) { set(tab.value, feats(tab.value).map((f, j) => (j === i ? { ...f, ...patch } : f)) as any) }
function addFeat() { set(tab.value, [...feats(tab.value), { name: '', text: '' }] as any) }
function removeFeat(i: number) { set(tab.value, feats(tab.value).filter((_, j) => j !== i) as any) }
function moveFeat(i: number, d: number) {
  const list = [...feats(tab.value)]
  const j = i + d
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  set(tab.value, list as any)
}
const ATTACK = 'Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.'

// ---- an action that's an attack: its line written from these ----
const ATTACK_TABS: (keyof Statblock)[] = ['actions', 'bonusActions', 'reactions', 'legendary', 'lair']
function toggleAttack(i: number) {
  const f = feats(tab.value)[i]
  if (f.attack) { setFeat(i, { attack: undefined, text: attackText(sb.value, f.attack) }); return }
  const a: StatAttack = { kind: 'melee', ability: modOf('dex') > modOf('str') ? 'dex' : 'str', reach: 5, dice: '1d6', type: 'Slashing' }
  setFeat(i, { attack: a, text: attackText(sb.value, a) })
}
function setAttack(i: number, p: Partial<StatAttack>) {
  const a = { ...feats(tab.value)[i].attack!, ...p } as StatAttack
  for (const k of ['plus', 'extra', 'range', 'bonus'] as const) if (!a[k]) delete a[k]
  setFeat(i, { attack: a, text: attackText(sb.value, a) })
}
const DMG_TYPES = DAMAGE

// ---- what to start from: its own stats, one of the world's creatures, or an SRD monster ----
const source = ref<'own' | 'world' | 'srd'>(sb.value.base ? 'world' : sb.value.srd ? 'srd' : 'own')
function setSource(s: 'own' | 'world' | 'srd') {
  source.value = s
  const next: Statblock = { ...sb.value }
  if (s !== 'world') delete next.base
  if (s !== 'srd') delete next.srd
  if (Object.keys(next).length) props.entry.fields.statblock = next
  else delete props.entry.fields.statblock
  changed(props.entry)
}
const srdBase = computed(() => srdMonster(sb.value.srd))
const worldBase = computed(() => (sb.value.base ? get(sb.value.base) : undefined))
const worldStats = computed(() => statsOf(worldBase.value))
/** What it's based on: a field's value there shows greyed while the form leaves it empty. */
const ph = computed(() => (sb.value.base ? worldStats.value : srdBase.value?.statblock) ?? {} as Statblock)
function copySrd() {
  const base = sb.value.base ? worldStats.value : srdBase.value?.statblock
  if (!base) return
  const next = JSON.parse(JSON.stringify(statsOf(props.entry) ?? withSrd(sb.value))) as Statblock
  delete next.srd
  delete next.base
  props.entry.fields.statblock = next
  const t = (base.creatureType ?? '').replace(/\s*\(.*\)$/, '')
  if (props.entry.type === 'creature' && t && !props.entry.fields.creatureType) props.entry.fields.creatureType = t
  source.value = 'own'
  changed(props.entry)
}
onMounted(() => { void loadSrdMonsters() })

// ---- what imported text left behind ----
const problems = computed(() => statProblems(sb.value))
function fixProblem(apply: (x: Statblock) => Statblock) {
  const next = apply({ ...sb.value })
  props.entry.fields.statblock = next
  changed(props.entry)
}

// ---- spellcasting: the ability and the spells by how often ----
const SC_LABELS = ['At Will', '1/Day Each', '2/Day Each', '3/Day Each', 'Cantrips', '1st level', '2nd level', '3rd level']
const sc = computed(() => sb.value.spellcasting)
function setSc(p: Partial<NonNullable<Statblock['spellcasting']>> | null) {
  if (p === null) return set('spellcasting', undefined)
  set('spellcasting', { ability: 'cha', lists: [{ label: 'At Will', spells: [] }], ...(sc.value ?? {}), ...p })
}
function setList(i: number, p: Partial<{ label: string; spells: string[] }>) { setSc({ lists: sc.value!.lists.map((l, k) => (k === i ? { ...l, ...p } : l)) }) }
const addList = () => setSc({ lists: [...(sc.value?.lists ?? []), { label: '1/Day Each', spells: [] }] })
const removeList = (i: number) => setSc({ lists: sc.value!.lists.filter((_, k) => k !== i) })
</script>

<template>
  <div class="creature-form">
    <!-- what imported text left behind, each with a fix -->
    <section v-if="problems.length" class="card cf-card lu-warn cf-problems">
      <b class="small">Check these</b>
      <div v-for="p in problems" :key="p.key" class="cf-problem small">{{ p.text }} <button type="button" class="chip-btn" @click="fixProblem(p.apply)">{{ p.fix }}</button></div>
    </section>
    <!-- an SRD monster to start from: its stats under the ones set here -->
    <section class="card cf-card cf-start">
      <div class="cf-row">
        <span class="sf-label">Start from</span>
        <div class="seg">
          <button type="button" :class="{ on: source === 'own' }" @click="setSource('own')">its own stats</button>
          <button type="button" :class="{ on: source === 'world' }" title="One of this world's creatures: its stats, kept up to date, with what you set here on top" @click="setSource('world')">one of your creatures</button>
          <button type="button" :class="{ on: source === 'srd' }" @click="setSource('srd')">an SRD monster</button>
        </div>
      </div>
      <template v-if="source === 'world'">
        <div class="cf-row">
          <EntryPicker class="cf-srd-input" :model-value="sb.base ?? null" :types="['creature']" :exclude="[entry.id]" placeholder="Pick one of your creatures…" @update:model-value="v => set('base', v ?? undefined)" />
          <button v-if="worldStats" type="button" class="chip-btn" title="Write its stats into the form (with what's set here on top), to change them; the link to it ends" @click="copySrd">Copy its stats in</button>
        </div>
        <p v-if="worldBase" class="muted small"><EntryLink :id="worldBase.id" />: {{ [worldStats?.size, worldStats?.creatureType].filter(Boolean).join(' ') }}<template v-if="worldStats?.cr">, CR {{ worldStats.cr }}</template>. Its stats show greyed in the form and stay linked: change {{ worldBase.name }} and this follows. Anything you fill in replaces them.</p>
      </template>
      <template v-if="source === 'srd'">
        <div class="cf-row">
          <SuggestInput class="cf-srd-input" :value="sb.srd ?? ''" :options="srdMonsterNames" :placeholder="`Search the SRD's ${srdMonsterNames.length || 330} monsters…`" @change="set('srd', val($event).trim() || undefined)" />
          <button v-if="srdBase" type="button" class="chip-btn" title="Write its stats into the form (with what's set here on top), to change them; the creature then has its own stats" @click="copySrd">Copy its stats in</button>
        </div>
        <p v-if="srdBase" class="muted small">{{ srdBase.name }}<template v-if="srdBase.name.toLowerCase() !== (sb.srd ?? '').toLowerCase()"> (for “{{ sb.srd }}”)</template>: {{ srdBase.statblock.size }} {{ srdBase.statblock.creatureType }}, CR {{ srdBase.statblock.cr }}. Its stats show on the right, greyed in the form; anything you fill in replaces them.</p>
        <p v-else-if="sb.srd" class="small warn-text">“{{ sb.srd }}” isn't one of the SRD's monsters: pick one from the list.</p>
      </template>
    </section>
    <!-- who it is -->
    <section class="card cf-card">
      <div class="cf-grid">
        <label class="sf-field"><span class="sf-label">Size</span>
          <Dropdown :value="SIZES.find(sizeIs) ?? sb.size ?? ''" aria-label="Size" @change="set('size', val($event) || undefined)">
            <option value="">—</option>
            <option v-for="s in SIZES" :key="s" :value="s">{{ s }}</option>
            <option v-if="sb.size && !SIZES.some(sizeIs)" :value="sb.size">{{ sb.size }}</option>
          </Dropdown>
        </label>
        <label class="sf-field"><span class="sf-label">Type</span>
          <Dropdown :value="typeValue" @change="setType(val($event), typeParts.tags)">
            <option value="">—</option>
            <option v-for="o in TYPE_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
            <option v-if="typeValue && !TYPE_OPTIONS.some(o => o.id === typeValue)" :value="typeValue">{{ typeValue }}</option>
          </Dropdown>
        </label>
        <label class="sf-field"><span class="sf-label">Tags <span class="muted">(in brackets)</span></span>
          <input :value="typeParts.tags" placeholder="e.g. shapechanger" @change="setType(typeValue, val($event))" />
        </label>
        <label class="sf-field"><span class="sf-label">Alignment</span>
          <SuggestInput :value="sb.alignment ?? ''" :options="ALIGNMENTS" :placeholder="ph.alignment ?? 'e.g. neutral evil'" @change="set('alignment', val($event).trim() || undefined)" />
        </label>
        <label class="sf-field"><span class="sf-label">Challenge</span>
          <span class="cf-row">
            <Dropdown :value="sb.cr ?? ''" @change="set('cr', val($event) || undefined)">
              <option value="">—</option>
              <option v-for="c in CRS" :key="c" :value="c">{{ c }}</option>
              <option v-if="sb.cr && !CRS.includes(sb.cr)" :value="sb.cr">{{ sb.cr }}</option>
            </Dropdown>
            <span class="muted small">{{ xpFor(sb.cr) != null ? xpFor(sb.cr)!.toLocaleString() + ' XP · ' : '' }}proficiency {{ signedText(prof) }}</span>
          </span>
        </label>
      </div>
    </section>

    <!-- toughness and movement -->
    <section class="card cf-card">
      <div class="cf-grid">
        <label class="sf-field"><span class="sf-label">Armour class</span>
          <span class="cf-row">
            <input type="number" class="cf-num big" :value="sb.ac ?? ''" :placeholder="ph.ac != null ? String(ph.ac) : ''" @change="set('ac', num(val($event)))" />
            <input :value="sb.acNote ?? ''" placeholder="natural armor" @change="set('acNote', val($event).trim() || undefined)" />
          </span>
        </label>
        <label class="sf-field"><span class="sf-label">Hit points</span>
          <span class="cf-row">
            <input type="number" class="cf-num big" :value="sb.hp ?? ''" :placeholder="ph.hp != null ? String(ph.hp) : ''" @change="set('hp', num(val($event)))" />
            <input :value="sb.hitDice ?? ''" :placeholder="ph.hitDice ?? 'hit dice, e.g. 4d8 + 4'" @change="set('hitDice', val($event).trim() || undefined)" />
            <button v-if="hitDiceAvg != null && hitDiceAvg !== sb.hp" type="button" class="chip-btn" title="Use the average of the hit dice" @click="set('hp', hitDiceAvg)">= {{ hitDiceAvg }}</button>
          </span>
        </label>
        <div class="sf-field cf-wide"><span class="sf-label">Speed <span class="muted">(feet)</span></span>
          <div class="cf-dists">
            <label v-for="m in SPEEDS" :key="m" class="cf-dist">
              <span>{{ m }}</span>
              <input type="number" step="5" min="0" :value="speed.out[m]?.n ?? ''" @change="setSpeed(m, { n: num(val($event)) })" />
            </label>
            <button v-if="speed.out.fly" type="button" class="token-opt" :class="{ on: hover }" @click="toggleHover">hover</button>
          </div>
          <TokenField v-if="speed.rest.length" :model-value="speed.rest.join(', ')" placeholder="Other…" @update:model-value="v => setRest('speed', v)" />
        </div>
      </div>
    </section>

    <!-- abilities -->
    <section class="card cf-card">
      <div class="cf-abilities">
        <label v-for="a in ABILITY_KEYS" :key="a" class="cf-ability" :title="ABILITY_NAME[a]">
          <b>{{ a.toUpperCase() }}</b>
          <input type="number" min="1" max="30" :value="sb.abilities?.[a] ?? ''" :placeholder="String(ph.abilities?.[a] ?? 10)" @change="setAbility(a, val($event))" />
          <span class="cf-mod">{{ signedText(modOf(a)) }}</span>
          <button type="button" class="cf-save" :class="{ on: !!saveOf(a) }" :title="saveOf(a) ? 'Proficient in this saving throw (click to remove)' : 'Add a saving throw proficiency'" @click.prevent="toggleSave(a)">save</button>
          <input v-if="saveOf(a)" type="number" class="cf-save-n" :value="saveOf(a)!.n ?? ''" title="Saving throw bonus" @click.prevent @change="setSaveBonus(a, val($event))" />
        </label>
      </div>
    </section>

    <!-- skills, senses, languages -->
    <section class="card cf-card">
      <div class="sf-field"><span class="sf-label">Skills <span class="muted">(bonus filled in from the ability and proficiency)</span></span>
        <div class="cf-skills">
          <span v-for="(ab, s) in SKILLS" :key="s" class="cf-skill" :class="{ on: !!skillOn(s) }">
            <button type="button" class="token-opt" :class="{ on: !!skillOn(s) }" :title="`${s} (${ab.toUpperCase()})`" @click="toggleSkill(s)">{{ s }}</button>
            <input v-if="skillOn(s)" type="number" :value="skillOn(s)!.n ?? ''" :placeholder="signedText(skillSuggest(s))" @change="setSkillBonus(s, val($event))" />
          </span>
        </div>
      </div>

      <div class="cf-grid">
        <div class="sf-field cf-wide"><span class="sf-label">Senses <span class="muted">(feet)</span></span>
          <div class="cf-dists">
            <label v-for="m in SENSES" :key="m" class="cf-dist">
              <span>{{ m }}</span>
              <input type="number" step="5" min="0" :value="senses.out[m]?.n ?? ''" @change="setSense(m, val($event))" />
            </label>
            <label class="cf-dist"><span>passive Perception</span>
              <input type="number" :value="senses.passive ?? ''" :placeholder="String(passiveSuggest)" @change="setPassive(val($event))" />
            </label>
            <button v-if="senses.passive !== passiveSuggest" type="button" class="chip-btn" title="10 + Perception" @click="setPassive(String(passiveSuggest))">= {{ passiveSuggest }}</button>
          </div>
          <TokenField v-if="senses.rest.length" :model-value="senses.rest.join(', ')" placeholder="Other…" @update:model-value="v => setRest('senses', v)" />
        </div>
        <div class="sf-field cf-wide"><span class="sf-label">Languages</span>
          <TokenField :model-value="sb.languages" :suggestions="LANGS" placeholder="Add a language…" @update:model-value="v => set('languages', v)" />
        </div>
      </div>
    </section>

    <!-- damage and conditions -->
    <section class="card cf-card">
      <div class="sf-field"><span class="sf-label">Damage vulnerabilities</span>
        <TokenField :model-value="sb.vulnerabilities" :suggestions="DAMAGE" placeholder="Add a damage type…" @update:model-value="v => set('vulnerabilities', v)" />
      </div>
      <div class="sf-field"><span class="sf-label">Damage resistances</span>
        <TokenField :model-value="sb.resistances" :suggestions="[...DAMAGE, NONMAGICAL]" placeholder="Add a damage type…" @update:model-value="v => set('resistances', v)" />
      </div>
      <div class="sf-field"><span class="sf-label">Damage immunities</span>
        <TokenField :model-value="sb.immunities" :suggestions="[...DAMAGE, NONMAGICAL]" placeholder="Add a damage type…" @update:model-value="v => set('immunities', v)" />
      </div>
      <div class="sf-field"><span class="sf-label">Condition immunities</span>
        <TokenField :model-value="sb.conditionImmunities" :suggestions="CONDITIONS" placeholder="Add a condition…" @update:model-value="v => set('conditionImmunities', v)" />
      </div>
    </section>

    <!-- what it can do -->
    <section class="card cf-card">
      <nav class="tabs cf-tabs">
        <a v-for="[k, label] in FEATS" :key="k" href="#" :class="{ on: tab === k }" @click.prevent="tab = k">{{ label }} <span class="muted small">{{ feats(k).length || '' }}</span></a>
      </nav>
      <div v-if="tab === 'legendary'" class="cf-row cf-legendary small">
        <label>Uses per round <input type="number" min="0" class="effect-value" :value="sb.legendaryUses ?? ''" placeholder="3" @change="set('legendaryUses', num(val($event)))" /></label>
        <label>in its lair <input type="number" min="0" class="effect-value" :value="sb.legendaryLair ?? ''" placeholder="—" @change="set('legendaryLair', num(val($event)))" /></label>
        <label title="Legendary Resistance: fails a save, succeeds instead">Legendary Resistance /day <input type="number" min="0" class="effect-value" :value="sb.legendaryResistance ?? ''" placeholder="—" @change="set('legendaryResistance', num(val($event)))" /></label>
        <label>in its lair <input type="number" min="0" class="effect-value" :value="sb.legendaryResistanceLair ?? ''" placeholder="—" @change="set('legendaryResistanceLair', num(val($event)))" /></label>
      </div>
      <p v-if="tab === 'lair'" class="muted small">On initiative count 20 (losing ties) it takes one of these.</p>
      <div v-for="(f, i) in feats(tab)" :key="tab + i" class="cf-feat">
        <div class="cf-feat-head">
          <input class="cf-feat-name" :value="f.name" placeholder="Name" @change="setFeat(i, { name: val($event) })" />
          <button type="button" class="link-btn" title="Move up" :disabled="i === 0" @click="moveFeat(i, -1)">↑</button>
          <button type="button" class="link-btn" title="Move down" :disabled="i === feats(tab).length - 1" @click="moveFeat(i, 1)">↓</button>
          <button v-if="ATTACK_TABS.includes(tab)" type="button" class="chip-btn" :class="{ on: !!f.attack }" :title="f.attack ? 'Back to free text (keeps the line as written now)' : 'Write the attack line from its ability, dice and the proficiency bonus'" @click="toggleAttack(i)">⚔ Attack</button>
          <button type="button" class="x" title="Remove" @click="removeFeat(i)">×</button>
        </div>
        <template v-if="f.attack">
          <div class="cf-attack small">
            <div class="seg">
              <button v-for="k in (['melee', 'ranged', 'both'] as const)" :key="k" type="button" :class="{ on: f.attack.kind === k }" @click="setAttack(i, { kind: k })">{{ k === 'both' ? 'Melee or ranged' : k[0].toUpperCase() + k.slice(1) }}</button>
            </div>
            <label>with <Dropdown :value="f.attack.ability" @change="setAttack(i, { ability: val($event) as StatAttack['ability'] })"><option v-for="a in ABILITY_KEYS" :key="a" :value="a">{{ a.toUpperCase() }} ({{ signedText(modOf(a)) }})</option></Dropdown></label>
            <label v-if="f.attack.kind !== 'ranged'">reach <input type="number" min="5" step="5" class="effect-value" :value="f.attack.reach ?? 5" @change="setAttack(i, { reach: num(val($event)) ?? 5 })" /> ft</label>
            <label v-if="f.attack.kind !== 'melee'">range <input class="effect-value cf-range" :value="f.attack.range ?? ''" placeholder="30/120" @change="setAttack(i, { range: val($event).trim() })" /> ft</label>
            <label>damage <input class="effect-value cf-range" :value="f.attack.dice" placeholder="1d6" @change="setAttack(i, { dice: val($event).trim() || '1d6' })" /></label>
            <Dropdown :value="f.attack.type" aria-label="Damage type" @change="setAttack(i, { type: val($event) })"><option v-for="t in DMG_TYPES" :key="t" :value="t">{{ t }}</option></Dropdown>
            <label title="A magic weapon's bonus to hit and damage">bonus <input type="number" class="effect-value" :value="f.attack.bonus ?? ''" placeholder="0" @change="setAttack(i, { bonus: num(val($event)) })" /></label>
            <input class="effect-text" :value="f.attack.plus ?? ''" placeholder="plus… e.g. 7 (2d6) Fire damage" @change="setAttack(i, { plus: val($event).trim() })" />
            <input class="effect-text" :value="f.attack.extra ?? ''" placeholder="and then… e.g. If the target is Large or smaller, it has the Prone condition." @change="setAttack(i, { extra: val($event).trim() })" />
          </div>
          <p class="muted small cf-attack-line">{{ attackText(sb, f.attack) }}</p>
        </template>
        <LinkTextarea v-else grow :value="f.text" rows="2" :placeholder="tab === 'actions' ? ATTACK : 'What it does'" @change="setFeat(i, { text: val($event) })" />
      </div>
      <p v-if="!feats(tab).length" class="muted small">None yet.</p>
      <button type="button" class="chip-btn" @click="addFeat">＋ Add {{ FEATS.find(x => x[0] === tab)![1].toLowerCase().replace(/s$/, '') }}</button>
    </section>

    <!-- spellcasting: the spells as the world's spells, the DC and attack worked out -->
    <section class="card cf-card">
      <div class="cf-row"><b class="sf-label">Spellcasting</b>
        <button v-if="!sc" type="button" class="chip-btn" @click="setSc({})">＋ Spellcasting</button>
        <template v-else>
          <label class="small">with <Dropdown :value="sc.ability" @change="setSc({ ability: val($event) as any })"><option v-for="a in ABILITY_KEYS" :key="a" :value="a">{{ ABILITY_NAME[a] }}</option></Dropdown></label>
          <span class="muted small">save DC {{ 8 + prof + modOf(sc.ability) }}, {{ signedText(prof + modOf(sc.ability)) }} to hit</span>
          <label class="small"><input type="checkbox" :checked="!!sc.noMaterial" @change="setSc({ noMaterial: ($event.target as HTMLInputElement).checked || undefined })" /> no Material components</label>
          <button type="button" class="link-btn small" title="Remove its spellcasting" @click="setSc(null)">remove</button>
        </template>
      </div>
      <div v-for="(l, i) in sc?.lists ?? []" :key="i" class="cf-row cf-splist">
        <SuggestInput class="effect-value cf-sclabel" :value="l.label" :options="SC_LABELS" @change="setList(i, { label: val($event).trim() || 'At Will' })" />
        <span v-for="id in l.spells" :key="id" class="chip"><EntryLink :id="id" /><button type="button" class="link-btn" title="Remove" @click="setList(i, { spells: l.spells.filter(x => x !== id) })">×</button></span>
        <EntryPicker add :types="['spell']" :exclude="l.spells" placeholder="+ spell…" @pick="id => setList(i, { spells: [...l.spells, id] })" />
        <button type="button" class="link-btn" title="Remove this list" @click="removeList(i)">×</button>
      </div>
      <button v-if="sc" type="button" class="chip-btn" @click="addList">＋ List</button>
    </section>

  </div>
</template>
