<script setup lang="ts">
// A character's Inventory tab: what they wear, wield and attune (the Equipped card) beside everything they carry, the
// ingredient pouch and their money (the Inventory card). Items drag between the two. The play sheet keeps what gear
// adds (counted in its numbers) and the items' charges (in its Uses card).
import type { Entry } from '../model/types'
import EquippedCard from './EquippedCard.vue'
import InventoryCard from './InventoryCard.vue'

defineProps<{ pc: Entry }>()
</script>

<template>
  <div class="inventory-tab">
    <EquippedCard :pc="pc" />
    <InventoryCard :pc="pc" />
  </div>
</template>
