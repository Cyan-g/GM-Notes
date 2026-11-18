<script setup lang="ts">
// A character's inventory: gear, the ingredient pouch (what the Workbench crafts with) and money.
// Items open in a pop-up; they can be dragged onto the Equipped card, and dropping one back here unequips it.
// `side`: the narrow version beside the sheet (player mode), with equip and attune left to the pop-up and dragging.
import { computed, ref } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { formatMoney, get, state } from '../store'
import { blankSheet, canAttune, canEquip, carried, draggedLine, dragged, editSheet, endDrag, sheetOf, startDrag } from '../sheet'
import EntryPicker from './edit/EntryPicker.vue'
import MoneyInput from './edit/MoneyInput.vue'
import ItemModal from './ItemModal.vue'

const props = defineProps<{ pc: Entry; side?: boolean }>()
const ro = computed(() => !!state.readOnly)
const s = computed<CharacterSheet>(() => sheetOf(props.pc) ?? blankSheet())
const edit = (fn: (s: CharacterSheet) => void) => editSheet(props.pc, fn)
const num = (ev: Event) => { const v = (ev.target as HTMLInputElement).value.trim(); return v === '' ? undefined : Number(v) }
const text = (ev: Event) => (ev.target as HTMLInputElement).value.trim() || undefined

const weight = computed(() => carried(s.value))
const attunedCount = computed(() => s.value.inventory.filter(l => l.attuned).length)
const itemOf = (i: number) => get(s.value.inventory[i]?.item)
// Ingredients are the crafting pouch: listed apart, under the gear.
const lines = computed(() => s.value.inventory.map((l, i) => ({ l, i, e: get(l.item) })))
const gear = computed(() => lines.value.filter(x => x.e?.fields.kind !== 'Ingredient'))
const pouch = computed(() => lines.value.filter(x => x.e?.fields.kind === 'Ingredient'))

function addItem(id: string) {
  edit(x => { const have = x.inventory.find(l => l.item === id); if (have) have.qty += 1; else x.inventory.push({ item: id, qty: 1 }) })
}
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
  <section class="cs-inventory" :class="{ card: side, 'cs-inv-side': side, 'drop-over': over }"
           @dragover="onDragOver" @dragleave="over = false" @drop="onDrop">
    <component :is="side ? 'h3' : 'h4'">Inventory <span class="muted small">{{ weight ? `${Math.round(weight * 10) / 10} lb` : '' }}{{ attunedCount ? ` · ${attunedCount}/3 attuned` : '' }}</span></component>
    <table class="cs-inv">
      <tr v-for="{ l, i, e } in gear" :key="i" :draggable="!ro && !!e" :class="{ worn: l.equipped || l.attuned }"
          @dragstart="startDrag($event, pc, i, 'inventory')" @dragend="endDrag">
        <td class="cs-qty"><input type="number" min="0" :value="l.qty" :disabled="ro" @change="edit(x => x.inventory[i].qty = num($event) ?? 0)" /></td>
        <td class="cs-iname">
          <button v-if="e" class="link-btn cs-item" @click="shown = i">{{ e.name }}</button>
          <input v-else :value="l.name ?? ''" placeholder="Name" :disabled="ro" @change="edit(x => x.inventory[i].name = text($event))" />
          <span v-if="e?.fields.kind && !side" class="muted small cs-kind">{{ e.fields.kind }}</span>
          <span v-if="side && (l.equipped || l.attuned)" class="muted small cs-kind">{{ l.equipped ? 'equipped' : 'attuned' }}</span>
        </td>
        <template v-if="!side">
          <td><button v-if="canEquip(l)" class="chip-toggle" :class="{ on: l.equipped }" :disabled="ro" @click="edit(x => x.inventory[i].equipped = !l.equipped || undefined)">{{ l.equipped ? 'Equipped' : 'Equip' }}</button></td>
          <td><button v-if="canAttune(l)" class="chip-toggle" :class="{ on: l.attuned }" :disabled="ro" @click="edit(x => x.inventory[i].attuned = !l.attuned || undefined)">{{ l.attuned ? 'Attuned' : 'Attune' }}</button></td>
        </template>
        <td><button class="link-btn" title="Remove" :disabled="ro" @click="edit(x => x.inventory.splice(i, 1))">✕</button></td>
      </tr>
    </table>
    <template v-if="pouch.length">
      <h5 class="cs-sub">Ingredient pouch</h5>
      <table class="cs-inv">
        <tr v-for="{ l, i } in pouch" :key="i">
          <td class="cs-qty"><input type="number" min="0" :value="l.qty" :disabled="ro" @change="edit(x => x.inventory[i].qty = num($event) ?? 0)" /></td>
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
        <button v-if="canEquip(shownLine)" class="chip-toggle" :class="{ on: shownLine.equipped }" :disabled="ro" @click="edit(x => x.inventory[shown!].equipped = !shownLine!.equipped || undefined)">{{ shownLine.equipped ? 'Equipped' : 'Equip' }}</button>
        <button v-if="canAttune(shownLine)" class="chip-toggle" :class="{ on: shownLine.attuned }" :disabled="ro" @click="edit(x => x.inventory[shown!].attuned = !shownLine!.attuned || undefined)">{{ shownLine.attuned ? 'Attuned' : 'Attune' }}</button>
      </template>
    </ItemModal>
  </section>
</template>
