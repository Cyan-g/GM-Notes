<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { renderMarkdown } from '../markdown'
import { toggleTask } from '../checklist'
import { state } from '../store'

/** `tasks`: checklist boxes can be ticked; each tick sends the changed text as `update:source`. */
/** `keepEnd`: the text goes on below (a card inserted after it), so a heading at its end isn't empty. */
const props = defineProps<{ source: string; tasks?: boolean; keepEnd?: boolean }>()
const emit = defineEmits<{ 'update:source': [string] }>()
const root = ref<HTMLElement>()
const html = computed(() => renderMarkdown(props.source, { tasks: props.tasks, keepEnd: props.keepEnd }))

function click(ev: MouseEvent) {
  const box = ev.target as HTMLInputElement
  if (!box.matches?.('input.task')) return
  if (!props.tasks) { ev.preventDefault(); return }
  emit('update:source', toggleTask(props.source, Number(box.dataset.task), box.checked))
}

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
  <div ref="root" class="md" v-html="html" @click="click" />
</template>
