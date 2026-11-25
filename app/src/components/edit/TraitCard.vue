<script setup lang="ts">
// One feature on its Edit page, opened (TraitsInput folds it): a header (the level it comes at, its name, moving,
// copying and removing it), its text and the parts every feature and option share (TraitOptionFields: effects,
// proficiencies, spells), then the parts only a feature has, each shown only when used — the player's choice
// (TraitChoiceSection), limited uses (TraitUsesSection), a scaling value, a switch, how it's listed on the sheet, its
// casting ability, extra spell lists — and an Add chip for each one it doesn't use.
import { computed, ref } from 'vue'
import Dropdown from '../Dropdown.vue'
import StepsInput from './StepsInput.vue'
import ProfChips from '../ProfChips.vue'
import TraitChoiceSection from './TraitChoiceSection.vue'
import TraitOptionFields from './TraitOptionFields.vue'
import TraitSection from './TraitSection.vue'
import TraitUsesSection from './TraitUsesSection.vue'
import type { Trait } from '../../model/types'
import { cleanTrait, hasSpells, newChoice, scaleSummary } from '../../traitEditing'
import { listOptions } from '../../store'
import { ABILITY_KEYS, ABILITY_NAME, ABILITY_UPPER } from '../../model/dnd'
import { inputValue as val } from '../../dom'

const props = defineProps<{
  trait: Trait
  /** "Warlock level" (a class's), else "Character level". */ levelWord: string
  /** "Warlock lv" in the header (a class's), else "Lv". */ shortLevelWord: string
  /** "feature" or "trait". */ word: string
  /** A class's or subclass's feature (extra spell lists, levels of its class). */ forClass: boolean
  /** Moving keeps it within its level (a class's). */ grouped: boolean
  canUp: boolean
  canDown: boolean
  /** A subrace's: its main races' traits, one of which this may replace. */ parentTraits?: { id: string; name: string }[]
  /** The entry's other features (casting "as another feature"). */ others: { id: string; name: string }[]
}>()
const emit = defineEmits<{ update: [Trait]; up: []; down: []; copy: []; remove: [] }>()
const t = computed(() => props.trait)
const lv = computed(() => t.value.level ?? 1)
const patch = (p: Partial<Trait>) => emit('update', cleanTrait({ ...t.value, ...p }))

// ---- a scaling value ----
const setScale = (label: string, steps: [number, string][] | undefined) =>
  patch({ scale: label.trim() ? { label: label.trim(), steps: steps ?? [[lv.value, '']] } : undefined })
function dropScale() { if (confirm(`Take the scaling value off “${t.value.name || 'this'}”?`)) patch({ scale: undefined }) }

// ---- the ability its spells are cast with ----
type Ab = typeof ABILITY_KEYS[number]
const castMode = computed(() => (t.value.castWith?.sameAs != null ? 'same' : t.value.castWith ? 'pick' : ''))
const setCastMode = (mode: string) => patch({ castWith: mode === 'pick' ? { among: ['int', 'wis', 'cha'] } : mode === 'same' ? { sameAs: props.others[0]?.id ?? '' } : undefined })
function toggleCast(ab: Ab) {
  const s = new Set(t.value.castWith?.among ?? [])
  if (s.has(ab)) s.delete(ab); else s.add(ab)
  patch({ castWith: { among: ABILITY_KEYS.filter(a => s.has(a)) } })
}
const castSummary = computed(() => (t.value.castWith?.sameAs != null ? `as ${props.others.find(x => x.id === t.value.castWith!.sameAs)?.name ?? 'another'}` : `the player picks: ${(t.value.castWith?.among ?? []).map(a => a.toUpperCase()).join(', ')}`))

// ---- more spell lists for its class (Magical Secrets) ----
const listsOpen = ref(false)
const showLists = computed(() => !!t.value.spellLists?.length || listsOpen.value)
function dropLists() { listsOpen.value = false; patch({ spellLists: undefined }) }
</script>

