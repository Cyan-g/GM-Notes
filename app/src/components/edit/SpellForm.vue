<script setup lang="ts">
// Editing a spell the way you'd fill in a spell card, in three parts: how it's cast (level, school, casting time,
// range and area, duration, components, concentration and ritual), what it does (attack or save, its rolls, the
// conditions it causes, its effects while active) and who learns it (classes). Casting time, range and duration take
// any text, with the usual wordings one click away.
import { computed, ref } from 'vue'
import { fieldOptions } from '../../store'
import type { Entry, SpellArea } from '../../model/types'
import { TYPES, type FieldKey } from '../../model/schema'
import { setField, toggleField } from '../../edit'
import { CONDITION_RULES } from '../../conditions'
import { areaText } from '../../spells'
import SpellRollsInput from './SpellRollsInput.vue'
import EffectsInput from './EffectsInput.vue'
import ConditionIcon from '../ConditionIcon.vue'

const props = defineProps<{ entry: Entry }>()
const f = computed(() => props.entry.fields)
/** A field's options from the world's lists (ids stored, labels shown). */
const opts = (key: string) => fieldOptions(TYPES.spell.fields.find(x => x.key === key))

const set = (key: FieldKey, value: unknown) => setField(props.entry, key, value)
const toggle = (key: FieldKey) => toggleField(props.entry, key)
function toggleIn(key: FieldKey, v: string) {
  const list = (f.value[key] ?? []) as string[]
  set(key, list.includes(v) ? list.filter(x => x !== v) : [...list, v])
}

const LEVELS = computed(() => opts('level'))
const SCHOOLS = computed(() => opts('school'))
const KINDS = computed(() => opts('spellType'))
const ABILITIES = computed(() => opts('savingThrow'))
const CLASSES = computed(() => opts('classes'))
const CONDITION_OPTS = TYPES.spell.fields.find(x => x.key === 'conditions')?.options ?? []
/** The usual wordings, one click away. */
const QUICK = {
  castingTime: ['Action', 'Bonus Action', 'Reaction', '1 minute', '10 minutes', '1 hour', '8 hours'],
  range: ['Self', 'Touch', 'Sight', 'Unlimited', '30 feet', '60 feet', '90 feet', '120 feet', '150 feet'],
  duration: ['Instantaneous', '1 round', '1 minute', '10 minutes', '1 hour', '8 hours', '24 hours', 'Until dispelled'],
}
type Quick = keyof typeof QUICK
const LABELS: Record<Quick, string> = { castingTime: 'Casting time', range: 'Range', duration: 'Duration' }
const PLACEHOLDER: Record<Quick, string> = { castingTime: 'Action', range: '60 feet', duration: 'Instantaneous' }
/** A reaction says when it's taken. */
const isReaction = computed(() => /^reaction/i.test(String(f.value.castingTime ?? '')))
const durationText = computed(() => [f.value.concentration && 'Concentration, up to', f.value.duration].filter(Boolean).join(' '))

// Material: 'yes' means "needs materials" without saying which.
const hasM = computed(() => !!f.value.material)
const materialText = computed(() => (f.value.material === 'yes' ? '' : f.value.material ?? ''))
const lastMaterial = ref('yes')
function toggleM() {
  if (hasM.value) { lastMaterial.value = f.value.material ?? 'yes'; set('material', undefined) }
  else set('material', lastMaterial.value)
}
const setMaterial = (v: string) => set('material', v.trim() || 'yes')

// ---- area of effect ----
const SHAPES: { id: SpellArea['shape']; label: string; size: string }[] = [
  { id: 'sphere', label: 'Sphere', size: 'radius' }, { id: 'cone', label: 'Cone', size: 'length' }, { id: 'cube', label: 'Cube', size: 'side' },
  { id: 'line', label: 'Line', size: 'length' }, { id: 'cylinder', label: 'Cylinder', size: 'radius' }, { id: 'emanation', label: 'Emanation', size: 'distance' },
]
const area = computed<SpellArea | undefined>(() => f.value.area)
function setArea(p: Partial<SpellArea> | null) {
  if (p === null) return set('area', undefined)
  const a = { shape: 'sphere', size: 20, ...(area.value ?? {}), ...p } as SpellArea
  if (a.shape !== 'line') delete a.width
  if (a.shape !== 'cylinder') delete a.height
  set('area', a)
}
const num = (ev: Event) => Number((ev.target as HTMLInputElement).value) || undefined

// ---- conditions: the ones it causes, more from the menu ----
const missing = computed(() => CONDITION_OPTS.filter(c => !(f.value.conditions ?? []).includes(c)))
function addCondition(ev: Event) { const s = ev.target as HTMLSelectElement; if (s.value) toggleIn('conditions', s.value); s.value = '' }
</script>

