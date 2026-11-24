<script setup lang="ts">
// The choice a feature asks of the player, on its Edit page: what's picked (skills, a language, feats, spells, one of
// several options) and how many (ChoiceFields). Options (invocations, maneuvers) fold to one row each, filterable when
// there are many; each is edited like a feature (TraitOptionFields), with what it needs first and choices of its own.
import { computed, ref } from 'vue'
import Dropdown from '../Dropdown.vue'
import ChoiceFields from './ChoiceFields.vue'
import TraitChips from '../TraitChips.vue'
import TraitOptionFields from './TraitOptionFields.vue'
import TraitSection from './TraitSection.vue'
import type { TraitChoice, TraitOption } from '../../model/types'
import { CHOICE_KINDS, choiceSummary, newChoice } from '../../traitEditing'
import { newTraitId } from '../../species'
import { inputValue as val } from '../../dom'

const props = defineProps<{ choice: TraitChoice; traitLevel: number; /** "Warlock level" for a class's options. */ levelWord: string; /** For an option's own level prerequisite. */ optionLevelWord: string; /** What it's on, for the questions asked ("Eldritch Invocations"). */ name: string }>()
const emit = defineEmits<{ update: [TraitChoice | undefined] }>()
const set = (p: Partial<TraitChoice>) => emit('update', { ...props.choice, ...p })
function remove() { if (confirm(`Take the player’s choice off “${props.name || 'this'}”?`)) emit('update', undefined) }

// ---- options ----
const options = computed(() => props.choice.options ?? [])
const setOption = (k: number, o: TraitOption) => { const l = [...options.value]; l[k] = o; set({ options: l }) }
const openOption = ref<string | null>(null)
function addOption() {
  const id = newTraitId()
  set({ options: [...options.value, { id, name: `Option ${options.value.length + 1}` }] })
  openOption.value = id
}
function removeOption(k: number) { if (confirm(`Remove the option “${options.value[k].name}”?`)) set({ options: options.value.filter((_, n) => n !== k) }) }
/** A choice that comes with an option (Pact of the Tome: cantrips): set, added or (undefined) removed. */
function setSubChoice(k: number, n: number, c: TraitChoice | undefined) {
  const o = options.value[k], l = [...(o.choices ?? [])]
  if (c) l[n] = c; else l.splice(n, 1)
  const next: TraitOption = { ...o, choices: l }
  if (!l.length) delete next.choices
  setOption(k, next)
}
const filter = ref('')
const shown = computed(() => {
  const q = filter.value.trim().toLowerCase(), all = options.value.map((o, k) => ({ o, k }))
  return q ? all.filter(({ o }) => o.name.toLowerCase().includes(q) || (o.text ?? '').toLowerCase().includes(q)) : all
})
/** What an option needs first, in a few words: "Lv 5+, Pact of the Blade". */
const needsText = (o: TraitOption) => [o.needs?.level && `Lv ${o.needs.level}+`, o.needs?.option && options.value.find(x => x.id === o.needs!.option)?.name].filter(Boolean).join(', ')
const siblings = computed(() => options.value.map(x => ({ id: x.id, name: x.name })))
</script>

<template>
  <TraitSection title="Player’s choice" :summary="choiceSummary(choice)" @remove="remove">
    <div class="trait-row">
      <Dropdown :value="choice.kind" aria-label="What the player picks" @change="emit('update', newChoice(val($event) as TraitChoice['kind']))">
        <option v-for="c in CHOICE_KINDS" :key="c.id" :value="c.id">{{ c.label }}</option>
      </Dropdown>
      <ChoiceFields :model-value="choice" @update:model-value="v => emit('update', v)" />
    </div>
    <div v-if="choice.kind === 'option'" class="trait-options-edit">
      <div class="trait-row">
        <b class="small">{{ options.length }} options</b>
        <input v-if="options.length > 6" v-model="filter" type="search" class="sp-filter" placeholder="Filter options…" aria-label="Filter the options" />
      </div>
      <details v-for="{ o, k } in shown" :key="o.id" class="trait-option-card" :open="openOption === o.id">
        <summary><b>{{ o.name }}</b> <span v-if="needsText(o)" class="sp-prereq">{{ needsText(o) }}</span> <TraitChips :t="o" />
          <span v-if="o.choices?.length" class="chip">+ {{ o.choices.length }} choice{{ o.choices.length > 1 ? 's' : '' }}</span></summary>
        <TraitOptionFields :model-value="o" :trait-level="traitLevel" :siblings="siblings" :level-word="optionLevelWord" :by-level="levelWord" @update:model-value="v => setOption(k, v)">
          <template #add>
            <button type="button" class="chip-btn" title="A choice the player makes once this option is picked (Pact of the Tome: cantrips)" @click="setSubChoice(k, (o.choices ?? []).length, newChoice('spell'))">+ Choice with this option</button>
          </template>
        </TraitOptionFields>
        <div v-for="(c, n) in o.choices ?? []" :key="n" class="trait-row">
          <span class="small muted">Comes with a choice:</span>
          <Dropdown :value="c.kind" aria-label="What's picked" @change="setSubChoice(k, n, newChoice(val($event) as TraitChoice['kind']))">
            <option v-for="ck in CHOICE_KINDS.filter(x => x.id !== 'option')" :key="ck.id" :value="ck.id">{{ ck.label }}</option>
          </Dropdown>
          <ChoiceFields with-label :model-value="c" @update:model-value="v => setSubChoice(k, n, v)" />
          <button type="button" class="link-btn" title="Remove this choice" @click="setSubChoice(k, n, undefined)">×</button>
        </div>
        <div class="trait-row"><span class="spacer" /><button type="button" class="link-btn small danger" @click="removeOption(k)">Remove this option</button></div>
      </details>
      <p v-if="!shown.length" class="muted small">No option matches.</p>
      <button type="button" class="chip-btn" @click="addOption">+ Option</button>
    </div>
  </TraitSection>
</template>
