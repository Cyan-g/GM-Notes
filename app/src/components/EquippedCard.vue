<script setup lang="ts">
// A character's side card: what they wear and wield, and their attunement slots (three, or as the Ruleset says).
// Each item has a button to take it off (or end the attunement); it also opens in a pop-up. With the Ruleset's gear
// slots, what's worn and wielded is a board of slots (two hands, body, head, cloak, hands, feet; gear.ts): an item
// dragged onto the card goes into a free slot it fits, or exactly where it's dropped (the slots it fits light up while
// it's dragged); what's there swaps to where it came from, or goes back to the pack. Rings and other accessories are
// "other gear", unlimited.
import { ruleNumber } from '../rules'
import { useReadOnlyShared as useReadOnly } from '../composables/useReadOnly'
import { printCards } from '../ui'
import AppIcon from './AppIcon.vue'
import { computed, ref } from 'vue'
import type { Entry, InventoryLine } from '../model/types'
import { get, state } from '../store'
import { blockedFor, canAttune, canEquip, draggedLine, dragged, endDrag, proficientWith, startDrag } from '../sheet'
import { setInUse as rawSetInUse } from '../sheetData'
import { editSheet, sheetOf } from '../sheetData'
import { canTwoHand, equipInto, fitsOf, fromTreasury, gearPlacement, setInUse, setTwoHands, slotsOn } from '../gear'
import { GEAR_SLOTS, isTwoHanded, isVersatile, type GearSlot } from '../gearSlots'
import ItemModal from './ItemModal.vue'
import GearToggles from './GearToggles.vue'
import { chargesLeft, effectsOf, focusText, itemsInUse, regainText, setCharges, spellsOf } from '../items'
import { describeEffect } from '../effects'

