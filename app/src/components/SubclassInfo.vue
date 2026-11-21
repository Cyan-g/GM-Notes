<script setup lang="ts">
// At the top of a subclass's page and its Edit page: which class it belongs to (a link; a picker when editing), the
// level the class chooses it at and the levels its features come at, its tagline, a warning with fixes when features
// come before the class can choose a subclass, and "Copy as new subclass" to start a homebrew one from it.
import { computed } from 'vue'
import type { Entry } from '../model/types'
import { traitsOf } from '../model/traits'
import { ownBasics, subclassLevelOf, classEntry, classLabel } from '../classRules'
import { listOptions, playerMode, state } from '../store'
import { changed, createEntry } from '../edit'
import { go, hrefEntry } from '../router'
import EntryLink from './EntryLink.vue'
import { patronsOf } from '../deity'

const props = defineProps<{ e: Entry; edit?: boolean }>()
/** The deities that are this subclass's patron (set on the deity). */
const patrons = computed(() => patronsOf(props.e.id))
const cls = computed(() => String(props.e.fields.class ?? ''))
const label = computed(() => classLabel(props.e))
const classPage = computed(() => classEntry(cls.value))
const at = computed(() => subclassLevelOf(cls.value))
const levels = computed(() => [...new Set(traitsOf(props.e).map(t => t.level ?? 1))].sort((a, b) => a - b))
/** Features that come before the class can choose a subclass: a character would only get them once they choose it. */
const early = computed(() => (cls.value ? traitsOf(props.e).filter(t => (t.level ?? 1) < at.value) : []))
const canEdit = computed(() => !state.readOnly && !playerMode.value)

function setClass(v: string) { props.e.fields.class = v || undefined; if (!v) delete props.e.fields.class; changed(props.e) }
function setTagline(v: string) { if (v.trim()) props.e.fields.tagline = v.trim(); else delete props.e.fields.tagline; changed(props.e) }
/** Fix: move the early features to the level the class chooses its subclass at. */
function moveEarly() {
  const l = (props.e.fields.speciesTraits ?? []).map(t => ((t.level ?? 1) < at.value ? { ...t, level: at.value } : t))
  props.e.fields.speciesTraits = l
  changed(props.e)
}
/** Fix: the class chooses its subclass earlier (its Class basics). */
function chooseEarlier() {
  const c = classPage.value
  if (!c) return
  const min = Math.min(...early.value.map(t => t.level ?? 1))
  c.fields.basics = { ...(ownBasics(cls.value) ?? {}), subclassLevel: min }
  changed(c)
}
/** A new subclass with the same class, features and text, to make a homebrew one from. */
function copy() {
  const n = createEntry('subclass', `${props.e.name} (copy)`, JSON.parse(JSON.stringify(props.e.fields)))
  n.body = String(props.e.body ?? '').replace(/\s*\*Source: System Reference Document[^*]*\*\s*$/i, '').trim()
  changed(n)
  go(hrefEntry(n.id) + '/edit')
}
</script>

<template>
  <section class="subclass-info">
    <div class="si-line">
      <template v-if="edit">
        <label class="si-class">Subclass of
          <select :value="cls" @change="setClass(($event.target as HTMLSelectElement).value)">
            <option value="">No class yet…</option>
            <option v-for="o in listOptions('class')" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select></label>
      </template>
      <template v-else-if="cls">Subclass of <EntryLink v-if="classPage" :id="classPage.id" /><b v-else>{{ label }}</b></template>
      <template v-if="cls"> · chosen at {{ label }} level {{ at }}</template>
      <template v-if="levels.length"> · features at {{ label }} level {{ levels.join(', ') }}</template>
      <span class="spacer" />
      <button v-if="canEdit && !edit" type="button" class="chip-btn" title="A new subclass with the same class, features and text, to make your own from" @click="copy">Copy as new subclass</button>
    </div>
    <label v-if="edit" class="si-tagline">Tagline <input :value="String(e.fields.tagline ?? '')" placeholder="e.g. Make a Deal with the Lower Planes" @change="setTagline(($event.target as HTMLInputElement).value)" /></label>
    <p v-else-if="e.fields.tagline" class="si-tag"><i>{{ e.fields.tagline }}</i></p>
    <p v-if="patrons.length" class="si-patron small"><span class="muted">Patron:</span> <template v-for="(d, i) in patrons" :key="d.id"><template v-if="i">, </template><EntryLink :id="d.id" icon /></template></p>
    <div v-if="early.length && canEdit" class="lu-warn small si-warn">
      <b>{{ early.map(t => t.name).join(', ') }}</b> {{ early.length > 1 ? 'come' : 'comes' }} at {{ label }} level {{ Math.min(...early.map(t => t.level ?? 1)) }}, but {{ label }}s choose a subclass at level {{ at }}: a character only gets {{ early.length > 1 ? 'them' : 'it' }} from level {{ at }}.
      <div class="si-fix">
        <button type="button" class="chip-btn" @click="moveEarly">Move {{ early.length > 1 ? 'them' : 'it' }} to level {{ at }}</button>
        <button v-if="classPage" type="button" class="chip-btn" :title="`Sets “Subclass at level” in the ${label} class's basics (the 2014 rule for some classes)`" @click="chooseEarlier">{{ label }}s choose their subclass at level {{ Math.min(...early.map(t => t.level ?? 1)) }}</button>
      </div>
    </div>
  </section>
</template>
