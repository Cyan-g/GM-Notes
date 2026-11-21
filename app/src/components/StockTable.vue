<script setup lang="ts">
// A shop's stock on its page: price (the item's value × the markup, or the shop's own) and how many are left.
// "Sell to …" hands the current character the item and takes the price from their purse: bookkeeping for the
// table, a sale the players agreed to.
import { computed } from 'vue'
import type { Entry, StockLine } from '../model/types'
import { changed } from '../edit'
import { formatMoney, playerMode, state } from '../store'
import { addToInventory, currentPc, editSheet, sheetOf } from '../sheet'
import { shopPrice } from '../items'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ shop: Entry; lines: StockLine[] }>()
const rows = computed(() => props.lines.map((l, i) => ({ ...l, i, price: shopPrice(props.shop, l) })))
const buyer = computed(() => (state.readOnly ? undefined : currentPc.value))
const purse = computed(() => (buyer.value ? sheetOf(buyer.value)?.money ?? 0 : 0))
const canSell = (r: { price?: number; stock?: number }) => !!buyer.value && r.price != null && r.stock !== 0 && purse.value >= r.price
function sell(r: { item: string; price?: number; i: number; stock?: number }) {
  const pc = buyer.value
  if (!pc || r.price == null) return
  editSheet(pc, s => { s.money = (s.money ?? 0) - r.price! })
  addToInventory(pc, r.item)
  const stock = props.shop.fields.stock as StockLine[] | undefined
  const l = stock?.[r.i]
  if (l && l.stock != null) { l.stock = Math.max(0, l.stock - 1); changed(props.shop) }
}
</script>

<template>
  <table class="mini stock-table">
    <thead><tr><th>Item</th><th class="num">Price</th><th class="num">In stock</th><th v-if="buyer && !playerMode" class="num"><span class="muted small">{{ buyer.name }}: {{ formatMoney(purse) }}</span></th></tr></thead>
    <tbody>
      <tr v-for="r in rows" :key="r.item + r.i" :class="{ 'sold-out': r.stock === 0 }">
        <td><EntryLink :id="r.item" /></td>
        <td class="num">{{ formatMoney(r.price) }}</td>
        <td class="num">{{ r.stock ?? '' }}</td>
        <td v-if="buyer && !playerMode" class="num">
          <button type="button" class="chip-btn" :disabled="!canSell(r)" :title="r.stock === 0 ? 'Sold out' : r.price == null ? 'No price' : purse < r.price ? `${buyer.name} has ${formatMoney(purse)}` : `Add it to ${buyer.name}'s inventory and take ${formatMoney(r.price)} from their purse`" @click="sell(r)">Sell to {{ buyer.name.split(' ')[0] }}</button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
