<script setup lang="ts">
// A race's species traits (species.ts), on its Edit page: one card each with what it is and does, from which level,
// uses per rest, and a choice for the player (pick skills, languages or tools, or one of several options).
import { computed } from 'vue'
import type { Trait, TraitChoice, TraitOption } from '../../model/types'
import { choiceWords, newTraitId } from '../../species'
import { listOptions } from '../../store'
import { ABILITY_KEYS, ABILITY_NAME } from '../../abilityBonus'
import TraitOptionFields from './TraitOptionFields.vue'
import ChoiceFields from './ChoiceFields.vue'
import TraitChips from '../TraitChips.vue'

const model = defineModel<Trait[] | undefined>()
const props = defineProps<{ /** The entry's type: more spell lists are offered on a class or subclass only. */ entryType?: string }>()
const forClass = computed(() => props.entryType === 'class' || props.entryType === 'subclass')
/** The folded settings a trait has set, in a word each, for the fold's label. */
const moreSet = (t: Trait) => [
  t.onSheet && (t.onSheet === 'show' ? 'always on the sheet' : 'not in play'), t.uses && 'limited uses', t.scale && 'scaling value',
  t.castWith && 'spells cast with', t.spellLists?.length && 'more spell lists',
].filter(Boolean) as string[]
const list = computed(() => model.value ?? [])
const save = (l: Trait[]) => { model.value = l.length ? l : undefined }
function put(i: number, t: Trait) { const l = [...list.value]; l[i] = t; save(l) }
const patch = (i: number, p: Partial<Trait>) => {
  const t: Trait = { ...list.value[i], ...p }
  if (!t.level || t.level <= 1) delete t.level
  for (const k of ['uses', 'choice', 'scale', 'onSheet', 'spellLists', 'castWith'] as const) if (t[k] == null) delete t[k]
  put(i, t)
}
const add = () => save([...list.value, { id: newTraitId(), name: 'New trait' }])
const remove = (i: number) => { if (confirm(`Remove the trait “${list.value[i].name}”? Characters lose its choices and uses.`)) save(list.value.filter((_, k) => k !== i)) }
function move(i: number, by: number) {
  const l = [...list.value], j = i + by
  if (j < 0 || j >= l.length) return
  ;[l[i], l[j]] = [l[j], l[i]]
  save(l)
}

