<script setup lang="ts">
// A player character's sheet, filled in right here: scores, proficiencies, HP, inventory and features.
// Modifiers, saves, skills, AC, attacks and spellcasting are worked out from them.
import { computed } from 'vue'
import type { CharacterSheet, Entry, InventoryLine } from '../model/types'
import { formatMoney, get, state } from '../store'
import { changed } from '../edit'
import { hrefEntry } from '../router'
import {
  ABILITIES, SKILLS, armorClass, attacks, blankSheet, carried, castingAbility, levelOf, mod, passivePerception,
  profBonus, saveBonus, sheetOf, sheetToEdit, signed, skillBonus, currentPc, setCurrent, type Ability,
} from '../sheet'
import EntryLink from './EntryLink.vue'
import EntryPicker from './edit/EntryPicker.vue'
import MoneyInput from './edit/MoneyInput.vue'

const props = defineProps<{ pc: Entry }>()
const ro = computed(() => !!state.readOnly)
/** The stored sheet, or a blank one until the first change stores it. */
const s = computed<CharacterSheet>(() => sheetOf(props.pc) ?? blankSheet())
const level = computed(() => levelOf(props.pc))
const prof = computed(() => profBonus(level.value))
const ac = computed(() => armorClass(s.value))
const atks = computed(() => attacks(s.value, prof.value))
const cast = computed(() => castingAbility(props.pc, s.value))
const castMod = computed(() => (cast.value ? mod(s.value.abilities[cast.value]) : 0))
const weight = computed(() => carried(s.value))

function edit(fn: (s: CharacterSheet) => void) {
  if (ro.value) return
  fn(sheetToEdit(props.pc))
  changed(props.pc)
}
const num = (ev: Event) => { const v = (ev.target as HTMLInputElement).value.trim(); return v === '' ? undefined : Number(v) }
const text = (ev: Event) => (ev.target as HTMLInputElement).value.trim() || undefined
function setLevel(ev: Event) {
  if (ro.value) return
  const v = num(ev)
  if (v == null) delete props.pc.fields.level; else props.pc.fields.level = Math.min(20, Math.max(1, Math.round(v)))
  changed(props.pc)
}

const toggleSave = (a: Ability) => edit(x => { x.saves = x.saves.includes(a) ? x.saves.filter(y => y !== a) : [...x.saves, a] })
/** Skill proficiency cycles: none → proficient → expertise → none. */
const cycleSkill = (name: string) => edit(x => {
  const v = x.skills[name]
  if (!v) x.skills[name] = 1; else if (v === 1) x.skills[name] = 2; else delete x.skills[name]
})
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

// ---- inventory ----
const itemOf = (l: InventoryLine) => get(l.item)
const canEquip = (l: InventoryLine) => ['Weapon', 'Armor'].includes(String(itemOf(l)?.fields.kind ?? ''))
const canAttune = (l: InventoryLine) => !!itemOf(l)?.fields.attunement
const attunedCount = computed(() => s.value.inventory.filter(l => l.attuned).length)
function addItem(id: string) {
  edit(x => {
    const have = x.inventory.find(l => l.item === id)
    if (have) have.qty += 1; else x.inventory.push({ item: id, qty: 1 })
  })
}
const addNamed = () => edit(x => { x.inventory.push({ name: 'New thing', qty: 1 }) })
// Ingredients are the crafting pouch: listed apart, under the gear (the Workbench uses them).
const lines = computed(() => s.value.inventory.map((l, i) => ({ l, i })))
const gear = computed(() => lines.value.filter(x => itemOf(x.l)?.fields.kind !== 'Ingredient'))
const pouch = computed(() => lines.value.filter(x => itemOf(x.l)?.fields.kind === 'Ingredient'))
const isCurrent = computed(() => currentPc.value?.id === props.pc.id)

// ---- features ----
const addFeature = () => edit(x => { x.features.push({ name: '', text: '' }) })
</script>

