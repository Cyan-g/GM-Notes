<script setup lang="ts">
// The Ruleset's "Currency": the world's coins from the smallest up, each worth some of the one below it, one of them the
// main coin (rules.ts, money.ts). Each change is saved when it makes a usable currency; what's wrong is said below.
import { computed, ref, watch } from 'vue'
import { STANDARD_CURRENCY, formatCoins, mainWorth, worths, type Coin, type Currency } from '../../money'
import { currency, setCurrency, withoutCoin } from '../../rules'

const props = defineProps<{ disabled?: boolean }>()
const copy = (c: Currency): Currency => ({ coins: c.coins.map(x => ({ ...x })), main: c.main })
const draft = ref<Currency>(copy(currency()))
watch(currency, c => { draft.value = copy(c) })

/** What keeps the draft from being saved. */
const problem = computed(() => {
  const abbrs = draft.value.coins.map(x => x.abbr.trim())
  if (abbrs.some(a => !a)) return 'Every coin needs an abbreviation.'
  if (abbrs.some(a => /[\d\s.,+\-−–]/.test(a))) return 'Abbreviations are letters only (no digits, spaces, signs or points).'
  const low = abbrs.map(a => a.toLowerCase())
  if (new Set(low).size < low.length) return 'Two coins have the same abbreviation.'
  if (draft.value.coins.some((x, i) => i && !(Number.isInteger(x.per) && x.per >= 2))) return 'Each coin is worth a whole number, 2 or more, of the one below it.'
  return ''
})
function save() { if (!problem.value) setCurrency(draft.value) }
function put(i: number, p: Partial<Coin>) {
  const c = draft.value.coins[i], was = c.abbr
  Object.assign(c, p)
  if (!c.noSplit) delete c.noSplit
  if (p.abbr != null && draft.value.main === was) draft.value.main = p.abbr
  save()
}
/** A new coin on top, saved once it has an abbreviation. */
const add = () => { draft.value.coins.push({ abbr: '', name: '', per: 10 }) }
function remove(i: number) { draft.value = withoutCoin(draft.value, i); save() }
function standard() { if (confirm('Use the standard coins (cp, sp, ep, gp, pp)? Amounts stay as they are counted in the smallest coin.')) { draft.value = copy(STANDARD_CURRENCY); save() } }

const worth = computed(() => worths(draft.value))
/** An amount shown both ways, to see the coins at work. */
const example = computed(() => {
  const c = draft.value, i = c.coins.findIndex(x => x.abbr === c.main), w = worth.value
  const amount = 1234 * mainWorth(c) + (i > 0 ? 5 * w[i - 1] : 0) + (i > 1 ? 3 : 0)
  return problem.value ? '' : formatCoins(amount, c)
})
const val = (e: Event) => (e.target as HTMLInputElement).value
</script>

<template>
  <div class="cur">
    <table class="cur-table">
      <thead><tr><th>Coin</th><th>Name</th><th>Worth</th><th title="What the rules count in, and what a number without a coin means">Main</th><th title="Amounts are shown broken into this coin">Split into</th><th /></tr></thead>
      <tbody>
        <tr v-for="(c, i) in draft.coins" :key="i">
          <td><input class="cur-abbr" :value="c.abbr" :disabled="disabled" placeholder="gp" aria-label="Abbreviation" @change="put(i, { abbr: val($event).trim() })" /></td>
          <td><input class="cur-name" :value="c.name" :disabled="disabled" placeholder="gold" aria-label="Name" @change="put(i, { name: val($event).trim() })" /></td>
          <td class="cur-worth">
            <template v-if="i">1 {{ c.abbr || '…' }} = <input type="number" min="2" step="1" :value="c.per" :disabled="disabled" aria-label="Worth in the coin below"
              @change="put(i, { per: Math.round(Number(val($event))) })" /> {{ draft.coins[i - 1].abbr }}
              <span v-if="i > 1" class="muted small">({{ worth[i].toLocaleString() }} {{ draft.coins[0].abbr }})</span></template>
            <span v-else class="muted small">the smallest coin: amounts are counted in it</span>
          </td>
          <td class="cur-check"><input type="radio" name="cur-main" :checked="draft.main === c.abbr" :disabled="disabled || !c.abbr" :aria-label="`${c.abbr} is the main coin`" @change="draft.main = c.abbr; save()" /></td>
          <td class="cur-check"><input type="checkbox" :checked="!i || !c.noSplit" :disabled="disabled || !i" :aria-label="`Show amounts in ${c.abbr}`" @change="put(i, { noSplit: !($event.target as HTMLInputElement).checked })" /></td>
          <td><button v-if="!disabled && i" class="link-btn small danger" :title="`Remove ${c.abbr || 'this coin'}: the coin above it takes over its worth`" @click="remove(i)">✕</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="problem" class="cur-problem small">{{ problem }} Not saved yet.</p>
    <p v-else-if="example" class="muted small">Shown as: {{ example }}. Changing a worth keeps every amount as counted in {{ draft.coins[0].abbr }}, so it reads differently in the bigger coins.</p>
    <div v-if="!disabled" class="cur-actions">
      <button class="chip-btn" title="A larger coin on top" @click="add">＋ Add a coin</button>
      <button class="link-btn small" @click="standard">Standard coins</button>
    </div>
  </div>
</template>

<style scoped>
.cur-table { border-collapse: collapse; margin: 6px 0; }
.cur-table th { text-align: left; font-weight: 600; font-size: 0.85em; color: var(--muted); padding: 2px 8px 4px 0; }
.cur-table td { padding: 2px 8px 2px 0; vertical-align: middle; }
.cur-abbr { width: 4.5em; }
.cur-name { width: 9em; }
.cur-worth input { width: 4.5em; }
.cur-check { text-align: center; }
.cur-problem { color: var(--danger, #c0392b); }
.cur-actions { display: flex; gap: 12px; align-items: center; }
</style>
