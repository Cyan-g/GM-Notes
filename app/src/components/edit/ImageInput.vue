<script setup lang="ts">
// Choose, replace or remove an entry's main picture. Paste works too while the box is focused.
import { ref } from 'vue'
import { saveImage } from '../../edit'
import DataImage from '../DataImage.vue'

const props = defineProps<{ modelValue?: string | null; hint?: string }>()
const emit = defineEmits<{ 'update:modelValue': [string | undefined] }>()
const input = ref<HTMLInputElement>()
const busy = ref(false)

async function use(file?: File | null) {
  if (!file || !file.type.startsWith('image/')) return
  busy.value = true
  try { emit('update:modelValue', await saveImage(file, props.hint)) } finally { busy.value = false }
}
const onPick = (ev: Event) => use((ev.target as HTMLInputElement).files?.[0])
const onDrop = (ev: DragEvent) => use(ev.dataTransfer?.files?.[0])
const onPaste = (ev: ClipboardEvent) => use([...(ev.clipboardData?.files ?? [])][0])
</script>

<template>
  <div class="image-input" tabindex="0" @drop.prevent="onDrop" @dragover.prevent @paste="onPaste">
    <DataImage v-if="modelValue" :path="modelValue" class="portrait" />
    <p v-else class="muted small">Drop, paste or choose a picture.</p>
    <div class="row">
      <button type="button" :disabled="busy" @click="input?.click()">{{ busy ? 'Saving…' : modelValue ? 'Replace…' : 'Choose…' }}</button>
      <button v-if="modelValue" type="button" @click="emit('update:modelValue', undefined)">Remove</button>
    </div>
    <input ref="input" type="file" accept="image/*" hidden @change="onPick" />
  </div>
</template>
