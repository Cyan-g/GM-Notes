<script setup lang="ts">
// Edit mode for one entry. Every change saves itself a moment later.
import { computed } from 'vue'
import type { EntryType } from '../model/types'
import { SCHEMA, TYPES, type FieldDef } from '../model/schema'
import { backlinks, get, relationsOf } from '../store'
import { changed, deleteEntry } from '../edit'
import { go, hrefEntry, hrefList } from '../router'
import FieldInput from '../components/edit/FieldInput.vue'
import ListInput from '../components/edit/ListInput.vue'
import BodyEditor from '../components/edit/BodyEditor.vue'
import SpellForm from '../components/edit/SpellForm.vue'
import RelationsEditor from '../components/edit/RelationsEditor.vue'
import ImageInput from '../components/edit/ImageInput.vue'
import MapView from '../components/MapView.vue'

const props = defineProps<{ id: string }>()
const e = computed(() => get(props.id))
const def = computed(() => (e.value ? TYPES[e.value.type] : undefined))

const shown = (f: FieldDef) => !f.when || f.when.is.includes(String(e.value!.fields[f.when.field] ?? ''))
const BIG = ['recipe', 'stock', 'combatants']
const groups = computed(() => {
  const out = new Map<string, FieldDef[]>()
  for (const f of def.value?.fields ?? []) {
    if (BIG.includes(f.kind) || !shown(f) || f.key === 'pins' || f.key === 'map') continue
    const g = f.kind === 'statblock' ? 'Stats' : f.group ?? 'Details'
    if (!out.has(g)) out.set(g, [])
    out.get(g)!.push(f)
  }
  return [...out]
})
// Spells and items edit like a sheet: their stats in the main column, the description as the big text
// (it's what their card shows), and the general notes folded away underneath. Spells have no side cards.
const SHEET_TYPES: EntryType[] = ['spell', 'item']
const noSide = computed(() => e.value?.type === 'spell')
const sheet = computed(() => !!e.value && SHEET_TYPES.includes(e.value.type))
const sheetFields = computed(() => (def.value?.fields ?? []).filter(f => f.key !== 'summary' && !BIG.includes(f.kind) && shown(f)))
// Yes/no fields share one row of toggle buttons.
const sheetBools = computed(() => sheetFields.value.filter(f => f.kind === 'bool'))
function toggleBool(key: string) {
  const x = e.value!
  if (x.fields[key]) delete x.fields[key]
  else x.fields[key] = true
  changed(x)
}
function setSummary(v: string) { if (v.trim()) e.value!.fields.summary = v; else delete e.value!.fields.summary; changed(e.value!) }
const bigFields = computed(() => (def.value?.fields ?? []).filter(f => BIG.includes(f.kind) && shown(f)))

function setName(v: string) { if (v.trim()) { e.value!.name = v.trim(); changed(e.value!) } }
function setBody(v: string) { e.value!.body = v; changed(e.value!) }
function setList(key: 'aliases' | 'tags', v: string[]) { e.value![key] = v; changed(e.value!) }
function setType(t: EntryType) { e.value!.type = t; changed(e.value!) }
function setImage(p?: string) { if (p) e.value!.image = p; else delete e.value!.image; changed(e.value!) }
function setMap(p?: string) { if (p) e.value!.fields.map = p; else delete e.value!.fields.map; changed(e.value!) }
function toggleSecret() { e.value!.visibility = e.value!.visibility === 'secret' ? 'known' : 'secret'; changed(e.value!) }

function remove() {
  const x = e.value!
  const rels = relationsOf.value.get(x.id)?.length ?? 0
  const refs = backlinks.value.get(x.id)?.size ?? 0
  const msg = `Delete “${x.name}”?\n\n` +
    (rels ? `${rels} relation(s) will be removed.\n` : '') +
    (refs ? `${refs} other entr${refs === 1 ? 'y links' : 'ies link'} to it; those links will show as missing.\n` : '') +
    `\nThe backups in data/backups still have it if you change your mind.`
  if (!confirm(msg)) return
  const type = x.type
  deleteEntry(x.id)
  go(hrefList(type))
}
</script>