<template>
  <div class="char-sheet" :class="{ ro }">
    <div class="cs-current">
      <button class="chip-toggle" :class="{ on: isCurrent }" :disabled="ro"
              :title="isCurrent ? 'The Spellbook, Workbench and Character menu use this character' : 'Use this character in the Spellbook, Workbench and Character menu'"
              @click="setCurrent(isCurrent ? undefined : pc.id)">{{ isCurrent ? '★ Current character' : '☆ Make current character' }}</button>
      <template v-if="isCurrent"><a href="#/spellbook" class="small">Spellbook →</a><a href="#/crafting" class="small">Workbench →</a></template>
    </div>
    <!-- the strip at the top: the numbers looked at most -->
    <div class="cs-strip">
      <label class="cs-stat"><span>Level</span><input type="number" min="1" max="20" :value="pc.fields.level ?? ''" placeholder="1" :disabled="ro" @change="setLevel" /></label>
      <div class="cs-stat"><span>Proficiency</span><b>{{ signed(prof) }}</b></div>
      <div class="cs-stat cs-ac" :title="`From ${ac.from}`"><span>Armor class</span><b>{{ ac.ac }}</b>
        <input class="cs-mini" type="number" :value="s.acOverride ?? ''" placeholder="auto" title="Type an AC to use instead of the worked-out one" :disabled="ro" @change="edit(x => x.acOverride = num($event))" /></div>
      <div class="cs-stat"><span>Initiative</span><b>{{ signed(mod(s.abilities.dex) + (s.initBonus ?? 0)) }}</b></div>
      <label class="cs-stat"><span>Speed</span><input :value="s.speed ?? ''" placeholder="30 ft" :disabled="ro" @change="edit(x => x.speed = text($event))" /></label>
      <div class="cs-stat"><span>Passive perception</span><b>{{ passivePerception(s, prof) }}</b></div>
      <button class="cs-stat cs-insp" :class="{ on: s.inspiration }" :disabled="ro" title="Inspiration" @click="edit(x => x.inspiration = !x.inspiration || undefined)"><span>Inspiration</span><b>{{ s.inspiration ? '★' : '☆' }}</b></button>
    </div>

    <div class="cs-hp">
      <div class="cs-hp-main">
        <span class="cs-label">Hit points</span>
        <div class="cs-hp-row">
          <input class="cs-hp-now" type="number" :value="s.hp ?? s.maxHp ?? ''" :disabled="ro" title="Current HP" @change="edit(x => x.hp = num($event))" />
          <span class="muted">/</span>
          <input type="number" :value="s.maxHp ?? ''" placeholder="max" :disabled="ro" title="Maximum HP" @change="edit(x => x.maxHp = num($event))" />
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
          <input class="cs-die" :value="s.hitDie ?? ''" placeholder="d8" :disabled="ro" @change="edit(x => x.hitDie = text($event))" />
        </div>
      </div>
      <button class="cs-rest" :disabled="ro" title="Full HP, no temp HP, half your hit dice back" @click="longRest">Long rest</button>
    </div>

    <div class="cs-grid">
      <!-- abilities and saves -->
      <section class="cs-abilities">
        <div v-for="a in ABILITIES" :key="a.key" class="cs-ability">
          <span class="cs-short" :title="a.label">{{ a.short }}</span>
          <b class="cs-mod">{{ signed(mod(s.abilities[a.key])) }}</b>
          <input type="number" min="1" max="30" :value="s.abilities[a.key]" :disabled="ro" :title="`${a.label} score`" @change="edit(x => x.abilities[a.key] = num($event) ?? 10)" />
          <button class="cs-save" :class="{ on: s.saves.includes(a.key) }" :disabled="ro" :title="`${a.label} saving throw${s.saves.includes(a.key) ? ' (proficient)' : ''}`" @click="toggleSave(a.key)">
            {{ s.saves.includes(a.key) ? '●' : '○' }} save {{ signed(saveBonus(s, a.key, prof)) }}</button>
        </div>
      </section>

      <!-- skills -->
      <section class="cs-skills">
        <h4>Skills <span class="muted small">click: proficient, expertise</span></h4>
        <button v-for="sk in SKILLS" :key="sk.name" class="cs-skill" :class="{ on: s.skills[sk.name] }" :disabled="ro" @click="cycleSkill(sk.name)">
          <span class="cs-dot">{{ skillMark(sk.name) }}</span><b>{{ signed(skillBonus(s, sk.name, prof)) }}</b>
          <span>{{ sk.name }}</span><span class="muted small">{{ sk.ability.toUpperCase() }}</span>
        </button>
      </section>

      <!-- attacks, spellcasting, proficiencies -->
      <section class="cs-side">
        <h4>Attacks</h4>
        <table v-if="atks.length" class="cs-attacks">
          <tr v-for="a in atks" :key="a.id"><td><EntryLink :id="a.id" /></td><td><b>{{ signed(a.toHit) }}</b></td><td>{{ a.damage }} <span class="muted small">{{ a.type }}</span></td></tr>
        </table>
        <p v-else class="muted small">Equip a weapon in the inventory to see its attack here.</p>

        <h4>Spellcasting</h4>
        <div class="cs-cast">
          <select :value="s.spellAbility ?? ''" :disabled="ro" @change="edit(x => x.spellAbility = (($event.target as HTMLSelectElement).value || undefined) as Ability | undefined)">
            <option value="">{{ cast && !s.spellAbility ? `${cast.toUpperCase()} (class)` : 'None' }}</option>
            <option v-for="a in ABILITIES" :key="a.key" :value="a.key">{{ a.short }}</option>
          </select>
          <template v-if="cast"><span>Save DC <b>{{ 8 + prof + castMod }}</b></span><span>Attack <b>{{ signed(prof + castMod) }}</b></span></template>
          <a href="#/spellbook" class="small">Spellbook →</a>
        </div>

        <h4>Proficiencies &amp; languages</h4>
        <textarea rows="4" :value="s.proficiencies ?? ''" placeholder="Light armor, simple weapons, thieves' tools; Common, Elvish" :disabled="ro" @change="edit(x => x.proficiencies = text($event))" />
      </section>
    </div>

    <!-- inventory -->
    <section class="cs-inventory">
      <h4>Inventory <span class="muted small">{{ weight ? `${Math.round(weight * 10) / 10} lb` : '' }}{{ attunedCount ? ` · ${attunedCount}/3 attuned` : '' }}</span></h4>
      <table class="cs-inv">
        <tr v-for="{ l, i } in gear" :key="i">
          <td class="cs-qty"><input type="number" min="0" :value="l.qty" :disabled="ro" @change="edit(x => x.inventory[i].qty = num($event) ?? 0)" /></td>
          <td class="cs-iname">
            <a v-if="itemOf(l)" :href="hrefEntry(l.item!)">{{ itemOf(l)!.name }}</a>
            <input v-else :value="l.name ?? ''" placeholder="Name" :disabled="ro" @change="edit(x => x.inventory[i].name = text($event))" />
            <span v-if="itemOf(l)?.fields.kind" class="muted small cs-kind">{{ itemOf(l)!.fields.kind }}</span>
          </td>
          <td><button v-if="canEquip(l)" class="chip-toggle" :class="{ on: l.equipped }" :disabled="ro" @click="edit(x => x.inventory[i].equipped = !l.equipped || undefined)">{{ l.equipped ? 'Equipped' : 'Equip' }}</button></td>
          <td><button v-if="canAttune(l)" class="chip-toggle" :class="{ on: l.attuned }" :disabled="ro" @click="edit(x => x.inventory[i].attuned = !l.attuned || undefined)">{{ l.attuned ? 'Attuned' : 'Attune' }}</button></td>
          <td><button class="link-btn" title="Remove" :disabled="ro" @click="edit(x => x.inventory.splice(i, 1))">✕</button></td>
        </tr>
      </table>
      <template v-if="pouch.length">
        <h5 class="cs-sub">Ingredient pouch</h5>
        <table class="cs-inv">
          <tr v-for="{ l, i } in pouch" :key="i">
            <td class="cs-qty"><input type="number" min="0" :value="l.qty" :disabled="ro" @change="edit(x => x.inventory[i].qty = num($event) ?? 0)" /></td>
            <td class="cs-iname"><a :href="hrefEntry(l.item!)">{{ itemOf(l)!.name }}</a></td>
            <td><button class="link-btn" title="Remove" :disabled="ro" @click="edit(x => x.inventory.splice(i, 1))">✕</button></td>
          </tr>
        </table>
      </template>
      <div v-if="!ro" class="cs-inv-add">
        <EntryPicker add :types="['item']" placeholder="Add an item…" @pick="addItem" />
        <button class="link-btn" @click="addNamed">＋ Something else</button>
      </div>
      <label class="cs-money"><span>Money</span><MoneyInput :model-value="s.money" :disabled="ro" @update:model-value="v => edit(x => x.money = v)" /><span class="muted small">{{ formatMoney(s.money) }}</span></label>
    </section>

    <!-- features and traits -->
    <section class="cs-features">
      <h4>Features &amp; traits <button v-if="!ro" class="link-btn" @click="addFeature">＋ Add</button></h4>
      <div v-for="(f, i) in s.features" :key="i" class="cs-feature">
        <input :value="f.name" placeholder="Name, e.g. Bardic Inspiration (d6)" :disabled="ro" @change="edit(x => x.features[i].name = ($event.target as HTMLInputElement).value)" />
        <textarea rows="2" :value="f.text" placeholder="What it does" :disabled="ro" @change="edit(x => x.features[i].text = ($event.target as HTMLTextAreaElement).value)" />
        <button class="link-btn" title="Remove" :disabled="ro" @click="edit(x => x.features.splice(i, 1))">✕</button>
      </div>
      <p v-if="!s.features.length" class="muted small">Class features, racial traits, feats.</p>
    </section>
  </div>
</template>
