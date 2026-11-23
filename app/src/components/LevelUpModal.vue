<script setup lang="ts">
// Levelling a character up, in one dialog: which class gains the level (or a new one, multiclassing), the hit points
// it adds (the die's average or a typed roll, plus CON), the features that level brings, the subclass when it's due,
// the feat (or Ability Score Improvement) at the class's feat levels, and how many more spells the class gets.
// Choices the new features ask for show up in the sheet's Choices card afterwards, as always.
import Dropdown from './Dropdown.vue'
import HitDieChoice from './HitDieChoice.vue'
import { hpGain, hpMode } from '../hitPoints'
import SkillGrid from './SkillGrid.vue'
import { pickFrame } from '../skillFrames'
import { computed, ref } from 'vue'
import type { CharacterSheet, ClassLine, Entry, Spellbook } from '../model/types'
import { classesOf, totalLevel } from '../model/classes'
import { EPIC_BOON_LEVEL, basicsOf, hitDieOf, multiclassOf, rulesOf, subclassLevelOf, dieOf, classEntry } from '../classRules'
import { bonusApplied, bonusOpen, type BonusChoice } from '../abilityBonus'
import { byType, entries, get, listOptions } from '../store'
import { castingAbility, maxHpOf, skillLevel, spellStats } from '../sheet'
import { classSlotsAt } from '../slots'
import MarkdownView from './MarkdownView.vue'
import FeatureChoices from './FeatureChoices.vue'
import { editSheet, profsToEdit, sheetToEdit } from '../sheetData'
import { SKILLS, mod, signed, ABILITY_KEYS, ORD, profBonus } from '../model/dnd'
import { itemNamed } from '../lookup'
import { featsAllowed, isAsiFeat, levelCap, rule } from '../rules'
import { gearTotals, scoreWith } from '../effects'
import { backgroundOf, choiceOpen, featBonusFor, featGivesSave, featOfFeature, speciesTraits, isToolKind } from '../species'
import { traitsOf } from '../model/traits'
import { unmet } from '../requirements'
import { changed } from '../edit'
import { renderInline } from '../markdown'
import FeatScoreTable from './FeatScoreTable.vue'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const emit = defineEmits<{ close: [] }>()

const lines = computed(() => classesOf(props.pc))
const total = computed(() => totalLevel(props.pc))
const main = computed(() => [...lines.value].sort((a, b) => b.level - a.level)[0])
/** The class gaining the level: one the character has, or a new one. */
const cls = ref<string>(main.value?.class ?? '')
const line = computed<ClassLine | undefined>(() => lines.value.find(l => l.class === cls.value))
// a new class only when the ruleset allows multiclassing (or the character has no class yet)
const others = computed(() => (lines.value.length && rule('multiclassing') === 'off' ? [] : listOptions('class').filter(o => !lines.value.some(l => l.class === o.id))))
const label = (id: string) => listOptions('class').find(o => o.id === id)?.label ?? id
const newLevel = computed(() => (line.value?.level ?? 0) + 1)

// ---- hit points ----
const die = computed(() => (line.value ? dieOf(line.value) : cls.value ? hitDieOf(cls.value) : props.s.hitDie || 'd8'))
const size = computed(() => Number(die.value.replace(/\D/g, '')) || 8)
const con = computed(() => mod(scoreWith(props.s, 'con', gearTotals(props.s))))
/** The roll (HitDieChoice): undefined the average, null rolled but not typed yet. */
const roll = ref<number | null | undefined>(undefined)
/** What the level adds, as the Ruleset counts it (hitPoints.ts); null while a roll is missing. */
const gain = computed(() => hpGain(hpMode(), roll.value, size.value, con.value))

// ---- subclass and features ----
const subclasses = computed(() => (byType.value.get('subclass') ?? []).filter(e => e.fields.class === cls.value).sort((a, b) => a.name.localeCompare(b.name)))
const needsSub = computed(() => newLevel.value === subclassLevelOf(cls.value) && !line.value?.subclass && subclasses.value.length > 0)
const sub = ref('')
const subId = computed(() => line.value?.subclass ?? (needsSub.value ? sub.value : ''))
const features = computed(() => [classEntry(cls.value), get(subId.value || undefined)].flatMap(e => (e ? traitsOf(e).filter(t => (t.level ?? 1) === newLevel.value).map(t => ({ from: e, t })) : [])))

