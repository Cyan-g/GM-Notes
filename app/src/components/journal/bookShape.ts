// The open journal's shape, worked out in pixels from the spread's size and the pages under each side: each page's
// outline (its clip-path), the gilded frame drawn along it, where the frame's corner scrolls sit, how far the shadow
// into the spine reaches, and the outlines of the sheets stacked under each page. One set of numbers, so the edge, the
// frame, the shading and the stack bend together.
//
// A page curves gently from its outer edge to a crest near the spine, then bends down into the spine across a strip
// by it; the more paper lies under that side, the wider that strip and the steeper the bend, and the deeper into the
// spine its frame and margin go. The spine itself sits lower toward the seam's ends (`dSpine`), each page as low as
// the paper under it allows (`d`, style.css translates the page and its stack by it). The sheets under a page follow
// its curve and bend, a little flatter the deeper they lie.

/** The stacks' full depth below the spread (style.css --stack-max), px. */
export const STACK = 13
/** How far a page's box reaches above the spread (style.css --page-pad), px: room for its curve near the spine, which
 * rises above the spread's top (outside its box it wouldn't be drawn). Page boxes' y counts from that higher top. */
export const PAD = 12
/** How far a page's edges dip from their crest to its outer corners, as a share of its height (style.css --dip). */
const DIP = 0.02
/** The seam's half width (style.css --seam-a), px. */
const SEAM_HALF = 26

// the curve from the outer edge (t 0) to the spine (t 1): its crest about 8% from the spine (as the CSS outlines)
const T0 = 0.92, Q = 33
const B = (2 * T0 ** (2 - Q)) / Q
const M = T0 * T0 - B * T0 ** Q
/** How high the curve has risen at t: 0 at the outer edge, 1 at the crest. */
const lift = (t: number) => (t * t - B * t ** Q) / M

export interface ShapeInput {
  /** The spread's size (its two pages side by side), px. */
  w: number
  h: number
  /** How far the spine sits right of the cover's middle, px (style.css --spine-shift: the spread slides by it). */
  shift: number
  /** The seam's height where the spine is, 0 (its ends) to 1 (its middle); how much lower the spine sits there, px. */
  sq: number
  dSpine: number
  /** How much lower each page sits than one on a full stack, px; how bent into the spine, 0 to 1 (more paper: more). */
  dL: number
  dR: number
  bL: number
  bR: number
  /** How strongly each page curves, 0 (flat: no paper under it, it lies on the cover) to 1. */
  aL: number
  aR: number
  /** The decorative style: Runecarved cuts the outer corners, the others round them. */
  fx: string
}
/** A sheet in a stack: how far below the open page it lies, how far out past it it reaches (px), how strongly it
 * curves (the open page: 1), and where across the seam's oval it's bound (px from its middle: a fixed point, the same
 * whichever page is open). */
export interface SheetIn { off: number; out: number; k: number; bind: number }
export interface PageShape {
  /** The page box's size, px (its height reaches the stacks' depth below the spread). */
  w: number
  h: number
  /** Its outline, for clip-path: path(). */
  clip: string
  /** The gilded frame's two lines, in the page box's px. */
  frameOuter: string
  frameInner: string
  /** The frame's corner scrolls on the spine side (style.css): how far in from the page's spine edge, and how far
   * from the top and from the bottom of the corner box. */
  cornerIn: number
  cornerTop: number
  cornerBottom: number
  /** The shadow into the spine: how far it reaches, how dark it is. */
  gutter: number
  gutterAlpha: number
  /** Where the page's top edge meets the spine, in the spread's px (style.css: the spine line starts there). */
  spineTop: number
}

const n = (v: number) => (Math.round(v * 10) / 10).toString()
/**
 * One continuous curve from an edge's pieces (the bend into the spine, the page's gentle curve out to the edge): its
 * first `keep` px along it from the spine stay exactly as they are; beyond, it is smoothed more and more (a gaussian
 * along its length, up to `sigma` px wide), so its bend fades gradually into the gentle curve instead of meeting it at
 * a join. `line`: points from the spine out; its last point (the outer edge) stays put.
 */
