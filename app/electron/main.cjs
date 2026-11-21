// GM Notes as a desktop app: one window showing the same pages as index.html, but reading and writing the
// data folder directly (no browser permission). The folder is picked once and remembered.
// Windows installs updates by itself; the Mac app (unsigned) is told about new versions and links to them.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const crypto = require('node:crypto')
const path = require('node:path')
const { WorldDb, convertFromJson } = require('./db.cjs')
const { createLive } = require('./live.cjs')

const REPO = { owner: 'Cyan-g', repo: 'GM-Notes' }
const RELEASES = `https://github.com/${REPO.owner}/${REPO.repo}/releases/latest`

// ---------- remembered settings ----------

const configFile = () => path.join(app.getPath('userData'), 'config.json')
/** The app was called DnDesk: its remembered settings (data folder, worlds) are copied once into GM Notes' folder. */
function carryOverSettings() {
  try {
    const old = path.join(app.getPath('appData'), 'DnDesk', 'config.json')
    if (!fs.existsSync(configFile()) && fs.existsSync(old)) {
      fs.mkdirSync(path.dirname(configFile()), { recursive: true })
      fs.copyFileSync(old, configFile())
    }
  } catch { /* the app then asks for the data folder */ }
}
carryOverSettings()
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')) } catch { return {} }
}
function writeConfig(c) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(c, null, 1))
}
let config = {}

/** The folders the pages may use: the data folder and the folder backups are copied to. */
const ROOTS = { data: 'dataDir', backup: 'backupDir' }
function rootDir(root) {
  // Publishing: <the shared folder chosen for this world>/<world id>. Following: <shared folder>/<followed world id>.
  if (root === 'publish') {
    const id = openWorld().setting('worldId')
    const base = config.publishDirs?.[id]
    if (!base) throw new Error('No shared folder chosen for publishing yet')
    return path.join(base, id)
  }
  if (root === 'shared') {
    const f = followOf(config.dataDir)
    if (!f) throw new Error('This world follows no shared world')
    if (!f.folder) throw new Error("Your DM's live session isn't on this network right now. The world updates when they host again.")
    return path.join(f.folder, f.worldId)
  }
  // What a live session serves: the last "Send now" of this world, kept in the app's own folder.
  if (root === 'live') return path.join(app.getPath('userData'), 'live', openWorld().setting('worldId'))
  const key = ROOTS[root]
  if (!key) throw new Error(`Unknown folder "${root}"`)
  const dir = config[key]
  if (!dir) throw new Error(`No ${root} folder chosen yet`)
  return dir
}
/** A path inside a root folder; anything that would lead outside it is refused. */
function inside(root, rel) {
  const dir = path.resolve(rootDir(root))
  const full = path.resolve(dir, String(rel || ''))
  if (full !== dir && !full.startsWith(dir + path.sep)) throw new Error('Path outside the folder')
  return full
}

// ---------- file access for the pages ----------

ipcMain.handle('fs:read', async (_e, root, rel) => {
  // A followed world comes from the DM's live session while it can be reached, else from the shared folder.
  if (root === 'shared') { const b = await live.read(String(rel)); if (b !== undefined) return b }
  const f = inside(root, rel)
  try { return fs.readFileSync(f) } catch (err) { if (err.code === 'ENOENT') return null; throw err }
})
ipcMain.handle('fs:write', async (_e, root, rel, bytes) => {
  const f = inside(root, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  // Written to a temporary file first and then swapped in, so a crash or a full disk never leaves half a file.
  const tmp = `${f}.${process.pid}.tmp`
  fs.writeFileSync(tmp, Buffer.from(bytes))
  // A virus scanner or sync tool briefly holding the old file makes the swap fail on Windows: try a few times.
  for (let attempt = 1; ; attempt++) {
    try { fs.renameSync(tmp, f); return true } catch (err) {
      if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) { try { fs.unlinkSync(tmp) } catch {} throw err }
      await new Promise(r => setTimeout(r, 200 * attempt))
    }
  }
})
ipcMain.handle('fs:list', (_e, root, rel) => {
  try { return fs.readdirSync(inside(root, rel)) } catch { return [] }
})
ipcMain.handle('fs:remove', (_e, root, rel) => {
  try { fs.unlinkSync(inside(root, rel)) } catch {}
  return true
})

