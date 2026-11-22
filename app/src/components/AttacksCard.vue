<script setup lang="ts">
// A character's attacks (from what they wield) with their spellcasting numbers beside them, and their proficiencies:
// beside the sheet between Equipped and the inventory. Read-only: these are set on the character's Edit page.
import AppIcon from './AppIcon.vue'
import { computed, ref } from 'vue'
import type { Entry, Id } from '../model/types'
import { byType, get, listOptions } from '../store'
import { attacks, castingAbility, levelOf, profsOf, spellDamageAdd, spellStats } from '../sheet'
import { sheetOrBlank } from '../sheetData'
import { mod, profBonus, signed, type Ability } from '../model/dnd'
import { speciesSpells } from '../species'
import { rollsLine, rollsOf } from '../spells'
import { hrefEntry } from '../router'
import { breakdown, gearTotals, scoreWith, sum } from '../effects'
import { hrefTab } from '../router'
import ProfChips from './ProfChips.vue'
import ItemModal from './ItemModal.vue'

const props = defineProps<{ pc: Entry }>()
const s = computed(() => sheetOrBlank(props.pc))
const prof = computed(() => profBonus(levelOf(props.pc)))
const atks = computed(() => attacks(s.value, prof.value))
const cast = computed(() => castingAbility(props.pc, s.value))
// Gear counts: a raised casting score, a +1 to spell attacks or the save DC (an Amulet of the Devout).
const gt = computed(() => gearTotals(s.value))
const castMod = computed(() => (cast.value ? mod(scoreWith(s.value, cast.value, gt.value)) : 0))
const dc = computed(() => 8 + prof.value + castMod.value + sum(gt.value.spellDC))
const spellAtk = computed(() => prof.value + castMod.value + sum(gt.value.spellAttack))
const profs = computed(() => profsOf(s.value))
/** Advantage or disadvantage on attack rolls from conditions (Poisoned, Invisible…), grouped by which. */
const rollMode = computed(() => (['adv', 'dis'] as const).flatMap(mode => {
  const from = (gt.value.attackMode ?? []).filter(x => x.mode === mode).map(x => x.from)
  return from.length ? [{ mode, from: from.join(', ') }] : []
}))
/** The character's damaging cantrips (in the spellbook or from features), with their attack or save DC and damage. */
const cantrips = computed(() => {
  const book = s.value.spellbook, ids = new Set([...(book?.known ?? []), ...(book?.prepared ?? []), ...(book?.always ?? [])])
  const own = [...ids].map(id => ({ id, ability: undefined as Ability | undefined }))
  const innate = speciesSpells(props.pc, s.value).filter(x => x.spell.how === 'atWill').map(x => ({ id: x.spell.spell, ability: x.spell.ability as Ability | undefined }))
  const seen = new Set<string>()
  return [...own, ...innate].flatMap(({ id, ability }) => {
    const e = get(id)
    if (!e || e.type !== 'spell' || e.fields.level !== 'Cantrip' || seen.has(id) || !rollsOf(e).some(r => r.kind === 'damage')) return []
    if (!['Attack', 'Saving throw'].includes(String(e.fields.spellType ?? ''))) return []
    seen.add(id)
    const st = ability ? spellStats(props.pc, ability) : undefined
    const atk = st?.attack ?? spellAtk.value, save = st?.dc ?? dc.value, m = ability ? mod(scoreWith(s.value, ability, gt.value)) : castMod.value
    const check = e.fields.spellType === 'Attack' ? signed(atk) : `DC ${save}`
    const tip = e.fields.spellType === 'Attack' ? `Spell attack${ability ? `, cast with ${ability.toUpperCase()}` : ''}` : `${String(e.fields.savingThrow ?? '').slice(0, 3).toUpperCase()} save${ability ? `, cast with ${ability.toUpperCase()}` : ''}`
    return [{ id, name: e.name, check, tip, rolls: rollsLine(e, { level: levelOf(props.pc), mod: m, add: spellDamageAdd(s.value, e) }) }]
  })
})
const armorTypes = computed(() => listOptions('item.armorType').filter(o => o.id !== 'Clothing'))
const tools = computed(() => (byType.value.get('item') ?? []).filter(e => e.fields.kind === 'Tool').map(e => ({ id: e.id, label: e.name })))
const shown = ref<Id | null>(null)
const none = (k: 'armor' | 'weapons' | 'tools' | 'languages') => !profs.value[k]?.length
</script>

