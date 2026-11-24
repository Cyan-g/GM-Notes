<script setup lang="ts">
// A character's Inventory tab: what they wear, wield and attune (the Equipped card) beside everything they carry, the
// ingredient pouch and their money (the Inventory card), and what they keep elsewhere (the Treasury card). Items drag
// between the three. The play sheet keeps what gear
// adds (counted in its numbers) and the items' charges (in its Uses card).
import type { Entry } from '../model/types'
import EquippedCard from './EquippedCard.vue'
import InventoryCard from './InventoryCard.vue'
import TreasuryCard from './TreasuryCard.vue'

defineProps<{ pc: Entry }>()
</script>

<template>
  <div class="inventory-tab">
    <EquippedCard :pc="pc" />
    <div class="inv-col">
      <InventoryCard :pc="pc" />
      <TreasuryCard :pc="pc" />
    </div>
  </div>
</template>
