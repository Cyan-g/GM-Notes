<script setup lang="ts">
// A character's Companions tab: creatures linked to them (a familiar, a steed, a summoned beast), each with its own
// name and hit points, and its statblock from the creature entry. Only creatures the players may see can be picked;
// the same creature can be linked more than once (two wolves).
import EntryPicker from './edit/EntryPicker.vue'
import { useReadOnly } from '../composables/useReadOnly'
import { computed, ref } from 'vue'
import type { Companion, Entry } from '../model/types'
import { byType, get, state } from '../store'
import { editSheet, sheetOrBlank } from '../sheetData'
import { statsOf } from '../encounter'
import Statblock from './Statblock.vue'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ pc: Entry }>()
/** Nothing changes in a read-only world, nor on a character that's read-only here (a player's, at the DM's). */
const ro = useReadOnly()
const list = computed(() => sheetOrBlank(props.pc).companions ?? [])
/** The creatures that can be linked: not DM-only, by name. */
const creatures = computed(() => (byType.value.get('creature') ?? []).filter(c => c.visibility !== 'secret').sort((a, b) => a.name.localeCompare(b.name)))

const edit = (fn: (l: Companion[]) => void) => editSheet(props.pc, s => { const l = s.companions ?? []; fn(l); if (l.length) s.companions = l; else delete s.companions })
function add(id: string) {
  if (!id) return
  edit(l => l.push({ key: Math.random().toString(36).slice(2, 10), creature: id }))
}
const at = (l: Companion[], key: string) => l.find(c => c.key === key)
const remove = (key: string) => edit(l => l.splice(l.findIndex(c => c.key === key), 1))
const rename = (key: string, v: string) => edit(l => { const c = at(l, key); if (c) c.name = v.trim() || undefined })
const maxOf = (c: Companion) => Number(statsOf(get(c.creature))?.hp ?? 0) || undefined
const hpOf = (c: Companion) => c.hp ?? maxOf(c)
function setHp(key: string, v: string) {
  edit(l => { const c = at(l, key); if (!c) return; const n = v === '' ? undefined : Math.max(0, Number(v)); c.hp = n === maxOf(c) ? undefined : n })
}
/** Damage takes temporary hit points first; healing stops at the maximum. */
function change(key: string, d: number) {
  edit(l => {
    const c = at(l, key); if (!c || !d) return
    let hp = hpOf(c) ?? 0, temp = c.tempHp ?? 0
    if (d < 0) { const off = Math.min(temp, -d); temp -= off; hp = Math.max(0, hp + d + off) } else hp = Math.min(maxOf(c) ?? hp + d, hp + d)
    c.hp = hp === maxOf(c) ? undefined : hp
    c.tempHp = temp || undefined
  })
}
const setTemp = (key: string, v: string) => edit(l => { const c = at(l, key); if (c) c.tempHp = Number(v) > 0 ? Number(v) : undefined })
const amount = ref<Record<string, string>>({})
function apply(key: string, sign: number) { const n = Math.abs(Number(amount.value[key])); if (n) change(key, sign * n); amount.value[key] = '' }
</script>

<template>
  <div class="companions-tab">
    <section class="card comp-pick">
      <h3>Link a creature</h3>
      <p class="muted small">A familiar, a steed, a summon: it gets its own name and hit points here. Only creatures the players may see are listed.</p>
      <div v-if="!ro" class="comp-add">
        <!-- the entry picker, as everywhere a creature is picked: typed to find, only those the players may see -->
        <EntryPicker add :types="['creature']" :only="creatures.map(c => c.id)" :placeholder="`Link a creature (${creatures.length})…`" @pick="add" />
      </div>
      <p v-if="!creatures.length" class="muted small">No creatures the players may see yet.</p>
    </section>
    <p v-if="!list.length" class="muted">No companions linked.</p>
    <section v-for="c in list" :key="c.key" class="card comp-card">
      <div class="comp-head">
        <input class="comp-name" :value="c.name ?? ''" :placeholder="get(c.creature)?.name ?? 'Creature'" :disabled="ro" aria-label="Its name" @change="rename(c.key, ($event.target as HTMLInputElement).value)" />
        <span class="muted small"><EntryLink :id="c.creature" /></span>
        <button class="link-btn" :disabled="ro" title="Unlink it" @click="remove(c.key)">✕</button>
      </div>
      <div class="comp-hp" :class="{ down: hpOf(c) === 0 }">
        <label>HP <input type="number" min="0" :value="hpOf(c) ?? ''" :disabled="ro" @change="setHp(c.key, ($event.target as HTMLInputElement).value)" /></label>
        <span v-if="maxOf(c)" class="muted">/ {{ maxOf(c) }}</span>
        <label>Temp <input type="number" min="0" :value="c.tempHp ?? ''" placeholder="0" :disabled="ro" @change="setTemp(c.key, ($event.target as HTMLInputElement).value)" /></label>
        <span class="comp-change">
          <input v-model="amount[c.key]" type="number" min="0" placeholder="0" :disabled="ro" aria-label="Amount" @keydown.enter="apply(c.key, -1)" />
          <button class="chip-btn" :disabled="ro" @click="apply(c.key, -1)">Damage</button>
          <button class="chip-btn" :disabled="ro" @click="apply(c.key, 1)">Heal</button>
        </span>
      </div>
      <Statblock v-if="statsOf(get(c.creature))" :sb="statsOf(get(c.creature))!" :name="c.name || get(c.creature)?.name || ''" />
      <p v-else class="muted small">This creature has no statblock yet.</p>
    </section>
  </div>
</template>
