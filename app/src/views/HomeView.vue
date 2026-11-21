<script setup lang="ts">
// The DM desk: the campaign at hand, the tools, favourites, the regions of the world
// with their factions, the gods, peoples and subclasses, and a few links. Everything comes from the entries.
import TypeIcon from '../components/TypeIcon.vue'
import AppIcon from '../components/AppIcon.vue'
import { classText, classesOf, totalLevel } from '../model/classes'
import { computed, ref } from 'vue'
import { optionLabel } from '../store'
import type { Entry, Id, WorldDate } from '../model/types'
import { byType, childrenOf, db, entries, formatDate, get, placePath, playerMode, touch } from '../store'
import { hrefDashboard, hrefList } from '../router'
import { DASHBOARDS } from '../dashboards'
import { newEntry } from '../ui'
import { toggleFavourite } from '../edit'
import { describe } from '../describe'
import { armorClass, sheetOf, maxHpOf } from '../sheet'
import EntryLink from '../components/EntryLink.vue'
import { nextSessionNo, sessionsOf } from '../sessions'
import PartyAt from '../components/PartyAt.vue'

const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name)
const list = (t: Entry['type']) => byType.value.get(t) ?? []

// ---- campaigns: the one with the latest session first ----
const campaigns = computed(() => list('campaign').map(c => {
  const s = sessionsOf(c.id).reverse()
  return { c, sessions: s }
}).sort((a, b) => b.sessions.length - a.sessions.length || byName(a.c, b.c)))
const current = computed(() => campaigns.value[0]?.sessions.length ? campaigns.value[0] : undefined)
const others = computed(() => campaigns.value.filter(x => x !== current.value))
const nextNumber = computed(() => (current.value ? nextSessionNo(current.value.c.id) : 1))
const newSession = () => current.value && newEntry('session', { campaign: current.value.c.id, number: nextNumber.value, date: { ...db().meta.today } })
const notes = computed(() => list('note').sort(byName))

// ---- the desk: dashboards and tools ----
/** What the dashboard tiles hold (the Crafting tables aren't the Workbench). */
const DESK_HINT: Record<string, string> = { spells: 'Tables of every spell', crafting: 'Tables of recipes, ingredients and crafting kits', armory: 'Tables of weapons, armor and other items' }
const TOOLS = [
  { ui: 'spellbook' as const, label: 'Spellbook', href: '#/spellbook', hint: "The current character's spells and slots" },
  { ui: 'workbench' as const, label: 'Workbench', href: '#/crafting', hint: "Craft from the current character's recipes and ingredients" },
  { ui: 'combat' as const, label: 'Combat', href: '#/tracker', hint: 'Initiative, HP and conditions in a fight' },
  { ui: 'atlas' as const, label: 'Atlas', href: '#/atlas' },
  { ui: 'timeline' as const, label: 'Timeline', href: '#/atlas/timeline' },
  { ui: 'calendar' as const, label: 'Calendar', href: '#/calendar' },
]

// Player mode: the player's tools and the world, without the DM's (the fight, the armory, the lore cards).
const PLAYER_TOOLS = ['#/spellbook', '#/crafting', '#/atlas', '#/atlas/timeline', '#/calendar']
const tools = computed(() => (playerMode.value ? TOOLS.filter(t => PLAYER_TOOLS.includes(t.href)) : TOOLS))
const desks = computed(() => DASHBOARDS.filter(x => x.id !== 'recent' && (!playerMode.value || ['spells', 'crafting', 'people'].includes(x.id))))
const characters = computed(() => list('pc').sort(byName).map(p => {
  const s = sheetOf(p)
  // AC and HP once the sheet is filled in (a max HP, something worn or a typed AC); the level only when it adds something.
  const filled = !!s && (s.maxHp != null || s.acOverride != null || s.inventory.some(l => l.equipped))
  const cls = classText(p, db().meta)
  return {
    p, cls: cls && classesOf(p).length > 1 ? `${cls} · Lv ${totalLevel(p)}` : cls || `Lv ${totalLevel(p)}`,
    hp: s?.maxHp != null ? `${s.hp ?? maxHpOf(s)} / ${maxHpOf(s)} HP` : '', ac: filled ? `AC ${armorClass(s!).ac}` : '',
  }
}))

