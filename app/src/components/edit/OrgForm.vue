<script setup lang="ts">
// An organization's standing with the party, and once added: where else it is, what it's after, its secret and
// what joining gives. Its type, parent and seat are in the Details card beside it.
import { computed } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES, byKey } from '../../model/schema'
import { isEmpty, setField } from '../../edit'
import { playerMode } from '../../store'
import { useParts } from '../../composables/useParts'
import FieldInput from './FieldInput.vue'
import AttitudePicker from './AttitudePicker.vue'
import PartRow from './PartRow.vue'
import AddPartsBar from './AddPartsBar.vue'
import { inputValue as val } from '../../dom'
import { grow, vGrow } from '../../directives/grow'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => props.entry.fields)
const def = (k: string) => TYPES.organization.fields.find(x => x.key === k)!
const set = (key: string, v: unknown) => setField(props.entry, key, v)

const PARTS = ['presence', 'goals', 'secret', 'teaches'] as const
type Part = typeof PARTS[number]
const HINT: Partial<Record<Part, string>> = { goals: 'What they are after right now', secret: 'What the players must not find out (never shown to them)' }
const TITLE: Partial<Record<Part, string>> = { presence: 'Places besides its seat where it is active', teaches: 'Subclasses, spells, feats or items joining gives (its feats come by themselves)' }
const { shown, addable, open, close } = useParts(PARTS, k => !isEmpty(byKey(f.value)[k]), {
  // a secret is the DM's: not offered in a player's own world
  hidden: k => k === 'secret' && playerMode.value,
  onClose: k => set(k, undefined),
})
</script>

<template>
  <section class="card npc-form org-form">
    <div class="npc-who">
      <div class="sf-field"><span class="sf-label" title="How they stand with the party">Attitude to the party</span>
        <AttitudePicker type="organization" :model-value="f.attitude as string | undefined" @update:model-value="v => set('attitude', v)" />
      </div>
    </div>
    <div class="npc-roleplay">
      <PartRow v-for="k in shown" :key="k" :label="def(k).label" :dm-only="k === 'secret'" @remove="close(k)">
        <textarea v-if="k === 'goals' || k === 'secret'" v-grow rows="1" :value="(f[k] as string) ?? ''" :placeholder="HINT[k]" @input="grow($event.target as HTMLTextAreaElement)" @change="set(k, val($event).trim())" />
        <FieldInput v-else :def="def(k)" :entry="entry" />
      </PartRow>
      <AddPartsBar class="npc-add" :parts="addable" :label="k => def(k).label" :title="k => TITLE[k]" @add="open" />
    </div>
  </section>
</template>
