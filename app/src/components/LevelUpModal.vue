<script setup lang="ts">
// Levelling a character up, in one dialog: which class gains the level (or a new one, multiclassing), the hit points
// it adds (the die's average or a typed roll, plus CON), the features that level brings, the subclass when it's due,
// the feat (or Ability Score Improvement) at the class's feat levels, and how many more spells the class gets.
// Choices the new features ask for show up in the sheet's Choices card afterwards, as always.
import { computed, ref } from 'vue'
import type { CharacterSheet, ClassLine, Entry, Spellbook } from '../model/types'
import { CLASS_DIE, classesOf, dieOf, totalLevel } from '../model/classes'
import { EPIC_BOON_LEVEL, SUBCLASS_LEVEL, rulesOf } from '../classRules'
import { ABILITY_KEYS, bonusApplied, bonusOpen, type BonusChoice } from '../abilityBonus'
import { byType, entries, get, listOptions } from '../store'
import { editSheet, mod, signed } from '../sheet'
import { gearTotals, scoreWith } from '../gear'
import { classEntry, traitsOf } from '../species'
import { changed } from '../edit'
import { renderInline } from '../markdown'
import BonusPicker from './BonusPicker.vue'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const emit = defineEmits<{ close: [] }>()

const lines = computed(() => classesOf(props.pc))
const total = computed(() => totalLevel(props.pc))
const main = computed(() => [...lines.value].sort((a, b) => b.level - a.level)[0])
/** The class gaining the level: one the character has, or a new one. */
const cls = ref<string>(main.value?.class ?? '')
const line = computed<ClassLine | undefined>(() => lines.value.find(l => l.class === cls.value))
const others = computed(() => listOptions('class').filter(o => !lines.value.some(l => l.class === o.id)))
const label = (id: string) => listOptions('class').find(o => o.id === id)?.label ?? id
const newLevel = computed(() => (line.value?.level ?? 0) + 1)

// ---- hit points ----
const die = computed(() => (line.value ? dieOf(line.value) : CLASS_DIE[cls.value] || props.s.hitDie || 'd8'))
const size = computed(() => Number(die.value.replace(/\D/g, '')) || 8)
const con = computed(() => mod(scoreWith(props.s, 'con', gearTotals(props.s))))
const how = ref<'avg' | 'roll'>('avg')
const roll = ref<number | null>(null)
const rolled = computed(() => (how.value === 'avg' ? size.value / 2 + 1 : roll.value))
const gain = computed(() => (rolled.value == null || rolled.value < 1 || rolled.value > size.value ? null : Math.max(1, rolled.value + con.value)))

// ---- subclass and features ----
const subclasses = computed(() => (byType.value.get('subclass') ?? []).filter(e => e.fields.class === cls.value).sort((a, b) => a.name.localeCompare(b.name)))
const needsSub = computed(() => newLevel.value === SUBCLASS_LEVEL && !line.value?.subclass && subclasses.value.length > 0)
const sub = ref('')
const subId = computed(() => line.value?.subclass ?? (needsSub.value ? sub.value : ''))
const features = computed(() => [classEntry(cls.value), get(subId.value || undefined)].flatMap(e => (e ? traitsOf(e).filter(t => (t.level ?? 1) === newLevel.value).map(t => ({ from: e, t })) : [])))

// ---- feat ----
const featLevels = computed(() => rulesOf(cls.value)?.featLevels ?? [4, 8, 12, 16, 19])
const featDue = computed(() => featLevels.value.includes(newLevel.value))
const boon = computed(() => newLevel.value === EPIC_BOON_LEVEL)
const feats = computed(() => {
  const all = entries.value.filter(e => e.type === 'feat').sort((a, b) => a.name.localeCompare(b.name))
  const of = all.filter(f => f.fields.category === (boon.value ? 'Epic Boon' : 'General Feat'))
  return of.length ? of : all.filter(f => f.fields.category !== 'Origin Feat')
})
const feat = ref('')
const choice = ref<BonusChoice>({ picks: [] })
const featBonus = computed(() => get(feat.value || undefined)?.fields.abilityIncrease)
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

// ---- what's still missing ----
const open = computed(() => [
  !cls.value && 'a class',
  gain.value == null && (how.value === 'roll' ? `a roll from 1 to ${size.value}` : 'hit points'),
  needsSub.value && !sub.value && 'a subclass',
  featDue.value && !feat.value && (boon.value ? 'an Epic Boon' : 'a feat'),
  featDue.value && feat.value && bonusOpen(featBonus.value, choice.value) > 0 && 'the feat’s ability scores',
].filter(Boolean) as string[])