// ---- uses ----
function setUses(i: number, on: boolean) { patch(i, { uses: on ? { count: 1, recharge: 'long' } : undefined }) }
type Uses = NonNullable<Trait['uses']>
const COUNT_KINDS: { id: string; label: string }[] = [
  { id: 'n', label: 'a number' }, { id: 'pb', label: 'proficiency bonus' }, { id: 'level', label: 'class level' },
  ...(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(a => ({ id: a, label: `${a.toUpperCase()} modifier` })),
]
const countKind = (u: Uses) => (typeof u.count === 'number' ? 'n' : u.count)
const setUse = (i: number, p: Partial<Uses>) => {
  const u: Uses = { ...list.value[i].uses!, ...p }
  for (const k of ['times', 'steps', 'shortBack'] as const) if (!u[k] || (Array.isArray(u[k]) && !(u[k] as unknown[]).length)) delete u[k]
  patch(i, { uses: u })
}
/** "1:2, 3:3, 6:4" ⇄ [[1, 2], [3, 3], [6, 4]]: a value from a level on. */
const stepsText = (st?: [number, number | string][]) => (st ?? []).map(([l, v]) => `${l}:${v}`).join(', ')
function parseSteps<T extends number | string>(text: string, num: boolean): [number, T][] | undefined {
  const out = text.split(',').map(x => x.trim().match(/^(\d+)\s*:\s*(.+)$/)).filter((m): m is RegExpMatchArray => !!m)
    .map(m => [Number(m[1]), (num ? Number(m[2]) : m[2].trim()) as T] as [number, T]).filter(([l, v]) => l >= 1 && (!num || Number.isFinite(v)))
  return out.length ? out.sort((a, b) => a[0] - b[0]) : undefined
}
const setScale = (i: number, label: string, steps: string) => {
  const st = parseSteps<string>(steps, false)
  patch(i, { scale: label.trim() && st ? { label: label.trim(), steps: st } : undefined })
}

// ---- the choice ----
const CHOICE_KINDS: { id: TraitChoice['kind'] | ''; label: string }[] = [
  { id: '', label: 'No choice' }, { id: 'skill', label: 'Pick skills' }, { id: 'language', label: 'Pick languages' },
  { id: 'tool', label: 'Pick tools' }, { id: 'skillTool', label: 'Pick skills or tools' }, { id: 'expertise', label: 'Pick skills for Expertise' }, { id: 'feat', label: 'Pick feats' },
  { id: 'mastery', label: 'Pick weapons to master' }, { id: 'spell', label: 'Pick spells' }, { id: 'option', label: 'Pick options' },
]
/** A new choice of a kind, with its defaults (a spell choice: one cantrip, at will). */
const newChoice = (k: TraitChoice['kind']): TraitChoice => (k === 'spell' ? { kind: k, count: 1, spell: { level: 'Cantrip', how: 'atWill' } } : { kind: k, count: 1 })
/** Set, add (at the end) or remove (undefined) a choice an option brings. */
function setSubChoice(i: number, k: number, n: number, c: TraitChoice | undefined) {
  const o = list.value[i].choice!.options![k], l = [...(o.choices ?? [])]
  if (c) l[n] = c; else l.splice(n, 1)
  const next: TraitOption = { ...o, choices: l }
  if (!l.length) delete next.choices
  setOption(i, k, next)
}
function setChoiceKind(i: number, kind: string) {
  if (!kind) return patch(i, { choice: undefined })
  const k = kind as TraitChoice['kind']
  patch(i, { choice: k === 'option' ? { kind: k, options: [{ id: newTraitId(), name: 'Option 1' }, { id: newTraitId(), name: 'Option 2' }] } : newChoice(k) })
}
// ---- the ability its spells are cast with ----
type Cast = NonNullable<Trait['castWith']>
type Ab = NonNullable<Cast['among']>[number]
const castMode = (t: Trait) => (t.castWith?.sameAs != null ? 'same' : t.castWith ? 'pick' : '')
function setCastMode(i: number, mode: string) {
  const others = list.value.filter((_, k) => k !== i)
  patch(i, { castWith: mode === 'pick' ? { among: ['int', 'wis', 'cha'] } : mode === 'same' ? { sameAs: others[0]?.id ?? '' } : undefined })
}
function toggleCast(i: number, ab: Ab) {
  const s = new Set(list.value[i].castWith?.among ?? [])
  if (s.has(ab)) s.delete(ab); else s.add(ab)
  patch(i, { castWith: { among: ABILITY_KEYS.filter(a => s.has(a)) } })
}
function toggleList(i: number, id: string) {
  const l = new Set(list.value[i].spellLists ?? [])
  if (l.has(id)) l.delete(id); else l.add(id)
  patch(i, { spellLists: l.size ? [...l] : undefined })
}
const setChoice = (i: number, p: Partial<TraitChoice>) => patch(i, { choice: { ...list.value[i].choice!, ...p } })
const setOption = (i: number, k: number, o: TraitOption) => { const opts = [...(list.value[i].choice?.options ?? [])]; opts[k] = o; setChoice(i, { options: opts }) }
const addOption = (i: number) => setChoice(i, { options: [...(list.value[i].choice?.options ?? []), { id: newTraitId(), name: `Option ${(list.value[i].choice?.options?.length ?? 0) + 1}` }] })
const removeOption = (i: number, k: number) => setChoice(i, { options: (list.value[i].choice?.options ?? []).filter((_, n) => n !== k) })
const val = (ev: Event) => (ev.target as HTMLInputElement | HTMLSelectElement).value
const kindLabel = (c: TraitChoice) => choiceWords(c, c.count ?? 1)
</script>

<template>
  <div class="traits-input">
    <details v-for="(t, i) in list" :key="t.id" class="trait-card">
      <summary><b>{{ t.name || 'Unnamed trait' }}</b> <span v-if="(t.level ?? 1) > 1" class="muted small">level {{ t.level }}</span> <TraitChips :t="t" />
        <span v-if="t.choice" class="chip">choice: {{ t.choice.kind === 'option' ? `${t.choice.count ?? 1} of ${t.choice.options?.length ?? 0} options` : `${t.choice.count ?? 1} ${kindLabel(t.choice)}` }}</span>
      </summary>
      <TraitOptionFields :model-value="t" @update:model-value="v => put(i, v as Trait)" />
      <div class="trait-row">
        <label class="small">From level <input type="number" min="1" max="20" class="effect-value" :value="t.level ?? 1" @change="patch(i, { level: Number(val($event)) || 1 })" /></label>
      </div>
      <!-- the settings most traits don't need, folded; open when one of them is set -->
      <details class="trait-more" :open="moreSet(t).length > 0">
        <summary class="small">More settings<span v-if="moreSet(t).length" class="muted">: {{ moreSet(t).join(', ') }}</span></summary>
      <div class="trait-row">
        <label class="small" title="Listed on the sheet in play? By default only when there's something to use or read there; one that only gives proficiencies, spells or numbers the sheet shows anyway is left out.">On the sheet
          <select :value="t.onSheet ?? ''" @change="patch(i, { onSheet: (val($event) || undefined) as Trait['onSheet'] })">
            <option value="">when useful</option><option value="show">always</option><option value="hide">not in play</option>
          </select></label>
        <label class="small"><input type="checkbox" :checked="!!t.uses" @change="setUses(i, ($event.target as HTMLInputElement).checked)" /> Limited uses</label>
        <template v-if="t.uses">
          <select :value="countKind(t.uses)" aria-label="How many" @change="setUse(i, { count: val($event) === 'n' ? 1 : val($event) as Uses['count'] })">
            <option v-for="c in COUNT_KINDS" :key="c.id" :value="c.id">{{ c.label }}</option>
          </select>
          <input v-if="typeof t.uses.count === 'number'" type="number" min="1" class="effect-value" :value="t.uses.count" aria-label="Uses" @change="setUse(i, { count: Number(val($event)) || 1 })" />
          <label class="small" title="A pool: this many times the count (Lay on Hands: 5 × level)">× <input type="number" min="1" class="effect-value" :value="t.uses.times ?? 1" @change="setUse(i, { times: Number(val($event)) > 1 ? Number(val($event)) : undefined })" /></label>
          <select :value="t.uses.recharge" aria-label="Back on" @change="setUse(i, { recharge: val($event) as 'short' | 'long' })">
            <option value="short">per short rest</option>
            <option value="long">per long rest</option>
          </select>
          <label v-if="t.uses.recharge === 'long'" class="small" title="Given back on a short rest (Rage: 1)">short rest gives back <input type="number" min="0" class="effect-value" :value="t.uses.shortBack ?? 0" @change="setUse(i, { shortBack: Number(val($event)) || undefined })" /></label>
          <label class="small" title="The count from a level on, e.g. 1:2, 3:3, 6:4">by level <input class="steps-input" :value="stepsText(t.uses.steps)" placeholder="1:2, 3:3" @change="setUse(i, { steps: parseSteps<number>(val($event), true) })" /></label>
        </template>
      </div>
      <div class="trait-row">
        <label class="small" title="A value that grows with the level, shown with the trait (Rage Damage, Sneak Attack)">Scaling value
          <input class="steps-label" :value="t.scale?.label ?? ''" placeholder="e.g. Sneak Attack" @change="setScale(i, val($event), stepsText(t.scale?.steps))" /></label>
        <label v-if="t.scale" class="small">by level <input class="steps-input" :value="stepsText(t.scale.steps)" placeholder="1:1d6, 3:2d6" @change="setScale(i, t.scale.label, val($event))" /></label>
      </div>
      <div class="trait-row">
        <label class="small" title="The ability its spells (and its picked option's) are cast with, where a spell doesn't name one">Spells cast with
          <select :value="castMode(t)" @change="setCastMode(i, val($event))">
            <option value="">what each spell says</option><option value="pick">the player's pick</option><option value="same">the same as another trait</option>
          </select></label>
        <div v-if="castMode(t) === 'pick'" class="seg wrap">
          <button v-for="ab in ABILITY_KEYS" :key="ab" type="button" :class="{ on: t.castWith?.among?.includes(ab) }" @click="toggleCast(i, ab)">{{ ABILITY_NAME[ab] }}</button>
        </div>
        <select v-else-if="castMode(t) === 'same'" :value="t.castWith?.sameAs" aria-label="As which trait" @change="patch(i, { castWith: { sameAs: val($event) } })">
          <option v-for="o in list.filter(x => x.id !== t.id)" :key="o.id" :value="o.id">{{ o.name }}</option>
        </select>
      </div>
      <div v-if="forClass || t.spellLists?.length" class="trait-row">
        <details class="trait-among">
          <summary class="small" title="Its class can also take spells from these lists (Magical Secrets)">More spell lists: {{ t.spellLists?.join(', ') || 'none' }}</summary>
          <div class="seg wrap">
            <button v-for="o in listOptions('class')" :key="o.id" type="button" :class="{ on: t.spellLists?.includes(o.id) }" @click="toggleList(i, o.id)">{{ o.label }}</button>
          </div>
        </details>
      </div>
      </details>
      <div class="trait-row">
        <select :value="t.choice?.kind ?? ''" aria-label="Choice for the player" @change="setChoiceKind(i, val($event))">
          <option v-for="c in CHOICE_KINDS" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
        <ChoiceFields v-if="t.choice" :model-value="t.choice" @update:model-value="v => patch(i, { choice: v })" />
      </div>
      <div v-if="t.choice?.kind === 'option'" class="trait-options-edit">
        <div v-for="(o, k) in t.choice.options ?? []" :key="o.id" class="trait-option-card">
          <TraitOptionFields :model-value="o" @update:model-value="v => setOption(i, k, v)" />
          <div v-for="(c, n) in o.choices ?? []" :key="n" class="trait-row">
            <span class="small muted">Comes with a choice:</span>
            <select :value="c.kind" aria-label="What's picked" @change="setSubChoice(i, k, n, newChoice(val($event) as TraitChoice['kind']))">
              <option v-for="ck in CHOICE_KINDS.filter(x => x.id && x.id !== 'option')" :key="ck.id" :value="ck.id">{{ ck.label }}</option>
            </select>
            <ChoiceFields with-label :model-value="c" @update:model-value="v => setSubChoice(i, k, n, v)" />
            <button type="button" class="link-btn" title="Remove this choice" @click="setSubChoice(i, k, n, undefined)">×</button>
          </div>
          <button type="button" class="link-btn small" title="A choice the player makes once this option is picked (Pact of the Tome: cantrips)" @click="setSubChoice(i, k, (o.choices ?? []).length, newChoice('spell'))">+ Choice with this option</button>
          <button type="button" class="link-btn small" @click="removeOption(i, k)">Remove this option</button>
        </div>
        <button type="button" class="chip-btn" @click="addOption(i)">+ Option</button>
      </div>
      <div class="trait-row trait-actions">
        <button type="button" class="link-btn small" :disabled="!i" @click="move(i, -1)">↑ Up</button>
        <button type="button" class="link-btn small" :disabled="i === list.length - 1" @click="move(i, 1)">↓ Down</button>
        <button type="button" class="link-btn small danger" @click="remove(i)">Remove trait</button>
      </div>
    </details>
    <button type="button" class="chip-btn" @click="add">+ Trait</button>
  </div>
</template>
