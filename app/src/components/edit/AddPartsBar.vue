<script setup lang="ts" generic="K extends string">
// The "＋ X" buttons for the parts of a form not shown yet (see useParts), after an optional lead text. Nothing
// shows when every part is.
defineProps<{ parts: readonly K[]; label: (k: K) => string; title?: (k: K) => string | undefined; lead?: string }>()
const emit = defineEmits<{ add: [k: K] }>()
</script>

<template>
  <div v-if="parts.length">
    <span v-if="lead" class="muted small">{{ lead }}</span>
    <button v-for="k in parts" :key="k" type="button" class="chip-btn" :title="title?.(k)" @click="emit('add', k)">＋ {{ label(k) }}</button>
  </div>
</template>
