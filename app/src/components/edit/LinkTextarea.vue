<script setup lang="ts">
// A textarea that shows links as they'll read while writing: [[entry]] links in the link colour (grey and dashed when
// they point to nothing), web links, and :::secret blocks tinted. The marks are drawn on a copy of the text behind it
// (textHighlight.ts); the textarea's own letters are see-through, so typing, undo, spell check and the caret stay the
// browser's. With the caret in a link, a small line in its corner says where it goes.
//   grow: as tall as its text (like v-grow)
// Everything else (value, rows, placeholder, listeners, class) goes to the textarea; `el` is it, for the caller.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TYPES } from '../../model/schema'
import { highlightHtml, linkAt } from '../../textHighlight'
import { grow as growTo } from '../../directives/grow'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ value: string; grow?: boolean }>()
const el = ref<HTMLTextAreaElement>()
const back = ref<HTMLDivElement>()
defineExpose({ el })

const html = computed(() => highlightHtml(props.value ?? ''))
const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'textIndent', 'textTransform',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'] as const
/** The copy behind exactly over the textarea's inside (its scrollbar left out), scrolled as it is. */
function sync() {
  const t = el.value, b = back.value
  if (!t || !b) return
  const cs = getComputedStyle(t)
  for (const k of COPY) b.style[k] = cs[k]
  b.style.top = `${t.offsetTop + t.clientTop}px`
  b.style.left = `${t.offsetLeft + t.clientLeft}px`
  b.style.width = `${t.clientWidth}px`
  b.style.height = `${t.clientHeight}px`
  b.scrollTop = t.scrollTop
  b.scrollLeft = t.scrollLeft
}
let ro: ResizeObserver | undefined
onMounted(() => {
  if (el.value) { ro = new ResizeObserver(sync); ro.observe(el.value) }
  if (props.grow && el.value) requestAnimationFrame(() => { growTo(el.value!); sync() })
  nextTick(sync)
})
onBeforeUnmount(() => ro?.disconnect())
watch(() => props.value, () => nextTick(sync))

// ---- where the link at the caret goes ----
const caret = ref(-1)
const track = () => { caret.value = el.value?.selectionStart ?? -1; sync() }
const at = computed(() => linkAt(props.value ?? '', caret.value))
const hint = computed(() => {
  const l = at.value
  if (!l) return ''
  if (!l.entry) return `→ ${l.url}`
  return l.e ? `→ ${l.e.name} · ${TYPES[l.e.type]?.label ?? l.e.type}` : `No entry “${l.inner.split('|')[0].trim()}”`
})
function onInput(ev: Event) { if (props.grow) growTo(ev.target as HTMLTextAreaElement); track() }
</script>

<template>
  <div class="lt-wrap">
    <div ref="back" class="lt-back" aria-hidden="true" v-html="html" />
    <textarea ref="el" v-bind="$attrs" class="lt-ta" :value="value" @scroll="sync" @input="onInput" @keyup="track" @click="track" @select="track" @focus="track" @blur="caret = -1" />
    <span v-if="hint" class="lt-hint" :class="{ missing: at?.entry && !at.e }">{{ hint }}</span>
  </div>
</template>
