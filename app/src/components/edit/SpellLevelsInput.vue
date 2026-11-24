<script setup lang="ts">
// A feature's spells as a table by level (Fiend Spells: Warlock 3 Burning Hands, Command…; 5 Fireball…): one row per
// level, its level editable (the row moves), its spells with a picker to add more, and a last row for a new level.
// How the whole list is gained (always prepared, on the spell list, in the spellbook…) and cast is set once above it;
// each spell's own settings (swappable, a different way) stay in the fold below it (TraitOptionFields).
import Dropdown from '../Dropdown.vue'
import { computed, ref } from 'vue'
import type { TraitSpell } from '../../model/types'
import { HOW_SPECIES } from '../../species'
import { ABILITY_NAME } from '../../model/dnd'
import { sharedOf, spellLevelOf, spellsByLevel } from '../../traitSpells'
import EntryPicker from './EntryPicker.vue'
import EntryLink from '../EntryLink.vue'
import { inputValue as val } from '../../dom'

const props = defineProps<{ traitLevel: number; levelWord: string }>()
const model = defineModel<TraitSpell[] | undefined>()
const spells = computed(() => model.value ?? [])
const rows = computed(() => spellsByLevel(spells.value, props.traitLevel))
const shared = (k: 'how' | 'ability') => sharedOf(spells.value, k)
const save = (l: TraitSpell[]) => { model.value = l.length ? l : undefined }
/** A spell at a level: no level stored when it comes with the feature. */
const at = (x: TraitSpell, level: number): TraitSpell => { const n = { ...x }; if (level > props.traitLevel) n.from = level; else delete n.from; return n }
const setAll = (p: Partial<TraitSpell>) => save(spells.value.map(x => { const n = { ...x, ...p }; if (!n.ability) delete n.ability; return n }))
const moveRow = (from: number, to: number) => save(spells.value.map(x => (spellLevelOf(x, props.traitLevel) === from ? at(x, Math.min(20, Math.max(1, to || 1))) : x)))
const removeAt = (i: number) => save(spells.value.filter((_, k) => k !== i))
/** How a new spell is gained: as the others are (always prepared while there are none, or they differ). */
const how = computed(() => (shared('how') === 'mixed' ? 'prepared' : (shared('how') as TraitSpell['how']) || 'prepared'))
function addAt(level: number, id: string) {
  const ab = shared('ability')
  save([...spells.value, at({ spell: id, how: how.value, ...(ab && ab !== 'mixed' ? { ability: ab as TraitSpell['ability'] } : {}) }, level)])
}
const newLevel = ref<number | null>(null)
/** The level a new row starts at: two after the last (a half caster's spell levels), until changed. */
const nextLevel = computed(() => newLevel.value ?? Math.min(20, (rows.value.at(-1)?.[0] ?? props.traitLevel - 2) + 2))
</script>

<template>
  <div class="spell-levels">
    <div v-if="spells.length" class="trait-row small">
      <span>Gained</span>
      <Dropdown :value="shared('how')" aria-label="How the spells are gained" @change="val($event) !== 'mixed' && setAll({ how: val($event) as TraitSpell['how'] })">
        <option v-if="shared('how') === 'mixed'" value="mixed">mixed (set per spell)</option>
        <option v-for="(label, id) in HOW_SPECIES" :key="id" :value="id">{{ label }}</option>
      </Dropdown>
      <Dropdown :value="shared('ability')" aria-label="Cast with" @change="val($event) !== 'mixed' && setAll({ ability: (val($event) || undefined) as TraitSpell['ability'] })">
        <option v-if="shared('ability') === 'mixed'" value="mixed">mixed abilities</option>
        <option value="">with the class's ability</option>
        <option v-for="(label, id) in ABILITY_NAME" :key="id" :value="id">with {{ label }}</option>
      </Dropdown>
    </div>
    <table class="spell-levels-table">
      <thead><tr><th>{{ levelWord }}</th><th>Spells</th></tr></thead>
      <tbody>
        <tr v-for="[level, list] in rows" :key="level">
          <td class="slt-lv"><input type="number" min="1" max="20" :value="level" :aria-label="`${levelWord} of these spells`" title="Change it to move the row" @change="moveRow(level, Number(val($event)))" /></td>
          <td class="slt-spells">
            <span v-for="{ x, i } in list" :key="i" class="chip"><EntryLink :id="x.spell" /><span v-if="x.how !== how || x.swap" class="muted small"> ({{ HOW_SPECIES[x.how] }}{{ x.swap ? ', swappable' : '' }})</span>
              <button type="button" class="link-btn" :title="`Remove ${x.spell}`" aria-label="Remove this spell" @click="removeAt(i)">×</button></span>
            <EntryPicker add :types="['spell']" :exclude="spells.map(x => x.spell)" placeholder="+ spell…" @pick="id => addAt(level, id)" />
          </td>
        </tr>
        <tr class="slt-new">
          <td class="slt-lv"><input type="number" min="1" max="20" :value="nextLevel" :aria-label="`${levelWord} of a new row`" @change="newLevel = Number(val($event)) || null" /></td>
          <td class="slt-spells"><EntryPicker add :types="['spell']" :exclude="spells.map(x => x.spell)" :placeholder="rows.length ? 'Spells at a new level…' : 'Add a spell…'" @pick="id => { addAt(nextLevel, id); newLevel = null }" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
