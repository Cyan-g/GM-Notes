// What a skill grid (components/SkillGrid.vue) lets change, wherever it's shown: the same six abilities with their
// skills everywhere, a "frame" deciding which skills can be clicked here and what a click does. The sheet's edit mode
// is free (any skill, ○ → ● → ◉); the creator's steps, a trait's or feat's choice, a swap and the level-up only allow
// what their rules allow, the rest shown as it is (with where it comes from) but locked.

/** What clicking a skill does: its words (the hover), what it adds to the skill's bonus (the "→ +4"), and doing it. */
export interface SkillAct { label: string; go: () => void; gain?: number }
export interface SkillFrame {
  /** What a click on this skill does here; undefined: it can't change here. */
  act: (name: string) => SkillAct | undefined
  /** Why it can't change here, when that's worth saying ("2 of 2 picked", "already from Acolyte"). */
  why?: (name: string) => string | undefined
  /** How it's marked in this frame: picked here, selected (to swap), or the given one a swap replaced. */
  mark?: (name: string) => 'picked' | 'selected' | 'back' | undefined
  /** The proficiency it shows (0, 1, 2) when this frame's picks aren't on the sheet yet (the level-up). */
  level?: (name: string) => number | undefined
  /** Picks left here, for the tag and the outline. */
  left?: number
}

/**
 * Pick some of a list: a class's skills, a trait's or feat's skill choice (Skillful, a background's), Expertise.
 * `levelOf`: the proficiency the skill has (0, 1, 2) with this frame's picks counted; `had`: where a skill the character
 * has anyway comes from; `orExpertise`: a pick they're proficient in already becomes expertise (Keen Mind);
 * `expertise`: picks are expertise (only skills they're proficient in).
 */
export function pickFrame(o: {
  candidates: string[]; picked: string[]; count: number; prof: number
  levelOf: (name: string) => number; had?: (name: string) => string | undefined
  orExpertise?: boolean; expertise?: boolean; toggle: (name: string) => void
}): SkillFrame {
  const left = Math.max(0, o.count - o.picked.length)
  const blocked = (n: string): string | undefined => {
    if (o.picked.includes(n)) return undefined
    if (!o.candidates.includes(n)) return 'not offered here'
    const lv = o.levelOf(n)
    if (o.expertise) { if (lv >= 2) return 'expertise already'; if (lv < 1) return 'needs proficiency first' }
    else if (lv >= 1 && !(o.orExpertise && lv === 1)) return `already proficient${o.had?.(n) ? `: ${o.had(n)}` : ''}`
    if (!left) return `${o.count} of ${o.count} picked: take one back first`
    return undefined
  }
  return {
    left,
    act: n => {
      if (o.picked.includes(n)) return { label: 'Take it back', go: () => o.toggle(n) }
      if (blocked(n)) return undefined
      const lv = o.levelOf(n)
      return { label: o.expertise || lv === 1 ? 'Expertise in it' : 'Proficiency in it', gain: o.prof, go: () => o.toggle(n) }
    },
    why: n => { const b = blocked(n); return b === 'not offered here' ? undefined : b },
    mark: n => (o.picked.includes(n) ? 'picked' : undefined),
  }
}

/** The sheet's edit mode: any skill, ○ → ● → ◉ → ○ (a given one only switches expertise). */
export function freeFrame(o: { cycle: (name: string) => void; title: (name: string) => string }): SkillFrame {
  return { act: n => ({ label: o.title(n), go: () => o.cycle(n) }) }
}

/** A given skill proficiency (a background's, a species') and what replaced it. */
export interface GivenSkill { key: string; id: string; was?: string }
/**
 * Swapping a given skill for another: click a given one (●) to pick it, then a skill the character lacks to put in its
 * place; a swapped one's original shows ↺ to go back. `selected` is the key of the given one picked to swap.
 */
export function swapFrame(o: {
  given: GivenSkill[]; selected: string | null; select: (key: string | null) => void
  swap: (key: string, id: string, original: string) => void; levelOf: (name: string) => number; prof: number
}): SkillFrame {
  const sel = o.given.find(g => g.key === o.selected)
  return {
    act: n => {
      const g = o.given.find(x => x.id === n)
      if (g) return { label: o.selected === g.key ? 'Keep it' : `Swap ${n} for another: click it, then the new one`, go: () => o.select(o.selected === g.key ? null : g.key) }
      const back = o.given.find(x => x.was === n)
      if (back) return { label: `Back to ${n}, the one given`, go: () => { o.swap(back.key, n, n); o.select(null) } }
      if (sel && o.levelOf(n) === 0) return { label: `${n} in place of ${sel.id}`, gain: o.prof, go: () => { o.swap(sel.key, n, sel.was ?? sel.id); o.select(null) } }
      return undefined
    },
    why: n => (o.given.length && !sel && o.levelOf(n) === 0 ? 'click a given skill (●) first, then this one' : undefined),
    mark: n => (o.given.some(g => g.key === o.selected && g.id === n) ? 'selected' : o.given.some(g => g.was === n) ? 'back' : o.given.some(g => g.id === n) ? 'picked' : undefined),
  }
}
