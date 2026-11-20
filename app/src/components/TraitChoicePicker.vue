<script setup lang="ts">
// A trait's choice, as dropdowns: as many as it takes at the trait's level (Expertise: 2, then 4), from its candidates
// (skills, languages, tools, one or more options such as Metamagic, a Fighting Style feat, weapons to master). The
// chosen options show their text. Used on the sheet's cards and in the creation wizard.
import { computed } from 'vue'
import { choiceCandidates, choiceCount, CHOICE_WORDS, type ActiveTrait } from '../species'
import MarkdownView from './MarkdownView.vue'
import EntryLink from './EntryLink.vue'
import TraitChips from './TraitChips.vue'

const props = defineProps<{ a: ActiveTrait; disabled?: boolean }>()
const emit = defineEmits<{ pick: [picks: string[]] }>()
const c = computed(() => props.a.trait.choice!)
const n = computed(() => choiceCount(props.a))
const options = computed(() => choiceCandidates(c.value))
function set(slot: number, id: string) {
  const picks = [...props.a.picks]
  picks[slot] = id
  emit('pick', picks.filter(Boolean))
}
const words = computed(() => CHOICE_WORDS[c.value.kind][n.value === 1 ? 0 : 1])
</script>

<template>
  <div class="sp-choice">
    <span class="small muted">Choose {{ n }} {{ words }}:</span>
    <select v-for="k in n" :key="k" :value="a.picks[k - 1] ?? ''" :disabled="disabled" :aria-label="`Choice ${k}`" @change="set(k - 1, ($event.target as HTMLSelectElement).value)">
      <option value="">—</option>
      <option v-for="o in options" :key="o.id" :value="o.id" :disabled="a.picks.includes(o.id) && a.picks[k - 1] !== o.id">{{ o.label }}</option>
    </select>
    <template v-if="c.kind === 'feat'"><EntryLink v-for="id in a.picks" :key="id" :id="id" /></template>
    <details v-for="o in a.options" :key="o.id" class="sp-option">
      <summary class="small"><b>{{ o.name }}</b> <TraitChips :t="o" no-grants /></summary>
      <MarkdownView v-if="o.text" class="small" :source="o.text" />
    </details>
  </div>
</template>
