<script setup lang="ts">
// A side card on an entry's page with a group of its simple fields (Details, Appearance…), each label and value.
import type { Entry } from '../model/types'
import type { FieldDef } from '../model/schema'
import FieldValue from './FieldValue.vue'

defineProps<{ title: string; fields: { def: FieldDef; value: unknown }[]; entry: Entry }>()
</script>

<template>
  <div class="card">
    <h3>{{ title }}</h3>
    <dl>
      <template v-for="f in fields" :key="f.def.key">
        <dt>{{ f.def.label }}</dt>
        <dd><FieldValue :def="f.def" :value="f.value" :entry="entry" /></dd>
      </template>
    </dl>
  </div>
</template>
