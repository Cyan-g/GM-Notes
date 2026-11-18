<script setup lang="ts">
// A player character's sheet, filled in right here: scores, proficiencies, HP, inventory and features.
// (In player mode the inventory sits beside the sheet, under the Equipped card.)
// Modifiers, saves, skills, AC, attacks and spellcasting are worked out from them.
// Play view changes only what changes at the table (HP, hit dice, inspiration, inventory); "✎ Edit sheet" also
// opens what's set when building the character: level, max HP, hit die, AC, speed, scores, proficiencies,
// spellcasting and features.
import { computed, ref } from 'vue'
import type { CharacterSheet, Entry, Proficiencies } from '../model/types'
import { byType, listOptions, playerMode, setList, state } from '../store'
import { changed } from '../edit'
import { ui } from '../ui'
import {
  ABILITIES, SKILLS, armorClass, attacks, blankSheet, canAttune, canEquip, castingAbility, levelOf, mod, passivePerception,
  profBonus, profsOf, profsToEdit, saveBonus, sheetOf, sheetToEdit, signed, skillBonus, currentPc, setCurrent, type Ability,
} from '../sheet'
import InventoryCard from './InventoryCard.vue'
import ProfChips from './ProfChips.vue'
import ItemModal from './ItemModal.vue'

const props = defineProps<{ pc: Entry }>()
const ro = computed(() => !!state.readOnly)
/** Build-time parts are locked unless the sheet is being edited. */
const build = computed(() => ui.sheetEdit && !ro.value)
const locked = computed(() => !build.value)
/** The stored sheet, or a blank one until the first change stores it. */
const s = computed<CharacterSheet>(() => sheetOf(props.pc) ?? blankSheet())
const level = computed(() => levelOf(props.pc))
const prof = computed(() => profBonus(level.value))
const ac = computed(() => armorClass(s.value))
const atks = computed(() => attacks(s.value, prof.value))
const cast = computed(() => castingAbility(props.pc, s.value))
const castMod = computed(() => (cast.value ? mod(s.value.abilities[cast.value]) : 0))

function edit(fn: (s: CharacterSheet) => void) {
  if (ro.value) return
  fn(sheetToEdit(props.pc))
  changed(props.pc)
}
const num = (ev: Event) => { const v = (ev.target as HTMLInputElement).value.trim(); return v === '' ? undefined : Number(v) }
const text = (ev: Event) => (ev.target as HTMLInputElement).value.trim() || undefined
function setLevel(ev: Event) {
  if (locked.value) return
  const v = num(ev)
  if (v == null) delete props.pc.fields.level; else props.pc.fields.level = Math.min(20, Math.max(1, Math.round(v)))
  changed(props.pc)
}

const toggleSave = (a: Ability) => build.value && edit(x => { x.saves = x.saves.includes(a) ? x.saves.filter(y => y !== a) : [...x.saves, a] })
/** Skill proficiency cycles: none → proficient → expertise → none. */
const cycleSkill = (name: string) => build.value && edit(x => {
  const v = x.skills[name]
  if (!v) x.skills[name] = 1; else if (v === 1) x.skills[name] = 2; else delete x.skills[name]
})
const skillsOf = (a: Ability) => SKILLS.filter(sk => sk.ability === a)
const skillMark = (name: string) => ({ 1: '●', 2: '◉' } as Record<number, string>)[s.value.skills[name] ?? 0] ?? '○'

/** Damage or healing typed into the HP box: "-7" or "+5"; temp HP soaks damage first. */
function hit(ev: Event) {
  const input = ev.target as HTMLInputElement
  const n = Number(input.value)
  input.value = ''
  if (!n) return
  edit(x => {
    let hp = x.hp ?? x.maxHp ?? 0
    if (n < 0) {
      let dmg = -n
      const soak = Math.min(x.tempHp ?? 0, dmg)
      if (soak) { x.tempHp = (x.tempHp ?? 0) - soak || undefined; dmg -= soak }
      hp = Math.max(0, hp - dmg)
    } else hp = x.maxHp != null ? Math.min(x.maxHp, hp + n) : hp + n
    x.hp = hp
  })
}
const longRest = () => edit(x => { x.hp = x.maxHp; x.tempHp = undefined; x.hitDiceUsed = Math.max(0, (x.hitDiceUsed ?? 0) - Math.max(1, Math.floor(level.value / 2))) || undefined })

