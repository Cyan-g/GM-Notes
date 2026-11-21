// Small helpers for reading the page's form controls in event handlers.

/** The value of the input, select or textarea an event came from. */
export const inputValue = (ev: Event) => (ev.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value