// ---------- the world's database (data/dndesk.sqlite) ----------

/**
 * Copy the database (a backup) in a worker thread with its own read-only connection, so a slow drive (a USB stick)
 * never freezes the window while the copy is written. SQLite's VACUUM INTO makes a complete, consistent copy.
 */
const { Worker } = require('node:worker_threads')
const COPY_WORKER = `
  const { DatabaseSync } = require('node:sqlite')
  const { workerData: w, parentPort } = require('node:worker_threads')
  try { const db = new DatabaseSync(w.src, { readOnly: true }); db.prepare('VACUUM INTO ?').run(w.dest); db.close(); parentPort.postMessage({ ok: true }) }
  catch (e) { parentPort.postMessage({ ok: false, error: e.message }) }`
function copyInWorker(dest) {
  const src = path.join(rootDir('data'), 'dndesk.sqlite')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (fs.existsSync(dest)) fs.unlinkSync(dest)
  return new Promise((ok, fail) => {
    const w = new Worker(COPY_WORKER, { eval: true, workerData: { src, dest } })
    w.once('message', m => (m.ok ? ok() : fail(new Error(m.error))))
    w.once('error', fail)
  })
}

/** Slow database work is written to slow.log in the app's settings folder, to find what made the window hang. */
function timed(name, fn) {
  return async (...args) => {
    const t = Date.now()
    try { return await fn(...args) } finally {
      const ms = Date.now() - t
      if (ms > 250) { try { fs.appendFileSync(path.join(app.getPath('userData'), 'slow.log'), `${new Date().toISOString()} ${name} ${ms} ms
`) } catch {} }
    }
  }
}
const handleTimed = (channel, fn) => ipcMain.handle(channel, timed(channel, fn))

let world = null
function openWorld() {
  if (!world) world = new WorldDb(rootDir('data'))
  return world
}
function closeWorld() { live.stopAll(); world?.close(); world = null }
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}` }

/**
 * Load the world. A data folder from before the database (eldoria.json) is converted first; the JSON files stay.
 * An empty folder answers { empty: true }, so the app can offer to start a new world there.
 */
handleTimed('db:load', (_e, types, kinds) => {
  const dir = rootDir('data')
  let converted
  if (!WorldDb.exists(dir)) {
    if (!fs.existsSync(path.join(dir, 'eldoria.json'))) return { empty: true }
    converted = convertFromJson(dir, types, kinds)
  }
  const w = openWorld()
  w.allow(types, kinds)
  const loaded = w.load()
  return { ...loaded, converted, ...identify(w, loaded.data?.meta?.title) }
})
handleTimed('db:create', (_e, d, types, kinds) => openWorld().create(d, types, kinds))
handleTimed('db:save', (_e, changes) => {
  const rev = openWorld().save(changes)
  // A renamed world is renamed in the list of worlds too.
  if (changes?.meta?.title) {
    const id = openWorld().setting('worldId')
    const known = (config.worlds ?? []).find(x => x.id === id && same(x.dir, rootDir('data')))
    if (known && known.title !== changes.meta.title) { known.title = changes.meta.title; writeConfig(config) }
  }
  return rev
})

// ---------- worlds: each in its own folder, with a permanent ID; the app keeps a list of them ----------

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
function remember(id, title, dir) {
  const rest = (config.worlds ?? []).filter(x => !same(x.dir, dir))
  config.worlds = [{ id, title: title || path.basename(dir), dir, opened: new Date().toISOString() }, ...rest]
  writeConfig(config)
}
/**
 * The open world's ID (made once, when it has none) and whether it looks like a copy: the same ID in another
 * folder that still holds a world. A world found in a new folder whose old one is gone simply moved.
 */
function identify(w, title) {
  const dir = rootDir('data')
  let worldId = w.setting('worldId')
  if (!worldId) { worldId = crypto.randomUUID(); w.setSetting('worldId', worldId) }
  const other = (config.worlds ?? []).find(x => x.id === worldId && !same(x.dir, dir))
  if (other && WorldDb.exists(other.dir)) return { worldId, copyOf: { title: other.title, dir: other.dir } }
  if (other) config.worlds = config.worlds.filter(x => x !== other)
  remember(worldId, title, dir)
  return { worldId }
}
// ---------- sharing through a shared folder (e.g. Google Drive): publish on the DM's side, follow on a player's ----------

const followOf = dir => (dir ? Object.entries(config.follow ?? {}).find(([d]) => same(d, dir))?.[1] : undefined)
/** The shared folder this world publishes to, if one was chosen. */
// ---------- cards: the page's print layout as a PDF, saved where the user says, then opened ----------
ipcMain.handle('cards:pdf', async (e, pageSize, name) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const pdf = await e.sender.printToPDF({ pageSize: pageSize === 'Letter' ? 'Letter' : 'A4', printBackground: true, preferCSSPageSize: false, margins: { marginType: 'none' } })
  const safe = String(name || 'Cards').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Cards'
  const r = await dialog.showSaveDialog(win, { title: 'Save the cards', defaultPath: path.join(app.getPath('documents'), `${safe}.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (r.canceled || !r.filePath) return null
  fs.writeFileSync(r.filePath, pdf)
  shell.openPath(r.filePath)
  return r.filePath
})

