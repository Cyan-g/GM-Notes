<script setup lang="ts">
// The wizard's subclass step, once the level reaches the class's subclass level: the subclasses as a list on the
// left (name and tagline), and the chosen one's page beside it (its lore and every feature, the ones it has now and
// later), so its details show without scrolling. The first click picks one; clicking it again leaves it unpicked.
import { computed, ref, watch } from 'vue'
import type { Entry } from '../../model/types'
import { subclassesOf, wizard } from '../../wizard'
import { subclassLevelOf } from '../../classRules'
import { traitsOf } from '../../model/traits'
import { useDraft } from '../../composables/useDraft'
import WizardPage from '../WizardPage.vue'

const { d } = useDraft()
const subclasses = computed(() => (d.value.cls ? subclassesOf(d.value.cls) : []))
/** A subclass's tagline: its description's first paragraph when it's set in italics (the SRD's). */
const tagline = (s: Entry) => (s.fields.tagline as string | undefined) || String(s.body ?? '').split(/\n\s*\n/)[0].trim().match(/^\*([^*]+)\*$/)?.[1]
/** How many of its features the character has at the chosen level. */
const now = (s: Entry) => traitsOf(s).filter(t => (t.level ?? 1) <= d.value.level).length
/** The one shown beside the list: the picked one, else the one last looked at, else the first. */
const looked = ref<string | undefined>(d.value.subclass)
watch(() => d.value.subclass, v => { if (v) looked.value = v })
const shown = computed(() => subclasses.value.find(s => s.id === (d.value.subclass ?? looked.value)) ?? subclasses.value[0])
function pick(s: Entry) { looked.value = s.id; wizard.d.subclass = d.value.subclass === s.id ? undefined : s.id }
</script>

<template>
  <p v-if="!subclasses.length" class="muted small">The world has no subclasses of this class yet; add them on the class's page, or go on without one.</p>
  <div v-else class="wz-subclass-step">
    <div class="wz-sub-list" role="listbox" :aria-label="`Subclasses (from level ${d.cls ? subclassLevelOf(d.cls) : ''})`">
      <button v-for="s in subclasses" :key="s.id" type="button" class="wz-tile" role="option"
              :class="{ on: d.subclass === s.id, shown: shown?.id === s.id && d.subclass !== s.id }" :aria-selected="d.subclass === s.id" @click="pick(s)">
        <b>{{ s.name }}</b>
        <small v-if="tagline(s)" class="muted"><i>{{ tagline(s) }}</i></small>
        <small class="muted">{{ now(s) }} feature{{ now(s) === 1 ? '' : 's' }} at level {{ d.level }}</small>
      </button>
    </div>
    <div class="wz-sub-detail">
      <p v-if="shown && d.subclass !== shown.id" class="small muted">Click {{ shown.name }} on the left to take it.</p>
      <WizardPage v-if="shown" :e="shown" :title="shown.name" />
    </div>
  </div>
</template>
