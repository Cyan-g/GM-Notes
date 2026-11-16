import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'node:fs'
import path from 'node:path'

const DATA = path.resolve(__dirname, '../data')

// Dev only: serve and save the data folder over HTTP, so the app can be tested
// without the browser's folder picker. The built app talks to the folder directly.
function devData(): Plugin {
  return {
    name: 'dev-data',
    configureServer(server) {
      server.middlewares.use('/__data', (req, res) => {
        const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '')
        const file = path.resolve(DATA, rel)
        if (!file.startsWith(DATA)) { res.statusCode = 403; return res.end() }
        if (req.method === 'GET') {
          if ((req.url || '').includes('?stat')) {
            if (!fs.existsSync(file)) { res.statusCode = 404; return res.end() }
            const st = fs.statSync(file)
            res.setHeader('content-type', 'application/json')
            return res.end(JSON.stringify({ modified: Math.round(st.mtimeMs), size: st.size }))
          }
          if (rel.endsWith('/') || rel === '') {
            if (!fs.existsSync(file)) { res.setHeader('content-type', 'application/json'); return res.end('[]') }
            res.setHeader('content-type', 'application/json')
            return res.end(JSON.stringify(fs.readdirSync(file)))
          }
          if (!fs.existsSync(file)) { res.statusCode = 404; return res.end() }
          return fs.createReadStream(file).pipe(res)
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

// After a build, put the single-file app next to the data folder.
function copyOut(): Plugin {
  return {
    name: 'copy-out',
    apply: 'build',
    closeBundle() {
      fs.copyFileSync(path.resolve(__dirname, 'dist/index.html'), path.resolve(__dirname, '../Eldoria.html'))
    },
  }
}

export default defineConfig({
  plugins: [vue(), viteSingleFile(), devData(), copyOut()],
  server: { port: 5199 },
})
