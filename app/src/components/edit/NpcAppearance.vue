<script setup lang="ts">
// An NPC's looks: race, gender and age always; hair, eyes, skin and clothing once added. What the world already
// says (black hair, golden eyes) is offered while typing. An age can be a word or worked out from a birth date.
import { computed, ref } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES } from '../../model/schema'
import { setField } from '../../edit'
import { AGES, ageOf, usedValues } from '../../npc'
import { formatDate } from '../../store'
import FieldInput from './FieldInput.vue'
import DateInput from './DateInput.vue'
import { inputValue as val } from '../../dom'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => props.entry.fields)
const set = (key: string, v: unknown) => setField(props.entry, key, v)
const raceDef = TYPES.npc.fields.find(x => x.key === 'race')!

const LOOKS = ['hair', 'eyes', 'skin', 'clothing'] as const
type Look = typeof LOOKS[number]
const label = (k: string) => TYPES.npc.fields.find(x => x.key === k)!.label
const opened = ref(new Set<string>())
const shownLooks = computed(() => LOOKS.filter(k => f.value[k] || opened.value.has(k)))
const addable = computed(() => LOOKS.filter(k => !shownLooks.value.includes(k)))
function open(k: string) { opened.value = new Set([...opened.value, k]) }
function close(k: Look) { const s = new Set(opened.value); s.delete(k); opened.value = s; set(k, undefined) }
const suggestions = (k: string) => usedValues(k)

const bornOpen = ref(false)
const showBorn = computed(() => !!f.value.born || bornOpen.value)
const age = computed(() => ageOf(props.entry))
</script>

<template>
  <div class="form-grid npc-looks">
    <label for="f-race">Race</label>
    <div><FieldInput id="f-race" :def="raceDef" :entry="entry" /></div>

    <label for="f-gender">Gender</label>
    <div><input id="f-gender" :value="f.gender ?? ''" list="npc-dl-gender" @change="set('gender', val($event).trim())" />
      <datalist id="npc-dl-gender"><option v-for="v in suggestions('gender')" :key="v" :value="v" /></datalist></div>

    <label for="f-age">Age</label>
    <div>
      <input v-if="!f.born" id="f-age" :value="f.age ?? ''" list="npc-dl-age" placeholder="a word or a number" @change="set('age', val($event).trim())" />
      <datalist id="npc-dl-age"><option v-for="v in [...new Set([...AGES, ...suggestions('age')])]" :key="v" :value="v" /></datalist>
      <div v-if="showBorn" class="npc-born">
        <span class="muted small">born</span>
        <DateInput :model-value="f.born" @update:model-value="v => { set('born', v); if (!v) bornOpen = false }" />
      </div>
      <small v-if="age" class="muted">{{ age.atDeath ? `Died at ${age.years}` : `${age.years} years old` }} (born {{ formatDate(f.born) }})</small>
      <button v-else-if="!showBorn" type="button" class="link-btn small" title="Give a birth date instead, and the age follows the world's date" @click="bornOpen = true">＋ birth date</button>
    </div>

    <template v-for="k in shownLooks" :key="k">
      <label :for="`f-${k}`">{{ label(k) }}</label>
      <div class="npc-look"><input :id="`f-${k}`" :value="f[k] ?? ''" :list="`npc-dl-${k}`" @change="set(k, val($event).trim())" />
        <datalist :id="`npc-dl-${k}`"><option v-for="v in suggestions(k)" :key="v" :value="v" /></datalist>
        <button type="button" class="x" :title="`Remove ${label(k).toLowerCase()}`" @click="close(k)">×</button></div>
    </template>
    <div v-if="addable.length" class="full npc-add">
      <button v-for="k in addable" :key="k" type="button" class="chip-btn" @click="open(k)">＋ {{ label(k) }}</button>
    </div>
  </div>
</template>
