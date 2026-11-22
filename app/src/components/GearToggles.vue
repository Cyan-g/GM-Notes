<script setup lang="ts">
// The Equip and Attune buttons for one inventory line. Turning one on is refused (the button greyed out, the
// reason on hover) when the character doesn't meet the item's requirements (requirements.ts); off always works.
import { useReadOnly } from '../composables/useReadOnly'
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { state } from '../store'
import { blockedFor, canAttune, canEquip } from '../sheet'
import { editSheet, setInUse, sheetOf } from '../sheetData'

const props = defineProps<{ pc: Entry; i: number }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
const l = computed(() => sheetOf(props.pc)?.inventory[props.i])
const blocked = (key: 'equipped' | 'attuned') => (l.value && !l.value[key] ? blockedFor(props.pc, l.value, key) : undefined)
function toggle(key: 'equipped' | 'attuned') {
  if (ro.value || !l.value || blocked(key)) return
  editSheet(props.pc, x => { setInUse(x, props.i, key, !x.inventory[props.i][key]) })
}
</script>

<template>
  <template v-if="l">
    <button v-if="canEquip(l)" class="chip-toggle" :class="{ on: l.equipped, tip: blocked('equipped') }" :data-tip="blocked('equipped')" :disabled="ro || !!blocked('equipped')" @click="toggle('equipped')">{{ l.equipped ? 'Equipped' : 'Equip' }}</button>
    <button v-if="canAttune(l)" class="chip-toggle" :class="{ on: l.attuned, tip: blocked('attuned') }" :data-tip="blocked('attuned')" :disabled="ro || !!blocked('attuned')" @click="toggle('attuned')">{{ l.attuned ? 'Attuned' : 'Attune' }}</button>
  </template>
</template>