// ---- feat ----
const featLevels = computed(() => rulesOf(cls.value)?.featLevels ?? [4, 8, 12, 16, 19])
const featDue = computed(() => featLevels.value.includes(newLevel.value))
const boon = computed(() => newLevel.value === EPIC_BOON_LEVEL)
/** Feats the character already has (only the Ability Score Improvement can be taken again). */
const taken = computed(() => new Set([get(backgroundOf(props.pc)?.fields.originFeat)?.id, ...(props.s.features ?? []).map(f => featOfFeature(f)?.id)].filter(Boolean) as string[]))
/** A feat that can be taken again: marked Repeatable (the Ability Score Improvement always is). */
const isAsi = (f: Entry) => !!f.fields.repeatable || /^ability score improvement$/i.test(f.name.trim())
/** The character's features and feats by name, for a feat's "has feature" prerequisite. */
const featureNames = computed(() => new Set([...speciesTraits(props.pc, props.s).map(a => a.trait.name), ...(props.s.features ?? []).map(x => x.name)].map(n => n.toLowerCase())))
const hasFeature = (name: string) => [...featureNames.value].some(n => n === name.toLowerCase() || n.startsWith(name.toLowerCase()))
/** Why a feat can't be taken now: the level it needs, the feats it needs, already taken. */
function lacks(f: Entry): string {
  const need = Number(f.fields.level) || 0
  if (need > total.value + 1) return `level ${need}+`
  const missing = ((f.fields.requires as string[] | undefined) ?? []).filter(id => !taken.value.has(id)).map(id => get(id)?.name ?? id)
  if (missing.length) return `needs ${missing.join(', ')}`
  if (taken.value.has(f.id) && !isAsi(f)) return 'taken'
  const why = unmet(props.pc, props.s, f, a => scoreNow(a), !!castingAbility(props.pc, props.s), hasFeature)
  if (why.length) return why.join(', ')
  return ''
}
/** The feats on offer, by kind: Epic Boons at 19, General, Origin and Fighting Style feats, and any other. */
const KINDS = ['Epic Boon', 'General Feat', 'Origin Feat', 'Fighting Style', 'Other']
const KIND_LABEL: Record<string, string> = { 'Epic Boon': 'Epic Boons', 'General Feat': 'General feats', 'Origin Feat': 'Origin feats', 'Fighting Style': 'Fighting styles', Other: 'Other' }
const featGroups = computed(() => {
  // the Ruleset's "Ability Score Improvement only": that feat alone
  const all = entries.value.filter(e => e.type === 'feat' && (featsAllowed() || isAsiFeat(e.name))).sort((a, b) => a.name.localeCompare(b.name))
  const kinds = boon.value ? KINDS : KINDS.filter(k => k !== 'Epic Boon')
  const kindOf = (f: Entry) => (KINDS.includes(String(f.fields.category)) ? String(f.fields.category) : 'Other')
  return kinds.map(k => ({ kind: k, label: KIND_LABEL[k], list: all.filter(f => kindOf(f) === k) })).filter(g => g.list.length)
})
const featNote = (f: Entry) => (lacks(f) ? ` (${lacks(f)})` : f.fields.prerequisite ? ` (${f.fields.prerequisite})` : '')
const feat = ref('')
const choice = ref<BonusChoice>({ picks: [] })
const featBonus = computed(() => featBonusFor(get(feat.value || undefined), props.s.saves))
/** The scores as they are now on the sheet (before what the increase adds). */
/** What the scores feed now, for the feat's table: hit points, the spellcasting. */
const castNow = computed(() => castingAbility(props.pc, props.s))
const spellNow = computed(() => (castNow.value ? spellStats(props.pc, castNow.value) : undefined))
const baseScores = computed(() => Object.fromEntries(ABILITY_KEYS.map(a => [a, props.s.abilities[a] ?? 10])) as Record<(typeof ABILITY_KEYS)[number], number>)

