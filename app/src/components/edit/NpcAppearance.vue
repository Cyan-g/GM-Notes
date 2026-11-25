<script setup lang="ts">
// An NPC's looks: race, gender and age always; hair, eyes, skin and clothing once added. What the world already
// says (black hair, golden eyes) is offered while typing. An age can be a word or worked out from a birth date.
import SuggestInput from '../SuggestInput.vue'
import { computed, ref } from 'vue'
import type { Entry } from '../../model/types'
import { TYPES } from '../../model/schema'
import { setField } from '../../edit'
import { AGES, ageOf, usedValues } from '../../npc'
import { formatDate } from '../../store'
import { useParts } from '../../composables/useParts'
import FieldInput from './FieldInput.vue'
import DateInput from './DateInput.vue'
import PartRow from './PartRow.vue'
import AddPartsBar from './AddPartsBar.vue'
import { inputValue as val } from '../../dom'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => props.entry.fields)
const set = (key: string, v: unknown) => setField(props.entry, key, v)
const raceDef = TYPES.npc.fields.find(x => x.key === 'race')!

const LOOKS = ['hair', 'eyes', 'skin', 'clothing'] as const
const label = (k: string) => TYPES.npc.fields.find(x => x.key === k)!.label
const { shown: shownLooks, addable, open, close } = useParts(LOOKS, k => !!f.value[k], { onClose: k => set(k, undefined) })
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
    <div><SuggestInput id="f-gender" :value="f.gender ?? ''" :options="suggestions('gender')" @change="set('gender', val($event).trim())" /></div>

    <label for="f-age">Age</label>
    <div>
      <SuggestInput v-if="!f.born" id="f-age" :value="f.age ?? ''" :options="[...new Set([...AGES, ...suggestions('age')])]" placeholder="a word or a number" @change="set('age', val($event).trim())" />
      <div v-if="showBorn" class="npc-born">
        <span class="muted small">born</span>
        <DateInput :model-value="f.born" @update:model-value="v => { set('born', v); if (!v) bornOpen = false }" />
      </div>
      <small v-if="age" class="muted">{{ age.atDeath ? `Died at ${age.years}` : `${age.years} years old` }} (born {{ formatDate(f.born) }})</small>
      <button v-else-if="!showBorn" type="button" class="link-btn small" title="Give a birth date instead, and the age follows the world's date" @click="bornOpen = true">＋ birth date</button>
    </div>

    <PartRow v-for="k in shownLooks" :key="k" :label="label(k)" :label-for="`f-${k}`" @remove="close(k)">
      <SuggestInput :id="`f-${k}`" :value="f[k] ?? ''" :options="suggestions(k)" @change="set(k, val($event).trim())" />
    </PartRow>
    <AddPartsBar class="full npc-add" :parts="addable" :label="label" @add="open" />
  </div>
</template>
