// Dropdowns keep the width of their longest option. Their open list is drawn by the page (style.css, ".dd"), and in
// that mode the browser sizes the field to its current choice instead: a filter showing "All" would shrink, and move
// what follows whenever the choice changes. So each dropdown that sizes itself (not one stretched to fill a row) is
// measured once the system's way and kept at least that wide. Every dropdown (components/Dropdown.vue), every style.
const MARK = 'fxWidth'

/** Measure one dropdown the system's way; keep that as its smallest width if it sizes itself to its options. */
function size(el: HTMLSelectElement) {
  const s = el.style
  const keep = { appearance: s.appearance, width: s.width, minWidth: s.minWidth }
  if (el.dataset[MARK]) s.minWidth = ''
  s.appearance = 'auto'
  const used = el.getBoundingClientRect().width
  s.width = 'max-content'
  const natural = el.getBoundingClientRect().width
  s.width = keep.width
  s.appearance = keep.appearance
  if (!used) { s.minWidth = keep.minWidth; return } // hidden: measured when it's shown and pointed at
  // as wide as its widest option: it sizes itself, so keep that width; stretched by its row: leave it be
  if (Math.abs(used - natural) < 2) { s.minWidth = `${Math.ceil(used)}px`; el.dataset[MARK] = '1' }
  else if (el.dataset[MARK]) { delete el.dataset[MARK] }
}
const pending = new Set<HTMLSelectElement>()
let frame = 0
function later(el: HTMLSelectElement) {
  pending.add(el)
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; const l = [...pending]; pending.clear(); l.forEach(size) })
}
function all() {
  for (const el of document.querySelectorAll('select')) {
    later(el)
  }
}

/** Watch for dropdowns (new ones, changed options), and measure again when the style or theme changes. */
export function startSelectSizing() {
  new MutationObserver(records => {
    for (const r of records) {
      const t = r.target as Element
      const sel = t.closest?.('select')
      if (sel) { later(sel); continue }
      for (const n of r.addedNodes) {
        if (n instanceof HTMLSelectElement) later(n)
        else if (n instanceof Element) n.querySelectorAll('select').forEach(later)
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true })
  new MutationObserver(all).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-fx'] })
  // one that was hidden when it came (a closed fold): measured when pointed at
  document.addEventListener('pointerover', e => { const el = (e.target as Element).closest?.('select'); if (el && !el.dataset[MARK] && !el.style.minWidth) later(el) })
  all()
}
