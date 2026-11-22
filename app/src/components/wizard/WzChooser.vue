<script setup lang="ts">
// The character creator's way of choosing: a narrow list on the left (one line each, a short fact beside the name)
// and, beside it, the details of the one looked at, so what's being chosen reads without scrolling. Clicking a row
// looks at it and picks it (the step decides what picking means: one choice, several, toggling); the arrow keys move
// through the list just looking, Enter or Space picks. The list stays in place while the details scroll.
//   items   rows: id, label, hint (the short fact), group (a heading above the rows of the group), mark (✓ text)
//   picked  what's picked (one id or several): marked in the list
//   top     slot above the list (the level, a filter); `detail` slot: the item looked at
//   need    still to pick here: the list is marked (accent outline), with `needText` as its tag
// Nothing is looked at until a row is clicked (or picked before): the details side says how to choose instead.
import { computed, nextTick, ref, watch } from 'vue'

/** `off`: can't be taken now (its prerequisite): shown dimmed, the reason in `hint`. */
export interface ChooserItem { id: string; label: string; hint?: string; group?: string; mark?: string; title?: string; off?: boolean }
const props = defineProps<{ items: ChooserItem[]; picked?: string | string[] | null; label: string; empty?: string; need?: boolean; needText?: string; intro?: string }>()
const emit = defineEmits<{ pick: [id: string] }>()

const isPicked = (id: string) => (Array.isArray(props.picked) ? props.picked.includes(id) : props.picked === id)
/** The one looked at: the last clicked or moved to; else the (first) picked one; else none. */
const looked = ref<string | undefined>(Array.isArray(props.picked) ? props.picked[0] : props.picked ?? undefined)
const shown = computed(() => props.items.find(x => x.id === looked.value) ?? props.items.find(x => isPicked(x.id)))
/** The row looked at is marked once something is looked at or picked: before that, nothing looks chosen. */
const marked = computed(() => !!looked.value || props.items.some(x => isPicked(x.id)))
// another single choice picked elsewhere (or reset): look at it
watch(() => props.picked, p => { if (typeof p === 'string' && p) looked.value = p })

const list = ref<HTMLElement | null>(null)
function click(x: ChooserItem) { looked.value = x.id; emit('pick', x.id) }
async function move(by: number) {
  const i = props.items.findIndex(x => x.id === shown.value?.id)
  const next = props.items[i < 0 ? 0 : Math.max(0, Math.min(props.items.length - 1, i + by))]
  if (!next) return
  looked.value = next.id
  await nextTick()
  // keep the row in view by scrolling the list only (not the page)
  const l = list.value, row = l?.querySelector<HTMLElement>(`[data-id="${CSS.escape(next.id)}"]`)
  if (l && row) {
    const top = row.offsetTop, bottom = top + row.offsetHeight // the list is the rows' offset parent
    if (top < l.scrollTop) l.scrollTop = top - 4
    else if (bottom > l.scrollTop + l.clientHeight) l.scrollTop = bottom - l.clientHeight + 4
  }
}
function key(ev: KeyboardEvent) {
  if (ev.key === 'ArrowDown') { ev.preventDefault(); void move(1) }
  else if (ev.key === 'ArrowUp') { ev.preventDefault(); void move(-1) }
  else if ((ev.key === 'Enter' || ev.key === ' ') && shown.value) { ev.preventDefault(); emit('pick', shown.value.id) }
}
/** Rows with a group heading where a new group starts. */
const rows = computed(() => props.items.map((x, i) => ({ x, head: x.group && x.group !== props.items[i - 1]?.group ? x.group : '' })))
</script>

<template>
  <div class="wz-chooser">
    <div class="wz-ch-side">
      <slot name="top" />
      <span v-if="need" class="wz-left wz-ch-left">{{ needText ?? 'Pick one' }}</span>
      <div ref="list" class="wz-ch-list" :class="{ 'wz-todo': need }" role="listbox" tabindex="0" :aria-label="label" :aria-activedescendant="shown ? `wzc-${shown.id}` : undefined" @keydown="key">
        <template v-for="{ x, head } in rows" :key="x.id">
          <div v-if="head" class="wz-ch-group">{{ head }}</div>
          <div :id="`wzc-${x.id}`" :data-id="x.id" class="wz-ch-row" role="option" :aria-selected="isPicked(x.id)" :title="x.title"
               :class="{ on: isPicked(x.id), shown: shown?.id === x.id && marked, off: x.off && !isPicked(x.id) }" @click="click(x)">
            <span class="wz-ch-tick" aria-hidden="true">{{ isPicked(x.id) ? '✓' : '' }}</span>
            <span class="wz-ch-label">{{ x.label }}<small v-if="x.mark" class="wz-ch-mark">{{ x.mark }}</small></span>
            <small v-if="x.hint" class="wz-ch-hint">{{ x.hint }}</small>
          </div>
        </template>
        <p v-if="!items.length" class="muted small wz-ch-empty">{{ empty ?? 'Nothing to choose from.' }}</p>
      </div>
    </div>
    <div class="wz-ch-detail">
      <slot v-if="shown" name="detail" :item="shown" :picked="isPicked(shown.id)" />
      <div v-else class="wz-ch-intro">
        <p>{{ intro ?? `Click one on the left to see it here: clicking takes it, and you can change it as often as you like.` }}</p>
        <p class="muted small">Or use the arrow keys in the list to look through them, and Enter to take one.</p>
      </div>
    </div>
  </div>
</template>
