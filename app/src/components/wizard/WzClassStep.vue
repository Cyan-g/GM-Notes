<script setup lang="ts">
// The wizard's class step: the class and level (a class without rules: its hit die), the subclass once the level
// reaches it, and the class's page for its lore, table and features.
import { computed } from 'vue'
import type { Entry } from '../../model/types'
import { dieOfDraft, rules, subclassesOf, wizard } from '../../wizard'
import { subclassLevelOf } from '../../classRules'
import { DICE } from '../../model/classes'
import { ABILITY_SHORT } from '../../model/dnd'
import { traitsOf } from '../../model/traits'
import { useDraft } from '../../composables/useDraft'
import { inputNumber as num, inputValue as val } from '../../dom'
import WizardPage from '../WizardPage.vue'

const { d, r, classes, classPage } = useDraft()
const subclasses = computed(() => (d.value.cls ? subclassesOf(d.value.cls) : []))
/** A subclass's tagline: its description's first paragraph when it's set in italics (the SRD's). */
const tagline = (s: Entry) => (s.fields.tagline as string | undefined) || String(s.body ?? '').split(/\n\s*\n/)[0].trim().match(/^\*([^*]+)\*$/)?.[1]
/** A subclass's features: up to the chosen level, and later ones. */
const subFeatures = (s: Entry) => {
  const all = traitsOf(s)
  return { now: all.filter(t => (t.level ?? 1) <= d.value.level), later: all.filter(t => (t.level ?? 1) > d.value.level) }
}
function setClass(cls: string) {
  Object.assign(wizard.d, { cls, subclass: undefined, skills: [], tools: [], cantrips: [], spells: [], book: [], classKit: 0 })
}
</script>

<template>
  <div class="wz-tiles">
    <button v-for="c in classes" :key="c.id" type="button" class="wz-tile" :class="{ on: d.cls === c.id }" @click="setClass(c.id)">
      <b>{{ c.label }}</b><small class="muted">{{ rules({ ...d, cls: c.id }) ? `${dieOfDraft({ ...d, cls: c.id, die: undefined })} · ${rules({ ...d, cls: c.id })!.saves.map(a => ABILITY_SHORT[a]).join(' ')}` : 'filled in by hand' }}</small>
    </button>
  </div>
  <div class="wz-row">
    <label>Level <input type="number" min="1" max="20" :value="d.level" @change="wizard.d.level = Math.min(20, Math.max(1, num($event) || 1))" /></label>
    <label v-if="d.cls && !r">Hit die
      <select :value="dieOfDraft(d)" @change="wizard.d.die = val($event)"><option v-for="x in DICE" :key="x" :value="x">{{ x }}</option></select>
    </label>
  </div>
  <template v-if="d.cls && d.level >= subclassLevelOf(d.cls)">
    <h3 class="wz-sub">Subclass</h3>
    <p v-if="!subclasses.length" class="muted small">The world has no subclasses of this class yet.</p>
    <div class="wz-tiles wz-subclasses">
      <button v-for="s in subclasses" :key="s.id" type="button" class="wz-tile" :class="{ on: d.subclass === s.id }" :aria-pressed="d.subclass === s.id"
              @click="wizard.d.subclass = d.subclass === s.id ? undefined : s.id">
        <b>{{ s.name }}</b>
        <small v-if="tagline(s)" class="muted"><i>{{ tagline(s) }}</i></small>
        <span v-if="subFeatures(s).now.length" class="chips">
          <span v-for="t in subFeatures(s).now" :key="t.id" class="chip" :title="(t.text ?? '').slice(0, 300)">{{ t.name }} <small class="muted">{{ t.level ?? subclassLevelOf(d.cls) }}</small></span>
        </span>
        <small v-else class="muted">No features in this world yet.</small>
        <small v-if="subFeatures(s).later.length" class="muted">Later: {{ subFeatures(s).later.map(t => `${t.name} (${t.level})`).join(', ') }}</small>
      </button>
    </div>
  </template>
  <!-- the class's page, for its lore, table and features -->
  <WizardPage v-if="classPage" :e="classPage" :title="`About the ${classPage.name}`" />
</template>
