<script setup lang="ts">
// A class's starting equipment on its Edit page: the options (A, B…), each a list of the world's items and some coins.
// The SRD's kits name things by name: those the world has show as its items; the rest are marked "not in your world"
// with "+ Create" (a plain item of that name, known to players) or a pick of another item. The wizard gives only items.
import { computed } from 'vue'
import type { Equipment, EquipmentLine } from '../../model/types'
import { MARTIAL_WEAPONS, SIMPLE_WEAPONS } from '../../model/schema'
import { createEntry, changed } from '../../edit'
import { get } from '../../store'
import { itemNamed } from '../../lookup'
import EntryPicker from './EntryPicker.vue'
import MoneyInput from './MoneyInput.vue'

const props = defineProps<{ kits: Equipment[] }>()
const emit = defineEmits<{ change: [Equipment[]] }>()
/** A line's item: linked, or the world's item of its name. */
const itemOf = (l: EquipmentLine) => (l.item && get(l.item) ? l.item : l.name ? itemNamed(l.name)?.id : undefined)
const rows = computed(() => props.kits.map(k => ({ ...k, items: (k.items ?? []).map(l => ({ ...l, id: itemOf(l) })) })))
/** Every line linked where the world has the item (names kept only for what it lacks). */
const resolved = (): Equipment[] => props.kits.map(k => ({ ...k, items: (k.items ?? []).map(l => { const id = itemOf(l); return id ? { item: id, ...(l.amount ? { amount: l.amount } : {}) } : { ...l } }) }))
function put(fn: (k: Equipment[]) => void) { const k = resolved(); fn(k); emit('change', k) }
const setLine = (o: number, i: number, p: Partial<EquipmentLine>) => put(k => { k[o].items![i] = { ...k[o].items![i], ...p }; if (p.item) delete k[o].items![i].name })
const removeLine = (o: number, i: number) => put(k => { k[o].items!.splice(i, 1) })
const addLine = (o: number, id: string) => put(k => { (k[o].items ??= []).push({ item: id }) })
const setMoney = (o: number, v?: number | null) => put(k => { if (v) k[o].money = v; else delete k[o].money })
const addOption = () => put(k => { k.push({ items: [], money: 0 }) })
const removeOption = (o: number) => put(k => { k.splice(o, 1) })
/** A plain item for a name the world lacks: a weapon or armor where the name says so, else adventuring gear. */
function create(o: number, i: number, name: string) {
  const base = name.replace(/\s*\(.*\)$/, '').trim()
  const weapon = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS].find(w => w.toLowerCase() === base.toLowerCase().replace(/s$/, ''))
  const fields: Record<string, unknown> = weapon
    ? { kind: 'Weapon', baseWeapon: weapon, weaponCategory: SIMPLE_WEAPONS.includes(weapon) ? 'Simple' : 'Martial' }
    : /\barmor\b|\bmail\b|\bshield\b/i.test(base) ? { kind: 'Armor', armorType: /shield/i.test(base) ? 'Shield' : undefined } : { kind: 'Adventuring Gear' }
  for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k]
  const e = createEntry('item', name, fields)
  // a class's starting gear is something players know of
  e.visibility = 'known'
  changed(e)
  setLine(o, i, { item: e.id })
}
const letter = (o: number) => String.fromCharCode(65 + o)
</script>

<template>
  <div class="class-kits">
    <div v-for="(k, o) in rows" :key="o" class="ck-option">
      <div class="ck-head"><b>{{ letter(o) }}</b>
        <span class="muted small">{{ k.items.length ? `${k.items.length} item${k.items.length === 1 ? '' : 's'}` : 'coins only' }}</span>
        <button type="button" class="link-btn small" :title="`Remove option ${letter(o)}`" @click="removeOption(o)">×</button></div>
      <div v-for="(l, i) in k.items" :key="i" class="ck-line" :class="{ missing: !l.id }">
        <template v-if="l.id">
          <EntryPicker :model-value="l.id" :types="['item']" @update:model-value="v => v ? setLine(o, i, { item: v }) : removeLine(o, i)" />
        </template>
        <template v-else>
          <span class="ck-name">“{{ l.name }}” <span class="warn-text small">not in your world</span></span>
          <button type="button" class="chip-btn small" :title="`Make a plain item called ${l.name}, known to players`" @click="create(o, i, l.name ?? 'Item')">＋ Create</button>
          <EntryPicker :model-value="null" :types="['item']" placeholder="or pick one…" @update:model-value="v => v && setLine(o, i, { item: v })" />
        </template>
        <label class="small">× <input type="number" min="1" class="cb-num" :value="l.amount ?? 1" @change="setLine(o, i, { amount: Number(($event.target as HTMLInputElement).value) > 1 ? Number(($event.target as HTMLInputElement).value) : undefined })" /></label>
        <button type="button" class="x" title="Remove" @click="removeLine(o, i)">×</button>
      </div>
      <div class="ck-foot">
        <EntryPicker add :types="['item']" placeholder="＋ Add an item…" @pick="id => addLine(o, id)" />
        <label class="small">and coins <MoneyInput :model-value="k.money" placeholder="0" @update:model-value="v => setMoney(o, v)" /></label>
      </div>
    </div>
    <button type="button" class="chip-btn" @click="addOption">＋ Option {{ letter(rows.length) }}</button>
  </div>
</template>
