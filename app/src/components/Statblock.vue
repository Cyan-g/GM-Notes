<script setup lang="ts">
import { computed } from 'vue'
import type { Statblock } from '../model/types'
import { renderInline } from '../markdown'
import ConditionIcon from './ConditionIcon.vue'

const props = defineProps<{ sb: Statblock; name: string }>()
const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const mod = (v: number) => { const m = Math.floor((v - 10) / 2); return `${m >= 0 ? '+' : ''}${m}` }
const lines = computed(() => {
  const s = props.sb
  return ([
    ['Saving Throws', s.saves], ['Skills', s.skills], ['Damage Resistances', s.resistances],
    ['Damage Immunities', s.immunities], ['Condition Immunities', s.conditionImmunities],
    ['Senses', s.senses], ['Languages', s.languages], ['Challenge', s.cr],
  ] as [string, string | undefined][]).filter(([, v]) => v)
})
const sections = computed(() => ([
  ['', props.sb.traits], ['Actions', props.sb.actions], ['Bonus Actions', props.sb.bonusActions],
  ['Reactions', props.sb.reactions], ['Legendary Actions', props.sb.legendary],
] as const).filter(([, f]) => f?.length))
const onlyAbilities = computed(() => Object.keys(props.sb).every(k => ['abilities', 'hp', 'ac'].includes(k)))
</script>

<template>
  <div class="statblock" :class="{ compact: onlyAbilities }">
    <template v-if="!onlyAbilities">
      <h3>{{ name }}</h3>
      <div class="sb-sub" v-if="sb.size || sb.creatureType || sb.alignment">
        {{ [sb.size, sb.creatureType].filter(Boolean).join(' ') }}<template v-if="sb.alignment">, {{ sb.alignment }}</template>
      </div>
      <div v-if="sb.srd" class="sb-srd">Uses the SRD stats for <b>{{ sb.srd }}</b></div>
      <hr />
    </template>
    <div class="sb-line" v-if="sb.ac != null"><b>Armor Class</b> {{ sb.ac }}<template v-if="sb.acNote"> ({{ sb.acNote }})</template></div>
    <div class="sb-line" v-if="sb.hp != null"><b>Hit Points</b> {{ sb.hp }}<template v-if="sb.hitDice"> ({{ sb.hitDice }})</template></div>
    <div class="sb-line" v-if="sb.speed"><b>Speed</b> {{ sb.speed }}</div>
    <template v-if="sb.abilities">
      <hr v-if="!onlyAbilities" />
      <div class="sb-abilities">
        <div v-for="a in ABIL" :key="a"><b>{{ a.toUpperCase() }}</b><span>{{ sb.abilities[a] }} ({{ mod(sb.abilities[a]) }})</span></div>
      </div>
    </template>
    <template v-if="lines.length">
      <hr />
      <div class="sb-line" v-for="[k, v] in lines" :key="k"><b>{{ k }}</b>{{ ' ' }}<template v-if="k === 'Condition Immunities'"><template v-for="(w, i) in v!.split(/\s*[,;]\s*/)" :key="i">{{ i ? ', ' : '' }}<span class="cond-word"><ConditionIcon :name="w" />{{ w }}</span></template></template><template v-else>{{ v }}</template></div>
    </template>
    <template v-for="[title, feats] in sections" :key="title">
      <h4 v-if="title">{{ title }}</h4>
      <p v-for="f in feats" :key="f.name" class="sb-feat"><b><i>{{ f.name }}.</i></b> <span v-html="renderInline(f.text)" /></p>
    </template>
  </div>
</template>
