<script setup lang="ts">
// A person's family as a tree, oldest generation on top. Click someone to see the tree from their side;
// the buttons above add parents, children, spouses and siblings (as relations, so both pages show them).
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Id } from '../model/types'
import { get } from '../store'
import { addRelation } from '../edit'
import { hrefEntry, hrefFamily } from '../router'
import { describe } from '../describe'
import { NODE_H, NODE_W, buildTree, kinOf } from '../family'
import DataImage from './DataImage.vue'
import EntryPicker from './edit/EntryPicker.vue'

const props = defineProps<{ id: Id }>()
const tree = computed(() => buildTree(props.id))
const kin = computed(() => kinOf(props.id))
const PEOPLE = ['npc', 'pc'] as const

type Add = 'parent' | 'child' | 'spouse' | 'sibling'
const ADD: { key: Add; label: string }[] = [
  { key: 'parent', label: 'Parent' }, { key: 'spouse', label: 'Spouse' }, { key: 'sibling', label: 'Sibling' }, { key: 'child', label: 'Child' },
]
const adding = ref<Add | null>(null)
function add(other: Id) {
  if (adding.value === 'parent') addRelation(other, props.id, 'parent')
  else if (adding.value === 'child') addRelation(props.id, other, 'parent')
  else if (adding.value) addRelation(props.id, other, adding.value)
  adding.value = null
}
const already = computed(() => [props.id, ...kin.value.parents, ...kin.value.children, ...kin.value.spouses, ...kin.value.siblings])

// Keep the person in view: scroll the tree so they're centred.
const box = ref<HTMLElement | null>(null)
function centre() {
  const n = tree.value.nodes.find(n => n.id === props.id)
  if (box.value && n) box.value.scrollLeft = n.x + NODE_W / 2 - box.value.clientWidth / 2
}
onMounted(centre)
watch(() => props.id, () => nextTick(centre))

const sub = (id: Id) => { const e = get(id); return e ? describe(e, { parent: false }) : '' }
</script>

<template>
  <section class="family">
    <div class="family-tools">
      <span class="muted small">Add to the family:</span>
      <button v-for="a in ADD" :key="a.key" type="button" class="chip-btn" :class="{ on: adding === a.key }" @click="adding = adding === a.key ? null : a.key">＋ {{ a.label }}</button>
      <EntryPicker v-if="adding" add :types="[...PEOPLE]" :exclude="already" :placeholder="`${ADD.find(x => x.key === adding)!.label}: type a name…`" @pick="add" />
    </div>

    <div v-if="tree.nodes.length > 1" ref="box" class="family-scroll">
      <div class="family-canvas" :style="{ width: tree.width + 'px', height: tree.height + 'px' }">
        <svg class="family-lines" :width="tree.width" :height="tree.height" aria-hidden="true">
          <path v-for="(l, i) in tree.lines" :key="i" :d="l.d" :class="l.kind" />
        </svg>
        <a v-for="n in tree.nodes" :key="n.id" class="kin" :class="{ focus: n.id === id }" :href="n.id === id ? hrefEntry(n.id) : hrefFamily(n.id)"
           :title="n.id === id ? 'Open the page' : `${get(n.id)?.name}'s family`"
           :style="{ left: n.x + 'px', top: n.y + 'px', width: NODE_W + 'px', height: NODE_H + 'px' }">
          <DataImage v-if="get(n.id)?.image" :path="get(n.id)!.image!" :alt="get(n.id)!.name" class="kin-pic" />
          <span v-else class="kin-pic kin-initial">{{ get(n.id)?.name[0] }}</span>
          <span class="kin-text">
            <b>{{ get(n.id)?.name }}</b>
            <span class="muted small">{{ sub(n.id) }}</span>
          </span>
        </a>
      </div>
    </div>
    <p v-else class="muted family-empty">No family recorded yet. Add parents, a spouse, siblings or children with the buttons above;
      they show up on the other person's tree too.</p>
  </section>
</template>
