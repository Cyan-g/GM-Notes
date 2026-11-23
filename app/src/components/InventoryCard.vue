<script setup lang="ts">
// A character's inventory: gear, the ingredient pouch (what the Workbench crafts with) and money.
// Items open in a pop-up; they can be dragged onto the Equipped card, and dropping one back here unequips it.
// `side`: the narrow version beside the sheet (player mode), with equip and attune left to the pop-up and dragging.
import { useReadOnlyShared as useReadOnly } from '../composables/useReadOnly'
import { computed, nextTick, ref } from 'vue'
import { optionLabel } from '../store'
import type { CharacterSheet, Entry } from '../model/types'
import { formatMoney, get, playerMode, state } from '../store'
import { canAttune, canEquip, draggedLine, dragged, endDrag, startDrag } from '../sheet'
import { addToInventory, editSheet, setInUse, sheetOrBlank } from '../sheetData'
import EntryPicker from './edit/EntryPicker.vue'
import { capacityOf, gearTotals, loadOf } from '../effects'
import { weightOf } from '../items'
import MoneyInput from './edit/MoneyInput.vue'
import ItemModal from './ItemModal.vue'
import { noteUndo, restoreSheet, snapSheet } from '../undoNote'
import GearToggles from './GearToggles.vue'

const props = defineProps<{ pc: Entry; side?: boolean }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
const s = computed<CharacterSheet>(() => sheetOrBlank(props.pc))
const edit = (fn: (s: CharacterSheet) => void) => editSheet(props.pc, fn)
const num = (ev: Event) => { const v = (ev.target as HTMLInputElement).value.trim(); return v === '' ? undefined : Number(v) }
const text = (ev: Event) => (ev.target as HTMLInputElement).value.trim() || undefined

