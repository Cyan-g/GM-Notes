<script setup lang="ts">
// The crafter's workbench: tool proficiencies, known recipes (can I make it right now?),
// the ingredient pouch, and what's been crafted. Crafting takes the ingredients out of the pouch.
// With a current character it's theirs: recipes and tools on their sheet, ingredients and crafted things in their inventory.
import { computed, ref } from 'vue'
import type { Entry, Id, RecipeLine } from '../model/types'
import { byType, formatMoney, get } from '../store'
import { activeBench, currentPc } from '../sheet'
import { recipeCost } from '../columns'
import { CRAFTING_RULE, craftingTime } from '../crafting'
import { hrefEntry } from '../router'
import EntryLink from '../components/EntryLink.vue'
import EntryPicker from '../components/edit/EntryPicker.vue'

const c = computed(() => activeBench())
const message = ref('')

// ---- proficiencies: the Tool items ----
// With a current character these are the tool proficiencies on their sheet (the same list, changed from either place).
const TOOLS = computed(() => (byType.value.get('item') ?? []).filter(e => e.fields.kind === 'Tool').sort((a, b) => a.name.localeCompare(b.name)))
function toggleTool(t: string) {
  c.value.setTools(c.value.tools.includes(t) ? c.value.tools.filter(x => x !== t) : [...c.value.tools, t])
}

// ---- pouch ----
const have = (id: Id) => c.value.list('pouch').find(p => p.item === id)?.qty ?? 0
const addTo = (list: 'pouch' | 'made', id: Id, n = 1) => c.value.add(list, id, n)
const setQty = (list: 'pouch' | 'made', id: Id, v: string) => c.value.set(list, id, Math.max(0, Math.floor(Number(v) || 0)))
const rows = (list: 'pouch' | 'made') => c.value.list(list)
  .map(p => ({ ...p, e: get(p.item) }))
  .filter((r): r is { item: Id; qty: number; e: Entry } => !!r.e)
  .sort((a, b) => a.e.name.localeCompare(b.e.name))
const pouchRows = computed(() => rows('pouch'))
const madeRows = computed(() => rows('made'))
const pouchValue = computed(() => pouchRows.value.reduce((n, r) => n + r.qty * (Number(r.e.fields.value) || 0), 0))

// ---- recipes ----
const toolName = (e: Entry) => get(e.fields.craftingType)?.name ?? ''
const known = computed(() => c.value.known.map(id => get(id)).filter((e): e is Entry => !!e)
  .sort((a, b) => toolName(a).localeCompare(toolName(b)) || a.name.localeCompare(b.name)))
const lines = (e: Entry) => (e.fields.recipe) ?? []
const proficient = (e: Entry) => !e.fields.craftingType || c.value.tools.includes(e.fields.craftingType)
const enough = (e: Entry) => lines(e).every(l => have(l.item) >= (l.amount || 1))
const canCraft = (e: Entry) => proficient(e) && enough(e) && lines(e).length > 0
function craft(e: Entry) {
  if (!canCraft(e)) return
  for (const l of lines(e)) addTo('pouch', l.item, -(l.amount || 1))
  addTo('made', e.id, 1)
  message.value = `Crafted ${e.name}.`
}
const learnable = computed(() => (byType.value.get('item') ?? []).filter(e => (e.fields.recipe)?.length).map(e => e.id))
function learn(id: Id) { if (!c.value.known.includes(id)) c.value.setKnown([...c.value.known, id]) }
function forget(id: Id) { c.value.setKnown(c.value.known.filter(x => x !== id)) }
const ingredientIds = computed(() => (byType.value.get('item') ?? []).filter(e => e.fields.kind === 'Ingredient').map(e => e.id))
const notIngredient = computed(() => (byType.value.get('item') ?? []).filter(e => e.fields.kind !== 'Ingredient').map(e => e.id))
</script>