// ---- multiclassing: the scores it asks for, and what the new class brings ----
const isNew = computed(() => !!cls.value && !line.value && lines.value.length > 0)
const mc = computed(() => (isNew.value ? multiclassOf(cls.value) : undefined))
const scoreNow = (a: string) => scoreWith(props.s, a as (typeof ABILITY_KEYS)[number], gearTotals(props.s))
const needText = (c: string) => { const m = multiclassOf(c); return m ? `${label(c)} ${m.primary.map(a => a.toUpperCase()).join(m.any ? ' or ' : ' + ')} 13` : '' }
/** What the classes ask for and the character lacks: "Wizard: INT 13 (has 10)". */
const prereqs = computed(() => {
  if (!isNew.value || rule('multiclassing') === 'free') return []
  const need = (c: string) => {
    const m = multiclassOf(c)
    if (!m) return ''
    const short = (a: string) => `${a.toUpperCase()} 13 (has ${scoreNow(a)})`
    const low = m.primary.filter(a => scoreNow(a) < 13)
    if (m.any ? low.length < m.primary.length : !low.length) return ''
    return `${label(c)}: ${m.any ? m.primary.map(short).join(' or ') : low.map(short).join(', ')}`
  }
  return [cls.value, ...lines.value.map(l => l.class)].map(need).filter(Boolean)
})
const allowAnyway = ref(false)
const mcSkills = ref<string[]>([])
const mcInstrument = ref('')
/** The new class's skills on the skill grid: only its list, its count; the picks show as they'll be. */
const mcFrame = computed(() => {
  const from = rulesOf(cls.value)?.skills.from ?? []
  const f = pickFrame({
    candidates: from.length ? from : SKILLS.map(x => x.name), picked: mcSkills.value, count: mc.value?.skills ?? 0, prof: profBonus(newLevel.value),
    levelOf: n => skillLevel(props.s, n),
    toggle: n => { mcSkills.value = mcSkills.value.includes(n) ? mcSkills.value.filter(x => x !== n) : [...mcSkills.value, n] },
  })
  return { ...f, level: (n: string) => (mcSkills.value.includes(n) ? Math.max(1, skillLevel(props.s, n)) : undefined) }
})
const instruments = computed(() => entries.value.filter(isToolKind).sort((a, b) => a.name.localeCompare(b.name)))
const gains = computed(() => (mc.value ? [...mc.value.armor.map(x => (x === 'Shield' ? 'Shields' : `${x} armor`)), ...mc.value.weapons.map(x => `${x} weapons`), ...mc.value.tools.map(t => get(t)?.name ?? t)] : []))
const pickFeat = (id: string) => { feat.value = id; choice.value = { picks: [] } }

// ---- spells: what the class's table gives at the new level ----
const spells = computed(() => {
  const r = rulesOf(cls.value)
  if (!r?.cantrips && !r?.prepared) return undefined
  const was = (l?: number[]) => (newLevel.value > 1 ? l?.[newLevel.value - 2] ?? 0 : 0), now = (l?: number[]) => l?.[newLevel.value - 1] ?? 0
  return {
    cantrips: [was(r.cantrips), now(r.cantrips)] as const,
    prepared: [was(r.prepared), now(r.prepared)] as const,
    book: r.spellbook ? (newLevel.value === 1 ? r.spellbook : 2) : 0,
  }
})

