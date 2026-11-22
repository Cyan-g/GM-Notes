<script setup lang="ts">
// Arcane Recovery on a short rest (Wizard): pick spent slots worth up to half the Wizard level (rounded up), none of
// level 6 or higher; they come back and the feature's use is spent. Only for a character with the feature and a use left.
import { computed, ref } from 'vue'
import type { CharacterSheet, Entry } from '../model/types'
import { ORD } from '../model/dnd'
import { arcaneBudget, arcaneRecover, featureNamed, slotsOf, usesOf } from '../classHelpers'

const props = defineProps<{ pc: Entry; s: CharacterSheet }>()
const a = computed(() => featureNamed(props.pc, props.s, 'Arcane Recovery'))
const left = computed(() => (a.value ? usesOf(props.pc, a.value).left : 0))
const spent = computed(() => slotsOf(props.pc).filter(r => r.kind === 'slot' && r.level <= 5 && r.used > 0))
const budget = computed(() => arcaneBudget(props.pc))
const pick = ref<Record<number, number>>({})
const total = computed(() => Object.entries(pick.value).reduce((n, [l, c]) => n + Number(l) * c, 0))
const done = ref('')
function add(level: number, by: 1 | -1, used: number) {
  const c = (pick.value[level] ?? 0) + by
  if (c < 0 || c > used || total.value + by * level > budget.value) return
  pick.value = { ...pick.value, [level]: c }
}
function recover() {
  if (!a.value || !total.value) return
  arcaneRecover(props.pc, a.value, pick.value)
  done.value = Object.entries(pick.value).filter(([, c]) => c).map(([l, c]) => `${c} × ${ORD[Number(l)]}`).join(', ')
  pick.value = {}
}
</script>

<template>
  <section v-if="a && (left || done)" class="arcane-recovery">
    <h3>Arcane Recovery <span class="muted small">slots worth up to {{ budget }} level{{ budget === 1 ? '' : 's' }}, none 6th or higher</span></h3>
    <p v-if="done" class="small">Got back: {{ done }}.</p>
    <template v-else>
      <p v-if="!spent.length" class="muted small">No slot of 5th level or lower is spent.</p>
      <div v-else class="sr-pool">
        <span v-for="r in spent" :key="r.key" class="ar-pick">
          <b>{{ ORD[r.level] }}</b>
          <button type="button" class="chip-btn" :disabled="!pick[r.level]" aria-label="One fewer" @click="add(r.level, -1, r.used)">−</button>
          <span class="ar-n">{{ pick[r.level] ?? 0 }}</span>
          <button type="button" class="chip-btn" :disabled="(pick[r.level] ?? 0) >= r.used || total + r.level > budget" aria-label="One more" @click="add(r.level, 1, r.used)">+</button>
        </span>
        <span class="small muted">{{ total }} of {{ budget }}</span>
        <button type="button" class="chip-btn" :class="{ primary: total }" :disabled="!total" @click="recover">Recover</button>
      </div>
    </template>
  </section>
</template>