<template>
  <div class="workbench">
    <header class="list-head">
      <h1><span class="icon">⚗️</span>Workbench<span v-if="currentPc" class="head-of">of <EntryLink :id="currentPc.id" /></span></h1>
      <span v-if="message" class="ok small">{{ message }}</span>
    </header>

    <div class="wb-grid">
      <div class="wb-main">
        <section class="card">
          <h3>Known recipes <span class="muted small">{{ known.length }}</span></h3>
          <table v-if="known.length" class="grid wb-recipes">
            <thead><tr><th>Item</th><th>Crafted with</th><th>Ingredients</th><th class="num">Cost</th><th class="num">Value</th><th class="num" :title="CRAFTING_RULE">Time</th><th></th></tr></thead>
            <tbody>
              <tr v-for="e in known" :key="e.id" :class="{ ready: canCraft(e) }">
                <td><EntryLink :id="e.id" icon /></td>
                <td :class="{ missing: !proficient(e) }" :title="proficient(e) ? '' : 'You are not proficient with this tool'"><EntryLink v-if="e.fields.craftingType" :id="e.fields.craftingType" /><template v-else>—</template></td>
                <td>
                  <span v-for="l in lines(e)" :key="l.item" class="wb-need" :class="{ short: have(l.item) < (l.amount || 1) }">
                    <EntryLink :id="l.item" /> <span class="muted">{{ have(l.item) }}/{{ l.amount || 1 }}</span>
                  </span>
                </td>
                <td class="num">{{ formatMoney(recipeCost(e)) }}</td>
                <td class="num">{{ formatMoney(e.fields.value) }}</td>
                <td class="num">{{ craftingTime(e.fields.value) }}</td>
                <td class="wb-actions">
                  <button class="chip-btn" :disabled="!canCraft(e)" :title="canCraft(e) ? 'Use the ingredients from the pouch' : !proficient(e) ? 'Needs the tool proficiency' : 'Not enough ingredients'" @click="craft(e)">Craft</button>
                  <button class="link-btn x" title="Forget this recipe" @click="forget(e.id)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted small">No recipes yet.</p>
          <EntryPicker add :types="['item']" :exclude="c.known" placeholder="Learn a recipe: type an item…"
                       :only="learnable" @pick="learn" />
        </section>

        <section class="card">
          <h3>Crafted <span class="muted small">{{ madeRows.length }}</span></h3>
          <ul v-if="madeRows.length" class="wb-list">
            <li v-for="r in madeRows" :key="r.item">
              <EntryLink :id="r.item" icon />
              <span class="wb-qty">
                <button class="link-btn" title="Use one" @click="addTo('made', r.item, -1)">−</button>
                <input type="number" min="0" :value="r.qty" @change="setQty('made', r.item, ($event.target as HTMLInputElement).value)" />
                <button class="link-btn" title="One more" @click="addTo('made', r.item, 1)">＋</button>
              </span>
            </li>
          </ul>
          <p v-else class="muted small">Nothing yet: craft something from a known recipe.</p>
          <EntryPicker add :types="['item']" :only="notIngredient" placeholder="Add an item you have…" @pick="(id: string) => addTo('made', id)" />
        </section>
      </div>

      <aside class="wb-side">
        <section class="card">
          <h3>Tool proficiencies</h3>
          <p v-if="currentPc" class="muted small">From <a :href="hrefEntry(currentPc.id)">{{ currentPc.name }}'s character sheet</a>.</p>
          <div class="seg wrap">
            <button v-for="t in TOOLS" :key="t.id" type="button" :class="{ on: c.tools.includes(t.id) }" @click="toggleTool(t.id)">{{ t.name }}</button>
          </div>
          <p v-if="!TOOLS.length" class="muted small">No tools yet: tools are items of the kind Tool.</p>
        </section>

        <section class="card">
          <h3>Ingredient pouch <span class="muted small">{{ formatMoney(pouchValue) }}</span></h3>
          <p v-if="currentPc" class="muted small">The ingredients in {{ currentPc.name }}'s inventory.</p>
          <ul v-if="pouchRows.length" class="wb-list">
            <li v-for="r in pouchRows" :key="r.item">
              <EntryLink :id="r.item" />
              <span class="wb-qty">
                <button class="link-btn" title="Take one out" @click="addTo('pouch', r.item, -1)">−</button>
                <input type="number" min="0" :value="r.qty" @change="setQty('pouch', r.item, ($event.target as HTMLInputElement).value)" />
                <button class="link-btn" title="Add one" @click="addTo('pouch', r.item, 1)">＋</button>
              </span>
            </li>
          </ul>
          <p v-else class="muted small">The pouch is empty.</p>
          <EntryPicker add :types="['item']" :only="ingredientIds" placeholder="Add an ingredient…" @pick="(id: string) => addTo('pouch', id)" />
        </section>
      </aside>
    </div>
  </div>
</template>
