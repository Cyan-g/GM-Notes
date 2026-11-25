<script setup lang="ts">
// A page turning over (JournalBook), cut into strips hinged one after another from the spine out: each strip holds
// its slice of the page and the next strip, and bends a little against the one before (style.css, curl-*), so the
// sheet curls as it lifts and lies flat again as it lands. Its front is the page it was; its back the page it becomes.
import type { Entry } from '../../model/types'
import JournalPage, { type Leaf } from './JournalPage.vue'
import LeafStrip from './LeafStrip.vue'

/** `i`: this strip, counted from the spine; `n`: how many; `dir`: fwd turns the right page over, back the left one.
 * `backLeaf`, `backNum`: the page on its other side, which it becomes as it lands. */
const props = defineProps<{ campaign: Entry; leaf: Leaf; num: number; backLeaf: Leaf; backNum: number; dir: 'fwd' | 'back'; i: number; n: number }>()
/** Where this strip's slice sits on the page, counted from the page's left edge. */
const off = props.dir === 'fwd' ? props.i : props.n - 1 - props.i
/** Where its back's slice sits on the page it lands as (the other side of the spine), from that page's left edge. */
const backOff = props.dir === 'fwd' ? props.n - 1 - props.i : props.i
</script>

<template>
  <div class="lstrip" :style="{ '--i': i }">
    <div class="lclip">
      <div class="lpage" :style="{ left: `calc(${-off} * (100% - 1px))`, width: `calc(${n} * (100% - 1px))` }">
        <JournalPage :campaign="campaign" :leaf="leaf" :side="dir === 'fwd' ? 'right' : 'left'" :num="num" still />
      </div>
    </div>
    <!-- its back: the page it becomes (the next spread's left page going forward, the previous one's right going back),
         in shade as it comes over, in full light as it lands -->
    <span class="lback"><div class="lback-page" :style="{ left: `calc(${-backOff} * (100% - 1px) + 1px)`, width: `calc(${n} * (100% - 1px))` }">
      <JournalPage :campaign="campaign" :leaf="backLeaf" :side="dir === 'fwd' ? 'left' : 'right'" :num="backNum" still />
    </div></span>
    <LeafStrip v-if="i + 1 < n" :campaign="campaign" :leaf="leaf" :num="num" :back-leaf="backLeaf" :back-num="backNum" :dir="dir" :i="i + 1" :n="n" />
  </div>
</template>