function smoothed(line: number[][], keep = 36, sigma = 24.2): number[][] {
  // the line at even steps along its length
  const step = 1.5
  const even: number[][] = [line[0]]
  const along: number[] = [0]
  for (let k = 1; k < line.length; k++) {
    const [x0, y0] = line[k - 1], [x1, y1] = line[k]
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.ceil(len / step))
    for (let m = 1; m <= n; m++) {
      even.push([x0 + ((x1 - x0) * m) / n, y0 + ((y1 - y0) * m) / n])
      along.push(along[along.length - 1] + len / n)
    }
  }
  const out: number[][] = []
  for (let k = 0; k < even.length; k++) {
    const sg = Math.min(sigma, Math.max(0, ((along[k] - keep) * 0.4) / 1.1))
    if (sg < 0.5 || k === even.length - 1) { out.push(even[k]); continue }
    const reach = Math.ceil((3 * sg) / step)
    let sx = 0, sy = 0, sw = 0
    for (let m = Math.max(0, k - reach); m <= Math.min(even.length - 1, k + reach); m++) {
      const d = (along[m] - along[k]) / sg, w = Math.exp(-0.5 * d * d)
      sx += even[m][0] * w; sy += even[m][1] * w; sw += w
    }
    out.push([sx / sw, sy / sw])
  }
  // fewer points for the path: every 4th, the ends kept
  return out.filter((_, k) => k % 4 === 0 || k === out.length - 1)
}
/** A polyline's height at `px` (its points as [px, y], in either order along px); level beyond its ends. */
function heightAt(line: number[][], px: number): number {
  const pts = line[0][0] <= line[line.length - 1][0] ? line : [...line].reverse()
  if (px <= pts[0][0]) return pts[0][1]
  for (let k = 1; k < pts.length; k++) {
    if (px <= pts[k][0]) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (px - x0)) / (x1 - x0)
    }
  }
  return pts[pts.length - 1][1]
}

/** What a page's shape is worked out from, for one side. */
function sideOf(side: 'l' | 'r', i: ShapeInput) {
  // every page as wide as every other (the spread slides with the spine instead, style.css)
  const pw = i.w / 2
  const hb = i.h + STACK
  const b = side === 'l' ? i.bL : i.bR
  const d = side === 'l' ? i.dL : i.dR
  const amp = side === 'l' ? i.aL : i.aR
  /** The spread's x for a point `px` from this page's outer edge. */
  const spreadX = (px: number) => (side === 'l' ? px : i.w / 2 + (pw - px))
  /** The seam's oval (style.css .spine-gap: 26px to either side of the cover's middle, as high as the stacks; the
   * spread is slid `shift` from it): its top edge at spread x, in the spread's px; nothing outside it. */
  const ovalTop = (x: number) => {
    const u = (x - (i.w / 2 - i.shift)) / SEAM_HALF
    return Math.abs(u) < 1 ? i.h + STACK - STACK * Math.sqrt(1 - u * u) : Infinity
  }
  /** Where a page of this side's block is bound into the spine: `frac` 0 is the top page, at the spine's place on the
   * seam's oval; 1 the bottom one, at the oval's end on this side. The point (px from the page's outer edge, the spread's
   * y) and the oval's outward normal there, as px and y; never pointing toward the other block (straight up instead). */
  const bindAt = (frac: number) => bindAtX(i.shift + ((side === 'l' ? -SEAM_HALF : SEAM_HALF) - i.shift) * frac)
  /** The same at a given point across the oval: `xr` px from its middle. */
  const bindAtX = (xr: number) => {
    const a = SEAM_HALF
    const u = Math.max(-1, Math.min(1, xr / a))
    const cy = i.h + STACK
    const y = cy - STACK * Math.sqrt(1 - u * u)
    let nx = xr / (a * a), ny = (y - cy) / (STACK * STACK)
    const len = Math.hypot(nx, ny) || 1
    nx /= len; ny /= len
    const X = i.w / 2 - i.shift + xr
    const px = side === 'l' ? X : pw - (X - i.w / 2)
    let npx = side === 'l' ? nx : -nx
    if (npx > 0) { npx = 0; ny = -1 }
    return { px, y, npx, ny }
  }
  // the strip that bends into the spine (wider with more paper under the page), and the angles its edges meet the
  // spine at (steeper with more paper)
  const bend = Math.min(pw * 0.35, 46 + 104 * b)
  return {
    pw, hb, b, d, bend, t0: 1 - bend / pw, dip: DIP * hb, amp, spreadX, ovalTop, bindAt, bindAtX,
    tanTop: Math.tan(((6 + 22 * b) * Math.PI) / 180),
    tanBottom: Math.tan(((10 + 38 * b) * Math.PI) / 180),
    // where the spine's top and bottom are, in the page's box (the page itself sits `d` lower)
    spineTop: 0.753 * DIP * i.h + i.dSpine - d,
    spineBottom: hb - STACK * i.sq - d,
  }
}

