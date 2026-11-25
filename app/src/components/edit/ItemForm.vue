<script setup lang="ts">
// An item's Edit form. On top, what it is: the basics (rarity with its usual price) and the stats of its kind — a
// weapon's showing its base weapon's damage, properties and mastery as defaults, armor's AC only for real armor.
// Below, side by side: what it gives (when it works, then its effects, spells & charges and features, each with
// what it's for; empty ones fold into + buttons) and what it needs (attunement, and who can use it, step by step).
import Dropdown from '../Dropdown.vue'
import { computed, ref } from 'vue'
import type { Entry, Regain } from '../../model/types'
import { TYPES, MASTERY_OF, byKey, type FieldDef } from '../../model/schema'
import { changed, setField, toggleField } from '../../edit'
import { formatMoney, listOptions } from '../../store'
import { parseRegain, worksWhileOf } from '../../items'
import { mainCoin, rule } from '../../rules'
import { itemNamed } from '../../lookup'
import { useParts } from '../../composables/useParts'
import FieldInput from './FieldInput.vue'
import ItemNeeds from './ItemNeeds.vue'
import AddPartsBar from './AddPartsBar.vue'
import { inputValue as val } from '../../dom'
import { openRecipe, recipeShown } from '../../composables/recipeOpen'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => byKey(props.entry.fields))
const shown = (d: FieldDef) => !d.when || d.when.is.includes(String(f.value[d.when.field] ?? ''))
// an item's inventory slots only matter while the Ruleset counts slots
const fields = computed(() => TYPES.item.fields.filter(d => shown(d) && d.key !== 'summary' && d.kind !== 'recipe' && (d.key !== 'slots' || rule('carryingCapacity') === 'slots')))
const fieldOf = (k: string) => fields.value.find(d => d.key === k)

/** What it gives, each with what it's for. */
const GIVES = [
  { id: 'effects', label: 'Effects', keys: ['effects'], hint: 'Always on while it works: +2 to saves, resistance, a speed' },
  { id: 'spells', label: 'Spells & charges', keys: ['charges', 'regain', 'recharge', 'spells'], hint: 'Spells cast from it, for charges or once per rest' },
  { id: 'features', label: 'Features', keys: ['speciesTraits'], hint: 'Named abilities with their own text, uses or choices (Sentience, Treantkin)' },
]
const GIVE_KEYS = GIVES.flatMap(x => x.keys)
/** The fields each "needs"/"gives" part takes, and the basics that move to the right (attunement). */
const NEED_KEYS = ['requirements', 'attunement']
const give = (id: string) => GIVES.find(x => x.id === id)!
const partFields = (id: string) => fields.value.filter(d => give(id).keys.includes(d.key))
const has = (id: string) => partFields(id).some(d => { const v = f.value[d.key]; return v != null && v !== '' && !(Array.isArray(v) && !v.length) })
const { shown: shownIds, addable, open, close } = useParts(() => GIVES.filter(x => partFields(x.id).length).map(x => x.id), has, {
  confirmClose: id => `Remove this item's ${give(id).label.toLowerCase()}?`,
  onClose: id => {
    if (!has(id)) return
    for (const d of partFields(id)) delete f.value[d.key]
    changed(props.entry)
  },
})
const visible = computed(() => shownIds.value.map(give))
const isGear = computed(() => !!fieldOf('effects'))

