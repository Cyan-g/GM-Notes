<script setup lang="ts">
// One fighter in the initiative tracker: name, AC, initiative, an HP bar with damage and healing, and condition toggles.
import { computed, ref } from 'vue'
import type { Combatant } from '../model/types'
import { touch } from '../store'
import { CONDITIONS, CONDITION_ICONS } from '../encounter'
import { applyHp, isParty, removeCombatant } from '../tracker'

const props = defineProps<{ c: Combatant; current: boolean; selected: boolean }>()
const emit = defineEmits<{ select: []; stats: [] }>()
const c = computed(() => props.c)

// ---- HP ----
const max = computed(() => c.value.maxHp ?? 0)
const pct = computed(() => (max.value ? Math.max(0, Math.min(100, ((c.value.hp ?? 0) / max.value) * 100)) : 0))
const tempPct = computed(() => (max.value && c.value.tempHp ? Math.min(100 - pct.value, (c.value.tempHp / max.value) * 100) : 0))
const state = computed(() => (c.value.hp == null || !max.value ? '' : c.value.hp <= 0 ? 'down' : c.value.hp <= max.value / 2 ? 'bloodied' : 'healthy'))
const amount = ref('')
function hp(op: '-' | '+' | 't' | '') {
  const v = amount.value.trim()
  if (!v) return
  if (applyHp(c.value, /^[+\-=tT]/.test(v) || !op ? v : op + v)) amount.value = ''
}

function setNum(key: 'init' | 'ac' | 'maxHp', raw: string) {
  const v = raw.trim() === '' ? undefined : Number(raw)
  if (key === 'init') c.value.init = v ?? null
  else { c.value[key] = v; if (key === 'maxHp' && c.value.hp == null) c.value.hp = v }
  touch()
}
function toggle(x: string) {
  const list = c.value.conditions
  c.value.conditions = list.includes(x) ? list.filter(y => y !== x) : [...list, x]
  touch()
}
/** Clicking into a box selects its number, so typing replaces it. */
const selectAll = (ev: FocusEvent) => (ev.target as HTMLInputElement).select()
function switchSide() { c.value.side = isParty(c.value) ? 'enemy' : 'party'; touch() }
</script>

<template>
  <article class="fighter card" :class="[state, { current, selected, party: isParty(c) }]" @click="emit('select')">
    <header class="fighter-head">
      <span v-if="current" class="turn-mark" title="Their turn">▶</span>
      <button type="button" class="fighter-name link-btn" title="Show the statblock" @click.stop="emit('stats')">{{ c.name }}</button>
      <span v-if="c.isPlayer" class="badge">PC</span>
      <span class="spacer" />
      <label class="fighter-stat" title="Initiative"><span>Init</span>
        <input type="number" :value="c.init ?? ''" :placeholder="(c.initMod >= 0 ? '+' : '') + c.initMod" @click.stop @focus="selectAll" @change="setNum('init', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="fighter-stat shield" title="Armour class"><span>AC</span>
        <input type="number" :value="c.ac ?? ''" @click.stop @focus="selectAll" @change="setNum('ac', ($event.target as HTMLInputElement).value)" />
      </label>
      <button type="button" class="link-btn" :title="isParty(c) ? 'Move to the enemies' : 'Move to the party'" @click.stop="switchSide">⇄</button>
      <button type="button" class="x" title="Remove from the fight" @click.stop="removeCombatant(c.id)">×</button>
    </header>

    <div class="hp-row">
      <div class="hp-bar" :class="state" :title="max ? `${c.hp} / ${max} HP` : 'No max HP set'">
        <div class="hp-fill" :style="{ width: pct + '%' }" />
        <div v-if="tempPct" class="hp-temp" :style="{ left: pct + '%', width: tempPct + '%' }" />
        <span class="hp-text">
          <b>{{ c.hp ?? '—' }}</b> / <input type="number" class="hp-max" :value="c.maxHp ?? ''" title="Max HP" placeholder="max" @click.stop @focus="selectAll" @change="setNum('maxHp', ($event.target as HTMLInputElement).value)" />
          <span v-if="c.tempHp" class="hp-temp-text" title="Temporary HP">+{{ c.tempHp }}</span>
        </span>
      </div>
      <input v-model="amount" class="hp-amount" placeholder="dmg / heal" title="Amount. Enter = damage; or type +5 heal, =20 set, t5 temporary" @click.stop @focus="selectAll" @keydown.enter="hp('')" />
      <button type="button" class="hp-btn dmg" title="Damage" @click.stop="hp('-')">🗡</button>
      <button type="button" class="hp-btn heal" title="Heal" @click.stop="hp('+')">✚</button>
      <button type="button" class="hp-btn tmp" title="Temporary HP" @click.stop="hp('t')">🛡</button>
    </div>

    <div class="cond-icons" @click.stop>
      <button v-for="x in CONDITIONS" :key="x" type="button" class="cond-icon" :class="{ on: c.conditions.includes(x) }" :title="x" @click="toggle(x)">{{ CONDITION_ICONS[x] ?? '•' }}</button>
    </div>
    <div v-if="c.conditions.length" class="cond-names">{{ c.conditions.join(' · ') }}</div>
  </article>
</template>
