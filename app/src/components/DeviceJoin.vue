<script setup lang="ts">
// Joining a world from another of the user's devices (it shows a code in ⚙ → My devices → Add a device): the
// computers pairing on this network are found by themselves; one elsewhere (Tailscale) is typed in by address. The
// copy of the world (pictures included) arrives in GM Notes' own folder and opens.
import { onMounted, ref } from 'vue'
import { findPairing, joinDevice } from '../devicesync/devices'
import { desktop } from '../storage/desktop'

const emit = defineEmits<{ cancel: [] }>()
const found = ref<{ host: string; port: number; title: string; name: string }[]>([])
const looking = ref(false)
const chosen = ref('')
const address = ref('')
const code = ref('')
const busy = ref('')
const error = ref('')
async function look() {
  looking.value = true
  try { found.value = await findPairing() } catch { found.value = [] } finally { looking.value = false }
  if (found.value.length === 1 && !chosen.value) chosen.value = `${found.value[0].host}:${found.value[0].port}`
}
onMounted(() => {
  void look()
  desktop?.devices.onJoinProgress(p => { busy.value = p.total > 1 ? `${p.label}: ${p.done} of ${p.total}` : `${p.label}…` })
})
async function join() {
  const target = chosen.value === 'typed' || !chosen.value ? address.value.trim() : chosen.value
  if (!target || !code.value.trim()) return
  error.value = ''
  busy.value = 'Pairing…'
  try { await joinDevice(target, code.value) } catch (e) {
    error.value = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    busy.value = ''
  }
}
</script>

<template>
  <form class="world-join dev-join" @submit.prevent="join">
    <p class="small"><b>Join from my other device</b>: on the computer that has the world, open ⚙ → My devices → Add a device. It shows a code.</p>
    <div v-if="found.length" class="dev-found small">
      <label v-for="f in found" :key="`${f.host}:${f.port}`"><input v-model="chosen" type="radio" :value="`${f.host}:${f.port}`" /> <b>{{ f.title }}</b> on {{ f.name || f.host }}</label>
      <label><input v-model="chosen" type="radio" value="typed" /> Another address</label>
    </div>
    <p v-else class="muted small">{{ looking ? 'Looking on this network…' : 'No computer here is showing a code right now.' }} <button v-if="!looking" type="button" class="link-btn small" @click="look">Look again</button></p>
    <label v-if="!found.length || chosen === 'typed'" class="small">Its address <input v-model="address" placeholder="192.168.1.20" aria-label="The other computer's address" /></label>
    <label class="small">Code <input v-model="code" class="dev-code-input" placeholder="ABCD-1234" autocomplete="off" aria-label="The code it shows" /></label>
    <div class="world-actions">
      <button type="submit" class="primary" :disabled="!!busy || !code.trim() || (!chosen && !address.trim()) || (chosen === 'typed' && !address.trim())">Join</button>
      <button type="button" :disabled="!!busy" @click="emit('cancel')">Cancel</button>
    </div>
    <p v-if="busy" class="muted small">{{ busy }}</p>
    <p v-if="error" class="warn-text small">{{ error }}</p>
  </form>
</template>
