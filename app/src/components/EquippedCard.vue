<script setup lang="ts">
// A character's side card: what they wear and wield, and their three attunement slots.
// Each item has a button to take it off (or end the attunement); it also opens in a pop-up.
import { computed, ref } from 'vue'
import type { Entry, InventoryLine } from '../model/types'
import { get, state } from '../store'
import { changed } from '../edit'
import { canAttune, canEquip, draggedLine, dragged, editSheet, endDrag, proficientWith, sheetOf, sheetToEdit, startDrag } from '../sheet'
import ItemModal from './ItemModal.vue'
import { chargesLeft, describeEffect, effectsOf, itemsInUse, setCharges, spellsOf } from '../gear'

const props = defineProps<{ pc: Entry }>()
const ATTUNE_SLOTS = 3
const ro = computed(() => !!state.readOnly)
const lines = computed(() => (sheetOf(props.pc)?.inventory ?? []).map((l, i) => ({ l, i, e: get(l.item) })).filter(x => !!x.e))
const label = (x: { e?: Entry }) => (x.e!.fields.kind === 'Armor' ? String(x.e!.fields.slot ?? 'Armor') : String(x.e!.fields.kind ?? ''))
const worn = computed(() => lines.value.filter(x => x.l.equipped && x.e!.fields.kind === 'Armor'))
const wielded = computed(() => lines.value.filter(x => x.l.equipped && x.e!.fields.kind === 'Weapon'))
/** Other things worn for their effects: a cloak, boots, a ring that needs no attunement. */
const other = computed(() => lines.value.filter(x => x.l.equipped && !['Armor', 'Weapon'].includes(String(x.e!.fields.kind))))
/** What each item in use does right now (gear.ts), with its charges. */
const active = computed(() => itemsInUse(sheetOf(props.pc))
  .map(({ l, i, item }) => ({
    i, id: item.id, name: item.name, max: Number(item.fields.charges) || 0, left: chargesLeft(l, item), recharge: item.fields.recharge as string | undefined,
    says: [...effectsOf(item).map(describeEffect), spellsOf(item).length ? `${spellsOf(item).length} spell${spellsOf(item).length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '),
  }))
  .filter(g => g.says || g.max))
const charge = (i: number, n: number) => { if (!ro.value) editSheet(props.pc, x => setCharges(x, i, n)) }
const attuned = computed(() => lines.value.filter(x => x.l.attuned))
/** Worn or wielded without the proficiency for it. */
const untrained = (x: { e?: Entry }) => proficientWith(sheetOf(props.pc), x.e!) === false
const slots = computed(() => Array.from({ length: Math.max(ATTUNE_SLOTS, attuned.value.length) }, (_, i) => attuned.value[i]))

// ---- dragging: from the inventory onto the equipped list or the attunement slots, or between them ----
const over = ref<'' | 'equipped' | 'attuned'>('')
/** Whether the dragged line can go into a zone. */
const fits = (zone: 'equipped' | 'attuned') => {
  const l = draggedLine(props.pc)
  if (!l || dragged.from === zone) return false
  return zone === 'equipped' ? canEquip(l) || (!canEquip(l) && canAttune(l)) : canAttune(l)
}
function onDragOver(ev: DragEvent, zone: 'equipped' | 'attuned') { if (fits(zone)) { ev.preventDefault(); over.value = zone } }
function onDrop(ev: DragEvent, zone: 'equipped' | 'attuned') {
  over.value = ''
  if (!fits(zone)) return
  ev.preventDefault()
  const i = dragged.i
  editSheet(props.pc, x => {
    const l = x.inventory[i]
    // Dropped on Equipped: worn or wielded; a ring or amulet (nothing to wield) is attuned instead.
    // Armor dropped on the attunement slots stays worn as well.
    if (zone === 'equipped' && canEquip(l)) l.equipped = true
    else l.attuned = true
  })
  endDrag()
}

/** Take an item off, or end its attunement: it stays in the inventory. */
const off = (i: number, key: 'equipped' | 'attuned') => { if (!ro.value) editSheet(props.pc, x => { delete x.inventory[i][key] }) }

const shown = ref<number | null>(null)
const shownLine = computed<InventoryLine | undefined>(() => (shown.value != null ? sheetOf(props.pc)?.inventory[shown.value] : undefined))
function toggle(key: 'equipped' | 'attuned') {
  if (ro.value || shown.value == null) return
  const l = sheetToEdit(props.pc).inventory[shown.value]
  l[key] = !l[key] || undefined
  changed(props.pc)
}
</script>

<template>
  <div class="card equipped-card">
    <h3>Equipped</h3>
    <div class="drop-zone" :class="{ 'drop-over': over === 'equipped' }" @dragover="onDragOver($event, 'equipped')" @dragleave="over = ''" @drop="onDrop($event, 'equipped')">
    <ul v-if="worn.length || wielded.length || other.length" class="rel">
      <li v-for="x in [...worn, ...wielded, ...other]" :key="x.i" :draggable="!ro" @dragstart="startDrag($event, pc, x.i, 'equipped')" @dragend="endDrag">
        <button class="link-btn cs-item" @click="shown = x.i">{{ x.e!.name }}</button>
        <span v-if="untrained(x)" class="cs-untrained" :title="x.e!.fields.kind === 'Weapon' ? 'Not proficient: no proficiency bonus to hit' : 'Not proficient: disadvantage on STR and DEX rolls, no spellcasting'">⚠</span>
        <span class="role">{{ label(x) }}</span>
        <button v-if="!ro" class="link-btn eq-off" :title="`Take off ${x.e!.name} (it stays in the inventory)`" @click="off(x.i, 'equipped')">Unequip</button>
      </li>
    </ul>
    <p v-else class="muted small">Nothing worn or wielded. Drag weapons, armor and other gear here from the inventory.</p>
    </div>

    <h4>Attunement <span class="muted small">{{ attuned.length }} / {{ ATTUNE_SLOTS }}</span></h4>
    <ol class="attune-slots drop-zone" :class="{ 'drop-over': over === 'attuned' }" @dragover="onDragOver($event, 'attuned')" @dragleave="over = ''" @drop="onDrop($event, 'attuned')">
      <li v-for="(x, n) in slots" :key="n" :class="{ empty: !x, over: n >= ATTUNE_SLOTS }">
        <button v-if="x" class="link-btn cs-item" :draggable="!ro" @dragstart="startDrag($event, pc, x.i, 'attuned')" @dragend="endDrag" @click="shown = x.i">{{ x.e!.name }}</button>
        <span v-else class="muted small">empty</span>
        <button v-if="x && !ro" class="link-btn eq-off" :title="`End the attunement to ${x.e!.name} (it stays in the inventory)`" @click="off(x.i, 'attuned')">Unattune</button>
      </li>
    </ol>

    <template v-if="active.length">
      <h4>Active gear</h4>
      <ul class="active-gear">
        <li v-for="g in active" :key="g.i"><b>{{ g.name }}</b> <span class="muted">{{ g.says }}</span>
          <span v-if="g.max" class="eq-charges tip" :data-tip="`Charges left${g.recharge ? '; regains ' + g.recharge : ''}`">
            <button class="link-btn" :disabled="ro || !g.left" title="Spend a charge" @click="charge(g.i, (g.left ?? 0) - 1)">−</button>
            ⚡ {{ g.left }} / {{ g.max }}
            <button class="link-btn" :disabled="ro || g.left === g.max" title="Get a charge back" @click="charge(g.i, (g.left ?? 0) + 1)">＋</button>
          </span>
        </li>
      </ul>
    </template>

    <ItemModal v-if="shownLine?.item" :id="shownLine.item" @close="shown = null">
      <template #actions>
        <button v-if="canEquip(shownLine)" class="chip-toggle" :class="{ on: shownLine.equipped }" :disabled="ro" @click="toggle('equipped')">{{ shownLine.equipped ? 'Equipped' : 'Equip' }}</button>
        <button v-if="canAttune(shownLine)" class="chip-toggle" :class="{ on: shownLine.attuned }" :disabled="ro" @click="toggle('attuned')">{{ shownLine.attuned ? 'Attuned' : 'Attune' }}</button>
      </template>
    </ItemModal>
  </div>
</template>
