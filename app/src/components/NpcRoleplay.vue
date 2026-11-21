<script setup lang="ts">
// How to play an NPC, on its page: traits, ideals, bonds, flaws, voice, wants; the secret for the DM only.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { TYPES } from '../model/schema'
import { secretText } from '../npc'
import SecretNote from './SecretNote.vue'

const props = defineProps<{ e: Entry }>()
const LINES = ['voice', 'wants', 'ideals', 'bonds', 'flaws'] as const
const label = (k: string) => TYPES.npc.fields.find(x => x.key === k)!.label
const traits = computed(() => (props.e.fields.personality as string[] | undefined) ?? [])
const lines = computed(() => LINES.filter(k => String(props.e.fields[k] ?? '').trim()))
const secret = computed(() => secretText(props.e.fields.secret))
const any = computed(() => traits.value.length || lines.value.length || secret.value)
</script>

<template>
  <div v-if="any" class="card npc-play">
    <h3>Playing them</h3>
    <div v-if="traits.length" class="chips npc-traits"><span v-for="t in traits" :key="t" class="chip">{{ t }}</span></div>
    <dl>
      <template v-for="k in lines" :key="k">
        <dt>{{ label(k) }}</dt>
        <dd>{{ e.fields[k] }}</dd>
      </template>
    </dl>
    <SecretNote :text="e.fields.secret" />
  </div>
</template>
