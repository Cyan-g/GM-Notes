<script setup lang="ts">
// A character's side card: what they wear and wield, and their three attunement slots.
// An item opens in a pop-up, where it can be taken off or un-attuned.
import { computed, ref } from 'vue'
import type { Entry, InventoryLine } from '../model/types'
import { get, state } from '../store'
import { changed } from '../edit'
import { sheetOf, sheetToEdit } from '../sheet'
import ItemModal from './ItemModal.vue'

const props = defineProps<{ pc: Entry }>()
const ATTUNE_SLOTS = 3
const ro = computed(() => !!state.readOnly)
const lines = computed(() => (sheetOf(props.pc)?.inventory ?? []).map((l, i) => ({ l, i, e: get(l.item) })).filter(x => !!x.e))
const label = (x: { e?: Entry }) => (x.e!.fields.kind === 'Armor' ? String(x.e!.fields.slot ?? 'Armor') : String(x.e!.fields.kind ?? ''))
const worn = computed(() => lines.value.filter(x => x.l.equipped && x.e!.fields.kind === 'Armor'))
const wielded = computed(() => lines.value.filter(x => x.l.equipped && x.e!.fields.kind === 'Weapon'))
const attuned = computed(() => lines.value.filter(x => x.l.attuned))
const slots = computed(() => Array.from({ length: Math.max(ATTUNE_SLOTS, attuned.value.length) }, (_, i) => attuned.value[i]))

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
    <ul v-if="worn.length || wielded.length" class="rel">
      <li v-for="x in [...worn, ...wielded]" :key="x.i">
        <button class="link-btn cs-item" @click="shown = x.i">{{ x.e!.name }}</button>
        <span class="role">{{ label(x) }}</span>
      </li>
    </ul>
    <p v-else class="muted small">Nothing worn or wielded. Equip weapons and armor in the inventory.</p>

    <h4>Attunement <span class="muted small">{{ attuned.length }} / {{ ATTUNE_SLOTS }}</span></h4>
    <ol class="attune-slots">
      <li v-for="(x, n) in slots" :key="n" :class="{ empty: !x, over: n >= ATTUNE_SLOTS }">
        <button v-if="x" class="link-btn cs-item" @click="shown = x.i">{{ x.e!.name }}</button>
        <span v-else class="muted small">empty</span>
      </li>
    </ol>

    <ItemModal v-if="shownLine?.item" :id="shownLine.item" @close="shown = null">
      <template #actions>
        <button v-if="['Weapon', 'Armor'].includes(String(get(shownLine.item)?.fields.kind ?? ''))" class="chip-toggle" :class="{ on: shownLine.equipped }" :disabled="ro" @click="toggle('equipped')">{{ shownLine.equipped ? 'Equipped' : 'Equip' }}</button>
        <button v-if="get(shownLine.item)?.fields.attunement || get(shownLine.item)?.fields.magical || shownLine.attuned" class="chip-toggle" :class="{ on: shownLine.attuned }" :disabled="ro" @click="toggle('attuned')">{{ shownLine.attuned ? 'Attuned' : 'Attune' }}</button>
      </template>
    </ItemModal>
  </div>
</template>
