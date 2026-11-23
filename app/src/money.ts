// Money as typed into a money field, in copper: one amount ("12.5", "12 gp", "195 sp"), mixed coins ("12 gp 7 sp 3 cp",
// "12gp 7sp"), or a change to what's there ("+5 gp", "-3 sp 5 cp", "−20"). Thousands may be written with "," or "."
// ("1,250 gp", "1.250 gp": a separator followed by exactly three digits; "1,255.3" and "1.255,3": the last one is the
// decimal point); otherwise "," and "." are the decimal point.
// No vue here: tests import it directly.

const MULT: Record<string, number> = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 }

/** How many coins an amount is at least: the fewest gold, silver and copper pieces (for coin weight). */
export const coinCount = (cp: number) => (cp > 0 ? Math.floor(cp / 100) + Math.floor((cp % 100) / 10) + (cp % 10) : 0)

export type MoneyParse = { cp: number } | { error: string }

/** A number as typed: "1,250" and "1.250" are thousands, "12,5" and "12.5" a decimal, "1,255.3" and "1.255,3" both. */
function num(raw: string): number {
  const seps = raw.match(/[.,]/g) ?? []
  // both kinds: the last one is the decimal point, the others group thousands
  if (new Set(seps).size > 1) { const d = raw[Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'))]; return Number(raw.split(d === ',' ? '.' : ',').join('').replace(',', '.')) }
  // one kind: thousands when every group after it has three digits ("1,250", "1.250.000"), else the decimal point
  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) return Number(raw.replace(/[.,]/g, ''))
  return seps.length > 1 ? NaN : Number(raw.replace(',', '.'))
}

/** Read a money field's text; `current` (copper) is what "+" and "−" change. Empty text is `{ cp: NaN }`: no amount.
 *  `electrum` false (the Ruleset): "ep" isn't a coin there. */
export function parseMoney(text: string, current = 0, electrum = true): MoneyParse {
  let t = text.trim().toLowerCase().replace(/−|–/g, '-')
  if (!t) return { cp: NaN }
  const sign = t[0] === '+' ? 1 : t[0] === '-' ? -1 : 0
  if (sign) t = t.slice(1).trim()
  const parts = [...t.matchAll(/(\d[\d.,]*)\s*(pp|gp|ep|sp|cp)?\s*/g)]
  // everything typed must be amounts
  if (!parts.length || parts.map(p => p[0]).join('') !== t) return { error: 'Type an amount like "12 gp", "12 gp 7 sp" or "+5 gp"' }
  if (parts.length > 1 && parts.some(p => !p[2])) return { error: 'With several amounts, give each its coin: "12 gp 7 sp"' }
  if (!electrum && parts.some(p => p[2] === 'ep')) return { error: 'No electrum (ep) in this world: use gp, sp or cp' }
  let cp = 0
  for (const p of parts) {
    const n = num(p[1])
    if (!isFinite(n)) return { error: `"${p[1]}" isn't a number` }
    cp += n * MULT[p[2] ?? 'gp']
  }
  cp = Math.round(cp)
  if (!sign) return { cp }
  const out = current + sign * cp
  if (out < 0) return { error: 'Not enough money for that' }
  return { cp: out }
}
