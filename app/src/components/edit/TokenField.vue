<script setup lang="ts">
// A comma-separated text ("fire, cold, poison") edited as chips. Common choices are one-click toggles;
// anything else can be typed. Whatever was there before stays as its own chip, so nothing is lost.
import { computed, ref } from 'vue'

const props = defineProps<{ modelValue?: string; options?: string[]; suggestions?: string[]; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [string | undefined] }>()

/** "bludgeoning, piercing, and slashing from nonmagical attacks" is one thing, not three damage types. */
const PHYSICAL_FROM = /(?:(?:and\s+)?(?:bludgeoning|piercing|slashing)\s*,?\s*)+from\s+[^;]*$/i
const tokens = computed(() => (props.modelValue ?? '').split(';').flatMap(part => {
  const m = part.match(PHYSICAL_FROM)
  const head = m ? part.slice(0, m.index) : part
  return [...head.split(','), ...(m ? [m[0]] : [])]
}).map(t => t.trim()).filter(Boolean))
const norm = (s: string) => s.toLowerCase().replace(/^and\s+/, '')
const has = (o: string) => tokens.value.some(t => norm(t) === o.toLowerCase())
/** Chips that aren't one of the toggles. */
const others = computed(() => tokens.value.filter(t => !(props.options ?? []).some(o => o.toLowerCase() === norm(t))))
const listId = `tok-${Math.random().toString(36).slice(2, 8)}`

function save(list: string[]) { emit('update:modelValue', list.length ? list.join(', ') : undefined) }
function toggle(o: string) { save(has(o) ? tokens.value.filter(t => norm(t) !== o.toLowerCase()) : [...tokens.value, o]) }
function remove(t: string) { save(tokens.value.filter(x => x !== t)) }
const draft = ref('')
function add() {
  const v = draft.value.trim().replace(/,$/, '')
  draft.value = ''
  if (!v) return
  const known = (props.options ?? []).find(o => o.toLowerCase() === v.toLowerCase())
  if (known) { if (!has(known)) toggle(known); return }
  if (!tokens.value.includes(v)) save([...tokens.value, v])
}
</script>

<template>
  <div class="token-field">
    <div v-if="options?.length" class="token-opts">
      <button v-for="o in options" :key="o" type="button" class="token-opt" :class="{ on: has(o) }" @click="toggle(o)">{{ o }}</button>
    </div>
    <div class="token-free">
      <span v-for="t in others" :key="t" class="chip">{{ t }}<button type="button" class="x" title="Remove" @click="remove(t)">×</button></span>
      <input v-model="draft" :list="suggestions?.length ? listId : undefined" :placeholder="placeholder ?? (options?.length ? 'Other…' : 'Add…')"
             @keydown.enter.prevent="add" @keydown.,.prevent="add" @blur="add" />
      <datalist v-if="suggestions?.length" :id="listId"><option v-for="s in suggestions" :key="s" :value="s" /></datalist>
    </div>
  </div>
</template>