<template>
  <div class="spell-form-sections">
    <section class="sf-part">
      <h4>Casting</h4>
      <div class="spell-form">
        <div class="sf-cell full">
          <span class="sf-label">Level</span>
          <div class="seg">
            <button v-for="l in LEVELS" :key="l.id" type="button" :class="{ on: f.level === l.id }" @click="set('level', f.level === l.id ? undefined : l.id)">{{ l.label }}</button>
          </div>
        </div>
        <label class="sf-cell">
          <span class="sf-label">School</span>
          <select :value="f.school ?? ''" @change="set('school', ($event.target as HTMLSelectElement).value || undefined)">
            <option value="">—</option>
            <option v-for="o in SCHOOLS" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
        <div class="sf-cell">
          <span class="sf-label">Components</span>
          <div class="sf-inline">
            <div class="seg" role="group" aria-label="Components">
              <button type="button" :class="{ on: f.verbal }" title="Verbal" @click="toggle('verbal')">V</button>
              <button type="button" :class="{ on: f.somatic }" title="Somatic" @click="toggle('somatic')">S</button>
              <button type="button" :class="{ on: hasM }" title="Material" @click="toggleM">M</button>
            </div>
            <input v-if="hasM" class="sf-material" :value="materialText" placeholder="Which materials (optional)" @change="setMaterial(($event.target as HTMLInputElement).value)" />
          </div>
        </div>
        <!-- free text, with the usual wordings as one-click picks -->
        <div v-for="key in (Object.keys(QUICK) as Quick[])" :key="key" class="sf-cell">
          <span class="sf-label">{{ LABELS[key] }}</span>
          <input :value="f[key] ?? ''" :placeholder="PLACEHOLDER[key]" @change="set(key, ($event.target as HTMLInputElement).value.trim())" />
          <div class="sf-quick">
            <button v-for="q in QUICK[key]" :key="q" type="button" class="chip-btn" :class="{ on: String(f[key] ?? '').toLowerCase() === q.toLowerCase() }" @click="set(key, q === 'Reaction' ? 'Reaction, which you take when ' : q)">{{ q }}</button>
          </div>
          <small v-if="key === 'castingTime' && isReaction" class="muted">A reaction says when it's taken: "Reaction, which you take when …".</small>
          <small v-if="key === 'duration' && f.concentration && f.duration" class="muted">Reads: {{ durationText }}</small>
        </div>
        <div class="sf-cell">
          <span class="sf-label">Area</span>
          <div class="sf-inline">
            <select :value="area?.shape ?? ''" aria-label="Shape" @change="($event.target as HTMLSelectElement).value ? setArea({ shape: ($event.target as HTMLSelectElement).value as SpellArea['shape'] }) : setArea(null)">
              <option value="">none (one target)</option>
              <option v-for="s in SHAPES" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
            <template v-if="area">
              <label class="small">{{ SHAPES.find(s => s.id === area!.shape)?.size }} <input type="number" min="5" step="5" class="effect-value" :value="area.size" @change="setArea({ size: num($event) ?? 5 })" /> ft</label>
              <label v-if="area.shape === 'line'" class="small">wide <input type="number" min="5" step="5" class="effect-value" :value="area.width ?? 5" @change="setArea({ width: num($event) })" /> ft</label>
              <label v-if="area.shape === 'cylinder'" class="small">high <input type="number" min="5" step="5" class="effect-value" :value="area.height ?? area.size" @change="setArea({ height: num($event) })" /> ft</label>
            </template>
          </div>
          <small v-if="area" class="muted">{{ areaText(area) }}</small>
        </div>
        <div class="sf-cell">
          <span class="sf-label">Casting</span>
          <div class="seg">
            <button type="button" :class="{ on: f.concentration }" @click="toggle('concentration')">Concentration</button>
            <button type="button" :class="{ on: f.ritual }" @click="toggle('ritual')">Ritual</button>
          </div>
        </div>
      </div>
    </section>

    <section class="sf-part">
      <h4>What it does</h4>
      <div class="spell-form">
        <div class="sf-cell full">
          <span class="sf-label">Attack or save</span>
          <div class="sf-inline">
            <select :value="f.spellType ?? ''" @change="set('spellType', ($event.target as HTMLSelectElement).value || undefined)">
              <option value="">—</option>
              <option v-for="o in KINDS" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
            <select v-if="f.spellType === 'Saving throw' || f.savingThrow" :value="f.savingThrow ?? ''" aria-label="Saving throw" @change="set('savingThrow', ($event.target as HTMLSelectElement).value || undefined)">
              <option value="">which save?</option>
              <option v-for="o in ABILITIES" :key="o.id" :value="o.id">{{ o.label }} save</option>
            </select>
          </div>
        </div>
        <div class="sf-cell full">
          <span class="sf-label">Damage &amp; healing</span>
          <SpellRollsInput :model-value="f.rolls" :cantrip="f.level === 'Cantrip'" :spell="entry" @update:model-value="v => set('rolls', v)" />
        </div>
        <div class="sf-cell full">
          <span class="sf-label">Conditions it can cause</span>
          <div class="conds">
            <span v-for="c in f.conditions ?? []" :key="c" class="cond-chip" :title="CONDITION_RULES[c]?.text"><ConditionIcon :name="c" />{{ c }}<button type="button" class="cond-x" :title="`Remove ${c}`" @click="toggleIn('conditions', c)">×</button></span>
            <select class="cond-add" aria-label="Add a condition" @change="addCondition">
              <option value="">＋ Condition</option>
              <option v-for="c in missing" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <div class="sf-cell full">
          <span class="sf-label" title="What it does to a character while it lasts; switched on in their Spellbook, the sheet counts it until a long rest">While active <span class="muted small">(counted on a character's sheet while switched on)</span></span>
          <EffectsInput :model-value="f.active" @update:model-value="v => set('active', v)" />
        </div>
      </div>
    </section>

    <section class="sf-part">
      <h4>Who learns it</h4>
      <div class="seg wrap">
        <button v-for="c in CLASSES" :key="c.id" type="button" :class="{ on: (f.classes ?? []).includes(c.id) }" @click="toggleIn('classes', c.id)">{{ c.label }}</button>
      </div>
    </section>
  </div>
</template>
