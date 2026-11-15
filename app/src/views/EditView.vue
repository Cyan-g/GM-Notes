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

    <div class="entry-grid">
      <div class="entry-main">
        <BodyEditor :model-value="e.body" :hint="e.name" @update:model-value="setBody" />
        <section v-if="e.type === 'place'">
          <h2>Map</h2>
          <ImageInput :model-value="e.fields.map as string | undefined" :hint="e.name + ' map'" @update:model-value="setMap" />
          <MapView v-if="e.fields.map" :place="e" editable class="inline-map" />
        </section>
        <section v-for="f in bigFields" :key="f.key">
          <h2>{{ f.label }}</h2>
          <FieldInput :def="f" :entry="e" />
        </section>
      </div>

      <aside class="entry-side">
        <div class="card">
          <h3>Picture</h3>
          <ImageInput :model-value="e.image" :hint="e.name" @update:model-value="setImage" />
        </div>
        <div v-for="[g, fs] in groups" :key="g" class="card">
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
