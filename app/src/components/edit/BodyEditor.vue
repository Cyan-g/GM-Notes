<script setup lang="ts">
// Markdown editor: typing [[ suggests entries, pasted or dropped pictures are saved to data/images. Tables in the text are
// edited as grids (TableGrid): the text around them stays text boxes, the toolbar works in the one the caret was last in.
import LinkTextarea from './LinkTextarea.vue'
import AppIcon from '../AppIcon.vue'
import TypeIcon from '../TypeIcon.vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { TYPES } from '../../model/schema'
import { search } from '../../search'
import { saveImage } from '../../edit'
import MarkdownView from '../MarkdownView.vue'
import TableGrid from './TableGrid.vue'
import { NEW_TABLE, editParts, joinTables, tableText, type Part, type Table } from '../../textTables'

/** `compact`: start a few lines tall and grow with the text (short descriptions), instead of a tall page. */
const props = defineProps<{ modelValue: string; hint?: string; compact?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const lt = ref<InstanceType<typeof LinkTextarea>>()
// ---- tables: the text in parts (text, tables), the text parts each a text box ----
const parts = computed(() => editParts(props.modelValue ?? ''))
const hasTable = computed(() => parts.value.some(p => p.kind === 'table'))
const partBoxes = ref<Record<number, InstanceType<typeof LinkTextarea> | null>>({})
/** The text part the caret was last in (the toolbar and pictures go there). */
const activeK = ref(0)
const firstText = computed(() => parts.value.findIndex(p => p.kind === 'text'))
/** The text box (LinkTextarea's textarea): the one, or the text part last used. */
const ta = computed(() => (hasTable.value ? (partBoxes.value[activeK.value] ?? partBoxes.value[firstText.value])?.el : lt.value?.el))
/** Give the whole text with what's now in this text box. */
function emitFrom(el: HTMLTextAreaElement) {
  if (!hasTable.value) { emit('update:modelValue', el.value); return }
  const k = Object.entries(partBoxes.value).find(([, b]) => b?.el === el)?.[0]
  const l = [...parts.value]
  if (k != null) l[Number(k)] = { kind: 'text', text: el.value }
  emit('update:modelValue', joinTables(l))
}
function putPart(k: number, p: Part | null) {
  const l = [...parts.value]
  if (p) l[k] = p; else l.splice(k, 1)
  emit('update:modelValue', joinTables(l))
}
const setTable = (k: number, table: Table) => putPart(k, { kind: 'table', raw: tableText(table), table })
/** A new table where the caret is (on lines of its own), or at the end. */
function insertTable() {
  const el = ta.value
  if (!el) { const v = (props.modelValue ?? '').replace(/\s+$/, ''); emit('update:modelValue', v ? `${v}\n\n${NEW_TABLE}` : NEW_TABLE); return }
  const s = el.selectionStart, before = el.value.slice(0, s), after = el.value.slice(el.selectionEnd)
  const pre = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const post = !after ? '' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
  replaceRange(s, el.selectionEnd, pre + NEW_TABLE + post)
}
const mode = ref<'write' | 'split' | 'preview'>(window.innerWidth > 1300 ? 'split' : 'write')
const busy = ref('')

function fit() {
  const t = ta.value
  if (!props.compact || !t) return
  t.style.height = 'auto'
  t.style.height = t.scrollHeight + 2 + 'px'
}
onMounted(() => nextTick(fit))
watch(() => [props.modelValue, mode.value], () => nextTick(fit))

// ---- [[ autocomplete ----
const ac = ref<{ query: string; start: number; top: number; left: number } | null>(null)
const writePane = ref<HTMLDivElement>()
const sel = ref(0)
const results = computed(() => (ac.value ? (ac.value.query ? search(ac.value.query, 8) : []) : []))
watch(results, () => { sel.value = 0 })

function caretXY(el: HTMLTextAreaElement, pos: number) {
  const div = document.createElement('div')
  const cs = getComputedStyle(el)
  for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderLeftWidth', 'boxSizing', 'whiteSpace', 'wordWrap', 'tabSize'] as const) {
    (div.style as any)[p] = cs[p]
  }
  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.style.width = `${el.clientWidth}px`
  div.textContent = el.value.slice(0, pos)
  const span = document.createElement('span')
  span.textContent = '​'
  div.appendChild(span)
  document.body.appendChild(div)
  const r = { top: span.offsetTop - el.scrollTop + parseFloat(cs.lineHeight || '20'), left: Math.min(span.offsetLeft, el.clientWidth - 260) }
  div.remove()
  return r
}

