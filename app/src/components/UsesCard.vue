<script setup lang="ts">
// On the play sheet, beside hit points and hit dice: every limited use the character has from their classes, species,
// background and feats (Second Wind, Rage, Breath Weapon…), one row each with its pips (or − / ＋ for a pool), so the
// table doesn't have to scroll to the features to tick one off. Rests give them back.
import { useReadOnly } from '../composables/useReadOnly'
import { computed } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { editSheet } from '../sheetData'
import { score } from '../sheet'
import { state } from '../store'
import { isPool, sourceTag, speciesTraits, spendUse, usesLeft, usesMax, useReminder, type ActiveTrait } from '../species'
import { noteUndo, restoreSheet, snapSheet } from '../undoNote'
import { chargesLeft, itemsInUse, regainText, setCharges } from '../items'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
const rows = computed(() => speciesTraits(props.pc, props.s).filter(a => a.active && usesMax(props.pc, a, props.s, score) > 0))
const max = (a: ActiveTrait) => usesMax(props.pc, a, props.s, score)
const left = (a: ActiveTrait) => usesLeft(props.pc, props.s, a, score)
// spending one says what the feature does (it isn't done for the player: they roll and type), with Undo
function use(a: ActiveTrait, n: number) {
  if (ro.value) return
  const before = snapSheet(props.pc)
  editSheet(props.pc, x => spendUse(x, props.pc, a, n, score))
  if (n > 0 && !isPool(a)) noteUndo(useReminder(a), restoreSheet(props.pc, before))
}
/** The charges of the items in use (a staff, a wand), spent and given back here as on the Inventory tab. */
const charged = computed(() => itemsInUse(props.s).map(({ l, i, item }) => ({ i, name: item.name, max: Number(item.fields.charges) || 0, left: chargesLeft(l, item) ?? 0, recharge: regainText(item) || undefined })).filter(x => x.max > 0))
const charge = (i: number, n: number) => { if (!ro.value) editSheet(props.pc, x => setCharges(x, i, n)) }
const back = (a: ActiveTrait) => (a.trait.uses!.recharge === 'short' || (a.trait.uses!.shortFrom && a.level >= a.trait.uses!.shortFrom) ? 'short rest' : a.trait.uses!.shortBack ? `long rest, ${a.trait.uses!.shortBack} back on a short` : 'long rest')
</script>

<template>
  <div v-if="rows.length || charged.length" class="cs-hp cs-uses">
    <span class="cs-label">Uses</span>
    <div v-for="a in rows" :key="a.key" class="cs-use" :title="`${a.trait.name} (${sourceTag(a)}): back on a ${back(a)}`">
      <span class="cs-use-name">{{ a.trait.name }}</span>
      <span class="sp-uses">
        <template v-if="max(a) <= 10 && !isPool(a)">
          <button v-for="p in max(a)" :key="p" class="pip" :class="{ on: p <= left(a) }" :disabled="ro" :title="p <= left(a) ? 'Use it' : 'Get it back'" @click="use(a, p <= left(a) ? 1 : -1)" />
        </template>
        <template v-else>
          <button class="chip-btn" :disabled="ro || !left(a)" title="Use one" @click="use(a, 1)">−</button>
          <button class="chip-btn" :disabled="ro || left(a) >= max(a)" title="Get one back" @click="use(a, -1)">＋</button>
        </template>
        <span v-flash="left(a)" class="muted small">{{ left(a) }}/{{ max(a) }} · {{ back(a) }}</span>
      </span>
    </div>
    <div v-for="c in charged" :key="'c' + c.i" class="cs-use" :title="`${c.name}: charges${c.recharge ? `, regains ${c.recharge}` : ''}`">
      <span class="cs-use-name">{{ c.name }}</span>
      <span class="sp-uses">
        <template v-if="c.max <= 10">
          <button v-for="p in c.max" :key="p" class="pip" :class="{ on: p <= c.left }" :disabled="ro" :title="p <= c.left ? 'Spend a charge' : 'Get a charge back'" @click="charge(c.i, p <= c.left ? c.left - 1 : c.left + 1)" />
        </template>
        <template v-else>
          <button class="chip-btn" :disabled="ro || !c.left" title="Spend a charge" @click="charge(c.i, c.left - 1)">−</button>
          <button class="chip-btn" :disabled="ro || c.left >= c.max" title="Get a charge back" @click="charge(c.i, c.left + 1)">＋</button>
        </template>
        <span v-flash="c.left" class="muted small">{{ c.left }}/{{ c.max }} charges</span>
      </span>
    </div>
  </div>
</template>
