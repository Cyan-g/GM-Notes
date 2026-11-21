<script setup lang="ts">
// The features of a class or subclass (and the traits of a race, background, feat or item) on its Edit page: one card
// each, a class's grouped under its levels. A card has the level first, then what the feature is and does, then the
// choice it asks of the player (options such as invocations fold to one row each), what happens in play (uses, a
// switch, a scaling value) and how its spells are cast.
import { computed, ref } from 'vue'
import type { Trait, TraitChoice, TraitOption } from '../../model/types'
import { choiceWords, newTraitId } from '../../species'
import { listOptions } from '../../store'
import { ABILITY_KEYS, ABILITY_NAME } from '../../model/dnd'
import TraitOptionFields from './TraitOptionFields.vue'
import ChoiceFields from './ChoiceFields.vue'
import StepsInput from './StepsInput.vue'
import TraitChips from '../TraitChips.vue'
import { inputValue as val } from '../../dom'

const model = defineModel<Trait[] | undefined>()
const props = defineProps<{ /** The entry's type: a class's or subclass's features are grouped by level. */ entryType?: string; /** Its class, for "Warlock level". */ className?: string; /** A subclass's levels to expect features at (its class's other subclasses'): shown even while empty. */ expectedLevels?: number[]; /** A subrace's: its main races' traits, one of which a trait may replace. */ parentTraits?: { id: string; name: string }[]; /** The entry's name: a feat's feature starts with it. */ entryName?: string }>()
const forClass = computed(() => props.entryType === 'class' || props.entryType === 'subclass')
const word = computed(() => (forClass.value || props.entryType === 'feat' ? 'feature' : 'trait'))
const levelWord = computed(() => (forClass.value && props.className ? `${props.className} level` : forClass.value ? 'Level' : 'Character level'))
/** Grouped under level headings: a class's features always, other traits once some come after level 1. */
const grouped = computed(() => forClass.value || list.value.some(t => (t.level ?? 1) > 1))
const list = computed(() => model.value ?? [])
const save = (l: Trait[]) => { model.value = l.length ? l : undefined }
function put(i: number, t: Trait) { const l = [...list.value]; l[i] = t; save(l) }
const patch = (i: number, p: Partial<Trait>) => {
  const t: Trait = { ...list.value[i], ...p }
  if (!t.level || t.level <= 1) delete t.level
  for (const k of ['uses', 'choice', 'scale', 'onSheet', 'spellLists', 'castWith', 'toggle', 'replaces'] as const) if (t[k] == null) delete t[k]
  put(i, t)
}
const lv = (t: Trait) => t.level ?? 1
/** The cards in order: a class's by level (then as listed), anything else as listed. */
const order = computed(() => list.value.map((_, i) => i).sort((a, b) => (grouped.value ? lv(list.value[a]) - lv(list.value[b]) : 0) || a - b))
/** The cards by level (a class's), with the expected levels that have none yet; one group for anything else. */
const sections = computed(() => {
  const all = order.value.map((i, pos) => ({ i, pos }))
  if (!grouped.value) return [{ level: 0, cards: all }]
  const levels = new Set([...all.map(c => lv(list.value[c.i])), ...(props.expectedLevels ?? [])])
  return [...levels].sort((a, b) => a - b).map(level => ({ level, cards: all.filter(c => lv(list.value[c.i]) === level) }))
})
const opened = ref<string | null>(null)
/** A new feature at a level (by default the last one's). */
const add = (at?: number) => {
  const id = newTraitId(), level = at ?? (forClass.value && order.value.length ? lv(list.value[order.value.at(-1)!]) : 1)
  save([...list.value, { id, name: forClass.value ? 'New feature' : 'New trait', ...(level > 1 ? { level } : {}) }])
  opened.value = id
}
/** A feat's first feature: named like the feat (its effects and choices are added to it). */
const startFromCard = () => { const id = newTraitId(); save([{ id, name: props.entryName! }]); opened.value = id }
const remove = (i: number) => { if (confirm(`Remove the ${word.value} “${list.value[i].name}”? Characters lose its choices and uses.`)) save(list.value.filter((_, k) => k !== i)) }
/** Up and down among the cards as shown: a class's only within its level (the level sets its place). */
const canMove = (pos: number, by: number) => { const j = pos + by; return j >= 0 && j < order.value.length && (!grouped.value || lv(list.value[order.value[j]]) === lv(list.value[order.value[pos]])) }
function move(pos: number, by: number) {
  if (!canMove(pos, by)) return
  const l = [...list.value], a = order.value[pos], b = order.value[pos + by]
  ;[l[a], l[b]] = [l[b], l[a]]
  save(l)
}

