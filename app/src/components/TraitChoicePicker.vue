<script setup lang="ts">
// A trait's choice, as many picks as it takes at the trait's level (Expertise: 2, then 4). Options (invocations,
// Metamagic, a lineage) and feats (a Fighting Style) show as the picks made and a Choose button; the list to tick opens
// in a dialog, each option with its text, a prerequisite level it names and a filter. Skills, languages, tools, spells
// and weapons are dropdowns right here. A count says how many are picked. Used on the Edit page and in the wizard.
// Weapons to master show their mastery in the dropdown, and what it does (the Lists page's note) on hover: over an
// option in the open list, and over the dropdown for the weapon picked.
import Dropdown from './Dropdown.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { TraitOption } from '../model/types'
import { choiceCount, choiceOffer, choiceWords, type ActiveTrait, type HaveNow } from '../species'
import { categoryOf } from '../sheet'
import { get, listOptions } from '../store'
import { MASTERY_OF } from '../model/schema'
import MarkdownView from './MarkdownView.vue'
import { renderInline } from '../markdown'
import EntryLink from './EntryLink.vue'
import TraitChips from './TraitChips.vue'

/**
 * `owned`: the spells the character has already, with where from, marked in a spell pick's dropdown (the wizard).
 * `have`: what the character has (skills, weapon proficiencies, languages): Expertise, weapon mastery and languages
 * offer only what fits, and a skill they have already is marked.
 */
const props = defineProps<{ a: ActiveTrait; disabled?: boolean; owned?: Map<string, string[]>; have?: HaveNow }>()
const hasIt = (id: string) => (c.value.kind === 'spell' ? props.owned?.get(id)?.join(', ') : undefined)
const emit = defineEmits<{ pick: [picks: string[]] }>()
const c = computed(() => props.a.trait.choice!)
const n = computed(() => choiceCount(props.a))
const options = computed(() => choiceOffer(c.value, props.have, props.a.picks, w => categoryOf(w), w => MASTERY_OF[w]))
/** A skill (or skill or tool) pick the character has already: marked, picking it gives nothing new. */
const hadSkill = (id: string) => (['skill', 'skillTool'].includes(c.value.kind) && props.have?.skills.includes(id) && !props.a.picks.includes(id) ? ' ✓ has it' : '')
const words = computed(() => choiceWords(c.value, n.value))
const picked = computed(() => props.a.picks.filter(Boolean).length)
const full = computed(() => picked.value >= n.value)

// ---- dropdowns (skills, languages, tools, spells, weapons) ----
function set(slot: number, id: string) {
  const picks = [...props.a.picks]
  picks[slot] = id
  emit('pick', picks.filter(Boolean))
}

// ---- weapons to master: each with its mastery and what it does ----
const mastery = computed(() => c.value.kind === 'mastery')
const ruleOf = (m: string) => listOptions('weaponMastery').find(o => o.id === m)?.note
/** The weapon's name with its mastery: "Longsword (Sap)". */
const weaponLabel = (o: { id: string; label: string }) => (mastery.value && MASTERY_OF[o.id] ? `${o.label} (${MASTERY_OF[o.id]})` : o.label)
/** A weapon's mastery and what it does, for its hover tip: "Sap: If you hit a creature …". */
const masteryTip = (id: string | undefined) => {
  const m = mastery.value && id ? MASTERY_OF[id] : undefined
  return m ? `${m}: ${ruleOf(m) ?? ''}`.replace(/: $/, '') : undefined
}