/**
 * An outline from a page's curve and bend: along the top from the outer edge, the bend down into the spine, the spine,
 * the bend back out along the bottom, to the outer edge. `x`: where a point `px` from the page's outer edge lies in the
 * box drawn in; `top`, `bottom`: the edges' heights at t (0 outer, 1 spine) before the bend; `spineTop`, `spineBottom`:
 * where they meet the spine; `sx`: how far from the outer edge the spine side is; `from`: where along the top it
 * starts (px from the outer edge); `corner`: the outer corners' rounding, 'cut' for chamfers, 0 for square.
 */
function trace(o: {
  pw: number; bend: number; t0: number; tanTop: number; tanBottom: number
  x: (px: number) => number; top: (t: number) => number; bottom: (t: number) => number
  spineTop: number; spineBottom: number; sx: number; from: number; corner: number | 'cut'
  /** The lowest the bottom edge may go at a point `px` from the outer edge (the seam's oval: paper wraps around it). */
  floor?: (px: number) => number
  /** The bottom edge keeps its own curve to the spine instead of bending (the page and the sheets under it, wrapping
   * only around the seam's oval); the top edge too (the frame: where the page bends away, the page's outline hides it). */
  plainBottom?: boolean
  plainTop?: boolean
  /** Where the bottom edge is bound into the spine (px from the outer edge, y in the box drawn in) and the direction it
   * leaves it in (at right angles to the seam's oval): from there it eases into its own curve. */
  bind?: { px: number; y: number; npx: number; ny: number }
}): string {
  const { pw, bend, t0 } = o
  const pt = (px: number, y: number) => `${n(o.x(px))} ${n(y)}`
  const slope = (f: (t: number) => number, t: number) => (f(t + 0.001) - f(t - 0.001)) / (0.002 * pw)
  const x0 = t0 * pw
  const ts: number[] = []
  for (let t = o.from / pw; t < t0; t += 0.04) ts.push(t)
  ts.push(t0)
  // the bend: a long, soft handle out of the curve, so it eases away from it; into the spine a handle at the angle the
  // edge meets it, never rising more than the edge actually drops there (else the curve would swing up into a hump)
  const out = bend * 0.55
  const mTop = slope(o.top, t0), mBot = slope(o.bottom, t0)
  const reach = Math.min(bend * 0.45, o.sx - x0)
  const intoTop = Math.min(reach, (0.8 * Math.max(0.5, o.spineTop - o.top(t0))) / o.tanTop)
  const intoBottom = Math.min(reach, (0.8 * Math.max(0.5, o.spineBottom - o.bottom(t0))) / o.tanBottom)
  const parts: string[] = []
  const r = o.corner === 'cut' ? 16 : o.corner
  const t = (px: number) => px / pw
  if (r) {
    parts.push(`M ${pt(o.from, o.top(t(o.from)) + r)}`)
    parts.push(o.corner === 'cut' ? `L ${pt(o.from + r, o.top(t(o.from + r)))}` : `Q ${pt(o.from, o.top(t(o.from)))} ${pt(o.from + r, o.top(t(o.from + r)))}`)
  } else parts.push(`M ${pt(o.from, o.top(t(o.from)))}`)
  for (const u of ts.slice(1)) parts.push(`L ${pt(u * pw, o.top(u))}`)
  if (o.plainTop) {
    for (let k = 1; k <= 12; k++) { const bx = x0 + (k / 12) * (o.sx - x0); parts.push(`L ${pt(bx, o.top(bx / pw))}`) }
  } else parts.push(`C ${pt(x0 + out, o.top(t0) + mTop * out)} ${pt(o.sx - intoTop, o.spineTop - o.tanTop * intoTop)} ${pt(o.sx, o.spineTop)}`)
  parts.push(`L ${pt(o.sx, o.spineBottom)}`)
  // (the bend back out along the bottom, as points, each kept above the seam's oval: the paper wraps around it)
  const b0 = [o.sx, o.spineBottom], b1 = [o.sx - intoBottom, o.spineBottom - o.tanBottom * intoBottom]
  const b2 = [x0 + out, o.bottom(t0) + mBot * out], b3 = [x0, o.bottom(t0)]
  const keep = (bx: number, by: number) => (o.floor ? Math.min(by, o.floor(bx)) : by)
  if (o.bind) {
    // from the spine to where it's bound, out of the oval at right angles, easing into its own curve 90px from the spine
    // (the same for every page, so they stay in order, none crossing the one beneath), then along it to the outer edge
    const bd = o.bind
    parts.push(`L ${pt(bd.px, bd.y)}`)
    const jx = Math.max(o.from + 8, Math.min(bd.px - 20, o.sx - 90)), jy = o.bottom(jx / pw)
    const mj = (o.bottom((jx + 1) / pw) - o.bottom((jx - 1) / pw)) / 2
    const dist = Math.hypot(bd.px - jx, bd.y - jy)
    const tl = Math.hypot(1, mj)
    const c0 = [bd.px, bd.y], c1 = [bd.px + bd.npx * dist * 0.3, bd.y + bd.ny * dist * 0.3]
    const c2 = [jx + (dist * 0.55) / tl, jy + (mj * dist * 0.55) / tl], c3 = [jx, jy]
    for (let k = 1; k <= 16; k++) {
      const u = k / 16, v = 1 - u
      const bx = v * v * v * c0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * c3[0]
      const by = v * v * v * c0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * c3[1]
      parts.push(`L ${pt(bx, keep(bx, by))}`)
    }
    for (let bx = jx - pw * 0.03; bx > o.from; bx -= pw * 0.03) parts.push(`L ${pt(bx, o.bottom(bx / pw))}`)
  } else if (o.plainBottom) {
    for (let k = 1; k <= 24; k++) {
      const bx = o.sx - (k / 24) * (o.sx - x0), by = o.bottom(bx / pw)
      parts.push(`L ${pt(bx, keep(bx, by))}`)
    }
  } else for (let k = 1; k <= 24; k++) {
    const u = k / 24, v = 1 - u
    const bx = v * v * v * b0[0] + 3 * v * v * u * b1[0] + 3 * v * u * u * b2[0] + u * u * u * b3[0]
    const by = v * v * v * b0[1] + 3 * v * v * u * b1[1] + 3 * v * u * u * b2[1] + u * u * u * b3[1]
    parts.push(`L ${pt(bx, o.floor ? Math.min(by, o.floor(bx)) : by)}`)
  }
  if (!o.bind) for (const u of ts.slice(0, -1).reverse()) parts.push(`L ${pt(u * pw, o.bottom(u))}`)
  if (r) {
    parts.push(`L ${pt(o.from + r, o.bottom(t(o.from + r)))}`)
    parts.push(o.corner === 'cut' ? `L ${pt(o.from, o.bottom(t(o.from)) - r)}` : `Q ${pt(o.from, o.bottom(t(o.from)))} ${pt(o.from, o.bottom(t(o.from)) - r)}`)
  } else parts.push(`L ${pt(o.from, o.bottom(t(o.from)))}`)
  parts.push('Z')
  return parts.join(' ')
}

