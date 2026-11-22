<script setup lang="ts">
// The caster's spellbook: attack bonus and save DC, spell slots to tick off, and the prepared spells
// with their attack or save worked out.
import AppIcon from '../components/AppIcon.vue'
import { computed, ref } from 'vue'
import { optionLabel } from '../store'
import type { Entry, Id, Spellbook } from '../model/types'
import { db, get, playerMode, touch } from '../store'
import { activeSpellbook, currentPc, levelOf as charLevel, longRest, restSummary, score, spellDamageAdd, spellStats } from '../sheet'
import { noteUndo, restoreSheet, snapSheet } from '../undoNote'
import { editSheet, sheetOf } from '../sheetData'
import { ORD, mod, spellLevel, type Ability } from '../model/dnd'
import { activeEffectsOf, isActive, rollsLine, toggleActive } from '../spells'
import { endConcentration, startConcentration } from '../conditions'
import { castFromItem, grantedSpells, restItems, unuse, type GrantedSpell } from '../items'
import { classSpellList, classSpellsFrom, restSpecies, speciesSpells, speciesTraits, spendUse, usesLeft, usesMax, useSpeciesSpell, type SpeciesSpell } from '../species'
import { classesOf } from '../model/classes'
import { basicsOf, casterOf, spellSourceOf } from '../classRules'
import { gearTotals, sum } from '../effects'
import { restSlots, setSlotCount, slotFor, slotRows, useSlot, type SlotRow } from '../slots'
import type { Entry as PcEntry } from '../model/types'
import EntryLink from '../components/EntryLink.vue'
import { newEntry, printCards } from '../ui'
import { hrefEntry } from '../router'
import SpellModal from '../components/SpellModal.vue'
import SlotHelpers from '../components/SlotHelpers.vue'
import EntryPicker from '../components/edit/EntryPicker.vue'

/** On a character's page (their tab) it's theirs; on its own page, the current character's or the world's. */
const props = defineProps<{ pc?: PcEntry }>()
const owner = computed(() => props.pc ?? currentPc.value)

// The current character's spellbook, or the world's when no character is current.
const book = computed<Spellbook>(() => activeSpellbook(props.pc))
// The caster is the current character: their sheet gives attack and DC. Without one, the numbers are typed in.
const caster = owner
const fromSheet = computed(() => (caster.value ? spellStats(caster.value) : undefined))
const attack = computed(() => fromSheet.value?.attack ?? book.value.attackBonus)
const dc = computed(() => fromSheet.value?.dc ?? book.value.saveDC)
const editSlots = ref(false)
/** The slot rows: worked out from the character's classes (or typed), pact slots, Mystic Arcanum. */
const rows = computed(() => slotRows(book.value, owner.value))
/** A character with classes: the counts are the rules' unless typed in. */
const classesKnown = computed(() => !!owner.value && classesOf(owner.value).length > 0)
const shownSlots = computed(() => rows.value.filter(r => r.kind !== 'arcanum' && (editSlots.value || r.max > 0)))
const arcana = computed(() => rows.value.filter(r => r.kind === 'arcanum'))

// ---- changes ----
function setNum(key: 'attackBonus' | 'saveDC' | 'preparedMax', v: string) {
  const n = v.trim() === '' ? undefined : Number(v)
  if (n === undefined || Number.isFinite(n)) { book.value[key] = n; touch() }
}
/** A typed count. With classes it replaces the rules' count (↺ goes back); without, it is the count. */
function setMax(r: SlotRow, v: string) {
  const n = Math.max(0, Math.min(9, Math.floor(Number(v) || 0)))
  if (classesKnown.value && r.kind === 'slot' && r.rule == null && n === r.max) return
  setSlotCount(book.value, r, n)
  touch()
}
function resetMax(r: SlotRow) { setSlotCount(book.value, r, null); touch() }
/** Pip p of a row: filled pips are slots left. Clicking a filled one spends it, an empty one gives it back. */
function pip(r: SlotRow, p: number) {
  useSlot(book.value, r, p < r.max - r.used ? 1 : -1)
  touch()
}
/** A character's long rest is the whole one (HP and hit dice too); the world's book only gets its slots back. */
function rest() {
  const pc = owner.value
  if (pc) { const before = snapSheet(pc); longRest(pc); noteUndo(restSummary(pc, before, 'long'), restoreSheet(pc, before)); return }
  restSlots(book.value, 'long')
  touch()
}
/** Cast a levelled spell: spend a slot of its level (or the lowest higher one left), or the one picked to upcast. */
function cast(e: Entry, slot?: SlotRow) {
  const r = slot ?? slotFor(rows.value, Number(e.fields.level))
  if (!r) return
  useSlot(book.value, r, 1)
  touch()
  begin(e)
  upcastOf.value = null
}
/** A cast concentration spell starts concentrating (ending the one before); one with effects is switched on. */
function begin(e: Entry) {
  const pc = caster.value
  if (!pc || !e.fields.concentration && !switchable(e)) return
  if (switchable(e)) { if (!on(e)) toggleOn(e) }
  else if (!concentrating(e)) toggleConc(e)
}
// ---- upcasting: the ▾ beside Cast lists the higher slots that are free, with what the spell does at each ----
const upcastOf = ref<Id | null>(null)
const higher = (e: Entry) => rows.value.filter(r => r.kind !== 'arcanum' && r.used < r.max && r.level > Number(e.fields.level))
  .sort((a, b) => a.level - b.level).filter((r, i, l) => l.findIndex(x => x.level === r.level && x.kind === r.kind) === i)