// ---- a list to tick (options and feats) ----
const listed = computed(() => c.value.kind === 'option' || c.value.kind === 'feat')
const filter = ref('')
/** Its text without the SRD's source line, and the level its prerequisite names ("*Prerequisite: Level 5+ Warlock*"). */
interface Row { id: string; label: string; text: string; needs?: number; needOption?: string; prereq?: string; option?: TraitOption }
const rows = computed<Row[]>(() => options.value.map(o => {
  const option = c.value.kind === 'option' ? c.value.options?.find(x => x.id === o.id) : undefined
  let text = String(option ? option.text ?? '' : get(o.id)?.fields.summary ?? '').replace(/\s*\*?Source: System Reference Document[^*]*\*?\s*$/i, '').trim()
  const m = text.match(/^\*Prerequisite:\s*([^*]+)\*\s*/i)
  if (m) text = text.slice(m[0].length)
  // what it needs: its fields (Needs on the class's Edit page), else the level its prerequisite line names
  const lv = option?.needs?.level ?? (m?.[1].match(/Level (\d+)\+/i) ? Number(m![1].match(/Level (\d+)\+/i)![1]) : undefined)
  const needOption = option?.needs?.option
  return { id: o.id, label: o.label, text, ...(m ? { prereq: m[1].trim() } : {}), ...(lv ? { needs: lv } : {}), ...(needOption ? { needOption } : {}), ...(option ? { option } : {}) }
}))
const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return q ? rows.value.filter(r => r.label.toLowerCase().includes(q) || r.text.toLowerCase().includes(q)) : rows.value
})
/** What a row still lacks: the level, or the option it needs picked first. */
const lacking = (r: Row) => [r.needs && r.needs > props.a.level && `needs level ${r.needs} (now ${props.a.level})`, r.needOption && !props.a.picks.includes(r.needOption) && `needs ${rows.value.find(x => x.id === r.needOption)?.label ?? 'another option'} first`].filter(Boolean).join('; ')
/** The first sentence, shown on the row; the rest folds away. */
const lead = (t: string) => t.match(/^[^.!?]*[.!?]/)?.[0] ?? t
/** The picks made, by name, for the line under the trait. */
const pickedRows = computed(() => props.a.picks.filter(Boolean).map(id => rows.value.find(r => r.id === id) ?? { id, label: get(id)?.name ?? id, text: '' }))

// ---- the dialog with the list ----
const open = ref(false)
const close = () => { open.value = false; filter.value = '' }
const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); close() } }
watch(open, v => (v ? window.addEventListener('keydown', onKey, true) : window.removeEventListener('keydown', onKey, true)))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
function toggle(id: string) {
  if (props.disabled) return
  // an option whose level or other option isn't there yet can't be taken (one taken already can be given up)
  const r = rows.value.find(x => x.id === id)
  if (r && lacking(r) && !props.a.picks.includes(id)) return
  const now = props.a.picks.filter(Boolean)
  if (now.includes(id)) return emit('pick', now.filter(x => x !== id))
  if (n.value === 1) return emit('pick', [id])
  if (!full.value) emit('pick', [...now, id])
}
</script>

