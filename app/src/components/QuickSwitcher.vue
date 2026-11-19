<script setup lang="ts">
// Ctrl+K: jump anywhere. Before typing: the entries opened lately and the favourites. Typing: pages of the menus,
// entries by name or alias (punctuation and small typos forgiven), then entries whose text holds the words.
// Player mode leaves out the DM's encounters and creatures.
import EntryIcon from './EntryIcon.vue'
import AppIcon from './AppIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'
import type { Entry, Id } from '../model/types'
import { fullText, search, type TextHit } from '../search'
import { TYPES } from '../model/schema'
import { go, hrefEntry, route } from '../router'
import { describe } from '../describe'
import { get, hiddenFromPlayers, state } from '../store'
import { visibleMenus, type MenuNode } from '../menu'

const open = defineModel<boolean>({ required: true })
const q = ref('')
const sel = ref(0)
const input = ref<HTMLInputElement>()
const list = ref<HTMLUListElement>()

// ---- recently opened entries, remembered on this computer for each world ----
const recentKey = () => `dndesk.recent.${state.worldId ?? 'world'}`
/** Bumped on every opening, so the recent list is read afresh. */
const opened = ref(0)
function readRecent(): Id[] { void opened.value; try { return JSON.parse(localStorage.getItem(recentKey()) ?? '[]') } catch { return [] } }
watch(() => (route.current.name === 'entry' ? route.current.id : null), id => {
  if (!id || !get(id)) return
  const l = [id, ...readRecent().filter(x => x !== id)].slice(0, 20)
  try { localStorage.setItem(recentKey(), JSON.stringify(l)) } catch { /* private window: no memory */ }
}, { immediate: true })

// ---- pages: every menu item with a link, for the current mode ----
const pages = computed(() => {
  const out: { label: string; href: string; menu: string; ui?: MenuNode['uiIcon'] }[] = []
  const walk = (nodes: MenuNode[], menu: string) => {
    for (const n of nodes) {
      if (n.href && !n.href.startsWith('#/e/') && !out.some(p => p.href === n.href)) out.push({ label: n.label, href: n.href, menu, ui: n.uiIcon })
      if (n.children) walk(n.children(), menu)
    }
  }
  for (const m of visibleMenus.value) walk(m.items(), m.title)
  return [...out, { label: 'Home', href: '#/', menu: '' }, { label: 'Data & backups', href: '#/data', menu: '' }]
})

type Item = { kind: 'page'; label: string; href: string; hint: string; ui?: MenuNode['uiIcon'] } | { kind: 'entry'; e: Entry; group: string } | { kind: 'text'; hit: TextHit }
const visible = (e: Entry) => !hiddenFromPlayers(e)
const items = computed<Item[]>(() => {
  const t = q.value.trim()
  if (!t) {
    const recent = readRecent().map(id => get(id)).filter((e): e is Entry => !!e && visible(e) && e.id !== (route.current.name === 'entry' ? route.current.id : '')).slice(0, 8)
    const favs = (state.db?.meta.favourites ?? []).map(id => get(id)).filter((e): e is Entry => !!e && visible(e) && !recent.includes(e))
    return [...recent.map(e => ({ kind: 'entry' as const, e, group: 'Recently opened' })), ...favs.map(e => ({ kind: 'entry' as const, e, group: 'Favourites' }))]
  }
  const low = t.toLowerCase()
  const pageHits = t.length >= 2 ? pages.value.filter(p => p.label.toLowerCase().split(/[^a-z]+/).some(w => w.startsWith(low)) || p.label.toLowerCase().startsWith(low)).slice(0, 4) : []
  const named = search(t, 12, visible)
  const text = fullText(t, 8, e => visible(e) && !named.includes(e))
  return [
    ...pageHits.map(p => ({ kind: 'page' as const, label: p.label, href: p.href, hint: p.menu, ui: p.ui })),
    ...named.map(e => ({ kind: 'entry' as const, e, group: '' })),
    ...text.map(hit => ({ kind: 'text' as const, hit })),
  ]
})
/** A heading above the first item of each group. */
const headOf = (i: number) => {
  const it = items.value[i], prev = items.value[i - 1]
  const g = (x?: Item) => (!x ? null : x.kind === 'page' ? 'Pages' : x.kind === 'text' ? 'Found in the text' : x.group || 'Entries')
  return g(it) !== g(prev) && (q.value.trim() ? g(it) !== 'Entries' || !!prev : true) ? g(it) : null
}
watch(items, () => { sel.value = 0 })
watch(sel, async () => { await nextTick(); list.value?.querySelector('li.sel')?.scrollIntoView({ block: 'nearest' }) })
watch(open, async v => { if (v) { q.value = ''; opened.value++; await nextTick(); input.value?.focus() } })

function pick(i = sel.value) {
  const it = items.value[i]
  if (!it) return
  go(it.kind === 'page' ? it.href : hrefEntry(it.kind === 'entry' ? it.e.id : it.hit.e.id))
  open.value = false
}
function key(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown') { sel.value = Math.min(sel.value + 1, items.value.length - 1); ev.preventDefault() }
  else if (ev.key === 'ArrowUp') { sel.value = Math.max(sel.value - 1, 0); ev.preventDefault() }
  else if (ev.key === 'Enter') pick()
  else if (ev.key === 'Escape') open.value = false
}
</script>

<template>
  <div v-if="open" class="qs-backdrop" @mousedown.self="open = false">
    <div class="qs" role="dialog" aria-label="Go to">
      <input ref="input" v-model="q" placeholder="Go to… (a name, a page, or words from the text)" @keydown="key" />
      <ul v-if="items.length" ref="list">
        <template v-for="(it, i) in items" :key="i">
          <li v-if="headOf(i)" class="qs-head">{{ headOf(i) }}</li>
          <li :class="{ sel: i === sel, 'qs-text': it.kind === 'text' }" @mousemove="sel = i" @click="pick(i)">
            <template v-if="it.kind === 'page'">
              <span class="icon"><AppIcon v-if="it.ui" :ui="it.ui" /><template v-else>›</template></span>
              <span class="qs-name">{{ it.label }}</span>
              <span class="qs-type">{{ it.hint || 'Page' }}</span>
            </template>
            <template v-else-if="it.kind === 'entry'">
              <span class="icon"><EntryIcon :e="it.e" /></span>
              <span class="qs-name">{{ it.e.name }}</span>
              <span class="qs-alias">{{ describe(it.e) || it.e.aliases.slice(0, 2).join(', ') }}</span>
              <span class="qs-type">{{ TYPES[it.e.type].label }}</span>
            </template>
            <template v-else>
              <span class="icon"><EntryIcon :e="it.hit.e" /></span>
              <span class="qs-text-body">
                <span class="qs-name">{{ it.hit.e.name }}</span>
                <span class="qs-snippet">{{ it.hit.before }}<mark>{{ it.hit.hit }}</mark>{{ it.hit.after }}</span>
              </span>
              <span class="qs-type">{{ TYPES[it.hit.e.type].label }}</span>
            </template>
          </li>
        </template>
      </ul>
      <p v-else-if="q.trim()" class="muted pad">Nothing found by name or in the text.</p>
      <p v-else class="muted pad">Type a name, a page or words from the text. ↑↓ to choose, Enter to open.</p>
    </div>
  </div>
</template>