function rollsAt(e: Entry, level: number) {
  const pc = caster.value, sh = pc ? sheetOf(pc) : undefined, ab = fromSheet.value?.ability
  return rollsLine(e, { level: pc ? charLevel(pc) : undefined, mod: sh && ab ? mod(score(sh, ab)) : undefined, add: spellDamageAdd(sh, e), slot: level })
}
// ---- free casts: a feature's use instead of a slot (Divine Smite once per long rest, Favored Enemy's Hunter's Mark) ----
/** The feature with a use left that casts this spell without a slot; the player picks Free or Cast (a slot, to upcast). */
function freeFor(e: Entry) {
  const pc = owner.value
  if (!pc) return undefined
  const s = sheetOf(pc)
  return speciesTraits(pc, s).find(a => a.active && a.trait.freeCast?.includes(e.id) && usesLeft(pc, s, a, score) > 0)
}
const freeTip = (e: Entry) => { const a = freeFor(e), pc = owner.value; return a && pc ? `Cast without a slot: ${a.trait.name}, ${usesLeft(pc, sheetOf(pc), a, score)} of ${usesMax(pc, a, sheetOf(pc), score)} left` : '' }
function castFree(e: Entry) {
  const pc = owner.value, a = freeFor(e)
  if (!pc || !a) return
  const before = snapSheet(pc)
  editSheet(pc, x => spendUse(x, pc, a, 1, score))
  begin(e)
  noteUndo(`${e.name} cast free with ${a.trait.name}: ${usesLeft(pc, sheetOf(pc), a, score)} of ${usesMax(pc, a, sheetOf(pc), score)} left`, restoreSheet(pc, before))
}
// ---- rituals: 10 minutes longer, no slot (a prepared ritual spell; a Wizard's from the book, prepared or not) ----
function castRitual(e: Entry) {
  const pc = owner.value, before = pc ? snapSheet(pc) : undefined
  begin(e)
  upcastOf.value = null
  noteUndo(`${e.name} cast as a ritual: it takes 10 minutes longer and uses no slot`, pc ? restoreSheet(pc, before) : undefined, 6000)
}
const canCast = (e: Entry) => {
  const lvl = Number(e.fields.level)
  return lvl > 0 && !!slotFor(rows.value, lvl)
}
// ---- spells from the items the character uses (items.ts): cast for charges, once per rest, at will, or prepared ----
const allGranted = computed(() => (owner.value ? grantedSpells(sheetOf(owner.value)) : []))
/** Ready without a limit: always prepared (cast with the character's own slots) or at will. */
const unlimited = (how: string) => how === 'prepared' || how === 'atWill'
/** The bottom list: what items give with a limit (charges, once per rest). */
const granted = computed(() => allGranted.value.filter(g => !unlimited(g.spell.how)))
/** Spells from the character's species (species.ts): at will, once per rest, or always prepared. */
// spells on the class list or in the book for free aren't cast from the feature: they're learned or prepared as usual
const allInnate = computed(() => (owner.value ? speciesSpells(owner.value, sheetOf(owner.value)).filter(x => x.spell.how !== 'list' && x.spell.how !== 'book') : []))
/** The bottom list: what species and features give with a limit (once per rest). */
const innate = computed(() => allInnate.value.filter(x => !unlimited(x.spell.how)))
/**
 * Spells a feature or an item keeps ready without a limit, by spell: they're in Prepared spells as always prepared
 * (not counted against the limit), with where they come from; at-will ones are cast without a slot.
 */
const given = computed(() => {
  const m = new Map<Id, { from: string; how: string; ability?: Ability }>()
  for (const x of allInnate.value) if (unlimited(x.spell.how) && !m.has(x.spell.spell)) m.set(x.spell.spell, { from: x.from, how: x.spell.how, ability: x.spell.ability })
  for (const g of allGranted.value) if (unlimited(g.spell.how) && !m.has(g.spell.spell)) m.set(g.spell.spell, { from: g.item.name, how: g.spell.how })
  return m
})
/** Given by a feature or item, and not also prepared by hand. */
const onlyGiven = (id: Id) => given.value.has(id) && !book.value.always.includes(id) && !book.value.prepared.includes(id)
/** Spells a feature puts in the spellbook for free (the Hemomancer's): known, with where they come from. */
const freeKnown = computed(() => new Map((owner.value ? classSpellsFrom(owner.value, 'book', '', sheetOf(owner.value)) : []).map(x => [x.spell, x.from])))
/**
 * The species' and features' spells as table rows: a feature's always-prepared spells, when it has more than three
 * (a subclass's list), fold into one row that opens on a click.
 */
const openGroups = ref(new Set<string>())
const toggleGroup = (k: string) => { const s = new Set(openGroups.value); if (s.has(k)) s.delete(k); else s.add(k); openGroups.value = s }
const innateRows = computed(() => {
  const big = new Map<string, SpeciesSpell[]>()
  for (const x of innate.value) if (x.spell.how === 'prepared') big.set(x.from, [...(big.get(x.from) ?? []), x])
  for (const [k, l] of big) if (l.length <= 3) big.delete(k)
  const rows: { key: string; group?: boolean; count?: number; names?: string; x?: SpeciesSpell }[] = []
  const seen = new Set<string>()
  for (const x of innate.value) {
    const g = x.spell.how === 'prepared' ? big.get(x.from) : undefined
    if (g && !seen.has(x.from)) { seen.add(x.from); rows.push({ key: x.from, group: true, count: g.length, names: g.map(y => get(y.spell.spell)?.name).join(', ') }) }
    if (!g || openGroups.value.has(x.from)) rows.push({ key: x.key, x })
  }
  return rows
})
const castInnate = (x: SpeciesSpell, back = false) => {
  if (!owner.value) return
  editSheet(owner.value, s => useSpeciesSpell(s, x.key, back))
  // cast, a concentration spell starts concentrating (Faerie Fire from a Drow's lineage)
  const e = get(x.spell.spell)
  if (!back && e) begin(e)
}
const castItem = (g: GrantedSpell) => { if (owner.value) editSheet(owner.value, s => castFromItem(s, g)) }
const giveBack = (g: GrantedSpell) => { if (owner.value) editSheet(owner.value, s => unuse(s, g)) }
const shortRest = () => {
  const pc = owner.value
  if (!pc) return
  const before = snapSheet(pc)
  editSheet(pc, s => { restItems(s, 'short'); restSlots(s.spellbook, 'short'); restSpecies(s, pc, 'short') })
  noteUndo(restSummary(pc, before, 'short'), restoreSheet(pc, before))
}
const hasShort = computed(() => granted.value.some(g => g.spell.how === 'short') || innate.value.some(x => x.spell.how === 'short') || rows.value.some(r => r.kind === 'pact'))

