<script setup lang="ts">
// The bar of a long job (progress.ts): what's being done, which part, and how far it got.
import { computed } from 'vue'
import { progress } from '../progress'

const pct = computed(() => (progress.total ? Math.round((100 * Math.min(progress.done, progress.total)) / progress.total) : null))
</script>

<template>
  <div v-if="progress.active" class="progress-toast" role="status" aria-live="polite">
    <div class="progress-head">
      <b>{{ progress.title }}</b>
      <span v-if="progress.label" class="muted">{{ progress.label }}</span>
      <span v-if="progress.total" class="progress-count">{{ Math.min(progress.done, progress.total) }} / {{ progress.total }}</span>
    </div>
    <div class="progress-track" :class="{ busy: pct == null }" role="progressbar" :aria-valuenow="pct ?? undefined" aria-valuemin="0" aria-valuemax="100">
      <span :style="pct != null ? { width: pct + '%' } : undefined" />
    </div>
  </div>
</template>