ipcMain.handle('publish:folder', () => config.publishDirs?.[openWorld().setting('worldId')] ?? null)
ipcMain.handle('publish:pick', async e => {
  const id = openWorld().setting('worldId')
  const win = BrowserWindow.fromWebContents(e.sender)
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose the shared folder to publish to (e.g. a Google Drive folder shared with your players)',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: config.publishDirs?.[id] || undefined,
  })
  if (r.canceled || !r.filePaths[0]) return null
  config.publishDirs = { ...(config.publishDirs ?? {}), [id]: r.filePaths[0] }
  writeConfig(config)
  return r.filePaths[0]
})
/** The worlds published in a folder: each a subfolder named by its ID with a world.json. */
function scanShared(folder) {
  const out = []
  for (const name of (() => { try { return fs.readdirSync(folder) } catch { return [] } })()) {
    try {
      const w = JSON.parse(fs.readFileSync(path.join(folder, name, 'world.json'), 'utf8'))
      if (w?.format === 'dndesk-publish' && w.worldId === name) out.push({ worldId: w.worldId, title: w.title, published: w.published, dataVersion: w.dataVersion })
    } catch {}
  }
  return out
}
/** Pick a shared folder and list the worlds published in it (to join one). */
ipcMain.handle('shared:scan', async e => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose the shared folder your DM publishes to',
    properties: ['openDirectory'],
    defaultPath: config.lastShared || undefined,
  })
  if (r.canceled || !r.filePaths[0]) return null
  config.lastShared = r.filePaths[0]
  writeConfig(config)
  return { folder: r.filePaths[0], worlds: scanShared(r.filePaths[0]) }
})
/** The open world follows this published world from now on. */
/** The open world follows this published world from now on: through a shared folder, a live session, or both. */
ipcMain.handle('shared:follow', (_e, folder, worldId, liveCfg) => {
  const before = followOf(config.dataDir)
  const keep = before?.worldId === worldId ? before : {}
  const next = { ...keep, worldId, ...(folder ? { folder } : {}), ...(liveCfg ? { live: { host: liveCfg.host, port: liveCfg.port, code: liveCfg.code } } : {}) }
  const rest = Object.fromEntries(Object.entries(config.follow ?? {}).filter(([d]) => !same(d, config.dataDir)))
  config.follow = { ...rest, [config.dataDir]: next }
  writeConfig(config)
  return true
})