<template>
  <!-- header: the level it comes at, its name, and moving, copying and removing it -->
  <div class="fhead">
    <label class="fhead-lv" :title="forClass ? `A character gets it when their ${levelWord.toLowerCase()} reaches this` : `From this ${levelWord.toLowerCase()} on`">{{ shortLevelWord }} <input type="number" min="1" max="20" :value="lv" :aria-label="levelWord" @change="patch({ level: Number(val($event)) || 1 })" /></label>
    <input class="fhead-name" :value="t.name" :placeholder="`Name of the ${word}`" :aria-label="`Name of the ${word}`" @input="patch({ name: val($event) })" />
    <label v-if="parentTraits?.length" class="small" title="This trait takes the place of the main race's: characters of this subrace don't get that one">Replaces
      <Dropdown :value="t.replaces ?? ''" @change="patch({ replaces: val($event) || undefined })">
        <option value="">nothing (adds to them)</option>
        <option v-for="p in parentTraits" :key="p.id" :value="p.id">{{ p.name }}</option>
      </Dropdown></label>
    <span class="fhead-actions">
      <button type="button" class="link-btn" :disabled="!canUp" :title="`Move up${grouped ? ' (within its level)' : ''}`" aria-label="Move up" @click="emit('up')">↑</button>
      <button type="button" class="link-btn" :disabled="!canDown" :title="`Move down${grouped ? ' (within its level)' : ''}`" aria-label="Move down" @click="emit('down')">↓</button>
      <button type="button" class="link-btn" :title="`A copy of this ${word}, right after it`" :aria-label="`Copy this ${word}`" @click="emit('copy')">⧉</button>
      <button type="button" class="link-btn danger" :title="`Remove this ${word}`" :aria-label="`Remove this ${word}`" @click="emit('remove')">✕</button>
    </span>
  </div>

  <TraitOptionFields no-name :model-value="t" :trait-level="lv" :by-level="levelWord" @update:model-value="v => emit('update', v as Trait)">
    <template #sections>
      <TraitChoiceSection v-if="t.choice" :choice="t.choice" :trait-level="lv" :level-word="levelWord" :option-level-word="forClass ? levelWord : 'level'" :name="t.name" @update="c => patch({ choice: c })" />
      <TraitUsesSection v-if="t.uses" :uses="t.uses" :trait-level="lv" :level-label="forClass ? levelWord : 'character level'" @update="u => patch({ uses: u })" />

      <!-- a value that grows with the level -->
      <TraitSection v-if="t.scale" title="Scaling value" :summary="scaleSummary(t.scale)" @remove="dropScale">
        <div class="trait-row">
          <label class="small">Called <input class="steps-label" :value="t.scale.label" placeholder="e.g. Sneak Attack" @change="setScale(val($event) || t.scale!.label, t.scale!.steps)" /></label>
        </div>
        <StepsInput :label="t.scale.label" placeholder="+2 or 1d6" :model-value="t.scale.steps" @update:model-value="v => setScale(t.scale!.label, v as [number, string][] | undefined)" />
      </TraitSection>

      <!-- switched on and off in play -->
      <TraitSection v-if="t.toggle" title="On/off switch" summary="switched on and off in play; its effects count only while it’s on (Rage)" @remove="patch({ toggle: undefined })" />

      <!-- listed on the sheet -->
      <TraitSection v-if="t.onSheet" title="On the sheet" :summary="t.onSheet === 'show' ? 'always listed in play' : 'never listed in play'" @remove="patch({ onSheet: undefined })">
        <div class="trait-row">
          <Dropdown :value="t.onSheet" aria-label="Listed on the sheet" @change="patch({ onSheet: val($event) as Trait['onSheet'] })">
            <option value="show">always listed in play</option><option value="hide">never listed in play</option>
          </Dropdown>
          <span class="small muted">Without this, it's listed when there's something to use or read there.</span>
        </div>
      </TraitSection>

      <!-- the ability its spells are cast with -->
      <TraitSection v-if="t.castWith" title="Casting ability" :summary="castSummary" @remove="patch({ castWith: undefined })">
        <div class="trait-row">
          <Dropdown :value="castMode" aria-label="Its spells are cast with" title="The ability its spells (and its picked option's) are cast with, where a spell doesn't name one" @change="setCastMode(val($event))">
            <option value="pick">the player's pick</option><option value="same">the same as another {{ word }}</option>
          </Dropdown>
          <div v-if="castMode === 'pick'" class="chip-toggles">
            <button class="chip-toggle" v-for="ab in ABILITY_KEYS" :key="ab" type="button" :class="{ on: t.castWith?.among?.includes(ab) }" @click="toggleCast(ab)">{{ ABILITY_UPPER[ab] }}</button>
          </div>
          <Dropdown v-else-if="castMode === 'same'" :value="t.castWith?.sameAs" aria-label="As which" @change="patch({ castWith: { sameAs: val($event) } })">
            <option v-for="o in others" :key="o.id" :value="o.id">{{ o.name }}</option>
          </Dropdown>
        </div>
      </TraitSection>

      <!-- more spell lists for its class (Magical Secrets) -->
      <TraitSection v-if="showLists" title="Extra spell lists" :summary="(t.spellLists ?? []).join(', ') || 'none picked yet'" @remove="dropLists">
        <p class="small muted">Its class can also take spells from these lists (Magical Secrets).</p>
        <ProfChips :values="t.spellLists ?? []" :suggest="listOptions('class')" placeholder="Add a class's list…" @change="v => patch({ spellLists: v.length ? v : undefined })" />
      </TraitSection>
    </template>

    <template #add>
      <button v-if="!t.choice" type="button" class="chip-btn" title="The player picks skills, a language, feats, spells or one of several options" @click="patch({ choice: newChoice('skill') })">+ Player’s choice</button>
      <button v-if="!t.uses" type="button" class="chip-btn" title="Used a number of times, back on a rest" @click="patch({ uses: { count: 1, recharge: 'long' } })">+ Limited uses</button>
      <button v-if="!t.scale" type="button" class="chip-btn" title="A value that grows with the level (Rage Damage, Sneak Attack)" @click="setScale('Value', undefined)">+ Scaling value</button>
      <button v-if="!t.toggle" type="button" class="chip-btn" title="Switched on and off in play (Rage): its effects only count while it's on" @click="patch({ toggle: true })">+ On/off switch</button>
      <button v-if="!t.onSheet" type="button" class="chip-btn" title="Listed on the sheet always, or never (by default: when there's something to use or read there)" @click="patch({ onSheet: 'show' })">+ On the sheet</button>
      <button v-if="!t.castWith && hasSpells(t)" type="button" class="chip-btn" title="The ability its spells are cast with: the player's pick, or as another feature" @click="setCastMode('pick')">+ Casting ability</button>
      <button v-if="forClass && !showLists" type="button" class="chip-btn" title="Its class can also take spells from other lists (Magical Secrets)" @click="listsOpen = true">+ Extra spell lists</button>
    </template>
  </TraitOptionFields>
</template>
