// Syncing a world with the user's other devices over the network (the merge itself happens in the window,
// src/devicesync). Every device with the world open runs a small HTTP server (TCP 47110, or the next free port up
// to 47119) and listens on UDP 47110 for other devices looking for the same world. The devices know each other
// from pairing: one shows a code, the other types it in, gets the world's sync key and a full copy of the world.
//
// Everything after pairing is sealed with the world's key (AES-256-GCM): requests carry a sealed stamp (the path and
// the time), answers are sealed. Pairing itself: the joining device fetches a salt, turns the code into a key with
// scrypt, and sends its name sealed with that; a device that can open it knows the code, and gets the world's key
// back sealed the same way. Five wrong tries end pairing; pairing ends by itself after ten minutes.
//
// Swapping changes: each device keeps an event stream open to each other device it found; "changed" on that stream
// (sent after every save) tells the window to ask for the changes after the last point it got (GET /changes).
// Pictures and files are fetched by path (GET /file), only from images/ and files/.
const http = require('node:http')
const dgram = require('node:dgram')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const PORT = 47110
const HELLO = 'gm-notes-devices'
const FILE = /^(images|files)\/[^/\\]+$/
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PAIR_MS = 10 * 60_000
/** A request's stamp may be this far off (clocks between devices differ a little). */
const STAMP_MS = 10 * 60_000
/** The most a request body may weigh (pairing sends a name). */
const MAX_BODY = 64 * 1024

const newCode = () => { const b = crypto.randomBytes(8); let s = ''; for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32]; return `${s.slice(0, 4)}-${s.slice(4)}` }
const plainCode = c => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
/** Sealed with a 32-byte key: 12 bytes IV, 16 bytes tag, the ciphertext. */
function seal(key, data) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data), 'utf8')), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body])
}
/** Open a sealed buffer (throws if the key is wrong or it was changed on the way). */
function unseal(key, buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
  d.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([d.update(buf.subarray(28)), d.final()])
}
const unsealJson = (key, buf) => JSON.parse(unseal(key, buf).toString('utf8'))
const codeKey = (code, salt) => crypto.scryptSync(plainCode(code), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })

function networks() {
  const out = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue
      const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number)
      out.push({ address: a.address, broadcast: ip.map((n, i) => (n | (~mask[i] & 255))).join('.') })
    }
  }
  return out
}
function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
function sealed(res, key, data) { res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }); res.end(seal(key, data)) }
function readBody(req) {
  return new Promise((resolve, reject) => {
    const parts = []; let size = 0
    req.on('data', d => { size += d.length; if (size > MAX_BODY) { reject(new Error('Too big')); req.destroy() } else parts.push(d) })
    req.on('end', () => resolve(Buffer.concat(parts)))
    req.on('error', reject)
  })
}
/** "192.168.1.20", "192.168.1.20:47111", "laptop.tail1234.ts.net" → { host, port }. */
function parseAddress(s) {
  const m = String(s ?? '').trim().match(/^\[?([A-Za-z0-9.\-:]+?)\]?(?::(\d{2,5}))?$/)
  return m ? { host: m[1], port: Number(m[2] || PORT) } : null
}

/**
 * @param {{
 *   send: (channel: string, data: unknown) => void,
 *   me: () => { id: string, name: string },
 *   world: () => null | { db: any, worldId: string, title: string, dir: string },
 *   pairs: () => Record<string, any>, savePairs: () => void,
 * }} hooks  send: to the window. me: this device. world: the open world. pairs: config.devices (by world ID), kept by main.cjs.
 */
