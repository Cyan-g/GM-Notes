<script setup lang="ts">
// How to play an NPC, on its page: traits, ideals, bonds, flaws, voice, wants; the secret for the DM only.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { TYPES } from '../model/schema'
import { playerMode } from '../store'

const props = defineProps<{ e: Entry }>()
const LINES = ['voice', 'wants', 'ideals', 'bonds', 'flaws'] as const
const label = (k: string) => TYPES.npc.fields.find(x => x.key === k)!.label
const traits = computed(() => (props.e.fields.personality as string[] | undefined) ?? [])
const lines = computed(() => LINES.filter(k => String(props.e.fields[k] ?? '').trim()))
const secret = computed(() => (playerMode.value ? '' : String(props.e.fields.secret ?? '').trim()))
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
    <div v-if="secret" class="secret npc-secret-view"><span class="secret-tag">DM only</span> <b>Secret:</b> {{ secret }}</div>
  </div>
</template>
