<script setup lang="ts">
// A race's species traits (species.ts), on its Edit page: one card each with what it is and does, from which level,
// uses per rest, and a choice for the player (pick skills, languages or tools, or one of several options).
import { computed } from 'vue'
import type { Trait, TraitChoice, TraitOption } from '../../model/types'
import { CHOICE_WORDS, choiceCandidates, newTraitId } from '../../species'
import TraitOptionFields from './TraitOptionFields.vue'
import TraitChips from '../TraitChips.vue'

const model = defineModel<Trait[] | undefined>()
const list = computed(() => model.value ?? [])
const save = (l: Trait[]) => { model.value = l.length ? l : undefined }
function put(i: number, t: Trait) { const l = [...list.value]; l[i] = t; save(l) }
const patch = (i: number, p: Partial<Trait>) => {
  const t: Trait = { ...list.value[i], ...p }
  if (!t.level || t.level <= 1) delete t.level
  for (const k of ['uses', 'choice', 'scale'] as const) if (t[k] == null) delete t[k]
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
  { id: 'tool', label: 'Pick tools' }, { id: 'expertise', label: 'Pick skills for Expertise' }, { id: 'feat', label: 'Pick feats' },
  { id: 'mastery', label: 'Pick weapons to master' }, { id: 'option', label: 'Pick options' },
]
function setChoiceKind(i: number, kind: string) {
  if (!kind) return patch(i, { choice: undefined })
  const k = kind as TraitChoice['kind']
  patch(i, { choice: k === 'option' ? { kind: k, options: [{ id: newTraitId(), name: 'Option 1' }, { id: newTraitId(), name: 'Option 2' }] } : { kind: k, count: 1 } })
}
const setChoice = (i: number, p: Partial<TraitChoice>) => patch(i, { choice: { ...list.value[i].choice!, ...p } })
function toggleAmong(i: number, id: string) {
  const c = list.value[i].choice!, among = new Set(c.among ?? [])
  if (among.has(id)) among.delete(id); else among.add(id)
  setChoice(i, { among: among.size ? [...among] : undefined })
}
const setOption = (i: number, k: number, o: TraitOption) => { const opts = [...(list.value[i].choice?.options ?? [])]; opts[k] = o; setChoice(i, { options: opts }) }
const addOption = (i: number) => setChoice(i, { options: [...(list.value[i].choice?.options ?? []), { id: newTraitId(), name: `Option ${(list.value[i].choice?.options?.length ?? 0) + 1}` }] })
const removeOption = (i: number, k: number) => setChoice(i, { options: (list.value[i].choice?.options ?? []).filter((_, n) => n !== k) })
const val = (ev: Event) => (ev.target as HTMLInputElement | HTMLSelectElement).value
const kindLabel = (k: TraitChoice['kind'], n = 2) => CHOICE_WORDS[k][n === 1 ? 0 : 1]
</script>

<template>
  <div class="traits-input">
    <details v-for="(t, i) in list" :key="t.id" class="trait-card">
      <summary><b>{{ t.name || 'Unnamed trait' }}</b> <span v-if="(t.level ?? 1) > 1" class="muted small">level {{ t.level }}</span> <TraitChips :t="t" />
        <span v-if="t.choice" class="chip">choice: {{ t.choice.kind === 'option' ? `${t.choice.count ?? 1} of ${t.choice.options?.length ?? 0} options` : `${t.choice.count ?? 1} ${kindLabel(t.choice.kind, t.choice.count ?? 1)}` }}</span>
      </summary>
      <TraitOptionFields :model-value="t" @update:model-value="v => put(i, v as Trait)" />
      <div class="trait-row">
        <label class="small">From level <input type="number" min="1" max="20" class="effect-value" :value="t.level ?? 1" @change="patch(i, { level: Number(val($event)) || 1 })" /></label>
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
        <select :value="t.choice?.kind ?? ''" aria-label="Choice for the player" @change="setChoiceKind(i, val($event))">
          <option v-for="c in CHOICE_KINDS" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
        <template v-if="t.choice">
          <label class="small">how many <input type="number" min="1" max="30" class="effect-value" :value="t.choice.count ?? 1" @change="setChoice(i, { count: Number(val($event)) || 1 })" /></label>
          <label class="small" title="The count from a level on, e.g. 2:2, 9:4">by level <input class="steps-input" :value="stepsText(t.choice.steps)" placeholder="2:2, 9:4" @change="setChoice(i, { steps: parseSteps<number>(val($event), true) })" /></label>
          <label v-if="t.choice.kind === 'feat'" class="small">kind <input class="steps-label" :value="t.choice.category ?? ''" placeholder="e.g. Fighting Style" @change="setChoice(i, { category: val($event).trim() || undefined })" /></label>
          <details v-if="t.choice.kind !== 'option'" class="trait-among">
            <summary class="small">{{ t.choice.among?.length ? `only from ${t.choice.among.length}` : 'from any' }}</summary>
            <div class="seg wrap">
              <button v-for="o in choiceCandidates({ ...t.choice, among: undefined })" :key="o.id" type="button" :class="{ on: t.choice.among?.includes(o.id) }" @click="toggleAmong(i, o.id)">{{ o.label }}</button>
            </div>
          </details>
        </template>
      </div>
      <div v-if="t.choice?.kind === 'option'" class="trait-options-edit">
        <div v-for="(o, k) in t.choice.options ?? []" :key="o.id" class="trait-option-card">
          <TraitOptionFields :model-value="o" @update:model-value="v => setOption(i, k, v)" />
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
