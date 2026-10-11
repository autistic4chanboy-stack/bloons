// Couche réseau (client). Modes :
//  - 'solo'   : pas de réseau, ce navigateur est l'hôte (version GitHub Pages).
//  - 'host'   : ce navigateur simule le monde et diffuse les effets aux autres joueurs.
//  - 'client' : ce navigateur envoie ses actions à l'hôte et applique les effets reçus.
// Le serveur (multiplayer/server.js) ne fait que relayer les messages entre les membres d'un salon.

export const Net = {
  mode: 'solo',
  myId: 'p1',
  hostId: 'p1',
  room: null,
  name: 'Gardien',
  ws: null,
  peers: new Map(),      // id -> {id, name, costume, color}
  handlers: new Map(),
  latency: 0,
  stats: { sent: 0, recv: 0, bytesOut: 0, bytesIn: 0 },

  get isHost() { return this.mode !== 'client'; },
  get online() { return this.mode !== 'solo'; },
  get playerCount() { return 1 + this.peers.size; },

  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(fn); },
  off(type) { this.handlers.delete(type); },
  emitLocal(type, msg) { const hs = this.handlers.get(type); if (hs) for (const h of hs) { try { h(msg); } catch (e) { console.error('[net]', type, e); } } },

  defaultServerUrl() {
    const loc = window.location;
    if (loc.protocol === 'file:') return 'ws://localhost:8080/ws';
    return (loc.protocol === 'https:' ? 'wss://' : 'ws://') + loc.host + '/ws';
  },

  // Vérifie si la page est servie par le serveur multijoueur
  async detectServer() {
    try {
      const r = await fetch('mp-info.json', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.nuitBlanche ? j : null;
    } catch (e) { return null; }
  },

  connect(url, opts) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      this.ws = ws;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Délai de connexion dépassé')); try { ws.close(); } catch (e) { /* */ } } }, 8000);
      ws.onopen = () => {
        this._send({ t: 'hello', room: opts.room || null, create: !!opts.create, name: opts.name, password: opts.password || '', mode: opts.mode || 'story', costume: opts.costume || 'guard', version: 1 });
      };
      ws.onmessage = (ev) => {
        this.stats.recv++; this.stats.bytesIn += ev.data.length || 0;
        let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.t === 'welcome') {
          this.myId = msg.id; this.hostId = msg.hostId; this.room = msg.room; this.name = opts.name;
          this.mode = msg.hostId === msg.id ? 'host' : 'client';
          this.peers.clear(); for (const p of msg.players || []) if (p.id !== this.myId) this.peers.set(p.id, p);
          this.roomInfo = msg;
          if (!settled) { settled = true; clearTimeout(timer); resolve(msg); }
          return;
        }
        if (msg.t === 'error') { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(msg.message || 'Erreur')); } this.emitLocal('error', msg); return; }
        if (msg.t === 'join') { this.peers.set(msg.player.id, msg.player); }
        if (msg.t === 'leave') { this.peers.delete(msg.id); }
        if (msg.t === 'host') { this.hostId = msg.id; this.mode = msg.id === this.myId ? 'host' : 'client'; }
        if (msg.t === 'pong') { this.latency = performance.now() - msg.c; return; }
        this.emitLocal(msg.t, msg);
      };
      ws.onclose = () => {
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Connexion fermée')); }
        if (this.mode !== 'solo') this.emitLocal('disconnect', {});
        this.mode = 'solo'; this.ws = null;
      };
      ws.onerror = () => { /* onclose suit */ };
      this._ping = setInterval(() => { if (this.ws && this.ws.readyState === 1) this._send({ t: 'ping', c: performance.now() }); }, 3000);
    });
  },

  disconnect() { if (this.ws) { try { this.ws.close(); } catch (e) { /* */ } } this.ws = null; this.mode = 'solo'; this.peers.clear(); clearInterval(this._ping); },

  _send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const s = JSON.stringify(obj); this.stats.sent++; this.stats.bytesOut += s.length; this.ws.send(s);
  },

  sendAction(n, p) { this._send({ t: 'a', n, p }); },
  broadcastEffect(n, p, to = null) { this._send({ t: 'e', n, p, to }); },
  sendPlayerState(s) { this._send({ t: 'ps', s }); },
  sendSnapshot(s) { this._send({ t: 'snap', s }); },
  sendFull(to, s) { this._send({ t: 'full', to, s }); },
  sendChat(text, channel, pos) { this._send({ t: 'chat', text, channel, pos }); },
  saveRoom(data) { this._send({ t: 'save', data }); },
  requestFull() { this._send({ t: 'needfull' }); },
};
