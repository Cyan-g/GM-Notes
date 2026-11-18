<script setup lang="ts">
// Archive → Lists: every dropdown's options (model/lists.ts). Entries store an option's id, so renaming an
// option here renames it everywhere at once. An option in use can't be removed, and the ones the app relies on
// (🔒) can be renamed but never removed.
import { computed, ref } from 'vue'
import type { Entry } from '../model/types'
import { byKey } from '../model/schema'
import { LISTS, type ListDef, type ListOption } from '../model/lists'
import { entries, listOptions, setList, state } from '../store'
import { hrefEntry } from '../router'

const ro = computed(() => !!state.readOnly)
const q = ref('')
const shownLists = computed(() => LISTS.filter(l => !q.value.trim() || l.label.toLowerCase().includes(q.value.trim().toLowerCase())))
const pickedKey = ref(LISTS.find(l => l.key === 'item.kind')?.key ?? LISTS[0].key)
const list = computed<ListDef>(() => LISTS.find(l => l.key === pickedKey.value)!)
const options = computed(() => listOptions(pickedKey.value))
const message = ref('')

// ---- where each option is used ----
/** The entries using each option of a list: in its fields, and on character sheets for proficiency lists. */
function usersOf(l: ListDef): Map<string, Entry[]> {
  const out = new Map<string, Entry[]>()
  const add = (id: unknown, e: Entry) => { if (typeof id !== 'string') return; const a = out.get(id) ?? []; if (!a.includes(e)) a.push(e); out.set(id, a) }
  for (const e of entries.value) {
    for (const { type, def } of l.fields) {
      if (e.type !== type) continue
      const v = byKey(e.fields)[def.key]
      for (const id of Array.isArray(v) ? v : [v]) add(id, e)
    }
    if (l.key === 'class' && e.type === 'pc') for (const c of e.fields.classLevels ?? []) add(c.class, e)
    const p = l.sheet && e.type === 'pc' ? e.fields.sheet?.proficiencies : undefined
    if (p && l.sheet) for (const id of p[l.sheet] ?? []) add(id, e)
  }
  return out
}
const users = computed(() => usersOf(list.value))
const countIn = (l: ListDef) => listOptions(l.key).length
const fixed = (o: ListOption) => list.value.fixed.includes(o.id)
const shownUsers = ref<string | null>(null)

// ---- changes ----
const save = (opts: ListOption[]) => { setList(pickedKey.value, opts); message.value = '' }
function rename(o: ListOption, ev: Event) {
  const input = ev.target as HTMLInputElement
  const label = input.value.trim()
  if (!label) { input.value = o.label; return }
  if (options.value.some(x => x !== o && x.label.toLowerCase() === label.toLowerCase())) {
    message.value = `“${label}” is already in this list.`
    input.value = o.label
    return
  }
  save(options.value.map(x => (x.id === o.id ? { ...x, label } : x)))
}
function move(i: number, by: number) {
  const l = [...options.value]
  const j = i + by
  if (j < 0 || j >= l.length) return
  ;[l[i], l[j]] = [l[j], l[i]]
  save(l)
}
function sortAz() { save([...options.value].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))) }
function remove(o: ListOption) {
  if (fixed(o) || users.value.get(o.id)?.length) return
  save(options.value.filter(x => x.id !== o.id))
}
const newLabel = ref('')
function add() {
  const label = newLabel.value.trim()
  if (!label) return
  if (options.value.some(x => x.label.toLowerCase() === label.toLowerCase())) { message.value = `“${label}” is already in this list.`; return }
  // The id is the name it was first given; it never changes, so entries keep pointing at it after a rename.
  let id = label
  for (let n = 2; options.value.some(x => x.id === id); n++) id = `${label} ${n}`
  save([...options.value, { id, label }])
  newLabel.value = ''
}
const usedBy = (l: ListDef) => [...l.fields.map(f => `${f.def.label} of ${f.type === 'pc' ? 'characters' : f.type}s`), ...(l.sheet ? ['character sheet proficiencies'] : []), ...(l.key === 'class' ? ["characters' classes"] : [])].join(', ')
</script>

<template>
  <div class="lists-page">
    <header class="list-head">
      <h1><span class="icon">☰</span>Lists</h1>
      <span class="muted small">The options of every dropdown. Renaming one renames it everywhere; one in use can't be removed.</span>
    </header>

    <div class="lists-grid">
      <aside class="card lists-nav">
        <input v-model="q" class="lists-search" placeholder="Find a list…" />
        <ul>
          <li v-for="l in shownLists" :key="l.key">
            <button class="link-btn" :class="{ on: l.key === pickedKey }" @click="pickedKey = l.key; shownUsers = null; message = ''">
              {{ l.label }} <span class="muted small">{{ countIn(l) }}</span>
            </button>
          </li>
        </ul>
      </aside>

      <section class="card lists-edit">
        <h3>{{ list.label }} <button v-if="!ro" class="link-btn small" title="Sort the options A–Z" @click="sortAz">Sort A–Z</button></h3>
        <p class="muted small">Used by: {{ usedBy(list) }}.</p>
        <p v-if="message" class="error small">{{ message }}</p>
        <table class="grid lists-table">
          <thead><tr><th></th><th>Option</th><th>In use</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(o, i) in options" :key="o.id">
              <td class="lists-move">
                <button class="link-btn" :disabled="ro || i === 0" title="Move up" @click="move(i, -1)">▲</button>
                <button class="link-btn" :disabled="ro || i === options.length - 1" title="Move down" @click="move(i, 1)">▼</button>
              </td>
              <td>
                <input :value="o.label" :disabled="ro" :aria-label="`Name of ${o.label}`" @change="rename(o, $event)" @keydown.enter="($event.target as HTMLInputElement).blur()" />
                <span v-if="fixed(o)" class="lists-lock" :title="`The app relies on this option (${list.why}): it can be renamed but not removed.`">🔒</span>
                <span v-if="o.label !== o.id" class="muted small" title="The option's id, which entries store; it stays the same when it's renamed"> was “{{ o.id }}”</span>
              </td>
              <td>
                <button v-if="users.get(o.id)?.length" class="link-btn small" @click="shownUsers = shownUsers === o.id ? null : o.id">{{ users.get(o.id)!.length }} {{ users.get(o.id)!.length === 1 ? 'entry' : 'entries' }}</button>
                <span v-else class="muted small">unused</span>
                <ul v-if="shownUsers === o.id" class="lists-users">
                  <li v-for="e in users.get(o.id)!.slice(0, 40)" :key="e.id"><a :href="hrefEntry(e.id)">{{ e.name }}</a></li>
                  <li v-if="users.get(o.id)!.length > 40" class="muted small">… and {{ users.get(o.id)!.length - 40 }} more</li>
                </ul>
              </td>
              <td>
                <button class="link-btn x" :disabled="ro || fixed(o) || !!users.get(o.id)?.length"
                        :title="fixed(o) ? 'The app relies on this option' : users.get(o.id)?.length ? 'In use: change those entries first' : 'Remove this option'"
                        @click="remove(o)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
        <form v-if="!ro" class="lists-add" @submit.prevent="add">
          <input v-model="newLabel" placeholder="New option…" />
          <button type="submit" :disabled="!newLabel.trim()">＋ Add</button>
        </form>
      </section>
    </div>
  </div>
</template>
