<script setup lang="ts">
// Printing cards: a preview of the pages (nine poker-size cards each, with cut lines), A4 or Letter, and Save PDF.
// A card whose text doesn't fit gets smaller text first (down to 6.5 pt); then its last paragraphs move to a second
// card marked "(continued)", right after it. In print only the pages are shown (see style.css, @media print).
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ui } from '../ui'
import { cardsOf, type Card } from '../cards'
import { renderMarkdown } from '../markdown'
import { desktop } from '../storage/desktop'
import AppIcon from './AppIcon.vue'

/** A printed card: a card's text, or the part of it that continues; `joins`: its first paragraph goes on from the card before. */
interface Piece { card: Card; paras: string[]; font: number; cont: boolean; joins: boolean }
const MAX_FONT = 8.5, MIN_FONT = 6.5
const pick = ref(0)
/** The paper, remembered on this computer (A4 unless Letter was picked). */
const PAPER_KEY = 'gmnotes.cardPaper'
const paper = ref<'A4' | 'Letter'>((() => { try { return localStorage.getItem(PAPER_KEY) === 'Letter' ? 'Letter' : 'A4' } catch { return 'A4' } })())
watch(paper, v => { try { localStorage.setItem(PAPER_KEY, v) } catch { /* not remembered */ } })
const pieces = ref<Piece[]>([])
const fitting = ref(true)
const busy = ref(false), saved = ref(''), error = ref('')
const root = ref<HTMLElement>()

const set = computed(() => ui.printCards?.sets[pick.value])
const pages = computed(() => {
  const out: Piece[][] = []
  for (let i = 0; i < pieces.value.length; i += 9) out.push(pieces.value.slice(i, i + 9))
  return out
})

/** The cards laid out again, then fitted one by one until none overflows. */
async function layout() {
  fitting.value = true; saved.value = ''
  pieces.value = cardsOf(set.value?.ids ?? []).map(card => ({ card, paras: [...card.paras], font: MAX_FONT, cont: false, joins: false }))
  await document.fonts.ready
  for (let i = 0; i < pieces.value.length && i < 2000; i++) {
    for (let guard = 0; guard < 60; guard++) {
      await nextTick()
      const body = root.value?.querySelectorAll<HTMLElement>('.pc-body')[i]
      if (!body || body.scrollHeight <= body.clientHeight + 1) break
      const p = pieces.value[i]
      if (p.font > MIN_FONT) { p.font = Math.round((p.font - 0.5) * 10) / 10; continue }
      // still too long at the smallest size: the end of the text moves on to a "(continued)" card, a sentence at a
      // time, so the card stays full (a table or list moves as a whole)
      let next = pieces.value[i + 1]
      if (!next || next.card !== p.card || !next.cont) {
        next = { card: p.card, paras: [], font: MIN_FONT, cont: true, joins: false }
        pieces.value.splice(i + 1, 0, next)
      }
      const last = p.paras[p.paras.length - 1] ?? ''
      const block = /^(\||- |\* )/m.test(last) && last.includes('\n')
      const cut = block ? -1 : Math.max(last.lastIndexOf('. ', last.length - 3), last.lastIndexOf('? ', last.length - 3), last.lastIndexOf('! ', last.length - 3))
      const move = cut > 0 ? last.slice(cut + 1).trim() : last
      const keep = cut > 0 ? last.slice(0, cut + 1).trim() : ''
      if (keep) p.paras[p.paras.length - 1] = keep; else p.paras.pop()
      if (next.joins && next.paras.length) next.paras[0] = `${move} ${next.paras[0]}`
      else next.paras.unshift(move)
      next.joins = !!keep
      if (!p.paras.length) { p.paras = [next.paras.shift()!]; next.joins = false; break }
    }
  }
  fitting.value = false
}
watch([set, paper], layout)
onMounted(layout)

async function save() {
  busy.value = true; error.value = ''
  try {
    if (!desktop) { window.print(); return }
    const name = `${ui.printCards!.name}${ui.printCards!.sets.length > 1 ? ` (${set.value!.label.toLowerCase()})` : ''}`
    const file = await desktop.cardsPdf(paper.value, name)
    if (file) saved.value = file
  } catch (e) { error.value = (e as Error).message }
  finally { busy.value = false }
}
const close = () => { ui.printCards = null }
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close() }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
const count = computed(() => pieces.value.length)
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="print-root" :class="'paper-' + paper.toLowerCase()">
      <div class="print-chrome">
        <h2><AppIcon ui="cards" /> Print cards <span class="muted small">{{ ui.printCards?.name }}</span></h2>
        <div v-if="(ui.printCards?.sets.length ?? 0) > 1" class="seg">
          <button v-for="(s, i) in ui.printCards!.sets" :key="s.label" type="button" :class="{ on: pick === i }" @click="pick = i">{{ s.label }} <span class="muted small">{{ s.ids.length }}</span></button>
        </div>
        <div class="seg" role="radiogroup" aria-label="Paper">
          <button type="button" :class="{ on: paper === 'A4' }" @click="paper = 'A4'">A4</button>
          <button type="button" :class="{ on: paper === 'Letter' }" @click="paper = 'Letter'">Letter</button>
        </div>
        <span class="muted small">{{ fitting ? 'Laying out…' : `${count} card${count === 1 ? '' : 's'} on ${pages.length} page${pages.length === 1 ? '' : 's'} · poker size, 63 × 88 mm` }}</span>
        <span class="spacer" />
        <span v-if="saved" class="muted small">Saved: {{ saved }}</span>
        <p v-if="error" class="error small">{{ error }}</p>
        <button type="button" @click="close">Close</button>
        <button type="button" class="primary" :disabled="fitting || busy || !count" @click="save">{{ busy ? 'Saving…' : desktop ? 'Save PDF' : 'Print' }}</button>
      </div>
      <div class="print-pages">
        <section v-for="(pg, n) in pages" :key="n" class="print-page">
          <article v-for="(p, k) in pg" :key="k" class="pcard" :class="'pc-' + p.card.kind">
            <header>
              <h3 class="pc-title">{{ p.card.title }}<span v-if="p.cont" class="pc-cont"> (continued)</span></h3>
              <div v-if="!p.cont" class="pc-sub">{{ p.card.sub }}<span v-for="m in p.card.marks" :key="m" class="pc-mark">{{ m }}</span></div>
            </header>
            <dl v-if="!p.cont && p.card.facts.length" class="pc-facts">
              <div v-for="[k2, v] in p.card.facts" :key="k2"><dt>{{ k2 }}</dt><dd>{{ v || '—' }}</dd></div>
            </dl>
            <div class="pc-body" :style="{ fontSize: p.font + 'pt' }">
              <div v-for="(t, j) in p.paras" :key="j" class="md" v-html="renderMarkdown(t)" />
            </div>
            <footer class="pc-foot"><span>{{ p.card.foot }}</span><span class="pc-credit">{{ p.card.credit }}</span></footer>
          </article>
        </section>
      </div>
    </div>
  </Teleport>
</template>
