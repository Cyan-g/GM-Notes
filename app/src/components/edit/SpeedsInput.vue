<script setup lang="ts">
// A race's speeds in feet: walking first, then swimming, flying (with hover), climbing and burrowing, each only when it
// has one; a note for anything else. A subrace's empty ones show its main race's as placeholders.
import { computed } from 'vue'
import type { Speeds } from '../../model/types'

const props = defineProps<{ inherited?: Speeds }>()
const model = defineModel<Speeds | undefined>()
const cur = computed<Speeds>(() => model.value ?? {})
const KINDS = [['walk', 'Walk'], ['swim', 'Swim'], ['fly', 'Fly'], ['climb', 'Climb'], ['burrow', 'Burrow']] as const
function set(p: Partial<Speeds>) {
  const n: Speeds = { ...cur.value, ...p }
  for (const k of Object.keys(n) as (keyof Speeds)[]) if (n[k] === undefined || n[k] === '' || n[k] === false) delete n[k]
  model.value = Object.keys(n).length ? n : undefined
}
const num = (ev: Event) => { const v = (ev.target as HTMLInputElement).value.trim(); return v === '' ? undefined : Math.max(0, Number(v) || 0) }
</script>

<template>
  <div class="speeds-input">
    <label v-for="[k, label] in KINDS" :key="k" class="small"><span>{{ label }}</span>
      <input type="number" min="0" step="5" :value="cur[k] ?? ''" :placeholder="inherited?.[k] != null ? String(inherited[k]) : k === 'walk' ? '30' : '—'" @change="set({ [k]: num($event) })" /> ft</label>
    <label v-if="cur.fly || inherited?.fly" class="small"><input type="checkbox" :checked="!!cur.hover" @change="set({ hover: ($event.target as HTMLInputElement).checked || undefined })" /> hover</label>
    <input class="speeds-note" :value="cur.note ?? ''" :placeholder="inherited?.note ?? 'Note (optional)'" @change="set({ note: ($event.target as HTMLInputElement).value.trim() || undefined })" />
  </div>
</template>