// ---- known / prepared ----
function learn(id: Id) { if (!book.value.known.includes(id)) { book.value.known.push(id); touch() } }
/** Take a spell out of the book (and out of the prepared ones), with an Undo. */
function forget(id: Id) {
  const b = book.value
  const was = { known: [...b.known], prepared: [...b.prepared], always: [...b.always] }
  b.known = b.known.filter(x => x !== id); b.prepared = b.prepared.filter(x => x !== id); b.always = b.always.filter(x => x !== id)
  touch()
  noteUndo(`${get(id)?.name ?? 'The spell'} taken out of the spellbook${was.prepared.includes(id) || was.always.includes(id) ? ' (it was prepared)' : ''}`, () => {
    Object.assign(book.value, was)
    touch()
  })
}
const isPrepared = (id: Id) => book.value.prepared.includes(id) || book.value.always.includes(id)
/** Prepare a spell, unless the prepared spells are at the limit (cantrips and always-prepared ones don't count). */
function prepare(id: Id) {
  if (isCantrip(id)) { learn(id); return }
  if (isPrepared(id)) return
  if (atLimit.value && !alwaysIds.value.has(id)) { noteUndo(`${preparedLimit.value} of ${preparedLimit.value} spells prepared: unprepare one first`, undefined, 5000); return }
  learn(id); book.value.prepared.push(id); touch()
}
/** Unprepare a spell (a cantrip stays: it's always ready). */
function unprepare(id: Id) {
  if (isCantrip(id)) return
  book.value.prepared = book.value.prepared.filter(x => x !== id); book.value.always = book.value.always.filter(x => x !== id); touch()
}
/** Always prepared <-> prepared (always-prepared spells don't count against the limit). */
function toggleAlways(id: Id) {
  const b = book.value
  if (b.always.includes(id)) {
    if (atLimit.value) { noteUndo(`${preparedLimit.value} of ${preparedLimit.value} spells prepared: it can't count as prepared now`, undefined, 5000); return }
    b.always = b.always.filter(x => x !== id); b.prepared.push(id)
  }
  else { b.prepared = b.prepared.filter(x => x !== id); b.always.push(id) }
  touch()
}

// ---- lists ----
const spells = (ids: Id[]) => ids.map(id => get(id)).filter((e): e is Entry => !!e)
  .sort((a, b) => spellLevel(a) - spellLevel(b) || a.name.localeCompare(b.name))
const knownList = computed(() => spells([...book.value.known, ...[...freeKnown.value.keys()].filter(id => !book.value.known.includes(id))]))
// known cantrips are always ready: in the list, locked (no drag, star or unprepare)
const preparedList = computed(() => spells([...new Set([...book.value.always, ...book.value.prepared, ...given.value.keys(), ...book.value.known.filter(id => isCantrip(id))])]))
/** Always prepared: by hand, or given by a feature or item. */
// cantrips never count as prepared spells, and a spell that's always prepared (a domain or oath spell, even one the
// player had prepared before) doesn't use up a preparation
const isCantrip = (id: Id) => get(id)?.fields.level === 'Cantrip'
const alwaysIds = computed(() => new Set([...book.value.always, ...given.value.keys()].filter(id => !isCantrip(id))))
const alwaysCount = computed(() => alwaysIds.value.size)
/** The prepared spells that count against the limit. */
const preparedCount = computed(() => book.value.prepared.filter(id => !isCantrip(id) && !alwaysIds.value.has(id)).length)
/** The limit: the one typed in, else the classes' (by level). */
const preparedLimit = computed(() => book.value.preparedMax ?? (lines.value.reduce((t, l) => t + (basicsOf(l.class).prepared?.[Math.min(20, l.level) - 1] ?? 0), 0) || undefined))
const atLimit = computed(() => preparedLimit.value != null && preparedCount.value >= preparedLimit.value)
/** What the spell rolls, at the caster's level and with their spellcasting modifier (a trait's spell: its own ability). */
function rolls(e: Entry | undefined, ability?: Ability) {
  if (!e) return ''
  const pc = caster.value, sh = pc ? sheetOf(pc) : undefined
  const ab = ability ?? fromSheet.value?.ability
  // a pact caster's spells are always cast with the pact slots: their numbers at that level
  const pact = !shownSlots.value.some(r => r.kind === 'slot' && r.max > 0) ? rows.value.find(r => r.kind === 'pact')?.level : undefined
  return rollsLine(e, { level: pc ? charLevel(pc) : undefined, mod: sh && ab ? mod(score(sh, ab)) : undefined, add: spellDamageAdd(sh, e), ...(pact && spellLevel(e) > 0 && pact > spellLevel(e) ? { slot: pact } : {}) })
}
/** Spells with effects while active can be switched on for the current character (their sheet counts them). */
const switchable = (e: Entry | undefined) => !!caster.value && activeEffectsOf(e).length > 0
const on = (e: Entry) => isActive(caster.value ? sheetOf(caster.value) : undefined, e.id)
/** Switching a concentration spell on starts concentrating on it (ending the one before); off ends it. */
const toggleOn = (e: Entry) => {
  const pc = caster.value
  if (!pc) return
  editSheet(pc, s => {
    toggleActive(s, e.id)
    if (!e.fields.concentration) return
    if (isActive(s, e.id)) startConcentration(pc, s, e.id)
    else if (s.concentrating === e.id) endConcentration(pc, s)
  })
}
/** Concentration spells without effects (Hold Person, Web): concentrate on them, or stop. */
const concentrating = (e: Entry) => !!caster.value && sheetOf(caster.value)?.concentrating === e.id
const toggleConc = (e: Entry) => {
  const pc = caster.value
  if (pc) editSheet(pc, s => (s.concentrating === e.id ? endConcentration(pc, s) : startConcentration(pc, s, e.id)))
}
/** What the spell asks for, with this caster's numbers filled in. */
function check(e: Entry, ability?: Ability) {
  const f = e.fields
  if (ability && caster.value) {
    // a trait's spell cast with its own ability (a High Elf's cantrip: Intelligence)
    const st = spellStats(caster.value, ability), short = ability.toUpperCase()
    if (st && f.spellType === 'Saving throw') return `${f.savingThrow ? optionLabel('ability', f.savingThrow).slice(0, 3).toUpperCase() + ' ' : ''}save DC ${st.dc} · cast with ${short}`
    if (st && f.spellType === 'Attack') return `Spell attack ${st.attack >= 0 ? '+' : ''}${st.attack} · cast with ${short}`
  }
  if (f.spellType === 'Saving throw') return `${f.savingThrow ? optionLabel('ability', f.savingThrow).slice(0, 3).toUpperCase() + ' ' : ''}save DC ${dc.value ?? '?'}`
  if (f.spellType === 'Attack') return `Spell attack ${attack.value != null ? (attack.value >= 0 ? '+' : '') + attack.value : '?'}`
  return optionLabel('spell.spellType', f.spellType)
}
const alwaysTitle = (id: Id) => (book.value.always.includes(id)
  ? "Always prepared (doesn't count). Click to make it a normal prepared spell"
  : 'Make it always prepared')

