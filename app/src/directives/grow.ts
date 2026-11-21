// v-grow: a textarea as tall as its text, from the start. Call grow on input to keep it so while typing.
import type { Directive } from 'vue'

/** Make a textarea as tall as its text. */
export function grow(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 2 + 'px'
}

/** The directive: sizes the textarea once it's on the page. */
export const vGrow: Directive<HTMLTextAreaElement> = { mounted: el => requestAnimationFrame(() => grow(el)) }
