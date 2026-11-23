<script setup lang="ts">
// After a short rest (taken when this opens), or a long one that heals no hit points by itself (the Ruleset's slow
// natural healing): what came back, and the Hit Dice to spend. The player rolls; they type
// how many dice and what the dice showed, and the sheet adds the CON modifier per die, heals and counts the dice.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { hitDiceOf, maxHpOf, score } from '../sheet'
import { editSheet } from '../sheetData'
import { hpChanged } from '../conditions'
import { mod, signed } from '../model/dnd'
import ArcaneRecovery from './ArcaneRecovery.vue'
import { restLengths } from '../rules'

const props = defineProps<{ pc: Entry; s: CharacterSheet; /** What the rest gave back, in words. */ summary: string; kind?: 'short' | 'long' }>()
const title = computed(() => `${props.kind === 'long' ? 'Long' : 'Short'} rest (${props.kind === 'long' ? restLengths().long : restLengths().short})`)
const emit = defineEmits<{ close: [] }>()
const con = computed(() => mod(score(props.s, 'con')))
const pools = computed(() => hitDiceOf(props.pc, props.s).map(p => ({ ...p, left: p.total - p.spent })))
const max = computed(() => maxHpOf(props.s))
const hp = computed(() => props.s.hp ?? max.value ?? 0)
/** Per die size: how many to spend and what they rolled together. */
const count = ref<Record<string, number>>({})
const rolled = ref<Record<string, number | undefined>>({})
const healed = ref<string[]>([])
/** What spending these dice heals: the roll plus CON per die (each die at least 0). */
const gain = (die: string) => { const n = count.value[die] ?? 0, r = rolled.value[die]; return n && r != null ? Math.max(0, r + con.value * n) : null }
function spend(die: string) {
  const n = count.value[die] ?? 0, g = gain(die), p = pools.value.find(x => x.die === die)
  if (!n || g == null || !p || n > p.left) return
  const before = hp.value
  editSheet(props.pc, x => {
    const m = maxHpOf(x)
    x.hp = m != null ? Math.min(m, before + g) : before + g
    x.hitDiceSpent = { ...(x.hitDiceSpent ?? {}), [die]: (x.hitDiceSpent?.[die] ?? 0) + n }
    if (m) hpChanged(props.pc, x, before, x.hp, false)
  })
  healed.value.push(`${n} × ${die}: +${g} HP`)
  count.value = { ...count.value, [die]: 0 }
  rolled.value = { ...rolled.value, [die]: undefined }
}
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); emit('close') } }
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div class="modal-back" @mousedown.self="emit('close')">
      <div class="modal short-rest" role="dialog" :aria-label="title">
        <header class="modal-head">
          <h2>{{ title }}</h2>
          <span class="spacer" />
          <button class="x" title="Close (Esc)" @click="emit('close')">×</button>
        </header>
        <p class="small">{{ summary }}</p>
        <h3>Spend Hit Dice <span class="muted small">HP {{ hp }} / {{ max ?? '?' }}</span></h3>
        <p class="small muted">Roll the dice you spend and type what they show together; each die adds CON {{ signed(con) }}.</p>
        <div v-for="p in pools" :key="p.die" class="sr-pool">
          <b>{{ p.die }}</b> <span class="muted small">{{ p.left }} of {{ p.total }} left</span>
          <label class="small">Dice <input v-model.number="count[p.die]" type="number" min="0" :max="p.left" class="wz-small" :disabled="!p.left" /></label>
          <label class="small">Rolled <input v-model.number="rolled[p.die]" type="number" min="0" class="wz-small" :disabled="!count[p.die]" placeholder="?" @keydown.enter="spend(p.die)" /></label>
          <span v-if="gain(p.die) != null" class="small">= +{{ gain(p.die) }} HP</span>
          <button type="button" class="chip-btn" :class="{ primary: gain(p.die) != null }" :disabled="gain(p.die) == null || (count[p.die] ?? 0) > p.left" @click="spend(p.die)">Heal</button>
        </div>
        <p v-if="healed.length" class="small">Healed: {{ healed.join(' · ') }}</p>
        <ArcaneRecovery v-if="kind !== 'long'" :pc="pc" :s="s" />
        <footer class="lu-foot"><span class="spacer" /><button class="primary" @click="emit('close')">Done</button></footer>
      </div>
    </div>
  </Teleport>
</template>
