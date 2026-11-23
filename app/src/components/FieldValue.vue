<script setup lang="ts">
import TraitList from './TraitList.vue'
import { classLabel } from '../classRules'
import { abilityBonusText } from '../abilityBonus'
// Shows one schema field of an entry, read-only.
import AppIcon from './AppIcon.vue'
import { computed } from 'vue'
import type { FieldDef } from '../model/schema'
import type { AbilityBonus, Equipment, Entry, RecipeLine, StockLine, WorldDate, Trait } from '../model/types'
import { fieldLabel, formatDate, formatMoney, get, state } from '../store'
import { listKeyOf, noteIn } from '../model/lists'
import EntryLink from './EntryLink.vue'
import DataImage from './DataImage.vue'
import StockTable from './StockTable.vue'
import EncounterTable from './EncounterTable.vue'
import RanksTable from './RanksTable.vue'
import { renderInline } from '../markdown'
import { craftingRule, craftingTime } from '../crafting'
import { describeEffect } from '../effects'
import { howCast } from '../items'
import type { GearEffect, ItemSpell } from '../model/types'

const props = defineProps<{ def: FieldDef; value: unknown; entry: Entry }>()

const eq = computed(() => (props.value ?? {}) as Equipment)
const listed = computed(() => !!listKeyOf(props.def))
const recipe = computed(() => {
  const lines = (props.value as RecipeLine[]) ?? []
  const rows = lines.map(l => {
    const each = get(l.item)?.fields.value
    return { ...l, each, total: each != null ? each * l.amount : undefined }
  })
  const known = rows.every(r => r.total != null)
  return { rows, total: rows.reduce((s, r) => s + (r.total ?? 0), 0), known }
})

const stock = computed(() => {
  const markup = (props.entry.fields.markup) ?? 1
  return ((props.value as StockLine[]) ?? []).map(l => {
    const base = get(l.item)?.fields.value
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
  <template v-else-if="def.kind === 'select'">{{ fieldLabel(def, value) }}</template>
  <template v-else-if="def.kind === 'list' && listed">
    <span class="chips"><span v-for="(v, i) in (def.key === 'classes' ? [...(value as string[])].sort((a, b) => fieldLabel(def, a).localeCompare(fieldLabel(def, b))) : (value as string[]))" :key="i" class="chip" :class="{ tip: noteIn(state.db?.meta, listKeyOf(def), v) }" :data-tip="noteIn(state.db?.meta, listKeyOf(def), v)">{{ fieldLabel(def, v) }}</span></span>
  </template>
  <template v-else-if="def.kind === 'list'">
    <span class="chips"><span v-for="(v, i) in (value as string[])" :key="i" class="chip" v-html="renderInline(String(v))" /></span>
  </template>
  <template v-else-if="def.kind === 'longtext'"><span v-html="renderInline(String(value))" /></template>
  <template v-else-if="def.kind === 'effects'">
    <span class="chips"><span v-for="(x, i) in (value as GearEffect[])" :key="i" class="chip">{{ describeEffect(x) }}</span></span>
  </template>
  <span v-else-if="def.kind === 'skills'" class="chips"><span v-for="x in (value as string[])" :key="x" class="chip">{{ x }}</span></span>
  <span v-else-if="def.kind === 'equipment'" class="equipment-value">
    <template v-for="(l, i) in eq.items ?? []" :key="i"><template v-if="i">, </template><template v-if="(l.amount ?? 1) > 1">{{ l.amount }} × </template><EntryLink v-if="l.item" :id="l.item" /><template v-else>{{ l.name }}</template></template>
    <template v-if="eq.money">{{ eq.items?.length ? ' and ' : '' }}{{ formatMoney(eq.money) }}</template>
    <template v-if="eq.instead">{{ eq.items?.length || eq.money ? '; or ' : '' }}{{ formatMoney(eq.instead) }} instead</template>
  </span>
  <template v-else-if="def.kind === 'abilityBonus'">{{ abilityBonusText(value as AbilityBonus) }}</template>
  <TraitList v-else-if="def.kind === 'speciesTraits'" :traits="(value as Trait[])" :by-level="entry.type === 'class' || entry.type === 'subclass' ? classLabel(entry) : undefined" :known="`${entry.fields.summary ?? ''}
${entry.body ?? ''}`" />
  <template v-else-if="def.kind === 'itemSpells'">
    <span class="chips"><span v-for="(x, i) in (value as ItemSpell[])" :key="i" class="chip"><EntryLink :id="x.spell" /> <span class="muted small">{{ howCast(x) }}</span></span></span>
  </template>
  <RanksTable v-else-if="def.kind === 'ranks'" :ranks="(value as any[]) ?? []" :org="entry" />
  <template v-else-if="def.kind === 'recipe'">
    <table class="mini">
      <thead><tr><th>Ingredient</th><th class="num">Amount</th><th class="num">Each</th><th class="num">Cost</th></tr></thead>
      <tbody>
        <tr v-for="r in recipe.rows" :key="r.item"><td><EntryLink :id="r.item" /></td><td class="num">{{ r.amount }}</td><td class="num">{{ formatMoney(r.each) }}</td><td class="num">{{ formatMoney(r.total) }}</td></tr>
      </tbody>
      <tfoot>
        <tr><td colspan="3">Ingredient cost{{ recipe.known ? '' : ' (some prices unknown)' }}</td><td class="num">{{ formatMoney(recipe.total) }}</td></tr>
        <tr class="craft-time" :title="craftingRule()"><td colspan="3"><AppIcon ui="timeline" /> Crafting time</td><td class="num">{{ craftingTime(entry.fields.value) || '—' }}</td></tr>
      </tfoot>
    </table>
  </template>
  <EncounterTable v-else-if="def.kind === 'combatants'" :lines="(value as any[]) ?? []" />
  <DataImage v-else-if="def.kind === 'image'" :path="String(value)" :alt="`${entry.name}: ${def.label}`" />
  <template v-else-if="def.kind === 'stock'">
    <StockTable :shop="entry" :lines="(value as StockLine[]) ?? []" />
  </template>
  <template v-else>{{ value }}</template>
</template>
