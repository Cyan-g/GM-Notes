<script setup lang="ts">
// Where the data lives, copying it somewhere safe, and going back to an earlier version.
import { computed, onMounted, ref } from 'vue'
import { db, entries, save, state } from '../store'
import { checkDatabase } from '../validate'
import EntryLink from '../components/EntryLink.vue'
import { FolderStorage, HttpStorage, folderApiAvailable, pickBackupFolder, regrant, rememberedBackupFolder } from '../storage/storage'
import { backupTo, daysSince, listBackups, restoreBackup } from '../backup'
import { DesktopStorage, desktop, folderName } from '../storage/desktop'

const dest = ref<FileSystemDirectoryHandle | null>(null)
const progress = ref<{ done: number; total: number } | null>(null)
const message = ref('')
const error = ref('')
const backups = ref<string[]>([])

// The desktop app: folders are paths chosen with the system dialog.
const destPath = ref<string | null>(null)
const dataPath = ref<string | null>(null)
const version = ref('')
const destName = computed(() => (desktop ? (destPath.value ? folderName(destPath.value) : '') : dest.value?.name ?? ''))

onMounted(async () => {
  if (desktop) {
    destPath.value = await desktop.getFolder('backup')
    dataPath.value = await desktop.getFolder('data')
    version.value = (await desktop.info()).version
  } else dest.value = await rememberedBackupFolder()
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
    if (desktop) {
      if (choose || !destPath.value) destPath.value = await desktop.pickFolder('backup')
      if (!destPath.value) return
      const folder = await backupTo(new DesktopStorage('backup', folderName(destPath.value)), (done, total) => { progress.value = { done, total } })
      message.value = `Copied to “${folderName(destPath.value)}”, into the folder ${folder}.`
      return
    }
    let h = dest.value
    if (choose || !h) h = await pickBackupFolder()
    else if (!(await regrant(h))) h = await pickBackupFolder()
    dest.value = h
    const folder = await backupTo(new FolderStorage(h), (done, total) => { progress.value = { done, total } })
    message.value = `Copied to “${h.name}/${folder}”.`
  } catch (e) {
    if ((e as DOMException).name !== 'AbortError') error.value = (e as Error).message
  } finally {
    progress.value = null
  }
}

// Development only: back up into the data folder itself through the dev server (no folder dialog needed).
const isDev = import.meta.env.DEV
async function devBackup() {
  const folder = await backupTo(new HttpStorage(), (done, total) => { progress.value = { done, total } })
  progress.value = null
  message.value = `Dev test copy: data/${folder}`
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
          <dt>Saved</dt><dd>{{ state.saving ? 'saving…' : state.dirty ? 'unsaved changes' : state.savedAt ? new Date(state.savedAt).toLocaleTimeString() : 'nothing changed yet' }} <button v-if="state.dirty" class="link-btn" @click="save()">Save now</button></dd>
          <dt v-if="version">App</dt><dd v-if="version">DnDesk {{ version }}</dd>
          <dt>Last edit</dt><dd>{{ edited ? new Date(edited).toLocaleString() : 'none yet' }}</dd>
        </dl>
      </section>

      <section class="card" :class="{ warn: age == null || age > 7 }">
        <h3>Copy to another place</h3>
        <p class="small">The app keeps its own backups, but they're on the same stick. A copy on your PC or another drive survives losing the stick.</p>
        <p><b>Last copy:</b> {{ last ? `${new Date(last).toLocaleString()} (${age === 0 ? 'today' : age + ' days ago'})` : 'never' }}</p>
        <template v-if="desktop || folderApiAvailable()">
          <div class="row-btns">
            <button class="primary" :disabled="!!progress" @click="run(false)">{{ destName ? `Back up to “${destName}”` : 'Back up…' }}</button>
            <button v-if="destName" :disabled="!!progress" @click="run(true)">Other folder…</button>
            <button v-if="isDev" class="dev-backup" @click="devBackup">Dev test copy</button>
          </div>
          <p v-if="progress" class="small">Copying {{ progress.done }} of {{ progress.total }} files…</p>
        </template>
        <p v-else class="small muted">This browser can't write to folders. Copy the <code>data</code> folder by hand.</p>
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

    <section class="card backups-card">
      <h3>Earlier versions</h3>
      <p class="small muted">Saved automatically at most every 10 minutes while you edit. Thinned out over time: everything from the last 2 hours, then one per hour for 2 days, one per day for 2 months, and one per month after that.</p>
      <ul v-if="backups.length" class="rel">
        <li v-for="b in backups" :key="b"><span>{{ pretty(b) }}</span><button class="link-btn" :disabled="!!progress" @click="restore(b)">Go back to this</button></li>
      </ul>
      <p v-else class="muted small">None yet. They appear once you've edited something.</p>
    </section>
  </div>
</template>
