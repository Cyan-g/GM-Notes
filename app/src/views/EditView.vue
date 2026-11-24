<script setup lang="ts">
import TypeIcon from '../components/TypeIcon.vue'
import { isShared, sharedBy } from '../sync'
// Edit mode for one entry. Every change saves itself a moment later.
import { computed } from 'vue'
import type { EntryType, Statblock } from '../model/types'
import { TYPES, byKey, type FieldDef } from '../model/schema'
import { backlinks, byType, fieldLabel, get, playerMode, relationsOf, state } from '../store'
import RaceBonusEdit from '../components/edit/RaceBonusEdit.vue'
import BackgroundEdit from '../components/edit/BackgroundEdit.vue'
import { changed, deleteEntry, setField } from '../edit'
import { hasSecrets } from '../model/text'
import { go, hrefEntry, hrefList } from '../router'
import FieldInput from '../components/edit/FieldInput.vue'
import { statsOf } from '../encounter'
import SubclassInfo from '../components/SubclassInfo.vue'
import ListInput from '../components/edit/ListInput.vue'
import BodyEditor from '../components/edit/BodyEditor.vue'
import CharacterSheet from '../components/CharacterSheet.vue'
import SpellForm from '../components/edit/SpellForm.vue'
import ItemForm from '../components/edit/ItemForm.vue'
import { recipeShown } from '../composables/recipeOpen'
import FeatForm from '../components/edit/FeatForm.vue'
import CreatureForm from '../components/edit/CreatureForm.vue'
import StatblockView from '../components/Statblock.vue'
import RelationsEditor from '../components/edit/RelationsEditor.vue'
import ImageInput from '../components/edit/ImageInput.vue'
import MapView from '../components/MapView.vue'
import NpcForm from '../components/edit/NpcForm.vue'
import NpcStats from '../components/edit/NpcStats.vue'
import NpcAppearance from '../components/edit/NpcAppearance.vue'
import DeityForm from '../components/edit/DeityForm.vue'
import OrgForm from '../components/edit/OrgForm.vue'
import SubPlaces from '../components/edit/SubPlaces.vue'
import DmOnlyBadge from '../components/DmOnlyBadge.vue'

const props = defineProps<{ id: string }>()
const e = computed(() => get(props.id))
const def = computed(() => (e.value ? TYPES[e.value.type] : undefined))
/** A subrace's empty list (languages, other sizes): what its main race has, which it keeps. */
function inheritedList(f: FieldDef): string {
  const x = e.value, p = x?.type === 'race' ? get(x.fields.parent) : undefined
  if (!p || f.kind !== 'list') return ''
  const mine = byKey(x!.fields)[f.key] as string[] | undefined, theirs = byKey(p.fields)[f.key] as string[] | undefined
  return !mine?.length && theirs?.length ? `From ${p.name}: ${theirs.map(v => fieldLabel(f, v)).join(', ')}` : ''
}
const abilityDef = computed(() => def.value?.fields.find(f => f.key === 'abilityIncrease'))
/** A background's fields edited in its main column (BackgroundEdit). */
const BG_MAIN = ['abilityIncrease', 'originFeat', 'originFeatNote', 'skillProfs', 'toolProfs', 'toolsAll', 'equipment']

const shown = (f: FieldDef) => !f.when || f.when.is.includes(String(byKey(e.value!.fields)[f.when.field] ?? ''))
// A character's sheet is the main column of its Edit page.
const BIG = ['recipe', 'stock', 'combatants', 'ranks', 'sheet', 'classes', 'classBasics', 'speciesTraits']
const npc = computed(() => e.value?.type === 'npc')
const deity = computed(() => e.value?.type === 'deity')
/** Types whose text gets the "Add a section" buttons (the headings the others of the type use) and grows with it. */
const org = computed(() => e.value?.type === 'organization')
const sectioned = computed(() => npc.value || deity.value || org.value || e.value?.type === 'place')
/** An organization's fields in its own form (OrgForm); type, parent and seat stay in Details. */
const ORG_FORM = ['presence', 'attitude', 'goals', 'secret', 'teaches']
const groups = computed(() => {
  const out = new Map<string, FieldDef[]>()
  // an NPC's fields are in its own form (NpcForm, NpcAppearance, NpcStats)
  if (npc.value || deity.value) return []
  // a character's appearance is its own card too (NpcAppearance)
  const pcLooks = e.value?.type === 'pc'
  for (const f of def.value?.fields ?? []) {
    // a subclass's class and tagline are at the top of its main column (SubclassInfo)
    // a race's ability score increase has its own section in the main column
    if (BIG.includes(f.kind) || (e.value?.type === 'race' && f.key === 'abilityIncrease') || (e.value?.type === 'background' && BG_MAIN.includes(f.key)) || (e.value?.type === 'pc' && f.key === 'level') || (e.value?.type === 'subclass' && ['class', 'tagline'].includes(f.key)) || !shown(f) || f.key === 'pins' || f.key === 'map' || f.kind === 'mapData') continue
    const g = f.kind === 'statblock' ? 'Stats' : f.group ?? 'Details'
    if (pcLooks && g === 'Appearance') continue
    if (e.value?.type === 'organization' && ORG_FORM.includes(f.key)) continue
    if (!out.has(g)) out.set(g, [])
    out.get(g)!.push(f)
  }
  return [...out]
})
// Spells and items edit like a sheet: their stats in the main column, the description as the big text
// (it's what their card shows), and the general notes folded away underneath. Spells have no side cards.
const SHEET_TYPES: EntryType[] = ['spell', 'item', 'creature', 'feat']
const noSide = computed(() => e.value?.type === 'spell' || e.value?.type === 'feat')
// A scroll is described by the spell it holds, so it has no description of its own.
const showDesc = computed(() => !(e.value?.type === 'item' && e.value.fields.kind === 'Scroll'))
// Creatures are their statblock: the form on the left, the finished block on the right, no text editor
// (notes written under the statblock stay reachable, folded, if there are any).
const creature = computed(() => e.value?.type === 'creature')
const sheet = computed(() => !!e.value && SHEET_TYPES.includes(e.value.type))
const setSummary = (v: string) => setField(e.value!, 'summary', v.trim() ? v : undefined)
const bigFields = computed(() => (def.value?.fields ?? []).filter(f => BIG.includes(f.kind) && shown(f)))