// ---------- live sessions on the local network (live.cjs) ----------

const live = createLive({
  send: (channel, data) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, data) },
  saveLiveHost: (host, port) => {
    const f = followOf(config.dataDir)
    if (f?.live && (f.live.host !== host || f.live.port !== port)) { f.live.host = host; f.live.port = port; writeConfig(config) }
  },
})
/** The open world's code for live sessions: made once, kept until "New code". */
function liveCode(renew = false) {
  const id = openWorld().setting('worldId')
  if (renew || !config.liveCodes?.[id]) { config.liveCodes = { ...(config.liveCodes ?? {}), [id]: live.newCode() }; writeConfig(config) }
  return config.liveCodes[id]
}
ipcMain.handle('live:host-status', () => live.hostStatus())
ipcMain.handle('live:host-start', (_e, title) => live.startHost({ worldId: openWorld().setting('worldId'), title: String(title ?? ''), dir: rootDir('live'), code: liveCode() }))
ipcMain.handle('live:host-stop', () => { live.stopHost(); return true })
ipcMain.handle('live:new-code', () => { const c = liveCode(true); live.changeCode(c); return c })
ipcMain.handle('live:sent', () => { live.sent(); return true })
ipcMain.handle('live:discover', () => live.discover())
/** Check a code with a session: found by discovery ({ host, port }) or typed ("192.168.1.20[:47100]"). */
ipcMain.handle('live:check', (_e, target, code) => {
  const t = typeof target === 'string' ? live.parseAddress(target) : target
  if (!t) return { error: "That doesn't look like an address (e.g. 192.168.1.20)." }
  return live.check(t, code).then(r => (r.ok ? { ...r, host: t.host, port: t.port } : r))
})
/** Keep in touch with the followed world's live session, if it has one (`who`: the name the DM sees). */
ipcMain.handle('live:follow', (_e, who) => {
  const f = followOf(config.dataDir)
  if (f?.live) live.followLive({ worldId: f.worldId, ...f.live, who: String(who ?? '') }); else live.stopPlayer()
  return live.playerStatus()
})
ipcMain.handle('live:player-status', () => live.playerStatus())
ipcMain.handle('shared:get', () => followOf(config.dataDir) ?? null)

/** The known worlds, last opened first, with whether their folder still holds a world. */
ipcMain.handle('worlds:list', () => {
  const current = config.dataDir
  return {
    current,
    worldsDir: appWorldsDir(),
    worlds: (config.worlds ?? []).map(x => ({ ...x, exists: WorldDb.exists(x.dir), current: !!current && same(x.dir, current), inApp: inAppWorlds(x.dir) })),
  }
})
/**
 * Move a world into the app's worlds folder: copied there (pictures, files and backups too), checked, and the app
 * switched to the copy; the old folder is renamed "… (moved to GM Notes)", not deleted, so nothing is lost if
 * something went wrong. Returns the new folder.
 */
