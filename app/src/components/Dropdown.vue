<script setup lang="ts">
// The app's one dropdown. Every choice-from-a-list field uses it, so all of them look and behave alike: the same
// height, text, arrow and list in every style (style.css, ".dd"; the styles add their touches in styles/base.css).
// Inside it's a plain <select> with the options as its slot: the keyboard, typing a letter to jump, screen readers
// and v-model (numbers and objects as option values too) all work as with a <select>; the list it opens is drawn by
// the page (customizable select), not by Windows.
//   <Dropdown v-model="x"><option …>…</Dropdown>       or      <Dropdown :value="x" @change="…">…</Dropdown>
// `compact`: smaller text and padding, for dense rows (inventory lines, effect rows, relations, the tracker).
// Any other attribute (aria-label, class, disabled, :value, @change …) goes to the <select> itself.
import { computed, getCurrentInstance } from 'vue'

defineOptions({ inheritAttrs: false })
defineProps<{ compact?: boolean }>()
const model = defineModel<unknown>()
// v-model was given (rather than :value and @change): only then does the select follow the model
const vnodeProps = getCurrentInstance()?.vnode.props ?? {}
const bound = computed(() => 'modelValue' in vnodeProps || 'onUpdate:modelValue' in vnodeProps)
</script>

<template>
  <select v-if="bound" v-model="model" class="dd" :class="{ compact }" v-bind="$attrs"><slot /></select>
  <select v-else class="dd" :class="{ compact }" v-bind="$attrs"><slot /></select>
</template>
