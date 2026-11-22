<script setup lang="ts">
// On a class's page, above its features: the basics (hit die, saves, proficiencies, skills, spellcasting), the class's
// progression table level by level (proficiency bonus, the features of each level, the counts that grow such as
// invocations or Rage damage, cantrips, prepared spells and spell slots), and its subclasses with a way to add one.
import { computed } from 'vue'
import type { Entry, Trait } from '../model/types'
import { basicsOf, ownBasics } from '../classRules'
import { classSlotsAt } from '../slots'
import { byType, get, playerMode, state } from '../store'
import { traitsOf } from '../model/traits'
import { ABILITY_SHORT, ORD, profBonus } from '../model/dnd'
import { newBlankEntry } from '../ui'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ e: Entry }>()
const cls = computed(() => String(props.e.fields.class ?? props.e.name))
const b = computed(() => basicsOf(cls.value))
const traits = computed(() => traitsOf(props.e))
const subclasses = computed(() => (byType.value.get('subclass') ?? []).filter(s => s.fields.class === cls.value).sort((x, y) => x.name.localeCompare(y.name)))
/** Levels at which a subclass of this class brings features. */
const subLevels = computed(() => new Set(subclasses.value.flatMap(s => traitsOf(s).map(t => t.level ?? 1))))

const CASTER: Record<string, string> = { full: 'full caster', half: 'half caster', third: 'third caster', pact: 'Pact Magic', artificer: 'artificer (half, rounded up)' }
const basicsLine = computed(() => [
  `Hit die ${b.value.hitDie}`,
  b.value.saves?.length && `Saves ${b.value.saves.map(a => ABILITY_SHORT[a]).join(', ')}`,
  b.value.armor?.length && `Armor ${b.value.armor.join(', ')}`,
  b.value.weapons?.length && `Weapons ${b.value.weapons.join(', ')}`,
  b.value.tools?.length && `Tools ${b.value.tools.map(t => get(t)?.name ?? t).join(', ')}`,
  b.value.skills && `Skills: ${b.value.skills.count} ${b.value.skills.from.length ? `from ${b.value.skills.from.join(', ')}` : 'of any'}`,
  b.value.caster && b.value.caster !== 'none' && `Spellcasting: ${CASTER[b.value.caster]}${b.value.casting ? `, ${ABILITY_SHORT[b.value.casting]}` : ''}`,
  `Subclass at level ${b.value.subclassLevel}`,
].filter(Boolean) as string[])

// ---- the progression table ----
const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1)
const at = <T,>(steps: [number, T][], l: number) => steps.filter(([x]) => x <= l).at(-1)?.[1]
/** Columns for what grows by level: choices with counts by level (Invocations), scaling values (Rage Damage), uses. */
const growing = computed(() => traits.value.flatMap((t: Trait) => [
  ...(t.choice?.steps?.length ? [{ key: t.id + 'c', label: t.name, value: (l: number) => (l >= (t.level ?? 1) ? at(t.choice!.steps!, l) ?? '' : '') }] : []),
  ...(t.scale?.steps?.length ? [{ key: t.id + 's', label: t.scale.label || t.name, value: (l: number) => at(t.scale!.steps, l) ?? '' }] : []),
  ...(t.uses?.steps?.length ? [{ key: t.id + 'u', label: `${t.name} uses`, value: (l: number) => (l >= (t.level ?? 1) ? at(t.uses!.steps!, l) ?? '' : '') }] : []),
  // uses equal to the class level (Focus Points, Sorcery Points)
  ...(!t.uses?.steps?.length && t.uses?.count === 'level' ? [{ key: t.id + 'u', label: `${t.name} uses`, value: (l: number) => (l >= (t.level ?? 1) ? l * (t.uses!.times ?? 1) : '') }] : []),
]))
const casts = computed(() => b.value.caster && b.value.caster !== 'none')
const pact = computed(() => b.value.caster === 'pact')
/** Slot columns up to the highest spell level the class reaches. */
const slotLevels = computed(() => {
  if (!casts.value || pact.value) return []
  const top = Math.max(0, ...classSlotsAt(b.value.caster!, 20).slots.map((n, i) => (n ? i + 1 : 0)))
  return Array.from({ length: top }, (_, i) => i)
})
// each level's features; a feat level (Ability Score Improvement) is listed at every one, not only the first
const ASI = 'Ability Score Improvement'
const features = (l: number) => {
  const names = traits.value.filter(t => (t.level ?? 1) === l).map(t => t.name)
  return b.value.featLevels?.includes(l) && !names.some(n => n.toLowerCase() === ASI.toLowerCase()) && l < 19 ? [...names, ASI] : names
}
/** A level whose features already name the subclass ("Fighter Subclass"): no "subclass feature" after it. */
const namesSubclass = (l: number) => features(l).some(n => /subclass/i.test(n))
const canAdd = computed(() => !state.readOnly && !playerMode.value)
</script>

<template>
  <section class="class-overview">
    <p class="small cb-summary">{{ basicsLine.join(' · ') }}<template v-if="ownBasics(cls)"> <span class="cb-tag changed" title="Some basics are set on this class's Edit page">changed</span></template></p>

    <details class="class-table-wrap" open>
      <summary><h2>{{ e.name }} progression</h2></summary>
      <div class="class-table-scroll">
        <table class="grid class-table">
          <thead><tr>
            <th>Level</th><th>PB</th><th class="ct-feat">Features</th>
            <th v-for="g in growing" :key="g.key">{{ g.label }}</th>
            <template v-if="casts"><th v-if="b.cantrips">Cantrips</th><th v-if="b.prepared">Prepared</th></template>
            <template v-if="pact"><th>Slots</th><th>Slot level</th></template>
            <th v-for="i in slotLevels" :key="i">{{ ORD[i + 1] }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="l in LEVELS" :key="l">
              <td>{{ l }}</td><td>+{{ profBonus(l) }}</td>
              <td class="ct-feat">{{ features(l).join(', ') }}<span v-if="subLevels.has(l) && !namesSubclass(l)" class="muted">{{ features(l).length ? ', ' : '' }}subclass feature</span><span v-if="!features(l).length && !subLevels.has(l)" class="muted">—</span></td>
              <td v-for="g in growing" :key="g.key">{{ g.value(l) }}</td>
              <template v-if="casts"><td v-if="b.cantrips">{{ b.cantrips[l - 1] ?? '' }}</td><td v-if="b.prepared">{{ b.prepared[l - 1] ?? '' }}</td></template>
              <template v-if="pact"><td>{{ classSlotsAt('pact', l).pact!.count }}</td><td>{{ ORD[classSlotsAt('pact', l).pact!.level] }}</td></template>
              <td v-for="i in slotLevels" :key="i">{{ classSlotsAt(b.caster!, l).slots[i] || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>

    <h2>Subclasses <span class="muted small">{{ subclasses.length }}</span></h2>
    <ul v-if="subclasses.length" class="class-subs">
      <li v-for="s in subclasses" :key="s.id"><EntryLink :id="s.id" icon /> <span class="muted small">features at level {{ [...new Set(traitsOf(s).map(t => t.level ?? 1))].sort((x, y) => x - y).join(', ') || '—' }}</span></li>
    </ul>
    <p v-else class="muted small">No subclasses for {{ e.name }} yet.</p>
    <button v-if="canAdd" type="button" class="chip-btn" @click="newBlankEntry('subclass', { class: cls })">＋ Subclass</button>
  </section>
</template>
