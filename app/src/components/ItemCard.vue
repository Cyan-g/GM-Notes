<script setup lang="ts">
// A magic-item style card: what it is, what it does, what it's worth.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { describe } from '../describe'
import { TYPES, byKey } from '../model/schema'
import { fieldLabel, formatMoney, get } from '../store'
import { renderInline } from '../markdown'

const props = defineProps<{ e: Entry }>()
const f = computed(() => props.e.fields)
/** A choice field's value as its option's label. */
const L = (key: string) => fieldLabel(TYPES.item.fields.find(x => x.key === key), byKey(f.value)[key])
const rows = computed(() => ([
  ['Damage', [f.value.damage, f.value.damageType?.length && L('damageType').replace(/, /g, ' or ').toLowerCase()].filter(Boolean).join(' ')],
  ['Category', [L('weaponCategory'), L('baseWeapon')].filter(Boolean).join(' · ')],
  ['Range', f.value.range],
  ['Armor type', L('armorType')],
  ['Armor class', f.value.armorClass],
  ['Slot', L('slot')],
  ['Bonus', f.value.bonus],
  ['Crafted with', get(f.value.craftingType)?.name],
  ['Ingredient type', L('category')],
  ['Weight', f.value.weight != null ? `${f.value.weight} lb` : ''],
  ['Value', formatMoney(f.value.value)],
] as [string, string][]).filter(([, v]) => v))
const rarity = computed(() => String(f.value.rarity ?? (f.value.magical ? 'magical' : 'mundane')).toLowerCase().replace(' ', '-'))
</script>

<template>
  <div class="item-card" :class="'r-' + rarity">
    <div class="ic-line">{{ describe(e) || L('kind') }}</div>
    <div class="ic-body">
      <div class="ic-text">
        <p v-if="f.summary" class="ic-summary" v-html="renderInline(f.summary)" />
        <p v-if="f.effect" class="ic-effect"><b>Effect.</b> <span v-html="renderInline(f.effect)" /></p>
        <div v-if="f.properties?.length" class="chips"><span v-for="p in f.properties" :key="p" class="chip">{{ p }}</span></div>
      </div>
      <dl v-if="rows.length" class="ic-stats">
        <template v-for="[k, v] in rows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
      </dl>
    </div>
  </div>
</template>
