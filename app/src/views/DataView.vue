<script setup lang="ts">
// Where the data lives, copying it somewhere safe, and going back to an earlier version.
import { computed, onMounted, ref } from 'vue'
import { db, entries, save, state } from '../store'
import { FolderStorage, HttpStorage, folderApiAvailable, pickBackupFolder, regrant, rememberedBackupFolder } from '../storage/storage'
import { backupTo, daysSince, listBackups, restoreBackup } from '../backup'

const dest = ref<FileSystemDirectoryHandle | null>(null)
const progress = ref<{ done: number; total: number } | null>(null)
const message = ref('')
const error = ref('')
const backups = ref<string[]>([])

onMounted(async () => {
  dest.value = await rememberedBackupFolder()
  backups.value = await listBackups()
})

const last = computed(() => db().meta.externalBackup)
const age = computed(() => daysSince(last.value))
const edited = computed(() => db().meta.edited)

async function run(choose: boolean) {
  error.value = ''
  message.value = ''
  try {
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
  const kind = n.startsWith('before-restore') ? ' (before a restore)' : n.startsWith('before-migrate') ? ' (before a migration)' : ''
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
          <dt>Folder</dt><dd>{{ state.storage?.label }}</dd>
          <dt>Entries</dt><dd>{{ entries.length }}, with {{ db().relations.length }} relations</dd>
          <dt>Saved</dt><dd>{{ state.saving ? 'saving…' : state.dirty ? 'unsaved changes' : state.savedAt ? new Date(state.savedAt).toLocaleTimeString() : 'nothing changed yet' }} <button v-if="state.dirty" class="link-btn" @click="save">Save now</button></dd>
          <dt>Last edit</dt><dd>{{ edited ? new Date(edited).toLocaleString() : 'none since the import from Obsidian' }}</dd>
        </dl>
      </section>

      <section class="card" :class="{ warn: age == null || age > 7 }">
        <h3>Copy to another place</h3>
        <p class="small">The app keeps its own backups, but they're on the same stick. A copy on your PC or another drive survives losing the stick.</p>
        <p><b>Last copy:</b> {{ last ? `${new Date(last).toLocaleString()} (${age === 0 ? 'today' : age + ' days ago'})` : 'never' }}</p>
        <template v-if="folderApiAvailable()">
          <div class="row-btns">
            <button class="primary" :disabled="!!progress" @click="run(false)">{{ dest ? `Back up to “${dest.name}”` : 'Back up…' }}</button>
            <button v-if="dest" :disabled="!!progress" @click="run(true)">Other folder…</button>
            <button v-if="isDev" class="dev-backup" @click="devBackup">Dev test copy</button>
          </div>
          <p v-if="progress" class="small">Copying {{ progress.done }} of {{ progress.total }} files…</p>
        </template>
        <p v-else class="small muted">This browser can't write to folders. Copy the <code>data</code> folder by hand.</p>
        <p v-if="message" class="small ok">{{ message }}</p>
        <p v-if="error" class="small error">{{ error }}</p>
      </section>
    </div>

    <section class="card backups-card">
      <h3>Earlier versions</h3>
      <p class="small muted">Saved automatically at most every 10 minutes while you edit; the last 40 are kept.</p>
      <ul v-if="backups.length" class="rel">
        <li v-for="b in backups" :key="b"><span>{{ pretty(b) }}</span><button class="link-btn" :disabled="!!progress" @click="restore(b)">Go back to this</button></li>
      </ul>
      <p v-else class="muted small">None yet. They appear once you've edited something.</p>
    </section>
  </div>
</template>
