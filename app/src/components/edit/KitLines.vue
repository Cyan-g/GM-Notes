<script setup lang="ts">
// One starting-equipment list, the same for a class's options and a background: a row per thing with its amount.
// A row is the world's item (picked); a name the world has no item for (with "＋ Create" for a plain one, or a pick of
// another, or "link to …" when the world has one of that name); or, where `among` is on, "one of these items" the
// player picks in the creator (a gaming set of their choice).
import type { EquipmentLine } from '../../model/types'
import { MARTIAL_WEAPONS, SIMPLE_WEAPONS } from '../../model/schema'
import { createEntry, changed } from '../../edit'
import { get } from '../../store'
import { itemNamed } from '../../lookup'
import { UNCHOSEN } from '../../wizard'
import EntryPicker from './EntryPicker.vue'

const props = defineProps<{ lines: EquipmentLine[]; among?: boolean }>()
const emit = defineEmits<{ change: [EquipmentLine[]] }>()

function put(fn: (l: EquipmentLine[]) => void) {
  const next = props.lines.map(l => ({ ...l, ...(l.among ? { among: [...l.among] } : {}) }))
  fn(next)
  for (const l of next) if (!l.amount || l.amount <= 1) delete l.amount
  emit('change', next)
}
const setLine = (i: number, p: Partial<EquipmentLine>) => put(l => { l[i] = { ...l[i], ...p }; if (p.item) { delete l[i].name; delete l[i].among } })
const remove = (i: number) => put(l => { l.splice(i, 1) })
const addItem = (id: string) => put(l => { l.push({ item: id }) })
const addName = (name: string) => { if (name.trim()) put(l => { l.push({ name: name.trim() }) }) }
const addAmong = () => put(l => { l.push({ name: 'One of', among: [] }) })
const addToAmong = (i: number, id: string) => put(l => { l[i].among = [...new Set([...(l[i].among ?? []), id])] })
const dropFromAmong = (i: number, id: string) => put(l => { l[i].among = (l[i].among ?? []).filter(x => x !== id) })
/** The world's item a name stands for ("Arrows" → Arrow), if there is one. */
const match = (name?: string) => (name ? itemNamed(name) : undefined)
/** A line the creator fills from a pick the player made ("Gaming Set (the one chosen above)"): no item to link. */
const picked = (name?: string) => !!name && UNCHOSEN.test(name)
/** A plain item for a name the world lacks: a weapon or armor where the name says so, else adventuring gear (known to players). */
function create(i: number, name: string) {
  const base = name.replace(/\s*\(.*\)$/, '').trim()
  const weapon = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS].find(w => w.toLowerCase() === base.toLowerCase().replace(/s$/, ''))
  const fields: Record<string, unknown> = weapon
    ? { kind: 'Weapon', baseWeapon: weapon, weaponCategory: SIMPLE_WEAPONS.includes(weapon) ? 'Simple' : 'Martial' }
    : /\barmor\b|\bmail\b|\bshield\b/i.test(base) ? { kind: 'Armor', ...(/shield/i.test(base) ? { armorType: 'Shield' } : {}) } : { kind: 'Adventuring Gear' }
  const e = createEntry('item', base, fields)
  e.visibility = 'known'
  changed(e)
  setLine(i, { item: e.id })
}
</script>

<template>
  <div class="kit-lines">
    <div v-for="(l, i) in lines" :key="i" class="kl-line" :class="{ missing: !l.item && !l.among && !match(l.name) && !picked(l.name) }">
      <input type="number" min="1" class="cb-num" :value="l.amount ?? 1" aria-label="Amount" title="How many" @change="setLine(i, { amount: Number(($event.target as HTMLInputElement).value) || 1 })" />
      <!-- the world's item -->
      <EntryPicker v-if="l.item && get(l.item)" :model-value="l.item" :types="['item']" no-clear @update:model-value="v => v && setLine(i, { item: v })" />
      <!-- one of several, the player's pick -->
      <span v-else-if="l.among" class="kl-among">
        <input class="kl-name" :value="l.name ?? ''" placeholder="One of" aria-label="What it is" @change="setLine(i, { name: ($event.target as HTMLInputElement).value || undefined })" />
        <span v-for="id in l.among" :key="id" class="chip">{{ get(id)?.name ?? id }} <button type="button" class="link-btn" title="Not one of them" @click="dropFromAmong(i, id)">×</button></span>
        <EntryPicker add :types="['item']" :exclude="l.among" no-create placeholder="＋ add a choice…" @pick="id => addToAmong(i, id)" />
      </span>
      <!-- a name: the world's item of that name, or a new one, or another item -->
      <template v-else>
        <input class="kl-name" :value="l.name ?? ''" aria-label="Name" @change="setLine(i, { name: ($event.target as HTMLInputElement).value })" />
        <button v-if="match(l.name)" type="button" class="link-btn small" :title="`Use the world's ${match(l.name)!.name} item: a real item in the inventory`" @click="setLine(i, { item: match(l.name)!.id })">link to {{ match(l.name)!.name }}</button>
        <span v-else-if="picked(l.name)" class="muted small" title="The creator puts the player's pick here">the player's pick</span>
        <template v-else>
          <span class="warn-text small">not in your world</span>
          <button type="button" class="chip-btn small" :title="`Make a plain item called ${l.name}, known to players`" @click="create(i, l.name ?? 'Item')">＋ Create</button>
          <EntryPicker :model-value="null" :types="['item']" no-create placeholder="or pick one…" @update:model-value="v => v && setLine(i, { item: v })" />
        </template>
      </template>
      <button type="button" class="x" title="Remove" @click="remove(i)">×</button>
    </div>
    <div class="kl-add">
      <EntryPicker add :types="['item']" :exclude="lines.flatMap(l => l.item ? [l.item] : [])" free-text="as a name" placeholder="＋ Add an item…" @pick="addItem" @text="addName" />
      <button v-if="among" type="button" class="link-btn small" title="A line the player fills in the creator: one of the items you list" @click="addAmong">＋ one of several…</button>
    </div>
  </div>
</template>