function onInput(ev: Event) {
  const el = ev.target as HTMLTextAreaElement
  emitFrom(el)
  const before = el.value.slice(0, el.selectionStart)
  const m = before.match(/\[\[([^\]|\n]{0,40})$/)
  if (m) {
    const xy = caretXY(el, el.selectionStart)
    // where this text box sits in the writing pane (several with tables)
    const box = el.getBoundingClientRect(), pane = writePane.value?.getBoundingClientRect()
    if (pane) { xy.top += box.top - pane.top; xy.left += box.left - pane.left }
    ac.value = { query: m[1], start: el.selectionStart - m[1].length - 2, ...xy }
  } else ac.value = null
}

function insertLink(i = sel.value) {
  const e = results.value[i], el = ta.value
  if (!e || !el || !ac.value) return
  const end = el.selectionStart
  const after = el.value.slice(end).startsWith(']]') ? 2 : 0
  const link = `[[${e.id}]]`
  replaceRange(ac.value.start, end + after, link)
  ac.value = null
}

function replaceRange(start: number, end: number, text: string, selectInner?: [number, number]) {
  const el = ta.value!
  el.focus()
  el.setSelectionRange(start, end)
  // execCommand keeps the browser's undo history working.
  if (!document.execCommand('insertText', false, text)) {
    el.setRangeText(text, start, end, 'end')
  }
  emitFrom(el)
  if (selectInner) nextTick(() => el.setSelectionRange(start + selectInner[0], start + selectInner[1]))
}

function onKey(ev: KeyboardEvent) {
  if (ac.value && results.value.length) {
    if (ev.key === 'ArrowDown') { sel.value = Math.min(sel.value + 1, results.value.length - 1); ev.preventDefault(); return }
    if (ev.key === 'ArrowUp') { sel.value = Math.max(sel.value - 1, 0); ev.preventDefault(); return }
    if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); insertLink(); return }
  }
  if (ev.key === 'Escape') ac.value = null
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'b') { ev.preventDefault(); wrap('**', '**') }
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'i') { ev.preventDefault(); wrap('*', '*') }
}

// ---- toolbar ----
function wrap(a: string, b: string, placeholder = 'text') {
  const el = ta.value!
  const s = el.selectionStart, e = el.selectionEnd
  const inner = el.value.slice(s, e) || placeholder
  replaceRange(s, e, a + inner + b, [a.length, a.length + inner.length])
}
function linePrefix(prefix: string) {
  const el = ta.value!
  const s = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1
  replaceRange(s, s, prefix)
}
function secret() { wrap('\n:::secret\n', '\n:::\n', 'Only the DM sees this') }
function link() {
  const el = ta.value!
  replaceRange(el.selectionStart, el.selectionEnd, '[[')
  nextTick(() => onInput({ target: el } as unknown as Event))
}