// ---- the basics and the kind's own stats ----
const SPECIAL = ['worksWhile', 'regain', 'recharge', 'charges', 'damage', 'range', 'mastery', 'armorClass', 'stealthDis', 'rarity']
const basics = computed(() => fields.value.filter(d => !d.group && !GIVE_KEYS.includes(d.key) && !NEED_KEYS.includes(d.key) && !SPECIAL.includes(d.key)))
const groups = computed(() => {
  const out = new Map<string, FieldDef[]>()
  for (const d of fields.value) if (d.group && !SPECIAL.includes(d.key)) out.set(d.group, [...(out.get(d.group) ?? []), d])
  return [...out]
})
const focusOpen = ref(false)
const focusShown = computed(() => focusOpen.value || !!(f.value.focus as unknown[] | undefined)?.length)
const WIDE = ['list', 'longtext', 'effects', 'itemSpells', 'requires', 'speciesTraits']
const short = (l: FieldDef[]) => l.filter(d => !WIDE.includes(d.kind) && d.kind !== 'bool')
const wide = (l: FieldDef[]) => l.filter(d => WIDE.includes(d.kind))
const bools = (l: FieldDef[]) => l.filter(d => d.kind === 'bool')
const toggleBool = (key: string) => toggleField(props.entry, key)
const setText = (k: string, v: string) => setField(props.entry, k, v.trim())
const setNumber = (k: string, v: string) => setField(props.entry, k, v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Number(v))
/** What the armor type adds to the AC number. */
const acHint = computed(() => ({ Light: '+ Dex', Medium: '+ Dex (max 2)', Heavy: 'no Dex', Shield: 'added to AC' } as Record<string, string>)[String(f.value.armorType ?? '')] ?? '')

// ---- rarity: the usual price (2024 rules; consumables half) ----
const PRICE: Record<string, number> = { Common: 100, Uncommon: 400, Rare: 4000, 'Very rare': 40000, Legendary: 200000 }
const consumable = computed(() => ['Potion', 'Scroll', 'Poison'].includes(String(f.value.kind ?? '')))
const usualPrice = computed(() => { const p = PRICE[String(f.value.rarity ?? '')]; return p ? (consumable.value ? p / 2 : p) * mainCoin() : undefined })
function setRarity(v: string) {
  if (v) f.value.rarity = v; else delete f.value.rarity
  const p = PRICE[v]
  if (p && f.value.value == null) f.value.value = (consumable.value ? p / 2 : p) * mainCoin()
  changed(props.entry)
}

// ---- a weapon: its base weapon's stats as defaults ----
const base = computed(() => (f.value.baseWeapon ? itemNamed(String(f.value.baseWeapon)) : undefined))
const baseMastery = computed(() => (f.value.baseWeapon ? MASTERY_OF[String(f.value.baseWeapon)] : undefined))
const ranged = computed(() => {
  const p = ((f.value.properties as string[] | undefined) ?? []).concat((base.value?.fields.properties as string[] | undefined) ?? []).map(x => x.toLowerCase())
  return !!f.value.range || p.some(x => x === 'ammunition' || x === 'thrown')
})
const realArmor = computed(() => ['Light', 'Medium', 'Heavy', 'Shield'].includes(String(f.value.armorType ?? '')))
/** Heavy armor's Strength: its requirements' STR score (worn without it: −10 ft speed). */
const strNeeded = computed(() => (f.value.requirements as { scores?: { ability: string; min: number }[] } | undefined)?.scores?.find(x => x.ability === 'str')?.min)
function setStr(v: string) {
  const n = Number(v) || 0, r = { ...((f.value.requirements as Record<string, unknown> | undefined) ?? {}) } as { scores?: { ability: string; min: number }[] }
  const others = (r.scores ?? []).filter(x => x.ability !== 'str')
  r.scores = n ? [...others, { ability: 'str', min: n }] : others
  if (!r.scores.length) delete r.scores
  if (Object.keys(r).length) f.value.requirements = r; else delete f.value.requirements
  changed(props.entry)
}

// ---- when it works, and its charges coming back ----
const WHEN = [{ id: 'carried', label: 'carried' }, { id: 'equipped', label: 'equipped (worn or wielded)' }, { id: 'attuned', label: 'attuned' }]
const worksDefault = computed(() => worksWhileOf({ ...props.entry, fields: { ...props.entry.fields, worksWhile: undefined } } as Entry))
const regain = computed<Regain>(() => (f.value.regain as Regain | undefined) ?? {})
function setRegain(p: Partial<Regain>) {
  const n: Regain = { ...regain.value, ...p }
  if (!n.amount?.trim()) delete n.amount
  if (!n.when) delete n.when
  if (Object.keys(n).length) f.value.regain = n; else delete f.value.regain
  changed(props.entry)
}
function setCharges(v: string) { const n = Number(v); if (n > 0) f.value.charges = n; else delete f.value.charges; changed(props.entry) }
/** The written "regains" read as an amount and a time ("1d6 + 1 at dawn"), when it reads as one. */
const parsed = computed<Regain | undefined>(() => parseRegain(String(f.value.recharge ?? '')))
/** Spells cast for charges, while the item has none. */
const needsCharges = computed(() => ((f.value.spells as { how: string }[] | undefined) ?? []).some(x => x.how === 'charges'))
function useParsed() { if (parsed.value) { f.value.regain = parsed.value; delete f.value.recharge; changed(props.entry) } }
</script>

