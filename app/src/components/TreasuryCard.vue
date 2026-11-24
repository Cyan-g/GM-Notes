<script setup lang="ts">
// A character's treasury, below their inventory: what they keep elsewhere (at home, in a bank, on a ship) and coins
// of its own. Nothing in it is carried, weighed or worn (gear.ts). Items drag in from the inventory or the Equipped
// card and back out to the inventory (or straight onto an Equipped slot); the pop-up has "Take out" too.
import { useReadOnlyShared as useReadOnly } from '../composables/useReadOnly'
import { computed, ref } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { formatMoney, get, optionLabel, playerMode } from '../store'
import { dragged, draggedLine, endDrag, startDrag } from '../sheet'
import { editSheet, sheetOrBlank } from '../sheetData'
import { fromTreasury, toTreasury } from '../gear'
import EntryPicker from './edit/EntryPicker.vue'
import MoneyInput from './edit/MoneyInput.vue'
import ItemModal from './ItemModal.vue'

const props = defineProps<{ pc: Entry }>()
const ro = useReadOnly()
const s = computed<CharacterSheet>(() => sheetOrBlank(props.pc))
const edit = (fn: (s: CharacterSheet) => void) => editSheet(props.pc, fn)
const lines = computed(() => (s.value.treasury ?? []).map((l, i) => ({ l, i, e: get(l.item) })))
const num = (ev: Event) => { const v = (ev.target as HTMLInputElement).value.trim(); return v === '' ? undefined : Number(v) }

function add(id: string) {
  edit(x => {
    const t = (x.treasury ??= []), same = t.find(l => l.item === id && !l.label && !l.note)
    if (same) same.qty += 1; else t.push({ item: id, qty: 1 })
  })
}
const addText = (name: string) => edit(x => { (x.treasury ??= []).push({ name, qty: 1 }) })
function remove(i: number) { edit(x => { x.treasury!.splice(i, 1); if (!x.treasury!.length) delete x.treasury }) }
function setQty(i: number, n: number | undefined) { edit(x => { x.treasury![i].qty = Math.max(0, n ?? 0) }) }
function takeOut(i: number) { if (!ro.value) edit(x => { fromTreasury(x, i) }); shown.value = null }

// ---- dragging in: from the inventory or the Equipped card (taken off, out of attunement) ----
const over = ref(false)
const droppable = computed(() => !ro.value && !!draggedLine(props.pc) && dragged.from !== 'treasury')
function onDragOver(ev: DragEvent) { if (droppable.value) { ev.preventDefault(); over.value = true } }
function onDragLeave(ev: DragEvent) { if (!(ev.currentTarget as Element).contains(ev.relatedTarget as Node | null)) over.value = false }
function onDrop(ev: DragEvent) {
  over.value = false
  if (!droppable.value) return
  ev.preventDefault()
  const i = dragged.i
  edit(x => toTreasury(x, i))
  endDrag()
}

const shown = ref<number | null>(null)
const shownLine = computed(() => (shown.value != null ? s.value.treasury?.[shown.value] : undefined))
</script>

<template>
  <section class="cs-inventory cs-treasury card" :class="{ 'drop-over': over }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <h3>Treasury <span class="muted small" title="Kept elsewhere: not carried, weighed or worn">not carried</span></h3>
    <table v-if="lines.length" class="cs-inv">
      <tr v-for="{ l, i, e } in lines" :key="i" :draggable="!ro && !!e" @dragstart="startDrag($event, pc, i, 'treasury')" @dragend="endDrag">
        <td class="cs-qty"><input type="number" min="0" :value="l.qty" :disabled="ro" aria-label="How many" @change="setQty(i, num($event))" /></td>
        <td class="cs-iname">
          <button v-if="e" class="link-btn cs-item" :title="l.note || undefined" @click="shown = i">{{ l.label || e.name }}<span v-if="l.label" class="muted small"> ({{ e.name }})</span></button>
          <span v-else>{{ l.name }}</span>
          <span v-if="e?.fields.kind" class="muted small cs-kind">{{ optionLabel('item.kind', e.fields.kind) }}</span>
        </td>
        <td class="cs-toggles"><button v-if="!ro" class="chip-toggle" title="Into the inventory (carried)" @click="takeOut(i)">Take out</button></td>
        <td><button class="link-btn" title="Remove" :disabled="ro" @click="remove(i)">✕</button></td>
      </tr>
    </table>
    <p v-else class="muted small">Nothing kept elsewhere. Drag items here from the inventory or Equipped to store them; they're not carried or weighed.</p>
    <div v-if="!ro" class="cs-inv-add">
      <EntryPicker add :types="['item']" :no-create="playerMode" free-text="as a line of its own" placeholder="Store an item…" @pick="add" @text="addText" />
    </div>
    <label class="cs-money"><span>Coins</span><MoneyInput :model-value="s.treasuryMoney" :disabled="ro" @update:model-value="v => edit(x => { if (v) x.treasuryMoney = v; else delete x.treasuryMoney })" /><span class="muted small">{{ formatMoney(s.treasuryMoney) }}</span></label>

    <ItemModal v-if="shownLine?.item" :id="shownLine.item" @close="shown = null">
      <template #actions>
        <span class="muted small">× {{ shownLine.qty }} in the treasury</span>
        <button v-if="!ro" class="chip-toggle" @click="takeOut(shown!)">Take out</button>
      </template>
    </ItemModal>
  </section>
</template>
