<script setup lang="ts">
// The character's six abilities as the sheet shows them (its .cs-ability cards): score and modifier, the saving
// throw, and the skills that use it, each with ○ not proficient, ● proficient or ◉ expertise and its number, and
// initiative and passive Perception at the foot. In the creator: the Proficiencies step (skills the class lets the
// player pick are clickable, with what proficiency would make them) and the Summary (read only).
import { computed } from 'vue'
import { ABILITY_NAME, ABILITY_SHORT, signed, type Ability } from '../../model/dnd'
import { useDraftSheet } from '../../composables/useDraftSheet'

const props = defineProps<{
  /** Whether a skill can be clicked (picked or taken back) now; none: read only. */
  can?: (name: string) => boolean
  /** Where a skill the character has already comes from (species, background), shown on hover. */
  from?: (name: string) => string | undefined
}>()
const emit = defineEmits<{ toggle: [name: string] }>()
const { abilities, skills, prof, init, passive } = useDraftSheet()
const of = (a: Ability) => skills.value.filter(x => x.ability === a)
const MARK = ['○', '●', '◉']
const LEVEL = ['not proficient', 'proficient', 'expertise']
const ro = computed(() => !props.can)
function title(s: { name: string; level: number; bonus: number }) {
  const f = props.from?.(s.name)
  return `${s.name}: ${LEVEL[s.level] ?? ''}${f ? ` (from ${f})` : ''}${props.can?.(s.name) ? (s.level ? '. Click to take it back' : `. Click to pick it: ${signed(s.bonus + prof.value)}`) : ''}`
}
</script>

<template>
  <section class="cs-abilities wz-cs-abilities">
    <div v-for="x in abilities" :key="x.a" class="cs-ability">
      <div class="cs-ab-head">
        <span class="cs-short" :title="ABILITY_NAME[x.a]">{{ ABILITY_SHORT[x.a].toUpperCase() }}</span>
        <b class="cs-mod">{{ signed(x.mod) }}</b>
        <span class="cs-score wz-cs-score">{{ x.score }}</span>
      </div>
      <div class="cs-skill cs-save" :class="{ on: x.saveProf }" :title="`${ABILITY_NAME[x.a]} saving throw${x.saveProf ? ' (proficient)' : ''}`">
        <span class="cs-dot">{{ x.saveProf ? '●' : '○' }}</span><b>{{ signed(x.save) }}</b><span>Saving throw</span>
      </div>
      <div class="cs-skills">
        <button v-for="s in of(x.a)" :key="s.name" type="button" class="cs-skill" :class="{ on: s.level > 0, given: !!from?.(s.name), can: can?.(s.name) && !s.level }"
                :disabled="ro || !can?.(s.name)" :aria-pressed="s.level > 0" :title="title(s)" @click="emit('toggle', s.name)">
          <span class="cs-dot">{{ MARK[s.level] ?? '○' }}</span><b>{{ signed(s.bonus) }}</b><span>{{ s.name }}</span>
          <small v-if="can?.(s.name) && !s.level" class="wz-skill-then">→ {{ signed(s.bonus + prof) }}</small>
        </button>
        <p v-if="!of(x.a).length" class="cs-noskill">no skills</p>
      </div>
      <div v-if="x.a === 'dex'" class="cs-foot"><span>Initiative</span><b>{{ signed(init) }}</b></div>
      <div v-else-if="x.a === 'wis'" class="cs-foot"><span>Passive perception</span><b>{{ passive }}</b></div>
    </div>
  </section>
</template>
