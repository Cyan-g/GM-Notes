<script setup lang="ts">
// A class's starting equipment on its Edit page: the options (A, B…), each a list of the world's items and some coins.
// The SRD's kits name things by name: those the world has show as its items; the rest are marked "not in your world"
// with "+ Create" or a pick of another item (KitLines, the same list a background's equipment has).
import type { Equipment, EquipmentLine } from '../../model/types'
import { get } from '../../store'
import { itemNamed } from '../../lookup'
import KitLines from './KitLines.vue'
import MoneyInput from './MoneyInput.vue'

const props = defineProps<{ kits: Equipment[] }>()
const emit = defineEmits<{ change: [Equipment[]] }>()
/** A line's item: linked, or the world's item of its name. */
const itemOf = (l: EquipmentLine) => (l.item && get(l.item) ? l.item : l.name ? itemNamed(l.name)?.id : undefined)
/** Every line linked where the world has the item (names kept only for what it lacks). */
const resolved = (): Equipment[] => props.kits.map(k => ({ ...k, items: (k.items ?? []).map(l => { const id = itemOf(l); return id ? { item: id, ...(l.amount ? { amount: l.amount } : {}) } : { ...l } }) }))
function put(fn: (k: Equipment[]) => void) { const k = resolved(); fn(k); emit('change', k) }
const setItems = (o: number, l: EquipmentLine[]) => put(k => { k[o].items = l })
const setMoney = (o: number, v?: number | null) => put(k => { if (v) k[o].money = v; else delete k[o].money })
const addOption = () => put(k => { k.push({ items: [], money: 0 }) })
const removeOption = (o: number) => put(k => { k.splice(o, 1) })
const letter = (o: number) => String.fromCharCode(65 + o)
</script>

<template>
  <div class="class-kits">
    <div v-for="(k, o) in resolved()" :key="o" class="ck-option">
      <div class="ck-head"><b>{{ letter(o) }}</b>
        <span class="muted small">{{ k.items?.length ? `${k.items!.length} item${k.items!.length === 1 ? '' : 's'}` : 'coins only' }}</span>
        <button type="button" class="link-btn small" :title="`Remove option ${letter(o)}`" @click="removeOption(o)">×</button></div>
      <KitLines :lines="k.items ?? []" @change="l => setItems(o, l)" />
      <div class="ck-foot">
        <label class="small">and coins <MoneyInput :model-value="k.money" placeholder="0" @update:model-value="v => setMoney(o, v)" /></label>
      </div>
    </div>
    <button type="button" class="chip-btn" @click="addOption">＋ Option {{ letter(kits.length) }}</button>
  </div>
</template>
