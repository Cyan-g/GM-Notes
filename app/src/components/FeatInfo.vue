<script setup lang="ts">
// Under a feat's card on its page: who has it — the backgrounds it's the Origin feat of, the entry that grants it,
// the characters who took it — and "Copy as new feat" for a DM to start a homebrew one from it.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { byType, get, playerMode, state } from '../store'
import { featsOfCharacter } from '../species'
import { changed, createEntry } from '../edit'
import { go, hrefEntry } from '../router'
import EntryLink from './EntryLink.vue'

const props = defineProps<{ e: Entry }>()
const origins = computed(() => (byType.value.get('background') ?? []).filter(b => b.fields.originFeat === props.e.id))
const grantedBy = computed(() => get(props.e.fields.source))
const takenBy = computed(() => (byType.value.get('pc') ?? []).filter(pc => featsOfCharacter(pc).some(f => f.id === props.e.id)).sort((a, b) => a.name.localeCompare(b.name)))
const canEdit = computed(() => !state.readOnly && !playerMode.value)
function copy() {
  const n = createEntry('feat', `${props.e.name} (copy)`, JSON.parse(JSON.stringify(props.e.fields)))
  n.body = String(props.e.body ?? '')
  if (typeof n.fields.summary === 'string') n.fields.summary = n.fields.summary.replace(/\s*\*Source: System Reference Document[^*]*\*\s*$/i, '').trim()
  changed(n)
  go(hrefEntry(n.id) + '/edit')
}
</script>

<template>
  <section class="feat-info">
    <dl v-if="origins.length || grantedBy || takenBy.length">
      <template v-if="origins.length"><dt>Origin feat of</dt><dd><template v-for="(b, i) in origins" :key="b.id"><template v-if="i">, </template><EntryLink :id="b.id" /><span v-if="b.fields.originFeatNote" class="muted"> ({{ b.fields.originFeatNote }})</span></template></dd></template>
      <template v-if="grantedBy"><dt>Granted by</dt><dd><EntryLink :id="grantedBy.id" /></dd></template>
      <template v-if="takenBy.length"><dt>Taken by</dt><dd><template v-for="(p, i) in takenBy" :key="p.id"><template v-if="i">, </template><EntryLink :id="p.id" /></template></dd></template>
    </dl>
    <button v-if="canEdit" type="button" class="chip-btn" title="A new feat with the same fields, text and features, to make your own from" @click="copy">Copy as new feat</button>
  </section>
</template>
