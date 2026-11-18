<script setup lang="ts">
// A character's attacks (from what they wield) with their spellcasting numbers beside them, and their proficiencies:
// beside the sheet between Equipped and the inventory. Read-only: these are set on the character's Edit page.
import { computed, ref } from 'vue'
import type { Entry, Id } from '../model/types'
import { byType, listOptions } from '../store'
import { attacks, blankSheet, castingAbility, levelOf, mod, profBonus, profsOf, sheetOf, signed } from '../sheet'
import { hrefTab } from '../router'
import ProfChips from './ProfChips.vue'
import ItemModal from './ItemModal.vue'

const props = defineProps<{ pc: Entry }>()
const s = computed(() => sheetOf(props.pc) ?? blankSheet())
const prof = computed(() => profBonus(levelOf(props.pc)))
const atks = computed(() => attacks(s.value, prof.value))
const cast = computed(() => castingAbility(props.pc, s.value))
const castMod = computed(() => (cast.value ? mod(s.value.abilities[cast.value]) : 0))
const profs = computed(() => profsOf(s.value))
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
        <table v-if="atks.length" class="cs-attacks">
          <tr v-for="a in atks" :key="a.id">
            <td><button class="link-btn cs-item" @click="shown = a.id">{{ a.name }}</button><span v-if="a.untrained" class="cs-untrained" title="Not proficient with this weapon: no proficiency bonus to hit"> ⚠</span></td>
            <td><b>{{ signed(a.toHit) }}</b></td>
            <td>{{ a.damage }} <span class="muted small">{{ a.type }}</span></td>
          </tr>
        </table>
        <p v-else class="muted small">Equip a weapon to see its attack here.</p>
      </div>
      <div class="atk-spell">
        <h3>Spells</h3>
        <template v-if="cast">
          <div class="atk-spell-row"><span>{{ cast.toUpperCase() }}</span><b>{{ signed(castMod) }}</b></div>
          <div class="atk-spell-row"><span>Save DC</span><b>{{ 8 + prof + castMod }}</b></div>
          <div class="atk-spell-row"><span>Attack</span><b>{{ signed(prof + castMod) }}</b></div>
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