// ---- pictures ----
async function insertImages(files: File[]) {
  const imgs = files.filter(f => f.type.startsWith('image/'))
  if (!imgs.length) return false
  busy.value = 'Saving picture…'
  try {
    for (const f of imgs) {
      const p = await saveImage(f, props.hint)
      const el = ta.value!
      replaceRange(el.selectionStart, el.selectionEnd, `\n![](${encodeURI(p)})\n`)
    }
  } finally { busy.value = '' }
  return true
}
async function onPaste(ev: ClipboardEvent) {
  const files = [...(ev.clipboardData?.files ?? [])]
  if (files.some(f => f.type.startsWith('image/'))) { ev.preventDefault(); await insertImages(files) }
}
async function onDrop(ev: DragEvent) {
  const files = [...(ev.dataTransfer?.files ?? [])]
  if (files.length) { ev.preventDefault(); await insertImages(files) }
}
const fileInput = ref<HTMLInputElement>()
async function onPick(ev: Event) {
  const files = [...((ev.target as HTMLInputElement).files ?? [])]
  await insertImages(files)
  ;(ev.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div class="body-editor" :class="[mode, { compact }]">
    <div class="be-toolbar">
      <button type="button" title="Bold (Ctrl+B)" @click="wrap('**', '**')"><b>B</b></button>
      <button type="button" title="Italic (Ctrl+I)" @click="wrap('*', '*')"><i>I</i></button>
      <button type="button" title="Heading" @click="linePrefix('## ')">H</button>
      <button type="button" title="List item" @click="linePrefix('- ')">•</button>
      <button type="button" title="Link to an entry (or type [[)" @click="link">[[ ]]</button>
      <button type="button" title="DM-only block" @click="secret"><AppIcon ui="padlock" /> Secret</button>
      <button type="button" title="Insert picture (or paste / drop one)" @click="fileInput?.click()"><AppIcon ui="picture" /> Picture</button>
      <button type="button" title="A table, edited as a grid (where the caret is)" @click="insertTable">▦ Table</button>
      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onPick" />
      <span class="muted small">{{ busy }}</span>
      <span class="be-modes">
        <button type="button" :class="{ on: mode === 'write' }" @click="mode = 'write'">Write</button>
        <button type="button" :class="{ on: mode === 'split' }" @click="mode = 'split'">Split</button>
        <button type="button" :class="{ on: mode === 'preview' }" @click="mode = 'preview'">Preview</button>
      </span>
    </div>
    <div class="be-panes">
      <div v-show="mode !== 'preview'" ref="writePane" class="be-write" :class="{ 'with-tables': hasTable }">
        <LinkTextarea v-if="!hasTable" ref="lt" :value="modelValue" spellcheck="true" placeholder="Write here. Type [[ to link to another entry."
          @input="onInput" @keydown="onKey" @blur="ac = null" @paste="onPaste" @drop="onDrop" @dragover.prevent />
        <template v-for="(p, k) in hasTable ? parts : []" v-else :key="k">
          <LinkTextarea v-if="p.kind === 'text'" :ref="b => (partBoxes[k] = b as InstanceType<typeof LinkTextarea> | null)" grow :rows="1" :value="p.text" spellcheck="true"
            :placeholder="k === 0 ? 'Text above the table' : k === parts.length - 1 ? 'Text below the table' : 'Text between the tables'"
            @focus="activeK = k" @input="onInput" @keydown="onKey" @blur="ac = null" @paste="onPaste" @drop="onDrop" @dragover.prevent />
          <TableGrid v-else :table="p.table" @update="t => setTable(k, t)" @remove="putPart(k, null)" />
        </template>
        <ul v-if="ac && results.length" class="picker-list ac" :style="{ top: ac.top + 'px', left: ac.left + 'px' }">
          <li v-for="(e, i) in results" :key="e.id" :class="{ sel: i === sel }" @mousedown.prevent="insertLink(i)" @mousemove="sel = i">
            <span class="icon"><TypeIcon :type="e.type" /></span>{{ e.name }} <span class="muted small">{{ TYPES[e.type].label }}</span>
          </li>
        </ul>
      </div>
      <!-- the preview shows the outline too (headings not filled in yet), so a template reads as one -->
      <div v-show="mode !== 'write'" class="be-preview"><MarkdownView :source="modelValue" all-headings /></div>
    </div>
  </div>
</template>
