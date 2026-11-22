<script setup lang="ts">
// A moon in a phase (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter), drawn: the lit part in the text colour,
// the dark part faint. Waxing lights the right side, waning the left.
import { computed } from 'vue'

const props = defineProps<{ phase: number }>()
const R = 10
/** The lit part's outline: a half circle on the lit side, closed by an ellipse whose width follows the phase. */
const lit = computed(() => {
  const p = ((props.phase % 1) + 1) % 1
  const waxing = p < 0.5
  const k = Math.cos(2 * Math.PI * p)   // 1 new, 0 quarter, -1 full
  const rx = Math.abs(k) * R
  const side = waxing ? 1 : 0           // which half circle is lit (sweep flag)
  // the inner edge: near new moon (k > 0) it curves back over the lit half (a crescent), near full out of it (gibbous)
  const bulge = k > 0 ? 1 - side : side
  return `M12 2 A ${R} ${R} 0 0 ${side} 12 22 A ${rx} ${R} 0 0 ${bulge} 12 2 Z`
})
</script>

<template>
  <svg class="moon-phase" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" class="moon-dark" />
    <path :d="lit" class="moon-lit" />
  </svg>
</template>
