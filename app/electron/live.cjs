// Live sessions on the local network: the DM's GM Notes sends the players' version of the world straight to the
// players' apps on the same Wi-Fi / LAN, instead of (and besides) the shared Drive folder.
//
// DM: "Host" starts a small HTTP server (TCP 47100, or the next free port up to 47109) that serves the last "Send now"
// from <userData>/live/<world id>/ in the publish format (world.json + files/<hash>), and a UDP socket on 47100 that
// answers players looking for sessions. Connected players hold an event stream open; "Send now" tells them a new
// version is there, and their app fetches it like it reads the Drive folder. Every request but /hello needs the
// world's code; five wrong codes from one address lock it out for five minutes. The one thing a player sends is their
// characters linked to a shared campaign (POST /character, up to 30 MB): handed to the DM's window, which keeps them
// read-only (playerCharacters.ts); nothing is written here.
//
// Player: a world that follows a DM world may also know its live session (address, port, code). The app finds the DM
// again by the world ID when its address changed, keeps the event stream open while the DM hosts, and reads the
// world from the DM while connected; otherwise from the Drive folder, if it has one.
const http = require('node:http')
const dgram = require('node:dgram')
const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const PORT = 47100
const HELLO = 'gm-notes-live?'
const FILE = /^files\/[0-9a-f]{32}(\.[a-z0-9]{1,6})?$/
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** The most a player's characters may weigh, pictures included. */
const MAX_CHARACTERS = 30 * 1024 * 1024

/** A new code like K7QM-4XPT (no 0/O, 1/I). */
function newCode() {
  const b = crypto.randomBytes(8)
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % 32]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}
const plain = c => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
function sameCode(a, b) {
  const x = Buffer.from(plain(a)), y = Buffer.from(plain(b))
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y)
}

/** This computer's addresses on the local networks (IPv4), with each network's broadcast address. */
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

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/**
 * @param {{ send: (channel: string, data: unknown) => void, saveLiveHost: (host: string, port: number) => void }} hooks
 *   send: to the window; saveLiveHost: the DM was found at a new address (remembered for next time).
 */
