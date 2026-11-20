<script setup lang="ts">
// A race's, background's, class's or subclass's traits on its page: name, from which level, text, what each does, and
// the choices it asks for (a long list of options, such as the invocations, folded).
import type { Trait, TraitChoice } from '../model/types'
import { renderInline } from '../markdown'
import { CHOICE_WORDS, choiceCandidates } from '../species'
import TraitChips from './TraitChips.vue'
import MarkdownView from './MarkdownView.vue'

defineProps<{ traits: Trait[] }>()
const count = (c: TraitChoice) => (c.steps?.length ? c.steps.map(x => `${x[1]} at level ${x[0]}`).join(', ') : String(c.count ?? 1))
const words = (c: TraitChoice) => CHOICE_WORDS[c.kind][(c.count ?? 1) === 1 && !c.steps?.length ? 0 : 1]
/** Text with paragraphs or lists (class features) is rendered as Markdown blocks. */
const multi = (t?: string) => !!t && /\n/.test(t)
const scale = (t: Trait) => t.scale ? `${t.scale.label}: ${t.scale.steps.map(([l, v]) => `${v} (${l})`).join(', ')}` : ''
</script>

<template>
  <dl class="trait-list">
    <template v-for="t in traits" :key="t.id">
      <dt>{{ t.name }} <span v-if="(t.level ?? 1) > 1" class="muted small">from level {{ t.level }}</span></dt>
      <dd>
        <MarkdownView v-if="multi(t.text)" class="trait-md" :source="t.text!" />
        <span v-else-if="t.text" class="md" v-html="renderInline(t.text)" />
        <TraitChips :t="t" />
        <span v-if="t.scale" class="muted small trait-choice">{{ scale(t) }}</span>
        <template v-if="t.choice">
          <span v-if="t.choice.kind !== 'option'" class="muted small trait-choice">Choose {{ count(t.choice) }} {{ words(t.choice) }}<template v-if="t.choice.among?.length"> from {{ choiceCandidates(t.choice).map(o => o.label).join(', ') }}</template><template v-if="t.choice.category"> ({{ t.choice.category }})</template>.</span>
          <template v-else>
            <span class="muted small trait-choice">Choose {{ count(t.choice) }}:</span>
            <component :is="(t.choice.options?.length ?? 0) > 6 ? 'details' : 'div'" class="trait-options-wrap">
              <summary v-if="(t.choice.options?.length ?? 0) > 6" class="small">{{ t.choice.options!.length }} options</summary>
              <ul class="trait-options">
                <li v-for="o in t.choice.options ?? []" :key="o.id"><b>{{ o.name }}</b> <TraitChips :t="o" />
                  <MarkdownView v-if="multi(o.text)" class="trait-md" :source="o.text!" /><span v-else-if="o.text" class="md"> — <span v-html="renderInline(o.text)" /></span></li>
              </ul>
            </component>
          </template>
        </template>
      </dd>
    </template>
  </dl>
</template>
