<script setup lang="ts">
// A race's species traits (species.ts), on its Edit page: one card each with what it is and does, from which level,
// uses per rest, and a choice for the player (pick skills, languages or tools, or one of several options).
import { computed } from 'vue'
import type { Trait, TraitChoice, TraitOption } from '../../model/types'
import { GRANT_KINDS, grantOptions, newTraitId } from '../../species'
import TraitOptionFields from './TraitOptionFields.vue'
import TraitChips from '../TraitChips.vue'

const model = defineModel<Trait[] | undefined>()
const list = computed(() => model.value ?? [])
const save = (l: Trait[]) => { model.value = l.length ? l : undefined }
function put(i: number, t: Trait) { const l = [...list.value]; l[i] = t; save(l) }
const patch = (i: number, p: Partial<Trait>) => {
  const t: Trait = { ...list.value[i], ...p }
  if (!t.level || t.level <= 1) delete t.level
  for (const k of ['uses', 'choice'] as const) if (t[k] == null) delete t[k]
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

// ---- the choice ----
const CHOICE_KINDS: { id: TraitChoice['kind'] | ''; label: string }[] = [
  { id: '', label: 'No choice' }, { id: 'skill', label: 'Pick skills' }, { id: 'language', label: 'Pick languages' },
  { id: 'tool', label: 'Pick tools' }, { id: 'option', label: 'Pick one option' },
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
const kindLabel = (k: string, n = 2) => { const g = GRANT_KINDS.find(x => x.id === k); return (n === 1 ? g?.label.toLowerCase() : g?.plural) ?? k }
</script>

<template>
  <div class="traits-input">
    <details v-for="(t, i) in list" :key="t.id" class="trait-card">
      <summary><b>{{ t.name || 'Unnamed trait' }}</b> <span v-if="(t.level ?? 1) > 1" class="muted small">level {{ t.level }}</span> <TraitChips :t="t" />
        <span v-if="t.choice" class="chip">choice: {{ t.choice.kind === 'option' ? `${t.choice.options?.length ?? 0} options` : `${t.choice.count ?? 1} ${kindLabel(t.choice.kind, t.choice.count ?? 1)}` }}</span>
      </summary>
      <TraitOptionFields :model-value="t" @update:model-value="v => put(i, v as Trait)" />
      <div class="trait-row">
        <label class="small">From level <input type="number" min="1" max="20" class="effect-value" :value="t.level ?? 1" @change="patch(i, { level: Number(val($event)) || 1 })" /></label>
        <label class="small"><input type="checkbox" :checked="!!t.uses" @change="setUses(i, ($event.target as HTMLInputElement).checked)" /> Limited uses</label>
        <template v-if="t.uses">
          <label class="small"><input type="checkbox" :checked="t.uses.count === 'pb'" @change="patch(i, { uses: { ...t.uses, count: ($event.target as HTMLInputElement).checked ? 'pb' : 1 } })" /> proficiency bonus</label>
          <input v-if="t.uses.count !== 'pb'" type="number" min="1" class="effect-value" :value="t.uses.count" aria-label="Uses" @change="patch(i, { uses: { ...t.uses, count: Number(val($event)) || 1 } })" />
          <select :value="t.uses.recharge" aria-label="Back on" @change="patch(i, { uses: { ...t.uses, recharge: val($event) as 'short' | 'long' } })">
            <option value="short">per short rest</option>
            <option value="long">per long rest</option>
          </select>
        </template>
      </div>
      <div class="trait-row">
        <select :value="t.choice?.kind ?? ''" aria-label="Choice for the player" @change="setChoiceKind(i, val($event))">
          <option v-for="c in CHOICE_KINDS" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
        <template v-if="t.choice && t.choice.kind !== 'option'">
          <label class="small">how many <input type="number" min="1" max="6" class="effect-value" :value="t.choice.count ?? 1" @change="setChoice(i, { count: Number(val($event)) || 1 })" /></label>
          <details class="trait-among">
            <summary class="small">{{ t.choice.among?.length ? `only from ${t.choice.among.length}` : 'from any' }}</summary>
            <div class="seg wrap">
              <button v-for="o in grantOptions(t.choice.kind)" :key="o.id" type="button" :class="{ on: t.choice.among?.includes(o.id) }" @click="toggleAmong(i, o.id)">{{ o.label }}</button>
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
