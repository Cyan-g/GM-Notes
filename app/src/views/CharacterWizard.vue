<script setup lang="ts">
// The character creation wizard (wizard.ts): step by step from class and level to a finished character with sheet,
// spellbook and inventory. Steps can be visited in any order; each says what it still needs, and the summary makes the
// character. Uses what the world has: its classes, species, backgrounds, feats, spells and items. Each step is its
// own component (components/wizard); this is the frame around them. The card fits the window: the steps, the step's
// title with Back and Next stay at its top, the step scrolls below them (a list and its details each on their own),
// and the character so far is beside it (WzStats; a strip in a narrow window). What's still to pick is outlined in
// accent (.wz-todo), and "Next open pick" goes to the first one. Next lights up once the step has nothing open.
import { computed, ref, watch } from 'vue'
import { resetWizard, steps, wizard, type Step } from '../wizard'
import { subclassLevelOf } from '../classRules'
import { newBlankEntry } from '../ui'
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
// A level below the subclass's level has no subclass.
watch(() => d.value.level, () => { if (d.value.level < subclassLevelOf(d.value.cls)) wizard.d.subclass = undefined })
/** The Spells step's name filter. */
const spellFilter = ref('')
function startOver() { if (confirm('Clear everything chosen so far?')) resetWizard() }
</script>

<template>
  <div class="wizard-page">
    <header class="list-head">
      <h1><span class="icon"><AppIcon type="pc" /></span>New character</h1>
      <span class="muted small">Step by step; every step can be changed until the character is made.
        <button class="link-btn" @click="newBlankEntry('pc')">Make a blank one instead</button> · <button class="link-btn" @click="startOver">Start over</button></span>
    </header>

    <div class="wizard-grid">
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
        <div class="wizard-head">
          <h2>{{ step.label }}</h2>
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
        <p v-if="step.open.length" class="wz-open small">Still to choose: {{ step.open.join(', ') }}</p>

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
