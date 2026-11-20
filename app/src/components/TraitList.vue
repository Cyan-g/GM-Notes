<script setup lang="ts">
// A race's traits on its page: name, from which level, text, what each does, and the choices it asks for.
import type { Trait } from '../model/types'
import { renderInline } from '../markdown'
import { GRANT_KINDS, grantLabel } from '../species'
import TraitChips from './TraitChips.vue'

defineProps<{ traits: Trait[] }>()
const plural = (k: string, n: number) => { const g = GRANT_KINDS.find(x => x.id === k); return n === 1 ? g?.label.toLowerCase() : g?.plural }
</script>

<template>
  <dl class="trait-list">
    <template v-for="t in traits" :key="t.id">
      <dt>{{ t.name }} <span v-if="(t.level ?? 1) > 1" class="muted small">from level {{ t.level }}</span></dt>
      <dd>
        <span v-if="t.text" class="md" v-html="renderInline(t.text)" />
        <TraitChips :t="t" />
        <template v-if="t.choice">
          <span v-if="t.choice.kind !== 'option'" class="muted small trait-choice">Choose {{ t.choice.count ?? 1 }} {{ plural(t.choice.kind, t.choice.count ?? 1) }}<template v-if="t.choice.among?.length"> from {{ t.choice.among.map(id => grantLabel({ kind: t.choice!.kind as 'skill', id })).join(', ') }}</template>.</span>
          <template v-else>
            <span class="muted small trait-choice">Choose one:</span>
            <ul class="trait-options">
              <li v-for="o in t.choice.options ?? []" :key="o.id"><b>{{ o.name }}</b><span v-if="o.text" class="md"> — <span v-html="renderInline(o.text)" /></span> <TraitChips :t="o" /></li>
            </ul>
          </template>
        </template>
      </dd>
    </template>
  </dl>
</template>
