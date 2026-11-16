<script setup lang="ts">
// Shows one schema field of an entry, read-only.
import { computed } from 'vue'
import type { FieldDef } from '../model/schema'
import type { Entry, RecipeLine, StockLine, WorldDate } from '../model/types'
import { formatDate, formatMoney, get } from '../store'
import EntryLink from './EntryLink.vue'
import EncounterTable from './EncounterTable.vue'
import RanksTable from './RanksTable.vue'
import { renderInline } from '../markdown'
import { CRAFTING_RULE, craftingTime } from '../crafting'

const props = defineProps<{ def: FieldDef; value: unknown; entry: Entry }>()

const recipe = computed(() => {
  const lines = (props.value as RecipeLine[]) ?? []
  const rows = lines.map(l => {
    const each = get(l.item)?.fields.value as number | undefined
    return { ...l, each, total: each != null ? each * l.amount : undefined }
  })
  const known = rows.every(r => r.total != null)
  return { rows, total: rows.reduce((s, r) => s + (r.total ?? 0), 0), known }
})

const stock = computed(() => {
  const markup = (props.entry.fields.markup as number | undefined) ?? 1
  return ((props.value as StockLine[]) ?? []).map(l => {
    const base = get(l.item)?.fields.value as number | undefined
    return { ...l, price: l.price ?? (base != null ? Math.round(base * markup) : undefined) }
  })
})
</script>

<template>
  <template v-if="def.kind === 'ref'"><EntryLink :id="value as string" /></template>
  <template v-else-if="def.kind === 'refs'">
    <span class="chips"><EntryLink v-for="id in (value as string[])" :key="id" :id="id" class="chip" /></span>
  </template>
  <template v-else-if="def.kind === 'money'">{{ formatMoney(value) }}</template>
  <template v-else-if="def.kind === 'weight'">{{ value }} lb</template>
  <template v-else-if="def.kind === 'bool'">{{ value ? 'Yes' : 'No' }}</template>
  <template v-else-if="def.kind === 'date'">{{ formatDate(value as WorldDate) }}</template>
  <template v-else-if="def.kind === 'list'">
    <span class="chips"><span v-for="(v, i) in (value as string[])" :key="i" class="chip" v-html="renderInline(String(v))" /></span>
  </template>
  <template v-else-if="def.kind === 'longtext'"><span v-html="renderInline(String(value))" /></template>
  <RanksTable v-else-if="def.kind === 'ranks'" :ranks="(value as any[]) ?? []" :org="entry" />
  <template v-else-if="def.kind === 'recipe'">
    <table class="mini">
      <thead><tr><th>Ingredient</th><th class="num">Amount</th><th class="num">Each</th><th class="num">Cost</th></tr></thead>
      <tbody>
        <tr v-for="r in recipe.rows" :key="r.item"><td><EntryLink :id="r.item" /></td><td class="num">{{ r.amount }}</td><td class="num">{{ formatMoney(r.each) }}</td><td class="num">{{ formatMoney(r.total) }}</td></tr>
      </tbody>
      <tfoot>
        <tr><td colspan="3">Ingredient cost{{ recipe.known ? '' : ' (some prices unknown)' }}</td><td class="num">{{ formatMoney(recipe.total) }}</td></tr>
        <tr class="craft-time" :title="CRAFTING_RULE"><td colspan="3">⏳ Crafting time</td><td class="num">{{ craftingTime(entry.fields.value) || '—' }}</td></tr>
      </tfoot>
    </table>
  </template>
  <EncounterTable v-else-if="def.kind === 'combatants'" :lines="(value as any[]) ?? []" />
  <template v-else-if="def.kind === 'stock'">
    <table class="mini">
      <thead><tr><th>Item</th><th class="num">Price</th><th class="num">In stock</th></tr></thead>
      <tbody>
        <tr v-for="r in stock" :key="r.item"><td><EntryLink :id="r.item" /></td><td class="num">{{ formatMoney(r.price) }}</td><td class="num">{{ r.stock ?? '' }}</td></tr>
      </tbody>
    </table>
  </template>
  <template v-else>{{ value }}</template>
</template>
