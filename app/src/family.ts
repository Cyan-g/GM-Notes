// Family trees from the parent / spouse / sibling relations: who belongs to someone's tree, which generation
// everyone is in, and where each person sits so lines cross as little as possible. Generations run top to bottom.
import type { Id } from './model/types'
import { get, relationsOf } from './store'

export interface Kin { parents: Id[]; children: Id[]; spouses: Id[]; siblings: Id[] }

export function kinOf(id: Id): Kin {
  const k: Kin = { parents: [], children: [], spouses: [], siblings: [] }
  for (const r of relationsOf.value.get(id) ?? []) {
    const other = r.a === id ? r.b : r.a
    if (!get(other) || other === id) continue
    if (r.kind === 'parent') (r.a === id ? k.children : k.parents).push(other)
    else if (r.kind === 'spouse') k.spouses.push(other)
    else if (r.kind === 'sibling') k.siblings.push(other)
  }
  return k
}

/** How many family relations someone has, for the tab label. */
export const familySize = (id: Id) => { const k = kinOf(id); return k.parents.length + k.children.length + k.spouses.length + k.siblings.length }

export interface TreeNode { id: Id; gen: number; x: number; y: number }
export interface TreeLine { d: string; kind: 'couple' | 'descent' | 'sibling' }
export interface Tree { nodes: TreeNode[]; lines: TreeLine[]; width: number; height: number }

export const NODE_W = 190, NODE_H = 62
const GAP = 22, BLOCK_GAP = 40, ROW_GAP = 76
const MAX_STEPS = 4, MAX_GEN = 3, MAX_PEOPLE = 80

