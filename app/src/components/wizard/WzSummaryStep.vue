<script setup lang="ts">
// The wizard's summary: the character as it will be made, what's still open in the other steps, and the button
// that makes it (asking first while something is open).
import { computed } from 'vue'
import { casts, defaultCampaigns, dieOfDraft, draftPc, draftSheet, featLevels, hpOf, makeCharacter, resetWizard, wizard } from '../../wizard'
import { speciesSpells, speciesTraits } from '../../species'
import { MASTERY_OF } from '../../model/schema'
import { SKILLS, profBonus } from '../../model/dnd'
import { ABILITY_KEYS, ABILITY_SHORT, mod, signed } from '../../model/dnd'
import { armorClass, initiative, passivePerception, setCurrent, skillLevel, speedOf } from '../../sheet'
import { formatMoney, get, listOptions, playerMode } from '../../store'
import { go, hrefEntry } from '../../router'
import { useDraft } from '../../composables/useDraft'

// ---- the character as it will be: its sheet, worked out ----
const preview = computed(() => { const sh = draftSheet(d.value); draftPc(d.value, sh); return sh })
const prof = computed(() => profBonus(d.value.level))
const worn = computed(() => preview.value.inventory.filter(l => l.equipped).map(l => get(l.item)?.name).filter(Boolean).join(', '))
const languages = computed(() => { const names = listOptions('language'); return [...new Set(preview.value.proficiencies?.languages ?? [])].map(id => names.find(o => o.id === id)?.label ?? id).join(', ') })
const tools = computed(() => [...(preview.value.proficiencies?.tools ?? []).map(id => get(id)?.name ?? id), ...(preview.value.proficiencies?.other ? [preview.value.proficiencies.other] : [])].join(', '))
const expertise = computed(() => SKILLS.filter(x => skillLevel(preview.value, x.name) === 2).map(x => x.name).join(', '))
const traits = computed(() => speciesTraits(draftPc(d.value, preview.value), preview.value).filter(a => a.active))
const masteries = computed(() => traits.value.filter(a => a.trait.choice?.kind === 'mastery').flatMap(a => a.picks).map(w => `${w}${MASTERY_OF[w] ? ` (${MASTERY_OF[w]})` : ''}`).join(', '))
/** Feats from feature choices (a Fighting Style feat, Versatile's Origin feat). */
const choiceFeats = computed(() => traits.value.filter(a => a.trait.choice?.kind === 'feat').flatMap(a => a.picks).map(id => get(id)?.name).filter(Boolean) as string[])
const featuresSpells = computed(() => [...new Set(speciesSpells(draftPc(d.value, preview.value), preview.value).map(x => get(x.spell.spell)?.name).filter(Boolean))].join(', '))
const campaignNames = computed(() => (d.value.campaigns ?? defaultCampaigns()).map(id => get(id)?.name ?? id).join(', '))

/** What the steps still need, all of them. */
const props = defineProps<{ open: string[] }>()
const { d, r, classes, scores, grantedSkills, taken } = useDraft()
/** How the hit points are worked out (there's no hit points step at level 1). */
const hpHow = computed(() => {
  const con = signed(mod(scores.value.con)), die = dieOfDraft(d.value)
  return d.value.level > 1 ? `the ${die}'s maximum at level 1, then a roll or the average each level, CON ${con} each level` : `the ${die}'s maximum, CON ${con}`
})

async function create() {
  const n = props.open.length
  if (n && !confirm(`${n} thing${n === 1 ? ' is' : 's are'} still open. Make the character anyway?`)) return
  const e = await makeCharacter(wizard.d)
  // a player's new character is theirs to play; a DM's (a pre-gen) leaves the current character as it is
  if (playerMode.value) setCurrent(e.id)
  resetWizard()
  go(hrefEntry(e.id))
}
</script>

<template>
  <p class="wz-sum-head"><b>{{ d.name || 'Unnamed' }}</b>, level {{ d.level }} {{ classes.find(c => c.id === d.cls)?.label ?? 'no class' }}<template v-if="d.subclass"> ({{ get(d.subclass)?.name }})</template>
    <template v-if="d.race"> · {{ get(d.race)?.name }}</template><template v-if="d.background"> · {{ get(d.background)?.name }}</template></p>
  <div class="wz-sum-scores">
    <span v-for="a in ABILITY_KEYS" :key="a" class="wz-score"><small>{{ ABILITY_SHORT[a].toUpperCase() }}</small><b>{{ scores[a] }}</b><small>{{ signed(mod(scores[a])) }}</small></span>
  </div>
  <p class="small"><b>HP</b> {{ hpOf(d) }} <span class="muted">({{ hpHow }})</span> · <b>Hit dice</b> {{ d.level }}{{ dieOfDraft(d) }} · <b>Saves</b> {{ (r ? r.saves : d.ownSaves).map(a => ABILITY_SHORT[a]).join(', ') || '—' }}</p>
  <p class="small"><b>AC</b> {{ armorClass(preview).ac }} · <b>Speed</b> {{ speedOf(preview) ?? '30 ft' }} · <b>Initiative</b> {{ signed(initiative(preview)) }} · <b>Passive Perception</b> {{ passivePerception(preview, prof) }}</p>
  <p class="small"><b>Skills</b> {{ [...d.skills, ...grantedSkills.keys()].sort().join(', ') || '—' }}<template v-if="expertise"> · <b>Expertise</b> {{ expertise }}</template></p>
  <p class="small"><b>Languages</b> {{ languages || '—' }}<template v-if="tools"> · <b>Tools</b> {{ tools }}</template></p>
  <p class="small"><b>Feats</b> {{ [get(get(d.background)?.fields.originFeat)?.name, ...choiceFeats, ...d.feats.filter(f => featLevels(d).some(x => x.level === f.level)).map(f => get(f.feat)?.name)].filter(Boolean).join(', ') || '—' }}<template v-if="masteries"> · <b>Weapon mastery</b> {{ masteries }}</template></p>
  <p class="small"><b>Equipment</b> {{ taken.items.map(l => (l.amount ? l.amount + ' × ' : '') + l.name).join(', ') || '—' }}<template v-if="taken.money">; {{ formatMoney(taken.money) }}</template></p>
  <p v-if="worn" class="small"><b>Worn and held</b> {{ worn }} <span class="muted">(the rest goes in the pack)</span></p>
  <p v-if="casts(d)" class="small"><b>Spells</b> {{ [...d.cantrips, ...d.spells].map(id => get(id)?.name).join(', ') || '—' }}<template v-if="d.book.length"> · <b>In the spellbook only</b> {{ d.book.map(id => get(id)?.name).join(', ') }}</template></p>
  <p v-if="featuresSpells" class="small"><b>From species and features</b> {{ featuresSpells }}</p>
  <p class="small"><b>Campaign</b> {{ campaignNames || 'none' }}</p>
  <p v-if="open.length" class="wz-open small">Still open: {{ open.join(', ') }}</p>
  <button type="button" class="primary wz-make" @click="create">Make the character</button>
</template>
