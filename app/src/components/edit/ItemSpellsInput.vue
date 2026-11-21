<script setup lang="ts">
// The spells an item lets its user cast (gear.ts), as a table: the spell, how it's cast, what it costs in charges
// and the level it's cast at (blank: its own).
import { computed } from 'vue'
import type { ItemSpell } from '../../model/types'
import { howCast } from '../../gear'
import EntryPicker from './EntryPicker.vue'

const model = defineModel<ItemSpell[] | undefined>()
const list = computed(() => model.value ?? [])
const HOW: { id: ItemSpell['how']; label: string }[] = [
  { id: 'charges', label: 'for charges' }, { id: 'short', label: '1/short rest' }, { id: 'long', label: '1/long rest' },
  { id: 'day', label: '1/day' }, { id: 'atWill', label: 'at will' }, { id: 'prepared', label: 'prepared (own slots)' },
]
function put(i: number, patch: Partial<ItemSpell>) {
  const l = list.value.map(x => ({ ...x }))
  l[i] = { ...l[i], ...patch }
  if (l[i].how !== 'charges') delete l[i].cost
  else if (!l[i].cost) l[i].cost = 1
  if (!l[i].level) delete l[i].level
  model.value = l
}
const add = (spell: string) => (model.value = [...list.value, { spell, how: 'long' }])
const remove = (i: number) => { const l = [...list.value]; l.splice(i, 1); model.value = l.length ? l : undefined }
const num = (ev: Event) => Number((ev.target as HTMLInputElement).value) || undefined
</script>

<template>
  <div class="item-spells">
    <table v-if="list.length" class="mini edit-table if-spells">
      <thead><tr><th>Spell</th><th>How</th><th class="num" title="Charges each casting costs">Cost</th><th class="num" title="Cast at this level (blank: its own level)">Level</th><th /></tr></thead>
      <tbody>
        <tr v-for="(x, i) in list" :key="i" :title="howCast(x)">
          <td><EntryPicker :model-value="x.spell" :types="['spell']" @update:model-value="v => v ? put(i, { spell: v }) : remove(i)" /></td>
          <td><select :value="x.how" aria-label="How it's cast" @change="put(i, { how: ($event.target as HTMLSelectElement).value as ItemSpell['how'] })">
            <option v-for="h in HOW" :key="h.id" :value="h.id">{{ h.label }}</option>
          </select></td>
          <td class="num"><input v-if="x.how === 'charges'" type="number" min="1" class="effect-value" :value="x.cost ?? 1" aria-label="Charges it costs" @change="put(i, { cost: num($event) ?? 1 })" /><span v-else class="muted">—</span></td>
          <td class="num"><input type="number" min="1" max="9" class="effect-value" :value="x.level ?? ''" placeholder="—" aria-label="Level it's cast at" @change="put(i, { level: num($event) })" /></td>
          <td><button type="button" class="x" title="Remove this spell" @click="remove(i)">×</button></td>
        </tr>
      </tbody>
    </table>
    <EntryPicker add :types="['spell']" :exclude="list.map(x => x.spell)" placeholder="＋ Add a spell…" @pick="add" />
  </div>
</template>
