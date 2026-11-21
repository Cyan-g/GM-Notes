<script setup lang="ts">
import TypeIcon from '../components/TypeIcon.vue'
import { computed } from 'vue'
import type { EntryType } from '../model/types'
import { TYPES, typeWord } from '../model/schema'
import { byType } from '../store'
import { newEntry } from '../ui'
import DataTable from '../components/DataTable.vue'

const props = defineProps<{ type: EntryType }>()
const def = computed(() => TYPES[props.type])

// Which columns and filters each type's list shows.
const COLS: Partial<Record<EntryType, { cols: string[]; facets?: string[]; sort?: { key: string; dir: 1 | -1 }; tree?: string; groups?: string[] }>> = {
  npc: { cols: ['occupation', 'race', '@status', 'attitude', '@lives-in', '@member'], facets: ['race', '@status', 'attitude', '@lives-in', '@member'], groups: ['@lives-in', '@member', 'race', '@status'] },
  // the party at a glance: what the DM asks for at the table
  pc: { cols: ['player', 'race', '@classes', '@level', '@ac', '@maxHp', '@passives', '@spellDc', '@languages', 'campaigns'], facets: ['campaigns'] },
  // nested under the organization they're part of; grouping by seat or type flattens them
  organization: { cols: ['orgType', 'seat', '@leader', '@worships', 'attitude', '@members'], facets: ['orgType', 'attitude'], tree: 'parent', groups: ['seat', 'orgType'] },
  // nested by "Located in"; grouping by kind flattens it
  place: { cols: ['placeType', '@subplaces', '@residents'], facets: ['placeType'], tree: 'parent', groups: ['placeType'] },
  feat: { cols: ['category', 'level', '@prereq', 'repeatable', 'source', 'abilityIncrease'], facets: ['category', '@takeable', 'repeatable', 'source'] },
  background: { cols: ['originFeat', 'skillProfs', 'toolProfs', 'abilityIncrease'] },
  // Subraces under their main race.
  race: { cols: ['size', 'creatureType', '@speed', 'abilityIncrease'], tree: 'parent' },
  // the pantheon: what a deity table in a sourcebook shows
  deity: { cols: ['epithet', 'rank', 'domains', 'portfolio', 'alignment', 'plane', 'worshippers', 'symbol'], facets: ['rank', 'domains', 'alignment'], groups: ['rank', 'plane'] },
  creature: { cols: ['creatureType', '@cr'], facets: ['creatureType'] },
  item: { cols: ['kind', 'subtype', 'rarity', 'magical', 'value'], facets: ['kind', 'rarity', 'magical'] },
  spell: { cols: ['level', 'school', 'castingTime', 'spellType', 'classes'], facets: ['level', 'school', 'classes'] },
  event: { cols: ['date', 'category', 'places'], facets: ['category'] },
  campaign: { cols: ['status'] },
  session: { cols: ['campaign', '@sessionNo', 'date'], facets: ['campaign'], sort: { key: '@sessionNo', dir: 1 } },
  encounter: { cols: ['campaign', 'session', 'location'], facets: ['campaign'] },
  writing: { cols: ['writingType', 'category', 'author'], facets: ['writingType'] },
  note: { cols: ['category', 'campaign'] },
  class: { cols: ['class'] },
  subclass: { cols: ['class'], facets: ['class'] },
}
const cfg = computed(() => COLS[props.type] ?? { cols: [] })
const rows = computed(() => byType.value.get(props.type) ?? [])
</script>

<template>
  <div class="list-view">
    <header class="list-head">
      <h1><span class="icon"><TypeIcon :type="type" /></span>{{ def.plural }} <span class="count">{{ rows.length }}</span></h1>
      <button class="primary" @click="newEntry(type)">＋ New {{ typeWord(type) }}</button>
    </header>
    <DataTable :key="type" :rows="rows" :cols="cfg.cols" :facets="cfg.facets" :sort="cfg.sort" :tree="cfg.tree" :groups="cfg.groups" :type="type" />
  </div>
</template>
