<script setup lang="ts">
// A value that changes with the level ("from level 2: 3, from level 5: 5"), as a small table: one row per level it
// changes at, with + Level to add one; and the same in words underneath. Used for counts by level (invocations,
// uses) and scaling values (Rage Damage +2, Sneak Attack 1d6).
import { computed } from 'vue'

type V = number | string
const props = defineProps<{ numeric?: boolean; placeholder?: string; label?: string }>()
const model = defineModel<[number, V][] | undefined>()
const rows = computed(() => model.value ?? [])
const save = (l: [number, V][]) => {
  const out = l.filter(([lv]) => lv >= 1 && lv <= 20).sort((a, b) => a[0] - b[0])
  model.value = out.length ? out : undefined
}
const setLevel = (i: number, v: string) => save(rows.value.map((r, k) => (k === i ? [Math.min(20, Math.max(1, Number(v) || 1)), r[1]] : r)) as [number, V][])
const setValue = (i: number, v: string) => save(rows.value.map((r, k) => (k === i ? [r[0], props.numeric ? Number(v) || 0 : v.trim()] : r)) as [number, V][])
const remove = (i: number) => save(rows.value.filter((_, k) => k !== i))
/** A new row at the level after the last one, with its value. */
const add = () => { const last = rows.value.at(-1); save([...rows.value, [Math.min(20, (last?.[0] ?? 0) + 1), last?.[1] ?? (props.numeric ? 1 : '')]]) }
const words = computed(() => rows.value.map(([l, v]) => `${v} at level ${l}`).join(', '))
</script>

<template>
  <div class="steps-edit">
    <div v-for="(r, i) in rows" :key="i" class="steps-row">
      <label class="small">Lv <input type="number" min="1" max="20" class="steps-lv" :value="r[0]" :aria-label="`${label ?? 'Value'}: level`" @change="setLevel(i, ($event.target as HTMLInputElement).value)" /></label>
      <span class="muted">→</span>
      <input :type="numeric ? 'number' : 'text'" class="steps-val" :value="r[1]" :placeholder="placeholder" :aria-label="`${label ?? 'Value'} from level ${r[0]}`" @change="setValue(i, ($event.target as HTMLInputElement).value)" />
      <button type="button" class="link-btn" title="Remove this level" @click="remove(i)">×</button>
    </div>
    <button type="button" class="chip-btn" @click="add">+ Level</button>
    <span v-if="rows.length" class="muted small steps-words">{{ words }}</span>
  </div>
</template>