/**
 * An outline as high everywhere across its width (paper keeps its height however it bends): its bottom edge from the
 * spine, bound into the seam's oval at `bind` and leaving it at right angles, easing into its own curve 90px from the
 * spine (the same for every page, so none crosses the one beneath), on to the outer edge; its top edge is that same
 * line raised by `height`. `sx`: its spine side (px from the outer edge); `cap`: how low it reaches at the spine when
 * it's bound further out than that (a sheet: down to the oval there); `corner`: the outer corners' rounding, 'cut' for
 * chamfers.
 */
function bound(o: {
  pw: number; x: (px: number) => number; bottom: (t: number) => number; floor: (px: number) => number
  bind: { px: number; y: number; npx: number; ny: number }; height: number; sx: number; cap: number; from: number
  corner: number | 'cut'
  /** The highest the top edge may reach at a point `px` from the outer edge (a sheet: never above the open page). */
  topCap?: (px: number) => number
}): { d: string; top: number[][]; bottom: number[][] } {
  const { pw, bind: bd } = o
  const pt = (px: number, y: number) => `${n(o.x(px))} ${n(y)}`
  const keep = (px: number, y: number) => Math.min(y, o.floor(px))
  // the bottom edge, from the spine out
  const pts: number[][] = []
  if (bd.px < o.sx - 0.5) pts.push([o.sx, o.cap])
  pts.push([bd.px, bd.y])
  const jx = Math.max(o.from + 8, Math.min(bd.px - 20, o.sx - 90)), jy = o.bottom(jx / pw)
  const mj = (o.bottom((jx + 1) / pw) - o.bottom((jx - 1) / pw)) / 2
  const dist = Math.hypot(bd.px - jx, bd.y - jy), tl = Math.hypot(1, mj)
  const c0 = [bd.px, bd.y], c1 = [bd.px + bd.npx * dist * 0.3, bd.y + bd.ny * dist * 0.3]
  const c2 = [jx + (dist * 0.55) / tl, jy + (mj * dist * 0.55) / tl], c3 = [jx, jy]
  for (let k = 1; k <= 16; k++) {
    const u = k / 16, v = 1 - u
    const bx = v * v * v * c0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * c3[0]
    const by = v * v * v * c0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * c3[1]
    pts.push([bx, keep(bx, by)])
  }
  for (let bx = jx - pw * 0.03; bx > o.from + 1; bx -= pw * 0.03) pts.push([bx, o.bottom(bx / pw)])
  pts.push([o.from, o.bottom(o.from / pw)])
  // (one continuous curve: the bend into the spine kept as it is, fading gradually into the gentle curve)
  const head = pts[0][0] === bd.px ? [] : [pts.shift()!]
  const raw = pts.map(q => [...q])
  const bottomLine = [...head, ...smoothed(raw)]
  pts.length = 0
  pts.push(...bottomLine)
  // the top edge: exactly the same curve, raised by the height (so the page is as high everywhere)
  let topPts = pts.map(([px, y]) => [px, y - o.height])
  if (o.topCap) topPts = topPts.map(([px, y]) => [px, Math.max(y, o.topCap!(px))])
  const spineToOuter = topPts.map(q => [...q])
  const top = topPts.reverse()
  const r = o.corner === 'cut' ? 16 : o.corner
  const parts: string[] = []
  const [fx, fTop] = top[0], fBot = pts[pts.length - 1][1]
  if (r) {
    parts.push(`M ${pt(fx, fTop + r)}`)
    const nextTop = o.bottom((fx + r) / pw) - o.height
    parts.push(o.corner === 'cut' ? `L ${pt(fx + r, nextTop)}` : `Q ${pt(fx, fTop)} ${pt(fx + r, nextTop)}`)
  } else parts.push(`M ${pt(fx, fTop)}`)
  for (const [px, y] of top.slice(1)) if (px > fx + r) parts.push(`L ${pt(px, y)}`)
  for (const [px, y] of pts.slice(0, -1)) if (px > fx + r) parts.push(`L ${pt(px, y)}`)
  if (r) {
    parts.push(`L ${pt(fx + r, o.bottom((fx + r) / pw))}`)
    parts.push(o.corner === 'cut' ? `L ${pt(fx, fBot - r)}` : `Q ${pt(fx, fBot)} ${pt(fx, fBot - r)}`)
  } else parts.push(`L ${pt(fx, fBot)}`)
  parts.push('Z')
  return { d: parts.join(' '), top: spineToOuter, bottom: pts.map(q => [...q]) }
}

