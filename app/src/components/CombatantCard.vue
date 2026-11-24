<script setup lang="ts">
// One fighter in the initiative tracker: name, AC, initiative, an HP bar with damage and healing, the conditions in
// effect (with rounds left), concentration saves to roll and, for a party member at 0 HP, death saves.
// A player character's AC, initiative bonus and HP are their sheet's.
import Dropdown from './Dropdown.vue'
import AppIcon from './AppIcon.vue'
import { computed, nextTick, ref } from 'vue'
import type { Combatant } from '../model/types'
import { get, touch } from '../store'
import { statsOf } from '../encounter'
import { TRACKER_CONDITIONS, signed } from '../model/dnd'
import { CONDITION_RULES } from '../conditions'
import ConditionIcon from './ConditionIcon.vue'
import DeathSaves from './DeathSaves.vue'
import { applyHp, deathSavesOf, isParty, removeCombatant, fighterStats, saveRollNotes, setDeathSaves } from '../tracker'

/** `compact`: one row (name, AC, HP, damage box, conditions), for a big fight on one screen. */
const props = defineProps<{ c: Combatant; current: boolean; selected: boolean; compact?: boolean; /** Say how to give it stats (the first one without, not every one). */ hint?: boolean }>()
const emit = defineEmits<{ select: []; stats: [] }>()
const c = computed(() => props.c)
const st = computed(() => fighterStats(c.value))

// ---- HP ----
const max = computed(() => st.value.maxHp ?? 0)
const pct = computed(() => (max.value ? Math.max(0, Math.min(100, ((st.value.hp ?? 0) / max.value) * 100)) : 0))
const tempPct = computed(() => (max.value && st.value.tempHp ? Math.min(100 - pct.value, (st.value.tempHp / max.value) * 100) : 0))
const state = computed(() => (st.value.hp == null || !max.value ? '' : st.value.hp <= 0 ? 'down' : st.value.hp <= max.value / 2 ? 'bloodied' : 'healthy'))
const amount = ref('')
/** Max HP being changed: the bar shows it as text ("13 / 13") until clicked. */
const editMax = ref(false)
const maxBox = ref<HTMLInputElement>()
async function startMax() { editMax.value = true; await nextTick(); maxBox.value?.focus(); maxBox.value?.select() }
function endMax(raw: string) { if (!editMax.value) return; editMax.value = false; setNum('maxHp', raw) }
function hp(op: '-' | '+' | 't' | '') {
  const v = amount.value.trim()
  if (!v) return
  if (applyHp(c.value, /^[+\-=tT]/.test(v) || !op ? v : op + v)) amount.value = ''
}
const sheetNote = computed(() => (st.value.acFromSheet ? `From ${c.value.name}'s character sheet` : ''))

function setNum(key: 'init' | 'ac' | 'maxHp', raw: string) {
  const v = raw.trim() === '' ? undefined : Number(raw)
  if (key === 'init') c.value.init = v ?? null
  else { c.value[key] = v; if (key === 'maxHp' && c.value.hp == null) c.value.hp = v }
  touch()
}

// ---- conditions: the ones in effect as chips, more from the menu ----
const missing = computed(() => TRACKER_CONDITIONS.filter(x => !c.value.conditions.includes(x)))
function add(ev: Event) {
  const sel = ev.target as HTMLSelectElement
  if (sel.value) { c.value.conditions = [...c.value.conditions, sel.value]; touch() }
  sel.value = ''
}
function dropRounds(x: string) {
  if (!c.value.rounds) return
  delete c.value.rounds[x]
  if (!Object.keys(c.value.rounds).length) delete c.value.rounds
}
function remove(x: string) {
  c.value.conditions = c.value.conditions.filter(y => y !== x)
  dropRounds(x)
  if (x === 'Concentrating') { delete c.value.concChecks; delete c.value.concOn }
  touch()
}
function setRounds(x: string, raw: string) {
  const n = Math.floor(Number(raw))
  if (raw.trim() && n > 0) c.value.rounds = { ...(c.value.rounds ?? {}), [x]: n }
  else dropRounds(x)
  touch()
}