ipcMain.handle('worlds:move', (_e, dir) => {
  if (!dir || !WorldDb.exists(dir)) throw new Error('There is no world in that folder.')
  if (inAppWorlds(dir)) return dir
  const known = (config.worlds ?? []).find(x => same(x.dir, dir))
  const to = freeWorldDir(known?.title || path.basename(path.resolve(dir)))
  const wasOpen = !!config.dataDir && same(config.dataDir, dir)
  if (wasOpen) closeWorld()
  fs.cpSync(dir, to, { recursive: true, errorOnExist: true, preserveTimestamps: true })
  if (!WorldDb.exists(to)) throw new Error('The copy has no world in it; the world stays where it was.')
  const db = path.join(dir, 'dndesk.sqlite'), copy = path.join(to, 'dndesk.sqlite')
  if (fs.existsSync(db) && fs.statSync(db).size !== fs.statSync(copy).size) throw new Error('The copy differs from the world; it stays where it was.')
  const moveIn = p => (p && (same(p, dir) || path.resolve(p).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep)) ? path.join(to, path.relative(dir, p)) : p)
  config.worlds = (config.worlds ?? []).map(x => (same(x.dir, dir) ? { ...x, dir: to } : x))
  if (wasOpen) config.dataDir = to
  config.backupDir = moveIn(config.backupDir)
  if (config.follow) config.follow = Object.fromEntries(Object.entries(config.follow).map(([d, f]) => [same(d, dir) ? to : d, f]))
  config.worldsDir = appWorldsDir()
  writeConfig(config)
  let old = `${dir} (moved to GM Notes)`
  for (let n = 2; fs.existsSync(old); n++) old = `${dir} (moved to GM Notes ${n})`
  try { fs.renameSync(dir, old) } catch { /* in use: it stays as it is; the app uses the copy now */ }
  return to
})
/** Open another world (the pages reload afterwards). */
ipcMain.handle('worlds:switch', (_e, dir) => {
  if (!dir || !WorldDb.exists(dir)) throw new Error('There is no world in that folder any more.')
  closeWorld()
  config.dataDir = dir
  writeConfig(config)
  return true
})
/** Take a world off the list. Its folder and data stay where they are. */
ipcMain.handle('worlds:forget', (_e, dir) => {
  config.worlds = (config.worlds ?? []).filter(x => !same(x.dir, dir))
  writeConfig(config)
  return true
})
/** Where worlds live: the app's own folder (%APPDATA%\gm-notes\Worlds), so nobody has to keep track of a folder. */
const appWorldsDir = () => path.join(app.getPath('userData'), 'Worlds')
/** A free folder for a world called `name` in the app's worlds folder. */
function freeWorldDir(name) {
  const root = appWorldsDir()
  fs.mkdirSync(root, { recursive: true })
  const base = String(name || 'New world').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim() || 'New world'
  let dir = path.join(root, base)
  for (let n = 2; fs.existsSync(dir); n++) dir = path.join(root, `${base} ${n}`)
  return dir
}
const inAppWorlds = dir => !!dir && path.resolve(dir).toLowerCase().startsWith(path.resolve(appWorldsDir()).toLowerCase() + path.sep)
/** Make the folder for a new world in the app's worlds folder and switch to it; the pages then start the world there. */
ipcMain.handle('worlds:create', async (_e, name) => {
  const dir = freeWorldDir(name)
  config.worldsDir = appWorldsDir()
  fs.mkdirSync(dir, { recursive: true })
  closeWorld()
  config.dataDir = dir
  writeConfig(config)
  return dir
})
/** The open world is a copy: give it its own ID, so it's a world of its own. */
ipcMain.handle('worlds:new-id', (_e, title) => {
  const w = openWorld()
  const worldId = crypto.randomUUID()
  w.setSetting('worldId', worldId)
  remember(worldId, title, rootDir('data'))
  return worldId
})
/** The open world is the same world, moved: the list forgets its old folder. */
ipcMain.handle('worlds:moved', (_e, title) => {
  const worldId = openWorld().setting('worldId')
  config.worlds = (config.worlds ?? []).filter(x => x.id !== worldId)
  remember(worldId, title, rootDir('data'))
  return true
})
handleTimed('db:history', (_e, id) => openWorld().history(id))
handleTimed('db:deleted', () => openWorld().deleted())
/** A copy of the database: an automatic backup in data/backups, or into the backup folder. */
handleTimed('db:copy-to', async (_e, root, rel) => { await copyInWorker(inside(root, rel)); return true })
/** Go back to a backup: the current database is kept as a backup first, then replaced. */
handleTimed('db:restore', (_e, name) => {
  const dir = rootDir('data')
  const src = inside('data', `backups/${name}`)
  if (!fs.existsSync(src)) throw new Error(`No backup called ${name}`)
  // The backup must be a sound database before anything is replaced.
  const { DatabaseSync } = require('node:sqlite')
  const test = new DatabaseSync(src, { readOnly: true })
  try { if (test.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error(`${name} is damaged`) } finally { test.close() }
  openWorld().copyTo(inside('data', `backups/before-restore-${stamp()}.sqlite`))
  closeWorld()
  fs.copyFileSync(src, path.join(dir, 'dndesk.sqlite'))
  return true
})

// ---------- choosing folders ----------

ipcMain.handle('folder:get', (_e, root) => {
  const dir = config[ROOTS[root]]
  return dir && fs.existsSync(dir) ? dir : null
})
/**
 * Pick a folder with the system dialog. For the data folder, picking the folder that holds `data`
 * (the app's folder on the stick) works too.
 */
ipcMain.handle('folder:pick', async (e, root) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  const r = await dialog.showOpenDialog(win, {
    title: root === 'data' ? 'Choose the data folder' : 'Choose where to copy backups',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: config[ROOTS[root]] || undefined,
  })
  if (r.canceled || !r.filePaths[0]) return null
  let dir = r.filePaths[0]
  // Picking the folder that holds data/ means data/ itself.
  const world = d => WorldDb.exists(d) || fs.existsSync(path.join(d, 'eldoria.json'))
  if (root === 'data' && !world(dir) && world(path.join(dir, 'data'))) dir = path.join(dir, 'data')
  if (root === 'data') closeWorld()
  config[ROOTS[root]] = dir
  writeConfig(config)
  return dir
})

