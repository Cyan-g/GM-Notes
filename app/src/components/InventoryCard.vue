<script setup lang="ts">
// A character's inventory: gear, the ingredient pouch (what the Workbench crafts with) and money.
// Items open in a pop-up; they can be dragged onto the Equipped card, and dropping one back here unequips it.
// `side`: the narrow version beside the sheet (player mode), with equip and attune left to the pop-up and dragging.
import { computed, ref } from 'vue'
import { optionLabel } from '../store'
import type { CharacterSheet, Entry } from '../model/types'
import { formatMoney, get, state } from '../store'
import { canAttune, canEquip, draggedLine, dragged, endDrag, startDrag } from '../sheet'
import { addToInventory, editSheet, sheetOrBlank } from '../sheetData'
import EntryPicker from './edit/EntryPicker.vue'
import { gearTotals, loadOf } from '../effects'
import { weightOf } from '../items'
import MoneyInput from './edit/MoneyInput.vue'
import ItemModal from './ItemModal.vue'
import GearToggles from './GearToggles.vue'

const props = defineProps<{ pc: Entry; side?: boolean }>()
const ro = computed(() => !!state.readOnly)
const s = computed<CharacterSheet>(() => sheetOrBlank(props.pc))
const edit = (fn: (s: CharacterSheet) => void) => editSheet(props.pc, fn)
const num = (ev: Event) => { const v = (ev.target as HTMLInputElement).value.trim(); return v === '' ? undefined : Number(v) }
const text = (ev: Event) => (ev.target as HTMLInputElement).value.trim() || undefined

const weight = computed(() => weightOf(s.value))
/** The Carrying capacity rule's view (rules.ts): carried against capacity, while the rule is on. */
const load = computed(() => loadOf(s.value, gearTotals(s.value)))
const round = (n: number) => Math.round(n * 10) / 10
const loadTip = computed(() => (load.value?.light != null ? `Encumbered over ${round(load.value.light)} lb, heavily over ${round(load.value.heavy!)} lb (Strength × 5 and × 10)` : 'Carrying capacity: Strength × 15 lb'))
const itemOf = (i: number) => get(s.value.inventory[i]?.item)
// Ingredients are the crafting pouch: listed apart, under the gear.
const lines = computed(() => s.value.inventory.map((l, i) => ({ l, i, e: get(l.item) })))
// What's equipped or attuned is on the Equipped card instead, so it's never listed twice.
const gear = computed(() => lines.value.filter(x => x.e?.fields.kind !== 'Ingredient' && !x.l.equipped && !x.l.attuned))
const pouch = computed(() => lines.value.filter(x => x.e?.fields.kind === 'Ingredient'))

const addItem = (id: string) => addToInventory(props.pc, id)
const addNamed = () => edit(x => { x.inventory.push({ name: 'New thing', qty: 1 }) })

// ---- the pop-up ----
const shown = ref<number | null>(null)
const shownLine = computed(() => (shown.value != null ? s.value.inventory[shown.value] : undefined))

// ---- dropping something from the Equipped card back here takes it off ----
const over = ref(false)
const droppable = computed(() => { const l = draggedLine(props.pc); return !!l && dragged.from !== 'inventory' })
function onDragOver(ev: DragEvent) { if (droppable.value) { ev.preventDefault(); over.value = true } }
function onDrop(ev: DragEvent) {
  over.value = false
  if (!droppable.value) return
  ev.preventDefault()
  const i = dragged.i, from = dragged.from
  edit(x => { if (from === 'attuned') x.inventory[i].attuned = undefined; else x.inventory[i].equipped = undefined })
  endDrag()
}
</script>

<template>
  <section class="cs-inventory card" :class="{ 'cs-inv-side': side, 'drop-over': over }"
           @dragover="onDragOver" @dragleave="over = false" @drop="onDrop">
    <component :is="'h3'">Inventory <span v-flash.neutral="weight" class="muted small" :title="load ? loadTip : undefined">{{ load ? `${round(load.carried)} / ${round(load.capacity)} lb` : weight ? `${round(weight)} lb, with what's equipped` : '' }}</span></component>
    <p v-if="load && load.state !== 'ok'" class="warn-note small">{{ load.state === 'over' ? `Over the carrying capacity (${round(load.capacity)} lb): the DM decides what that means.` : load.state === 'encumbered' ? `Encumbered (over ${round(load.light!)} lb): −10 ft speed.` : `Heavily encumbered (over ${round(load.heavy!)} lb): −20 ft speed, disadvantage on ability checks, attack rolls and STR, DEX and CON saves.` }}</p>
    <table class="cs-inv">
      <tr v-for="{ l, i, e } in gear" :key="i" :draggable="!ro && !!e"
          @dragstart="startDrag($event, pc, i, 'inventory')" @dragend="endDrag">
        <td class="cs-qty"><input v-flash="l.qty" type="number" min="0" :value="l.qty" :disabled="ro" @change="edit(x => x.inventory[i].qty = num($event) ?? 0)" /></td>
        <td class="cs-iname">
          <button v-if="e" class="link-btn cs-item" @click="shown = i">{{ e.name }}</button>
          <input v-else :value="l.name ?? ''" placeholder="Name" :disabled="ro" @change="edit(x => x.inventory[i].name = text($event))" />
          <span v-if="e?.fields.kind && !side" class="muted small cs-kind">{{ optionLabel('item.kind', e.fields.kind) }}</span>
        </td>
        <template v-if="!side">
          <td class="cs-toggles"><GearToggles :pc="pc" :i="i" /></td>
        </template>
        <td><button class="link-btn" title="Remove" :disabled="ro" @click="edit(x => x.inventory.splice(i, 1))">✕</button></td>
      </tr>
    </table>
    <p v-if="!gear.length && !pouch.length" class="muted small">Nothing carried yet: add items below. Weapons, armor and other gear go onto Equipped with their Equip and Attune buttons, or by dragging.</p>
    <template v-if="pouch.length">
      <h5 class="cs-sub">Ingredient pouch</h5>
      <table class="cs-inv">
        <tr v-for="{ l, i } in pouch" :key="i">
          <td class="cs-qty"><input v-flash="l.qty" type="number" min="0" :value="l.qty" :disabled="ro" @change="edit(x => x.inventory[i].qty = num($event) ?? 0)" /></td>
          <td class="cs-iname"><button class="link-btn cs-item" @click="shown = i">{{ itemOf(i)!.name }}</button></td>
          <td><button class="link-btn" title="Remove" :disabled="ro" @click="edit(x => x.inventory.splice(i, 1))">✕</button></td>
        </tr>
      </table>
    </template>
    <div v-if="!ro" class="cs-inv-add">
      <EntryPicker add :types="['item']" placeholder="Add an item…" @pick="addItem" />
      <button class="link-btn" @click="addNamed">＋ Other</button>
    </div>
    <label class="cs-money"><span>Money</span><MoneyInput :model-value="s.money" :disabled="ro" @update:model-value="v => edit(x => x.money = v)" /><span class="muted small">{{ formatMoney(s.money) }}</span></label>
    <p v-if="side && !ro" class="muted small">Drag an item onto Equipped to wear or attune it, and back here to take it off.</p>

    <ItemModal v-if="shownLine?.item" :id="shownLine.item" @close="shown = null">
      <template #actions>
        <span class="muted small">× {{ shownLine.qty }}</span>
        <GearToggles :pc="pc" :i="shown!" />
      </template>
    </ItemModal>
  </section>
</template>