const props = defineProps<{ pc: Entry }>()
const ATTUNE_SLOTS = computed(() => ruleNumber('attunementSlots'))
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
const lines = computed(() => (sheetOf(props.pc)?.inventory ?? []).map((l, i) => ({ l, i, e: get(l.item) })).filter(x => !!x.e))
const label = (x: { e?: Entry }) => (x.e!.fields.kind === 'Armor' ? String(x.e!.fields.slot ?? 'Armor') : String(x.e!.fields.kind ?? '')) + (focusText(x.e) ? ` · ${focusText(x.e)}` : '')
const worn = computed(() => lines.value.filter(x => x.l.equipped && x.e!.fields.kind === 'Armor'))
const wielded = computed(() => lines.value.filter(x => x.l.equipped && x.e!.fields.kind === 'Weapon'))
/** Other things worn for their effects: a cloak, boots, a ring that needs no attunement. */
const other = computed(() => lines.value.filter(x => x.l.equipped && !['Armor', 'Weapon'].includes(String(x.e!.fields.kind))))
/** What each item in use does right now (items.ts, effects.ts), with its charges. */
const active = computed(() => itemsInUse(sheetOf(props.pc))
  .map(({ l, i, item }) => ({
    i, id: item.id, name: item.name, max: Number(item.fields.charges) || 0, left: chargesLeft(l, item), recharge: regainText(item) || undefined,
    says: [...effectsOf(item).map(describeEffect), spellsOf(item).length ? `${spellsOf(item).length} spell${spellsOf(item).length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '),
  }))
  .filter(g => g.says || g.max))
const charge = (i: number, n: number) => { if (!ro.value) editSheet(props.pc, x => setCharges(x, i, n)) }
const attuned = computed(() => lines.value.filter(x => x.l.attuned))
/** The items as cards: those in use (equipped or attuned), or everything carried. */
function printItems() {
  const ids = (l: typeof lines.value) => [...new Set(l.map(x => x.e!.id))]
  printCards(`${props.pc.name} items`, [{ label: 'Equipped & attuned', ids: ids(lines.value.filter(x => x.l.equipped || x.l.attuned)) }, { label: 'Everything carried', ids: ids(lines.value) }])
}
/** Worn or wielded without the proficiency for it. */
const untrained = (x: { e?: Entry }) => proficientWith(sheetOf(props.pc), x.e!) === false
/** An item in use whose requirements the character doesn't meet (e.g. a score dropped since). */
const unfit = (x: { l: InventoryLine; e?: Entry }) => blockedFor(props.pc, { ...x.l, equipped: undefined, attuned: undefined }, x.e?.fields.attunement ? 'attuned' : 'equipped')
const slots = computed(() => Array.from({ length: Math.max(ATTUNE_SLOTS.value, attuned.value.length) }, (_, i) => attuned.value[i]))

// ---- dragging: an item from the inventory dropped anywhere on this card is put to use ----
const over = ref(false)
/** Whether the dragged line can be put to use: worn or wielded, or attuned (an item that needs it). From a slot it
 * can only move to another slot. */
const fits = () => {
  const l = draggedLine(props.pc)
  if (!l) return false
  if (dragged.from === 'equipped') return slotsOn() && fitsOf(l).length > 0
  return (dragged.from === 'inventory' || dragged.from === 'treasury') && (canEquip(l) || canAttune(l))
}
function onDragOver(ev: DragEvent) { if (fits()) { ev.preventDefault(); over.value = true } }
/** Left the card itself (not just moved onto one of its children). */
function onDragLeave(ev: DragEvent) { if (!(ev.currentTarget as Element).contains(ev.relatedTarget as Node | null)) over.value = false }
/** Why the last drop was refused (the item's requirements), shown for a few seconds. */
const refused = ref('')
let refusedTimer: ReturnType<typeof setTimeout> | undefined
/** Something that happened beside what was asked ("equipped but not attuned: all slots taken"), for a few seconds. */
const told = ref('')
let toldTimer: ReturnType<typeof setTimeout> | undefined
const tell = (m: string) => { if (!m) return; told.value = m; clearTimeout(toldTimer); toldTimer = setTimeout(() => (told.value = ''), 6000) }
function refuse(why: string) {
  refused.value = why
  clearTimeout(refusedTimer); refusedTimer = setTimeout(() => (refused.value = ''), 5000)
  endDrag()
}
/** Put the dragged line to use: into `slot` (or the first free one it fits), attuned too if it needs it. */
function putToUse(slot?: GearSlot) {
  const i = dragged.i, from = dragged.from
  const l = draggedLine(props.pc)
  const why = l && from !== 'equipped' && ((canEquip(l) && blockedFor(props.pc, l, 'equipped')) || (canAttune(l) && blockedFor(props.pc, l, 'attuned')))
  if (why) return refuse(why)
  let msg = ''
  editSheet(props.pc, x => {
    // out of the treasury first: one of it
    const k = from === 'treasury' ? fromTreasury(x, i, 1) : i
    const line = x.inventory[k]
    if (!line) return
    // worn or wielded if it can be (attuned too if it needs it: magic armor, a staff); else only attuned (a ring)
    if (canEquip(line)) msg = equipInto(x, k, slot)
    else if (canAttune(line)) rawSetInUse(x, k, 'attuned', true)
  })
  tell(msg)
}
function onDrop(ev: DragEvent) {
  over.value = false
  if (!fits()) return
  ev.preventDefault()
  putToUse()
  endDrag()
}

/** Take an item off, or end its attunement: it stays in the inventory. */
const off = (i: number, key: 'equipped' | 'attuned') => { if (!ro.value) editSheet(props.pc, x => { setInUse(x, i, key, false) }) }

// ---- the slot board (gear slots on) ----
const place = computed(() => gearPlacement(sheetOf(props.pc)))
const lineAt = (i: number | undefined) => (i == null ? undefined : lines.value.find(x => x.i === i))
/** The slots in board order, with what's in each; the off hand of a weapon held in both hands says so. */
const board = computed(() => GEAR_SLOTS.map(g => {
  const i = place.value.at[g.id]
  return { ...g, x: lineAt(i), both: g.id === 'off' && i != null && i === place.value.at.main }
}))
const otherGear = computed(() => place.value.other.map(lineAt).filter((x): x is NonNullable<typeof x> => !!x))
const overflowed = computed(() => place.value.overflow.map(lineAt).filter((x): x is NonNullable<typeof x> => !!x))
/** While an item of this character is dragged: the slots it fits (lit), the others dimmed. */
const dragFits = computed<GearSlot[] | null>(() => {
  const l = draggedLine(props.pc)
  return l && fits() ? fitsOf(l) : null
})
const overSlot = ref<GearSlot | null>(null)
function onSlotOver(ev: DragEvent, slot: GearSlot) {
  if (!dragFits.value?.includes(slot)) return
  ev.preventDefault(); ev.stopPropagation()
  overSlot.value = slot; over.value = false
}
function onSlotDrop(ev: DragEvent, slot: GearSlot) {
  overSlot.value = null; over.value = false
  if (!dragFits.value?.includes(slot)) return
  ev.preventDefault(); ev.stopPropagation()
  putToUse(slot)
  endDrag()
}
const twoHandsOf = (x: { l: InventoryLine; e?: Entry }) => isTwoHanded(x.e?.fields) ? 'two-handed' : x.l.twoHands ? 'in two hands' : ''
const canHoldTwo = (x: { i: number; e?: Entry }) => isVersatile(x.e?.fields) && !!sheetOf(props.pc) && canTwoHand(sheetOf(props.pc)!, x.i)
const holdTwo = (x: { i: number; l: InventoryLine }) => { if (!ro.value) editSheet(props.pc, y => setTwoHands(y, x.i, !x.l.twoHands)) }
/** A two-handed weapon held with a shield: one of them can't be used. */
const handsFull = computed(() => {
  const twoHanded = wielded.value.find(x => (x.e!.fields.properties ?? []).some(p => /two-handed/i.test(p)))
  const shield = worn.value.find(x => x.e!.fields.armorType === 'Shield')
  return twoHanded && shield ? `${twoHanded.e!.name} needs both hands: with ${shield.e!.name} on, only one of them can be used at a time.` : ''
})
/** The name the character gave their copy, else the item's. */
const nameOf = (x: { l: InventoryLine; e?: Entry }) => x.l.label || x.e!.name

const shown = ref<number | null>(null)
/** The character's own name or note for the item shown (empty: none). */
function setOwn(key: 'label' | 'note', ev: Event) {
  const v = (ev.target as HTMLInputElement).value.trim(), i = shown.value
  if (i == null || ro.value) return
  editSheet(props.pc, x => { if (v) x.inventory[i][key] = v; else delete x.inventory[i][key] })
}
const shownLine = computed<InventoryLine | undefined>(() => (shown.value != null ? sheetOf(props.pc)?.inventory[shown.value] : undefined))
</script>

<template>
  <div class="card equipped-card drop-zone" :class="{ 'drop-over': over }" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <h3>Equipped <button v-if="lines.length" type="button" class="link-btn small push-right" title="Print these items as cards (PDF, poker size)" @click="printItems"><AppIcon ui="cards" /> Cards</button></h3>
    <template v-if="slotsOn()">
      <div class="gear-board" :class="{ dragging: !!dragFits }">
        <div v-for="g in board" :key="g.id" class="gslot" :class="[`gslot-${g.id}`, { filled: !!g.x, lit: dragFits?.includes(g.id), dim: dragFits && !dragFits.includes(g.id), over: overSlot === g.id }]"
             @dragover="onSlotOver($event, g.id)" @dragleave="overSlot = null" @drop="onSlotDrop($event, g.id)">
          <span class="gslot-name">{{ g.label }}</span>
          <span v-if="g.both" class="muted small">{{ g.x ? nameOf(g.x) : '' }}, both hands</span>
          <template v-else-if="g.x">
            <span class="gslot-item" :draggable="!ro" @dragstart="startDrag($event, pc, g.x.i, 'equipped')" @dragend="endDrag(); overSlot = null">
              <button class="link-btn cs-item" @click="shown = g.x.i">{{ nameOf(g.x) }}</button>
              <span v-if="untrained(g.x)" class="cs-untrained" :title="g.x.e!.fields.kind === 'Weapon' ? 'Not proficient: no proficiency bonus to hit' : 'Not proficient: disadvantage on STR and DEX rolls, no spellcasting'"><AppIcon ui="warning" /></span>
              <span v-if="unfit(g.x)" class="cs-untrained tip" :data-tip="unfit(g.x)"><AppIcon ui="warning" /></span>
            </span>
            <span class="gslot-foot">
              <span v-if="twoHandsOf(g.x)" class="muted small">{{ twoHandsOf(g.x) }}</span>
              <button v-if="!ro && canHoldTwo(g.x)" type="button" class="link-btn small" :title="g.x.l.twoHands ? 'Hold it in one hand (its one-handed damage)' : 'Hold it in both hands (its two-handed damage; the off hand empties)'" @click="holdTwo(g.x)">{{ g.x.l.twoHands ? 'One hand' : 'Two hands' }}</button>
              <button v-if="!ro" type="button" class="link-btn eq-off" :title="`Take off ${g.x.e!.name} (it stays in the inventory)`" :aria-label="`Take off ${g.x.e!.name}`" @click="off(g.x.i, 'equipped')">×</button>
            </span>
          </template>
          <span v-else class="muted small">empty</span>
        </div>
      </div>
      <p v-if="overflowed.length" class="warn-note small">No free slot for {{ overflowed.map(nameOf).join(', ') }}: worn but not counted. Drag {{ overflowed.length > 1 ? 'them' : 'it' }} onto a slot, or take {{ overflowed.length > 1 ? 'them' : 'it' }} off.</p>
      <template v-if="otherGear.length || overflowed.length">
        <h4>Other gear</h4>
        <ul class="rel">
          <li v-for="x in [...otherGear, ...overflowed]" :key="x.i" :draggable="!ro" @dragstart="startDrag($event, pc, x.i, 'equipped')" @dragend="endDrag">
            <button class="link-btn cs-item" @click="shown = x.i">{{ nameOf(x) }}</button>
            <span v-if="unfit(x)" class="cs-untrained tip" :data-tip="unfit(x)"><AppIcon ui="warning" /></span>
            <span class="role">{{ label(x) }}</span>
            <button v-if="!ro" class="link-btn eq-off" :title="`Take off ${x.e!.name} (it stays in the inventory)`" @click="off(x.i, 'equipped')">Unequip</button>
          </li>
        </ul>
      </template>
    </template>
    <ul v-else-if="worn.length || wielded.length || other.length" class="rel">
      <li v-for="x in [...worn, ...wielded, ...other]" :key="x.i" :draggable="!ro" @dragstart="startDrag($event, pc, x.i, 'equipped')" @dragend="endDrag">
        <button class="link-btn cs-item" @click="shown = x.i">{{ nameOf(x) }}</button>
        <span v-if="untrained(x)" class="cs-untrained" :title="x.e!.fields.kind === 'Weapon' ? 'Not proficient: no proficiency bonus to hit' : 'Not proficient: disadvantage on STR and DEX rolls, no spellcasting'"><AppIcon ui="warning" /></span>
        <span v-if="unfit(x)" class="cs-untrained tip" :data-tip="unfit(x)"><AppIcon ui="warning" /></span>
        <span class="role">{{ label(x) }}</span>
        <button v-if="!ro" class="link-btn eq-off" :title="`Take off ${x.e!.name} (it stays in the inventory)`" @click="off(x.i, 'equipped')">Unequip</button>
      </li>
    </ul>
    <p v-else-if="!slotsOn()" class="muted small">Nothing worn or wielded. Drag weapons, armor and other gear onto this card from the inventory.</p>

    <p v-if="handsFull && !slotsOn()" class="warn-note small">{{ handsFull }}</p>
    <p v-if="refused" class="error small">Can't: {{ refused }}.</p>
    <p v-if="told" class="warn-note small">{{ told }}</p>
    <h4>Attunement <span v-flash.neutral="attuned.length" class="muted small">{{ attuned.length }} / {{ ATTUNE_SLOTS }}</span></h4>
    <ol class="attune-slots">
      <li v-for="(x, n) in slots" :key="n" :class="{ empty: !x, over: n >= ATTUNE_SLOTS }">
        <button v-if="x" class="link-btn cs-item" :draggable="!ro" @dragstart="startDrag($event, pc, x.i, 'attuned')" @dragend="endDrag" @click="shown = x.i">{{ nameOf(x) }}</button>
        <span v-else class="muted small">empty</span>
        <span v-if="x && unfit(x)" class="cs-untrained tip" :data-tip="unfit(x)"><AppIcon ui="warning" /></span>
        <!-- an attuned weapon or armor still has to be wielded or worn to attack or protect -->
        <span v-if="x && canEquip(x.l) && !x.l.equipped" class="muted small">not {{ x.e!.fields.kind === 'Weapon' ? 'wielded' : 'worn' }}</span>
        <button v-if="x && !ro && canEquip(x.l) && !x.l.equipped" class="link-btn" :title="`Equip ${x.e!.name} too`" @click="editSheet(pc, y => { setInUse(y, x.i, 'equipped', true) })">Equip</button>
        <button v-if="x && !ro" class="link-btn eq-off" :title="`End the attunement to ${x.e!.name} (it stays in the inventory)`" @click="off(x.i, 'attuned')">Unattune</button>
      </li>
    </ol>

    <template v-if="active.length">
      <h4>Active gear</h4>
      <ul class="active-gear">
        <li v-for="g in active" :key="g.i"><b>{{ g.name }}</b> <span class="muted">{{ g.says }}</span>
          <span v-if="g.max" class="eq-charges tip" :data-tip="`Charges left${g.recharge ? '; regains ' + g.recharge : ''}`">
            <button class="link-btn" :disabled="ro || !g.left" title="Spend a charge" @click="charge(g.i, (g.left ?? 0) - 1)">−</button>
            <span v-flash="g.left"><AppIcon ui="charges" /> {{ g.left }} / {{ g.max }}</span>
            <button class="link-btn" :disabled="ro || g.left === g.max" title="Get a charge back" @click="charge(g.i, (g.left ?? 0) + 1)">＋</button>
          </span>
        </li>
      </ul>
    </template>

    <ItemModal v-if="shownLine?.item" :id="shownLine.item" @close="shown = null">
      <template #actions>
        <GearToggles :pc="pc" :i="shown!" />
      </template>
      <!-- the character's own copy: a name and a note of theirs -->
      <template #own>
        <div class="item-own small">
          <label>Their name for it <input :value="shownLine.label ?? ''" :placeholder="get(shownLine.item)?.name" :disabled="ro" @change="setOwn('label', $event)" /></label>
          <label>Note <input :value="shownLine.note ?? ''" placeholder="engraved, a gift from…" :disabled="ro" @change="setOwn('note', $event)" /></label>
        </div>
      </template>
    </ItemModal>
  </div>
</template>
