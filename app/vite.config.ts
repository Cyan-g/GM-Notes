import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const DATA = path.resolve(import.meta.dirname, '../data')

// Dev only: serve and save the data folder's pictures and files over HTTP, so the pages can be tested in a
// browser. The desktop app talks to the folder directly.
function devData(): Plugin {
  return {
    name: 'dev-data',
    configureServer(server) {
      server.middlewares.use('/__data', (req, res) => {
        const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '')
        const file = path.resolve(DATA, rel)
        if (!file.startsWith(DATA)) { res.statusCode = 403; return res.end() }
        if (req.method === 'GET') {
          if (rel.endsWith('/') || rel === '') {
            if (!fs.existsSync(file)) { res.setHeader('content-type', 'application/json'); return res.end('[]') }
            res.setHeader('content-type', 'application/json')
            return res.end(JSON.stringify(fs.readdirSync(file)))
          }
          if (!fs.existsSync(file)) { res.statusCode = 404; return res.end() }
          // Read in one go: a stream left open by a cut-off request keeps the file locked on Windows, and then
          // the app in the browser can no longer replace it when saving.
          return res.end(fs.readFileSync(file))
        }
        if (req.method === 'PUT') {
          const chunks: Buffer[] = []
          req.on('data', c => chunks.push(c))
          req.on('end', () => {
            fs.mkdirSync(path.dirname(file), { recursive: true })
            fs.writeFileSync(file + '.tmp', Buffer.concat(chunks))
            fs.renameSync(file + '.tmp', file)
            res.end('ok')
          })
          return
        }
        if (req.method === 'DELETE') {
          if (fs.existsSync(file)) fs.unlinkSync(file)
          return res.end('ok')
        }
        res.statusCode = 405; res.end()
      })
    },
  }
}

// Dev only: the world's database for the app in the browser, through the same code the desktop app uses
// (electron/db.cjs). Read-only unless the page was opened with `?write` (it then sends x-dndesk-write).
function devDb(): Plugin {
  const require = createRequire(import.meta.url)
  const { WorldDb } = require('./electron/db.cjs')
  let ro: any = null, rw: any = null
  const open = (write: boolean) => {
    if (!WorldDb.exists(DATA)) return null
    if (write) { ro?.close(); ro = null; return (rw ??= new WorldDb(DATA)) }
    return rw ?? (ro ??= new WorldDb(DATA, { readOnly: true }))
  }
  return {
    name: 'dev-db',
    configureServer(server) {
      server.middlewares.use('/__db', (req, res) => {
        const method = (req.url || '').replace(/^\/+/, '').split('?')[0]
        const write = req.headers['x-dndesk-write'] === '1'
        const chunks: Buffer[] = []
        req.on('data', c => chunks.push(c))
        req.on('end', () => {
          res.setHeader('content-type', 'application/json')
          try {
            const args = JSON.parse(Buffer.concat(chunks).toString() || '[]')
            const w = open(write || method === 'create')
            let result: unknown
            if (method === 'load') result = w ? { ...(write && w.allow(args[0], args[1]), w.load()) } : { empty: true }
            else if (!w) throw new Error('There is no dndesk.sqlite in the data folder.')
            else if (method === 'history') result = w.history(args[0])
            else if (method === 'deleted') result = w.deleted()
            else if (!write) throw new Error('The dev server is read-only; add ?write to the address.')
            else if (method === 'save') result = w.save(args[0])
            else if (method === 'create') result = w.create(args[0], args[1], args[2])
            else if (method === 'copyTo') { w.copyTo(path.resolve(DATA, args[1])); result = true }
            else throw new Error(`Unknown call ${method}`)
            res.end(JSON.stringify({ result }))
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: (e as Error).message }))
          }
        })
      })
    },
  }
}

// Built pages only (the dev server needs its own scripts): a content security policy, so even HTML that got past the
// cleaning of entry text (markdown.ts) can't run code. Scripts only from the app's own files (no inline ones, no
// onerror=…), no frames or plugins; pictures also from data: and blob: URLs (the data folder's) and the web.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:",
  "font-src 'self' data:", "media-src 'self' data: blob:", "connect-src 'self' data: blob:",
  "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ')
function csp(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: html => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  }
}

export default defineConfig({
  plugins: [vue(), devData(), devDb(), csp()],
  // The desktop app loads the built pages from files, so their links must be relative.
  base: './',
  server: { port: 5199 },
})
