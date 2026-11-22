<script setup lang="ts">
// Beside the creator's steps: the character so far, in short. Scores and modifiers, HP, AC, speed, initiative,
// proficiency bonus and passive Perception, the skills it's proficient in, and its spells. In a narrow window it's
// a one-line strip (`strip`) that opens to the full panel.
import { computed, ref } from 'vue'
import { ABILITY_SHORT, signed } from '../../model/dnd'
import { get } from '../../store'
import { useDraftSheet } from '../../composables/useDraftSheet'

defineProps<{ strip?: boolean }>()
const { d, prof, abilities, skills, hp, ac, init, speed, passive, spell, casting, spells } = useDraftSheet()
const proficient = computed(() => skills.value.filter(x => x.level > 0))
const open = ref(false)
const title = computed(() => [get(d.value.race)?.name, d.value.cls ? `${d.value.cls} ${d.value.level}` : '', get(d.value.background)?.name].filter(Boolean).join(' · '))
const anySpells = computed(() => spells.value.cantrips.length + spells.value.prepared.length + spells.value.book.length + spells.value.other.length > 0)
</script>

<template>
  <div class="wz-stats-wrap">
  <!-- a narrow window: one line, opening to the panel -->
  <div v-if="strip" class="wz-stats-strip">
    <span v-for="x in abilities" :key="x.a" class="wz-strip-ab"><small>{{ ABILITY_SHORT[x.a].toUpperCase() }}</small> <b>{{ x.score }}</b> <span class="muted">{{ signed(x.mod) }}</span></span>
    <span class="wz-strip-ab"><small>HP</small> <b>{{ hp ?? '—' }}</b></span>
    <span class="wz-strip-ab"><small>AC</small> <b>{{ ac }}</b></span>
    <button type="button" class="link-btn small" :aria-expanded="open" @click="open = !open">{{ open ? 'Less' : 'More' }}</button>
  </div>
  <div v-if="!strip || open" class="wz-stats" :class="{ under: strip }">
    <p class="wz-stats-who"><b>{{ d.name || 'New character' }}</b><br /><span class="muted small">{{ title || 'Nothing chosen yet' }}</span></p>
    <div class="wz-stats-abs">
      <div v-for="x in abilities" :key="x.a" class="wz-stats-ab" :title="`Saving throw ${signed(x.save)}${x.saveProf ? ' (proficient)' : ''}`">
        <small>{{ ABILITY_SHORT[x.a].toUpperCase() }}</small><b>{{ signed(x.mod) }}</b><span>{{ x.score }}</span>
        <i class="wz-stats-save" :class="{ on: x.saveProf }">save {{ signed(x.save) }}</i>
      </div>
    </div>
    <dl class="wz-stats-nums">
      <div><dt>HP</dt><dd>{{ hp ?? '—' }}</dd></div>
      <div><dt>AC</dt><dd>{{ ac }}</dd></div>
      <div><dt>Speed</dt><dd>{{ speed }}</dd></div>
      <div><dt>Initiative</dt><dd>{{ signed(init) }}</dd></div>
      <div><dt>Proficiency</dt><dd>{{ signed(prof) }}</dd></div>
      <div><dt>Passive Perc.</dt><dd>{{ passive }}</dd></div>
      <template v-if="spell"><div><dt>Spell DC</dt><dd>{{ spell.dc }}</dd></div><div><dt>Spell attack</dt><dd>{{ signed(spell.attack) }}</dd></div></template>
    </dl>
    <h4>Skills <span class="muted small">{{ proficient.length }}</span></h4>
    <ul v-if="proficient.length" class="wz-stats-skills">
      <li v-for="x in proficient" :key="x.name"><span>{{ x.name }}<small v-if="x.level === 2" class="muted"> expertise</small></span><b>{{ signed(x.bonus) }}</b></li>
    </ul>
    <p v-else class="muted small">None yet.</p>
    <template v-if="casting || anySpells">
      <h4>Spells</h4>
      <p v-if="!anySpells" class="muted small">None yet.</p>
      <p v-if="spells.cantrips.length" class="small"><span class="muted">Cantrips:</span> {{ spells.cantrips.join(', ') }}</p>
      <p v-if="spells.prepared.length" class="small"><span class="muted">Prepared:</span> {{ spells.prepared.join(', ') }}</p>
      <p v-if="spells.book.length" class="small"><span class="muted">In the book:</span> {{ spells.book.join(', ') }}</p>
      <p v-if="spells.other.length" class="small"><span class="muted">From elsewhere:</span> {{ spells.other.join(', ') }}</p>
    </template>
  </div>
  </div>
</template>
