<script setup lang="ts">
// A race's, background's, class's or subclass's traits on its page: name, from which level, text, what each does, and
// the choices it asks for (a long list of options, such as the invocations, folded).
import type { Trait, TraitChoice } from '../model/types'
import { renderInline } from '../markdown'
import { choiceCandidates, choiceWords, subraceOption, HOW_SPECIES } from '../species'
import { ABILITY_NAME } from '../abilityBonus'
import TraitChips from './TraitChips.vue'
import MarkdownView from './MarkdownView.vue'

const props = defineProps<{ traits: Trait[]; /** On a subrace's page: its name; an option choice with an option of that name (a lineage) shows only that one. */ lineage?: string; /** The race it's a subrace of (its name is left out when matching). */ parent?: string }>()
/** The options of a choice to show: only the subrace's lineage, if it's one of them. */
const shownOptions = (c: TraitChoice) => {
  const own = props.lineage ? subraceOption(c, props.lineage, props.parent ?? '') : undefined
  return own ? [own] : c.options ?? []
}
const isLineage = (c: TraitChoice) => shownOptions(c).length === 1 && (c.options?.length ?? 0) > 1
/** Which ability the trait's spells are cast with: the player's pick, or another trait's. */
const castText = (t: Trait) => {
  const c = t.castWith!
  if (c.sameAs != null) return `Its spells are cast with the same ability as ${props.traits.find(x => x.id === c.sameAs)?.name ?? 'another trait'}.`
  const names = (c.among ?? []).map(a => ABILITY_NAME[a])
  return `Its spells are cast with ${names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names.at(-1) : names[0] ?? 'an ability'} (the player's pick).`
}
const count = (c: TraitChoice) => (c.steps?.length ? c.steps.map(x => `${x[1]} at level ${x[0]}`).join(', ') : String(c.count ?? 1))
const words = (c: TraitChoice) => choiceWords(c, (c.count ?? 1) === 1 && !c.steps?.length ? 1 : 2)
/** Text with paragraphs or lists (class features) is rendered as Markdown blocks. */
const multi = (t?: string) => !!t && /\n/.test(t)
/** How a spell choice's spells are cast: "at will, with Intelligence". */
const spellHow = (c: TraitChoice) => `${HOW_SPECIES[c.spell!.how]}${c.spell!.ability ? `, with ${ABILITY_NAME[c.spell!.ability]}` : ''}`
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
        <span v-if="t.castWith" class="muted small trait-choice">{{ castText(t) }}</span>
        <span v-if="t.spellLists?.length" class="muted small trait-choice">Spells can also come from the {{ t.spellLists.join(', ') }} spell lists.</span>
        <template v-if="t.choice">
          <span v-if="t.choice.kind !== 'option'" class="muted small trait-choice">Choose {{ count(t.choice) }} {{ words(t.choice) }}<template v-if="t.choice.among?.length"> from {{ choiceCandidates(t.choice).map(o => o.label).join(', ') }}</template><template v-if="t.choice.category"> ({{ t.choice.category }})</template><template v-if="t.choice.spell"> ({{ spellHow(t.choice) }})</template>.</span>
          <template v-else>
            <span v-if="isLineage(t.choice)" class="muted small trait-choice">{{ lineage }} (its characters have it; the others: {{ t.choice.options!.filter(o => !shownOptions(t.choice!).includes(o)).map(o => o.name).join(', ') }}):</span>
            <span v-else class="muted small trait-choice">Choose {{ count(t.choice) }}:</span>
            <component :is="shownOptions(t.choice).length > 6 ? 'details' : 'div'" class="trait-options-wrap">
              <summary v-if="shownOptions(t.choice).length > 6" class="small">{{ shownOptions(t.choice).length }} options</summary>
              <ul class="trait-options">
                <li v-for="o in shownOptions(t.choice)" :key="o.id"><b>{{ o.name }}</b> <TraitChips :t="o" />
                  <MarkdownView v-if="multi(o.text)" class="trait-md" :source="o.text!" /><span v-else-if="o.text" class="md"> — <span v-html="renderInline(o.text)" /></span>
                  <span v-for="(c, k) in o.choices ?? []" :key="k" class="muted small trait-choice">Choose {{ count(c) }} {{ words(c) }}<template v-if="c.spell"> ({{ spellHow(c) }})</template>.</span></li>
              </ul>
            </component>
          </template>
        </template>
      </dd>
    </template>
  </dl>
</template>