// ---- drag and drop between the columns ----
const dragging = ref<{ id: Id; from: 'known' | 'prepared' } | null>(null)
const over = ref<'known' | 'prepared' | null>(null)
function dragStart(ev: DragEvent, id: Id, from: 'known' | 'prepared') {
  dragging.value = { id, from }
  ev.dataTransfer?.setData('text/plain', id)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move'
}
function dragEnd() { dragging.value = null; over.value = null }
function dragOver(ev: DragEvent, to: 'known' | 'prepared') {
  if (!dragging.value || dragging.value.from === to) return
  ev.preventDefault()
  over.value = to
}
function drop(to: 'known' | 'prepared') {
  const d = dragging.value
  if (d && d.from !== to) { if (to === 'prepared') prepare(d.id); else unprepare(d.id) }
  dragEnd()
}

// ---- spell pop-up: a plain click opens it; middle-click, Ctrl/Cmd/Shift-click or "open in new tab" use the link ----
const shown = ref<Id | null>(null)
const shownEntry = computed(() => (shown.value ? get(shown.value) : undefined))
function openSpell(ev: MouseEvent, id: Id) {
  if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return
  ev.preventDefault()
  shown.value = id
}
const levelLabel = (e: Entry) => (spellLevel(e) ? ORD[spellLevel(e)] : 'Cantrip')
/** A casting time in a word or two ("reaction", "bonus action", "1 minute"); the trigger is on hover. */
const shortCast = (t: unknown) => String(t ?? '').split(',')[0].trim()
/** Whether the Attack / save column shows an attack or save (else the spell's type, dimmed). */
const isCheck = (e: Entry) => e.fields.spellType === 'Attack' || e.fields.spellType === 'Saving throw'

// ---- where the spells come from: each class's list (Cleric, Bard…) or a spellbook (Wizard), as the class says ----
const lines = computed(() => (owner.value ? classesOf(owner.value).filter(l => casterOf(l.class) !== 'none') : []))
const listClasses = computed(() => lines.value.filter(l => spellSourceOf(l.class) !== 'book'))
const bookClasses = computed(() => lines.value.filter(l => spellSourceOf(l.class) === 'book'))
/** The spellbook (Known spells) is shown for a Wizard, the world's book, and a character without classes. */
const showBook = computed(() => !owner.value || !classesKnown.value || bookClasses.value.length > 0)
/** The highest spell level the slots reach. */
const maxLevel = computed(() => Math.max(0, ...rows.value.filter(r => r.max > 0).map(r => r.level)))
const classList = computed(() => {
  const pc = owner.value
  if (!pc) return { cantrips: [] as Entry[], spells: [] as Entry[] }
  const all = listClasses.value.map(l => classSpellList(pc, l.class, maxLevel.value, sheetOf(pc)))
  const uniq = (l: Entry[]) => [...new Map(l.map(e => [e.id, e])).values()].sort((a, b) => spellLevel(a) - spellLevel(b) || a.name.localeCompare(b.name))
  return { cantrips: uniq(all.flatMap(x => x.cantrips)), spells: uniq(all.flatMap(x => x.spells)) }
})
const classQ = ref('')
const classShown = computed(() => {
  const q = classQ.value.trim().toLowerCase(), f = (l: Entry[]) => (q ? l.filter(e => e.name.toLowerCase().includes(q)) : l)
  return [...f(classList.value.cantrips), ...f(classList.value.spells)]
})
/** The spells a Wizard can add to the book: their class list up to the slots they have. */
const bookOffer = computed(() => {
  const pc = owner.value, b = bookClasses.value[0]
  if (!pc || !b) return undefined
  const l = classSpellList(pc, b.class, maxLevel.value, sheetOf(pc))
  return [...l.cantrips, ...l.spells].map(e => e.id)
})
/** Cantrips known now, and how many the classes (and features: Magician) give. */
const cantripsKnown = computed(() => book.value.known.filter(id => get(id)?.fields.level === 'Cantrip').length)
const cantripsMax = computed(() => {
  const pc = owner.value
  if (!pc) return undefined
  const n = lines.value.reduce((t, l) => t + (basicsOf(l.class).cantrips?.[Math.min(20, l.level) - 1] ?? 0), 0)
  const more = sum(gearTotals(sheetOf(pc)).cantrips)
  return n + more || undefined
})
const isKnownCantrip = (id: Id) => book.value.known.includes(id)
function learnCantrip(id: Id) {
  const b = book.value
  if (b.known.includes(id)) { b.known = b.known.filter(x => x !== id); b.always = b.always.filter(x => x !== id); b.prepared = b.prepared.filter(x => x !== id) }
  else { b.known.push(id); if (!b.always.includes(id)) b.always.push(id) }
  touch()
}
/** Prepare a class-list spell, or unprepare it (it leaves the list of known spells too: the class list is the source). */
function togglePrepared(id: Id) {
  if (isPrepared(id)) { unprepare(id); if (!bookClasses.value.length) { book.value.known = book.value.known.filter(x => x !== id); touch() } }
  else prepare(id)
}
/** No casting class and no slots (a Drow Rogue): the caster cards are left out; species and feature spells remain. */
const noCasting = computed(() => !!owner.value && classesKnown.value && !lines.value.length && !rows.value.some(r => r.max > 0))
const SOURCE_HINT: Record<string, string> = { list: 'changed after a long rest', swap: 'one swapped when it gains a level' }
/** The known spells matching the search box. */
const knownQ = ref('')
const knownShown = computed(() => { const q = knownQ.value.trim().toLowerCase(); return q ? knownList.value.filter(e => e.name.toLowerCase().includes(q)) : knownList.value })
const full = computed(() => preparedLimit.value != null && preparedCount.value > preparedLimit.value)
</script>