function createDevices(hooks) {
  /** @type {null | { server: http.Server, udp: dgram.Socket | null, port: number, worldId: string, beat: NodeJS.Timeout, fails: Map<string, { n: number, until: number }> }} */
  let srv = null
  /** Pairing: open for a while with a code; the salt the joining device turns the code into a key with. */
  let pairing = null
  /** The other devices of the open world as found on the network (by device ID). */
  const peers = new Map()
  /** Event streams this device's server holds for the others (to tell them "changed"). */
  const streams = new Set()

  const pairOf = worldId => hooks.pairs()[worldId]
  const keyOf = worldId => { const k = pairOf(worldId)?.key; return k ? Buffer.from(k, 'base64') : null }
  const openPair = () => { const w = hooks.world(); return w ? pairOf(w.worldId) : null }

  function status() {
    const w = hooks.world(), pair = w ? pairOf(w.worldId) : null
    return {
      me: hooks.me(), port: srv?.port ?? null, addresses: networks().map(n => n.address),
      pairing: pairing ? { code: pairing.code, until: pairing.until } : null,
      devices: Object.entries(pair?.peers ?? {}).map(([id, p]) => {
        const live = peers.get(id)
        return { id, name: p.name, state: live?.state ?? 'away', host: live?.host ?? p.host ?? null, port: live?.port ?? p.port ?? null, lastSync: p.since || null, clockOff: live?.clockOff ?? 0 }
      }),
    }
  }
  const tell = () => hooks.send('devices:status', status())

  // ======================= serving the others =======================

  function authorized(req, rel) {
    const w = hooks.world()
    if (!w) return null
    const key = keyOf(w.worldId), id = String(req.headers['x-gm-device'] ?? '')
    if (!key || !pairOf(w.worldId)?.peers?.[id]) return null
    try {
      const stamp = unsealJson(key, Buffer.from(String(req.headers['x-gm-auth'] ?? ''), 'base64'))
      if (stamp.path !== rel || Math.abs(Date.now() - Number(stamp.t)) > STAMP_MS) return null
    } catch { return null }
    return { w, key, id }
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://local')
    const rel = url.pathname.slice(1) + url.search
    const ip = req.socket.remoteAddress ?? ''
    const h = srv
    if (!h) return json(res, 503, { error: 'Not running' })
    const f = h.fails.get(ip)
    if (f && f.until > Date.now()) return json(res, 429, { error: 'Too many wrong tries. Try again in a few minutes.' })
    const failed = () => { const n = (f?.n ?? 0) + 1; h.fails.set(ip, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 }) }

    // ---- pairing (no key yet) ----
    if (url.pathname === '/pair-salt') {
      if (!pairing || pairing.until < Date.now()) return json(res, 404, { error: 'This device isn\'t pairing right now.' })
      return json(res, 200, { salt: pairing.salt, title: hooks.world()?.title ?? '' })
    }
    if (url.pathname === '/pair' && req.method === 'POST') {
      const w = hooks.world()
      if (!pairing || pairing.until < Date.now() || !w) return json(res, 404, { error: 'This device isn\'t pairing right now.' })
      let who
      try { who = unsealJson(pairing.key, await readBody(req)) } catch {
        failed()
        if (++pairing.wrong >= 5) { pairing = null; tell() }
        return json(res, 401, { error: 'Wrong code.' })
      }
      if (!who?.id || typeof who.id !== 'string') return json(res, 400, { error: 'No device.' })
      const pair = pairOf(w.worldId)
      pair.peers[who.id] = { name: String(who.name ?? 'Another device').slice(0, 60), got: 0, log: '', since: new Date().toISOString(), host: ip.replace(/^::ffff:/, ''), port: Number(who.port) || PORT }
      hooks.savePairs()
      const me = hooks.me()
      sealed(res, pairing.key, { key: pair.key, worldId: w.worldId, title: w.title, device: me.id, name: me.name })
      pairing = null
      tell()
      return
    }

    // ---- everything else: a paired device of the open world ----
    const a = authorized(req, rel)
    if (!a) { failed(); return json(res, 401, { error: 'Not one of this world\'s devices.' }) }
    h.fails.delete(ip)
    // a device that asks is there: talk back to it (its server's port comes with every request)
    const back = Number(req.headers['x-gm-port'])
    if (back && peers.get(a.id)?.state !== 'connected') setTimeout(() => connect(a.id, ip.replace(/^::ffff:/, ''), back), 50)
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
      res.write(`event: hello\ndata: ${JSON.stringify({ time: Date.now(), device: hooks.me().id })}\n\n`)
      const s = { res, id: a.id }
      streams.add(s)
      req.on('close', () => streams.delete(s))
      return
    }
    if (url.pathname === '/changes') {
      const since = Number(url.searchParams.get('since')) || 0
      return sealed(res, a.key, a.w.db.changeBatch(since))
    }
    if (url.pathname === '/file') {
      const p = String(url.searchParams.get('p') ?? '')
      if (!FILE.test(p)) return json(res, 400, { error: 'Not a picture or file.' })
      return fs.readFile(path.join(a.w.dir, ...p.split('/')), (err, data) => (err ? json(res, 404, { error: 'No such file.' }) : sealed(res, a.key, data)))
    }
    if (url.pathname === '/world') {
      // a full copy for a device that just paired: the database (consistent, as of `seq`) and the pictures' paths
      const tmp = path.join(os.tmpdir(), `gm-notes-copy-${crypto.randomUUID()}.sqlite`)
      try {
        const st = a.w.db.logState()
        a.w.db.copyTo(tmp)
        const files = ['images', 'files'].flatMap(d => { try { return fs.readdirSync(path.join(a.w.dir, d)).map(n => `${d}/${n}`).filter(x => FILE.test(x)) } catch { return [] } })
        return sealed(res, a.key, { seq: st.seq, log: st.log, files, db: fs.readFileSync(tmp).toString('base64') })
      } finally { try { fs.unlinkSync(tmp) } catch {} }
    }
    json(res, 404, { error: 'Not found' })
  }

  // ======================= finding the others =======================

  function helloFor(w, extra = {}) { return Buffer.from(JSON.stringify({ t: HELLO, worldId: w.worldId, device: hooks.me().id, port: srv?.port, ...extra })) }
  function broadcast(msg) {
    if (!srv?.udp) return
    for (const t of new Set(['255.255.255.255', ...networks().map(n => n.broadcast)])) srv.udp.send(msg, PORT, t, () => {})
  }
  /** Say hello to every paired device: on the networks, and straight to the last address each was seen at. */
  function sayHello() {
    const w = hooks.world(), pair = openPair()
    if (!w || !srv?.udp || !pair || !Object.keys(pair.peers ?? {}).length) return
    const msg = helloFor(w)
    broadcast(msg)
    for (const [id, p] of Object.entries(pair.peers)) {
      if (peers.get(id)?.state === 'connected') continue
      if (p.host) srv.udp.send(msg, PORT, p.host, () => {})
      if (p.host && p.port) connect(id, p.host, p.port)
    }
  }
  function onUdp(buf, r) {
    let m
    try { m = JSON.parse(buf.toString()) } catch { return }
    if (m?.t !== HELLO) return
    const w = hooks.world()
    // "who is pairing?": answered by a device that is
    if (m.pairAsk) {
      if (pairing && pairing.until > Date.now() && w && srv) srv.udp?.send(Buffer.from(JSON.stringify({ t: HELLO, pairing: true, title: w.title, port: srv.port, name: hooks.me().name })), r.port, r.address, () => {})
      return
    }
    if (!w || m.worldId !== w.worldId || m.device === hooks.me().id || !openPair()?.peers?.[m.device]) return
    if (!m.reply) srv?.udp?.send(helloFor(w, { reply: true }), r.port, r.address, () => {})
    if (m.port) connect(m.device, r.address, Number(m.port))
  }

  // ======================= talking to the others =======================

  function request(target, rel, key, timeout = 30_000, method = 'GET', body = null) {
    const me = hooks.me()
    const headers = key ? { 'x-gm-device': me.id, 'x-gm-auth': seal(key, { path: rel, t: Date.now() }).toString('base64'), ...(srv ? { 'x-gm-port': String(srv.port) } : {}) } : {}
    if (body) { headers['content-type'] = 'application/octet-stream'; headers['content-length'] = body.length }
    return new Promise((resolve, reject) => {
      const req = http.request({ host: target.host, port: target.port, path: '/' + rel, method, headers, timeout }, res => {
        const parts = []
        res.on('data', d => parts.push(d))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(parts) }))
        res.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error('The other device didn\'t answer in time.')))
      req.on('error', reject)
      req.end(body ?? undefined)
    })
  }
  const errorOf = r => { try { return JSON.parse(r.body.toString()).error } catch { return `The other device answered ${r.status}.` } }

  /** Keep an event stream open to a paired device found at host:port. */
  function connect(id, host, port) {
    const w = hooks.world(), key = w && keyOf(w.worldId)
    if (!w || !key) return
    const known = peers.get(id)
    if (known && (known.state === 'connected' || known.state === 'connecting') && known.host === host && known.port === port) return
    known?.req?.destroy()
    const p = { state: 'connecting', host, port, req: null, clockOff: 0 }
    peers.set(id, p)
    const rel = 'events'
    const req = http.get({ host, port, path: '/' + rel, headers: { 'x-gm-device': hooks.me().id, 'x-gm-auth': seal(key, { path: rel, t: Date.now() }).toString('base64'), ...(srv ? { 'x-gm-port': String(srv.port) } : {}) } }, res => {
      if (res.statusCode !== 200) { res.resume(); p.state = 'away'; tell(); return }
      p.state = 'connected'
      const pair = openPair(), saved = pair?.peers?.[id]
      if (saved && (saved.host !== host || saved.port !== port)) { saved.host = host; saved.port = port; hooks.savePairs() }
      tell()
      hooks.send('devices:changed', id)
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', d => {
        buf += d
        let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2)
          const ev = block.match(/^event: (.+)$/m)?.[1], data = block.match(/^data: (.*)$/m)?.[1]
          if (ev === 'hello') { try { p.clockOff = Math.round((Date.now() - JSON.parse(data).time) / 1000) } catch {} tell() }
          if (ev === 'changed') hooks.send('devices:changed', id)
        }
      })
      res.on('end', () => { if (peers.get(id) === p) { p.state = 'away'; tell() } })
      res.on('error', () => { if (peers.get(id) === p) { p.state = 'away'; tell() } })
    })
    req.on('error', () => { if (peers.get(id) === p) { p.state = 'away'; tell() } })
    p.req = req
    tell()
  }

  /** The changes a paired device has after the point this one got to: { batch, since }. */
  async function pull(id) {
    const w = hooks.world(), pair = openPair(), saved = pair?.peers?.[id], live = peers.get(id), key = w && keyOf(w.worldId)
    if (!w || !saved || !key) throw new Error('Not one of this world\'s devices.')
    const target = live?.state === 'connected' ? live : saved.host ? { host: saved.host, port: saved.port || PORT } : null
    if (!target) throw new Error(`${saved.name} isn't reachable.`)
    let r = await request(target, `changes?since=${saved.got || 0}`, key)
    if (r.status !== 200) throw new Error(errorOf(r))
    let batch = unsealJson(key, r.body)
    // its log was started over (a restore): everything again, from the top
    if (saved.log && batch.log !== saved.log && saved.got) {
      r = await request(target, 'changes?since=0', key)
      if (r.status !== 200) throw new Error(errorOf(r))
      batch = unsealJson(key, r.body)
    }
    return { batch, since: saved.since || '' }
  }
  /** The window took a batch in: remember how far, and when they last talked. */
  function pulled(id, upTo, log) {
    const saved = openPair()?.peers?.[id]
    if (!saved) return
    saved.got = upTo; saved.log = log; saved.since = new Date().toISOString()
    hooks.savePairs()
    tell()
  }
  /** Fetch a picture or file from a paired device into the open world's folder. */
  async function fetchFile(id, p) {
    if (!FILE.test(p)) throw new Error('Not a picture or file.')
    const w = hooks.world(), saved = openPair()?.peers?.[id], live = peers.get(id), key = w && keyOf(w.worldId)
    if (!w || !saved || !key) throw new Error('Not one of this world\'s devices.')
    const target = live?.state === 'connected' ? live : { host: saved.host, port: saved.port || PORT }
    const r = await request(target, `file?p=${encodeURIComponent(p)}`, key, 120_000)
    if (r.status !== 200) throw new Error(errorOf(r))
    const f = path.join(w.dir, ...p.split('/'))
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, unseal(key, r.body))
    return f
  }

  // ======================= starting, stopping, pairing =======================

  /** Run for the open world while it has paired devices or is pairing. */
  async function start() {
    const w = hooks.world()
    if (!w) return stop()
    const pair = pairOf(w.worldId)
    if (!pairing && !Object.keys(pair?.peers ?? {}).length) return stop()
    if (srv && srv.worldId === w.worldId) { sayHello(); return }
    stop()
    const server = http.createServer((req, res) => { handle(req, res).catch(e => { try { json(res, 500, { error: e.message }) } catch {} }) })
    let port = 0
    for (let p = PORT; p < PORT + 10 && !port; p++) {
      port = await new Promise(resolve => {
        const fail = () => { server.removeAllListeners('listening'); resolve(0) }
        server.once('error', fail)
        server.listen(p, '0.0.0.0', () => { server.off('error', fail); resolve(p) })
      })
    }
    if (!port) throw new Error(`Ports ${PORT}–${PORT + 9} are all in use on this computer.`)
    let udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    udp.on('message', onUdp)
    udp.on('error', () => { try { udp?.close() } catch {} udp = null; if (srv) srv.udp = null })
    await new Promise(resolve => { try { udp.bind(PORT, () => { try { udp.setBroadcast(true) } catch {} resolve() }) } catch { udp = null; resolve() } })
    // say hello now and every minute, and keep the event streams alive
    const beat = setInterval(() => { for (const s of streams) s.res.write(': ping\n\n'); sayHello() }, 60_000)
    srv = { server, udp, port, worldId: w.worldId, beat, fails: new Map() }
    sayHello()
    tell()
  }
  function stop() {
    for (const p of peers.values()) p.req?.destroy()
    peers.clear()
    for (const s of streams) { try { s.res.end() } catch {} }
    streams.clear()
    if (srv) {
      clearInterval(srv.beat)
      try { srv.udp?.close() } catch {}
      srv.server.close(); srv.server.closeAllConnections?.()
      srv = null
    }
    pairing = null
    tell()
  }
  /** After a save here: tell every connected device. */
  function changed() { for (const s of streams) s.res.write('event: changed\ndata: 1\n\n') }

  /** Open pairing for the open world: a code to type in on the other device (made a sync key first, if none). */
  async function startPairing() {
    const w = hooks.world()
    if (!w) throw new Error('No world is open.')
    const all = hooks.pairs()
    if (!all[w.worldId]) { all[w.worldId] = { key: crypto.randomBytes(32).toString('base64'), peers: {} }; hooks.savePairs() }
    const code = newCode(), salt = crypto.randomBytes(16).toString('base64')
    pairing = { code, salt, key: codeKey(code, salt), until: Date.now() + PAIR_MS, wrong: 0 }
    await start()
    tell()
    return status()
  }
  function stopPairing() { pairing = null; start().catch(() => {}); tell() }

  /** Devices on the networks that are pairing right now (for the joining device): [{ host, port, title, name }]. */
  function findPairing(ms = 1500) {
    return new Promise(resolve => {
      const found = new Map()
      const sock = dgram.createSocket('udp4')
      const ask = () => { for (const t of new Set(['255.255.255.255', ...networks().map(n => n.broadcast)])) sock.send(JSON.stringify({ t: HELLO, pairAsk: true }), PORT, t, () => {}) }
      sock.on('message', (buf, r) => {
        try { const m = JSON.parse(buf.toString()); if (m?.t === HELLO && m.pairing && m.port) found.set(`${r.address}:${m.port}`, { host: r.address, port: Number(m.port), title: String(m.title ?? ''), name: String(m.name ?? '') }) } catch {}
      })
      sock.on('error', () => {})
      sock.bind(0, () => { try { sock.setBroadcast(true) } catch {} ask(); setTimeout(ask, ms / 3) })
      setTimeout(() => { try { sock.close() } catch {} resolve([...found.values()]) }, ms)
    })
  }

  /**
   * Join a world another device is pairing: with its code, at `target` ({ host, port }). Returns what the window
   * needs to make the local copy: the key, the world's ID and title, the other device, the database (base64), its
   * log position, and the pictures to fetch. Nothing is written here; main.cjs makes the folder.
   */
  async function join(target, code, onProgress = () => {}) {
    let r = await request(target, 'pair-salt', null, 10_000)
    if (r.status !== 200) throw new Error(errorOf(r))
    const { salt } = JSON.parse(r.body.toString())
    const k = codeKey(code, salt), me = hooks.me()
    r = await request(target, 'pair', null, 15_000, 'POST', seal(k, { id: me.id, name: me.name, port: srv?.port ?? PORT }))
    if (r.status !== 200) throw new Error(errorOf(r))
    const got = unsealJson(k, r.body)
    const key = Buffer.from(got.key, 'base64')
    onProgress('Copying the world', 0, 1)
    // the copy is asked for as this device, now one of the world's devices
    const asMe = (rel, t) => {
      const headers = { 'x-gm-device': me.id, 'x-gm-auth': seal(key, { path: rel, t: Date.now() }).toString('base64') }
      return new Promise((resolve, reject) => {
        const req = http.get({ host: target.host, port: target.port, path: '/' + rel, headers, timeout: t }, res => {
          const parts = []; res.on('data', d => parts.push(d)); res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(parts) })); res.on('error', reject)
        })
        req.on('timeout', () => req.destroy(new Error('The other device didn\'t answer in time.'))); req.on('error', reject)
      })
    }
    r = await asMe('world', 300_000)
    if (r.status !== 200) throw new Error(errorOf(r))
    const world = unsealJson(key, r.body)
    const files = []
    for (let i = 0; i < world.files.length; i++) {
      onProgress('Copying pictures and files', i, world.files.length)
      const p = world.files[i]
      const f = await asMe(`file?p=${encodeURIComponent(p)}`, 120_000)
      if (f.status === 200) files.push({ path: p, data: unseal(key, f.body) })
    }
    return { key: got.key, worldId: got.worldId, title: got.title, device: got.device, name: got.name, host: target.host, port: target.port, seq: world.seq, log: world.log, db: Buffer.from(world.db, 'base64'), files }
  }

  /** Forget a paired device (it can't sync with this world any more until paired again). */
  function forget(id) {
    const pair = openPair()
    if (!pair?.peers?.[id]) return
    delete pair.peers[id]
    peers.get(id)?.req?.destroy(); peers.delete(id)
    for (const s of streams) if (s.id === id) { try { s.res.end() } catch {} streams.delete(s) }
    hooks.savePairs()
    start().catch(() => {})
    tell()
  }

  return { start, stop, status, changed, startPairing, stopPairing, findPairing, join, pull, pulled, fetchFile, forget, parseAddress }
}

module.exports = { createDevices, seal, unseal }