// ---- what grows at the new level: more picks (invocations, Metamagic), a scaling value, pact slots ----
const atStep = <T,>(steps: [number, T][] | undefined, l: number) => steps?.filter(([x]) => x <= l).at(-1)?.[1]
const grows = computed(() => {
  const n = newLevel.value, out: string[] = []
  for (const e of [classEntry(cls.value), get(subId.value || undefined)]) {
    for (const t of e ? traitsOf(e) : []) {
      if ((t.level ?? 1) >= n) continue // a new feature is listed above
      const c0 = atStep(t.choice?.steps, n - 1), c1 = atStep(t.choice?.steps, n)
      if (c1 != null && c1 !== c0) out.push(`${t.name}: ${c0 ?? 0} → ${c1}`)
      const s0 = atStep(t.scale?.steps, n - 1), s1 = atStep(t.scale?.steps, n)
      if (s1 != null && s1 !== s0) out.push(`${t.scale!.label || t.name}: ${s0 ?? '—'} → ${s1}`)
      const u0 = atStep(t.uses?.steps, n - 1), u1 = atStep(t.uses?.steps, n)
      if (u1 != null && u1 !== u0) out.push(`${t.name} uses: ${u0 ?? 0} → ${u1}`)
    }
  }
  if (basicsOf(cls.value).caster === 'pact' && n > 1) {
    const a = classSlotsAt('pact', n - 1).pact!, b = classSlotsAt('pact', n).pact!
    if (a.count !== b.count || a.level !== b.level) out.push(`Pact slots: ${a.count} × ${ORD[a.level]} → ${b.count} × ${ORD[b.level]}`)
  }
  return out
})
/** A feature's text: its first paragraph, the rest folded. */
const firstPara = (t: string) => t.split(/\n\s*\n/)[0]
const restOf = (t: string) => t.split(/\n\s*\n/).slice(1).join('\n\n')
/** After the level is taken: the choices it opened, made here before closing. */
const phase = ref<'level' | 'choices'>('level')

// ---- what's still missing ----
const open = computed(() => [
  !cls.value && 'a class',
  gain.value == null && (roll.value != null ? `a roll from 1 to ${size.value} (${roll.value} isn't one)` : `a roll from 1 to ${size.value}`),
  needsSub.value && !sub.value && 'a subclass',
  featDue.value && !feat.value && (boon.value ? 'an Epic Boon' : 'a feat'),
  featDue.value && feat.value && bonusOpen(featBonus.value, choice.value) > 0 && 'the feat’s ability scores',
  prereqs.value.length > 0 && !allowAnyway.value && 'the multiclassing scores (or the DM’s OK)',
  !!mc.value?.skills && mcSkills.value.length < mc.value.skills && `${mc.value.skills - mcSkills.value.length} skill`,
  !!mc.value?.instruments && !mcInstrument.value && 'a musical instrument',
].filter(Boolean) as string[])

function apply() {
  if (open.value.length || total.value >= levelCap()) return
  const pc = props.pc
  // what was picked, taken before the class line changes (the dialog's numbers follow the class level)
  const hp = gain.value!, takeFeat = featDue.value && feat.value ? get(feat.value) : undefined, epic = boon.value
  const add = bonusApplied(featBonus.value, choice.value), sp = spells.value
  const brings = mc.value, skills = [...mcSkills.value], instrument = mcInstrument.value
  // max HP before: the current HP goes up by what the maximum does (the level's HP, a per-level bonus, a higher CON)
  const maxBefore = maxHpOf(sheetToEdit(pc))
  // the class line
  const l: ClassLine[] = JSON.parse(JSON.stringify(lines.value))
  const at = l.find(x => x.class === cls.value)
  if (at) { at.level += 1; if (needsSub.value && sub.value) at.subclass = sub.value }
  else l.push({ class: cls.value, level: 1 })
  pc.fields.classLevels = l
  delete pc.fields.level
  editSheet(pc, s => {
    // hit points: the level's (a sheet without a maximum keeps none); a higher CON from the feat below adds the
    // difference for every level by itself (sheet.ts baseMaxHp), this one included
    if (s.maxHp != null) s.maxHp += hp
    // the feat: its ability increases go into the scores (at most 20); a named feat is listed with the features
    if (takeFeat) {
      const f = takeFeat
      for (const a of ABILITY_KEYS) if (add[a]) s.abilities[a] = Math.min(epic ? 30 : 20, (s.abilities[a] ?? 10) + add[a]!)
      // Resilient: proficiency in the raised ability's saves
      if (featGivesSave(f)) for (const a of ABILITY_KEYS) if (add[a] && !s.saves.includes(a)) s.saves.push(a)
      if (!/^ability score improvement$/i.test(f.name.trim())) s.features = [...(s.features ?? []), { name: f.name, text: String(f.fields.summary ?? '').trim() }]
    }
    // a new class's proficiencies (multiclassing)
    if (brings) {
      const p = profsToEdit(s)
      const addTo = (l: string[], xs: string[]) => { for (const x of xs) if (!l.includes(x)) l.push(x) }
      addTo(p.armor, brings.armor)
      addTo(p.weapons, brings.weapons)
      for (const t of [...brings.tools, ...(instrument ? [instrument] : [])]) {
        const id = get(t)?.type === 'item' ? t : itemNamed(t)?.id
        if (id) addTo(p.tools, [id]); else p.other = [p.other, t].filter(Boolean).join(', ')
      }
      for (const sk of skills) s.skills[sk] ??= 1
    }
    // spells: more to prepare, and a wizard's two new spellbook spells are theirs to pick in the Spellbook
    if (sp) {
      const book: Spellbook = s.spellbook ?? { slots: Array.from({ length: 9 }, () => ({ max: 0, used: 0 })), known: [], prepared: [], always: [] }
      const [was, now] = sp.prepared
      if (now !== was) book.preparedMax = (book.preparedMax ?? was) + (now - was)
      s.spellbook = book
    }
  })
  // the current HP goes up by as much as the maximum did
  editSheet(pc, s => {
    const after = maxHpOf(s)
    if (s.hp != null && after != null && maxBefore != null) s.hp = Math.min(after, s.hp + Math.max(0, after - maxBefore))
  })
  changed(pc)
  // choices the new level opened (an invocation, Expertise, a mastery): made here, then done
  const pending = speciesTraits(pc, sheetToEdit(pc)).some(a => a.active && choiceOpen(a))
  if (pending) phase.value = 'choices'
  else emit('close')
}
</script>

