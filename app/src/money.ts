// Money: amounts are stored as a whole number of the world's base coin (copper in the standard currency). The
// currency (the Ruleset's "Currency") names the coins, from the base up, each worth some of the one below it
// ("10 cp = 1 sp"); one is the main coin the rules count in (gold), the default when a number has no coin.
// Changing a ratio never rewrites stored amounts: they count base coins, and are shown in the new coins.
//
// Typed into a money field: one amount ("12.5", "12 gp", "195 sp"), mixed coins ("12 gp 7 sp 3 cp", "12gp 7sp"), or a
// change to what's there ("+5 gp", "-3 sp 5 cp", "−20"). Thousands may be written with "," or "." ("1,250 gp",
// "1.250 gp": a separator followed by exactly three digits; "1,255.3" and "1.255,3": the last one is the decimal
// point); otherwise "," and "." are the decimal point.
// No vue here: tests import it directly.

export interface Coin {
  /** What amounts are written with ("gp"). */
  abbr: string
  /** Its name ("gold"). */
  name: string
  /** How many of the coin below it make one of this (1 for the base coin). */
  per: number
  /** Accepted when typed, but amounts aren't broken into it (electrum, platinum). Never the base coin. */
  noSplit?: boolean
}
export interface Currency {
  /** From the base coin up. */
  coins: Coin[]
  /** The coin the rules count in and a number without a coin means (its abbreviation). */
  main: string
}

export const STANDARD_CURRENCY: Currency = {
  coins: [
    { abbr: 'cp', name: 'copper', per: 1 },
    { abbr: 'sp', name: 'silver', per: 10 },
    { abbr: 'ep', name: 'electrum', per: 5, noSplit: true },
    { abbr: 'gp', name: 'gold', per: 2 },
    { abbr: 'pp', name: 'platinum', per: 10, noSplit: true },
  ],
  main: 'gp',
}

/** A currency made usable: at least one coin, whole ratios of 2 or more above the base, the main coin one of them. */
export function cleanCurrency(c: Partial<Currency> | null | undefined): Currency {
  const coins = (c?.coins ?? []).filter(x => x && String(x.abbr ?? '').trim())
    .map((x, i) => ({ abbr: String(x.abbr).trim(), name: String(x.name ?? '').trim(), per: i ? Math.max(2, Math.round(Number(x.per) || 2)) : 1, ...(i && x.noSplit ? { noSplit: true } : {}) }))
  if (!coins.length) return STANDARD_CURRENCY
  const main = coins.some(x => x.abbr === c?.main) ? c!.main! : coins[coins.length - 1].abbr
  return { coins, main }
}

/** Each coin's worth in base coins, in the currency's order. */
export function worths(c: Currency): number[] {
  let w = 1
  return c.coins.map((x, i) => (w = i ? w * x.per : 1))
}
/** What the main coin is worth in base coins (100 in the standard currency). */
export const mainWorth = (c: Currency) => worths(c)[Math.max(0, c.coins.findIndex(x => x.abbr === c.main))]

/** An amount broken into coins, the largest first: the fewest coins, leaving out those not split into. */
export function splitCoins(amount: number, c: Currency): { coin: Coin; n: number }[] {
  const w = worths(c), out: { coin: Coin; n: number }[] = []
  let left = Math.max(0, Math.round(amount))
  for (let i = c.coins.length - 1; i >= 0; i--) {
    if (i && c.coins[i].noSplit) continue
    const n = Math.floor(left / w[i])
    if (n) { out.push({ coin: c.coins[i], n }); left -= n * w[i] }
  }
  return out
}

/** An amount in words: "12 gp 5 sp 3 cp", "0 cp". */
export function formatCoins(amount: unknown, c: Currency): string {
  if (typeof amount !== 'number' || !isFinite(amount)) return ''
  if (amount < 0) return '−' + formatCoins(-amount, c)
  const parts = splitCoins(amount, c)
  return parts.length ? parts.map(p => `${p.n.toLocaleString()} ${p.coin.abbr}`).join(' ') : `0 ${c.coins[0].abbr}`
}

/** How many coins an amount is at least (for coin weight). */
export const coinCount = (amount: number, c: Currency) => splitCoins(amount, c).reduce((s, p) => s + p.n, 0)

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

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Read a money field's text in base coins; `current` is what "+" and "−" change. Empty text is `{ cp: NaN }`: no amount. */
export function parseMoney(text: string, current = 0, c: Currency = STANDARD_CURRENCY): MoneyParse {
  let t = text.trim().toLowerCase().replace(/−|–/g, '-')
  if (!t) return { cp: NaN }
  const sign = t[0] === '+' ? 1 : t[0] === '-' ? -1 : 0
  if (sign) t = t.slice(1).trim()
  const w = worths(c), worth = new Map(c.coins.map((x, i) => [x.abbr.toLowerCase(), w[i]]))
  const abbrs = [...worth.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')
  const parts = [...t.matchAll(new RegExp(`(\\d[\\d.,]*)\\s*(${abbrs})?\\s*`, 'g'))]
  const names = c.coins.map(x => x.abbr)
  const eg = names.length > 1 ? `"12 ${c.main}", "12 ${c.main} 7 ${names[Math.max(0, names.indexOf(c.main) - 1)]}"` : `"12 ${c.main}"`
  // everything typed must be amounts
  if (!parts.length || parts.map(p => p[0]).join('') !== t) {
    return { error: /[a-z]/.test(t) ? `Type an amount like ${eg} or "+5 ${c.main}" (coins: ${names.join(', ')})` : `Type an amount like ${eg} or "+5 ${c.main}"` }
  }
  if (parts.length > 1 && parts.some(p => !p[2])) return { error: `With several amounts, give each its coin: ${eg}` }
  let cp = 0
  for (const p of parts) {
    const n = num(p[1])
    if (!isFinite(n)) return { error: `"${p[1]}" isn't a number` }
    cp += n * (worth.get(p[2] ?? '') ?? mainWorth(c))
  }
  cp = Math.round(cp)
  if (!sign) return { cp }
  const out = current + sign * cp
  if (out < 0) return { error: 'Not enough money for that' }
  return { cp: out }
}