const weight = computed(() => weightOf(s.value))
/** Items carried that have no weight on their page: the total leaves them out. */
const noWeight = computed(() => [...new Set(s.value.inventory.map(l => get(l.item)).filter(e => e && e.fields.weight == null && e.fields.kind !== 'Ingredient').map(e => e!.name))])
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
// "＋ Other": a line of its own, its name field focused; left without a name, it goes again
const root = ref<HTMLElement | null>(null)
async function addNamed() {
  edit(x => { x.inventory.push({ qty: 1 }) })
  await nextTick()
  root.value?.querySelector<HTMLInputElement>(`input[data-line="${s.value.inventory.length - 1}"]`)?.focus()
}
function nameOther(i: number, ev: Event) { const v = text(ev); if (v) edit(x => { x.inventory[i].name = v }); else dropEmpty(i) }
function dropEmpty(i: number) { const l = s.value.inventory[i]; if (l && !l.item && !l.name?.trim()) edit(x => { x.inventory.splice(i, 1) }) }
/** Potions, poisons, scrolls and flasks are used up: Use takes one off the stack. */
const usedUp = (e: Entry | undefined) => ['Potion', 'Poison', 'Scroll', 'Flask'].includes(String(e?.fields.kind ?? ''))
function useOne(i: number) {
  const l = s.value.inventory[i], e = get(l?.item)
  if (ro.value || !l || !e || !l.qty) return
  const before = snapSheet(props.pc)
  edit(x => { x.inventory[i].qty -= 1 })
  if (shown.value === i && !s.value.inventory[i]?.qty) shown.value = null
  const what = String(e.fields.summary ?? e.fields.effect ?? '').replace(/[*_`#>]/g, '').trim().match(/^[^.!?]*[.!?]/)?.[0]
  noteUndo(`${l.label || e.name} used${what ? `: ${what}` : ''}`, restoreSheet(props.pc, before))
}
/** Something the world has no item for, on a line of its own (a bundle of letters). */
const addText = (name: string) => edit(x => { x.inventory.push({ name, qty: 1 }) })

// ---- the pop-up ----
const shown = ref<number | null>(null)
const shownLine = computed(() => (shown.value != null ? s.value.inventory[shown.value] : undefined))

// ---- dropping something from the Equipped card back here takes it off ----
const over = ref(false)
const droppable = computed(() => { const l = draggedLine(props.pc); return !!l && dragged.from !== 'inventory' })
function onDragOver(ev: DragEvent) { if (droppable.value) { ev.preventDefault(); over.value = true } }
/** Left the card itself (not just moved onto one of its rows). */
function onDragLeave(ev: DragEvent) { if (!(ev.currentTarget as Element).contains(ev.relatedTarget as Node | null)) over.value = false }
function onDrop(ev: DragEvent) {
  over.value = false
  if (!droppable.value) return
  ev.preventDefault()
  // back in the bag: no longer worn, wielded or attuned
  const i = dragged.i
  edit(x => { const j = setInUse(x, i, 'attuned', false); setInUse(x, j, 'equipped', false) })
  endDrag()
}
</script>

<template>
  <section ref="root" class="cs-inventory card" :class="{ 'cs-inv-side': side, 'drop-over': over }"
           @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <component :is="'h3'">Inventory <span v-flash.neutral="weight" class="muted small" :title="load ? loadTip : 'Carrying capacity: Strength × 15 lb (the Ruleset does not check it)'">{{ load ? `${round(load.carried)} / ${round(load.capacity)} lb` : `${round(weight)} of ${round(capacityOf(s, gearTotals(s)))} lb, with what's equipped` }}</span>
      <span v-if="noWeight.length" class="muted small tip" :data-tip="`No weight given for ${noWeight.join(', ')}: they count as 0 lb`"> · {{ noWeight.length }} without a weight</span></component>
    <p v-if="load && load.state !== 'ok'" class="warn-note small">{{ load.state === 'over' ? `Over the carrying capacity (${round(load.capacity)} lb): the DM decides what that means.` : load.state === 'encumbered' ? `Encumbered (over ${round(load.light!)} lb): −10 ft speed.` : `Heavily encumbered (over ${round(load.heavy!)} lb): −20 ft speed, disadvantage on ability checks, attack rolls and STR, DEX and CON saves.` }}</p>
    <table class="cs-inv">
      <tr v-for="{ l, i, e } in gear" :key="i" :draggable="!ro && !!e"
          @dragstart="startDrag($event, pc, i, 'inventory')" @dragend="endDrag">
        <td class="cs-qty"><input v-flash="l.qty" type="number" min="0" :value="l.qty" :disabled="ro" @change="edit(x => x.inventory[i].qty = num($event) ?? 0)" /></td>
        <td class="cs-iname">
          <button v-if="e" class="link-btn cs-item" :title="l.note || undefined" @click="shown = i">{{ l.label || e.name }}<span v-if="l.label" class="muted small"> ({{ e.name }})</span></button>
          <input v-else :data-line="i" :value="l.name ?? ''" placeholder="Name" :disabled="ro" @change="nameOther(i, $event)" @blur="dropEmpty(i)" />
          <span v-if="e?.fields.kind && !side" class="muted small cs-kind">{{ optionLabel('item.kind', e.fields.kind) }}<template v-if="e.fields.focus"> · {{ e.fields.focus }}</template></span>
        </td>
        <template v-if="!side">
          <td class="cs-toggles"><GearToggles :pc="pc" :i="i" /><button v-if="e && usedUp(e)" class="chip-toggle" :disabled="ro || !l.qty" :title="`Use one (drink, read, throw): one less`" @click="useOne(i)">Use</button></td>
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
      <EntryPicker add :types="['item']" :no-create="playerMode" free-text="as a line of its own" placeholder="Add an item…" @pick="addItem" @text="addText" />
      <button class="link-btn" @click="addNamed">＋ Other</button>
    </div>
    <label class="cs-money"><span>Money</span><MoneyInput :model-value="s.money" :disabled="ro" @update:model-value="v => edit(x => x.money = v)" /><span class="muted small">{{ formatMoney(s.money) }}</span></label>
    <p v-if="side && !ro" class="muted small">Drag an item onto Equipped to wear or attune it, and back here to take it off.</p>

    <ItemModal v-if="shownLine?.item" :id="shownLine.item" @close="shown = null">
      <template #actions>
        <span class="muted small">× {{ shownLine.qty }}</span>
        <GearToggles :pc="pc" :i="shown!" />
        <button v-if="usedUp(get(shownLine.item)) && !ro" class="chip-toggle" :disabled="!shownLine.qty" @click="useOne(shown!)">Use</button>
      </template>
      <!-- the character's own copy: a name and a note of theirs (the world's item stays as it is) -->
      <template #own>
        <div class="item-own small">
          <label>Their name for it <input :value="shownLine.label ?? ''" :placeholder="get(shownLine.item)?.name" :disabled="ro" @change="edit(x => { const v = text($event); if (v) x.inventory[shown!].label = v; else delete x.inventory[shown!].label })" /></label>
          <label>Note <input :value="shownLine.note ?? ''" placeholder="engraved, a gift from…" :disabled="ro" @change="edit(x => { const v = text($event); if (v) x.inventory[shown!].note = v; else delete x.inventory[shown!].note })" /></label>
        </div>
      </template>
    </ItemModal>
  </section>
</template>
