<script setup lang="ts">
// The character creation wizard (wizard.ts): step by step from class and level to a finished character with sheet,
// spellbook and inventory. Steps can be visited in any order; each says what it still needs, and the summary makes the
// character. Uses what the world has: its classes, species, backgrounds, feats, spells and items. Each step is its
// own component (components/wizard); this is the frame around them. The card fits the window: the steps, the step's
// title with Back and Next stay at its top, the step scrolls below them (a list and its details each on their own),
// and the character so far is beside it (WzStats; a strip in a narrow window). What's still to pick is outlined in
// accent (.wz-todo), and "Next open pick" goes to the first one. Next lights up once the step has nothing open.
// With nothing chosen yet it opens on a start page: the guide, or straight to a blank sheet with just a name.
import { computed, ref, watch } from 'vue'
import { draftEmpty, makeBlankCharacter, resetWizard, steps, wizard, type Step } from '../wizard'
import { subclassLevelOf } from '../classRules'
import { levelCap } from '../rules'
import { playerMode } from '../store'
import { setCurrent } from '../sheet'
import { go, hrefEntry } from '../router'
import AppIcon from '../components/AppIcon.vue'
import WzClassStep from '../components/wizard/WzClassStep.vue'
import WzSubclassStep from '../components/wizard/WzSubclassStep.vue'
import WzSpeciesStep from '../components/wizard/WzSpeciesStep.vue'
import WzSubraceStep from '../components/wizard/WzSubraceStep.vue'
import WzBackgroundStep from '../components/wizard/WzBackgroundStep.vue'
import WzScoresStep from '../components/wizard/WzScoresStep.vue'
import WzProfsStep from '../components/wizard/WzProfsStep.vue'
import WzFeaturesStep from '../components/wizard/WzFeaturesStep.vue'
import WzFeatsStep from '../components/wizard/WzFeatsStep.vue'
import WzHpStep from '../components/wizard/WzHpStep.vue'
import WzGearStep from '../components/wizard/WzGearStep.vue'
import WzSpellsStep from '../components/wizard/WzSpellsStep.vue'
import WzStoryStep from '../components/wizard/WzStoryStep.vue'
import WzSummaryStep from '../components/wizard/WzSummaryStep.vue'
import WzStats from '../components/wizard/WzStats.vue'
import EntryModal from '../components/EntryModal.vue'

