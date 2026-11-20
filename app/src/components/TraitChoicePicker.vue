<script setup lang="ts">
// A trait's choice, as many picks as it takes at the trait's level (Expertise: 2, then 4). Options (invocations,
// Metamagic, a lineage) and feats (a Fighting Style) are a list to tick, each with its text, a prerequisite level it
// names and a filter for long lists; skills, languages, tools, spells and weapons are dropdowns. A count says how many
// are picked. Used on the Edit page and in the creation wizard.
import { computed, ref } from 'vue'
import type { TraitOption } from '../model/types'
import { choiceCandidates, choiceCount, choiceWords, type ActiveTrait } from '../species'
import { get } from '../store'
import MarkdownView from './MarkdownView.vue'
import EntryLink from './EntryLink.vue'
import TraitChips from './TraitChips.vue'

const props = defineProps<{ a: ActiveTrait; disabled?: boolean }>()
const emit = defineEmits<{ pick: [picks: string[]] }>()
const c = computed(() => props.a.trait.choice!)
const n = computed(() => choiceCount(props.a))
const options = computed(() => choiceCandidates(c.value))
const words = computed(() => choiceWords(c.value, n.value))
const picked = computed(() => props.a.picks.filter(Boolean).length)
const full = computed(() => picked.value >= n.value)

// ---- dropdowns (skills, languages, tools, spells, weapons) ----
function set(slot: number, id: string) {
  const picks = [...props.a.picks]
  picks[slot] = id
  emit('pick', picks.filter(Boolean))
}

// ---- a list to tick (options and feats) ----
const listed = computed(() => c.value.kind === 'option' || c.value.kind === 'feat')
const filter = ref('')
/** Its text without the SRD's source line, and the level its prerequisite names ("*Prerequisite: Level 5+ Warlock*"). */
interface Row { id: string; label: string; text: string; needs?: number; prereq?: string; option?: TraitOption }
const rows = computed<Row[]>(() => options.value.map(o => {
  const option = c.value.kind === 'option' ? c.value.options?.find(x => x.id === o.id) : undefined
  let text = String(option ? option.text ?? '' : get(o.id)?.fields.summary ?? '').replace(/\s*\*?Source: System Reference Document[^*]*\*?\s*$/i, '').trim()
  const m = text.match(/^\*Prerequisite:\s*([^*]+)\*\s*/i)
  if (m) text = text.slice(m[0].length)
  const lv = m?.[1].match(/Level (\d+)\+/i)
  return { id: o.id, label: o.label, text, ...(m ? { prereq: m[1].trim() } : {}), ...(lv ? { needs: Number(lv[1]) } : {}), ...(option ? { option } : {}) }
}))
const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return q ? rows.value.filter(r => r.label.toLowerCase().includes(q) || r.text.toLowerCase().includes(q)) : rows.value
})
/** The first sentence, shown on the row; the rest folds away. */
const lead = (t: string) => t.match(/^[^.!?]*[.!?]/)?.[0] ?? t
function toggle(id: string) {
  if (props.disabled) return
  const now = props.a.picks.filter(Boolean)
  if (now.includes(id)) return emit('pick', now.filter(x => x !== id))
  if (n.value === 1) return emit('pick', [id])
  if (!full.value) emit('pick', [...now, id])
}
</script>

<template>
  <div class="sp-choice" :class="{ 'sp-choice-list': listed }">
    <div class="sp-pick-head small">
      <span class="muted">Choose {{ n }} {{ words }}</span>
      <b class="sp-count" :class="{ done: full }">{{ picked }} of {{ n }} picked</b>
      <input v-if="listed && rows.length > 8" v-model="filter" class="sp-filter" type="search" placeholder="Filter…" :aria-label="`Filter the ${words}`" />
    </div>

    <!-- options and feats: a list with their text -->
    <div v-if="listed" class="sp-optlist" role="group" :aria-label="a.trait.name">
      <label v-for="r in shown" :key="r.id" class="sp-opt" :class="{ on: a.picks.includes(r.id), off: !a.picks.includes(r.id) && full && n > 1, early: r.needs && r.needs > a.level }">
        <input :type="n === 1 ? 'radio' : 'checkbox'" :name="a.key" :checked="a.picks.includes(r.id)" :disabled="disabled || (!a.picks.includes(r.id) && full && n > 1)" @change="toggle(r.id)" />
        <span class="sp-opt-body">
          <span class="sp-opt-head"><b>{{ r.label }}</b>
            <span v-if="r.prereq" class="sp-prereq" :title="r.needs && r.needs > a.level ? `Needs level ${r.needs}; this character's is ${a.level}` : 'Prerequisite'">{{ r.prereq }}</span>
            <TraitChips v-if="r.option" :t="r.option" no-grants /></span>
          <span v-if="r.text" class="muted small sp-opt-lead">{{ lead(r.text) }}</span>
          <details v-if="r.text.length > lead(r.text).length + 2" class="sp-opt-more" @click.stop><summary class="small">more</summary><MarkdownView class="small" :source="r.text" /></details>
        </span>
      </label>
      <p v-if="!shown.length" class="muted small">Nothing matches “{{ filter }}”.</p>
    </div>

    <!-- everything else: one dropdown per pick -->
    <div v-else class="sp-pick-selects">
      <select v-for="k in n" :key="k" :value="a.picks[k - 1] ?? ''" :disabled="disabled" :aria-label="`${a.trait.name}: pick ${k}`" @change="set(k - 1, ($event.target as HTMLSelectElement).value)">
        <option value="">—</option>
        <option v-for="o in options" :key="o.id" :value="o.id" :disabled="a.picks.includes(o.id) && a.picks[k - 1] !== o.id">{{ o.label }}</option>
      </select>
      <template v-if="c.kind === 'spell'"><EntryLink v-for="id in a.picks" :key="id" :id="id" /></template>
    </div>
  </div>
</template>
