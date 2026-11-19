<script setup lang="ts">
// A magic-item style card: what it is, what it does, what it's worth.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { describe } from '../describe'
import { TYPES, byKey } from '../model/schema'
import { fieldLabel, formatMoney, get, state } from '../store'
import { optionsIn } from '../model/lists'
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
/** A weapon's (or an ingredient's) properties as their list options, with descriptions. */
const propList = computed(() => {
  const [key, ids] = f.value.kind === 'Ingredient' ? ['ingredientProperty', f.value.traits ?? []] : ['weaponProperty', f.value.properties ?? []]
  const opts = optionsIn(state.db?.meta, key)
  return ids.map(id => opts.find(o => o.id === id) ?? { id, label: id })
})
const rarity = computed(() => String(f.value.rarity ?? (f.value.magical ? 'magical' : 'mundane')).toLowerCase().replace(' ', '-'))
</script>

<template>
  <div class="item-card" :class="'r-' + rarity">
    <div class="ic-line">{{ describe(e) || L('kind') }}</div>
    <div class="ic-body">
      <div class="ic-text">
        <p v-if="f.summary" class="ic-summary" v-html="renderInline(f.summary)" />
        <p v-if="f.effect" class="ic-effect"><b>Effect.</b> <span v-html="renderInline(f.effect)" /></p>
        <div v-if="propList.length" class="chips"><span v-for="p in propList" :key="p.id" class="chip" :title="p.note">{{ p.label }}</span></div>
        <dl v-if="propList.some(p => p.note)" class="ic-props">
          <template v-for="p in propList.filter(x => x.note)" :key="p.id"><dt>{{ p.label }}</dt><dd>{{ p.note }}</dd></template>
        </dl>
      </div>
      <dl v-if="rows.length" class="ic-stats">
        <template v-for="[k, v] in rows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
      </dl>
    </div>
  </div>
</template>