/** The open page's outline on one side, and its top edge (px from the outer edge, y in its box). */
function pageOutline(side: 'l' | 'r', i: ShapeInput) {
  const s = sideOf(side, i)
  const x = (px: number) => (side === 'l' ? px : s.pw - px)
  // (in the page box's px, which start PAD above the spread)
  const bottom = (t: number) => PAD + s.hb - STACK - s.dip * s.amp * lift(t)
  const floor = (px: number) => PAD + s.ovalTop(s.spreadX(px)) - s.d
  // as high everywhere across its width, its bottom (and so its top) bound into the seam's oval at the spine's place,
  // leaving it at right angles; its top the same curve raised
  const bp = s.bindAt(0)
  return bound({
    pw: s.pw, x, bottom, floor, bind: { ...bp, y: PAD + bp.y - s.d }, height: s.hb - STACK - s.dip, sx: s.pw,
    cap: PAD + bp.y - s.d, from: 0, corner: i.fx === 'runecarved' ? 'cut' : 6,
  })
}

/** One page's shape. Its spine edge is at its right (left page) or left (right page). */
function page(side: 'l' | 'r', i: ShapeInput): PageShape {
  const s = sideOf(side, i)
  const x = (px: number) => (side === 'l' ? px : s.pw - px)
  // (the outer corners where a curved page's are; a page with less paper under it rises less from them, a page on the
  // cover not at all: it lies flat, the cover showing above it)
  const top = (t: number) => PAD + s.dip * (1 - s.amp * lift(t))
  const bottom = (t: number) => PAD + s.hb - STACK - s.dip * s.amp * lift(t)
  const bp = s.bindAt(0)
  const height = s.hb - STACK - s.dip
  const outline = pageOutline(side, i)
  const clip = outline.d
  // its frame, inset by `m` all round: along the page's own outline (its top and bottom edges, bend into the spine and
  // all), square-cornered
  const topAt = (px: number) => heightAt(outline.top, px), bottomAt = (px: number) => heightAt(outline.bottom, px)
  const frame = (m: number) => {
    const xs: number[] = []
    for (let px = m; px < s.pw - m - 40; px += s.pw * 0.02) xs.push(px)
    for (let px = Math.max(m, s.pw - m - 40); px < s.pw - m; px += 2) xs.push(px)
    xs.push(s.pw - m)
    const pt = (px: number, y: number) => `${n(x(px))} ${n(y)}`
    return [`M ${pt(xs[0], topAt(xs[0]) + m)}`, ...xs.slice(1).map(px => `L ${pt(px, topAt(px) + m)}`),
      ...[...xs].reverse().map(px => `L ${pt(px, bottomAt(px) - m)}`), 'Z'].join(' ')
  }
  return {
    w: s.pw,
    h: s.hb + PAD,
    clip,
    frameOuter: frame(11),
    frameInner: frame(15),
    cornerIn: 0,
    spineTop: bp.y - height,
    // (where the frame turns at the spine side, from the corner scrolls' box, which starts PAD lower: style.css)
    cornerTop: topAt(s.pw - 11) - PAD,
    cornerBottom: s.hb + PAD - STACK - bottomAt(s.pw - 11),
    gutter: 16 + 0.5 * s.bend,
    gutterAlpha: 0.1 + 0.2 * s.b,
  }
}