// ---- favourites ----
const favourites = computed(() => (db().meta.favourites ?? []).map(id => get(id)).filter((e): e is Entry => !!e))
// ---- recently edited (sessions and notes included, so the last thing worked on is one click away) ----
const recent = computed(() => [...entries.value].sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '')).slice(0, 8))
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return !iso || isNaN(m) ? '' : m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

// ---- regions: the parts of the world, with their subregions, the factions seated there and the mapped places ----
const world = computed(() => list('place').filter(p => !p.fields.parent).sort((a, b) => (childrenOf.value.get(b.id)?.length ?? 0) - (childrenOf.value.get(a.id)?.length ?? 0))[0])
const within = (id: Id | undefined, region: Id) => !!id && placePath(id).some(p => p.id === region)
const regions = computed(() => (world.value ? (childrenOf.value.get(world.value.id) ?? []).filter(c => c.type === 'place') : []).map(r => ({
  r,
  subs: (childrenOf.value.get(r.id) ?? []).filter(c => c.type === 'place').sort(byName),
  orgs: list('organization').filter(o => !o.fields.parent && (within(o.fields.seat, r.id) || ((o.fields.presence as string[] | undefined) ?? []).some(p => within(p, r.id)))).sort(byName),
  maps: list('place').filter(p => p.id !== r.id && p.fields.map && within(p.id, r.id)).sort(byName),
})).sort((a, b) => b.subs.length + b.orgs.length - (a.subs.length + a.orgs.length) || byName(a.r, b.r)))
const homeless = computed(() => list('organization').filter(o => !o.fields.parent && !regions.value.some(r => r.orgs.includes(o))).sort(byName))

// ---- gods, peoples, subclasses ----
const greater = computed(() => list('deity').filter(d => d.fields.rank === 'Greater deity').sort(byName))
const lesser = computed(() => list('deity').filter(d => d.fields.rank === 'Lesser deity').sort(byName))
const pantheon = computed(() => list('deity').find(d => !d.fields.rank && d.body.length > 500))
/** The first alias as a title: "the scarlet king" → "The Scarlet King". */
const SMALL = ['of', 'the', 'and', 'a', 'an', 'in']
const epithet = (e: Entry) => (e.aliases[0] ?? '').split(' ').map((w, i) => (i > 0 && SMALL.includes(w.toLowerCase()) ? w.toLowerCase() : w[0]?.toUpperCase() + w.slice(1))).join(' ')
const races = computed(() => list('race').sort(byName))
const subclasses = computed(() => list('subclass').sort(byName))
/** Tool items for the tools recipes are crafted with. */
const kits = computed(() => {
  const used = new Set(list('item').filter(i => i.fields.recipe?.length).map(i => i.fields.craftingType))
  return list('item').filter(i => i.fields.kind === 'Tool' && used.has(i.id)).sort(byName)
})

// ---- links: web pages you keep at hand (a watch-together room, a soundboard …) ----
const links = computed(() => db().meta.links ?? [])
const adding = ref(false)
const newLabel = ref(''), newUrl = ref('')
function addLink() {
  const url = newUrl.value.trim()
  if (!url) return
  const m = db().meta
  m.links = [...(m.links ?? []), { label: newLabel.value.trim() || url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url: /^[a-z]+:/i.test(url) ? url : 'https://' + url }]
  touch()
  newLabel.value = ''; newUrl.value = ''; adding.value = false
}
function removeLink(i: number) { const m = db().meta; m.links = (m.links ?? []).filter((_, j) => j !== i); touch() }
const sessionDate = (s: Entry) => { const d = s.fields.date; return d?.year ? formatDate(d) : '' }
</script>

