<script setup lang="ts">
// The character's portrait at the top left of their sheet: their picture, or a spot to drop, paste or choose one
// (the same picture as on the Edit page).
import { ref } from 'vue'
import type { Entry } from '../model/types'
import { state } from '../store'
import { changed, saveImage } from '../edit'
import EntryIcon from './EntryIcon.vue'
import DataImage from './DataImage.vue'

const props = defineProps<{ pc: Entry }>()
const input = ref<HTMLInputElement>()
const busy = ref(false)
async function use(file?: File | null) {
  if (!file || !file.type.startsWith('image/') || state.readOnly) return
  busy.value = true
  try {
    props.pc.image = await saveImage(file, props.pc.name)
    changed(props.pc)
  } finally { busy.value = false }
}
</script>

<template>
  <div class="pc-portrait">
    <DataImage v-if="pc.image" :path="pc.image" :alt="pc.name" class="pc-portrait-img" />
    <button v-else type="button" class="pc-portrait-empty" :disabled="busy || !!state.readOnly" tabindex="0"
            @click="input?.click()" @drop.prevent="use($event.dataTransfer?.files?.[0])" @dragover.prevent
            @paste="use([...($event.clipboardData?.files ?? [])][0])">
      <span class="pc-portrait-icon"><EntryIcon :e="pc" /></span>
      <span class="small">{{ busy ? 'Saving…' : 'Drop or paste a picture, or click to choose' }}</span>
    </button>
    <input ref="input" type="file" accept="image/*" hidden @change="use(($event.target as HTMLInputElement).files?.[0])" />
  </div>
</template>