<template>
  <article v-if="e && def" class="entry editing">
    <div class="edit-bar">
      <span class="muted small">Editing · changes save automatically</span>
      <span class="spacer" />
      <button class="danger" @click="remove">Delete</button>
      <a class="button primary" :href="hrefEntry(e.id)">Done</a>
    </div>

    <header class="entry-head edit-head">
      <input class="name-input" :value="e.name" aria-label="Name" @change="setName(($event.target as HTMLInputElement).value)" />
      <div class="edit-meta">
        <label><span>Type</span>
          <select :value="e.type" @change="setType(($event.target as HTMLSelectElement).value as EntryType)">
            <option v-for="t in SCHEMA" :key="t.type" :value="t.type">{{ t.icon }} {{ t.label }}</option>
          </select>
        </label>
        <label class="toggle" :title="e.visibility === 'secret' ? 'Players don\'t know about this yet' : 'Players know this exists'">
          <input type="checkbox" :checked="e.visibility === 'known'" @change="toggleSecret" />
          <span>{{ e.visibility === 'known' ? 'Known to players' : 'DM only' }}</span>
        </label>
        <label class="grow"><span>Also known as</span><ListInput :model-value="e.aliases" placeholder="Add alias…" @update:model-value="v => setList('aliases', v)" /></label>
        <label class="grow"><span>Tags</span><ListInput :model-value="e.tags" placeholder="Add tag…" @update:model-value="v => setList('tags', v)" /></label>
      </div>
    </header>

    <div class="entry-grid" :class="{ 'no-side': noSide }">
      <div class="entry-main">
        <template v-if="sheet">
          <section class="card sheet-form">
            <SpellForm v-if="e.type === 'spell'" :entry="e" />
            <div v-else class="sheet-grid">
              <!-- Short fields in two columns, then the yes/no toggles, then the full-width ones. -->
              <label v-for="f in sheetFields.filter(x => !['bool', 'list', 'longtext'].includes(x.kind))" :key="f.key" class="sheet-field" :class="'k-' + f.kind">
                <span>{{ f.label }}</span>
                <FieldInput :id="`f-${f.key}`" :def="f" :entry="e" />
              </label>
              <div v-if="sheetBools.length" class="sheet-field">
                <span>{{ e.type === 'item' ? 'Magic' : 'Options' }}</span>
                <div class="seg wrap">
                  <button v-for="f in sheetBools" :key="f.key" type="button" :class="{ on: !!e.fields[f.key] }" @click="toggleBool(f.key)">{{ f.label }}</button>
                </div>
              </div>
              <label v-for="f in sheetFields.filter(x => ['list', 'longtext'].includes(x.kind))" :key="f.key" class="sheet-field" :class="'k-' + f.kind">
                <span>{{ f.label }}</span>
                <FieldInput :id="`f-${f.key}`" :def="f" :entry="e" />
              </label>
            </div>
          </section>
          <section class="sheet-desc">
            <h2>Description</h2>
            <BodyEditor :model-value="String(e.fields.summary ?? '')" :hint="e.name" @update:model-value="setSummary" />
          </section>
          <details class="sheet-notes" :open="!!e.body.trim()">
            <summary>Notes <span class="muted small">(extra text under the card)</span></summary>
            <BodyEditor :model-value="e.body" :hint="e.name" @update:model-value="setBody" />
          </details>
        </template>
        <BodyEditor v-else :model-value="e.body" :hint="e.name" @update:model-value="setBody" />
        <section v-if="e.type === 'place'">
          <h2>Map</h2>
          <ImageInput :model-value="e.fields.map as string | undefined" :hint="e.name + ' map'" @update:model-value="setMap" />
          <MapView v-if="e.fields.map" :place="e" editable class="inline-map" />
        </section>
        <section v-for="f in e.type === 'item' ? [] : bigFields" :key="f.key">
          <h2>{{ f.label }}</h2>
          <FieldInput :def="f" :entry="e" />
        </section>
      </div>

      <!-- Sheets (spells) have nothing for the side: no picture, no relations. -->
      <aside v-if="!noSide" class="entry-side">
        <!-- A craftable item's recipe sits first on the right, beside its stats. -->
        <div v-for="f in e.type === 'item' ? bigFields : []" :key="f.key" class="card side-big">
          <h3>{{ f.label }}</h3>
          <FieldInput :def="f" :entry="e" />
        </div>
        <div class="card">
          <h3>Picture</h3>
          <ImageInput :model-value="e.image" :hint="e.name" @update:model-value="setImage" />
        </div>
        <div v-for="[g, fs] in sheet ? [] : groups" :key="g" class="card">
          <h3>{{ g }}</h3>
          <div class="form-grid">
            <template v-for="f in fs" :key="f.key">
              <template v-if="f.kind === 'statblock'"><div class="full"><FieldInput :def="f" :entry="e" /></div></template>
              <template v-else>
                <label :for="`f-${f.key}`">{{ f.label }}</label>
                <div><FieldInput :id="`f-${f.key}`" :def="f" :entry="e" /></div>
              </template>
            </template>
          </div>
        </div>
        <div class="card">
          <h3>Relations</h3>
          <RelationsEditor :entry="e" />
        </div>
      </aside>
    </div>
  </article>
</template>
