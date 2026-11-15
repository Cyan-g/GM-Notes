<script setup lang="ts">
// Shows a picture stored in the data folder (images/...).
import { ref, watch } from 'vue'
import { state } from '../store'

const props = defineProps<{ path?: string | null; alt?: string }>()
const url = ref<string | null>(null)
watch(() => props.path, async p => { url.value = p && state.storage ? await state.storage.fileUrl(p) : null }, { immediate: true })
</script>

<template>
  <img v-if="url" :src="url" :alt="alt ?? ''" />
</template>
