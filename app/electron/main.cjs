// DnDesk as a desktop app: one window showing the same pages as DnDesk.html, but reading and writing the
// data folder directly (no browser permission). The folder is picked once and remembered.
// Windows installs updates by itself; the Mac app (unsigned) is told about new versions and links to them.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const REPO = { owner: 'Cyan-g', repo: 'DnDesk' }
const RELEASES = `https://github.com/${REPO.owner}/${REPO.repo}/releases/latest`

// ---------- remembered settings ----------

const configFile = () => path.join(app.getPath('userData'), 'config.json')
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

ipcMain.handle('fs:read', (_e, root, rel) => {
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
  if (root === 'data' && !fs.existsSync(path.join(dir, 'eldoria.json')) && fs.existsSync(path.join(dir, 'data', 'eldoria.json'))) dir = path.join(dir, 'data')
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
    // Windows: download in the background, then offer a restart.
    updater = require('electron-updater').autoUpdater
    updater.autoDownload = true
    updater.on('update-downloaded', i => tell({ state: 'ready', version: i.version }))
    updater.on('error', () => { /* offline, or the releases aren't public yet */ })
    updater.checkForUpdates().catch(() => {})
  } else {
    // Mac (unsigned, so it can't install updates itself): look at the latest release and point to it.
    fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`, { headers: { 'User-Agent': 'DnDesk' } })
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
    title: 'DnDesk',
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
}
