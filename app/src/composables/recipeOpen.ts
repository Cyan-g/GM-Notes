// Whether an item's recipe shows on its Edit page: it does once it has one (ingredients, the tool it's made with or
// an effect); until then it's a "＋ Recipe" button. Opened by hand it stays open for the visit (shared by the form's
// Crafting part and the Recipe card beside it).
import { reactive } from 'vue'
import type { Entry, Id } from '../model/types'

const opened = reactive(new Set<Id>())
const filled = (v: unknown) => v != null && v !== '' && !(Array.isArray(v) && !v.length)

export const hasRecipe = (e: Entry) => ['recipe', 'craftingType', 'effect'].some(k => filled((e.fields as Record<string, unknown>)[k]))
export const recipeShown = (e: Entry) => opened.has(e.id) || hasRecipe(e)
export const openRecipe = (e: Entry) => { opened.add(e.id) }
