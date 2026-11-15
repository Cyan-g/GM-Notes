<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { renderMarkdown } from '../markdown'
import { state } from '../store'

const props = defineProps<{ source: string }>()
const root = ref<HTMLElement>()
const html = computed(() => renderMarkdown(props.source))

// Images and file links point into the data folder; swap in real URLs after rendering.
async function resolveFiles() {
  await nextTick()
  const el = root.value, s = state.storage
  if (!el || !s) return
  for (const img of el.querySelectorAll<HTMLImageElement>('img[data-path]')) {
    const url = await s.fileUrl(img.dataset.path!)
    if (url) img.src = url
    else img.classList.add('broken')
  }
  for (const a of el.querySelectorAll<HTMLAnchorElement>('a.file[data-path]')) {
    a.onclick = async (ev) => {
      ev.preventDefault()
      const url = await s.fileUrl(a.dataset.path!)
      if (url) window.open(url, '_blank')
    }
  }
}
onMounted(resolveFiles)
watch(html, resolveFiles)
</script>

<template>
  <div ref="root" class="md" v-html="html" />
</template>
