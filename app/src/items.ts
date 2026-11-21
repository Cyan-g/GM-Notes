// Where an item is: the characters carrying it and the shops selling it, and what a shop asks for it.
import type { Entry, StockLine } from './model/types'
import { byType, get } from './store'

/** A shop's price for a line of its stock: the line's own, else the item's value times the shop's markup. */
export function shopPrice(shop: Entry, line: StockLine): number | undefined {
  const base = get(line.item)?.fields.value as number | undefined, markup = (shop.fields.markup as number | undefined) ?? 1
  return line.price ?? (base != null ? Math.round(base * markup) : undefined)
}

/** The characters carrying an item (by name): how many, and whether one is equipped or attuned. */
export const carriersOf = (item: Entry) => (byType.value.get('pc') ?? []).map(p => {
  const lines = (p.fields.sheet?.inventory ?? []).filter(l => l.item === item.id && l.qty > 0)
  return { p, qty: lines.reduce((n, l) => n + l.qty, 0), attuned: lines.some(l => l.attuned), equipped: lines.some(l => l.equipped) }
}).filter(x => x.qty)

/** The shops selling an item (by name), each with its price and how many are left. */
export const shopsSelling = (item: Entry) => (byType.value.get('place') ?? []).flatMap(s => {
  const l = ((s.fields.stock as StockLine[] | undefined) ?? []).find(x => x.item === item.id)
  return l ? [{ s, price: shopPrice(s, l), stock: l.stock }] : []
})
