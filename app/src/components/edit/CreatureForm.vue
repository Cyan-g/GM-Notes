<script setup lang="ts">
// A creature's statblock as a form: buttons and boxes instead of statblock text. The free-text parts of the
// stored statblock ("30 ft., fly 30 ft. (hover)", "perception +5") are read into fields and written back the same way.
import { computed, ref } from 'vue'
import type { Abilities, Entry, Feature, Statblock } from '../../model/types'
import { TYPES } from '../../model/schema'
import { changed } from '../../edit'
import { xpFor } from '../../encounter'
import TokenField from './TokenField.vue'

const props = defineProps<{ entry: Entry }>()
const sb = computed<Statblock>(() => (props.entry.fields.statblock) ?? {})

function set<K extends keyof Statblock>(key: K, v: Statblock[K] | undefined) {
  const next: Statblock = { ...sb.value }
  if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v)) || (Array.isArray(v) && !v.length)) delete next[key]
  else next[key] = v
  if (Object.keys(next).length) props.entry.fields.statblock = next
  else delete props.entry.fields.statblock
  changed(props.entry)
}
const num = (raw: string) => (raw.trim() === '' ? undefined : Number(raw))
const val = (ev: Event) => (ev.target as HTMLInputElement).value

// ---- identity: size, type (+ tags in brackets), alignment ----
const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
const sizeIs = (s: string) => (sb.value.size ?? '').toLowerCase() === s.toLowerCase()
const TYPE_OPTIONS = (TYPES.creature.fields.find(f => f.key === 'creatureType')?.options ?? []) as string[]
const typeParts = computed(() => {
  const m = (sb.value.creatureType ?? '').match(/^\s*([^(]*?)\s*(?:\((.*)\))?\s*$/)
  return { base: m?.[1] ?? '', tags: m?.[2] ?? '' }
})
const typeValue = computed(() => {
  const t = (props.entry.fields.creatureType) ?? typeParts.value.base
  return TYPE_OPTIONS.find(o => o.toLowerCase() === t.toLowerCase()) ?? t
})
function setType(base: string, tags: string) {
  if (base) props.entry.fields.creatureType = base
  else delete props.entry.fields.creatureType
  const line = [base.toLowerCase(), tags.trim() ? `(${tags.trim()})` : ''].filter(Boolean).join(' ')
  set('creatureType', line || undefined)
}
const ALIGNMENTS = ['lawful good', 'neutral good', 'chaotic good', 'lawful neutral', 'neutral', 'chaotic neutral', 'lawful evil', 'neutral evil', 'chaotic evil', 'unaligned', 'any alignment']

// ---- challenge ----
const CRS = ['0', '1/8', '1/4', '1/2', ...Array.from({ length: 30 }, (_, i) => String(i + 1))]
const crNum = computed(() => { const c = sb.value.cr ?? ''; return c.includes('/') ? 0 : Number(c) || 0 })
const prof = computed(() => 2 + Math.floor(Math.max(0, crNum.value - 1) / 4))

// ---- abilities ----
const ABIL: (keyof Abilities)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const ABIL_NAMES: Record<keyof Abilities, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
const modOf = (k: keyof Abilities) => Math.floor(((sb.value.abilities?.[k] ?? 10) - 10) / 2)
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`
function setAbility(k: keyof Abilities, raw: string) {
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
const SKILLS: Record<string, keyof Abilities> = {
  Acrobatics: 'dex', 'Animal Handling': 'wis', Arcana: 'int', Athletics: 'str', Deception: 'cha', History: 'int', Insight: 'wis',
  Intimidation: 'cha', Investigation: 'int', Medicine: 'wis', Nature: 'int', Perception: 'wis', Performance: 'cha',
  Persuasion: 'cha', Religion: 'int', 'Sleight of Hand': 'dex', Stealth: 'dex', Survival: 'wis',
}
type Bonus = { name: string; n: number | null }
const parseBonuses = (s?: string): Bonus[] => (s ?? '').split(',').map(t => t.trim()).filter(Boolean).map(t => {
  const m = t.match(/^(.*?)\s*([+-]\s*\d+)$/)
  return m ? { name: m[1], n: Number(m[2].replace(/\s/g, '')) } : { name: t, n: null }
})
const writeBonuses = (list: Bonus[]) => list.filter(b => b.name.trim()).map(b => (b.n == null ? b.name.trim() : `${b.name.trim()} ${signed(b.n)}`)).join(', ') || undefined
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
const saveOf = (k: keyof Abilities) => saves.value.find(b => b.name.toLowerCase().startsWith(k))
function toggleSave(k: keyof Abilities) {
  const label = k[0].toUpperCase() + k.slice(1)
  const next = saveOf(k) ? saves.value.filter(b => b !== saveOf(k)) : [...saves.value, { name: label, n: modOf(k) + prof.value }]
  next.sort((a, b) => ABIL.findIndex(x => a.name.toLowerCase().startsWith(x)) - ABIL.findIndex(x => b.name.toLowerCase().startsWith(x)))
  set('saves', writeBonuses(next))
}
function setSaveBonus(k: keyof Abilities, raw: string) { set('saves', writeBonuses(saves.value.map(b => (b === saveOf(k) ? { ...b, n: num(raw) ?? null } : b)))) }

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
const DAMAGE = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder']
const CONDS = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious']
const LANGS = ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon', 'telepathy 60 ft.', "understands Common but can't speak"]
const NONMAGICAL = 'bludgeoning, piercing, and slashing from nonmagical attacks'

// ---- features: traits, actions, … one tab each ----
const FEATS: [keyof Statblock, string][] = [['traits', 'Traits'], ['actions', 'Actions'], ['bonusActions', 'Bonus actions'], ['reactions', 'Reactions'], ['legendary', 'Legendary actions']]
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
const ATTACK = 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.'
function grow(ev: Event) { const t = ev.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px' }
const vGrow = { mounted: (el: HTMLTextAreaElement) => requestAnimationFrame(() => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px' }) }
</script>

<template>
  <div class="creature-form">
    <!-- who it is -->
    <section class="card cf-card">
      <div class="cf-grid">
        <div class="sf-field cf-wide"><span class="sf-label">Size</span>
          <div class="seg">
            <button v-for="s in SIZES" :key="s" type="button" :class="{ on: sizeIs(s) }" @click="set('size', sizeIs(s) ? undefined : s)">{{ s }}</button>
          </div>
        </div>
        <label class="sf-field"><span class="sf-label">Type</span>
          <select :value="typeValue" @change="setType(val($event), typeParts.tags)">
            <option value="">—</option>
            <option v-for="o in TYPE_OPTIONS" :key="o" :value="o">{{ o }}</option>
            <option v-if="typeValue && !TYPE_OPTIONS.includes(typeValue)" :value="typeValue">{{ typeValue }}</option>
          </select>
        </label>
        <label class="sf-field"><span class="sf-label">Tags <span class="muted">(in brackets)</span></span>
          <input :value="typeParts.tags" placeholder="e.g. shapechanger" @change="setType(typeValue, val($event))" />
        </label>
        <label class="sf-field"><span class="sf-label">Alignment</span>
          <input :value="sb.alignment ?? ''" list="cf-align" placeholder="e.g. neutral evil" @change="set('alignment', val($event).trim() || undefined)" />
          <datalist id="cf-align"><option v-for="a in ALIGNMENTS" :key="a" :value="a" /></datalist>
        </label>
        <label class="sf-field"><span class="sf-label">Challenge</span>
          <span class="cf-row">
            <select :value="sb.cr ?? ''" @change="set('cr', val($event) || undefined)">
              <option value="">—</option>
              <option v-for="c in CRS" :key="c" :value="c">{{ c }}</option>
              <option v-if="sb.cr && !CRS.includes(sb.cr)" :value="sb.cr">{{ sb.cr }}</option>
            </select>
            <span class="muted small">{{ xpFor(sb.cr) != null ? xpFor(sb.cr)!.toLocaleString() + ' XP · ' : '' }}proficiency {{ signed(prof) }}</span>
          </span>
        </label>
      </div>
    </section>

    <!-- toughness and movement -->
    <section class="card cf-card">
      <div class="cf-grid">
        <label class="sf-field"><span class="sf-label">Armour class</span>
          <span class="cf-row">
            <input type="number" class="cf-num big" :value="sb.ac ?? ''" @change="set('ac', num(val($event)))" />
            <input :value="sb.acNote ?? ''" placeholder="natural armor" @change="set('acNote', val($event).trim() || undefined)" />
          </span>
        </label>
        <label class="sf-field"><span class="sf-label">Hit points</span>
          <span class="cf-row">
            <input type="number" class="cf-num big" :value="sb.hp ?? ''" @change="set('hp', num(val($event)))" />
            <input :value="sb.hitDice ?? ''" placeholder="hit dice, e.g. 4d8 + 4" @change="set('hitDice', val($event).trim() || undefined)" />
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
        <label v-for="a in ABIL" :key="a" class="cf-ability" :title="ABIL_NAMES[a]">
          <b>{{ a.toUpperCase() }}</b>
          <input type="number" min="1" max="30" :value="sb.abilities?.[a] ?? ''" placeholder="10" @change="setAbility(a, val($event))" />
          <span class="cf-mod">{{ signed(modOf(a)) }}</span>
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
            <input v-if="skillOn(s)" type="number" :value="skillOn(s)!.n ?? ''" :placeholder="signed(skillSuggest(s))" @change="setSkillBonus(s, val($event))" />
          </span>
        </div>
        <p v-if="otherSkills.length" class="muted small">Also in the skills text: <b>{{ otherSkills.map(b => b.name + (b.n != null ? ' ' + signed(b.n) : '')).join(', ') }}</b>
          <button type="button" class="link-btn" title="Remove these from the skills" @click="set('skills', writeBonuses(skills.filter(b => !otherSkills.includes(b))))">remove</button></p>
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
      <div class="sf-field"><span class="sf-label">Damage resistances</span>
        <TokenField :model-value="sb.resistances" :options="DAMAGE" :suggestions="[NONMAGICAL]" @update:model-value="v => set('resistances', v)" />
      </div>
      <div class="sf-field"><span class="sf-label">Damage immunities</span>
        <TokenField :model-value="sb.immunities" :options="DAMAGE" :suggestions="[NONMAGICAL]" @update:model-value="v => set('immunities', v)" />
      </div>
      <div class="sf-field"><span class="sf-label">Condition immunities</span>
        <TokenField :model-value="sb.conditionImmunities" :options="CONDS" @update:model-value="v => set('conditionImmunities', v)" />
      </div>
    </section>

    <!-- what it can do -->
    <section class="card cf-card">
      <nav class="tabs cf-tabs">
        <a v-for="[k, label] in FEATS" :key="k" href="#" :class="{ on: tab === k }" @click.prevent="tab = k">{{ label }} <span class="muted small">{{ feats(k).length || '' }}</span></a>
      </nav>
      <div v-for="(f, i) in feats(tab)" :key="tab + i" class="cf-feat">
        <div class="cf-feat-head">
          <input class="cf-feat-name" :value="f.name" placeholder="Name" @change="setFeat(i, { name: val($event) })" />
          <button type="button" class="link-btn" title="Move up" :disabled="i === 0" @click="moveFeat(i, -1)">↑</button>
          <button type="button" class="link-btn" title="Move down" :disabled="i === feats(tab).length - 1" @click="moveFeat(i, 1)">↓</button>
          <button type="button" class="x" title="Remove" @click="removeFeat(i)">×</button>
        </div>
        <textarea v-grow :value="f.text" rows="2" :placeholder="tab === 'actions' ? ATTACK : 'What it does'" @input="grow" @change="setFeat(i, { text: val($event) })" />
      </div>
      <p v-if="!feats(tab).length" class="muted small">None yet.</p>
      <button type="button" class="chip-btn" @click="addFeat">＋ Add {{ FEATS.find(x => x[0] === tab)![1].toLowerCase().replace(/s$/, '') }}</button>
    </section>

    <label class="sf-field cf-srd"><span class="sf-label">SRD monster <span class="muted">(take the stats from the SRD instead of writing them out)</span></span>
      <input :value="sb.srd ?? ''" placeholder="e.g. Sahuagin" @change="set('srd', val($event).trim() || undefined)" />
    </label>
  </div>
</template>