// ---- in play: uses, a switch, a scaling value ----
function setUses(i: number, on: boolean) { patch(i, { uses: on ? { count: 1, recharge: 'long' } : undefined }) }
type Uses = NonNullable<Trait['uses']>
const COUNT_KINDS: { id: string; label: string }[] = [
  { id: 'n', label: 'a number' }, { id: 'pb', label: 'proficiency bonus' }, { id: 'level', label: 'class level' },
  ...ABILITY_KEYS.map(a => ({ id: a, label: `${a.toUpperCase()} modifier` })),
]
const countKind = (u: Uses) => (typeof u.count === 'number' ? 'n' : u.count)
const setUse = (i: number, p: Partial<Uses>) => {
  const u: Uses = { ...list.value[i].uses!, ...p }
  for (const k of ['times', 'steps', 'shortBack'] as const) if (!u[k] || (Array.isArray(u[k]) && !(u[k] as unknown[]).length)) delete u[k]
  patch(i, { uses: u })
}
const setScale = (i: number, label: string, steps: [number, string][] | undefined) =>
  patch(i, { scale: label.trim() ? { label: label.trim(), steps: steps ?? [[lv(list.value[i]), '']] } : undefined })
/** What's set in a section, in a few words, for its folded heading. */
const playSet = (t: Trait) => [
  t.onSheet && (t.onSheet === 'show' ? 'always on the sheet' : 'not in play'), t.toggle && 'switched on in play',
  t.uses && `${typeof t.uses.count === 'number' ? t.uses.count : t.uses.count === 'pb' ? 'PB' : t.uses.count}${t.uses.steps?.length ? ' (by level)' : ''}/${t.uses.recharge} rest`,
  t.scale && `${t.scale.label} by level`,
].filter(Boolean) as string[]
const castSet = (t: Trait) => [t.castWith && (t.castWith.sameAs != null ? 'as another feature' : 'player’s pick'), t.spellLists?.length && `+ ${t.spellLists.join(', ')} lists`].filter(Boolean) as string[]

// ---- the choice ----
const CHOICE_KINDS: { id: TraitChoice['kind'] | ''; label: string }[] = [
  { id: '', label: 'No choice' }, { id: 'skill', label: 'Pick skills' }, { id: 'language', label: 'Pick languages' },
  { id: 'tool', label: 'Pick tools' }, { id: 'skillTool', label: 'Pick skills or tools' }, { id: 'expertise', label: 'Pick skills for Expertise' }, { id: 'feat', label: 'Pick feats' },
  { id: 'mastery', label: 'Pick weapons to master' }, { id: 'spell', label: 'Pick spells' }, { id: 'option', label: 'Pick options' },
]
const newChoice = (k: TraitChoice['kind']): TraitChoice => (k === 'spell' ? { kind: k, count: 1, spell: { level: 'Cantrip', how: 'atWill' } } : { kind: k, count: 1 })
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
const setChoice = (i: number, p: Partial<TraitChoice>) => patch(i, { choice: { ...list.value[i].choice!, ...p } })
const setOption = (i: number, k: number, o: TraitOption) => { const opts = [...(list.value[i].choice?.options ?? [])]; opts[k] = o; setChoice(i, { options: opts }) }
const openOption = ref<string | null>(null)
const addOption = (i: number) => {
  const id = newTraitId()
  setChoice(i, { options: [...(list.value[i].choice?.options ?? []), { id, name: `Option ${(list.value[i].choice?.options?.length ?? 0) + 1}` }] })
  openOption.value = id
}
const removeOption = (i: number, k: number) => {
  const o = list.value[i].choice?.options?.[k]
  if (o && confirm(`Remove the option “${o.name}”?`)) setChoice(i, { options: (list.value[i].choice?.options ?? []).filter((_, n) => n !== k) })
}
const optFilter = ref<Record<string, string>>({})
const shownOptions = (t: Trait) => {
  const q = (optFilter.value[t.id] ?? '').trim().toLowerCase(), all = (t.choice?.options ?? []).map((o, k) => ({ o, k }))
  return q ? all.filter(({ o }) => o.name.toLowerCase().includes(q) || (o.text ?? '').toLowerCase().includes(q)) : all
}
const optionName = (t: Trait, id?: string) => t.choice?.options?.find(o => o.id === id)?.name
const needsText = (t: Trait, o: TraitOption) => [o.needs?.level && `Lv ${o.needs.level}+`, o.needs?.option && optionName(t, o.needs.option)].filter(Boolean).join(', ')