// ---- concentration: on what, and the saves ----
/** A character's concentration spell, from their sheet. */
const sheetConc = computed(() => { const pc = c.value.isPlayer ? get(c.value.entry) : undefined; return get(pc?.fields.sheet?.concentrating)?.name })
function setConcOn(v: string) { const t = v.trim(); if (t) c.value.concOn = t; else delete c.value.concOn; touch() }
function concDone(i: number, kept: boolean) {
  const left = (c.value.concChecks ?? []).filter((_, j) => j !== i)
  if (left.length) c.value.concChecks = left; else delete c.value.concChecks
  if (!kept) remove('Concentrating')
  touch()
}

// ---- death saves ----
const dying = computed(() => isParty(c.value) && state.value === 'down')
const ds = computed(() => deathSavesOf(c.value))
const rollNotes = computed(() => saveRollNotes(c.value))
/** A creature's legendary actions per round (its statblock; in its lair, the lair count isn't assumed). */
const sb = computed(() => (c.value.isPlayer ? undefined : statsOf(get(c.value.entry))))
const legendary = computed(() => (c.value.inLair && sb.value?.legendaryLair ? sb.value.legendaryLair : sb.value?.legendaryUses ?? 0))
function toggleLair() { if (c.value.inLair) delete c.value.inLair; else c.value.inLair = true; touch() }
/** A creature or NPC with nothing to fight with: no statblock, no HP, no AC. */
const noStats = computed(() => !c.value.isPlayer && !sb.value && c.value.maxHp == null && c.value.ac == null)
function useLegendary(n: number) { const used = c.value.legendaryUsed ?? 0; c.value.legendaryUsed = used >= n ? n - 1 : n; if (!c.value.legendaryUsed) delete c.value.legendaryUsed; touch() }

/** Clicking into a box selects its number, so typing replaces it. */
const selectAll = (ev: FocusEvent) => (ev.target as HTMLInputElement).select()
function switchSide() { c.value.side = isParty(c.value) ? 'enemy' : 'party'; touch() }
</script>