export function buildTree(focus: Id): Tree {
  // ---- who: everyone within a few family steps, with their generation ----
  const gen = new Map<Id, number>([[focus, 0]])
  const order: Id[] = [focus]
  const kin = new Map<Id, Kin>()
  const K = (id: Id) => { if (!kin.has(id)) kin.set(id, kinOf(id)); return kin.get(id)! }
  let frontier = [focus]
  for (let step = 0; step < MAX_STEPS && frontier.length && order.length < MAX_PEOPLE; step++) {
    const next: Id[] = []
    for (const id of frontier) {
      const g = gen.get(id)!, k = K(id)
      const add = (o: Id, og: number) => {
        if (gen.has(o) || Math.abs(og) > MAX_GEN || order.length >= MAX_PEOPLE) return
        gen.set(o, og); order.push(o); next.push(o)
      }
      k.parents.forEach(p => add(p, g - 1))
      k.spouses.forEach(s => add(s, g))
      k.siblings.forEach(s => add(s, g))
      k.children.forEach(c => add(c, g + 1))
    }
    frontier = next
  }
  const inTree = (id: Id) => gen.has(id)
  const parentsIn = (id: Id) => K(id).parents.filter(p => inTree(p) && gen.get(p) === gen.get(id)! - 1)
  const childrenIn = (id: Id) => K(id).children.filter(c => inTree(c) && gen.get(c) === gen.get(id)! + 1)

  // ---- rows of blocks: a block is people married to each other, kept side by side ----
  const gens = [...new Set(gen.values())].sort((a, b) => a - b)
  const blockOf = new Map<Id, Id[]>()
  for (const id of order) {
    if (blockOf.has(id)) continue
    const block: Id[] = []
    const stack = [id]
    while (stack.length) {
      const x = stack.pop()!
      if (blockOf.has(x)) continue
      blockOf.set(x, block); block.push(x)
      K(x).spouses.filter(s => inTree(s) && gen.get(s) === gen.get(x)).forEach(s => stack.push(s))
    }
    // Someone with two spouses stands between them.
    if (block.length === 3) { const hub = block.find(b => K(b).spouses.filter(s => block.includes(s)).length === 2); if (hub) block.splice(0, 3, block.find(b => b !== hub)!, hub, block.filter(b => b !== hub)[1]) }
  }
  const rows = gens.map(g => [...new Set(order.filter(id => gen.get(id) === g).map(id => blockOf.get(id)!))])

  // ---- positions: place each row under its parents (down), then over its children (up), then down again ----
  const x = new Map<Id, number>()
  const width = (b: Id[]) => b.length * NODE_W + (b.length - 1) * GAP
  rows.forEach(row => { let cur = 0; for (const b of row) { b.forEach((id, i) => x.set(id, cur + i * (NODE_W + GAP))); cur += width(b) + BLOCK_GAP } })
  const centre = (id: Id) => x.get(id)! + NODE_W / 2
  const mean = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length
  function place(row: Id[][], linked: (id: Id) => Id[]) {
    // Order blocks by where they want to be, then lay them out left to right without overlapping.
    const want = (b: Id[]) => { const l = b.flatMap(linked); return l.length ? mean(l.map(centre)) : mean(b.map(centre)) }
    // Within a block, the member with links to the left goes left.
    for (const b of row) if (b.length === 2) { const [p, q] = b; const wp = linked(p).length ? mean(linked(p).map(centre)) : NaN, wq = linked(q).length ? mean(linked(q).map(centre)) : NaN; if (wp > wq) b.reverse() }
    const wants = new Map(row.map(b => [b, want(b)]))
    row.sort((a, b) => wants.get(a)! - wants.get(b)!)
    let cursor = -Infinity
    const shifts: number[] = []
    for (const b of row) {
      const w = width(b), start = Math.max(wants.get(b)! - w / 2, cursor)
      shifts.push(start - (wants.get(b)! - w / 2))
      b.forEach((id, i) => x.set(id, start + i * (NODE_W + GAP)))
      cursor = start + w + BLOCK_GAP
    }
    // Pushing only goes right; shift the row back so it sits centred on what it wanted.
    const back = mean(shifts) / 2
    row.flat().forEach(id => x.set(id, x.get(id)! - back))
    // A couple where one married in: the one born into this tree stands on the side of their brothers and sisters.
    for (const b of row) {
      if (b.length !== 2) continue
      const born = b.filter(id => parentsIn(id).length)
      if (born.length !== 1) continue
      const p = born[0]
      const sibs = row.flat().filter(o => o !== p && !b.includes(o) && parentsIn(o).some(q => parentsIn(p).includes(q)))
      if (!sibs.length) continue
      const sibsRight = mean(sibs.map(centre)) > centre(p)
      if (sibsRight !== (b[1] === p)) {
        const [l, r] = [x.get(b[0])!, x.get(b[1])!]
        b.reverse(); x.set(b[0], l); x.set(b[1], r)
      }
    }
  }
  /** Going down: under one's parents; a brother or sister recorded without parents goes under the sibling's parents. */
  const above = (id: Id) => {
    const p = parentsIn(id)
    if (p.length) return p
    const sibs = K(id).siblings.filter(s => inTree(s) && gen.get(s) === gen.get(id))
    const viaSibs = sibs.flatMap(parentsIn)
    return viaSibs.length ? viaSibs : sibs
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < rows.length; i++) place(rows[i], above)
    for (let i = rows.length - 2; i >= 0; i--) place(rows[i], childrenIn)
  }
  for (let i = 1; i < rows.length; i++) place(rows[i], above)

  const minX = Math.min(...[...x.values()])
  const nodes: TreeNode[] = order.map(id => ({ id, gen: gen.get(id)!, x: x.get(id)! - minX + 16, y: gens.indexOf(gen.get(id)!) * (NODE_H + ROW_GAP) + 16 }))
  const at = new Map(nodes.map(n => [n.id, n]))
  const W = Math.max(...nodes.map(n => n.x + NODE_W)) + 16
  const H = rows.length * (NODE_H + ROW_GAP) - ROW_GAP + 32

  // ---- lines ----
  const lines: TreeLine[] = []
  const mid = (n: TreeNode) => n.x + NODE_W / 2
  // Couples: a line between them at half height.
  const seen = new Set<string>()
  for (const n of nodes) for (const s of K(n.id).spouses) {
    const m = at.get(s)
    const key = [n.id, s].sort().join('|')
    if (!m || m.gen !== n.gen || seen.has(key)) continue
    seen.add(key)
    const [l, r] = n.x < m.x ? [n, m] : [m, n]
    lines.push({ kind: 'couple', d: `M${l.x + NODE_W},${l.y + NODE_H / 2}H${r.x}` })
  }
  // Descent: children grouped by their pair of parents; one drop from the parents, a bar, a line to each child.
  const families = new Map<string, { parents: TreeNode[]; kids: TreeNode[] }>()
  for (const n of nodes) {
    const ps = parentsIn(n.id)
    if (!ps.length) continue
    const key = [...ps].sort().join('|')
    if (!families.has(key)) families.set(key, { parents: ps.map(p => at.get(p)!), kids: [] })
    families.get(key)!.kids.push(n)
  }
  for (const { parents, kids } of families.values()) {
    const top = parents[0].y
    const two = parents.length >= 2
    const dropX = mean(parents.map(mid))
    const startY = two ? top + NODE_H / 2 : top + NODE_H
    const barY = kids[0].y - ROW_GAP / 2
    const xs = [dropX, ...kids.map(mid)]
    let d = `M${dropX},${startY}V${barY}M${Math.min(...xs)},${barY}H${Math.max(...xs)}`
    for (const k of kids) d += `M${mid(k)},${barY}V${k.y}`
    // Two parents who aren't drawn as a couple still get joined, so the drop has somewhere to start.
    if (two && !seen.has(parents.map(p => p.id).sort().join('|'))) {
      const [l, r] = [...parents].sort((a, b) => a.x - b.x)
      d += `M${l.x + NODE_W},${top + NODE_H / 2}H${r.x}`
    }
    lines.push({ kind: 'descent', d })
  }
  // Siblings whose parents aren't in the tree: a bracket above them.
  const sibSeen = new Set<string>()
  for (const n of nodes) for (const s of K(n.id).siblings) {
    const m = at.get(s)
    const key = [n.id, s].sort().join('|')
    if (!m || m.gen !== n.gen || sibSeen.has(key)) continue
    sibSeen.add(key)
    const shared = parentsIn(n.id).some(p => parentsIn(s).includes(p))
    if (shared) continue
    const y = n.y - 14
    lines.push({ kind: 'sibling', d: `M${mid(n)},${n.y}V${y}H${mid(m)}V${m.y}` })
  }
  return { nodes, lines, width: W, height: H }
}

