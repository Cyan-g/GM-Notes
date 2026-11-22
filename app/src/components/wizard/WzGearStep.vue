<script setup lang="ts">
// The wizard's equipment step: the class's starting kit options, the background's items or gold, and what goes into
// the inventory. What the world has no item for comes from the SRD's gear (or is made as a plain item) when the
// character is made, and the step says so.
import Dropdown from '../Dropdown.vue'
import { computed, onMounted } from 'vue'
import { backgroundGold, backgroundKit, classKitsOf, kitLineSource, loadSrdGear, wizard } from '../../wizard'
import { itemNamed } from '../../lookup'
import { formatMoney, get } from '../../store'
import { inputValue as val } from '../../dom'
import { useDraft } from '../../composables/useDraft'
import EntryLink from '../EntryLink.vue'

const { d, classPage, taken } = useDraft()
const kits = computed(() => classKitsOf(d.value.cls))
onMounted(loadSrdGear)
/** The kit lines by where their item comes from. */
const linesFrom = (from: ReturnType<typeof kitLineSource>) => taken.value.items.filter(l => kitLineSource(l) === from).map(l => `${l.amount ? l.amount + ' × ' : ''}${l.name}`)
const fromSrd = computed(() => linesFrom('srd'))
const asNew = computed(() => linesFrom('new'))
const unchosen = computed(() => linesFrom('none'))
const MARK: Record<string, string> = { srd: 'SRD', new: 'new', none: 'not picked' }
const SOURCE: Record<string, string> = { srd: 'Added to this world from the SRD when the character is made', new: 'Made as a new item with just its name', none: 'Nothing picked for it yet: left out' }
const bgKit = computed(() => backgroundKit(d.value))
const bgGold = computed(() => backgroundGold(d.value))
/** The background kit's lines the player picks an item for (Wayfarer: a gaming set of their choice). */
const picks = computed(() => (get(d.value.background)?.fields.equipment?.items ?? []).map((l, i) => ({ l, i })).filter(x => x.l.among?.length))
const pickName = (id: string) => get(id)?.name ?? id
function setPick(i: number, id: string) { wizard.d.kitPicks = { ...(wizard.d.kitPicks ?? {}), [i]: id } }
</script>

<template>
  <template v-if="kits.length">
    <h3>From the class</h3>
    <label v-for="(k, i) in kits" :key="i" class="wz-kit">
      <input type="radio" :checked="d.classKit === i" @change="wizard.d.classKit = i" />
      <span><b>{{ String.fromCharCode(65 + i) }}</b> {{ k.items.map(l => `${l.amount ? l.amount + ' × ' : ''}${l.name}`).join(', ') }}<template v-if="k.items.length && k.money"> and </template>{{ k.money ? formatMoney(k.money) : '' }}</span>
    </label>
  </template>
  <p v-else-if="d.cls" class="muted small">This class has no starting equipment here; add it on the sheet.</p>
  <template v-if="bgKit || bgGold">
    <h3>From the background</h3>
    <label v-if="bgKit" class="wz-kit"><input type="radio" :checked="d.bgKit === 'items'" @change="wizard.d.bgKit = 'items'" />
      <span><b>A</b> {{ bgKit.items.map(l => `${l.amount ? l.amount + ' × ' : ''}${l.name}`).join(', ') }}<template v-if="bgKit.money"> and {{ formatMoney(bgKit.money) }}</template></span></label>
    <label v-if="bgGold" class="wz-kit"><input type="radio" :checked="d.bgKit === 'money'" @change="wizard.d.bgKit = 'money'" />
      <span><b>B</b> {{ formatMoney(bgGold) }}</span></label>
    <p v-for="p in d.bgKit === 'items' ? picks : []" :key="p.i" class="small wz-kit-pick">
      <label>{{ p.l.name || 'Pick one' }}:
        <Dropdown :value="d.kitPicks?.[p.i] ?? ''" @change="setPick(p.i, val($event))">
          <option value="" disabled>Pick one…</option>
          <option v-for="id in p.l.among" :key="id" :value="id">{{ pickName(id) }}</option>
        </Dropdown></label>
    </p>
  </template>
  <!-- everything the character gets, in one list; what the world doesn't have yet is marked -->
  <h3>Goes into the inventory</h3>
  <p class="small"><template v-for="(l, i) in taken.items" :key="i"><template v-if="i">, </template>{{ l.amount ? l.amount + ' × ' : '' }}<EntryLink v-if="kitLineSource(l) === 'world'" :id="(l.item ?? itemNamed(l.name)!.id)" /><template v-else>{{ l.name }}<sup class="wz-new" :title="SOURCE[kitLineSource(l)]">{{ MARK[kitLineSource(l)] }}</sup></template></template>
    <template v-if="taken.money">{{ taken.items.length ? '; ' : '' }}{{ formatMoney(taken.money) }}</template></p>
  <p v-if="fromSrd.length || asNew.length" class="small muted"><template v-if="fromSrd.length"><sup class="wz-new">SRD</sup> added to this world from the SRD when the character is made. </template><template v-if="asNew.length"><sup class="wz-new">new</sup> not in this world or the SRD: made with just its name (fill it in on its page).</template></p>
  <p v-if="unchosen.length" class="small warn-text">Left out, as nothing was picked for it: {{ unchosen.join(', ') }}. Pick it on the Background step, or add it on the sheet.</p>
</template>