<template>
  <article class="fighter card" :class="[state, { current, selected, compact, party: isParty(c) }]" @click="emit('select')">
    <header class="fighter-head">
      <span v-if="current" class="turn-mark" title="Their turn">▶</span>
      <button type="button" class="fighter-name link-btn" title="Show the statblock" @click.stop="emit('stats')">{{ c.name }}</button>
      <span v-if="c.isPlayer" class="badge">PC</span>
      <span class="spacer" />
      <label class="fighter-stat" :title="`Initiative: d20 ${signed(st.initMod, '-')}`"><span>Init</span>
        <input type="number" :value="c.init ?? ''" :placeholder="`d20${signed(st.initMod, '-')}`" :class="{ unset: c.init == null }" @click.stop @focus="selectAll" @change="setNum('init', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="fighter-stat shield" :title="sheetNote || 'Armour class'"><span>AC</span>
        <b v-if="st.acFromSheet" class="fighter-ac">{{ st.ac }}</b>
        <input v-else type="number" :value="c.ac ?? ''" @click.stop @focus="selectAll" @change="setNum('ac', ($event.target as HTMLInputElement).value)" />
      </label>
      <button type="button" class="link-btn" :title="isParty(c) ? 'Move to the enemies' : 'Move to the party'" @click.stop="switchSide">⇄</button>
      <button type="button" class="x" title="Remove from the fight" @click.stop="removeCombatant(c.id)">×</button>
    </header>

    <div class="hp-row">
      <div class="hp-bar" :class="state" :title="(max ? `${st.hp} / ${max} HP` : 'No max HP set') + (st.hpFromSheet ? ' · shared with the character sheet' : '')">
        <div class="hp-fill" :style="{ width: pct + '%' }" />
        <div v-if="tempPct" class="hp-temp" :style="{ left: pct + '%', width: tempPct + '%' }" />
        <span class="hp-text">
          <b>{{ st.hp ?? '—' }}</b> /
          <b v-if="st.hpFromSheet" class="hp-max-ro">{{ max }}</b>
          <input v-else-if="editMax" ref="maxBox" type="number" class="hp-max" :value="c.maxHp ?? ''" title="Max HP" placeholder="max" @click.stop
                 @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="editMax = false" @blur="endMax(($event.target as HTMLInputElement).value)" />
          <button v-else type="button" class="hp-max-text" :class="{ unset: !max }" title="Max HP: click to change" @click.stop="startMax">{{ max || 'set max' }}</button>
          <span v-if="st.tempHp" class="hp-temp-text" title="Temporary HP">+{{ st.tempHp }}</span>
        </span>
      </div>
      <input v-model="amount" class="hp-amount" placeholder="dmg / heal" title="Amount. Enter = damage; or type +5 heal, =20 set, t5 temporary" @click.stop @focus="selectAll" @keydown.enter="hp('')" />
      <button type="button" class="hp-btn dmg" title="Damage" @click.stop="hp('-')"><AppIcon ui="dagger" /></button>
      <button type="button" class="hp-btn heal" title="Heal" @click.stop="hp('+')">✚</button>
      <button type="button" class="hp-btn tmp" title="Temporary HP" @click.stop="hp('t')"><AppIcon ui="shield" /></button>
    </div>

    <div v-if="legendary" class="cc-legendary small" @click.stop>
      <span class="muted">Legendary actions</span>
      <button v-for="n in legendary" :key="n" type="button" class="ds-box" :class="{ on: (c.legendaryUsed ?? 0) >= n }" :aria-label="`${n} used`" :title="(c.legendaryUsed ?? 0) >= n ? 'Used (click to take back)' : 'Use one'" @click="useLegendary(n)" />
      <span class="muted">{{ legendary - (c.legendaryUsed ?? 0) }} left · back at the start of its turn</span>
      <label v-if="sb?.legendaryLair" class="muted" title="In its lair it has more legendary actions"><input type="checkbox" :checked="!!c.inLair" @change="toggleLair" /> in its lair</label>
    </div>
    <p v-if="noStats && hint" class="small muted cc-nostats" @click.stop>No stats: type its HP and AC here, or give it a statblock on its page (or one from the SRD).</p>
    <DeathSaves v-if="dying" :saves="ds" :adv="rollNotes.death" @set="d => { setDeathSaves(c, d); touch() }" @nat20="applyHp(c, '=1')" />

    <div v-for="(dc, i) in c.concChecks ?? []" :key="'cc' + i" class="conc-check" @click.stop>
      <span><ConditionIcon name="Concentrating" /> Concentration: <b>CON save DC {{ dc }}</b><template v-if="rollNotes.conc">, {{ rollNotes.conc }}</template></span>
      <button type="button" class="chip-btn" @click="concDone(i, true)">Kept</button>
      <button type="button" class="chip-btn" @click="concDone(i, false)">Lost</button>
    </div>

    <div class="conds" @click.stop>
      <span v-for="x in c.conditions" :key="x" class="cond-chip" :class="{ tip: !!CONDITION_RULES[x] }" :data-tip="CONDITION_RULES[x] ? `${x}: ${CONDITION_RULES[x].text}` : undefined">
        <ConditionIcon :name="x" />{{ x }}
        <!-- concentrating on what: a character's spell from their sheet, else typed -->
        <template v-if="x === 'Concentrating'"><i v-if="sheetConc" class="cond-on">on {{ sheetConc }}</i><input v-else class="cond-on-input" :value="c.concOn ?? ''" placeholder="on…" :title="`What ${c.name} concentrates on`" @change="setConcOn(($event.target as HTMLInputElement).value)" /></template>
        <input type="number" min="1" class="cond-rounds" :value="c.rounds?.[x] ?? ''" placeholder="∞" :title="`Rounds left (counts down at the end of ${c.name}'s turn); empty: until removed`" @focus="selectAll" @change="setRounds(x, ($event.target as HTMLInputElement).value)" />
        <button type="button" class="cond-x" :title="`Remove ${x}`" @click="remove(x)">×</button>
      </span>
      <Dropdown class="cond-add" :aria-label="`Add a condition to ${c.name}`" @change="add">
        <option value="">{{ compact ? '＋' : '＋ Condition' }}</option>
        <option v-for="x in missing" :key="x" :value="x">{{ x }}</option>
      </Dropdown>
    </div>
  </article>
</template>
