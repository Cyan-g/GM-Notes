<script setup lang="ts">
// Encounter lines: how many of which creature. A creature can be an entry or just a name.
import { computed } from 'vue'
import type { EncounterLine } from '../../model/types'
import { creatureByName, lineInfo } from '../../encounter'
import EntryPicker from './EntryPicker.vue'

const props = defineProps<{ modelValue?: EncounterLine[] }>()
const emit = defineEmits<{ 'update:modelValue': [EncounterLine[]] }>()
const lines = computed(() => props.modelValue ?? [])

function update(i: number, patch: Partial<EncounterLine>) {
  emit('update:modelValue', lines.value.map((l, j) => {
    if (j !== i) return l
    const n = { ...l, ...patch }
    for (const k of ['hp', 'ac', 'init', 'creature', 'name'] as const) if (n[k] === undefined || n[k] === null || (n[k] as unknown) === '') delete n[k]
    return n
  }))
}
const remove = (i: number) => emit('update:modelValue', lines.value.filter((_, j) => j !== i))
const addEntry = (id: string) => emit('update:modelValue', [...lines.value, { creature: id, count: 1 }])
const addName = (n: string) => n && emit('update:modelValue', [...lines.value, { name: n, count: 1 }])
const num = (v: string) => (v.trim() === '' ? undefined : Number(v))
/** Lines typed by name that match a creature of the world exactly: linked one by one, or all at once. */
const matching = computed(() => lines.value.map((l, i) => ({ i, e: creatureByName(l) })).filter(x => x.e))
const linkAll = () => emit('update:modelValue', lines.value.map(l => { const e = creatureByName(l); return e ? { ...l, creature: e.id, name: undefined } : l }).map(l => { const n = { ...l }; if (n.name === undefined) delete n.name; return n }))
/** A typed HP or AC: it replaces the statblock's (marked, so it isn't mistaken for the statblock's own). */
const statOf = (l: EncounterLine, k: 'hp' | 'ac') => lineInfo({ ...l, [k]: undefined })[k]
</script>

<template>
  <p v-if="matching.length" class="small enc-match">{{ matching.length }} line{{ matching.length === 1 ? '' : 's' }} typed by name match{{ matching.length === 1 ? 'es' : '' }} a creature of the world exactly (Run uses it already).
    <button type="button" class="chip-btn" @click="linkAll">Link {{ matching.length === 1 ? 'it' : `all ${matching.length}` }}</button></p>
  <table class="mini edit-table">
    <thead><tr><th class="num" style="width: 6em">#</th><th>Creature</th><th class="num" title="Leave empty to use the statblock">HP</th><th class="num">AC</th><th /></tr></thead>
    <tbody>
      <tr v-for="(l, i) in lines" :key="i">
        <td class="num"><input type="number" min="1" class="short" :value="l.count" @change="update(i, { count: Math.max(1, Number(($event.target as HTMLInputElement).value) || 1) })" /></td>
        <td>
          <EntryPicker v-if="l.creature" :model-value="l.creature" :types="['creature', 'npc']" no-clear @update:model-value="v => update(i, { creature: v ?? undefined, name: v ? undefined : lineInfo(l).name })" />
          <div v-else class="free-name">
            <input :value="l.name" @change="update(i, { name: ($event.target as HTMLInputElement).value })" />
            <button v-if="creatureByName(l)" type="button" class="chip-btn" :title="`Link this line to the creature ${creatureByName(l)!.name}`" @click="update(i, { creature: creatureByName(l)!.id, name: undefined })">Link to {{ creatureByName(l)!.name }}</button>
            <EntryPicker v-else add :types="['creature', 'npc']" placeholder="Link to entry…" @pick="id => update(i, { creature: id, name: undefined })" />
          </div>
        </td>
        <td class="num"><input type="number" class="short" :class="{ overridden: l.hp != null }" :value="l.hp ?? ''" :placeholder="String(statOf(l, 'hp') ?? '')" :title="l.hp != null ? `Typed; the statblock says ${statOf(l, 'hp') ?? 'nothing'}` : 'From the statblock: type to change it'" @change="update(i, { hp: num(($event.target as HTMLInputElement).value) })" /></td>
        <td class="num"><input type="number" class="short" :class="{ overridden: l.ac != null }" :value="l.ac ?? ''" :placeholder="String(statOf(l, 'ac') ?? '')" :title="l.ac != null ? `Typed; the statblock says ${statOf(l, 'ac') ?? 'nothing'}` : 'From the statblock: type to change it'" @change="update(i, { ac: num(($event.target as HTMLInputElement).value) })" /></td>
        <td><button type="button" class="x" title="Remove" @click="remove(i)">×</button></td>
      </tr>
      <tr>
        <td colspan="5"><div class="add-row">
          <EntryPicker add :types="['creature', 'npc']" placeholder="Add a creature or NPC, or type any name…" free-text="by name only" @pick="addEntry" @text="addName" />
        </div></td>
      </tr>
    </tbody>
  </table>
</template>
