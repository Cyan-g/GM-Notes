<script setup lang="ts">
// Printing cards: a preview of the pages (nine poker-size cards each, with cut lines), A4 or Letter, and Save PDF.
// The preview zooms (−/+, Fit width, Ctrl + wheel) and a card opens big on a click (← → step through, Esc closes).
// The Style panel sets colour, fonts, text size, paper, corners, frame and what shows; it's kept with the world.
// A card whose text doesn't fit gets smaller text first (down to 6.5 pt); then its end moves, sentence by sentence,
// to a card marked "(continued)" right after it. The layout is measured at 100 %, as it prints.
// In print only the pages are shown (see style.css, @media print).
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ui } from '../ui'
import { cardStyle, cardsOf, kindColor, setCardStyle, type Card, type CardStyle } from '../cards'
import { renderMarkdown } from '../markdown'
import { desktop } from '../storage/desktop'
import { FONTS, TEXT_FONTS } from '../theme'
import AppIcon from './AppIcon.vue'
import DataImage from './DataImage.vue'

/** A printed card: a card's text, or the part of it that continues; `joins`: its first paragraph goes on from the card before. */
interface Piece { card: Card; paras: string[]; font: number; cont: boolean; joins: boolean }
const MIN_FONT = 6.5
const pick = ref(0)
/** The paper, remembered on this computer (A4 unless Letter was picked). */
const PAPER_KEY = 'gmnotes.cardPaper'
const paper = ref<'A4' | 'Letter'>((() => { try { return localStorage.getItem(PAPER_KEY) === 'Letter' ? 'Letter' : 'A4' } catch { return 'A4' } })())
watch(paper, v => { try { localStorage.setItem(PAPER_KEY, v) } catch { /* not remembered */ } })
const pieces = ref<Piece[]>([])
const fitting = ref(true)
const busy = ref(false), saved = ref(''), error = ref('')
const root = ref<HTMLElement>()
const pagesBox = ref<HTMLElement>()

const set = computed(() => ui.printCards?.sets[pick.value])
const pages = computed(() => {
  const out: Piece[][] = []
  for (let i = 0; i < pieces.value.length; i += 9) out.push(pieces.value.slice(i, i + 9))
  return out
})

// ---- style ----
const style = computed(() => cardStyle())
const showStyle = ref(false)
const set_ = (patch: Partial<CardStyle>) => setCardStyle(patch)
const setShow = (k: keyof CardStyle['show'], v: boolean) => setCardStyle({ show: { ...style.value.show, [k]: v } })
const fontCss = (list: { id: string; css: string }[], id: string, theme: string) => (id === 'theme' ? theme : list.find(f => f.id === id)?.css ?? theme)
/** The style as CSS variables on the pages. */
const styleVars = computed(() => ({
  '--pc-head': fontCss(FONTS, style.value.headFont, 'var(--serif)'),
  '--pc-text': fontCss(TEXT_FONTS, style.value.textFont, 'var(--sans)'),
  '--pc-paper': style.value.paper === 'parchment' ? '#f8f1e2' : '#ffffff',
  '--pc-radius': style.value.corners === 'rounded' ? '3mm' : '0',
}))
const colorOf = (c: Card) => (style.value.color === 'custom' ? style.value.custom || '#8c2f1f' : style.value.color === 'kind' ? kindColor(c) : 'var(--accent)')

