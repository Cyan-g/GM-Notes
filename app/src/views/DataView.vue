<script setup lang="ts">
import { TYPES } from '../model/schema'
import { hrefEntry } from '../router'
// Where the data lives, copying it somewhere safe, and going back to an earlier version.
import { computed, onMounted, ref } from 'vue'
import { db, entries, save, state, touch } from '../store'
import type { Entry } from '../model/types'
import { checkDatabase } from '../validate'
import EntryLink from '../components/EntryLink.vue'
import { backupTo, daysSince, listBackups, restoreBackup } from '../backup'
import { DesktopStorage, desktop, folderName } from '../storage/desktop'

const progress = ref<{ done: number; total: number } | null>(null)
const message = ref('')
const error = ref('')
const backups = ref<string[]>([])

// The desktop app: folders are paths chosen with the system dialog.
const destPath = ref<string | null>(null)
const dataPath = ref<string | null>(null)
const version = ref('')
const destName = computed(() => (destPath.value ? folderName(destPath.value) : ''))

// Deleted entries the database still remembers (their last version), to bring back.
const deleted = ref<{ saved: string; entry: Entry }[]>([])
async function loadDeleted() { try { deleted.value = await state.backend!.deleted() } catch { deleted.value = [] } }
const broughtBack = ref<Entry | null>(null)
async function bringBack(d: { entry: Entry }) {
  db().entries[d.entry.id] = { ...JSON.parse(JSON.stringify(d.entry)), updated: new Date().toISOString() }
  touch()
  await save()
  await loadDeleted()
  broughtBack.value = db().entries[d.entry.id] ?? null
}

onMounted(async () => {
  loadDeleted()
  if (desktop) {
    destPath.value = await desktop.getFolder('backup')
    dataPath.value = await desktop.getFolder('data')
    version.value = (await desktop.info()).version
  }
  backups.value = await listBackups()
})

/** Desktop: open another data folder (the app starts over with it). */
async function changeDataFolder() {
  if (state.dirty) await save()
  if (await desktop!.pickFolder('data')) location.reload()
}

// The data check, run again whenever the data changes while this page is open.
const problems = computed(() => checkDatabase(db()).sort((a, b) => Number(!!b.serious) - Number(!!a.serious)))
const showAll = ref(false)
const last = computed(() => db().meta.externalBackup)
const age = computed(() => daysSince(last.value))
const edited = computed(() => db().meta.edited)

async function run(choose: boolean) {
  error.value = ''
  message.value = ''
  try {
    if (!desktop) throw new Error('Copying to another folder works in the desktop app.')
    if (choose || !destPath.value) destPath.value = await desktop.pickFolder('backup')
    if (!destPath.value) return
    const folder = await backupTo(new DesktopStorage('backup', folderName(destPath.value)), (done, total) => { progress.value = { done, total } })
    message.value = `Copied to “${folderName(destPath.value)}”, into the folder ${folder}.`
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    progress.value = null
  }
}