/**
 * A stacked sheet's outline, in its own box: as wide as the page and `out` more on the outer side, as high as the
 * spread (style.css .sheet; it lies `off` lower than the page). Its bottom is the page's curve at `k` strength, bound
 * into the spine at its point on the seam's oval and leaving it at right angles, so the sheets fan out of the spine and
 * fill the space under the page down to the cover; its top is that raised by the page's height (it never shows above
 * the page).
 */
export function sheetClip(side: 'l' | 'r', i: ShapeInput, sh: SheetIn): string {
  const s = sideOf(side, i)
  const h = i.h
  const x = (px: number) => (side === 'l' ? px + sh.out : s.pw - px)
  const bottom = (t: number) => h - sh.k * s.dip * s.amp * lift(t)
  // bound into the spine further along the seam's oval the deeper it lies, leaving it at right angles; at the spine
  // it runs down to the oval (which lies over where it meets the spine)
  const bp = s.bindAtX(sh.bind)
  const floor = (px: number) => s.ovalTop(s.spreadX(px)) - s.d - sh.off
  const pageTop = pageOutline(side, i).top
  return bound({
    pw: s.pw, x, bottom, floor, bind: { ...bp, y: bp.y - s.d - sh.off }, height: s.hb - STACK - s.dip, sx: s.pw,
    cap: Math.min(h, floor(s.pw)), from: -sh.out, corner: 6, topCap: px => heightAt(pageTop, px) - PAD - sh.off,
  }).d
}

export function bookShape(i: ShapeInput): { l: PageShape; r: PageShape } | null {
  if (i.w < 100 || i.h < 100) return null
  return { l: page('l', i), r: page('r', i) }
}