// ---- spells cast with ----
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
const kindLabel = (c: TraitChoice) => choiceWords(c, c.count ?? 1)
</script>

<template>
  <div class="traits-input">
    <template v-for="sec in sections" :key="sec.level">
      <h4 v-if="grouped" class="trait-level-head">{{ levelWord }} {{ sec.level }}
        <button type="button" class="link-btn small" :title="`A new ${word} at ${levelWord.toLowerCase()} ${sec.level}`" @click="add(sec.level)">+ {{ forClass ? 'Feature' : 'Trait' }} here</button></h4>
      <p v-if="forClass && !sec.cards.length" class="muted small trait-gap">No feature yet: the other {{ className }} subclasses have one at this level.</p>
    <template v-for="{ i, pos } in sec.cards" :key="list[i].id">
      <details class="trait-card" :open="opened === list[i].id">
        <summary>
          <span v-if="forClass || lv(list[i]) > 1" class="lv-badge" :title="`Gained at ${levelWord.toLowerCase()} ${lv(list[i])}`">Lv {{ lv(list[i]) }}</span>
          <b>{{ list[i].name || `Unnamed ${word}` }}</b>
          <span v-if="list[i].replaces" class="chip">replaces {{ parentTraits?.find(p => p.id === list[i].replaces)?.name ?? 'a main race trait' }}</span>
          <TraitChips :t="list[i]" />
          <span v-if="list[i].choice" class="chip">choice: {{ list[i].choice!.kind === 'option' ? `${list[i].choice!.count ?? 1} of ${list[i].choice!.options?.length ?? 0} options` : `${list[i].choice!.count ?? 1} ${kindLabel(list[i].choice!)}` }}{{ list[i].choice!.steps?.length ? ', more by level' : '' }}</span>
        </summary>

        <div class="trait-row trait-when">
          <label>{{ levelWord }} <input type="number" min="1" max="20" class="effect-value" :value="lv(list[i])" @change="patch(i, { level: Number(val($event)) || 1 })" /></label>
          <span v-if="forClass" class="muted small">a character gets it when their {{ levelWord.toLowerCase() }} reaches this</span>
          <label v-if="parentTraits?.length" class="small" title="This trait takes the place of the main race's: characters of this subrace don't get that one">Replaces
            <select :value="list[i].replaces ?? ''" @change="patch(i, { replaces: val($event) || undefined })">
              <option value="">nothing (adds to them)</option>
              <option v-for="p in parentTraits" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select></label>
        </div>
        <TraitOptionFields :model-value="list[i]" :trait-level="lv(list[i])" :by-level="levelWord" @update:model-value="v => put(i, v as Trait)" />

        <!-- the choice for the player -->
        <fieldset class="trait-sec">
          <legend>Choice for the player</legend>
          <div class="trait-row">
            <select :value="list[i].choice?.kind ?? ''" aria-label="Choice for the player" @change="setChoiceKind(i, val($event))">
              <option v-for="c in CHOICE_KINDS" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
            <ChoiceFields v-if="list[i].choice" :model-value="list[i].choice!" @update:model-value="v => patch(i, { choice: v })" />
          </div>
          <div v-if="list[i].choice?.kind === 'option'" class="trait-options-edit">
            <div class="trait-row">
              <b class="small">{{ list[i].choice!.options?.length ?? 0 }} options</b>
              <input v-if="(list[i].choice!.options?.length ?? 0) > 6" v-model="optFilter[list[i].id]" type="search" class="sp-filter" placeholder="Filter options…" aria-label="Filter the options" />
            </div>
            <details v-for="{ o, k } in shownOptions(list[i])" :key="o.id" class="trait-option-card" :open="openOption === o.id">
              <summary><b>{{ o.name }}</b> <span v-if="needsText(list[i], o)" class="sp-prereq">{{ needsText(list[i], o) }}</span> <TraitChips :t="o" />
                <span v-if="o.choices?.length" class="chip">+ {{ o.choices.length }} choice{{ o.choices.length > 1 ? 's' : '' }}</span></summary>
              <TraitOptionFields :model-value="o" :trait-level="lv(list[i])" :siblings="list[i].choice!.options!.map(x => ({ id: x.id, name: x.name }))" :level-word="forClass ? levelWord : 'level'" :by-level="levelWord" @update:model-value="v => setOption(i, k, v)" />
              <div v-for="(c, n) in o.choices ?? []" :key="n" class="trait-row">
                <span class="small muted">Comes with a choice:</span>
                <select :value="c.kind" aria-label="What's picked" @change="setSubChoice(i, k, n, newChoice(val($event) as TraitChoice['kind']))">
                  <option v-for="ck in CHOICE_KINDS.filter(x => x.id && x.id !== 'option')" :key="ck.id" :value="ck.id">{{ ck.label }}</option>
                </select>
                <ChoiceFields with-label :model-value="c" @update:model-value="v => setSubChoice(i, k, n, v)" />
                <button type="button" class="link-btn" title="Remove this choice" @click="setSubChoice(i, k, n, undefined)">×</button>
              </div>
              <div class="trait-row">
                <button type="button" class="link-btn small" title="A choice the player makes once this option is picked (Pact of the Tome: cantrips)" @click="setSubChoice(i, k, (o.choices ?? []).length, newChoice('spell'))">+ Choice with this option</button>
                <span class="spacer" />
                <button type="button" class="link-btn small danger" @click="removeOption(i, k)">Remove this option</button>
              </div>
            </details>
            <p v-if="!shownOptions(list[i]).length" class="muted small">No option matches.</p>
            <button type="button" class="chip-btn" @click="addOption(i)">+ Option</button>
          </div>
        </fieldset>

        <!-- in play -->
        <details class="trait-sec trait-fold" :open="playSet(list[i]).length > 0">
          <summary>In play<span v-if="playSet(list[i]).length" class="muted small">: {{ playSet(list[i]).join(', ') }}</span></summary>
          <div class="trait-row">
            <label class="small" title="Listed on the sheet in play? By default only when there's something to use or read there; one that only gives proficiencies, spells or numbers the sheet shows anyway is left out.">On the sheet
              <select :value="list[i].onSheet ?? ''" @change="patch(i, { onSheet: (val($event) || undefined) as Trait['onSheet'] })">
                <option value="">when useful</option><option value="show">always</option><option value="hide">not in play</option>
              </select></label>
            <label class="small" title="Switched on and off in play (Rage): its effects only count while it's on"><input type="checkbox" :checked="!!list[i].toggle" @change="patch(i, { toggle: ($event.target as HTMLInputElement).checked || undefined })" /> Switched on in play</label>
          </div>
          <div class="trait-row">
            <label class="small"><input type="checkbox" :checked="!!list[i].uses" @change="setUses(i, ($event.target as HTMLInputElement).checked)" /> Limited uses</label>
            <template v-if="list[i].uses">
              <select :value="countKind(list[i].uses!)" aria-label="How many" @change="setUse(i, { count: val($event) === 'n' ? 1 : val($event) as Uses['count'] })">
                <option v-for="c in COUNT_KINDS" :key="c.id" :value="c.id">{{ c.label }}</option>
              </select>
              <input v-if="typeof list[i].uses!.count === 'number'" type="number" min="1" class="effect-value" :value="list[i].uses!.count" aria-label="Uses" @change="setUse(i, { count: Number(val($event)) || 1 })" />
              <label class="small" title="A pool: this many times the count (Lay on Hands: 5 × level)">× <input type="number" min="1" class="effect-value" :value="list[i].uses!.times ?? 1" @change="setUse(i, { times: Number(val($event)) > 1 ? Number(val($event)) : undefined })" /></label>
              <select :value="list[i].uses!.recharge" aria-label="Back on" @change="setUse(i, { recharge: val($event) as 'short' | 'long' })">
                <option value="short">per short rest</option>
                <option value="long">per long rest</option>
              </select>
              <label v-if="list[i].uses!.recharge === 'long'" class="small" title="Given back on a short rest (Rage: 1)">short rest gives back <input type="number" min="0" class="effect-value" :value="list[i].uses!.shortBack ?? 0" @change="setUse(i, { shortBack: Number(val($event)) || undefined })" /></label>
            </template>
          </div>
          <details v-if="list[i].uses" class="steps-fold" :open="!!list[i].uses!.steps?.length">
            <summary class="small">{{ list[i].uses!.steps?.length ? 'Uses change by level' : 'Same uses at every level (change by level…)' }}</summary>
            <StepsInput numeric label="Uses" :model-value="list[i].uses!.steps" @update:model-value="v => setUse(i, { steps: v as [number, number][] | undefined })" />
          </details>
          <div class="trait-row">
            <label class="small" title="A value that grows with the level, shown with the feature (Rage Damage, Sneak Attack)">Scaling value
              <input class="steps-label" :value="list[i].scale?.label ?? ''" placeholder="e.g. Sneak Attack" @change="setScale(i, val($event), list[i].scale?.steps)" /></label>
          </div>
          <StepsInput v-if="list[i].scale" :label="list[i].scale!.label" placeholder="+2 or 1d6" :model-value="list[i].scale!.steps" @update:model-value="v => setScale(i, list[i].scale!.label, v as [number, string][] | undefined)" />
        </details>

        <!-- its spells -->
        <details class="trait-sec trait-fold" :open="castSet(list[i]).length > 0">
          <summary>Spellcasting<span v-if="castSet(list[i]).length" class="muted small">: {{ castSet(list[i]).join(', ') }}</span></summary>
          <div class="trait-row">
            <label class="small" title="The ability its spells (and its picked option's) are cast with, where a spell doesn't name one">Its spells are cast with
              <select :value="castMode(list[i])" @change="setCastMode(i, val($event))">
                <option value="">what each spell says</option><option value="pick">the player's pick</option><option value="same">the same as another {{ word }}</option>
              </select></label>
            <div v-if="castMode(list[i]) === 'pick'" class="seg wrap">
              <button v-for="ab in ABILITY_KEYS" :key="ab" type="button" :class="{ on: list[i].castWith?.among?.includes(ab) }" @click="toggleCast(i, ab)">{{ ABILITY_NAME[ab] }}</button>
            </div>
            <select v-else-if="castMode(list[i]) === 'same'" :value="list[i].castWith?.sameAs" aria-label="As which" @change="patch(i, { castWith: { sameAs: val($event) } })">
              <option v-for="o in list.filter(x => x.id !== list[i].id)" :key="o.id" :value="o.id">{{ o.name }}</option>
            </select>
          </div>
          <div v-if="forClass || list[i].spellLists?.length" class="trait-row">
            <span class="small" title="Its class can also take spells from these lists (Magical Secrets)">Also learns from these spell lists:</span>
            <div class="seg wrap">
              <button v-for="o in listOptions('class')" :key="o.id" type="button" :class="{ on: list[i].spellLists?.includes(o.id) }" @click="toggleList(i, o.id)">{{ o.label }}</button>
            </div>
          </div>
        </details>

        <div class="trait-row trait-actions">
          <button type="button" class="link-btn small" :disabled="!canMove(pos, -1)" @click="move(pos, -1)">↑ Up</button>
          <button type="button" class="link-btn small" :disabled="!canMove(pos, 1)" @click="move(pos, 1)">↓ Down</button>
          <button type="button" class="link-btn small danger" @click="remove(i)">Remove {{ word }}</button>
        </div>
      </details>
    </template>
    </template>
    <button v-if="entryType === 'feat' && !list.length && entryName" type="button" class="chip-btn primary" title="A feature named like the feat, coming with it: add its effects, choices and spells" @click="startFromCard">Start from the card</button>
    <button type="button" class="chip-btn" @click="add()">+ {{ word === 'feature' ? 'Feature' : 'Trait' }}</button>
  </div>
</template>