/** The cards laid out again, then fitted one by one until none overflows. */
async function layout() {
  fitting.value = true; saved.value = ''
  const max = style.value.size
  pieces.value = cardsOf(set.value?.ids ?? []).map(card => ({ card, paras: [...card.paras], font: max, cont: false, joins: false }))
  await document.fonts.ready
  for (let i = 0; i < pieces.value.length && i < 2000; i++) {
    for (let guard = 0; guard < 400; guard++) {
      await nextTick()
      const body = root.value?.querySelectorAll<HTMLElement>('.print-pages .pc-body')[i]
      if (!body || body.scrollHeight <= body.clientHeight + 1) break
      const p = pieces.value[i]
      if (p.font > MIN_FONT) { p.font = Math.max(MIN_FONT, Math.round((p.font - 0.5) * 10) / 10); continue }
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
// fonts and size change the layout; colours, paper and the rest don't
watch([set, paper, () => style.value.size, () => style.value.headFont, () => style.value.textFont, () => style.value.show.facts], layout)
onMounted(layout)

// ---- zoom: the preview only (the layout is measured at 100 %) ----
const zoom = ref(0.62)
const PAGE_PX = { A4: 794, Letter: 816 }
const zoomBy = (d: number) => { zoom.value = Math.min(2, Math.max(0.3, Math.round((zoom.value + d) * 100) / 100)) }
function fitWidth() {
  const w = (pagesBox.value?.clientWidth ?? 900) - 48
  zoom.value = Math.min(2, Math.max(0.3, Math.round((w / PAGE_PX[paper.value]) * 100) / 100))
}
function wheel(ev: WheelEvent) {
  if (!ev.ctrlKey) return
  ev.preventDefault()
  zoomBy(ev.deltaY < 0 ? 0.1 : -0.1)
}

// ---- one card, big ----
const big = ref<number | null>(null)
/** As big as the window allows (a card is 63 x 88 mm, about 238 x 333 px), at most three times. */
const winH = ref(window.innerHeight), winW = ref(window.innerWidth)
const onResize = () => { winH.value = window.innerHeight; winW.value = window.innerWidth }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))
const bigZoom = computed(() => Math.max(1, Math.min(3, (winH.value - 90) / 333, (winW.value - 220) / 238)))
const step = (d: number) => { if (big.value != null) big.value = Math.min(pieces.value.length - 1, Math.max(0, big.value + d)) }

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
function onKey(ev: KeyboardEvent) {
  if (big.value != null) {
    if (ev.key === 'Escape') big.value = null
    else if (ev.key === 'ArrowRight') step(1)
    else if (ev.key === 'ArrowLeft') step(-1)
    return
  }
  if (ev.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
const count = computed(() => pieces.value.length)
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="print-root" :class="['paper-' + paper.toLowerCase(), { 'no-cut': !style.show.cutLines }]">
      <div class="print-chrome">
        <h2><AppIcon ui="cards" /> Print cards <span class="muted small">{{ ui.printCards?.name }}</span></h2>
        <div v-if="(ui.printCards?.sets.length ?? 0) > 1" class="seg">
          <button v-for="(s, i) in ui.printCards!.sets" :key="s.label" type="button" :class="{ on: pick === i }" @click="pick = i">{{ s.label }} <span class="muted small">{{ s.ids.length }}</span></button>
        </div>
        <div class="seg" role="radiogroup" aria-label="Paper">
          <button type="button" :class="{ on: paper === 'A4' }" @click="paper = 'A4'">A4</button>
          <button type="button" :class="{ on: paper === 'Letter' }" @click="paper = 'Letter'">Letter</button>
        </div>
        <div class="print-zoom" aria-label="Zoom">
          <button type="button" title="Smaller" @click="zoomBy(-0.1)">−</button>
          <span>{{ Math.round(zoom * 100) }} %</span>
          <button type="button" title="Bigger (or Ctrl + wheel)" @click="zoomBy(0.1)">+</button>
          <button type="button" class="link-btn small" @click="fitWidth">Fit width</button>
        </div>
        <button type="button" :class="{ primary: showStyle }" @click="showStyle = !showStyle"><AppIcon ui="palette" /> Style</button>
        <span class="muted small">{{ fitting ? 'Laying out…' : `${count} card${count === 1 ? '' : 's'} on ${pages.length} page${pages.length === 1 ? '' : 's'} · click a card to see it big` }}</span>
        <span class="spacer" />
        <span v-if="saved" class="muted small">Saved: {{ saved }}</span>
        <p v-if="error" class="error small">{{ error }}</p>
        <button type="button" @click="close">Close</button>
        <button type="button" class="primary" :disabled="fitting || busy || !count" @click="save">{{ busy ? 'Saving…' : desktop ? 'Save PDF' : 'Print' }}</button>
      </div>

      <div class="print-body">
        <div ref="pagesBox" class="print-scroll" @wheel="wheel">
          <div class="print-pages" :style="[styleVars, { zoom: fitting ? 1 : zoom }]" :class="{ measuring: fitting }">
            <section v-for="(pg, n) in pages" :key="n" class="print-page">
              <article v-for="(p, k) in pg" :key="k" class="pcard" :class="['pc-' + p.card.kind, { framed: style.frame }]" :style="{ '--pc-accent': colorOf(p.card) }" @click="big = n * 9 + k">
                <header :class="{ 'pc-has-pic': !p.cont && style.show.picture && p.card.image }">
                  <DataImage v-if="!p.cont && style.show.picture && p.card.image" :path="p.card.image" :alt="p.card.title" class="pc-pic" />
                  <h3 class="pc-title">{{ p.card.title }}<span v-if="p.cont" class="pc-cont"> (continued)</span></h3>
                  <div v-if="!p.cont" class="pc-sub">{{ p.card.sub }}<span v-for="m in p.card.marks" :key="m" class="pc-mark">{{ m }}</span></div>
                </header>
                <dl v-if="!p.cont && style.show.facts && p.card.facts.length" class="pc-facts">
                  <div v-for="[k2, v] in p.card.facts" :key="k2"><dt>{{ k2 }}</dt><dd>{{ v || '—' }}</dd></div>
                </dl>
                <div class="pc-body" :style="{ fontSize: p.font + 'pt' }">
                  <div v-for="(t, j) in p.paras" :key="j" class="md" v-html="renderMarkdown(t)" />
                </div>
                <footer v-if="(style.show.foot && p.card.foot) || (style.show.credit && p.card.credit)" class="pc-foot">
                  <span>{{ style.show.foot ? p.card.foot : '' }}</span><span v-if="style.show.credit" class="pc-credit">{{ p.card.credit }}</span>
                </footer>
              </article>
            </section>
          </div>
        </div>

        <aside v-if="showStyle" class="print-style">
          <h3>Style <span class="muted small">kept with the world</span></h3>
          <label class="ps-row"><span>Colour</span>
            <select :value="style.color" @change="set_({ color: ($event.target as HTMLSelectElement).value as CardStyle['color'] })">
              <option value="theme">Theme accent</option><option value="kind">By school / rarity</option><option value="custom">One colour…</option>
            </select>
            <input v-if="style.color === 'custom'" type="color" :value="style.custom || '#8c2f1f'" aria-label="Card colour" @input="set_({ custom: ($event.target as HTMLInputElement).value })" />
          </label>
          <label class="ps-row"><span>Heading font</span>
            <select :value="style.headFont" @change="set_({ headFont: ($event.target as HTMLSelectElement).value })">
              <option value="theme">Theme's heading font</option><option v-for="f in FONTS" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </label>
          <label class="ps-row"><span>Text font</span>
            <select :value="style.textFont" @change="set_({ textFont: ($event.target as HTMLSelectElement).value })">
              <option value="theme">Theme's text font</option><option v-for="f in TEXT_FONTS" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </label>
          <div class="ps-row"><span>Text size</span>
            <div class="seg">
              <button v-for="[v, l] in [[7.5, 'Small'], [8.5, 'Normal'], [9.5, 'Large']] as const" :key="v" type="button" :class="{ on: style.size === v }" @click="set_({ size: v })">{{ l }}</button>
            </div>
          </div>
          <div class="ps-row"><span>Paper</span>
            <div class="seg">
              <button type="button" :class="{ on: style.paper === 'white' }" @click="set_({ paper: 'white' })">White</button>
              <button type="button" :class="{ on: style.paper === 'parchment' }" @click="set_({ paper: 'parchment' })">Parchment</button>
            </div>
          </div>
          <div class="ps-row"><span>Corners</span>
            <div class="seg">
              <button type="button" :class="{ on: style.corners === 'square' }" @click="set_({ corners: 'square' })">Square</button>
              <button type="button" :class="{ on: style.corners === 'rounded' }" @click="set_({ corners: 'rounded' })">Rounded</button>
            </div>
          </div>
          <label class="ps-check"><input type="checkbox" :checked="style.frame" @change="set_({ frame: ($event.target as HTMLInputElement).checked })" /> Coloured frame</label>
          <h4>Show</h4>
          <label class="ps-check"><input type="checkbox" :checked="style.show.facts" @change="setShow('facts', ($event.target as HTMLInputElement).checked)" /> Facts (casting time, range, damage…)</label>
          <label class="ps-check"><input type="checkbox" :checked="style.show.foot" @change="setShow('foot', ($event.target as HTMLInputElement).checked)" /> Classes / properties</label>
          <label class="ps-check"><input type="checkbox" :checked="style.show.credit" @change="setShow('credit', ($event.target as HTMLInputElement).checked)" /> SRD credit</label>
          <label class="ps-check"><input type="checkbox" :checked="style.show.cutLines" @change="setShow('cutLines', ($event.target as HTMLInputElement).checked)" /> Cut lines</label>
          <label class="ps-check"><input type="checkbox" :checked="style.show.picture" @change="setShow('picture', ($event.target as HTMLInputElement).checked)" /> Item pictures</label>
          <button type="button" class="link-btn small" @click="set_({ ...{ color: 'theme', headFont: 'theme', textFont: 'theme', size: 8.5, paper: 'white', corners: 'square', frame: false }, show: { facts: true, foot: true, credit: true, cutLines: true, picture: true } })">Back to the defaults</button>
        </aside>
      </div>

      <!-- one card, big: a copy of the printed card at three times its size -->
      <div v-if="big != null && pieces[big]" class="print-big" @mousedown.self="big = null">
        <button type="button" class="pb-nav" :disabled="big === 0" aria-label="Previous card" @click="step(-1)">←</button>
        <div class="pb-card" :style="styleVars">
          <article class="pcard" :class="['pc-' + pieces[big].card.kind, { framed: style.frame }]" :style="{ '--pc-accent': colorOf(pieces[big].card), zoom: bigZoom }">
            <header>
              <h3 class="pc-title">{{ pieces[big].card.title }}<span v-if="pieces[big].cont" class="pc-cont"> (continued)</span></h3>
              <div v-if="!pieces[big].cont" class="pc-sub">{{ pieces[big].card.sub }}<span v-for="m in pieces[big].card.marks" :key="m" class="pc-mark">{{ m }}</span></div>
            </header>
            <dl v-if="!pieces[big].cont && style.show.facts && pieces[big].card.facts.length" class="pc-facts">
              <div v-for="[k2, v] in pieces[big].card.facts" :key="k2"><dt>{{ k2 }}</dt><dd>{{ v || '—' }}</dd></div>
            </dl>
            <div class="pc-body" :style="{ fontSize: pieces[big].font + 'pt' }">
              <div v-for="(t, j) in pieces[big].paras" :key="j" class="md" v-html="renderMarkdown(t)" />
            </div>
            <footer v-if="(style.show.foot && pieces[big].card.foot) || (style.show.credit && pieces[big].card.credit)" class="pc-foot">
              <span>{{ style.show.foot ? pieces[big].card.foot : '' }}</span><span v-if="style.show.credit" class="pc-credit">{{ pieces[big].card.credit }}</span>
            </footer>
          </article>
          <p class="pb-info">{{ big + 1 }} / {{ pieces.length }} · {{ pieces[big].font }} pt · ← → to step, Esc to close</p>
        </div>
        <button type="button" class="pb-nav" :disabled="big === pieces.length - 1" aria-label="Next card" @click="step(1)">→</button>
      </div>
    </div>
  </Teleport>
</template>
