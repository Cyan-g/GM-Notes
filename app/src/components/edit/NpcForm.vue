<script setup lang="ts">
// An NPC's who-they-are line (occupation, attitude to the party, status) and how to play them. The roleplay parts
// show once added: an NPC with only a name isn't a page of empty boxes.
import { computed, ref } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES, byKey } from '../../model/schema'
import { changed } from '../../edit'
import { ATTITUDES, STATUSES, usedValues } from '../../npc'
import DateInput from './DateInput.vue'
import ListInput from './ListInput.vue'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => props.entry.fields)
function set(key: string, v: unknown) {
  const r = byKey(f.value)
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete r[key]
  else r[key] = v
  changed(props.entry)
}
const val = (ev: Event) => (ev.target as HTMLInputElement).value

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
const has = (k: Part) => { const v = f.value[k]; return Array.isArray(v) ? v.length > 0 : v != null && v !== '' }
const opened = ref(new Set<Part>())
const shown = computed(() => PARTS.filter(k => has(k) || opened.value.has(k)))
const addable = computed(() => PARTS.filter(k => !shown.value.includes(k)))
function open(k: Part) { opened.value = new Set([...opened.value, k]) }
function close(k: Part) { const s = new Set(opened.value); s.delete(k); opened.value = s; set(k, undefined) }
const vGrow = { mounted: (el: HTMLTextAreaElement) => requestAnimationFrame(() => grow(el)) }
function grow(el: HTMLTextAreaElement) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px' }
</script>

<template>
  <section class="card npc-form">
    <div class="npc-who">
      <label class="sf-field npc-occ"><span class="sf-label">Occupation</span>
        <input :value="f.occupation ?? ''" list="npc-occupations" placeholder="e.g. blacksmith, queen, smuggler" @change="set('occupation', val($event).trim())" />
        <datalist id="npc-occupations"><option v-for="o in occupations" :key="o" :value="o" /></datalist>
      </label>
      <div class="sf-field"><span class="sf-label" title="How they stand with the party">Attitude</span>
        <div class="seg">
          <button v-for="a in ATTITUDES" :key="a" type="button" :class="['att-' + a.toLowerCase(), { on: f.attitude === a }]" @click="set('attitude', f.attitude === a ? undefined : a)">{{ a }}</button>
        </div>
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
      <div v-for="k in shown" :key="k" class="npc-part" :class="{ 'npc-secret': k === 'secret' }">
        <span class="sf-label">{{ label(k) }}<span v-if="k === 'secret'" class="badge dm-only">DM only</span></span>
        <ListInput v-if="k === 'personality'" :model-value="f.personality ?? []" :options="traits" :placeholder="HINT[k]" @update:model-value="v => set('personality', v)" />
        <textarea v-else v-grow rows="1" :value="f[k] ?? ''" :placeholder="HINT[k]" @input="grow($event.target as HTMLTextAreaElement)" @change="set(k, val($event).trim())" />
        <button type="button" class="x" :title="`Remove ${label(k).toLowerCase()}`" @click="close(k)">×</button>
      </div>
      <div v-if="addable.length" class="npc-add">
        <span v-if="!shown.length" class="muted small">How to play them:</span>
        <button v-for="k in addable" :key="k" type="button" class="chip-btn" @click="open(k)">＋ {{ label(k) }}</button>
      </div>
    </div>
  </section>
</template>