<template>
  <div class="sp-choice" :class="{ 'sp-choice-list': listed }">
    <div class="sp-pick-head small">
      <span class="muted">Choose {{ n }} {{ words }}</span>
      <b class="sp-count" :class="{ done: full }">{{ picked }} of {{ n }} picked</b>
      <button v-if="listed" type="button" class="chip-btn sp-choose" :class="{ primary: !full }" :disabled="disabled && !picked" @click="open = true">{{ disabled ? 'Show' : picked ? 'Change…' : 'Choose…' }}</button>
    </div>
    <!-- options and feats: the picks here, the list in a dialog -->
    <!-- all picked: their names on one line (Change… shows what each does); still picking: each with what it does -->
    <p v-if="listed && full && pickedRows.length" class="sp-picked-line small">{{ pickedRows.map(r => r.label).join(' · ') }}</p>
    <ul v-else-if="listed && pickedRows.length" class="sp-picked">
      <li v-for="r in pickedRows" :key="r.id"><b>{{ r.label }}</b> <span v-if="r.text" class="muted small" v-html="renderInline(lead(r.text))" /></li>
    </ul>

    <Teleport v-if="listed && open" to="body">
    <div class="modal-back" @mousedown.self="close">
    <div class="modal sp-choice-modal" role="dialog" :aria-label="`${a.trait.name}: choose ${n} ${words}`">
      <div class="sp-choice-top">
      <header class="modal-head">
        <h2>{{ a.trait.name }}</h2>
        <span class="spacer" />
        <button class="x" title="Close (Esc)" @click="close">×</button>
      </header>
      <div class="sp-pick-head small">
        <span class="muted">Choose {{ n }} {{ words }}</span>
        <b class="sp-count" :class="{ done: full }">{{ picked }} of {{ n }} picked</b>
        <input v-if="rows.length > 6" v-model="filter" class="sp-filter" type="search" placeholder="Filter…" :aria-label="`Filter the ${words}`" />
      </div>
      </div>
    <div class="sp-optlist" role="group" :aria-label="a.trait.name">
      <label v-for="r in shown" :key="r.id" class="sp-opt" :class="{ on: a.picks.includes(r.id), off: !a.picks.includes(r.id) && full && n > 1, early: !!lacking(r) }" :title="lacking(r) ? `Can't be taken yet: ${lacking(r)}` : undefined">
        <input :type="n === 1 ? 'radio' : 'checkbox'" :name="a.key" :checked="a.picks.includes(r.id)" :disabled="disabled || (!a.picks.includes(r.id) && ((full && n > 1) || !!lacking(r)))" @change="toggle(r.id)" />
        <span class="sp-opt-body">
          <span class="sp-opt-head"><b>{{ r.label }}</b>
            <span v-if="r.prereq || r.needs || r.needOption" class="sp-prereq" :class="{ lacking: !!lacking(r) }" :title="lacking(r) || 'Prerequisite'">{{ r.prereq ?? [r.needs && `Level ${r.needs}+`, r.needOption && rows.find(x => x.id === r.needOption)?.label].filter(Boolean).join(', ') }}</span>
            <TraitChips v-if="r.option" :t="r.option" no-grants /></span>
          <span v-if="lacking(r) && !a.picks.includes(r.id)" class="small sp-opt-lacks">Not yet: {{ lacking(r) }}</span>
          <span v-if="r.text" class="muted small sp-opt-lead" v-html="renderInline(lead(r.text))" />
          <details v-if="r.text.length > lead(r.text).length + 2" class="sp-opt-more" @click.stop><summary class="small">more</summary><MarkdownView class="small" :source="r.text" /></details>
        </span>
      </label>
      <p v-if="!shown.length" class="muted small">Nothing matches “{{ filter }}”.</p>
    </div>
      <footer class="sp-choice-foot"><span class="spacer" /><button class="primary" @click="close">Done</button></footer>
    </div>
    </div>
    </Teleport>

    <!-- everything else: one dropdown per pick -->
    <div v-if="!listed" class="sp-pick-selects">
      <Dropdown v-for="k in n" :key="k" :value="a.picks[k - 1] ?? ''" :disabled="disabled" :aria-label="`${a.trait.name}: pick ${k}`" :data-tip="masteryTip(a.picks[k - 1])" @change="set(k - 1, ($event.target as HTMLSelectElement).value)">
        <option value="">—</option>
        <option v-for="o in options" :key="o.id" :value="o.id" :disabled="a.picks.includes(o.id) && a.picks[k - 1] !== o.id" :data-tip="masteryTip(o.id)">{{ weaponLabel(o) }}{{ hasIt(o.id) ? ` ✓ has it: ${hasIt(o.id)}` : '' }}{{ hadSkill(o.id) }}</option>
      </Dropdown>
      <template v-if="c.kind === 'spell'"><span v-for="id in a.picks" :key="id"><EntryLink :id="id" /><span v-if="hasIt(id)" class="wz-had small" :title="`Already has it: ${hasIt(id)}`">✓ also from {{ hasIt(id) }}</span></span></template>
    </div>
  </div>
</template>