const d = computed(() => wizard.d)
const all = computed(() => steps(d.value))
const step = computed(() => all.value.find(s => s.id === wizard.step) ?? all.value[0])
// a step is ticked when nothing's open there and it was looked at (or something was chosen there); the summary never
watch(() => step.value.id, id => { if (!(wizard.d.seen ?? []).includes(id)) wizard.d.seen = [...(wizard.d.seen ?? []), id] }, { immediate: true })
const isDone = (s: Step, i: number) => !s.open.length && i < all.value.length - 1 && ((wizard.d.seen ?? []).includes(s.id) || !!s.chosen && !['gear', 'hp'].includes(s.id))
const at = computed(() => all.value.findIndex(s => s.id === step.value.id))
const move = (by: number) => { const s = all.value[at.value + by]; if (s) { wizard.step = s.id; area.value?.scrollTo(0, 0) } }
/** The step's scrolling part, and the first thing in it still to pick. */
const area = ref<HTMLElement | null>(null)
function nextOpen() {
  const el = area.value?.querySelector<HTMLElement>('.wz-todo')
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const f = el.matches('input, select, button, textarea, [tabindex]') ? el : el.querySelector<HTMLElement>('input, select, button, textarea, [tabindex]')
  f?.focus({ preventScroll: true })
  el.classList.remove('wz-flash'); void el.offsetWidth; el.classList.add('wz-flash')
}
/** The steps that show the character's numbers themselves: no panel beside them. */
const stats = computed(() => !['scores', 'profs', 'summary'].includes(step.value.id))
/** A link to an entry clicked in the creator: shown in a pop-up, the creator stays (a new tab or window still opens the page). */
const popup = ref<string | null>(null)
function linkClick(ev: MouseEvent) {
  if (ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return
  const a = (ev.target as HTMLElement).closest?.('a[href^="#/e/"]') as HTMLAnchorElement | null
  if (!a) return
  const id = decodeURIComponent(a.getAttribute('href')!.split('/')[2] ?? '')
  if (!id) return
  ev.preventDefault()
  popup.value = id
}
// A draft above the Ruleset's highest level comes down to it.
watch(levelCap, c => { if (wizard.d.level > c) wizard.d.level = c }, { immediate: true })
// A level below the subclass's level has no subclass.
watch(() => d.value.level, () => { if (d.value.level < subclassLevelOf(d.value.cls)) wizard.d.subclass = undefined })
/** The Spells step's name filter. */
const spellFilter = ref('')
function startOver() { if (confirm('Clear everything chosen so far?')) resetWizard() }
// ---- the start page ----
const starting = computed(() => !wizard.started && draftEmpty(d.value))
const blankName = ref('')
function startGuide() { wizard.started = true; wizard.step = 'class' }
function makeBlank() {
  const e = makeBlankCharacter(blankName.value)
  if (playerMode.value) setCurrent(e.id)
  blankName.value = ''
  go(hrefEntry(e.id, true))
}
</script>

<template>
  <div class="wizard-page" @click="linkClick">
    <EntryModal v-if="popup" :id="popup" @close="popup = null" />
    <header class="list-head">
      <h1><span class="icon"><AppIcon type="pc" /></span>New character</h1>
      <span v-if="!starting" class="muted small">Step by step; every step can be changed until the character is made.
        <button class="link-btn" @click="startOver">Start over</button></span>
    </header>

    <!-- the start page: the guide, or a blank sheet with just a name -->
    <div v-if="starting" class="wz-start">
      <section class="card wz-start-card">
        <h2>Guided</h2>
        <p>Step by step through class, species, background, ability scores, proficiencies, features, feats, equipment and spells.
          The world's rules apply, every choice says what it does, and what's still open is marked.</p>
        <p class="muted small">Every step can be changed until the character is made.</p>
        <span class="spacer" />
        <button type="button" class="primary" @click="startGuide">Start the guide →</button>
      </section>
      <section class="card wz-start-card">
        <h2>Straight to the sheet</h2>
        <p>A blank character sheet with just a name. Fill in class, scores, skills and the rest yourself on its Edit page;
          no rules check what goes in.</p>
        <span class="spacer" />
        <form class="wz-start-blank" @submit.prevent="makeBlank">
          <input v-model="blankName" type="text" placeholder="Name" aria-label="The character's name" />
          <button type="submit">Make the sheet</button>
        </form>
      </section>
    </div>

    <div v-else class="wizard-grid">
      <section class="card wizard-body">
        <!-- the steps across the top, and the step's title with Back and Next: they stay in view together -->
        <div class="wizard-top">
        <nav class="wizard-steps" aria-label="Steps">
          <button v-for="(s, i) in all" :key="s.id" type="button" class="wz-step" :class="{ on: s.id === step.id, done: isDone(s, i), small: isDone(s, i) && s.id !== step.id }"
                  :aria-current="s.id === step.id ? 'step' : undefined" :title="s.open.length ? `Still to choose: ${s.open.join(', ')}` : s.chosen ? `${s.label}: ${s.chosen}` : undefined" @click="wizard.step = s.id">
            <span class="wz-dot">{{ isDone(s, i) ? '✓' : i + 1 }}</span>
            <span class="wz-step-text"><span>{{ s.label }}</span>
              <small v-if="s.open.length" class="wz-chosen wz-to-choose">{{ s.open.length }} to choose</small>
              <!-- a finished step shrinks to its tick and name (the choice on hover): all the steps fit in one row -->
              <small v-else-if="s.chosen && !(isDone(s, i) && s.id !== step.id)" class="wz-chosen">{{ s.chosen }}</small></span>
          </button>
        </nav>
        <!-- the step's title, the level (it changes what most steps offer) and what's still to choose here -->
        <div class="wizard-head">
          <h2>{{ step.label }}</h2>
          <label class="wz-head-level" title="The character's level: what the class gives, its spells, feats and hit points follow it">Level
            <input type="number" min="1" :max="levelCap()" :value="d.level" @change="wizard.d.level = Math.min(levelCap(), Math.max(1, Number(($event.target as HTMLInputElement).value) || 1))" /></label>
          <span v-if="step.open.length" class="wz-head-open small" :title="`Still to choose here: ${step.open.join(', ')}`">Still to choose: {{ step.open.join(', ') }}</span>
          <span class="wz-nav">
            <button v-if="step.open.length" type="button" class="link-btn wz-next-open" :title="`Still to choose here: ${step.open.join(', ')}`" @click="nextOpen">Next open pick ↓</button>
            <button type="button" :disabled="!at" @click="move(-1)">← Back</button>
            <button v-if="at < all.length - 1" type="button" :class="{ primary: !step.open.length }"
                    :title="step.open.length ? `Still to choose here: ${step.open.join(', ')} (you can come back to it)` : undefined" @click="move(1)">Next: {{ all[at + 1].label }} →</button>
          </span>
        </div>
        </div>
        <WzStats v-if="stats" strip class="wz-strip-only" />
        <div class="wz-main" :class="{ 'with-stats': stats }">
        <div ref="area" class="wz-area">

        <WzClassStep v-if="step.id === 'class'" />
        <WzSubclassStep v-else-if="step.id === 'subclass'" />
        <WzSpeciesStep v-else-if="step.id === 'species'" />
        <WzSubraceStep v-else-if="step.id === 'subrace'" />
        <WzBackgroundStep v-else-if="step.id === 'background'" />
        <WzScoresStep v-else-if="step.id === 'scores'" />
        <WzProfsStep v-else-if="step.id === 'profs'" />
        <WzFeaturesStep v-else-if="step.id === 'features'" />
        <WzFeatsStep v-else-if="step.id === 'feats'" />
        <WzHpStep v-else-if="step.id === 'hp'" />
        <WzGearStep v-else-if="step.id === 'gear'" />
        <WzSpellsStep v-else-if="step.id === 'spells'" v-model:filter="spellFilter" />
        <WzStoryStep v-else-if="step.id === 'details'" />
        <WzSummaryStep v-else-if="step.id === 'summary'" :open="all.flatMap(s => s.open)" />
        </div>
        <aside v-if="stats" class="wz-side" aria-label="The character so far"><WzStats /></aside>
        </div>

      </section>
    </div>
  </div>
</template>
