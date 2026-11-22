// Dropdown fields keep their width in a style. A style draws a dropdown's list itself (base.css, "picker"), and in
// that mode the browser sizes the field to its current choice, not to its longest option as the system's own field
// does: a filter showing "All" would shrink, and move what follows whenever the choice changes. So each dropdown that
// sizes itself (not one stretched to fill a row) is measured once in the system's way and kept at least that wide.
// Only while a style is on (class "fx" on <html>); in Plain nothing is touched.
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
const on = () => document.documentElement.classList.contains('fx')
const pending = new Set<HTMLSelectElement>()
let frame = 0
function later(el: HTMLSelectElement) {
  pending.add(el)
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; const l = [...pending]; pending.clear(); if (on()) l.forEach(size) })
}
function all() {
  for (const el of document.querySelectorAll('select')) {
    if (on()) later(el)
    else if (el.dataset[MARK]) { el.style.minWidth = ''; delete el.dataset[MARK] }
  }
}

/** Watch for dropdowns (new ones, changed options) and for the style being switched on or off. */
export function startSelectSizing() {
  new MutationObserver(records => {
    if (!on()) return
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
  document.addEventListener('pointerover', e => { const el = (e.target as Element).closest?.('select'); if (el && on() && !el.dataset[MARK] && !el.style.minWidth) later(el) })
  all()
}
