// The character the creator is making, worked out as a sheet (wizard.ts draftSheet): the numbers its steps and the
// stats panel show, the same way the finished sheet will. Each is worked out only when read.
import { computed } from 'vue'
import { draftPc, draftSheet, hpOf, ownedSpells, rules, wizard } from '../wizard'
import { ABILITY_KEYS, SKILLS, mod, profBonus, type Ability } from '../model/dnd'
import { armorClass, initiative, passivePerception, saveBonus, score, skillBonus, skillLevel, speedOf, spellStats } from '../sheet'
import { castingOf, multiclassOf } from '../classRules'
import { get } from '../store'

export function useDraftSheet() {
  const d = computed(() => wizard.d)
  const sheet = computed(() => { const sh = draftSheet(d.value); draftPc(d.value, sh); return sh })
  const pc = computed(() => draftPc(d.value, sheet.value))
  const prof = computed(() => profBonus(d.value.level))
  /** Each ability: score, modifier, saving throw (and whether proficient in it). */
  const abilities = computed(() => ABILITY_KEYS.map(a => {
    const s = score(sheet.value, a)
    return { a, score: s, mod: mod(s), save: saveBonus(sheet.value, a, prof.value), saveProf: (sheet.value.saves ?? []).includes(a) }
  }))
  /** Every skill with its bonus and proficiency (0, 1 or 2 for expertise). */
  const skills = computed(() => SKILLS.map(x => ({ ...x, bonus: skillBonus(sheet.value, x.name, prof.value), level: skillLevel(sheet.value, x.name) })))
  const hp = computed(() => (d.value.cls ? hpOf(d.value) : undefined))
  const ac = computed(() => armorClass(sheet.value).ac)
  const init = computed(() => initiative(sheet.value))
  const speed = computed(() => speedOf(sheet.value) ?? '30 ft')
  const passive = computed(() => passivePerception(sheet.value, prof.value))
  /** The class's spellcasting ability, and the attack and DC it gives. */
  const casting = computed<Ability | undefined>(() => (d.value.cls ? castingOf(d.value.cls) : undefined))
  const spell = computed(() => (casting.value ? spellStats(pc.value, casting.value) : undefined))
  /** The class's main scores (Fighter: Strength or Dexterity). */
  const primary = computed(() => { const m = d.value.cls ? multiclassOf(d.value.cls) : undefined; return { list: m?.primary ?? [], any: !!m?.any } })
  /** Its spells so far, by kind: cantrips, prepared, only in the book, and from elsewhere (species, feats). */
  const spells = computed(() => {
    const name = (id: string) => get(id)?.name ?? id
    const own = new Set([...d.value.cantrips, ...d.value.spells, ...d.value.book])
    return {
      cantrips: d.value.cantrips.map(name), prepared: d.value.spells.map(name), book: d.value.book.map(name),
      other: [...ownedSpells(d.value)].filter(([id]) => !own.has(id)).map(([id, from]) => `${name(id)} (${from.join(', ')})`),
    }
  })
  const r = computed(() => rules(d.value))
  return { d, r, sheet, pc, prof, abilities, skills, hp, ac, init, speed, passive, casting, spell, primary, spells }
}
