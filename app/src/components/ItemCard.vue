<script setup lang="ts">
// A magic-item style card: what it is, what it does, what it's worth.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { describe } from '../describe'
import { TYPES, byKey } from '../model/schema'
import { fieldLabel, formatMoney, get, state } from '../store'
import { optionsIn } from '../model/lists'
import { renderInline } from '../markdown'
import { describeEffect } from '../effects'
import { armorClassText, effectsOf, howCast, regainText, spellsOf, worksWhileOf } from '../items'
import EntryLink from './EntryLink.vue'
import DataImage from './DataImage.vue'
import TraitList from './TraitList.vue'
import { traitsOf } from '../model/traits'
import { describeRequirements } from '../requirements'

const props = defineProps<{ e: Entry }>()
const f = computed(() => props.e.fields)
/** A choice field's value as its option's label. */
const L = (key: string) => fieldLabel(TYPES.item.fields.find(x => x.key === key), byKey(f.value)[key])
const rows = computed(() => ([
  ['Damage', [f.value.damage, f.value.damageType?.length && L('damageType').replace(/, /g, ' or ').toLowerCase()].filter(Boolean).join(' ')],
  ['Category', [L('weaponCategory'), L('baseWeapon')].filter(Boolean).join(' · ')],
  ['Range', f.value.range],
  ['Armor type', L('armorType')],
  ['Armor class', armorClassText(props.e)],
  ['Slot', L('slot')],
  [f.value.attunement ? 'Attunement by' : 'Requires', describeRequirements(props.e)],
  ['Charges', f.value.charges ? [f.value.charges, regainText(props.e) && `regains ${regainText(props.e)}`].filter(Boolean).join(', ') : ''],
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
/** Short effects as chips ("+1 AC"), feature sentences as lines of their own. */
const chipEffects = computed(() => effectsOf(props.e).filter(x => x.on !== 'feature').map(describeEffect).filter(Boolean))
const lineEffects = computed(() => effectsOf(props.e).filter(x => x.on === 'feature').map(describeEffect).filter(Boolean))
// when its effects count (its "Works while", else its kind's default)
const effectsWhen = computed(() => { const w = worksWhileOf(props.e); return w === 'attuned' ? 'While attuned' : w === 'carried' ? 'While carried' : f.value.kind === 'Weapon' ? 'While wielded' : 'While worn' })
const spells = computed(() => spellsOf(props.e).filter(x => get(x.spell)))
const features = computed(() => traitsOf(props.e))
/** The kind line, starting with a capital: "Magical Melee (Quarterstaff) · requires attunement". */
const kindLine = computed(() => { const t = describe(props.e) || L('kind'); return t.charAt(0).toUpperCase() + t.slice(1) })
const rarity = computed(() => String(f.value.rarity ?? (f.value.magical ? 'magical' : 'mundane')).toLowerCase().replace(' ', '-'))
</script>

<template>
  <div class="item-card" :class="'r-' + rarity">
    <div class="ic-line">{{ kindLine }}</div>
    <DataImage v-if="e.image" :path="e.image" :alt="e.name" class="ic-pic" />
    <div class="ic-body">
      <div class="ic-text">
        <p v-if="f.summary" class="ic-summary" v-html="renderInline(f.summary)" />
        <p v-if="f.effect" class="ic-effect"><b>Effect.</b> <span v-html="renderInline(f.effect)" /></p>
        <div v-if="propList.length" class="chips"><span v-for="p in propList" :key="p.id" class="chip" :class="{ tip: 'note' in p && p.note }" :data-tip="'note' in p ? p.note : undefined">{{ p.label }}</span></div>
        <!-- What it does while in use: its effects, then the spells it casts, one per line. -->
        <div v-if="effects.length || spells.length" class="ic-gear">
          <div class="ic-gear-head">{{ effectsWhen }}</div>
          <ul v-if="chipEffects.length" class="ic-gear-effects"><li v-for="(x, i) in chipEffects" :key="i">{{ x }}</li></ul>
          <ul v-if="lineEffects.length" class="ic-gear-lines"><li v-for="(x, i) in lineEffects" :key="i">{{ x }}</li></ul>
          <template v-if="spells.length">
            <div class="ic-gear-sub">Spells</div>
            <ul class="ic-gear-spells"><li v-for="(x, i) in spells" :key="i"><EntryLink :id="x.spell" /><span class="muted">{{ howCast(x) }}</span></li></ul>
          </template>
        </div>
        <!-- its rules as features (with uses, choices and spells), when it has them -->
        <div v-if="features.length" class="ic-gear ic-features">
          <div class="ic-gear-head">{{ effects.length || spells.length ? 'Features' : effectsWhen }}</div>
          <TraitList :traits="features" :known="String(e.body ?? '')" />
        </div>
      </div>
      <dl v-if="rows.length" class="ic-stats">
        <template v-for="[k, v] in rows" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
      </dl>
    </div>
  </div>
</template>
