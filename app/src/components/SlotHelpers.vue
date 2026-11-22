<script setup lang="ts">
// Under the spell slots: what a class feature can do with them, as buttons. Magical Cunning (Warlock) and Font of
// Magic (Sorcerer); Arcane Recovery is on the short rest (ShortRestModal). Shown only for a character with the feature.
import { computed, ref } from 'vue'
import type { Entry } from '../model/types'
import { ORD } from '../model/dnd'
import { FONT_COST, cunningBack, featureNamed, fontMakePoints, fontMakeSlot, magicalCunning, slotsOf, usesOf } from '../classHelpers'
import { sheetOf } from '../sheetData'
import { noteUndo, restoreSheet, snapSheet } from '../undoNote'

const props = defineProps<{ pc: Entry }>()
const rows = computed(() => slotsOf(props.pc))
const cunning = computed(() => featureNamed(props.pc, sheetOf(props.pc), 'Magical Cunning'))
const font = computed(() => featureNamed(props.pc, sheetOf(props.pc), 'Font of Magic'))
const pact = computed(() => rows.value.find(r => r.kind === 'pact'))
const points = computed(() => (font.value ? usesOf(props.pc, font.value) : { left: 0, max: 0 }))
/** Levels a spent slot can be made again (up to 5th), and the slots that can become points. */
const makeable = computed(() => rows.value.filter(r => r.kind === 'slot' && r.level <= 5 && r.max > 0))
const spendable = computed(() => rows.value.filter(r => r.kind !== 'arcanum' && r.used < r.max))
const open = ref(false)

function doCunning() {
  if (!cunning.value || !pact.value) return
  const before = snapSheet(props.pc), n = magicalCunning(props.pc, cunning.value, pact.value)
  noteUndo(`Magical Cunning: ${n} pact slot${n === 1 ? '' : 's'} back`, restoreSheet(props.pc, before))
}
function makeSlot(level: number) {
  if (!font.value) return
  const before = snapSheet(props.pc)
  fontMakeSlot(props.pc, font.value, level)
  noteUndo(`Font of Magic: ${FONT_COST[level]} sorcery points for a ${ORD[level]}-level slot`, restoreSheet(props.pc, before))
}
function makePoints(level: number, kind: string) {
  const r = rows.value.find(x => x.level === level && x.kind === kind)
  if (!font.value || !r) return
  const before = snapSheet(props.pc)
  fontMakePoints(props.pc, font.value, r)
  noteUndo(`Font of Magic: a ${ORD[level]}-level slot for ${level} sorcery point${level === 1 ? '' : 's'}`, restoreSheet(props.pc, before))
}
</script>

<template>
  <div v-if="(cunning && pact) || font" class="slot-helpers">
    <div v-if="cunning && pact" class="sh-line">
      <b>Magical Cunning</b>
      <span class="muted small">{{ usesOf(pc, cunning).left ? 'a 1-minute rite: half your pact slots back, once per long rest' : 'used: back after a long rest' }}</span>
      <button type="button" class="chip-btn" :disabled="!usesOf(pc, cunning).left || !pact.used" :title="pact.used ? `Get ${cunningBack(pact)} pact slot${cunningBack(pact) === 1 ? '' : 's'} back` : 'No pact slot spent'" @click="doCunning">
        Get {{ pact.used ? cunningBack(pact) : Math.ceil(pact.max / 2) }} back
      </button>
    </div>
    <div v-if="font" class="sh-line">
      <b>Font of Magic</b>
      <span class="small"><b>{{ points.left }}</b> / {{ points.max }} sorcery points</span>
      <button type="button" class="link-btn small" :aria-expanded="open" @click="open = !open">{{ open ? 'Close' : 'Convert…' }}</button>
    </div>
    <div v-if="font && open" class="sh-font">
      <div class="sh-row">
        <span class="small muted">Make a slot</span>
        <button v-for="r in makeable" :key="'m' + r.level" type="button" class="chip-btn" :disabled="points.left < FONT_COST[r.level] || !r.used"
                :title="!r.used ? `No ${ORD[r.level]}-level slot spent to make again` : points.left < FONT_COST[r.level] ? `Needs ${FONT_COST[r.level]} points` : `Spend ${FONT_COST[r.level]} points for a ${ORD[r.level]}-level slot`" @click="makeSlot(r.level)">
          {{ ORD[r.level] }} <span class="muted small">−{{ FONT_COST[r.level] }}</span>
        </button>
      </div>
      <div class="sh-row">
        <span class="small muted">Make points</span>
        <button v-for="r in spendable" :key="'p' + r.key" type="button" class="chip-btn" :disabled="points.left >= points.max"
                :title="points.left >= points.max ? 'Sorcery points are full' : `Spend a ${r.kind === 'pact' ? 'pact' : ORD[r.level] + '-level'} slot for ${r.level} point${r.level === 1 ? '' : 's'}`" @click="makePoints(r.level, r.kind)">
          {{ r.kind === 'pact' ? 'Pact ' : '' }}{{ ORD[r.level] }} <span class="muted small">+{{ r.level }}</span>
        </button>
      </div>
      <p class="muted small">A slot made this way is one you spent, made again. Points come back on a long rest.</p>
    </div>
  </div>
</template>