<template>
  <div class="spellbook">
    <header class="list-head">
      <h1 v-if="!pc"><span class="icon"><AppIcon ui="spellbook" /></span>Spellbook<span v-if="owner" class="head-of">of <EntryLink :id="owner.id" /></span></h1>
      <div class="row-btns">
        <button v-if="hasShort" title="Pact slots and once-per-short-rest item spells back" @click="shortRest"><AppIcon ui="shortRest" /> Short rest</button>
        <button :title="owner ? 'Full HP, every spell slot and half the hit dice back' : 'Every spell slot back'" @click="rest"><AppIcon ui="longRest" /> {{ owner ? 'Long rest' : 'Restore spell slots' }}</button>
        <button title="Print these spells as cards (PDF, poker size)" :disabled="!knownList.length" @click="printCards(`${owner?.name ?? 'Spellbook'} spells`, [{ label: 'Prepared', ids: preparedList.map(e => e.id) }, { label: 'Known', ids: knownList.map(e => e.id) }])"><AppIcon ui="cards" /> Cards</button>
        <button v-if="!playerMode" @click="newEntry('spell')">＋ New spell</button>
      </div>
    </header>

    <!-- a character with no casting class and no slots: only what species and features give (below) -->
    <div v-if="!noCasting" class="sbk-top">
      <section class="card sbk-stats">
        <h3>Spellcasting
          <span v-if="fromSheet" class="muted small" title="From the character sheet">{{ fromSheet.ability.toUpperCase() }}</span>
          <span v-else-if="caster" class="muted small" title="The character sheet has no casting ability yet: the numbers are typed here">no casting ability</span>
          <span v-else class="muted small" title="No current character: make one current on their sheet to use their spellbook and numbers">world's book</span>
        </h3>
        <template v-if="fromSheet">
          <label><span>Spell attack</span><b v-flash="fromSheet.attack">{{ fromSheet.attack >= 0 ? '+' : '' }}{{ fromSheet.attack }}</b></label>
          <label><span>Save DC</span><b v-flash="fromSheet.dc">{{ fromSheet.dc }}</b></label>
        </template>
        <template v-else>
          <label><span>Spell attack</span><input type="number" :value="book.attackBonus" @change="setNum('attackBonus', ($event.target as HTMLInputElement).value)" /></label>
          <label><span>Save DC</span><input type="number" :value="book.saveDC" @change="setNum('saveDC', ($event.target as HTMLInputElement).value)" /></label>
        </template>
        <label><span>Prepared</span><b v-flash.neutral="preparedCount" :class="{ over: full }">{{ preparedCount }}</b> / <input type="number" min="0" :value="book.preparedMax" :placeholder="preparedLimit != null ? String(preparedLimit) : ''" @change="setNum('preparedMax', ($event.target as HTMLInputElement).value)" /></label>
        <label v-if="cantripsMax"><span>Cantrips</span><b :class="{ over: cantripsKnown > cantripsMax }">{{ cantripsKnown }}</b> / {{ cantripsMax }}</label>
      </section>

      <section class="card sbk-slots">
        <h3>Spell slots <button class="link-btn" @click="editSlots = !editSlots">{{ editSlots ? 'Done' : 'Edit' }}</button></h3>
        <div class="slot-cols">
        <div v-for="s in shownSlots" :key="s.key" class="slot-row" :class="{ pact: s.kind === 'pact' }">
          <span class="slot-lvl" :title="s.kind === 'pact' ? 'Warlock pact slots: all of this level, back on a short rest' : undefined"><small v-if="s.kind === 'pact'" class="slot-kind">Pact</small>{{ ORD[s.level] }}</span>
          <span class="pips">
            <button v-for="p in s.max" :key="p" class="pip" :class="{ on: p - 1 < s.max - s.used }"
                    :title="p - 1 < s.max - s.used ? 'Spend this slot' : 'Get this slot back'" @click="pip(s, p - 1)" />
          </span>
          <span v-flash="s.max - s.used" class="slot-left">{{ s.max - s.used }} / {{ s.max }}</span>
          <template v-if="editSlots">
            <input class="slot-max" type="number" min="0" max="9" :value="s.max" :title="classesKnown ? 'Slots of this level: typing a number replaces the one from the class levels' : 'Slots of this level'" @change="setMax(s, ($event.target as HTMLInputElement).value)" />
            <button v-if="s.rule != null" class="link-btn small" :title="`Back to the class levels' ${s.rule}`" @click="resetMax(s)">↺ {{ s.rule }}</button>
          </template>
          <span v-else-if="s.rule != null" class="slot-own" :title="`Typed in; the class levels give ${s.rule}`">✎</span>
        </div>
        <div v-for="a in arcana" :key="a.key" class="slot-row arcanum">
          <span class="slot-lvl" title="Mystic Arcanum: one casting of a spell of this level per long rest"><small class="slot-kind">Arcanum</small>{{ ORD[a.level] }}</span>
          <span class="pips"><button class="pip" :class="{ on: !a.used }" :title="a.used ? 'Get it back' : 'Use it'" @click="pip(a, 0)" /></span>
          <span v-flash="1 - a.used" class="slot-left">{{ 1 - a.used }} / 1</span>
        </div>
        </div>
        <p v-if="!shownSlots.length && !arcana.length" class="muted small">{{ classesKnown ? 'Their classes give no spell slots.' : 'No slots yet: click Edit to set them.' }}</p>
        <p v-else-if="classesKnown && !editSlots" class="muted small slot-src">From the class levels{{ rows.some(r => r.rule != null) ? ', with typed changes (✎)' : '' }}.</p>
        <SlotHelpers v-if="owner && !editSlots" :pc="owner" />
      </section>
    </div>

    <p v-if="noCasting && !preparedList.length && !granted.length && !innate.length" class="muted">{{ owner?.name }} has no spells: none of their classes casts, and nothing they have gives a spell.</p>
    <div class="sbk-columns" :class="{ solo: noCasting }">
      <!-- a class that prepares from its list (Cleric, Bard, Warlock…): the list, with Learn and Prepare -->
      <section v-if="listClasses.length" class="card sbk-list sbk-classlist">
        <h3>Class spells <span class="muted small">{{ listClasses.map(l => `${l.class}: ${SOURCE_HINT[spellSourceOf(l.class)]}`).join(' · ') }}</span>
          <input v-model="classQ" class="sbk-search" type="search" placeholder="Find…" aria-label="Find a spell on the class list" />
        </h3>
        <div class="sbk-scroll">
        <table class="grid">
          <thead><tr><th>Spell</th><th>Level</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in classShown" :key="e.id" :class="{ on: e.fields.level === 'Cantrip' ? isKnownCantrip(e.id) : isPrepared(e.id) }">
              <td><a :href="hrefEntry(e.id)" class="spell-link" @click="openSpell($event, e.id)">{{ e.name }}</a> <span v-if="e.fields.ritual" class="tag-ritual" title="A ritual: it can be cast in 10 more minutes without a spell slot">ritual</span></td>
              <td>{{ levelLabel(e) }}</td>
              <td class="sbk-actions">
                <span v-if="given.has(e.id)" class="muted small" :title="`Always prepared: from ${given.get(e.id)!.from}`">always</span>
                <button v-else-if="e.fields.level === 'Cantrip'" class="chip-btn" :class="{ on: isKnownCantrip(e.id) }" :aria-pressed="isKnownCantrip(e.id)" @click="learnCantrip(e.id)">{{ isKnownCantrip(e.id) ? '✓ Known' : 'Learn' }}</button>
                <button v-else class="chip-btn" :class="{ on: isPrepared(e.id) }" :aria-pressed="isPrepared(e.id)" :disabled="!isPrepared(e.id) && atLimit" :title="!isPrepared(e.id) && atLimit ? `${preparedLimit} of ${preparedLimit} prepared: unprepare one first` : undefined" @click="togglePrepared(e.id)">{{ isPrepared(e.id) ? '✓ Prepared' : 'Prepare' }}</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!classShown.length" class="muted small">{{ classQ ? 'No spell by that name.' : 'The world has no spells for this class (a spell\'s Classes field lists who can cast it).' }}</p>
        </div>
      </section>

      <section v-if="showBook" class="card sbk-list drop-zone" :class="{ over: over === 'known' }"
               @dragover="dragOver($event, 'known')" @dragleave.self="over = null" @drop.prevent="drop('known')">
        <h3>Known spells <span class="muted small">{{ knownList.length }}</span>
          <input v-if="knownList.length > 1" v-model="knownQ" class="sbk-search" type="search" placeholder="Find…" aria-label="Find a known spell" />
        </h3>
        <div v-if="knownList.length" class="sbk-scroll">
        <table class="grid">
          <thead><tr><th>Spell</th><th>Level</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in knownShown" :key="e.id" :class="{ dim: isPrepared(e.id) || isCantrip(e.id), dragging: dragging?.id === e.id }"
                :draggable="!isPrepared(e.id) && !isCantrip(e.id)" :title="isPrepared(e.id) || isCantrip(e.id) ? '' : 'Drag to Prepared spells'"
                @dragstart="dragStart($event, e.id, 'known')" @dragend="dragEnd">
              <td><a :href="hrefEntry(e.id)" class="spell-link" @click="openSpell($event, e.id)">{{ e.name }}</a> <span v-if="e.fields.ritual" class="tag-ritual" title="A ritual: it can be cast in 10 more minutes without a spell slot">ritual</span></td>
              <td>{{ levelLabel(e) }}</td>
              <td class="sbk-actions">
                <span v-if="freeKnown.has(e.id)" class="muted small" :title="`In the spellbook for free, from ${freeKnown.get(e.id)}`">{{ freeKnown.get(e.id) }}</span>
                <span v-if="isCantrip(e.id)" class="muted small" title="Cantrips are always ready">cantrip</span>
                <span v-else-if="given.has(e.id)" class="muted small" :title="`Always prepared: from ${given.get(e.id)!.from}`">always</span>
                <button v-else-if="isPrepared(e.id)" class="chip-btn on" aria-pressed="true" title="Prepared. Click to unprepare it" @click="unprepare(e.id)">✓ Prepared</button>
                <button v-else class="chip-btn" :disabled="atLimit" :title="atLimit ? `${preparedLimit} of ${preparedLimit} prepared: unprepare one first` : 'Prepare it (or drag it to Prepared spells)'" @click="prepare(e.id)">Prepare</button>
                <!-- Ritual Adept: a Wizard casts a ritual from the book without preparing it -->
                <button v-if="e.fields.ritual && !isPrepared(e.id) && bookClasses.length && caster" class="chip-btn" title="Cast it as a ritual from the book: 10 minutes longer, no slot, no need to prepare it" @click="castRitual(e)">Ritual</button>
                <button v-if="!freeKnown.has(e.id)" class="link-btn x" title="Remove from the spellbook" @click="forget(e.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!knownShown.length" class="muted small">No known spell matches.</p>
        </div>
        <p v-else class="muted small">No spells in the book yet.</p>
        <EntryPicker add :types="['spell']" :exclude="book.known" :only="bookOffer" :no-create="playerMode" :placeholder="bookOffer ? `Add a ${bookClasses[0].class} spell to the book…` : 'Add a spell to the book…'" @pick="learn" />
      </section>

      <!-- the right-hand column: prepared spells, then the spells the character's items grant -->
      <div class="sbk-col">
      <section v-if="!noCasting || preparedList.length" class="card sbk-list drop-zone" :class="{ over: over === 'prepared' }"
               @dragover="dragOver($event, 'prepared')" @dragleave.self="over = null" @drop.prevent="drop('prepared')">
        <h3>Prepared spells <span class="muted small" :class="{ over: full }" title="Cantrips and always-prepared spells don't count">{{ preparedCount }}<template v-if="preparedLimit != null"> / {{ preparedLimit }}</template><template v-if="alwaysCount"> + {{ alwaysCount }} always</template></span></h3>
        <table v-if="preparedList.length" class="grid">
          <thead><tr><th>Spell</th><th>Level</th><th>Casting time</th><th>Duration</th><th>Attack / save</th><th title="Concentration · Ritual">C/R</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in preparedList" :key="e.id" :class="{ dragging: dragging?.id === e.id }" :draggable="!onlyGiven(e.id) && !isCantrip(e.id)"
                :title="isCantrip(e.id) ? 'A cantrip: always ready' : onlyGiven(e.id) ? `Always prepared: from ${given.get(e.id)!.from}` : 'Drag back to Known spells to unprepare'" @dragstart="dragStart($event, e.id, 'prepared')" @dragend="dragEnd">
              <td>
                <span v-if="isCantrip(e.id)" class="link-btn always" aria-hidden="true" />
                <button v-else-if="onlyGiven(e.id)" class="link-btn always on" disabled :title="`Always prepared: from ${given.get(e.id)!.from}`"><AppIcon ui="star" /></button>
                <button v-else class="link-btn always" :class="{ on: book.always.includes(e.id) }" :title="alwaysTitle(e.id)" @click="toggleAlways(e.id)"><AppIcon ui="star" /></button>
                <a :href="hrefEntry(e.id)" class="spell-link" @click="openSpell($event, e.id)">{{ e.name }}</a> <span v-if="e.fields.ritual" class="tag-ritual" title="A ritual: it can be cast in 10 more minutes without a spell slot">ritual</span>
                <span v-if="given.has(e.id)" class="muted small sbk-from" :title="given.get(e.id)!.how === 'atWill' ? 'At will: no slot needed' : 'Always prepared: cast with your own spell slots'"> · {{ given.get(e.id)!.from }}</span>
                <div class="sbk-sub muted small">{{ [optionLabel('spell.school', e.fields.school), e.fields.range].filter(Boolean).join(' · ') }}</div>
              </td>
              <td>{{ levelLabel(e) }}</td>
              <td :title="String(e.fields.castingTime ?? '')">{{ shortCast(e.fields.castingTime) }}</td>
              <td>{{ e.fields.duration ?? '' }}</td>
              <td class="sbk-check" :class="{ 'sbk-type': !isCheck(e) }">{{ check(e, given.get(e.id)?.ability) }}<div v-if="rolls(e, given.get(e.id)?.ability)" class="sbk-rolls">{{ rolls(e, given.get(e.id)?.ability) }}</div></td>
              <td>{{ [e.fields.concentration && 'C', e.fields.ritual && 'R'].filter(Boolean).join(' ') }}</td>
              <td class="sbk-actions">
                <span v-if="spellLevel(e) && given.get(e.id)?.how === 'atWill' && onlyGiven(e.id)" class="muted small" title="Cast without a spell slot">at will</span>
                <span v-else-if="spellLevel(e)" class="cast-wrap"><span class="cast-split">
                  <button class="chip-btn" :disabled="!canCast(e)" :title="canCast(e) ? 'Spend a slot of this level (or the next free higher one)' : 'No slot left for this level'" @click="cast(e)">Cast</button><button v-if="higher(e).length || e.fields.ritual" class="chip-btn cast-more" :aria-expanded="upcastOf === e.id" :title="e.fields.ritual ? 'Cast as a ritual, or with a higher slot' : 'Cast with a higher slot'" @click="upcastOf = upcastOf === e.id ? null : e.id">▾</button><button v-if="freeFor(e)" class="chip-btn" :title="freeTip(e)" @click="castFree(e)">Free</button></span>
                  <span v-if="upcastOf === e.id" class="cast-menu" role="menu">
                    <button v-if="e.fields.ritual" type="button" class="menu-row" role="menuitem" @click="castRitual(e)">
                      <b>As a ritual</b> <span class="muted small">10 minutes longer, no slot</span>
                    </button>
                    <button v-for="r in higher(e)" :key="r.key" type="button" class="menu-row" role="menuitem" @click="cast(e, r)">
                      <b>{{ r.kind === 'pact' ? 'Pact ' : '' }}{{ ORD[r.level] }}</b> <span class="muted small">({{ r.max - r.used }} left)</span> <span class="small">{{ rollsAt(e, r.level) }}</span>
                    </button>
                  </span>
                </span>
                <button v-if="caster && e.fields.concentration && !switchable(e)" class="chip-btn sbk-on" :class="{ on: concentrating(e) }" :aria-pressed="concentrating(e)" :title="concentrating(e) ? 'Concentrating on it. Click to end it' : 'Concentrate on it: any other concentration spell ends'" @click="toggleConc(e)">{{ concentrating(e) ? 'Concentrating' : 'Concentrate' }}</button>
                <button v-if="switchable(e)" class="chip-btn sbk-on" :class="{ on: on(e) }" :aria-pressed="on(e)" :title="on(e) ? 'Active: the sheet counts its effects. Click to end it' : 'Switch it on: the sheet counts its effects until you end it or take a long rest'" @click="toggleOn(e)">{{ on(e) ? 'Active' : 'On' }}</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted small drop-hint">Drag spells here from Known spells to prepare them.</p>
      </section>
      <section v-if="granted.length || innate.length" class="card sbk-list sbk-items">
        <h3>{{ !innate.length ? 'From items' : !granted.length ? 'From species and features' : 'From items, species and features' }} <span class="muted small">{{ granted.length + innate.length }}</span>

        </h3>
        <table class="grid">
          <thead><tr><th>Spell</th><th>Level</th><th>From</th><th>How</th><th>Casting time</th><th>Range</th><th>Attack / save</th><th></th></tr></thead>
          <tbody>
            <tr v-for="g in granted" :key="g.i + '-' + g.k" :class="{ dim: !g.ready }">
              <td><a :href="hrefEntry(g.spell.spell)" class="spell-link" @click="openSpell($event, g.spell.spell)">{{ get(g.spell.spell)!.name }}</a></td>
              <td>{{ levelLabel(get(g.spell.spell)!) }}</td>
              <td><EntryLink :id="g.item.id" /></td>
              <td><span v-flash="g.status.match(/(\d+) left/)?.[1] ?? g.status">{{ g.status }}</span></td>
              <td>{{ get(g.spell.spell)!.fields.castingTime ?? '' }}</td>
              <td>{{ get(g.spell.spell)!.fields.range ?? '' }}</td>
              <td class="sbk-check">{{ check(get(g.spell.spell)!) }}<div v-if="rolls(get(g.spell.spell))" class="sbk-rolls">{{ rolls(get(g.spell.spell)) }}</div></td>
              <td class="sbk-actions">
                <template v-if="g.spell.how === 'prepared'"><span class="muted small" title="Cast with your own spell slots, from Prepared spells' Cast or the slots above">own slots</span></template>
                <template v-else-if="g.spell.how === 'atWill'"><span class="muted small">at will</span></template>
                <button v-else-if="g.ready" class="chip-btn" :title="g.spell.how === 'charges' ? 'Spend the charges' : 'Mark it used until the rest'" @click="castItem(g)">Cast</button>
                <button v-else-if="g.spell.how !== 'charges'" class="link-btn small" title="Give this use back" @click="giveBack(g)">↺</button>
                <span v-else class="muted small">no charges</span>
              </td>
            </tr>
            <template v-for="row in innateRows" :key="row.key">
            <tr v-if="row.group" class="sbk-group">
              <td colspan="8"><button class="link-btn" :aria-expanded="openGroups.has(row.key)" @click="toggleGroup(row.key)">{{ openGroups.has(row.key) ? '▾' : '▸' }} {{ row.key }}</button>
                <span class="muted small"> {{ row.count }} spells, always prepared: {{ row.names }}</span></td>
            </tr>
            <tr v-else-if="row.x" :class="{ dim: !row.x.ready }">
              <td><a :href="hrefEntry(row.x!.spell.spell)" class="spell-link" @click="openSpell($event, row.x!.spell.spell)">{{ get(row.x!.spell.spell)!.name }}</a></td>
              <td>{{ levelLabel(get(row.x!.spell.spell)!) }}</td>
              <td>{{ row.x!.from }}</td>
              <td><span v-flash.neutral="row.x!.ready">{{ row.x!.status }}</span></td>
              <td>{{ get(row.x!.spell.spell)!.fields.castingTime ?? '' }}</td>
              <td>{{ get(row.x!.spell.spell)!.fields.range ?? '' }}</td>
              <td class="sbk-check">{{ check(get(row.x!.spell.spell)!, row.x!.spell.ability) }}<div v-if="rolls(get(row.x!.spell.spell), row.x!.spell.ability)" class="sbk-rolls">{{ rolls(get(row.x!.spell.spell), row.x!.spell.ability) }}</div></td>
              <td class="sbk-actions">
                <template v-if="row.x!.spell.how === 'prepared'"><span class="muted small" title="Always prepared; cast with your own spell slots">own slots</span></template>
                <template v-else-if="row.x!.spell.how === 'atWill'"><span class="muted small">at will</span></template>
                <button v-else-if="row.x!.ready" class="chip-btn" title="Mark it used until the rest" @click="castInnate(row.x!)">Cast</button>
                <button v-else class="link-btn small" title="Give this use back" @click="castInnate(row.x!, true)">↺</button>
              </td>
            </tr>
            </template>
          </tbody>
        </table>
      </section>
      </div>
    </div>

    <SpellModal v-if="shown" :id="shown" @close="shown = null">
      <template #actions>
        <button v-if="!isPrepared(shown)" class="chip-btn" @click="prepare(shown!)">Prepare</button>
        <template v-else>
          <span v-if="shownEntry && spellLevel(shownEntry)" class="cast-split"><button class="chip-btn" :disabled="!canCast(shownEntry)" @click="cast(shownEntry)">Cast</button><button v-if="freeFor(shownEntry)" class="chip-btn" :title="freeTip(shownEntry)" @click="castFree(shownEntry)">Free</button></span>
          <button class="chip-btn" @click="unprepare(shown!)">Unprepare</button>
        </template>
      </template>
    </SpellModal>
  </div>
</template>
