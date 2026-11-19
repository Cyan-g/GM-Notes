<script setup lang="ts">
// The Equip and Attune buttons for one inventory line. Turning one on is refused (the button greyed out, the
// reason on hover) when the character doesn't meet the item's requirements (requirements.ts); off always works.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { state } from '../store'
import { blockedFor, canAttune, canEquip, editSheet, sheetOf } from '../sheet'

const props = defineProps<{ pc: Entry; i: number }>()
const ro = computed(() => !!state.readOnly)
const l = computed(() => sheetOf(props.pc)?.inventory[props.i])
const blocked = (key: 'equipped' | 'attuned') => (l.value && !l.value[key] ? blockedFor(props.pc, l.value, key) : undefined)
function toggle(key: 'equipped' | 'attuned') {
  if (ro.value || !l.value || blocked(key)) return
  editSheet(props.pc, x => { const line = x.inventory[props.i]; if (line[key]) delete line[key]; else line[key] = true })
}
</script>

<template>
  <template v-if="l">
    <button v-if="canEquip(l)" class="chip-toggle" :class="{ on: l.equipped, tip: blocked('equipped') }" :data-tip="blocked('equipped')" :disabled="ro || !!blocked('equipped')" @click="toggle('equipped')">{{ l.equipped ? 'Equipped' : 'Equip' }}</button>
    <button v-if="canAttune(l)" class="chip-toggle" :class="{ on: l.attuned, tip: blocked('attuned') }" :data-tip="blocked('attuned')" :disabled="ro || !!blocked('attuned')" @click="toggle('attuned')">{{ l.attuned ? 'Attuned' : 'Attune' }}</button>
  </template>
</template>