// ---------- about the app, links ----------

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged }))
ipcMain.handle('app:open', (_e, url) => {
  if (/^https:\/\//.test(String(url))) shell.openExternal(url)
  return true
})
ipcMain.handle('app:show-folder', (_e, root) => { try { shell.openPath(rootDir(root)) } catch {} return true })

// ---------- updates ----------

/** "1.2.10" > "1.2.9" */
const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  return false
}
let updater = null
function checkForUpdates(win) {
  if (!app.isPackaged) return
  const tell = info => win.webContents.send('update', info)
  if (process.platform === 'win32') {
    // Windows: download in the background (the window shows how far it got), then offer a restart.
    updater = require('electron-updater').autoUpdater
    updater.autoDownload = true
    let version = '', percent = -1
    updater.on('update-available', i => { version = i.version; percent = 0; tell({ state: 'downloading', version, percent }) })
    updater.on('download-progress', p => {
      const n = Math.floor(p.percent)
      if (version && n !== percent) { percent = n; tell({ state: 'downloading', version, percent }) }
    })
    updater.on('update-downloaded', i => { version = ''; tell({ state: 'ready', version: i.version }) })
    // Offline, or the releases aren't public yet: only said when a download had started (it's tried again next time).
    updater.on('error', () => { if (version) tell({ state: 'failed', version }); version = '' })
    updater.checkForUpdates().catch(() => {})
  } else {
    // Mac (unsigned, so it can't install updates itself): look at the latest release and point to it.
    fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`, { headers: { 'User-Agent': 'GM Notes' } })
      .then(r => (r.ok ? r.json() : null))
      .then(rel => { if (rel?.tag_name && newer(rel.tag_name, app.getVersion())) tell({ state: 'available', version: rel.tag_name.replace(/^v/, ''), url: rel.html_url || RELEASES }) })
      .catch(() => {})
  }
}
ipcMain.handle('update:install', () => { updater?.quitAndInstall(); return true })

// ---------- the window ----------

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 720, minHeight: 500,
    title: 'GM Notes',
    backgroundColor: '#17120e',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  // Links to web pages open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('file:')) { ev.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url) } })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  win.webContents.once('did-finish-load', () => checkForUpdates(win))
  return win
}

// One copy at a time: a second start brings the open window to the front instead (two would overwrite each other).
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus() } })
  app.whenReady().then(() => {
    config = readConfig()
    // The Mac keeps its standard menu (copy, paste, quit); Windows needs none, the app has its own.
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
    createWindow()
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
  })
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', closeWorld)
}
