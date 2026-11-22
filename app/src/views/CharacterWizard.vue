<script setup lang="ts">
// The character creation wizard (wizard.ts): step by step from class and level to a finished character with sheet,
// spellbook and inventory. Steps can be visited in any order; each says what it still needs, and the summary makes the
// character. Uses what the world has: its classes, species, backgrounds, feats, spells and items. Each step is its
// own component (components/wizard); this is the frame around them. Back and Next sit at the top of the step and stay
// there while it scrolls; Next lights up once the step has nothing open.
import { computed, ref, watch } from 'vue'
import { resetWizard, steps, wizard } from '../wizard'
import { subclassLevelOf } from '../classRules'
import { newBlankEntry } from '../ui'
import AppIcon from '../components/AppIcon.vue'
import WzClassStep from '../components/wizard/WzClassStep.vue'
import WzSubclassStep from '../components/wizard/WzSubclassStep.vue'
import WzSpeciesStep from '../components/wizard/WzSpeciesStep.vue'
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

const d = computed(() => wizard.d)
const all = computed(() => steps(d.value))
const step = computed(() => all.value.find(s => s.id === wizard.step) ?? all.value[0])
const at = computed(() => all.value.findIndex(s => s.id === step.value.id))
const move = (by: number) => { const s = all.value[at.value + by]; if (s) { wizard.step = s.id; window.scrollTo(0, 0) } }
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
      <nav class="card wizard-steps">
        <button v-for="(s, i) in all" :key="s.id" type="button" class="wz-step" :class="{ on: s.id === step.id, done: !s.open.length && i < all.length - 1 }" @click="wizard.step = s.id">
          <span class="wz-dot">{{ s.open.length ? i + 1 : '✓' }}</span>{{ s.label }}
          <small v-if="s.open.length" class="muted">{{ s.open.length }} open</small>
        </button>
      </nav>

      <section class="card wizard-body">
        <div class="wizard-head">
          <h2>{{ step.label }}</h2>
          <span class="wz-nav">
            <button type="button" :disabled="!at" @click="move(-1)">← Back</button>
            <button v-if="at < all.length - 1" type="button" :class="{ primary: !step.open.length }"
                    :title="step.open.length ? `Still to choose here: ${step.open.join(', ')} (you can come back to it)` : undefined" @click="move(1)">Next: {{ all[at + 1].label }} →</button>
          </span>
        </div>
        <p v-if="step.open.length" class="wz-open small">Still to choose: {{ step.open.join(', ') }}</p>

        <WzClassStep v-if="step.id === 'class'" />
        <WzSubclassStep v-else-if="step.id === 'subclass'" />
        <WzSpeciesStep v-else-if="step.id === 'species'" />
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

      </section>
    </div>
  </div>
</template>
