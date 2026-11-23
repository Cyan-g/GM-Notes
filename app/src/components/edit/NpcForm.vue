<script setup lang="ts">
// An NPC's who-they-are line (occupation, attitude to the party, status) and how to play them. The roleplay parts
// show once added: an NPC with only a name isn't a page of empty boxes.
import LinkTextarea from './LinkTextarea.vue'
import { computed } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES } from '../../model/schema'
import { isEmpty, setField } from '../../edit'
import { playerMode } from '../../store'
import { STATUSES, usedValues } from '../../npc'
import { useParts } from '../../composables/useParts'
import DateInput from './DateInput.vue'
import ListInput from './ListInput.vue'
import AttitudePicker from './AttitudePicker.vue'
import PartRow from './PartRow.vue'
import AddPartsBar from './AddPartsBar.vue'
import { inputValue as val } from '../../dom'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => props.entry.fields)
const set = (key: string, v: unknown) => setField(props.entry, key, v)

const occupations = computed(() => usedValues('occupation', ['npc']))
const statuses = computed(() => [...new Set([...STATUSES, ...usedValues('status', ['npc'])])])
const traits = computed(() => usedValues('personality', ['npc']))
const living = computed(() => !f.value.status || String(f.value.status).toLowerCase() === 'alive')

// ---- roleplay: the parts added so far, and the rest as + buttons ----
const PARTS = ['personality', 'ideals', 'bonds', 'flaws', 'voice', 'wants', 'secret'] as const
type Part = typeof PARTS[number]
const label = (k: Part) => TYPES.npc.fields.find(x => x.key === k)!.label
const HINT: Record<Part, string> = {
  personality: 'Add a trait…', ideals: 'What they believe in', bonds: 'Who or what they care about', flaws: 'Their weakness',
  voice: 'How they talk and move: an accent, a habit, a catchphrase', wants: 'What they are after right now', secret: 'What the players must not find out (never shown to them)',
}
const { shown, addable, open, close } = useParts(PARTS, k => !isEmpty(f.value[k]), {
  // a secret is the DM's: not offered in a player's own world
  hidden: k => k === 'secret' && playerMode.value,
  onClose: k => set(k, undefined),
})
</script>

<template>
  <section class="card npc-form">
    <div class="npc-who">
      <label class="sf-field npc-occ"><span class="sf-label">Occupation</span>
        <input :value="f.occupation ?? ''" list="npc-occupations" placeholder="e.g. blacksmith, queen, smuggler" @change="set('occupation', val($event).trim())" />
        <datalist id="npc-occupations"><option v-for="o in occupations" :key="o" :value="o" /></datalist>
      </label>
      <div class="sf-field"><span class="sf-label" title="How they stand with the party">Attitude</span>
        <AttitudePicker type="npc" :model-value="f.attitude" @update:model-value="v => set('attitude', v)" />
      </div>
      <label class="sf-field npc-status"><span class="sf-label">Status</span>
        <input :value="f.status ?? ''" list="npc-statuses" placeholder="Alive" title="Pick one or type your own" @change="set('status', val($event).trim())" />
        <datalist id="npc-statuses"><option v-for="s in statuses" :key="s" :value="s" /></datalist>
      </label>
      <label v-if="!living" class="sf-field"><span class="sf-label">Since</span>
        <DateInput :model-value="f.statusSince" @update:model-value="v => set('statusSince', v)" />
      </label>
    </div>

    <div class="npc-roleplay">
      <PartRow v-for="k in shown" :key="k" :label="label(k)" :dm-only="k === 'secret'" @remove="close(k)">
        <ListInput v-if="k === 'personality'" :model-value="f.personality ?? []" :options="traits" :placeholder="HINT[k]" @update:model-value="v => set('personality', v)" />
        <LinkTextarea v-else grow rows="1" :value="f[k] ?? ''" :placeholder="HINT[k]" @change="set(k, val($event).trim())" />
      </PartRow>
      <AddPartsBar class="npc-add" :parts="addable" :label="label" :lead="shown.length ? undefined : 'How to play them:'" @add="open" />
    </div>
  </section>
</template>
