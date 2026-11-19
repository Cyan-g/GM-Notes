<script setup lang="ts">
// A magic-item style card: what it is, what it does, what it's worth.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { describe } from '../describe'
import { TYPES, byKey } from '../model/schema'
import { fieldLabel, formatMoney, get, state } from '../store'
import { optionsIn } from '../model/lists'
import { renderInline } from '../markdown'
import { describeEffect, effectsOf, howCast, spellsOf } from '../gear'
import EntryLink from './EntryLink.vue'

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
  ['Charges', f.value.charges ? [f.value.charges, f.value.recharge && `regains ${f.value.recharge}`].filter(Boolean).join(', ') : ''],
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
/** What it does to the one who wears it, as "+1 AC", "Resistance: fire". */
const effects = computed(() => effectsOf(props.e).map(describeEffect).filter(Boolean))
const effectsWhen = computed(() => (f.value.attunement ? 'While attuned' : f.value.kind === 'Weapon' ? 'While wielded' : 'While worn'))
const spells = computed(() => spellsOf(props.e).filter(x => get(x.spell)))
const rarity = computed(() => String(f.value.rarity ?? (f.value.magical ? 'magical' : 'mundane')).toLowerCase().replace(' ', '-'))
</script>

<template>
  <div class="item-card" :class="'r-' + rarity">
    <div class="ic-line">{{ describe(e) || L('kind') }}</div>
    <div class="ic-body">
      <div class="ic-text">
        <p v-if="f.summary" class="ic-summary" v-html="renderInline(f.summary)" />
        <p v-if="f.effect" class="ic-effect"><b>Effect.</b> <span v-html="renderInline(f.effect)" /></p>
        <p v-if="effects.length" class="ic-gear"><b>{{ effectsWhen }}:</b> {{ effects.join(' · ') }}</p>
        <p v-if="spells.length" class="ic-gear"><b>{{ effectsWhen }}, cast:</b>
          <template v-for="(x, i) in spells" :key="i"><template v-if="i"> · </template><EntryLink :id="x.spell" /> <span class="muted">({{ howCast(x) }})</span></template>
        </p>
        <div v-if="propList.length" class="chips"><span v-for="p in propList" :key="p.id" class="chip" :class="{ tip: 'note' in p && p.note }" :data-tip="'note' in p ? p.note : undefined">{{ p.label }}</span></div>
      </div>
      <dl v-if="rows.length" class="ic-stats">
        <template v-for="[k, v] in rows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
      </dl>
    </div>
  </div>
</template>
