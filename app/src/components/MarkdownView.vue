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

// ---- roll tables: a table whose first column is "Roll" (or d6, d20…) takes the number the table rolled and lights
// up its row. The app never rolls: the players and the DM do. ----
function rangeOf(cell: string): [number, number] | undefined {
  const m = cell.replace(/\s/g, '').match(/^(\d+)(?:[-–—](\d+))?\+?$/)
  if (!m) return undefined
  // a d100 table's "00" is 100 ("97–00", or "00" alone)
  const hundred = (s: string) => (/^0+$/.test(s) && s.length > 1 ? 100 : Number(s))
  return [hundred(m[1]), m[2] != null ? hundred(m[2]) : cell.includes('+') ? 1e9 : hundred(m[1])]
}
function rollTables() {
  const el = root.value
  if (!el) return
  for (const table of el.querySelectorAll<HTMLTableElement>('table')) {
    const head = table.querySelector('th')?.textContent?.trim() ?? ''
    if (!/^(roll|\d*d\d+)$/i.test(head) || table.previousElementSibling?.classList.contains('roll-pick')) continue
    const box = document.createElement('div')
    box.className = 'roll-pick'
    table.classList.add('roll-table')
    box.innerHTML = '<label>Rolled <input type="number" min="1" placeholder="#" title="Type what was rolled: its row lights up" /></label>'
    const input = box.querySelector('input')!
    input.addEventListener('input', () => {
      const n = Number(input.value)
      for (const tr of table.querySelectorAll('tbody tr')) {
        const r = rangeOf(tr.querySelector('td')?.textContent ?? '')
        tr.classList.toggle('rolled', !!input.value && !!r && n >= r[0] && n <= r[1])
      }
      table.querySelector('tr.rolled')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
    table.before(box)
  }
}
const afterRender = async () => { await resolveFiles(); rollTables() }
onMounted(afterRender)
watch(html, afterRender)
</script>

<template>
  <div ref="root" class="md" v-html="html" @click="click" />
</template>
