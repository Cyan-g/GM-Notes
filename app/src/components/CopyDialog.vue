<script setup lang="ts">
// Copy an entry to another of your worlds (copyToWorld.ts): pick the world, see what it lacks of what the entry uses
// (copy those too, or copy anyway with them as plain names), and the app switches there to finish in the import
// preview.
import { computed, ref, watch } from 'vue'
import type { Id } from '../model/types'
import { SCHEMA } from '../model/schema'
import { get } from '../store'
import { loadWorlds, worlds, type KnownWorld } from '../worlds'
import { desktop } from '../storage/desktop'
import { copyPlan, copyTo, hasIn, missingIn, type TheirEntry } from '../copyToWorld'
import TypeIcon from './TypeIcon.vue'
import EntryLink from './EntryLink.vue'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ id: Id }>()
const e = computed(() => get(props.id))
const others = computed(() => worlds.list.filter(w => !w.current && w.exists))
const target = ref<KnownWorld | null>(null)
const theirs = ref<TheirEntry[] | null>(null)
const withMissing = ref(true)
const busy = ref(''), error = ref('')

watch(open, async v => {
  if (!v) return
  target.value = null; theirs.value = null; error.value = ''; withMissing.value = true
  await loadWorlds()
  if (others.value.length === 1) pick(others.value[0])
}, { immediate: true })
async function pick(w: KnownWorld) {
  target.value = w; theirs.value = null; error.value = ''
  try { theirs.value = await desktop!.worlds.entries(w.dir) } catch (err) { error.value = (err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }
}

const plan = computed(() => (open.value ? copyPlan(props.id) : null))
/** What it uses that the other world lacks, by type. */
const missing = computed(() => (plan.value && theirs.value ? missingIn(plan.value, theirs.value) : []))
const missingByType = computed(() => SCHEMA.map(t => ({ t, list: missing.value.filter(x => x.type === t.type) })).filter(g => g.list.length))
/** Whether the other world has this entry already (the copy then updates it, in the preview). */
const there = computed(() => !!e.value && !!theirs.value && hasIn(e.value, theirs.value))
/** What goes: everything it uses, or without what the other world lacks. */
const count = computed(() => (plan.value ? plan.value.entries.length - (withMissing.value ? 0 : missing.value.length) : 0))

async function go() {
  if (!target.value || !theirs.value) return
  busy.value = 'Copying…'; error.value = ''
  try { await copyTo(target.value, props.id, withMissing.value ? undefined : new Set(missing.value.map(x => x.id))) } catch (err) { error.value = (err as Error).message; busy.value = '' }
}
</script>

<template>
  <div v-if="open && e && plan" class="qs-backdrop" @mousedown.self="open = false" @keydown.esc="open = false">
    <form class="qs transfer copy-dialog" @submit.prevent="go">
      <h3>Copy {{ e.name }} to another world</h3>
      <p class="muted small">With everything it uses, DM-only parts included. The app switches to that world and shows what changes there before anything does.</p>
      <p v-if="!others.length && worlds.loaded" class="muted">You have no other world yet. Make one from the world menu (top left).</p>
      <div v-else class="copy-worlds">
        <label v-for="w in others" :key="w.dir" class="check"><input type="radio" name="copy-world" :checked="target?.dir === w.dir" @change="pick(w)" /> {{ w.title }}</label>
      </div>
      <template v-if="target && theirs">
        <p v-if="there" class="small">{{ target.title }} has {{ e.name }} already: the copy updates it, and the preview lets you keep its version instead.</p>
        <template v-if="missing.length">
          <p class="small warn-text">{{ e.name }} uses {{ missing.length }} {{ missing.length === 1 ? 'thing' : 'things' }} {{ target.title }} doesn't have:</p>
          <details v-for="g in missingByType" :key="g.t.type" class="small" open>
            <summary><TypeIcon :type="g.t.type" /> {{ g.list.length }} {{ g.list.length === 1 ? g.t.label : g.t.plural }}</summary>
            <p class="transfer-list"><span v-for="x in g.list.slice(0, 100)" :key="x.id"><EntryLink :id="x.id" /></span><span v-if="g.list.length > 100" class="muted">… and {{ g.list.length - 100 }} more</span></p>
          </details>
          <label class="check"><input v-model="withMissing" type="radio" :value="true" name="copy-missing" /> Copy them too</label>
          <label class="check"><input v-model="withMissing" type="radio" :value="false" name="copy-missing" /> Copy anyway, without them <span class="muted small">(its fields that point at them stay empty; its text keeps their names as plain words)</span></label>
        </template>
        <p v-else class="small">{{ target.title }} has everything {{ e.name }} uses.</p>
        <p class="muted small">{{ count }} {{ count === 1 ? 'entry goes' : 'entries go' }} to {{ target.title }}.</p>
      </template>
      <p v-else-if="target && !error" class="muted small">Looking at {{ target.title }}…</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="actions">
        <button type="button" @click="open = false">Cancel</button>
        <button type="submit" class="primary" :disabled="!!busy || !target || !theirs">{{ busy || (target ? `Copy to ${target.title}` : 'Copy') }}</button>
      </div>
    </form>
  </div>
</template>