<template>
  <div class="item-form">
    <section class="if-section">
      <h4>Basics</h4>
      <div class="if-grid">
        <label v-for="d in short(basics)" :key="d.key" class="sheet-field" :class="'k-' + d.kind"><span>{{ d.label }}</span><FieldInput :def="d" :entry="entry" /></label>
        <label class="sheet-field"><span>Rarity</span>
          <Dropdown :value="String(f.rarity ?? '')" @change="setRarity(val($event))">
            <option value="">—</option>
            <!-- the world's rarities (the Lists page) -->
            <option v-for="r in listOptions('item.rarity')" :key="r.id" :value="r.id">{{ r.label }}</option>
          </Dropdown>
          <small v-if="usualPrice" class="muted">usual price {{ formatMoney(usualPrice) }}{{ consumable ? ' (consumable: half)' : '' }}</small>
          <small v-else-if="f.rarity === 'Artifact'" class="muted">priceless</small></label>
      </div>
      <!-- a basic that's a list of options: the spellcasting focus types it is -->
      <template v-for="d in wide(basics)" :key="d.key">
        <!-- a spellcasting focus is rare: a button until it's one (or the button's pressed) -->
        <button v-if="d.key === 'focus' && !focusShown" type="button" class="chip-btn if-focus-add" title="Make it an arcane focus, a druidic focus or a holy symbol" @click="focusOpen = true">＋ Spellcasting focus</button>
        <label v-else class="sheet-field if-wide" :class="'k-' + d.kind"><span>{{ d.label }}</span><FieldInput :def="d" :entry="entry" /></label>
      </template>
      <div v-if="bools(basics).length" class="chip-toggles if-bools">
        <button class="chip-toggle" v-for="d in bools(basics)" :key="d.key" type="button" :class="{ on: !!f[d.key] }" @click="toggleBool(d.key)">{{ d.label }}</button>
      </div>
    </section>

    <!-- an item that can be made but has no recipe yet: one button instead of an empty Crafting part and Recipe card -->
    <div v-if="groups.some(([g]) => g === 'Crafting') && !recipeShown(entry)" class="if-add">
      <button type="button" class="chip-btn" title="What it's made of, the tool it's made with, the crafting time and its effect" @click="openRecipe(entry)">＋ Recipe</button>
    </div>
    <section v-for="[g, ds] in groups.filter(([g]) => g !== 'Crafting' || recipeShown(entry))" :key="g" class="if-section">
      <h4>{{ g }}</h4>
      <div class="if-grid">
        <label v-for="d in short(ds)" :key="d.key" class="sheet-field" :class="'k-' + d.kind"><span>{{ d.label }}</span><FieldInput :def="d" :entry="entry" /></label>
        <!-- a weapon: damage, range and mastery with its base weapon's as defaults -->
        <template v-if="g === 'Weapon'">
          <label class="sheet-field"><span>Damage</span><input :value="String(f.damage ?? '')" :placeholder="base?.fields.damage ? `${base.fields.damage} (from ${base.name})` : 'e.g. 1d8'" @change="setText('damage', val($event))" /></label>
          <label v-if="ranged" class="sheet-field"><span>Range</span><input :value="String(f.range ?? '')" :placeholder="base?.fields.range ? `${base.fields.range} (from ${base.name})` : 'e.g. 80/320'" @change="setText('range', val($event))" /></label>
          <label class="sheet-field"><span>Mastery</span><FieldInput v-if="fieldOf('mastery')" :def="fieldOf('mastery')!" :entry="entry" />
            <small v-if="!f.mastery && baseMastery" class="muted">{{ baseMastery }} (from {{ f.baseWeapon }})</small></label>
        </template>
        <template v-if="g === 'Armor'">
          <label v-if="realArmor" class="sheet-field"><span>Armor class</span><input type="number" min="0" :value="f.armorClass ?? ''" :placeholder="f.armorType === 'Shield' ? 'e.g. 2' : 'e.g. 14'" @change="setNumber('armorClass', val($event))" /><small v-if="acHint" class="muted">{{ acHint }}</small></label>
          <label v-if="f.armorType === 'Heavy'" class="sheet-field"><span>Strength needed</span><input type="number" min="0" max="30" :value="strNeeded ?? ''" placeholder="e.g. 15" @change="setStr(val($event))" /><small class="muted">worn without it: −10 ft speed</small></label>
        </template>
      </div>
      <div v-if="g === 'Armor' && (realArmor || f.stealthDis)" class="chip-toggles if-bools">
        <button class="chip-toggle" type="button" :class="{ on: !!f.stealthDis }" title="Disadvantage on Stealth checks while worn" @click="toggleBool('stealthDis')">Stealth disadvantage</button>
      </div>
      <label v-for="d in wide(ds)" :key="d.key" class="sheet-field if-wide" :class="'k-' + d.kind"><span>{{ d.label }}</span><FieldInput :def="d" :entry="entry" /></label>
    </section>

    <div v-if="isGear" class="item-cols">
      <div class="ff-col ff-gives">
        <h4>What it gives</h4>
        <label class="cb-line small">Works while
          <Dropdown :value="String(f.worksWhile ?? '')" @change="setText('worksWhile', val($event))">
            <option value="">{{ WHEN.find(w => w.id === worksDefault)?.label }} (its kind's default)</option>
            <option v-for="w in WHEN" :key="w.id" :value="w.id">{{ w.label }}</option>
          </Dropdown></label>
        <section v-for="x in visible" :key="x.id" class="if-part">
          <h5>{{ x.label }} <span class="muted small">{{ x.hint }}</span> <button type="button" class="link-btn if-close" :title="has(x.id) ? `Remove the ${x.label.toLowerCase()}` : 'Hide this part'" @click="close(x.id)">✕</button></h5>
          <template v-if="x.id === 'spells'">
            <!-- one line: how many charges, how many come back and when -->
            <div class="if-charges small">
              <label>Charges <input type="number" min="0" :value="f.charges ?? ''" placeholder="—" @change="setCharges(val($event))" /></label>
              <template v-if="f.charges">
                <span class="muted">·</span>
                <label>regains <input class="if-amount" :value="regain.amount ?? ''" placeholder="1d6+1, 3, all" @change="setRegain({ amount: val($event) })" /></label>
                <Dropdown compact :value="regain.when ?? ''" aria-label="When" @change="setRegain({ when: (val($event) || undefined) as Regain['when'] })">
                  <option value="">when…</option><option value="dawn">at dawn</option><option value="long">on a long rest</option><option value="short">on a short rest</option><option value="never">never</option>
                </Dropdown>
              </template>
            </div>
            <!-- an older item's regains as written, until it's turned into the line above -->
            <p v-if="f.recharge" class="small if-written"><span class="muted">Written as</span> “{{ f.recharge }}”
              <button v-if="parsed && !regain.amount" type="button" class="link-btn small" :title="`Regains ${parsed.amount}, ${parsed.when}: the sheet gives them back (or asks for the roll) on that rest`" @click="useParsed">use it as Regains</button>
              <button type="button" class="link-btn small" title="Remove the written version" @click="setText('recharge', '')">×</button></p>
            <p v-if="needsCharges && !f.charges" class="small warn-text">Some spells cost charges: give the item its Charges.</p>
            <FieldInput v-if="fieldOf('spells')" :def="fieldOf('spells')!" :entry="entry" />
          </template>
          <template v-else>
            <div v-for="d in wide(partFields(x.id))" :key="d.key" class="if-wide"><FieldInput :def="d" :entry="entry" /></div>
          </template>
        </section>
        <AddPartsBar class="if-add" :parts="addable" :label="id => give(id).label" :title="id => give(id).hint" @add="open" />
      </div>
      <div class="ff-col ff-needs">
        <h4>What it needs</h4>
        <ItemNeeds :e="entry" />
      </div>
    </div>
  </div>
</template>
