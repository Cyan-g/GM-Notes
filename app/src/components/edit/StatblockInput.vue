<script setup lang="ts">
// Edits a 5e statblock. Basic numbers are always visible; the rest folds open.
import { computed } from 'vue'
import type { Abilities, Feature, Statblock } from '../../model/types'

const props = defineProps<{ modelValue?: Statblock }>()
const emit = defineEmits<{ 'update:modelValue': [Statblock | undefined] }>()
const sb = computed<Statblock>(() => props.modelValue ?? {})

function set<K extends keyof Statblock>(key: K, v: Statblock[K] | undefined) {
  const next: Statblock = { ...sb.value }
  if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete next[key]
  else next[key] = v
  emit('update:modelValue', Object.keys(next).length ? next : undefined)
}
const num = (raw: string) => (raw === '' ? undefined : Number(raw))

const ABIL: (keyof Abilities)[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const mod = (v?: number) => { if (v == null) return ''; const m = Math.floor((v - 10) / 2); return `${m >= 0 ? '+' : ''}${m}` }
function setAbility(k: keyof Abilities, raw: string) {
  const a: Abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...(sb.value.abilities ?? {}) }
  a[k] = raw === '' ? 10 : Number(raw)
  set('abilities', a)
}

const TEXTS: [keyof Statblock, string][] = [
  ['size', 'Size'], ['creatureType', 'Type'], ['alignment', 'Alignment'], ['hitDice', 'Hit dice'], ['speed', 'Speed'],
  ['saves', 'Saving throws'], ['skills', 'Skills'], ['resistances', 'Resistances'], ['immunities', 'Immunities'],
  ['conditionImmunities', 'Condition immunities'], ['senses', 'Senses'], ['languages', 'Languages'], ['cr', 'Challenge'],
  ['srd', 'SRD monster'],
]
const FEATS: [keyof Statblock, string][] = [['traits', 'Traits'], ['actions', 'Actions'], ['bonusActions', 'Bonus actions'], ['reactions', 'Reactions'], ['legendary', 'Legendary actions']]
const feats = (k: keyof Statblock) => (sb.value[k] as Feature[] | undefined) ?? []
function setFeat(k: keyof Statblock, i: number, patch: Partial<Feature>) {
  set(k, feats(k).map((f, j) => (j === i ? { ...f, ...patch } : f)) as any)
}
function addFeat(k: keyof Statblock) { set(k, [...feats(k), { name: '', text: '' }] as any) }
function removeFeat(k: keyof Statblock, i: number) { set(k, feats(k).filter((_, j) => j !== i) as any) }
const hasMore = computed(() => TEXTS.some(([k]) => sb.value[k]) || FEATS.some(([k]) => feats(k).length))
</script>

<template>
  <div class="sb-edit">
    <div class="sb-edit-row">
      <label>AC <input type="number" class="short" :value="sb.ac ?? ''" @change="set('ac', num(($event.target as HTMLInputElement).value))" /></label>
      <label>HP <input type="number" class="short" :value="sb.hp ?? ''" @change="set('hp', num(($event.target as HTMLInputElement).value))" /></label>
    </div>
    <div class="sb-edit-abil">
      <label v-for="a in ABIL" :key="a">
        <b>{{ a.toUpperCase() }}</b>
        <input type="number" :value="sb.abilities?.[a] ?? ''" placeholder="10" @change="setAbility(a, ($event.target as HTMLInputElement).value)" />
        <span class="muted small">{{ mod(sb.abilities?.[a]) }}</span>
      </label>
    </div>
    <details :open="hasMore">
      <summary>Full statblock</summary>
      <div class="sb-edit-grid">
        <label v-for="[k, label] in TEXTS" :key="k">
          <span>{{ label }}</span>
          <input :value="(sb[k] as string) ?? ''" @change="set(k, ($event.target as HTMLInputElement).value as any)" />
        </label>
      </div>
      <div v-for="[k, label] in FEATS" :key="k" class="sb-edit-feats">
        <h4>{{ label }}</h4>
        <div v-for="(f, i) in feats(k)" :key="i" class="feat-edit">
          <input :value="f.name" placeholder="Name" @change="setFeat(k, i, { name: ($event.target as HTMLInputElement).value })" />
          <button type="button" class="x" title="Remove" @click="removeFeat(k, i)">×</button>
          <textarea rows="2" :value="f.text" placeholder="What it does" @change="setFeat(k, i, { text: ($event.target as HTMLTextAreaElement).value })" />
        </div>
        <button type="button" class="link-btn" @click="addFeat(k)">＋ Add {{ label.toLowerCase().replace(/s$/, '') }}</button>
      </div>
    </details>
  </div>
</template>