// ---- items in the attack lines open in a pop-up ----
const shown = ref<number | null>(null)
const shownLine = computed(() => (shown.value != null ? s.value.inventory[shown.value] : undefined))
const showItem = (id: string) => { const i = s.value.inventory.findIndex(l => l.item === id); if (i >= 0) shown.value = i }
const isCurrent = computed(() => currentPc.value?.id === props.pc.id)

// ---- proficiencies: picked from the lists items use, so attacks, armor and the Workbench can check them ----
const profs = computed(() => profsOf(s.value))
// Clothing needs no proficiency, so it isn't offered.
const armorTypes = computed(() => listOptions('item.armorType').filter(o => o.id !== 'Clothing'))
const tools = computed(() => (byType.value.get('item') ?? []).filter(e => e.fields.kind === 'Tool').map(e => ({ id: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label)))
/** A language typed on the sheet that isn't in the list yet is added to it. */
function newLanguage(label: string) {
  const l = listOptions('language')
  if (!l.some(o => o.id === label)) setList('language', [...l, { id: label, label }])
  return label
}
const setProfs = (k: Exclude<keyof Proficiencies, 'other'>, v: string[]) => edit(x => { profsToEdit(x)[k] = v })

// ---- features ----
const addFeature = () => edit(x => { x.features.push({ name: '', text: '' }) })
const castLabel = computed(() => (s.value.spellAbility ? s.value.spellAbility.toUpperCase() : cast.value ? `${cast.value.toUpperCase()} (class)` : 'None'))
const SKILL_LEVEL: Record<number, string> = { 1: 'Proficient', 2: 'Expertise' }
</script>

<template>
  <div class="char-sheet" :class="{ ro, building: build }">
    <div class="cs-current">
      <button class="chip-toggle" :class="{ on: isCurrent }" :disabled="ro"
              :title="isCurrent ? 'The Spellbook, Workbench and Character menu use this character' : 'Use this character in the Spellbook, Workbench and Character menu'"
              @click="setCurrent(isCurrent ? undefined : pc.id)">{{ isCurrent ? '★ Current character' : '☆ Make current character' }}</button>
      <template v-if="isCurrent"><a href="#/spellbook" class="small">Spellbook →</a><a href="#/crafting" class="small">Workbench →</a></template>
      <button v-if="!ro" class="chip-toggle cs-edit-toggle" :class="{ on: ui.sheetEdit }"
              :title="ui.sheetEdit ? 'Back to the sheet for play' : 'Change scores, proficiencies, features and other things set when building the character'"
              @click="ui.sheetEdit = !ui.sheetEdit">{{ ui.sheetEdit ? '✓ Done editing' : '✎ Edit sheet' }}</button>
    </div>
    <!-- the strip at the top: the numbers looked at most -->
    <div class="cs-strip">
      <label class="cs-stat"><span>Level</span><input type="number" min="1" max="20" :value="pc.fields.level ?? ''" placeholder="1" :disabled="locked" @change="setLevel" /></label>
      <div class="cs-stat"><span>Proficiency</span><b>{{ signed(prof) }}</b></div>
      <div class="cs-stat cs-ac" :class="{ warn: ac.untrained.length }" :title="`From ${ac.from}` + (ac.untrained.length ? `\nNot proficient with ${ac.untrained.join(', ')}: disadvantage on STR and DEX rolls, no spellcasting` : '')"><span>Armor class<template v-if="ac.untrained.length"> ⚠</template></span><b>{{ ac.ac }}</b>
        <input v-if="build" class="cs-mini" type="number" :value="s.acOverride ?? ''" placeholder="auto" title="Type an AC to use instead of the worked-out one" @change="edit(x => x.acOverride = num($event))" /></div>
      <div class="cs-stat"><span>Initiative</span><b>{{ signed(mod(s.abilities.dex) + (s.initBonus ?? 0)) }}</b></div>
      <label class="cs-stat"><span>Speed</span><input :value="s.speed ?? ''" placeholder="30 ft" :disabled="locked" @change="edit(x => x.speed = text($event))" /></label>
      <div class="cs-stat"><span>Passive perception</span><b>{{ passivePerception(s, prof) }}</b></div>
      <button class="cs-stat cs-insp" :class="{ on: s.inspiration }" :disabled="ro" title="Inspiration" @click="edit(x => x.inspiration = !x.inspiration || undefined)"><span>Inspiration</span><b>{{ s.inspiration ? '★' : '☆' }}</b></button>
    </div>

    <div class="cs-hp">
      <div class="cs-hp-main">
        <span class="cs-label">Hit points</span>
        <div class="cs-hp-row">
          <input class="cs-hp-now" type="number" :value="s.hp ?? s.maxHp ?? ''" :disabled="ro" title="Current HP" @change="edit(x => x.hp = num($event))" />
          <span class="muted">/</span>
          <input type="number" :value="s.maxHp ?? ''" :placeholder="build ? 'max' : '—'" :disabled="locked" title="Maximum HP" @change="edit(x => x.maxHp = num($event))" />
          <span class="muted small">temp</span>
          <input type="number" :value="s.tempHp ?? ''" placeholder="0" :disabled="ro" title="Temporary HP" @change="edit(x => x.tempHp = num($event) || undefined)" />
        </div>
        <div v-if="s.maxHp" class="cs-hp-bar"><i :style="{ width: Math.min(100, Math.round(100 * (s.hp ?? s.maxHp) / s.maxHp)) + '%' }" /></div>
      </div>
      <label class="cs-hp-change"><span class="cs-label">Damage / heal</span><input placeholder="−7 or +5" :disabled="ro" @keydown.enter="hit" @change="hit" /></label>
      <div class="cs-hitdice">
        <span class="cs-label">Hit dice</span>
        <div class="cs-hp-row">
          <input type="number" min="0" :max="level" :value="level - (s.hitDiceUsed ?? 0)" :disabled="ro" title="Hit dice left" @change="edit(x => x.hitDiceUsed = Math.max(0, level - (num($event) ?? level)) || undefined)" />
          <span class="muted">/ {{ level }}</span>
          <input class="cs-die" :value="s.hitDie ?? ''" :placeholder="build ? 'd8' : ''" :disabled="locked" @change="edit(x => x.hitDie = text($event))" />
        </div>
      </div>
      <button class="cs-rest" :disabled="ro" title="Full HP, no temp HP, half your hit dice back" @click="longRest">Long rest</button>
    </div>

    <div class="cs-grid">
      <!-- one card per ability: score, modifier, saving throw and the skills that use it -->
      <section class="cs-abilities">
        <div v-for="a in ABILITIES" :key="a.key" class="cs-ability">
          <div class="cs-ab-head">
            <span class="cs-short" :title="a.label">{{ a.short }}</span>
            <b class="cs-mod">{{ signed(mod(s.abilities[a.key])) }}</b>
            <input type="number" min="1" max="30" :value="s.abilities[a.key]" :disabled="locked" :title="`${a.label} score`" @change="edit(x => x.abilities[a.key] = num($event) ?? 10)" />
          </div>
          <button class="cs-skill cs-save" :class="{ on: s.saves.includes(a.key) }" :disabled="locked" :title="build ? `${a.label} saving throw: click for proficiency` : `${a.label} saving throw`" @click="toggleSave(a.key)">
            <span class="cs-dot">{{ s.saves.includes(a.key) ? '●' : '○' }}</span><b>{{ signed(saveBonus(s, a.key, prof)) }}</b><span>Saving throw</span>
          </button>
          <button v-for="sk in skillsOf(a.key)" :key="sk.name" class="cs-skill" :class="{ on: s.skills[sk.name] }" :disabled="locked" :title="build ? 'Click: proficient, expertise, none' : SKILL_LEVEL[s.skills[sk.name] ?? 0] ?? ''" @click="cycleSkill(sk.name)">
            <span class="cs-dot">{{ skillMark(sk.name) }}</span><b>{{ signed(skillBonus(s, sk.name, prof)) }}</b><span>{{ sk.name }}</span>
          </button>
        </div>
      </section>

      <!-- attacks, spellcasting, proficiencies -->
      <section class="cs-side">
        <h4>Attacks</h4>
        <table v-if="atks.length" class="cs-attacks">
          <tr v-for="a in atks" :key="a.id"><td><button class="link-btn cs-item" @click="showItem(a.id)">{{ a.name }}</button><span v-if="a.untrained" class="cs-untrained" title="Not proficient with this weapon: no proficiency bonus to hit"> ⚠</span></td><td><b>{{ signed(a.toHit) }}</b></td><td>{{ a.damage }} <span class="muted small">{{ a.type }}</span></td></tr>
        </table>
        <p v-else class="muted small">Equip a weapon in the inventory to see its attack here.</p>

        <h4>Spellcasting</h4>
        <div class="cs-cast">
          <select v-if="build" :value="s.spellAbility ?? ''" @change="edit(x => x.spellAbility = (($event.target as HTMLSelectElement).value || undefined) as Ability | undefined)">
            <option value="">{{ cast && !s.spellAbility ? `${cast.toUpperCase()} (class)` : 'None' }}</option>
            <option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.short }}</option>
          </select>
          <span v-else>{{ castLabel }}</span>
          <template v-if="cast"><span>Save DC <b>{{ 8 + prof + castMod }}</b></span><span>Attack <b>{{ signed(prof + castMod) }}</b></span></template>
          <a href="#/spellbook" class="small">Spellbook →</a>
        </div>

        <h4>Proficiencies &amp; languages</h4>
        <div class="cs-profs">
          <ProfChips label="Armor" :values="profs.armor" :toggles="armorTypes" :disabled="locked" @change="setProfs('armor', $event)" />
          <ProfChips label="Weapons" :values="profs.weapons" :toggles="listOptions('item.weaponCategory')" :suggest="listOptions('item.baseWeapon')" placeholder="Add a weapon…" :disabled="locked" @change="setProfs('weapons', $event)" />
          <ProfChips label="Tools" :values="profs.tools" :suggest="tools" placeholder="Add a tool…" :disabled="locked" @change="setProfs('tools', $event)" />
          <ProfChips label="Languages" :values="profs.languages" :suggest="listOptions('language')" :create="newLanguage" placeholder="Add a language…" :disabled="locked" @change="setProfs('languages', $event)" />
          <textarea v-if="build" rows="2" :value="profs.other ?? ''" placeholder="Anything else" @change="edit(x => profsToEdit(x).other = text($event))" />
          <p v-else-if="profs.other" class="cs-other">{{ profs.other }}</p>
        </div>
      </section>
    </div>

    <!-- inventory (in player mode it sits beside the sheet instead) -->
    <InventoryCard v-if="!playerMode" :pc="pc" />

    <!-- features and traits -->
    <section class="cs-features">
      <h4>Features &amp; traits <button v-if="build" class="link-btn" @click="addFeature">＋ Add</button></h4>
      <template v-if="build">
        <div v-for="(f, i) in s.features" :key="i" class="cs-feature">
          <input :value="f.name" placeholder="Name, e.g. Bardic Inspiration (d6)" @change="edit(x => x.features[i].name = ($event.target as HTMLInputElement).value)" />
          <textarea rows="2" :value="f.text" placeholder="What it does" @change="edit(x => x.features[i].text = ($event.target as HTMLTextAreaElement).value)" />
          <button class="link-btn" title="Remove" @click="edit(x => x.features.splice(i, 1))">✕</button>
        </div>
      </template>
      <dl v-else-if="s.features.length" class="cs-feature-list">
        <template v-for="(f, i) in s.features" :key="i"><dt>{{ f.name }}</dt><dd>{{ f.text }}</dd></template>
      </dl>
      <p v-if="!s.features.length" class="muted small">Class features, racial traits, feats<template v-if="!build && !ro">: add them with ✎ Edit sheet</template>.</p>
    </section>
    <ItemModal v-if="shownLine?.item" :id="shownLine.item" @close="shown = null">
      <template #actions>
        <span class="muted small">× {{ shownLine.qty }}</span>
        <button v-if="canEquip(shownLine)" class="chip-toggle" :class="{ on: shownLine.equipped }" :disabled="ro" @click="edit(x => x.inventory[shown!].equipped = !shownLine!.equipped || undefined)">{{ shownLine.equipped ? 'Equipped' : 'Equip' }}</button>
        <button v-if="canAttune(shownLine)" class="chip-toggle" :class="{ on: shownLine.attuned }" :disabled="ro" @click="edit(x => x.inventory[shown!].attuned = !shownLine!.attuned || undefined)">{{ shownLine.attuned ? 'Attuned' : 'Attune' }}</button>
      </template>
    </ItemModal>
  </div>
</template>