function createLive(hooks) {
  // ======================= the DM's side =======================
  /** @type {null | { server: http.Server, udp: dgram.Socket | null, port: number, worldId: string, title: string, dir: string, code: string, clients: Set<{ res: http.ServerResponse, who: string, ip: string }>, fails: Map<string, { n: number, until: number }>, ping: NodeJS.Timeout }} */
  let host = null

  const publishedIn = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'world.json'), 'utf8')).published ?? null } catch { return null } }

  function hostStatus() {
    if (!host) return { hosting: false }
    return {
      hosting: true, port: host.port, code: host.code, title: host.title,
      addresses: networks().map(n => n.address),
      players: [...host.clients].map(c => c.who),
      published: publishedIn(host.dir),
    }
  }
  const tellHost = () => hooks.send('live:host', hostStatus())

  function handle(req, res) {
    const h = host
    if (!h) return json(res, 503, { error: 'Not hosting' })
    const url = new URL(req.url ?? '/', 'http://local')
    const rel = decodeURIComponent(url.pathname.slice(1))
    if (rel === 'hello') return json(res, 200, { app: 'gm-notes', v: 1, worldId: h.worldId, title: h.title, port: h.port })
    const ip = req.socket.remoteAddress ?? ''
    const f = h.fails.get(ip)
    if (f && f.until > Date.now()) return json(res, 429, { error: 'Too many wrong codes. Try again in a few minutes.' })
    if (!sameCode(req.headers['x-gm-code'], h.code)) {
      const n = (f?.n ?? 0) + 1
      h.fails.set(ip, { n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 })
      return json(res, 401, { error: 'Wrong code.' })
    }
    h.fails.delete(ip)
    if (rel === 'check') return json(res, 200, { ok: true, worldId: h.worldId, title: h.title, published: publishedIn(h.dir) })
    if (rel === 'events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
      let who = ''
      try { who = decodeURIComponent(String(req.headers['x-gm-who'] ?? '')).slice(0, 60) } catch {}
      const world = String(req.headers['x-gm-world'] ?? '').slice(0, 100)
      const c = { res, who: who || ip.replace(/^::ffff:/, ''), ip, world }
      h.clients.add(c)
      const p = publishedIn(h.dir)
      if (p) res.write(`event: published\ndata: ${p}\n\n`)
      req.on('close', () => { h.clients.delete(c); tellHost() })
      tellHost()
      return
    }
    if (rel === 'character' && req.method === 'POST') {
      const parts = []
      let size = 0
      req.on('data', d => {
        size += d.length
        if (size > MAX_CHARACTERS) { json(res, 413, { error: 'Too big.' }); req.destroy() } else parts.push(d)
      })
      req.on('end', () => {
        if (size > MAX_CHARACTERS) return
        let msg
        try { msg = JSON.parse(Buffer.concat(parts).toString('utf8')) } catch { return json(res, 400, { error: 'Not JSON.' }) }
        if (!msg || typeof msg !== 'object' || typeof msg.player !== 'string' || !Array.isArray(msg.characters)) return json(res, 400, { error: 'Not characters.' })
        hooks.send('live:character', msg)
        json(res, 202, { ok: true })
      })
      return
    }
    if (rel === 'world.json' || FILE.test(rel)) {
      return fs.readFile(path.join(h.dir, ...rel.split('/')), (err, data) => {
        if (err) return json(res, 404, { error: rel === 'world.json' ? 'The DM hasn\'t sent anything yet.' : 'No such file.' })
        res.writeHead(200, { 'content-type': rel.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'cache-control': 'no-store' })
        res.end(data)
      })
    }
    json(res, 404, { error: 'Not found' })
  }

  /** Start hosting the open world. Its last "Send now" (if any) is served right away. */
  async function startHost({ worldId, title, dir, code }) {
    stopHost()
    fs.mkdirSync(dir, { recursive: true })
    const server = http.createServer(handle)
    let port = 0
    for (let p = PORT; p < PORT + 10 && !port; p++) {
      port = await new Promise(resolve => {
        const fail = () => { server.removeAllListeners('listening'); resolve(0) }
        server.once('error', fail)
        server.listen(p, '0.0.0.0', () => { server.off('error', fail); resolve(p) })
      })
    }
    if (!port) throw new Error(`Ports ${PORT}–${PORT + 9} are all in use on this computer.`)
    // Finding the session: answer players' "anyone hosting?" (only the DM's computer listens).
    let udp = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    udp.on('message', (msg, r) => {
      if (msg.toString() === HELLO && host) udp?.send(JSON.stringify({ app: 'gm-notes', v: 1, worldId: host.worldId, title: host.title, port: host.port }), r.port, r.address)
    })
    udp.on('error', () => { try { udp?.close() } catch {} udp = null; if (host) host.udp = null })
    try { udp.bind(PORT) } catch { udp = null }
    const ping = setInterval(() => { for (const c of host?.clients ?? []) c.res.write(': ping\n\n') }, 25_000)
    host = { server, udp, port, worldId, title, dir, code, clients: new Set(), fails: new Map(), ping }
    tellHost()
    return hostStatus()
  }

  function stopHost() {
    if (!host) return
    const h = host
    host = null
    clearInterval(h.ping)
    for (const c of h.clients) { try { c.res.end() } catch {} }
    try { h.udp?.close() } catch {}
    h.server.close()
    h.server.closeAllConnections?.()
    tellHost()
  }

  /** After "Send now": tell every connected player. */
  function sent() {
    if (!host) return
    const p = publishedIn(host.dir)
    if (p) for (const c of host.clients) c.res.write(`event: published\ndata: ${p}\n\n`)
    tellHost()
  }

  /**
   * The DM changed what a player's character shares with them (HP, conditions, inventory, relations): to that
   * player's app only (`to`: its world ID). One line of JSON.
   */
  function sendShared(text) {
    if (!host) return { error: 'Not hosting.' }
    let to = ''
    try { to = String(JSON.parse(text).to ?? '') } catch { return { error: 'Not JSON.' } }
    const line = String(text).replace(/\r?\n/g, ' ')
    let n = 0
    for (const c of host.clients) if (c.world && c.world === to) { c.res.write(`event: shared\ndata: ${line}\n\n`); n++ }
    return { ok: true, sent: n }
  }

  /** A new code: everyone connected is dropped and needs the new one. */
  function changeCode(code) {
    if (!host) return
    host.code = code
    for (const c of host.clients) { try { c.res.end() } catch {} }
    host.clients.clear()
    host.fails.clear()
    tellHost()
  }

  // ======================= a player's side =======================

  /** Ask the local networks who is hosting; the answers within `ms`. */
  function discover(ms = 1500) {
    return new Promise(resolve => {
      const found = new Map()
      const sock = dgram.createSocket('udp4')
      const ask = () => {
        const targets = new Set(['255.255.255.255', ...networks().map(n => n.broadcast)])
        for (const t of targets) sock.send(HELLO, PORT, t, () => {})
      }
      sock.on('message', (msg, r) => {
        try {
          const x = JSON.parse(msg.toString())
          if (x?.app === 'gm-notes' && x.worldId && x.port) found.set(`${x.worldId}@${r.address}`, { worldId: String(x.worldId), title: String(x.title ?? ''), host: r.address, port: Number(x.port) })
        } catch {}
      })
      sock.on('error', () => {})
      sock.bind(0, () => {
        try { sock.setBroadcast(true) } catch {}
        ask()
        setTimeout(ask, ms / 3)
      })
      setTimeout(() => { try { sock.close() } catch {} resolve([...found.values()]) }, ms)
    })
  }

  /** One request to a DM's app: { status, body }. Throws when it can't be reached. */
  function request(target, rel, code, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const req = http.get({ host: target.host, port: target.port, path: '/' + rel, headers: code ? { 'x-gm-code': code } : {}, timeout }, res => {
        const parts = []
        res.on('data', d => parts.push(d))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(parts) }))
        res.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', reject)
    })
  }
  const errorOf = r => { try { return JSON.parse(r.body.toString()).error } catch { return `The DM's app answered ${r.status}.` } }

  /** Send the player's characters (JSON text) to the DM's live session; { ok } or { error }. */
  function sendCharacters(text) {
    if (!follow || playerState.state !== 'connected') return Promise.resolve({ error: 'Not connected to the DM.' })
    const body = Buffer.from(String(text), 'utf8')
    return new Promise(resolve => {
      const req = http.request({ host: follow.host, port: follow.port, path: '/character', method: 'POST', timeout: 30_000,
        headers: { 'x-gm-code': follow.code, 'content-type': 'application/json', 'content-length': body.length } }, res => {
        const parts = []
        res.on('data', d => parts.push(d))
        res.on('end', () => { const r = { status: res.statusCode ?? 0, body: Buffer.concat(parts) }; resolve(r.status === 202 ? { ok: true } : { error: errorOf(r) }) })
        res.on('error', e => resolve({ error: e.message }))
      })
      req.on('timeout', () => req.destroy(new Error("The DM's app didn't answer.")))
      req.on('error', e => resolve({ error: e.message }))
      req.end(body)
    })
  }

  /** "192.168.1.20" or "192.168.1.20:47100" → a target. */
  function parseAddress(text) {
    const m = String(text ?? '').trim().match(/^([\w.-]+)(?::(\d{2,5}))?$/)
    return m ? { host: m[1], port: Number(m[2] ?? PORT) } : null
  }

  /** Check a code with a DM's app: { ok, worldId, title } or { error }. */
  async function check(target, code) {
    try {
      const r = await request(target, 'check', code)
      if (r.status === 200) return JSON.parse(r.body.toString())
      return { error: errorOf(r) }
    } catch { return { error: `No GM Notes session answers at ${target.host}:${target.port}.` } }
  }

  /** @type {null | { worldId: string, host: string, port: number, code: string, who: string }} */
  let follow = null
  let gen = 0
  let stream = null
  let retry = null
  /** off | searching | connected | wrong-code */
  let playerState = { state: 'off' }
  const setState = (state, extra = {}) => { playerState = { state, ...extra }; hooks.send('live:player', playerState) }

  function stopPlayer() {
    gen++
    follow = null
    clearTimeout(retry)
    try { stream?.destroy() } catch {}
    stream = null
    if (playerState.state !== 'off') setState('off')
  }

  /** Keep in touch with the DM's live session of the followed world (while the DM hosts). */
  function followLive(cfg) {
    stopPlayer()
    if (!cfg?.code || !cfg.worldId) return
    follow = { ...cfg }
    connect(gen)
  }

  async function connect(g) {
    clearTimeout(retry)
    if (!follow || g !== gen) return
    const again = ms => { if (g === gen) retry = setTimeout(() => connect(g), ms) }
    if (playerState.state !== 'searching') setState('searching')
    let target = null
    if (follow.host) {
      try {
        const r = await request(follow, 'hello', '', 2500)
        if (r.status === 200 && JSON.parse(r.body.toString()).worldId === follow.worldId) target = { host: follow.host, port: follow.port }
      } catch {}
    }
    if (!target && g === gen) {
      const x = (await discover()).find(d => d.worldId === follow?.worldId)
      if (x) { target = { host: x.host, port: x.port }; hooks.saveLiveHost(x.host, x.port) }
    }
    if (g !== gen || !follow) return
    if (!target) return again(20_000)
    follow.host = target.host; follow.port = target.port
    const req = http.get({ host: target.host, port: target.port, path: '/events', headers: { 'x-gm-code': follow.code, 'x-gm-who': encodeURIComponent(follow.who || os.hostname()), 'x-gm-world': follow.me ?? '' } }, res => {
      if (g !== gen) { res.destroy(); return }
      if (res.statusCode === 401) { res.resume(); setState('wrong-code'); return }
      if (res.statusCode !== 200) { res.resume(); return again(20_000) }
      setState('connected', { host: target.host, port: target.port })
      let buf = ''
      res.setEncoding('utf8')
      res.on('data', d => {
        buf += d
        let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2)
          const ev = block.match(/^event: (.+)$/m)?.[1], data = block.match(/^data: (.*)$/m)?.[1]
          if (ev === 'published' && data) hooks.send('live:published', data)
          if (ev === 'shared' && data) hooks.send('live:shared', data)
        }
      })
      res.on('close', () => { if (g === gen) { setState('searching'); again(3000) } })
    })
    req.on('error', () => { if (g === gen) { setState('searching'); again(20_000) } })
    stream = req
  }

  /**
   * A file of the followed world from the DM's live session: the bytes, null if the DM has no such file, or
   * undefined when there's no live session to read from (then the Drive folder is used).
   */
  async function read(rel) {
    if (!follow || (rel !== 'world.json' && !FILE.test(rel))) return undefined
    try {
      const r = await request(follow, rel, follow.code, 30_000)
      if (r.status === 200) return r.body
      if (r.status === 404) return rel === 'world.json' ? undefined : null
      return undefined
    } catch { return undefined }
  }

  return {
    newCode, startHost, stopHost, hostStatus, sent, changeCode, sendShared,
    discover, check, parseAddress, followLive, stopPlayer, read, sendCharacters,
    playerStatus: () => playerState,
    stopAll() { stopHost(); stopPlayer() },
  }
}

module.exports = { createLive, newCode }