<template>
  <div class="modal-back" @mousedown.self="emit('close')" @keydown.esc="emit('close')">
    <div class="modal levelup" role="dialog" aria-label="Level up">
      <header class="modal-head">
        <h2>{{ phase === 'choices' ? `Level ${total}: its choices` : `Level up to ${total + 1}` }}</h2>
        <span class="spacer" />
        <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
      </header>

      <template v-if="phase === 'choices'">
        <FeatureChoices :pc="pc" :s="s" open-only />
        <footer class="lu-foot"><span class="muted small">These can also be made later, from "to pick" on the sheet.</span><span class="spacer" /><button class="primary" @click="emit('close')">Done</button></footer>
      </template>
      <template v-else>
      <section>
        <h3>Class</h3>
        <Dropdown v-model="cls" aria-label="Class gaining the level" @change="sub = ''; feat = ''">
          <option v-for="l in lines" :key="l.class" :value="l.class">{{ label(l.class) }} {{ l.level }} → {{ l.level + 1 }}</option>
          <optgroup v-if="others.length" label="A new class (multiclassing)">
            <option v-for="o in others" :key="o.id" :value="o.id">{{ o.label }} 1</option>
          </optgroup>
        </Dropdown>
        <template v-if="isNew">
          <div v-if="prereqs.length" class="lu-warn small">
            <b>Multiclassing needs 13 in each class's main score:</b>
            <ul><li v-for="p in prereqs" :key="p">{{ p }}</li></ul>
            <label><input v-model="allowAnyway" type="checkbox" /> The DM allows it anyway</label>
          </div>
          <p v-else-if="rule('multiclassing') !== 'free'" class="small muted">Meets the multiclassing scores ({{ [cls, ...lines.map(l => l.class)].map(needText).filter(Boolean).join(', ') }}).</p>
          <p v-if="!multiclassOf(cls)" class="small muted">{{ label(cls) }} has no multiclassing rules here; add its proficiencies on the Edit page.</p>
          <p v-else class="small">Gains: {{ gains.join(', ') || 'no armor, weapon or tool proficiencies' }}</p>
          <div v-if="mc?.skills" class="lu-pick">
            <span class="small">Skill{{ mc.skills === 1 ? '' : 's' }} from {{ cls }} ({{ mcSkills.length }}/{{ mc.skills }}):</span>
            <SkillGrid compact no-saves :s="s" :prof="profBonus(newLevel)" :frame="mcFrame" :class="{ 'wz-todo': mcSkills.length < mc.skills }" />
          </div>
          <div v-if="mc?.instruments" class="lu-pick">
            <span class="small">Musical instrument:</span>
            <Dropdown v-model="mcInstrument" aria-label="Musical instrument">
              <option value="">Pick one…</option>
              <option v-for="e in instruments" :key="e.id" :value="e.id">{{ e.name }}</option>
            </Dropdown>
          </div>
        </template>
      </section>

      <section>
        <h3>Hit points</h3>
        <HitDieChoice v-model="roll" :die="die" :con="con" />
      </section>

      <section v-if="needsSub">
        <h3>Subclass</h3>
        <Dropdown v-model="sub" aria-label="Subclass">
          <option value="">Pick a subclass…</option>
          <option v-for="e in subclasses" :key="e.id" :value="e.id">{{ e.name }}</option>
        </Dropdown>
      </section>

      <section>
        <h3>New features</h3>
        <ul v-if="features.length" class="lu-feats">
          <li v-for="f in features" :key="f.from.id + f.t.name"><b>{{ f.t.name }}</b> <span class="muted small">· {{ f.from.name }}</span>
            <div v-if="f.t.text" class="small lu-text"><MarkdownView :source="firstPara(String(f.t.text))" />
              <details v-if="restOf(String(f.t.text))" class="lu-more"><summary class="small">more</summary><MarkdownView :source="restOf(String(f.t.text))" /></details></div></li>
        </ul>
        <p v-else-if="!grows.length" class="muted small">None listed for {{ label(cls) }} {{ newLevel }}<template v-if="!classEntry(cls)"> (the world has no class entry for it)</template>.</p>
        <ul v-if="grows.length" class="plain small lu-grows"><li v-for="g in grows" :key="g">{{ g }}</li></ul>
        <p class="muted small">Choices they ask for come right after Level up.</p>
      </section>

      <section v-if="featDue">
        <h3>{{ boon ? 'Epic Boon' : 'Feat or Ability Score Improvement' }}</h3>
        <Dropdown :value="feat" aria-label="Feat" @change="pickFeat(($event.target as HTMLSelectElement).value)">
          <option value="">Pick one…</option>
          <optgroup v-for="g in featGroups" :key="g.kind" :label="g.label">
            <option v-for="f in g.list" :key="f.id" :value="f.id" :disabled="!!lacks(f)">{{ f.name }}{{ featNote(f) }}</option>
          </optgroup>
        </Dropdown>
        <p v-if="feat" class="small"><EntryLink :id="feat" /><template v-if="get(feat)?.fields.prerequisite"> · <i>{{ get(feat)?.fields.prerequisite }}</i></template> <span class="muted" v-html="renderInline(String(get(feat)?.fields.summary ?? '').replace(/\s*\*?Source:[^*]*\*?\s*$/, ''))" /></p>
        <FeatScoreTable v-if="featBonus" :key="feat" v-model="choice" :bonus="featBonus" :before="baseScores" :s="s" :prof="profBonus(total)" :level="total"
                        :hp="maxHpOf(s)" :casting="castNow" :spell="spellNow" :primary="multiclassOf(cls)?.primary" />
      </section>

      <section v-if="spells">
        <h3>Spells</h3>
        <ul class="plain small">
          <li v-if="spells.cantrips[1] !== spells.cantrips[0]">Cantrips: {{ spells.cantrips[0] }} → <b>{{ spells.cantrips[1] }}</b> (learn {{ spells.cantrips[1] - spells.cantrips[0] }} in the Spellbook)</li>
          <li v-if="spells.prepared[1] !== spells.prepared[0]">Prepared spells: {{ spells.prepared[0] }} → <b>{{ spells.prepared[1] }}</b></li>
          <li v-if="spells.book">Spellbook: add {{ spells.book }} spells</li>
          <li class="muted">Spell slots follow the class levels by themselves.</li>
        </ul>
      </section>

      <footer class="lu-foot">
        <span v-if="open.length" class="muted small">Still to pick: {{ open.join(', ') }}</span>
        <span class="spacer" />
        <button @click="emit('close')">Cancel</button>
        <button class="primary" :disabled="open.length > 0" @click="apply">Level up</button>
      </footer>
      </template>
    </div>
  </div>
</template>
