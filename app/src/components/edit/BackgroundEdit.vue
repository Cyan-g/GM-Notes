<script setup lang="ts">
// A background's Edit page, main column: its ability score increase (the 2024 pattern in one click: three abilities,
// +2/+1 or +1/+1/+1; anything else in the full editor) with a preview of the player's + buttons, its Origin feat with
// the version it takes (a dropdown when the feat has versions), its skills and tools (all of them, or one for the
// player to pick) and its starting equipment.
import Dropdown from '../Dropdown.vue'
import { computed, ref } from 'vue'
import type { AbilityBonus, Entry } from '../../model/types'
import { TYPES } from '../../model/schema'
import type { BonusChoice } from '../../abilityBonus'
import { ABILITY_KEYS, ABILITY_SHORT, type Ability } from '../../model/dnd'
import { get } from '../../store'
import { changed } from '../../edit'
import { traitsOf } from '../../model/traits'
import FieldInput from './FieldInput.vue'
import SpreadPicker from '../SpreadPicker.vue'
import FeatCard from '../FeatCard.vue'

const props = defineProps<{ e: Entry }>()
const def = (k: string) => TYPES.background.fields.find(f => f.key === k)!
const bonus = computed(() => props.e.fields.abilityIncrease)

// ---- ability scores: the 2024 pattern, or the full editor ----
/** The three abilities of a 2024-style increase (+2 to one and +1 to another, or +1 to all three), if it is one. */
const three = computed<Ability[] | undefined>(() => {
  const b = bonus.value
  if (!b || b.fixed && Object.values(b.fixed).some(Boolean)) return undefined
  const among = b.pick?.[0]?.among
  const same = (x?: string[]) => !!x && !!among && x.length === among.length && x.every(a => among.includes(a as Ability))
  const ok = among?.length === 3 && b.pick?.length === 2 && b.pick[0].amount === 2 && (b.pick[0].count ?? 1) === 1 && b.pick[1].amount === 1 && (b.pick[1].count ?? 1) === 1 && same(b.pick[1].among)
    && b.orPick?.length === 1 && b.orPick[0].amount === 1 && b.orPick[0].count === 3 && same(b.orPick[0].among)
  return ok ? (among as Ability[]) : undefined
})
const mode = ref<'three' | 'custom'>(three.value || !bonus.value ? 'three' : 'custom')
const picked = ref<Ability[]>(three.value ?? [])
const pattern = (among: Ability[]): AbilityBonus => ({ pick: [{ amount: 2, among }, { amount: 1, among }], orPick: [{ amount: 1, count: 3, among }], max: 20 })
function toggle(a: Ability) {
  const l = picked.value.includes(a) ? picked.value.filter(x => x !== a) : picked.value.length < 3 ? [...picked.value, a] : picked.value
  picked.value = ABILITY_KEYS.filter(x => l.includes(x))
  if (picked.value.length === 3) { props.e.fields.abilityIncrease = pattern(picked.value); changed(props.e) }
}
const TEN = Object.fromEntries(ABILITY_KEYS.map(a => [a, 10])) as Record<Ability, number>
const preview = ref<BonusChoice>({ picks: [] })

// ---- the Origin feat and its version ----
const feat = computed(() => get(props.e.fields.originFeat))
/** The versions the feat offers (Magic Initiate: Cleric, Druid, Wizard): its one-option choice. */
const versions = computed(() => traitsOf(feat.value).find(t => t.choice?.kind === 'option' && (t.choice.count ?? 1) === 1)?.choice?.options?.map(o => o.name) ?? [])
function setNote(v: string) { if (v.trim()) props.e.fields.originFeatNote = v.trim(); else delete props.e.fields.originFeatNote; changed(props.e) }

// ---- tools: all of them, or one to pick ----
const tools = computed(() => (props.e.fields.toolProfs ?? []).filter(Boolean))
function setAll(all: boolean) { if (all) props.e.fields.toolsAll = true; else delete props.e.fields.toolsAll; changed(props.e) }
</script>

<template>
  <div class="bg-edit">
    <section class="race-bonus">
      <h4>Ability scores</h4>
      <div class="seg">
        <button type="button" :class="{ on: mode === 'three' }" @click="mode = 'three'">Three abilities (2024)</button>
        <button type="button" :class="{ on: mode === 'custom' }" @click="mode = 'custom'">Custom</button>
      </div>
      <template v-if="mode === 'three'">
        <p class="muted small">Tick three abilities: the player puts +2 on one and +1 on another, or +1 on all three.</p>
        <div class="seg cb-toggles"><button v-for="a in ABILITY_KEYS" :key="a" type="button" :class="{ on: picked.includes(a) }" :disabled="!picked.includes(a) && picked.length >= 3" @click="toggle(a)">{{ ABILITY_SHORT[a] }}</button></div>
        <p v-if="picked.length < 3" class="small warn-text">{{ 3 - picked.length }} more to tick.</p>
        <p v-else-if="bonus && !three" class="small muted">Ticking three replaces the custom increase it has.</p>
      </template>
      <FieldInput v-else :def="def('abilityIncrease')" :entry="e" />
      <div v-if="bonus?.pick?.length || bonus?.orPick?.length" class="rb-preview">
        <span class="muted small">What the player sees (on scores of 10):</span>
        <SpreadPicker :key="JSON.stringify(bonus)" v-model="preview" :bonus="bonus!" :scores="TEN" />
      </div>
    </section>

    <section class="race-bonus">
      <h4>Origin feat</h4>
      <div class="cb-line"><FieldInput :def="def('originFeat')" :entry="e" /></div>
      <label v-if="versions.length" class="cb-line small">Which version
        <Dropdown :value="String(e.fields.originFeatNote ?? '')" @change="setNote(($event.target as HTMLSelectElement).value)">
          <option value="">the player picks</option>
          <option v-for="v in versions" :key="v" :value="v">{{ v }}</option>
        </Dropdown></label>
      <label v-else-if="feat" class="cb-line small" title="Shown after the feat's name on the sheet">Note on the feat <input :value="String(e.fields.originFeatNote ?? '')" placeholder="optional" @change="setNote(($event.target as HTMLInputElement).value)" /></label>
      <FeatCard v-if="feat" :e="feat" title class="bg-feat" />
    </section>

    <section class="race-bonus">
      <h4>Proficiencies</h4>
      <span class="muted small">Skills</span>
      <FieldInput :def="def('skillProfs')" :entry="e" />
      <span class="muted small">Tools</span>
      <FieldInput :def="def('toolProfs')" :entry="e" />
      <div v-if="tools.length > 1" class="seg bg-tools">
        <button type="button" :class="{ on: !e.fields.toolsAll }" @click="setAll(false)">The player picks one</button>
        <button type="button" :class="{ on: !!e.fields.toolsAll }" @click="setAll(true)">Gives all of them</button>
      </div>
    </section>

    <section class="race-bonus">
      <h4>Starting equipment</h4>
      <FieldInput :def="def('equipment')" :entry="e" />
    </section>
  </div>
</template>
