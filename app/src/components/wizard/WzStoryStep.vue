<script setup lang="ts">
// The wizard's name and story step: the character's name, its player (in the DM's world), its looks and its story.
import { playerMode } from '../../store'
import { wizard } from '../../wizard'
import { useDraft } from '../../composables/useDraft'
import { inputValue as val } from '../../dom'

const { d } = useDraft()
</script>

<template>
  <div class="wz-form">
    <label>Name <input :value="d.name" placeholder="The character's name" @input="wizard.d.name = val($event)" /></label>
    <label v-if="!playerMode">Player <input :value="d.player" @input="wizard.d.player = val($event)" /></label>
    <label v-for="(v, k) in d.looks" :key="k">{{ k.charAt(0).toUpperCase() + k.slice(1) }} <input :value="v" @input="wizard.d.looks = { ...d.looks, [k]: val($event) }" /></label>
  </div>
  <label class="wz-story">Story <textarea rows="6" :value="d.story" placeholder="Where they come from, what they want… (Markdown)" @input="wizard.d.story = val($event)" /></label>
</template>