function apply() {
  if (open.value.length || total.value >= 20) return
  const pc = props.pc
  // what was picked, taken before the class line changes (the dialog's numbers follow the class level)
  const hp = gain.value!, takeFeat = featDue.value && feat.value ? get(feat.value) : undefined, epic = boon.value
  const add = bonusApplied(featBonus.value, choice.value), sp = spells.value
  // the class line
  const l: ClassLine[] = JSON.parse(JSON.stringify(lines.value))
  const at = l.find(x => x.class === cls.value)
  if (at) { at.level += 1; if (needsSub.value && sub.value) at.subclass = sub.value }
  else l.push({ class: cls.value, level: 1 })
  pc.fields.classLevels = l
  delete pc.fields.level
  editSheet(pc, s => {
    // hit points: the maximum and the current go up by the same (a sheet without a maximum keeps none)
    if (s.maxHp != null) {
      s.maxHp += hp
      if (s.hp != null) s.hp = Math.min(s.maxHp, s.hp + hp)
    }
    // the feat: its ability increases go into the scores (at most 20); a named feat is listed with the features
    if (takeFeat) {
      const f = takeFeat
      for (const a of ABILITY_KEYS) if (add[a]) s.abilities[a] = Math.min(epic ? 30 : 20, (s.abilities[a] ?? 10) + add[a]!)
      if (!/^ability score improvement$/i.test(f.name.trim())) s.features = [...(s.features ?? []), { name: f.name, text: String(f.fields.summary ?? '').trim() }]
    }
    // spells: more to prepare, and a wizard's two new spellbook spells are theirs to pick in the Spellbook
    if (sp) {
      const book: Spellbook = s.spellbook ?? { slots: Array.from({ length: 9 }, () => ({ max: 0, used: 0 })), known: [], prepared: [], always: [] }
      const [was, now] = sp.prepared
      if (now !== was) book.preparedMax = (book.preparedMax ?? was) + (now - was)
      s.spellbook = book
    }
  })
  changed(pc)
  emit('close')
}
</script>

<template>
  <div class="modal-back" @mousedown.self="emit('close')" @keydown.esc="emit('close')">
    <div class="modal levelup" role="dialog" aria-label="Level up">
      <header class="modal-head">
        <h2>Level up to {{ total + 1 }}</h2>
        <span class="spacer" />
        <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
      </header>

      <section>
        <h3>Class</h3>
        <select v-model="cls" aria-label="Class gaining the level" @change="sub = ''; feat = ''">
          <option v-for="l in lines" :key="l.class" :value="l.class">{{ label(l.class) }} {{ l.level }} → {{ l.level + 1 }}</option>
          <optgroup v-if="others.length" label="A new class (multiclassing)">
            <option v-for="o in others" :key="o.id" :value="o.id">{{ o.label }} 1</option>
          </optgroup>
        </select>
        <p v-if="!line && cls" class="muted small">A new class at level 1: check its multiclassing prerequisites with the DM.</p>
      </section>

      <section>
        <h3>Hit points</h3>
        <div class="lu-hp">
          <label><input v-model="how" type="radio" value="avg" /> Average: {{ size / 2 + 1 }} {{ signed(con) }} CON</label>
          <label><input v-model="how" type="radio" value="roll" /> Rolled {{ die }}:
            <input v-model.number="roll" type="number" min="1" :max="size" class="lu-roll" :disabled="how !== 'roll'" placeholder="?" @focus="how = 'roll'" /> {{ signed(con) }} CON</label>
          <b v-if="gain != null" class="lu-gain">+{{ gain }} HP</b>
        </div>
      </section>

      <section v-if="needsSub">
        <h3>Subclass</h3>
        <select v-model="sub" aria-label="Subclass">
          <option value="">Pick a subclass…</option>
          <option v-for="e in subclasses" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
      </section>

      <section>
        <h3>New features</h3>
        <ul v-if="features.length" class="lu-feats">
          <li v-for="f in features" :key="f.from.id + f.t.name"><b>{{ f.t.name }}</b> <span class="muted small">· {{ f.from.name }}</span>
            <div v-if="f.t.text" class="small lu-text" v-html="renderInline(String(f.t.text).split('\n')[0])" /></li>
        </ul>
        <p v-else class="muted small">None listed for {{ label(cls) }} {{ newLevel }}<template v-if="!classEntry(cls)"> (the world has no class entry for it)</template>.</p>
        <p class="muted small">Choices they ask for show up in the sheet's Choices card.</p>
      </section>

      <section v-if="featDue">
        <h3>{{ boon ? 'Epic Boon' : 'Feat or Ability Score Improvement' }}</h3>
        <select :value="feat" aria-label="Feat" @change="pickFeat(($event.target as HTMLSelectElement).value)">
          <option value="">Pick one…</option>
          <option v-for="f in feats" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <p v-if="feat" class="small"><EntryLink :id="feat" /> <span class="muted">{{ get(feat)?.fields.summary }}</span></p>
        <BonusPicker v-if="featBonus" v-model="choice" :bonus="featBonus" />
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
    </div>
  </div>
</template>
