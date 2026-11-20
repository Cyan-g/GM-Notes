<script setup lang="ts">
// A spell's rolls on its Edit page, one row each: damage (of a type), healing or temporary hit points, the dice, plus
// the spellcasting modifier, how it grows (a cantrip's dice at levels 5, 11, 17, or dice per slot level above), and a
// note on when or to whom.
import { computed } from 'vue'
import type { SpellRoll } from '../../model/types'
import { DAMAGE } from '../../model/schema'

const model = defineModel<SpellRoll[] | undefined>()
const props = defineProps<{ cantrip?: boolean }>()
const list = computed(() => model.value ?? [])
function put(i: number, p: Partial<SpellRoll>) {
  const l = list.value.map(x => ({ ...x }))
  const r: SpellRoll = { ...l[i], ...p }
  if (r.kind !== 'damage') delete r.type
  for (const k of ['type', 'mod', 'cantrip', 'slot', 'note'] as const) if (!r[k]) delete r[k]
  l[i] = r
  model.value = l
}
const add = () => { model.value = [...list.value, { kind: 'damage', dice: '1d6', ...(props.cantrip ? { cantrip: true } : {}) }] }
const remove = (i: number) => { const l = list.value.filter((_, k) => k !== i); model.value = l.length ? l : undefined }
const val = (ev: Event) => (ev.target as HTMLInputElement | HTMLSelectElement).value
</script>

<template>
  <div class="effects-input spell-rolls">
    <div v-for="(r, i) in list" :key="i" class="effect-row">
      <select :value="r.kind" aria-label="What it rolls" @change="put(i, { kind: val($event) as SpellRoll['kind'] })">
        <option value="damage">Damage</option><option value="healing">Healing</option><option value="tempHp">Temp HP</option>
      </select>
      <input class="effect-value roll-dice" :value="r.dice" placeholder="2d10" aria-label="Dice" @change="put(i, { dice: val($event).trim() || '1d6' })" />
      <select v-if="r.kind === 'damage'" :value="r.type ?? ''" aria-label="Damage type" @change="put(i, { type: val($event) || undefined })">
        <option value="">any type</option>
        <option v-for="t in DAMAGE" :key="t" :value="t">{{ t }}</option>
      </select>
      <label class="small effect-check" title="Plus the caster's spellcasting ability modifier"><input type="checkbox" :checked="!!r.mod" @change="put(i, { mod: ($event.target as HTMLInputElement).checked })" /> + modifier</label>
      <label v-if="props.cantrip || r.cantrip" class="small effect-check" title="A cantrip's dice: twice at level 5, three times at 11, four times at 17"><input type="checkbox" :checked="!!r.cantrip" @change="put(i, { cantrip: ($event.target as HTMLInputElement).checked })" /> grows at 5/11/17</label>
      <label v-else class="small" title="Added for each slot level above the spell's, e.g. 1d6">per slot above <input class="effect-value roll-dice" :value="r.slot ?? ''" placeholder="1d6" @change="put(i, { slot: val($event).trim() || undefined })" /></label>
      <input class="effect-text" :value="r.note ?? ''" placeholder="note, e.g. half on a save" aria-label="Note" @change="put(i, { note: val($event).trim() || undefined })" />
      <button type="button" class="link-btn" title="Remove" @click="remove(i)">×</button>
    </div>
    <button type="button" class="chip-btn" @click="add">+ Roll</button>
  </div>
</template>