<template>
  <div class="card attacks-card">
    <div class="atk-cols">
      <div>
        <h3>Attacks</h3>
        <p v-for="m in rollMode" :key="m.mode" class="small cs-roll-mode" :class="m.mode">{{ m.mode === 'adv' ? 'Advantage' : 'Disadvantage' }} on attack rolls ({{ m.from }})</p>
        <table v-if="atks.length" class="cs-attacks">
          <tr v-for="(a, i) in atks" :key="a.id + i" :class="{ 'atk-sub': a.noItem || a.tag?.startsWith('off-hand') || a.tag?.startsWith('bonus action') }">
            <td>
              <span v-if="a.noItem" class="cs-item-plain">{{ a.name }}</span>
              <button v-else class="link-btn cs-item" @click="shown = a.id">{{ a.name }}</button><span v-if="a.untrained" class="cs-untrained" title="Not proficient with this weapon: no proficiency bonus to hit"> <AppIcon ui="warning" /></span>
              <span v-if="a.mastery" class="chip atk-mastery tip" :data-tip="a.mastery.rule ? `${a.mastery.name}: ${a.mastery.rule}` : a.mastery.name">{{ a.mastery.name }}</span>
              <span v-if="a.tag" class="muted small"> · {{ a.tag }}</span>
            </td>
            <td><b v-flash="a.toHit" :class="{ 'gear-mod tip': a.gear }" :data-tip="a.gear">{{ signed(a.toHit) }}</b></td>
            <td><span v-flash="a.damage" class="atk-dmg">{{ a.damage }}</span> <span class="muted small">{{ a.type }}</span>
              <span v-for="(x, j) in a.extras ?? []" :key="j" class="atk-extra small">{{ x }}</span></td>
          </tr>
          <!-- cantrips that attack or force a save, at the character's level -->
          <tr v-for="c in cantrips" :key="'c' + c.id" class="atk-cantrip">
            <td><a :href="hrefEntry(c.id)" class="cs-item">{{ c.name }}</a> <span class="muted small">cantrip</span></td>
            <td><b class="tip" :data-tip="c.tip">{{ c.check }}</b></td>
            <td><span v-flash="c.rolls">{{ c.rolls }}</span></td>
          </tr>
        </table>
        <p v-else class="muted small">Equip a weapon to see its attack here.</p>
        <p v-if="atks.length <= 1" class="muted small">Weapons appear here once equipped (Inventory tab).</p>
      </div>
      <div class="atk-spell">
        <h3>Spells</h3>
        <template v-if="cast">
          <div class="atk-spell-row"><span>{{ cast.toUpperCase() }}</span><b v-flash="castMod">{{ signed(castMod) }}</b></div>
          <div class="atk-spell-row"><span>Save DC</span><b v-flash="dc" :class="{ 'gear-mod tip': gt.spellDC.length }" :data-tip="breakdown(`${dc - sum(gt.spellDC)} without gear`, gt.spellDC)">{{ dc }}</b></div>
          <div class="atk-spell-row"><span>Attack</span><b v-flash="spellAtk" :class="{ 'gear-mod tip': gt.spellAttack.length }" :data-tip="breakdown(`${signed(spellAtk - sum(gt.spellAttack))} without gear`, gt.spellAttack)">{{ signed(spellAtk) }}</b></div>
        </template>
        <p v-else class="muted small">No casting ability.</p>
        <a :href="hrefTab(pc.id, 'spellbook')" class="small">Spellbook →</a>
      </div>
    </div>

    <h3>Proficiencies &amp; languages</h3>
    <div class="cs-profs">
      <ProfChips label="Armor" :values="profs.armor" :toggles="armorTypes" disabled />
      <ProfChips label="Weapons" :values="profs.weapons" :toggles="listOptions('item.weaponCategory')" :suggest="listOptions('item.baseWeapon')" disabled />
      <ProfChips label="Tools" :values="profs.tools" :suggest="tools" disabled />
      <ProfChips label="Languages" :values="profs.languages" :suggest="listOptions('language')" disabled />
      <p v-if="profs.other" class="cs-other">{{ profs.other }}</p>
      <p v-if="none('armor') && none('weapons') && none('tools') && none('languages') && !profs.other" class="muted small">Set them on the character's ✎ Edit page.</p>
    </div>
    <ItemModal v-if="shown" :id="shown" @close="shown = null" />
  </div>
</template>
