<script setup lang="ts">
// "＋ Feat" on a character's Edit page: a feat taken outside a level-up (a boon, a DM's gift, a missing one). The same
// pick as the level-up dialog's (feats.ts): the feats by kind, each with what it still needs said beside it but never
// locked (the editor decides), its ability increases on a score table, and the same sheet line written.
import Dropdown from './Dropdown.vue'
import FeatScoreTable from './FeatScoreTable.vue'
import EntryLink from './EntryLink.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { get } from '../store'
import { totalLevel } from '../model/classes'
import { ABILITY_KEYS, profBonus } from '../model/dnd'
import { bonusApplied, type BonusChoice } from '../abilityBonus'
import { castingAbility, maxHpOf, spellStats } from '../sheet'
import { gearTotals, scoreWith } from '../effects'
import { featBonusFor } from '../species'
import { applyFeat, featGroups, featLacks } from '../feats'
import { featsAllowed } from '../rules'
import { editSheet } from '../sheetData'
import { renderInline } from '../markdown'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const emit = defineEmits<{ close: [] }>()
const level = computed(() => totalLevel(props.pc))
const scoreNow = (a: string) => scoreWith(props.s, a as (typeof ABILITY_KEYS)[number], gearTotals(props.s))
/** Every feat, Epic Boons too (a DM can give one at any level), by kind. */
const groups = computed(() => featGroups(true, true))
/** The Ruleset allows the Ability Score Improvement only: said, not enforced (the editor decides). */
const asiOnly = computed(() => !featsAllowed())
const lacks = (f: Entry) => featLacks(props.pc, props.s, f, level.value, a => scoreNow(a))
const note = (f: Entry) => (lacks(f) ? ` (${lacks(f)})` : '')
const feat = ref('')
const picked = computed(() => get(feat.value || undefined))
const choice = ref<BonusChoice>({ picks: [] })
const bonus = computed(() => featBonusFor(picked.value, props.s.saves))
const castNow = computed(() => castingAbility(props.pc, props.s))
const spellNow = computed(() => (castNow.value ? spellStats(props.pc, castNow.value) : undefined))
const baseScores = computed(() => Object.fromEntries(ABILITY_KEYS.map(a => [a, props.s.abilities[a] ?? 10])) as Record<(typeof ABILITY_KEYS)[number], number>)
function pick(id: string) { feat.value = id; choice.value = { picks: [] } }
function take() {
  const f = picked.value
  if (!f) return
  const add = bonusApplied(bonus.value, choice.value)
  editSheet(props.pc, s => applyFeat(s, f, add, f.fields.category === 'Epic Boon'))
  emit('close')
}
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); emit('close') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div class="modal-back" @mousedown.self="emit('close')">
      <div class="modal add-feat-modal" role="dialog" aria-label="Add a feat">
        <header class="modal-head">
          <h2>Add a feat</h2>
          <span class="spacer" />
          <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
        </header>
        <p v-if="asiOnly" class="small muted">This world's Ruleset allows the Ability Score Improvement only at level-up; here any feat can be added.</p>
        <Dropdown :value="feat" aria-label="Feat" @change="pick(($event.target as HTMLSelectElement).value)">
          <option value="">Pick one…</option>
          <optgroup v-for="g in groups" :key="g.kind" :label="g.label">
            <option v-for="f in g.list" :key="f.id" :value="f.id">{{ f.name }}{{ note(f) }}</option>
          </optgroup>
        </Dropdown>
        <template v-if="picked">
          <!-- what it still needs: said, not enforced -->
          <p v-if="lacks(picked)" class="small warn-text">Doesn't fit yet: {{ lacks(picked) }}. It can be added anyway.</p>
          <p class="small"><EntryLink :id="picked.id" /><template v-if="picked.fields.prerequisite"> · <i>{{ picked.fields.prerequisite }}</i></template>
            <span class="muted" v-html="' ' + renderInline(String(picked.fields.summary ?? '').replace(/\s*\*?Source:[^*]*\*?\s*$/, ''))" /></p>
          <FeatScoreTable v-if="bonus" :key="feat" v-model="choice" :bonus="bonus" :before="baseScores" :s="s" :prof="profBonus(level)" :level="level"
                          :hp="maxHpOf(s)" :casting="castNow" :spell="spellNow" />
          <p class="muted small">Choices the feat asks for are made in its line under Features &amp; traits.</p>
        </template>
        <footer class="lu-foot"><span class="spacer" /><button @click="emit('close')">Cancel</button><button class="primary" :disabled="!picked" @click="take">Add {{ picked?.name ?? 'feat' }}</button></footer>
      </div>
    </div>
  </Teleport>
</template>
