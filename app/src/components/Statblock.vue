<script setup lang="ts">
import { computed } from 'vue'
import type { Feature, Statblock } from '../model/types'
import { featureText, legendaryIntro, legendaryResistanceFeature, spellcastingFeature, speedText } from '../creatures'
import MarkdownView from './MarkdownView.vue'
import { renderInline } from '../markdown'
import ConditionIcon from './ConditionIcon.vue'

const props = defineProps<{ sb: Statblock; name: string }>()
const ABIL = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const mod = (v: number) => { const m = Math.floor((v - 10) / 2); return `${m >= 0 ? '+' : ''}${m}` }
const lines = computed(() => {
  const s = props.sb
  return ([
    ['Saving Throws', s.saves], ['Skills', s.skills], ['Damage Vulnerabilities', s.vulnerabilities], ['Damage Resistances', s.resistances],
    ['Damage Immunities', s.immunities], ['Condition Immunities', s.conditionImmunities],
    ['Senses', s.senses], ['Languages', s.languages], ['Challenge', s.cr],
  ] as [string, string | undefined][]).filter(([, v]) => v)
})
// the parts, with what the app writes from the numbers: Legendary Resistance among the traits, Spellcasting after the
// actions, the legendary actions' opening line; an attack's text from its ability and proficiency
const sections = computed(() => {
  const sb = props.sb, lr = legendaryResistanceFeature(sb, props.name), sc = spellcastingFeature(sb, props.name)
  return ([
    ['', [...(sb.traits ?? []), ...(lr ? [lr] : [])], ''], ['Actions', [...(sb.actions ?? []), ...(sc ? [sc] : [])], ''], ['Bonus Actions', sb.bonusActions ?? [], ''],
    ['Reactions', sb.reactions ?? [], ''], ['Legendary Actions', sb.legendary ?? [], legendaryIntro(sb, props.name)], ['Lair Actions', sb.lair ?? [], sb.lair?.length ? 'On initiative count 20 (losing initiative ties), it can take one lair action.' : ''],
  ] as [string, Feature[], string][]).filter(([, f]) => f.length)
})
const onlyAbilities = computed(() => Object.keys(props.sb).every(k => ['abilities', 'hp', 'ac'].includes(k)))
/** Nothing filled in: every score still 10 and no HP or AC. Shown as nothing rather than as real numbers. */
const blank = computed(() => onlyAbilities.value && props.sb.hp == null && props.sb.ac == null && (!props.sb.abilities || ABIL.every(a => Number(props.sb.abilities![a]) === 10)))
</script>

<template>
  <div v-if="!blank" class="statblock" :class="{ compact: onlyAbilities }">
    <template v-if="!onlyAbilities">
      <h3>{{ name }}</h3>
      <div class="sb-sub" v-if="sb.size || sb.creatureType || sb.alignment">
        {{ [sb.size, sb.creatureType].filter(Boolean).join(' ') }}<template v-if="sb.alignment">, {{ sb.alignment }}</template>
      </div>
      <div v-if="sb.srd" class="sb-srd">{{ sb.ac == null ? 'Not an SRD monster name' : 'Stats from the SRD' }}: <b>{{ sb.srd }}</b></div>
      <hr />
    </template>
    <div class="sb-line" v-if="sb.ac != null"><b>Armor Class</b> {{ sb.ac }}<template v-if="sb.acNote"> ({{ sb.acNote }})</template></div>
    <div class="sb-line" v-if="sb.hp != null"><b>Hit Points</b> {{ sb.hp }}<template v-if="sb.hitDice"> ({{ sb.hitDice }})</template></div>
    <div class="sb-line" v-if="sb.speed"><b>Speed</b> {{ speedText(sb.speed) }}</div>
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
    <template v-for="[title, feats, intro] in sections" :key="title">
      <h4 v-if="title">{{ title }}</h4>
      <p v-if="intro" class="sb-feat sb-intro">{{ intro }}</p>
      <div v-for="f in feats" :key="f.name" class="sb-feat"><b><i>{{ f.name }}.</i></b> <MarkdownView v-if="/\n/.test(featureText(sb, f))" class="sb-md" :source="featureText(sb, f)" /><span v-else v-html="renderInline(featureText(sb, f))" /></div>
    </template>
  </div>
</template>