async function restore(name: string) {
  if (!confirm(`Go back to ${name}?\n\nEverything changed since then is replaced. The current state is kept as a backup first, so this can be undone.`)) return
  error.value = ''
  try {
    await restoreBackup(name)
    message.value = `Restored ${name}.`
    backups.value = await listBackups()
  } catch (e) { error.value = (e as Error).message }
}
const pretty = (n: string) => {
  const m = n.match(/(\d{4})-(\d\d)-(\d\d)-(\d\d)-?(\d\d)-?(\d\d)?/)
  const kind = n.startsWith('before-restore') ? ' (before a restore)' : ''
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}${kind}` : n
}
/** Links open in the browser (desktop app) or a new tab. */
const open = (url: string) => (desktop ? desktop.open(url) : window.open(url, '_blank'))
</script>

<template>
  <div class="data-view">
    <header class="list-head"><h1><span class="icon">💾</span>Data & backups</h1></header>

    <div class="home-grid">
      <section class="card">
        <h3>Your data</h3>
        <dl>
          <dt>Folder</dt>
          <dd v-if="desktop">{{ dataPath }} <button class="link-btn" @click="desktop.showFolder('data')">Show</button> <button class="link-btn" @click="changeDataFolder">Change…</button></dd>
          <dd v-else>{{ state.storage?.label }}</dd>
          <dt>Entries</dt><dd>{{ entries.length }}, with {{ db().relations.length }} relations</dd>
          <dt>Saved</dt><dd>{{ state.saving ? 'saving…' : state.dirty ? 'unsaved changes' : state.savedAt ? `all saved, ${new Date(state.savedAt).toLocaleTimeString()}` : 'all saved' }} <button v-if="state.dirty" class="link-btn" @click="save()">Save now</button></dd>
          <dt v-if="version">App</dt><dd v-if="version">GM Notes {{ version }}</dd>
          <dt>Last edit</dt><dd>{{ edited ? new Date(edited).toLocaleString() : 'none yet' }}</dd>
        </dl>
      </section>

      <section class="card" :class="{ warn: age == null || age > 7 }">
        <h3>Backup copy</h3>
        <p class="small">The app keeps its own backups, but they're on the same stick. A backup copy on your PC or another drive survives losing the stick.</p>
        <p><b>Last backup copy:</b> {{ last ? `${new Date(last).toLocaleString()} (${age === 0 ? 'today' : age + ' days ago'})` : 'never' }}</p>
        <template v-if="desktop">
          <div class="row-btns">
            <button class="primary" :disabled="!!progress" @click="run(false)">{{ destName ? `Make a backup copy in “${destName}”` : 'Make a backup copy…' }}</button>
            <button v-if="destName" :disabled="!!progress" @click="run(true)">Other folder…</button>
          </div>
          <p v-if="progress" class="small">Copying {{ progress.done }} of {{ progress.total }} files…</p>
        </template>
        <p v-else class="small muted">Copying to another folder works in the desktop app.</p>
        <p v-if="message" class="small ok">{{ message }}</p>
        <p v-if="error" class="small error">{{ error }}</p>
      </section>
    </div>

    <section class="card data-check" :class="{ warn: problems.some(p => p.serious) }">
      <h3>Data check <span class="muted small">{{ problems.length ? `${problems.length} to look at` : 'all fine' }}</span></h3>
      <p class="small muted">Every entry and relation is checked against what the app expects: known fields, values of the right kind, links to entries that exist. Nothing is changed here; fix what's listed on the entry itself.</p>
      <ul v-if="problems.length" class="rel">
        <li v-for="(p, i) in showAll ? problems : problems.slice(0, 30)" :key="i" :class="{ serious: p.serious }">
          <EntryLink v-if="p.entry && db().entries[p.entry]" :id="p.entry" :label="p.where" />
          <span v-else>{{ p.where }}</span>
          <span class="role">{{ p.message }}</span>
        </li>
      </ul>
      <button v-if="problems.length > 30 && !showAll" class="link-btn" @click="showAll = true">Show all {{ problems.length }}</button>
    </section>

    <section v-if="deleted.length" class="card">
      <h3>Deleted entries <span class="muted small">{{ deleted.length }}</span></h3>
      <p class="small muted">The last version of every deleted entry is kept. Bringing one back restores the entry; its relations have to be added again.</p>
      <p v-if="broughtBack" class="ok small">✓ <a :href="hrefEntry(broughtBack.id)">{{ broughtBack.name }}</a> is back. Add its relations again on its page.</p>
      <ul class="rel deleted-list">
        <li v-for="d in deleted" :key="d.entry.id + d.saved">
          <span>{{ d.entry.name }}</span><span class="role">{{ TYPES[d.entry.type]?.label ?? d.entry.type }}, deleted {{ new Date(d.saved).toLocaleString() }}</span>
          <button class="link-btn" :disabled="!!state.readOnly || !!db().entries[d.entry.id]" @click="bringBack(d)">Bring back</button>
        </li>
      </ul>
    </section>

    <section class="card backups-card">
      <h3>Earlier versions</h3>
      <p class="small muted">Copies of the whole database, made automatically at most every 10 minutes while you edit. Thinned out over time: everything from the last 2 hours, then one per hour for 2 days, one per day for 2 months, and one per month after that.</p>
      <ul v-if="backups.length" class="rel">
        <li v-for="b in backups" :key="b"><span>{{ pretty(b) }}</span><button class="link-btn" :disabled="!!progress" @click="restore(b)">Go back to this</button></li>
      </ul>
      <p v-else class="muted small">None yet. They appear once you've edited something.</p>
    </section>

    <p class="muted small credits">Icons from <a href="https://game-icons.net" @click.prevent="open('https://game-icons.net')">game-icons.net</a> by Lorc, Delapouite and the other game-icons.net artists, under <a href="https://creativecommons.org/licenses/by/3.0/" @click.prevent="open('https://creativecommons.org/licenses/by/3.0/')">CC BY 3.0</a>.</p>
    <p class="muted small credits">Fonts Cinzel, EB Garamond, Cormorant Garamond, IM Fell English, Uncial Antiqua, MedievalSharp, Almendra, Alegreya, Crimson Pro, Lora and Atkinson Hyperlegible, under the <a href="https://openfontlicense.org" @click.prevent="open('https://openfontlicense.org')">SIL Open Font License 1.1</a>.</p>
    <p class="muted small credits">This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" @click.prevent="open('https://www.dndbeyond.com/srd')">dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the <a href="https://creativecommons.org/licenses/by/4.0/legalcode" @click.prevent="open('https://creativecommons.org/licenses/by/4.0/legalcode')">Creative Commons Attribution 4.0 International License</a>.</p>
  </div>
</template>