<template>
  <div class="home">
    <header>
      <h1>{{ db().meta.title }}</h1>
      <p class="muted">Today in the world: <a href="#/calendar"><b>{{ formatDate(db().meta.today) }}</b></a> · {{ entries.length }} entries</p>
    </header>

    <!-- the desk -->
    <div class="home-desk" :class="{ four: playerMode }">
      <section v-if="playerMode" class="card home-campaign">
        <h3><TypeIcon type="pc" /> Character</h3>
        <ul v-if="characters.length" class="rel">
          <li v-for="c in characters" :key="c.p.id"><EntryLink :id="c.p.id" /><span class="when">{{ [c.cls, c.ac, c.hp].filter(Boolean).join(' · ') }}</span></li>
        </ul>
        <button class="chip-btn" @click="newEntry('pc')">＋ {{ characters.length ? 'Another character' : 'Your character' }}</button>
      </section>
      <section class="card home-campaign">
        <h3><TypeIcon type="campaign" /> Campaign</h3>
        <template v-if="current">
          <p class="home-current"><EntryLink :id="current.c.id" /> <span class="muted small">{{ current.sessions.length }} sessions</span></p>
          <PartyAt :campaign="current.c" />
          <ul class="rel">
            <li v-for="s in current.sessions.slice(0, 3)" :key="s.id"><EntryLink :id="s.id" /><span class="when">{{ sessionDate(s) }}</span></li>
          </ul>
          <button class="chip-btn" @click="newSession">＋ Session {{ nextNumber }}</button>
        </template>
        <h4 v-if="others.length">Others</h4>
        <ul class="rel compact">
          <li v-for="{ c, sessions } in others" :key="c.id">
            <EntryLink :id="c.id" />
            <span class="when">{{ optionLabel('campaign.status', c.fields.status) || (sessions.length ? sessions.length + ' sessions' : '') }}</span>
          </li>
        </ul>
        <template v-if="notes.length">
          <h4>Notes</h4>
          <ul class="rel compact"><li v-for="n in notes" :key="n.id"><EntryLink :id="n.id" icon /></li></ul>
        </template>
      </section>

      <section class="card home-tools">
        <h3><AppIcon ui="desk" /> Desk</h3>
        <div class="tool-grid">
          <a v-for="d in desks" :key="d.id" class="tool" :href="hrefDashboard(d.id)" :title="DESK_HINT[d.id]"><span><AppIcon :ui="d.uiIcon" :type="d.typeIcon" :text="d.icon" /></span>{{ d.title }}</a>
          <a v-for="t in tools" :key="t.href" class="tool" :href="t.href" :title="'hint' in t ? t.hint : undefined"><span><AppIcon :ui="t.ui" /></span>{{ t.label }}</a>
        </div>
        <template v-if="kits.length">
          <h4>Crafting kits</h4>
          <p class="home-inline"><template v-for="(k, i) in kits" :key="k.id"><EntryLink :id="k.id" /><span v-if="i < kits.length - 1" class="muted"> · </span></template></p>
        </template>
      </section>

      <section class="card favourites">
        <h3><AppIcon ui="star" /> Favourites</h3>
        <ul v-if="favourites.length" class="rel">
          <li v-for="e in favourites" :key="e.id">
            <EntryLink :id="e.id" icon />
            <span class="role">{{ describe(e, { parent: false }) }}</span>
            <button class="link-btn unfav" title="Remove from favourites" @click="toggleFavourite(e.id)">✕</button>
          </li>
        </ul>
        <p v-else class="muted small">Star an entry with <AppIcon ui="star" /> next to its Edit button (or press F on its page) to keep it here.</p>
        <h4><AppIcon ui="history" /> Recently edited <a class="muted small" :href="hrefDashboard('recent')">more →</a></h4>
        <ul class="rel compact">
          <li v-for="e in recent" :key="e.id"><EntryLink :id="e.id" icon /><span class="when">{{ ago(e.updated) }}</span></li>
        </ul>
      </section>
    </div>

    <!-- the world -->
    <section v-if="world" class="card home-regions">
      <h3><AppIcon ui="world" /> Regions of <EntryLink :id="world.id" /> <a class="muted small" href="#/atlas">Atlas →</a></h3>
      <div class="table-wrap">
        <table class="grid">
          <thead><tr><th>Region</th><th>Subregions</th><th>Organizations</th><th>Mapped places</th></tr></thead>
          <tbody>
            <tr v-for="x in regions" :key="x.r.id">
              <td class="home-region"><EntryLink :id="x.r.id" /></td>
              <td><span v-for="s in x.subs" :key="s.id" class="home-tag"><EntryLink :id="s.id" /></span></td>
              <td><span v-for="o in x.orgs" :key="o.id" class="home-tag"><EntryLink :id="o.id" /><span v-if="o.fields.orgType" class="muted small"> {{ optionLabel('organization.orgType', o.fields.orgType) }}</span></span></td>
              <td><span v-for="m in x.maps" :key="m.id" class="home-tag"><a :href="`#/map/${encodeURIComponent(m.id)}`" title="Open the map"><AppIcon ui="map" /></a> <EntryLink :id="m.id" /></span></td>
            </tr>
            <tr v-if="homeless.length">
              <td class="muted">Elsewhere</td><td />
              <td><span v-for="o in homeless" :key="o.id" class="home-tag"><EntryLink :id="o.id" /></span></td><td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- lore at hand -->
    <div class="home-lore">
      <section v-if="!playerMode" class="card">
        <h3><TypeIcon type="deity" /> Major deities <a v-if="pantheon" class="muted small" :href="`#/e/${pantheon.id}`">{{ pantheon.name }} →</a></h3>
        <ul class="rel compact">
          <li v-for="d in greater" :key="d.id"><EntryLink :id="d.id" /><span class="role">{{ epithet(d) }}</span></li>
        </ul>
        <p v-if="lesser.length" class="muted small">Lesser: <template v-for="(d, i) in lesser" :key="d.id"><EntryLink :id="d.id" />{{ i < lesser.length - 1 ? ', ' : '' }}</template></p>
      </section>

      <section v-if="!playerMode" class="card">
        <h3><TypeIcon type="race" /> Races <a class="muted small" :href="hrefList('race')">all →</a></h3>
        <p class="home-inline"><span v-for="r in races" :key="r.id" class="home-tag"><EntryLink :id="r.id" /></span></p>
        <template v-if="subclasses.length">
          <h4>Subclasses</h4>
          <ul class="rel compact"><li v-for="s in subclasses" :key="s.id"><EntryLink :id="s.id" /></li></ul>
        </template>
      </section>

      <section class="card home-links">
        <h3><AppIcon ui="link" /> Links <button class="link-btn" :title="adding ? 'Cancel' : 'Add a link'" @click="adding = !adding">{{ adding ? '×' : '＋' }}</button></h3>
        <ul v-if="links.length" class="rel compact">
          <li v-for="(l, i) in links" :key="l.url + i">
            <a :href="l.url" target="_blank" rel="noopener">{{ l.label }}</a>
            <button class="link-btn unfav" title="Remove this link" @click="removeLink(i)">✕</button>
          </li>
        </ul>
        <p v-else-if="!adding" class="muted small">Web pages you keep at hand, like a watch-together room. Entries go in <AppIcon ui="star" /> Favourites.</p>
        <form v-if="adding" class="home-link-form" @submit.prevent="addLink">
          <input v-model="newLabel" placeholder="Name (optional)" />
          <input v-model="newUrl" placeholder="https://…" required />
          <button class="primary" type="submit">Add</button>
        </form>
      </section>
    </div>
  </div>
</template>