function setName(v: string) { if (v.trim()) { e.value!.name = v.trim(); changed(e.value!) } }
function setBody(v: string) { e.value!.body = v; changed(e.value!) }

// ---- an NPC's text: the headings other NPCs' texts use, one click to start a section ----
const headingsIn = (body: string) => [...body.matchAll(/^#{1,3}\s*(.+?)\s*$/gm)].map(m => m[1])
const SECTIONS: Record<string, string[]> = { npc: ['History', 'Description', 'Hooks'], deity: ['Dogma', 'Realm', 'Manifestations', 'Orders & Followers', 'Relations'], organization: ['Structure', 'Presence', 'Uniform', 'Feats'], place: ['Geography', 'History'] }
const sections = computed(() => {
  if (!sectioned.value) return []
  const t = e.value!.type
  const n = new Map<string, number>()
  for (const x of byType.value.get(t) ?? []) for (const h of new Set(headingsIn(x.body))) n.set(h, (n.get(h) ?? 0) + 1)
  const used = [...n].filter(([, c]) => c > 2).sort((a, b) => b[1] - a[1]).map(([h]) => h)
  const mine = new Set(headingsIn(e.value!.body).map(h => h.toLowerCase()))
  return [...new Set([...used.slice(0, 5), ...(SECTIONS[t] ?? [])])].filter(h => !mine.has(h.toLowerCase()))
})
function addSection(h: string) {
  const b = e.value!.body.replace(/\s+$/, '')
  setBody(`${b}${b ? '\n\n' : ''}## ${h}\n\n`)
}
function addSecretBlock() {
  const b = e.value!.body.replace(/\s+$/, '')
  setBody(`${b}${b ? '\n\n' : ''}:::secret\n\n:::\n`)
}
function setList(key: 'aliases' | 'tags', v: string[]) { e.value![key] = v; changed(e.value!) }
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
  <article v-if="e && def && isShared(e)" class="entry">
    <p class="muted">“{{ e.name }}” comes {{ sharedBy(e)?.label }}, so it's updated from there and can't be edited here. <a :href="hrefEntry(e.id)">Back to it</a></p>
  </article>
  <article v-else-if="e && def" class="entry editing">
    <div class="edit-bar">
      <span class="muted small">Editing · changes save automatically</span>
      <span class="spacer" />
      <button class="danger" @click="remove">Delete</button>
      <a class="button primary" :href="hrefEntry(e.id)">Done</a>
    </div>

    <header class="entry-head edit-head">
      <input class="name-input" :value="e.name" aria-label="Name" @change="setName(($event.target as HTMLInputElement).value)" />
      <div class="edit-meta">
        <!-- The type is chosen when the entry is made and can't change after (its fields and pages depend on it). -->
        <span class="edit-type"><TypeIcon :type="e.type" /> {{ TYPES[e.type].label }}</span>
        <!-- whether players know of it: the DM's choice, for what can be shared (not a player's own world or a character) -->
        <label v-if="!playerMode && e.type !== 'pc'" class="toggle" :title="e.visibility === 'secret' ? 'Players don\'t know about this yet' : 'Players know this exists'">
          <input type="checkbox" :checked="e.visibility === 'known'" @change="toggleSecret" />
          <span>Known to players</span><DmOnlyBadge v-if="e.visibility !== 'known'" />
        </label>
        <label class="grow"><span>Also known as</span><ListInput :model-value="e.aliases" placeholder="Add alias…" @update:model-value="v => setList('aliases', v)" /></label>
      </div>
    </header>

    <div class="entry-grid" :class="{ 'no-side': noSide }">
      <div class="entry-main">
        <template v-if="creature">
          <CreatureForm :entry="e" />
        </template>
        <template v-else-if="sheet">
          <section class="card sheet-form">
            <SpellForm v-if="e.type === 'spell'" :entry="e" />
            <ItemForm v-else-if="e.type === 'item'" :entry="e" />
            <FeatForm v-else-if="e.type === 'feat'" :entry="e" />
            <!-- The description closes the card, the way it ends a spell or item card. -->
            <div v-if="showDesc" class="sheet-desc">
              <span class="sf-label" title="What it says: shown on its card, in pop-ups and printed cards">Card text</span>
              <BodyEditor compact :model-value="String(e.fields.summary ?? '')" :hint="e.name" @update:model-value="setSummary" />
            </div>
          </section>
          <details class="sheet-notes" :class="{ empty: !e.body.trim() }" :open="!!e.body.trim()">
            <summary>Notes under the card <span class="muted small">(lore, DM notes; shown on its page below the card{{ e.body.trim() ? '' : ', none yet' }})</span></summary>
            <BodyEditor :model-value="e.body" :hint="e.name" @update:model-value="setBody" />
          </details>
        </template>
        <!-- A character is built on its sheet; the notes are written on the character's page. -->
        <CharacterSheet v-else-if="e.type === 'pc'" :pc="e" build />
        <!-- a class's text (mostly "Source: …") comes after its structured parts: below, not above, a long page -->
        <section v-else-if="e.type !== 'class'" class="edit-text">
          <SubclassInfo v-if="e.type === 'subclass'" :e="e" edit />
          <RaceBonusEdit v-if="e.type === 'race' && abilityDef" :e="e" :def="abilityDef" />
          <BackgroundEdit v-if="e.type === 'background'" :e="e" />
          <NpcForm v-if="npc" :entry="e" />
          <DeityForm v-if="deity" :entry="e" />
          <OrgForm v-if="org" :entry="e" />
          <h4 class="field-label">Text</h4>
          <BodyEditor :model-value="e.body" :hint="e.name" :compact="sectioned" @update:model-value="setBody" />
          <div v-if="sectioned" class="npc-add body-sections">
            <span class="muted small">Add a section:</span>
            <button v-for="h in sections" :key="h" type="button" class="chip-btn" @click="addSection(h)">＋ {{ h }}</button>
            <button v-if="!playerMode && !hasSecrets(e.body)" type="button" class="chip-btn" title="A part of the text players never see" @click="addSecretBlock">＋ DM-only part</button>
          </div>
        </section>
        <NpcStats v-if="npc" :entry="e" />
        <section v-if="e.type === 'place'">
          <h2>Map</h2>
          <ImageInput :model-value="e.fields.map" :hint="e.name + ' map'" :no-preview="!!e.fields.map" @update:model-value="setMap" />
          <MapView v-if="e.fields.map" :place="e" editable class="inline-map" />
        </section>
        <section v-for="f in e.type === 'item' ? [] : bigFields.filter(f => f.kind !== 'sheet' && f.kind !== 'classes')" :key="f.key">
          <h2>{{ f.label }}</h2>
          <FieldInput :def="f" :entry="e" />
        </section>
        <section v-if="e.type === 'class'" class="edit-text">
          <h2>Text</h2>
          <BodyEditor compact :model-value="e.body" :hint="e.name" @update:model-value="setBody" />
        </section>
      </div>

      <!-- Sheets (spells) have nothing for the side: no picture, no relations. -->
      <aside v-if="creature" class="entry-side cf-preview">
        <StatblockView v-if="statsOf(e)" :sb="statsOf(e)!" :name="e.name" />
        <p v-else class="muted small">The statblock shows up here as you fill it in.</p>
      </aside>
      <aside v-else-if="!noSide" class="entry-side">
        <!-- A craftable item's recipe sits first on the right, beside its stats. -->
        <div v-for="f in e.type === 'item' ? bigFields.filter(x => x.kind !== 'speciesTraits' && (x.kind !== 'recipe' || recipeShown(e!))) : []" :key="f.key" class="card side-big">
          <h3>{{ f.label }}</h3>
          <FieldInput :def="f" :entry="e" />
        </div>
        <div class="card">
          <h3>Picture</h3>
          <ImageInput :model-value="e.image" :hint="e.name" @update:model-value="setImage" />
        </div>
        <div v-if="npc || e.type === 'pc'" class="card">
          <h3>Appearance</h3>
          <NpcAppearance :entry="e" />
        </div>
        <div v-for="[g, fs] in sheet ? [] : groups" :key="g" class="card">
          <h3>{{ g }}</h3>
          <div class="form-grid">
            <template v-for="f in fs" :key="f.key">
              <template v-if="f.kind === 'statblock'"><div class="full"><FieldInput :def="f" :entry="e" /></div></template>
              <template v-else>
                <label :for="`f-${f.key}`">{{ f.label }}</label>
                <div><FieldInput :id="`f-${f.key}`" :def="f" :entry="e" />
                  <small v-if="inheritedList(f)" class="muted inherit-hint">{{ inheritedList(f) }}</small></div>
              </template>
            </template>
          </div>
        </div>
        <SubPlaces v-if="e.type === 'place'" :place="e" />
        <div class="card">
          <h3>Relations</h3>
          <RelationsEditor :entry="e" />
        </div>
      </aside>
    </div>
  </article>
</template>
