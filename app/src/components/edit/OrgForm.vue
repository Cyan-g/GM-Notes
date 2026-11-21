<script setup lang="ts">
// An organization's standing with the party, and once added: where else it is, what it's after, its secret and
// what joining gives. Its type, parent and seat are in the Details card beside it.
import { computed, ref } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES, byKey } from '../../model/schema'
import { isEmpty, setField } from '../../edit'
import { playerMode } from '../../store'
import { ATTITUDES } from '../../npc'
import FieldInput from './FieldInput.vue'
import { inputValue as val } from '../../dom'
import { grow, vGrow } from '../../directives/grow'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => props.entry.fields)
const def = (k: string) => TYPES.organization.fields.find(x => x.key === k)!
const set = (key: string, v: unknown) => setField(props.entry, key, v)

const PARTS = ['presence', 'goals', 'secret', 'teaches'] as const
type Part = typeof PARTS[number]
const HINT: Partial<Record<Part, string>> = { goals: 'What they are after right now', secret: 'What the players must not find out (never shown to them)' }
const has = (k: Part) => !isEmpty(byKey(f.value)[k])
const opened = ref(new Set<Part>())
const shown = computed(() => PARTS.filter(k => has(k) || opened.value.has(k)))
// a secret is the DM's: not offered in a player's own world
const addable = computed(() => PARTS.filter(k => !shown.value.includes(k) && !(k === 'secret' && playerMode.value)))
function open(k: Part) { opened.value = new Set([...opened.value, k]) }
function close(k: Part) { const s = new Set(opened.value); s.delete(k); opened.value = s; set(k, undefined) }
</script>

<template>
  <section class="card npc-form org-form">
    <div class="npc-who">
      <div class="sf-field"><span class="sf-label" title="How they stand with the party">Attitude to the party</span>
        <div class="seg">
          <button v-for="a in ATTITUDES" :key="a" type="button" :class="['att-' + a.toLowerCase(), { on: f.attitude === a }]" @click="set('attitude', f.attitude === a ? undefined : a)">{{ a }}</button>
        </div>
      </div>
    </div>
    <div class="npc-roleplay">
      <div v-for="k in shown" :key="k" class="npc-part" :class="{ 'npc-secret': k === 'secret' }">
        <span class="sf-label">{{ def(k).label }}<span v-if="k === 'secret'" class="badge dm-only">DM only</span></span>
        <textarea v-if="k === 'goals' || k === 'secret'" v-grow rows="1" :value="(f[k] as string) ?? ''" :placeholder="HINT[k]" @input="grow($event.target as HTMLTextAreaElement)" @change="set(k, val($event).trim())" />
        <FieldInput v-else :def="def(k)" :entry="entry" />
        <button type="button" class="x" :title="`Remove ${def(k).label.toLowerCase()}`" @click="close(k)">×</button>
      </div>
      <div v-if="addable.length" class="npc-add">
        <button v-for="k in addable" :key="k" type="button" class="chip-btn" :title="k === 'presence' ? 'Places besides its seat where it is active' : k === 'teaches' ? 'Subclasses, spells, feats or items joining gives (its feats come by themselves)' : undefined" @click="open(k)">＋ {{ def(k).label }}</button>
      </div>
    </div>
  </section>
</template>
