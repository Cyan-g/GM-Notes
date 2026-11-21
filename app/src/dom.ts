// Small helpers for reading the page's form controls in event handlers.

/** The value of the input, select or textarea an event came from. */
export const inputValue = (ev: Event) => (ev.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
/** The number typed in the input an event came from: 0 when it's empty or not a number. */
export const inputNumber = (ev: Event) => Number(inputValue(ev)) || 0
