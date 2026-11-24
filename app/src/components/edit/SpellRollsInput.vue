<script setup lang="ts">
// A spell's rolls on its Edit page, each a short sentence: what it rolls (damage of a type, healing or temporary hit
// points), the dice and whether the spellcasting modifier is added; then how it grows — a cantrip's dice at character
// levels 5, 11 and 17, or more dice per slot level above the spell's — and a note on when or to whom. Underneath, the
// roll as it reads in the Spellbook.
import Dropdown from '../Dropdown.vue'
import { computed } from 'vue'
import type { Entry, SpellRoll } from '../../model/types'
import { DAMAGE } from '../../model/schema'
import { growthText, rollText } from '../../spells'
import { ORD } from '../../model/dnd'
import { inputValue as val } from '../../dom'

const model = defineModel<SpellRoll[] | undefined>()
const props = defineProps<{ cantrip?: boolean; /** The spell (for its level, in the growth and preview). */ spell: Entry }>()
const list = computed(() => model.value ?? [])
const lvl = computed(() => Number(props.spell.fields.level) || 0)
function put(i: number, p: Partial<SpellRoll>) {
  const l = list.value.map(x => ({ ...x }))
  const r: SpellRoll = { ...l[i], ...p }
  if (r.kind !== 'damage') delete r.type
  for (const k of ['type', 'mod', 'cantrip', 'beams', 'slot', 'note'] as const) if (!r[k]) delete r[k]
  l[i] = r
  model.value = l
}
const add = () => { model.value = [...list.value, { kind: 'damage', dice: '1d6', ...(props.cantrip ? { cantrip: true } : {}) }] }
const remove = (i: number) => { const l = list.value.filter((_, k) => k !== i); model.value = l.length ? l : undefined }
/** How the roll reads, with how it grows: "8d6 fire · +1d6 per slot level above 3rd · half on a save". */
const preview = (r: SpellRoll) => [rollText(props.spell, r), growthText(props.spell, r), r.note].filter(Boolean).join(' · ')
</script>

<template>
  <div class="spell-rolls">
    <div v-for="(r, i) in list" :key="i" class="roll-card">
      <div class="roll-line">
        <Dropdown :value="r.kind" aria-label="What it rolls" @change="put(i, { kind: val($event) as SpellRoll['kind'] })">
          <option value="damage">Damage</option><option value="healing">Healing</option><option value="tempHp">Temp HP</option>
        </Dropdown>
        <input class="effect-value roll-dice" :value="r.dice" placeholder="2d10" aria-label="Dice" @change="put(i, { dice: val($event).trim() || '1d6' })" />
        <Dropdown v-if="r.kind === 'damage'" :value="r.type ?? ''" aria-label="Damage type" @change="put(i, { type: val($event) || undefined })">
          <option value="">any type</option>
          <option v-for="t in DAMAGE" :key="t" :value="t">{{ t }}</option>
        </Dropdown>
        <label class="small effect-check" title="Plus the caster's spellcasting ability modifier"><input type="checkbox" :checked="!!r.mod" @change="put(i, { mod: ($event.target as HTMLInputElement).checked })" /> + spellcasting modifier</label>
        <button type="button" class="link-btn roll-x" title="Remove this roll" @click="remove(i)">×</button>
      </div>
      <div class="roll-line small">
        <template v-if="cantrip || r.cantrip || r.beams">
          <!-- how a cantrip grows at character levels 5, 11 and 17: more dice (Fire Bolt), or more beams (Eldritch Blast) -->
          <Dropdown :value="r.beams ? 'beams' : r.cantrip ? 'dice' : ''" aria-label="How it grows" @change="val($event) === 'beams' ? put(i, { beams: r.beams || 'beam', cantrip: undefined }) : put(i, { cantrip: val($event) === 'dice' || undefined, beams: undefined })">
            <option value="dice">More dice at character levels 5, 11 and 17</option>
            <option value="beams">More of them at character levels 5, 11 and 17</option>
            <option value="">The same at every level</option>
          </Dropdown>
          <label v-if="r.beams" title="What one is called: 2 at level 5, 3 at 11, 4 at 17">called <input class="effect-value" :value="r.beams" placeholder="beam" @change="put(i, { beams: val($event).trim() || 'beam' })" /></label>
        </template>
        <label v-else>At higher levels: + <input class="effect-value roll-dice" :value="r.slot ?? ''" placeholder="1d6" @change="put(i, { slot: val($event).trim() || undefined })" /> per slot level above {{ ORD[lvl] || 'its level' }}</label>
        <input class="effect-text" :value="r.note ?? ''" placeholder="note, e.g. half on a save" aria-label="Note" @change="put(i, { note: val($event).trim() || undefined })" />
      </div>
      <div class="muted small roll-preview">Reads: <b>{{ preview(r) }}</b></div>
    </div>
    <button type="button" class="chip-btn" @click="add">+ Roll</button>
  </div>
</template>
