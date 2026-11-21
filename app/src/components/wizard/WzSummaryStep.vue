<script setup lang="ts">
// The wizard's summary: the character as it will be made, what's still open in the other steps, and the button
// that makes it (asking first while something is open).
import { computed } from 'vue'
import { casts, dieOfDraft, featLevels, hpOf, makeCharacter, resetWizard, wizard } from '../../wizard'
import { ABILITY_KEYS, ABILITY_SHORT, mod, signed } from '../../model/dnd'
import { currentPc, setCurrent } from '../../sheet'
import { formatMoney, get } from '../../store'
import { go, hrefEntry } from '../../router'
import { useDraft } from '../../composables/useDraft'

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
  if (!currentPc.value) setCurrent(e.id)
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
  <p class="small"><b>Skills</b> {{ [...d.skills, ...grantedSkills.keys()].sort().join(', ') || '—' }}</p>
  <p class="small"><b>Feats</b> {{ [get(get(d.background)?.fields.originFeat)?.name, ...d.feats.filter(f => featLevels(d).some(x => x.level === f.level)).map(f => get(f.feat)?.name)].filter(Boolean).join(', ') || '—' }}</p>
  <p class="small"><b>Equipment</b> {{ taken.items.map(l => (l.amount ? l.amount + ' × ' : '') + l.name).join(', ') || '—' }}<template v-if="taken.money">; {{ formatMoney(taken.money) }}</template></p>
  <p v-if="casts(d)" class="small"><b>Spells</b> {{ [...d.cantrips, ...d.spells].map(id => get(id)?.name).join(', ') || '—' }}</p>
  <p v-if="open.length" class="wz-open small">Still open: {{ open.join(', ') }}</p>
  <button type="button" class="primary wz-make" @click="create">Make the character</button>
</template>
