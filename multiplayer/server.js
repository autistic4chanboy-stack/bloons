#!/usr/bin/env node
'use strict';
/*
 * Nuit Blanche — Centre Commercial Hélios : serveur multijoueur.
 *
 *  - Sert les fichiers du jeu (le dossier parent de multiplayer/, c'est-à-dire la racine du dépôt).
 *  - Relaie les messages WebSocket (chemin /ws) entre les membres d'un salon. Le navigateur hôte
 *    simule le monde ; le serveur ne fait que transmettre (client : js/net/net.js).
 *  - Aucune dépendance npm : le protocole WebSocket (RFC 6455) est implémenté ici avec http et crypto.
 *
 * Lancement : node multiplayer/server.js   (Node.js >= 18)
 * Variables : PORT (8080), HOST (0.0.0.0), MAX_PLAYERS (4, max 8), MAX_ROOMS (200),
 *             SAVES_DIR (multiplayer/saves), PING_INTERVAL_MS (20000), PING_TIMEOUT_MS (40000).
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

// ─── Configuration ──────────────────────────────────────────────────────────

function envInt(name, def, min, max) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    console.warn(`[config] ${name}=${JSON.stringify(raw)} invalide : valeur par défaut ${def}`);
    return def;
  }
  return Math.min(max, Math.max(min, n));
}

const PORT = envInt('PORT', 8080, 0, 65535);
const HOST = String(process.env.HOST || '0.0.0.0').trim();
const MAX_PLAYERS = envInt('MAX_PLAYERS', 4, 2, 8);
const MAX_ROOMS = envInt('MAX_ROOMS', 200, 1, 100000);
const PING_INTERVAL_MS = envInt('PING_INTERVAL_MS', 20000, 500, 3600000);
const PING_TIMEOUT_MS = envInt('PING_TIMEOUT_MS', 40000, 1000, 7200000);

const ROOT = path.resolve(__dirname, '..');
const SAVES_DIR = path.resolve(process.env.SAVES_DIR || path.join(__dirname, 'saves'));

const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024; // taille max d'un message WebSocket (trame ou message fragmenté)
const MAX_SAVE_BYTES = 1024 * 1024;        // taille max d'une sauvegarde (JSON de `data`)
const MAX_FRAGMENTS = 4096;                // nombre max de trames pour un message fragmenté
const MAX_CONNECTIONS = MAX_ROOMS * MAX_PLAYERS + 64;
const HELLO_TIMEOUT_MS = 10000;            // délai pour envoyer {t:'hello'} après la connexion
const CLOSE_TIMEOUT_MS = 5000;             // délai max de la poignée de main de fermeture
const SEND_SOFT_LIMIT = 512 * 1024;        // au-delà, les messages « volatils » (ps, snap) sont sautés
const SEND_HARD_LIMIT = 16 * 1024 * 1024;  // au-delà, le client est jugé trop lent et déconnecté
const FLOOD_RATE = 1000;                   // messages/s autorisés par connexion (seau à jetons)
const FLOOD_BURST = 5000;
const CHAT_MAX_CHARS = 200;
const CHAT_LIMIT = 5;                      // 5 messages…
const CHAT_WINDOW_MS = 5000;               // …par fenêtre glissante de 5 s
const NAME_MAX_CHARS = 20;
const DEFAULT_NAME = 'Gardien';
const DEFAULT_COSTUME = 'guard';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O (ambigus)
const CODE_LENGTH = 5;
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;
const SAVE_FORMAT = 'nuit-blanche-salon';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ─── Journal ────────────────────────────────────────────────────────────────

function stamp() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function log(msg) { console.log(`${stamp()} ${msg}`); }
function logError(context, err) {
  const detail = err && (err.stack || err.message) ? (err.stack || err.message) : String(err);
  console.error(`${stamp()} ERREUR ${context} : ${detail}`);
}
// Valeur sûre pour le journal (pas de retour à la ligne ni de caractère de contrôle injecté).
function safeLog(s, max = 64) { return String(s).replace(CONTROL_RE, '?').replace(/[^\x20-\x7e\u00a0-\uffff]/g, '?').slice(0, max); }

// ─── Petits utilitaires ─────────────────────────────────────────────────────

const EMPTY = Buffer.alloc(0);
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
const LINE_RE = /[\t\n\r\v\f]+/g;

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

function randomId(prefix, bytes) { return prefix + crypto.randomBytes(bytes).toString('hex'); }

// Texte libre : contrôles supprimés, espaces rognés, longueur max en caractères (points de code).
function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  if (s.length > max * 8) s = s.slice(0, max * 8); // borne le travail sur une entrée abusive
  s = s.replace(LINE_RE, ' ').replace(CONTROL_RE, '').trim();
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join('').trim() : s;
}

// Nom de joueur : 1 à 20 caractères, « Gardien » par défaut, null si invalide.
function cleanName(raw) {
  if (raw === undefined || raw === null) return DEFAULT_NAME;
  if (typeof raw !== 'string' || raw.length > 200) return null;
  const s = cleanText(raw.replace(/[<>]/g, '').replace(/\s+/g, ' '), NAME_MAX_CHARS);
  return s || DEFAULT_NAME;
}

function cleanCostume(raw) {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(raw) ? raw : DEFAULT_COSTUME;
}

function cleanMode(raw) { return raw === 'story' || raw === 'infinite' ? raw : null; }

function normalizeCode(raw) {
  if (typeof raw !== 'string' || raw.length > 32) return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(code) ? code : null;
}

function cleanEventName(raw) { // nom d'action / d'effet
  return typeof raw === 'string' && raw.length >= 1 && raw.length <= 64 ? raw : null;
}

function cleanChannel(raw) {
  if (typeof raw !== 'string') return null;
  return cleanText(raw, 24) || null;
}

// Position jointe au chat : [x, y, z] ou {x, y, z, …} (nombres finis ou petites chaînes), sinon null.
function cleanPos(raw) {
  if (Array.isArray(raw)) {
    if (raw.length < 2 || raw.length > 4) return null;
    return raw.every((v) => typeof v === 'number' && Number.isFinite(v)) ? raw.slice() : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const keys = Object.keys(raw);
  if (keys.length === 0 || keys.length > 8) return null;
  const out = {};
  for (const k of keys) {
    const v = raw[k];
    if (k.length > 16) return null;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && v.length <= 32) out[k] = cleanText(v, 32);
    else return null;
  }
  return out;
}

function randomSeed() { return crypto.randomInt(1, 2147483647); }

// Mot de passe de salon : stocké sous forme d'empreinte salée (jamais en clair, même dans les sauvegardes).
function hashPassword(password) {
  if (!password) return null;
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.createHmac('sha256', salt).update(password, 'utf8').digest('hex') };
}

function checkPassword(pass, password) {
  if (!pass) return true;
  const expected = Buffer.from(pass.hash, 'hex');
  const got = crypto.createHmac('sha256', pass.salt).update(password || '', 'utf8').digest();
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

function validPassObject(p) {
  return !!p && typeof p === 'object' && typeof p.salt === 'string' && /^[0-9a-f]{8,128}$/.test(p.salt) &&
    typeof p.hash === 'string' && /^[0-9a-f]{64}$/.test(p.hash);
}

// ─── WebSocket (RFC 6455), côté serveur ─────────────────────────────────────

const OP_CONT = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

const HDR_OK = 0;   // trame acceptée
const HDR_SKIP = 1; // trame ignorée (charge utile sautée sans être mise en mémoire)
const HDR_FATAL = 2; // flux illisible : on arrête de lire

function isValidCloseCode(code) {
  return (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999);
}

function closePayload(code, reason) {
  if (!code) return EMPTY;
  let r = String(reason || '');
  while (Buffer.byteLength(r) > 123) r = r.slice(0, -1);
  const rb = Buffer.from(r, 'utf8');
  const b = Buffer.allocUnsafe(2 + rb.length);
  b.writeUInt16BE(code, 0);
  rb.copy(b, 2);
  return b;
}

// Trame serveur (jamais masquée). Retourne {head, body} ; body est null pour les petites trames
// (en-tête et données concaténés en une seule écriture). Une trame peut être écrite sur plusieurs sockets.
function buildFrame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) {
    head = Buffer.allocUnsafe(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.allocUnsafe(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.allocUnsafe(10);
    head[1] = 127;
    head.writeUInt32BE(Math.floor(len / 0x100000000), 2);
    head.writeUInt32BE(len % 0x100000000, 6);
  }
  head[0] = 0x80 | opcode; // FIN + opcode
  if (len <= 16384) return { head: len ? Buffer.concat([head, payload], head.length + len) : head, body: null };
  return { head, body: payload };
}

function textFrame(str) { return buildFrame(OP_TEXT, Buffer.from(str, 'utf8')); }

function unmask(buf, mask) {
  const n = buf.length;
  const m0 = mask[0];
  const m1 = mask[1];
  const m2 = mask[2];
  const m3 = mask[3];
  let i = 0;
  for (const end = n - 3; i < end; i += 4) {
    buf[i] ^= m0;
    buf[i + 1] ^= m1;
    buf[i + 2] ^= m2;
    buf[i + 3] ^= m3;
  }
  for (; i < n; i++) buf[i] ^= mask[i & 3];
}

class WsConnection {
  constructor(socket) {
    this.socket = socket;
    this.state = WS_OPEN;
    this.closeCode = 1006;      // code retenu à la fermeture (1006 = coupure anormale)
    this.lastSeen = Date.now(); // dernière donnée reçue (pong compris)
    this.lastPing = Date.now();
    this.onMessage = null;      // (texte) => void
    this.onClose = null;        // (code) => void
    this.onProtocolError = null; // (code, raison) => void
    this._closeTimer = null;
    this._ended = false;
    this._notified = false;
    this._dead = false;         // plus aucune lecture
    // Analyseur de trames : en-tête (2 à 14 octets) puis charge utile.
    this._hdr = Buffer.alloc(14);
    this._hdrLen = 0;
    this._hdrNeed = 2;
    this._hdrSized = false;
    this._mask = Buffer.alloc(4);
    this._fin = false;
    this._op = 0;
    this._len = 0;
    this._inPayload = false;
    this._skip = false;
    this._payBuf = null;
    this._payGot = 0;
    this._frag = null;          // message fragmenté en cours : {op, parts, size, count}

    socket.on('data', (chunk) => {
      try { this._onData(chunk); } catch (e) { logError('analyse WebSocket', e); this.terminate(); }
    });
    socket.on('end', () => this._onEnd());
    socket.on('close', () => this._onSocketClose());
    socket.on('error', () => { /* 'close' suit toujours */ });
  }

  // Les données TCP arrivent par morceaux arbitraires : une trame peut être coupée n'importe où,
  // un morceau peut contenir plusieurs trames.
  _onData(chunk) {
    this.lastSeen = Date.now();
    const n = chunk.length;
    let off = 0;
    while (off < n && !this._dead) {
      if (!this._inPayload) {
        const take = Math.min(this._hdrNeed - this._hdrLen, n - off);
        chunk.copy(this._hdr, this._hdrLen, off, off + take);
        this._hdrLen += take;
        off += take;
        if (this._hdrLen < this._hdrNeed) continue;
        if (!this._hdrSized) {
          this._hdrSized = true;
          const b1 = this._hdr[1];
          const len7 = b1 & 0x7f;
          this._hdrNeed = 2 + (len7 === 126 ? 2 : len7 === 127 ? 8 : 0) + (b1 & 0x80 ? 4 : 0);
          if (this._hdrLen < this._hdrNeed) continue;
        }
        this._hdrLen = 0;
        this._hdrNeed = 2;
        this._hdrSized = false;
        const verdict = this._readHeader();
        if (verdict === HDR_FATAL) { this._dead = true; return; }
        this._skip = verdict === HDR_SKIP;
        if (this._len === 0) {
          if (!this._skip) this._onFrame(EMPTY);
          continue;
        }
        this._inPayload = true;
        this._payGot = 0;
        this._payBuf = null;
      } else {
        const need = this._len - this._payGot;
        const avail = n - off;
        if (this._skip) {
          const t = Math.min(need, avail);
          off += t;
          this._payGot += t;
          if (this._payGot === this._len) this._inPayload = false;
          continue;
        }
        if (this._payBuf === null && avail >= need) {
          // Trame entière dans ce morceau : pas de copie.
          const payload = chunk.subarray(off, off + need);
          off += need;
          this._inPayload = false;
          this._onFrame(payload);
          continue;
        }
        if (this._payBuf === null) this._payBuf = Buffer.allocUnsafe(this._len);
        const t = Math.min(need, avail);
        chunk.copy(this._payBuf, this._payGot, off, off + t);
        off += t;
        this._payGot += t;
        if (this._payGot === this._len) {
          const payload = this._payBuf;
          this._payBuf = null;
          this._inPayload = false;
          this._onFrame(payload);
        }
      }
    }
  }

  _readHeader() {
    const h = this._hdr;
    const b0 = h[0];
    const b1 = h[1];
    const fin = (b0 & 0x80) !== 0;
    const rsv = b0 & 0x70;
    const op = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = 2;
    if (len === 126) {
      len = h.readUInt16BE(2);
      p = 4;
    } else if (len === 127) {
      const hi = h.readUInt32BE(2);
      const lo = h.readUInt32BE(6);
      if (hi & 0x80000000) return this._protocolError(1002, 'longueur invalide', true);
      if (hi > 0x1fffff) return this._protocolError(1009, 'message trop volumineux', true);
      len = hi * 0x100000000 + lo;
      p = 10;
    }
    this._fin = fin;
    this._op = op;
    this._len = len;
    if (masked) h.copy(this._mask, 0, p, p + 4);
    const control = (op & 0x08) !== 0;
    if (control) {
      if (op !== OP_CLOSE && op !== OP_PING && op !== OP_PONG) return this._protocolError(1002, 'opcode réservé');
      if (!fin) return this._protocolError(1002, 'trame de contrôle fragmentée');
      if (len > 125) return this._protocolError(1002, 'trame de contrôle trop longue');
    } else if (op !== OP_CONT && op !== OP_TEXT && op !== OP_BINARY) {
      return this._protocolError(1002, 'opcode réservé');
    }
    if (rsv !== 0) return this._protocolError(1002, 'bits RSV non nuls');
    if (!masked) return this._protocolError(1002, 'trame client non masquée');
    if (control) return HDR_OK;
    if (this.state !== WS_OPEN) return HDR_SKIP; // fermeture en cours : les données sont ignorées
    if (op === OP_CONT && !this._frag) return this._protocolError(1002, 'continuation inattendue');
    if (op !== OP_CONT && this._frag) return this._protocolError(1002, 'message fragmenté interrompu');
    const total = (this._frag ? this._frag.size : 0) + len;
    if (total > MAX_MESSAGE_BYTES) return this._protocolError(1009, 'message trop volumineux (2 Mo max)');
    return HDR_OK;
  }

  // Erreur de protocole : envoi d'une trame de fermeture avec le code, puis on continue de lire
  // (en sautant les données) jusqu'à la trame de fermeture du client, sauf si le flux est illisible.
  _protocolError(code, reason, fatal = false) {
    this._frag = null;
    if (this.state === WS_OPEN && this.onProtocolError) {
      try { this.onProtocolError(code, reason); } catch (e) { /* journal seulement */ }
    }
    if (this.state === WS_OPEN) this.close(code, reason);
    else fatal = true;
    if (fatal) { this._endSocket(); return HDR_FATAL; }
    return HDR_SKIP;
  }

  _onFrame(payload) {
    unmask(payload, this._mask);
    const op = this._op;
    if (op === OP_PING) {
      if (this.state === WS_OPEN) this._write(OP_PONG, payload);
      return;
    }
    if (op === OP_PONG) return; // lastSeen déjà mis à jour
    if (op === OP_CLOSE) { this._onCloseFrame(payload); return; }
    if (this.state !== WS_OPEN) return; // fermeture lancée pendant la réception : données ignorées
    if (op === OP_CONT) {
      const f = this._frag;
      f.parts.push(payload);
      f.size += payload.length;
      if (++f.count > MAX_FRAGMENTS) { this._protocolError(1008, 'message trop fragmenté'); return; }
      if (!this._fin) return;
      this._frag = null;
      this._deliver(f.op, f.parts.length === 1 ? f.parts[0] : Buffer.concat(f.parts, f.size));
    } else if (!this._fin) {
      this._frag = { op, parts: [payload], size: payload.length, count: 1 };
    } else {
      this._deliver(op, payload);
    }
  }

  _deliver(op, data) {
    if (op !== OP_TEXT) return; // le protocole du jeu n'utilise que des trames texte (JSON)
    let text;
    try { text = UTF8.decode(data); } catch (e) { this._protocolError(1007, 'texte UTF-8 invalide'); return; }
    if (this.onMessage) this.onMessage(text);
  }

  _onCloseFrame(payload) {
    let code = 1005;
    if (payload.length === 1) { this._protocolError(1002, 'trame de fermeture invalide', true); return; }
    if (payload.length >= 2) {
      code = payload.readUInt16BE(0);
      if (!isValidCloseCode(code)) { this._protocolError(1002, 'code de fermeture invalide', true); return; }
      try { UTF8.decode(payload.subarray(2)); } catch (e) { this._protocolError(1007, 'raison invalide', true); return; }
    }
    if (this.state === WS_OPEN) {
      // Fermeture demandée par le client : on renvoie le même code, puis on ferme la connexion TCP.
      this.closeCode = code;
      this.state = WS_CLOSING;
      this._write(OP_CLOSE, closePayload(code === 1005 ? 0 : code, ''));
    }
    this._endSocket();
  }

  _onEnd() {
    // Le client a fermé son côté TCP (le serveur HTTP de Node autorise les connexions à moitié ouvertes).
    this._dead = true;
    this._endSocket();
  }

  _onSocketClose() {
    this.state = WS_CLOSED;
    this._dead = true;
    clearTimeout(this._closeTimer);
    if (this._notified) return;
    this._notified = true;
    if (this.onClose) {
      try { this.onClose(this.closeCode); } catch (e) { logError('fermeture', e); }
    }
  }

  _endSocket() {
    if (this._ended) return;
    this._ended = true;
    this._dead = true;
    if (this.state === WS_OPEN) this.state = WS_CLOSING;
    clearTimeout(this._closeTimer);
    try { this.socket.end(); } catch (e) { /* déjà détruite */ }
    this._closeTimer = setTimeout(() => this.terminate(), 2000);
  }

  // Écriture bas niveau (autorisée pendant la fermeture, pour la trame de fermeture elle-même).
  _write(opcode, payload) {
    const s = this.socket;
    if (s.destroyed || !s.writable) return false;
    const frame = buildFrame(opcode, payload);
    if (frame.body) {
      s.cork();
      s.write(frame.head);
      s.write(frame.body);
      s.uncork();
    } else {
      s.write(frame.head);
    }
    return true;
  }

  // Envoi d'une trame prête (peut être partagée entre plusieurs destinataires).
  // volatile = message remplaçable (état de joueur, instantané) : sauté si le client a du retard.
  sendFrame(frame, volatile = false) {
    const s = this.socket;
    if (this.state !== WS_OPEN || s.destroyed || !s.writable) return false;
    const buffered = s.writableLength;
    if (buffered > SEND_HARD_LIMIT) {
      log(`client trop lent (${Math.round(buffered / 1048576)} Mo en attente) : déconnexion`);
      this.closeCode = 1008;
      this.terminate();
      return false;
    }
    if (volatile && buffered > SEND_SOFT_LIMIT) return false;
    if (frame.body) {
      s.cork();
      s.write(frame.head);
      s.write(frame.body);
      s.uncork();
    } else {
      s.write(frame.head);
    }
    return true;
  }

  sendText(str, volatile = false) {
    if (this.state !== WS_OPEN) return false;
    return this.sendFrame(textFrame(str), volatile);
  }

  ping() {
    if (this.state !== WS_OPEN) return;
    this.lastPing = Date.now();
    this._write(OP_PING, EMPTY);
  }

  // Fermeture à l'initiative du serveur : trame de fermeture, puis attente de la réponse du client.
  close(code = 1000, reason = '') {
    if (this.state !== WS_OPEN) return;
    this.state = WS_CLOSING;
    this.closeCode = code;
    this._write(OP_CLOSE, closePayload(code, reason));
    clearTimeout(this._closeTimer);
    this._closeTimer = setTimeout(() => this.terminate(), CLOSE_TIMEOUT_MS);
  }

  terminate() {
    if (this.state !== WS_CLOSED) this.state = WS_CLOSED;
    this._dead = true;
    clearTimeout(this._closeTimer);
    this.socket.destroy();
  }
}

// ─── Salons et joueurs ──────────────────────────────────────────────────────

const rooms = new Map();   // code -> Room
const clients = new Set(); // toutes les connexions WebSocket (Client)
const playerIds = new Set();
let connSeq = 0;

class Room {
  constructor({ code, mode, seed, pass, save }) {
    this.code = code;
    this.mode = mode;
    this.seed = seed;
    this.pass = pass;       // {salt, hash} ou null
    this.save = save;       // dernière sauvegarde (objet `data` envoyé par l'hôte) ou null
    this.members = new Map(); // id -> Client, dans l'ordre d'arrivée (le plus ancien en premier)
    this.hostId = null;
    this.createdAt = Date.now();
  }

  get size() { return this.members.size; }
  get host() { return this.members.get(this.hostId) || null; }
  playerList() { return Array.from(this.members.values(), (m) => m.info()); }

  // Diffuse à tous les membres sauf `except`. La trame n'est construite qu'une fois.
  broadcast(obj, except = null, volatile = false) {
    let frame = null;
    for (const m of this.members.values()) {
      if (m === except) continue;
      if (!frame) frame = textFrame(JSON.stringify(obj));
      m.ws.sendFrame(frame, volatile);
    }
  }
}

class Client {
  constructor(ws, ip) {
    this.ws = ws;
    this.ip = ip;
    this.seq = ++connSeq;
    this.id = null;
    this.name = DEFAULT_NAME;
    this.costume = DEFAULT_COSTUME;
    this.room = null;
    this.refused = false;
    this.chatTimes = [];
    this.tokens = FLOOD_BURST;
    this.tokensAt = Date.now();
    this.floodLoggedAt = 0;
    this.errorLoggedAt = 0;
    this.helloTimer = setTimeout(() => {
      if (!this.room && this.ws.state === WS_OPEN) {
        log(`#${this.seq} aucun hello reçu : fermeture`);
        this.ws.close(1008, 'hello attendu');
      }
    }, HELLO_TIMEOUT_MS);
  }

  get label() { return this.id ? `${this.id} (${safeLog(this.name, 24)})` : `#${this.seq}`; }
  get isHost() { return !!this.room && this.room.hostId === this.id; }
  info() { return { id: this.id, name: this.name, costume: this.costume }; }
  send(obj, volatile = false) { return this.ws.sendText(JSON.stringify(obj), volatile); }

  allowMessage() {
    const now = Date.now();
    this.tokens = Math.min(FLOOD_BURST, this.tokens + ((now - this.tokensAt) * FLOOD_RATE) / 1000);
    this.tokensAt = now;
    if (this.tokens >= 1) { this.tokens -= 1; return true; }
    if (now - this.floodLoggedAt > 10000) {
      this.floodLoggedAt = now;
      log(`${this.label} envoie trop de messages : messages ignorés`);
    }
    return false;
  }

  allowChat() {
    const now = Date.now();
    while (this.chatTimes.length && now - this.chatTimes[0] >= CHAT_WINDOW_MS) this.chatTimes.shift();
    if (this.chatTimes.length >= CHAT_LIMIT) return false;
    this.chatTimes.push(now);
    return true;
  }
}

function newRoomCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    // Jamais un code déjà utilisé en mémoire ou par une sauvegarde sur disque (elle serait écrasée).
    if (rooms.has(code) || saveJobs.has(code) || fs.existsSync(saveFile(code))) continue;
    return code;
  }
  return null;
}

function newPlayerId() {
  let id;
  do { id = randomId('p', 4); } while (playerIds.has(id));
  playerIds.add(id);
  return id;
}

function refuse(client, message) {
  client.refused = true;
  log(`${client.label} refusé (${client.ip}) : ${message}`);
  client.send({ t: 'error', message });
  client.ws.close(1008, 'refusé');
}

function onHello(client, msg) {
  if (client.room || client.refused) return;
  if (msg.version !== PROTOCOL_VERSION) return refuse(client, 'Version incompatible');
  const name = cleanName(msg.name);
  if (name === null) return refuse(client, 'Nom invalide');
  const password = typeof msg.password === 'string' ? msg.password : '';
  if (password.length > 128) return refuse(client, 'Mot de passe trop long');
  const costume = cleanCostume(msg.costume);
  const wantsNew = msg.create === true || msg.room === undefined || msg.room === null ||
    (typeof msg.room === 'string' && msg.room.trim() === '');

  let room;
  if (wantsNew) {
    if (rooms.size >= MAX_ROOMS) return refuse(client, 'Serveur plein : trop de salons ouverts');
    const code = newRoomCode();
    if (!code) return refuse(client, 'Impossible de créer un salon');
    room = new Room({ code, mode: cleanMode(msg.mode) || 'story', seed: randomSeed(), pass: hashPassword(password), save: null });
    rooms.set(code, room);
    log(`salon ${code} créé (mode ${room.mode}${room.pass ? ', protégé' : ''}) [${rooms.size} salon(s)]`);
  } else {
    const code = normalizeCode(msg.room);
    if (!code) return refuse(client, 'Salon introuvable');
    room = rooms.get(code);
    if (room) {
      if (!checkPassword(room.pass, password)) return refuse(client, 'Mot de passe incorrect');
      if (room.size >= MAX_PLAYERS) return refuse(client, 'Salon complet');
    } else {
      let saved;
      try { saved = loadSave(code); } catch (e) {
        logError(`lecture de la sauvegarde ${code}`, e);
        return refuse(client, 'Sauvegarde du salon illisible');
      }
      if (!saved) return refuse(client, 'Salon introuvable');
      if (!checkPassword(saved.pass, password)) return refuse(client, 'Mot de passe incorrect');
      if (rooms.size >= MAX_ROOMS) return refuse(client, 'Serveur plein : trop de salons ouverts');
      room = new Room({ code, mode: saved.mode, seed: saved.seed, pass: saved.pass, save: saved.data });
      rooms.set(code, room);
      log(`salon ${code} recréé depuis sa sauvegarde (mode ${room.mode}) [${rooms.size} salon(s)]`);
    }
  }

  clearTimeout(client.helloTimer);
  client.id = newPlayerId();
  client.name = name;
  client.costume = costume;
  client.room = room;
  room.members.set(client.id, client);
  if (!room.hostId || !room.members.has(room.hostId)) room.hostId = client.id;
  log(`${client.label} a rejoint ${room.code}${client.isHost ? ' (hôte)' : ''} [${room.size}/${MAX_PLAYERS}] depuis ${client.ip}`);
  client.send({
    t: 'welcome',
    id: client.id,
    hostId: room.hostId,
    room: room.code,
    players: room.playerList(),
    mode: room.mode,
    save: room.save === undefined ? null : room.save,
    seed: room.seed,
    maxPlayers: MAX_PLAYERS,
  });
  room.broadcast({ t: 'join', player: client.info() }, client);
}

function onDisconnect(client, code) {
  clients.delete(client);
  clearTimeout(client.helloTimer);
  if (client.id) playerIds.delete(client.id);
  const room = client.room;
  if (!room) {
    if (!client.refused) log(`#${client.seq} déconnecté sans rejoindre de salon (code ${code})`);
    return;
  }
  client.room = null;
  room.members.delete(client.id);
  log(`${client.label} a quitté ${room.code} [${room.size}/${MAX_PLAYERS}] (code ${code})`);
  if (room.size === 0) {
    if (rooms.get(room.code) === room) rooms.delete(room.code);
    log(`salon ${room.code} fermé [${rooms.size} salon(s)]`);
    return;
  }
  room.broadcast({ t: 'leave', id: client.id });
  if (room.hostId === client.id) {
    // Migration d'hôte : le plus ancien membre restant prend la main.
    const next = room.members.values().next().value;
    room.hostId = next.id;
    room.broadcast({ t: 'host', id: next.id });
    log(`${room.code} : nouvel hôte ${next.label}`);
  }
}

// ─── Messages du protocole ──────────────────────────────────────────────────

function targetOf(room, to) {
  if (typeof to !== 'string' || to.length > 32) return null;
  return room.members.get(to) || null;
}

const HANDLERS = new Map([
  ['hello', onHello],

  ['ping', (c, m) => {
    const ok = (typeof m.c === 'number' && Number.isFinite(m.c)) || (typeof m.c === 'string' && m.c.length <= 64);
    c.send({ t: 'pong', c: ok ? m.c : null });
  }],

  // Action d'un client → hôte uniquement (l'hôte exécute ses propres actions localement).
  ['a', (c, m) => {
    if (c.isHost) return;
    const n = cleanEventName(m.n);
    const host = c.room.host;
    if (n && host) host.send({ t: 'a', n, p: m.p, from: c.id });
  }],

  // Effet (hôte uniquement) → un destinataire (`to`) ou tous les autres membres, jamais l'émetteur.
  ['e', (c, m) => {
    if (!c.isHost) return;
    const n = cleanEventName(m.n);
    if (!n) return;
    const out = { t: 'e', n, p: m.p, from: c.id };
    if (m.to === undefined || m.to === null || m.to === '') { c.room.broadcast(out, c); return; }
    const target = targetOf(c.room, m.to);
    if (target && target !== c) target.send(out);
  }],

  // État du joueur (position…) → les autres membres. Volatil : remplacé par le suivant.
  ['ps', (c, m) => { c.room.broadcast({ t: 'ps', s: m.s, from: c.id }, c, true); }],

  // Instantané du monde (hôte uniquement) → les autres membres. Volatil.
  ['snap', (c, m) => {
    if (!c.isHost) return;
    c.room.broadcast({ t: 'snap', s: m.s, from: c.id }, c, true);
  }],

  // État complet (hôte uniquement) → un membre.
  ['full', (c, m) => {
    if (!c.isHost) return;
    const target = targetOf(c.room, m.to);
    if (target && target !== c) target.send({ t: 'full', s: m.s, from: c.id });
  }],

  // Demande d'état complet (non-hôte) → hôte.
  ['needfull', (c) => {
    if (c.isHost) return;
    const host = c.room.host;
    if (host) host.send({ t: 'needfull', from: c.id });
  }],

  ['chat', (c, m) => {
    const text = cleanText(m.text, CHAT_MAX_CHARS);
    if (!text) return;
    if (!c.allowChat()) return; // 5 messages / 5 s : l'excédent est ignoré
    c.room.broadcast({ t: 'chat', text, channel: cleanChannel(m.channel), pos: cleanPos(m.pos), from: c.id, name: c.name }, c);
  }],

  ['save', (c, m) => {
    if (!c.isHost) return;
    const room = c.room;
    const data = m.data;
    if (data === null || typeof data !== 'object') { c.send({ t: 'error', message: 'Sauvegarde invalide' }); return; }
    const json = JSON.stringify(data);
    if (Buffer.byteLength(json) > MAX_SAVE_BYTES) {
      c.send({ t: 'error', message: 'Sauvegarde trop volumineuse (1 Mo maximum)' });
      return;
    }
    room.save = data;
    const meta = {
      format: SAVE_FORMAT,
      version: PROTOCOL_VERSION,
      code: room.code,
      mode: room.mode,
      seed: room.seed,
      password: room.pass,
      savedAt: new Date().toISOString(),
    };
    const fileJson = JSON.stringify(meta).slice(0, -1) + ',"data":' + json + '}';
    persistSave(room.code, fileJson, (err) => {
      if (err) {
        logError(`sauvegarde ${room.code}`, err);
        c.send({ t: 'error', message: 'Échec de la sauvegarde sur le serveur' });
      } else {
        c.send({ t: 'saved' });
      }
    });
  }],
]);

function onClientMessage(client, text) {
  if (client.refused || !client.allowMessage()) return;
  let msg;
  try { msg = JSON.parse(text); } catch (e) { return; }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return;
  if (!client.room && msg.t !== 'hello' && msg.t !== 'ping') return;
  const handler = HANDLERS.get(msg.t);
  if (!handler) return; // type inconnu : ignoré
  try {
    handler(client, msg);
  } catch (e) {
    // Message ignoré. Journal limité à une ligne toutes les 10 s par client (pas d'inondation des logs).
    const now = Date.now();
    if (now - client.errorLoggedAt < 10000) return;
    client.errorLoggedAt = now;
    // RangeError : structure JSON trop profonde pour être réémise (JSON.stringify) — entrée abusive, pas un bug.
    if (e instanceof RangeError) log(`${client.label} : message « ${safeLog(msg.t, 16)} » ignoré (${safeLog(e.message, 80)})`);
    else logError(`message « ${safeLog(msg.t, 16)} » de ${client.label}`, e);
  }
}

// ─── Sauvegardes (multiplayer/saves/<CODE>.json) ────────────────────────────

const saveJobs = new Map(); // code -> {running, json, callbacks, latest}

function saveFile(code) { return path.join(SAVES_DIR, `${code}.json`); }

// Écrit dans un fichier temporaire puis renomme : le fichier final est toujours complet.
async function atomicWrite(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  let fh = null;
  try {
    fh = await fsp.open(tmp, 'w', 0o600);
    await fh.writeFile(text, 'utf8');
    await fh.sync();
    await fh.close();
    fh = null;
    await fsp.rename(tmp, file);
  } catch (e) {
    if (fh) await fh.close().catch(() => {});
    await fsp.unlink(tmp).catch(() => {});
    throw e;
  }
}

// Écritures sérialisées par salon ; si plusieurs sauvegardes arrivent pendant une écriture,
// seule la plus récente est écrite ensuite (chaque demande reçoit quand même sa réponse).
function persistSave(code, json, callback) {
  let job = saveJobs.get(code);
  if (!job) {
    job = { running: false, json: null, callbacks: [], latest: null };
    saveJobs.set(code, job);
  }
  job.json = json;
  job.latest = json;
  job.callbacks.push(callback);
  if (!job.running) runSaveJob(code, job);
}

async function runSaveJob(code, job) {
  job.running = true;
  try {
    while (job.json !== null) {
      const json = job.json;
      const callbacks = job.callbacks;
      job.json = null;
      job.callbacks = [];
      let err = null;
      try { await atomicWrite(saveFile(code), json); } catch (e) { err = e; }
      if (!err) log(`${code} : sauvegarde écrite (${(Buffer.byteLength(json) / 1024).toFixed(1)} Ko)`);
      for (const cb of callbacks) {
        try { cb(err); } catch (e) { logError('rappel de sauvegarde', e); }
      }
    }
  } finally {
    job.running = false;
    if (saveJobs.get(code) === job && job.json === null) saveJobs.delete(code);
  }
}

// Lit la sauvegarde d'un salon : {mode, seed, pass, data}, null si absente, exception si illisible.
function loadSave(code) {
  let text;
  const job = saveJobs.get(code);
  if (job && job.latest) {
    text = job.latest; // écriture en cours : la version la plus récente est en mémoire
  } else {
    const file = saveFile(code);
    let st;
    try { st = fs.statSync(file); } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
      throw e;
    }
    if (!st.isFile()) return null;
    if (st.size > MAX_SAVE_BYTES * 2) throw new Error(`fichier trop volumineux (${st.size} octets)`);
    text = fs.readFileSync(file, 'utf8');
  }
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object') throw new Error('contenu invalide');
  const wrapped = obj.format === SAVE_FORMAT;
  const data = wrapped ? (obj.data === undefined ? null : obj.data) : obj;
  const meta = wrapped ? obj : (data && typeof data === 'object' ? data : {});
  let pass = null;
  if (wrapped && obj.password !== undefined && obj.password !== null) {
    if (!validPassObject(obj.password)) throw new Error('mot de passe enregistré invalide');
    pass = { salt: obj.password.salt, hash: obj.password.hash };
  }
  const seed = Number.isInteger(meta.seed) && meta.seed > 0 && meta.seed < 2 ** 32 ? meta.seed : randomSeed();
  return { mode: cleanMode(meta.mode) || 'story', seed, pass, data };
}

// ─── Fichiers statiques ─────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};
const NO_CACHE = new Set(['', '.html', '.htm', '.js', '.mjs', '.css', '.json', '.map', '.md', '.txt']);
const ERROR_TITLES = {
  400: 'Requête invalide',
  403: 'Accès refusé',
  404: 'Page introuvable',
  405: 'Méthode non autorisée',
  426: 'Connexion WebSocket attendue',
  500: 'Erreur interne du serveur',
};
const ERROR_TEXTS = {
  400: 'La requête est mal formée.',
  403: 'Cette zone est réservée au personnel.',
  404: 'Cette page n\'existe pas… ou elle s\'est perdue dans le centre commercial.',
  405: 'Seules les requêtes GET et HEAD sont acceptées.',
  426: 'Cette adresse sert au multijoueur : connectez-vous en WebSocket (ws:// ou wss://).',
  500: 'Une erreur inattendue s\'est produite.',
};

let ROOT_REAL = ROOT;
try { ROOT_REAL = fs.realpathSync(ROOT); } catch (e) { /* racine introuvable : signalé au démarrage */ }
let savesReal = null;

function isSavesPath(real) {
  if (!savesReal) {
    try { savesReal = fs.realpathSync(SAVES_DIR); } catch (e) { /* pas encore créé */ }
  }
  const p = real.toLowerCase();
  return isInside(p, SAVES_DIR.toLowerCase()) || (!!savesReal && isInside(p, savesReal.toLowerCase()));
}

function sendError(req, res, status, extraHeaders = {}) {
  if (res.headersSent) { res.destroy(); return; }
  const title = ERROR_TITLES[status] || 'Erreur';
  const text = ERROR_TEXTS[status] || '';
  const body = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${status} — ${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06070b;color:#d8d8e0;` +
    `font-family:system-ui,sans-serif;text-align:center;padding:16px;box-sizing:border-box}h1{font-size:4rem;margin:0;color:#ff3d8b}` +
    `a{color:#7fb4ff}</style></head><body><main><h1>${status}</h1><p><strong>${title}</strong></p><p>${text}</p>` +
    `<p><a href="/">Retour à l'accueil</a></p></main></body></html>`;
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function serveInfo(req, res) {
  const body = JSON.stringify({
    nuitBlanche: true,
    version: PROTOCOL_VERSION,
    maxPlayers: MAX_PLAYERS,
    rooms: Array.from(rooms.values(), (r) => ({ code: r.code, players: r.size, max: MAX_PLAYERS, mode: r.mode, locked: !!r.pass })),
  });
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function sendFile(req, res, file, st) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || (ext === '' ? 'text/plain; charset=utf-8' : 'application/octet-stream');
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': type,
    'Cache-Control': NO_CACHE.has(ext) ? 'no-cache' : 'public, max-age=3600',
    ETag: etag,
    'Last-Modified': st.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  };
  const inm = req.headers['if-none-match'];
  const ims = req.headers['if-modified-since'];
  const fresh = inm
    ? inm.split(',').some((t) => { const v = t.trim(); return v === '*' || v === etag || `W/${v}` === etag; })
    : !!ims && Date.parse(ims) >= Math.floor(st.mtimeMs / 1000) * 1000;
  if (fresh) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = fs.createReadStream(file);
  stream.on('error', (e) => { logError(`lecture de ${file}`, e); res.destroy(); });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

async function serveStatic(req, res, rawPath, search) {
  // Décodage segment par segment : « .. », fichiers cachés (.git…), séparateurs encodés refusés.
  const segs = [];
  for (const raw of rawPath.split('/')) {
    if (raw === '') continue;
    let seg;
    try { seg = decodeURIComponent(raw); } catch (e) { return sendError(req, res, 400); }
    if (seg.startsWith('.') || /[\\/:\0]/.test(seg)) return sendError(req, res, 403);
    segs.push(seg);
  }
  if (segs.length >= 2 && segs[0].toLowerCase() === 'multiplayer' && segs[1].toLowerCase() === 'saves') {
    return sendError(req, res, 403);
  }
  const target = path.join(ROOT, ...segs);
  if (!isInside(target, ROOT)) return sendError(req, res, 403);

  let real;
  let st;
  try {
    real = await fsp.realpath(target);
    st = await fsp.stat(real);
  } catch (e) {
    return sendError(req, res, e.code === 'EACCES' || e.code === 'EPERM' ? 403 : 404);
  }
  // Les liens symboliques ne doivent pas faire sortir de la racine ni mener aux sauvegardes.
  if (!isInside(real, ROOT_REAL) || isSavesPath(real)) return sendError(req, res, 403);

  if (st.isDirectory()) {
    if (!rawPath.endsWith('/')) {
      const location = '/' + segs.map(encodeURIComponent).join('/') + (segs.length ? '/' : '') + search;
      res.writeHead(301, { Location: location, 'Content-Length': 0, 'Cache-Control': 'no-cache' });
      res.end();
      return undefined;
    }
    try {
      real = await fsp.realpath(path.join(real, 'index.html'));
      st = await fsp.stat(real);
    } catch (e) {
      return sendError(req, res, 404);
    }
    if (!isInside(real, ROOT_REAL) || isSavesPath(real)) return sendError(req, res, 403);
  }
  if (!st.isFile()) return sendError(req, res, 404);
  sendFile(req, res, real, st);
  return undefined;
}

async function onRequest(req, res) {
  let rawPath = req.url || '/';
  let search = '';
  const q = rawPath.search(/[?#]/);
  if (q !== -1) {
    if (rawPath[q] === '?') search = rawPath.slice(q).split('#')[0];
    rawPath = rawPath.slice(0, q);
  }
  if (!rawPath.startsWith('/')) {
    // Forme absolue (« GET http://hote/chemin ») : on garde le chemin.
    try {
      const u = new URL(req.url);
      rawPath = u.pathname;
      search = u.search;
    } catch (e) {
      return sendError(req, res, 400);
    }
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      Allow: 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Content-Length': 0,
    });
    res.end();
    return undefined;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendError(req, res, 405, { Allow: 'GET, HEAD, OPTIONS' });
  }
  if (rawPath === '/mp-info.json') return serveInfo(req, res);
  if (rawPath === '/ws' || rawPath === '/ws/') return sendError(req, res, 426, { Upgrade: 'websocket' });
  return serveStatic(req, res, rawPath, search);
}

// ─── Poignée de main WebSocket ──────────────────────────────────────────────

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket.remoteAddress || '?';
  return safeLog(ip.replace(/^::ffff:/, ''), 46);
}

function abortHandshake(socket, status, extraHeaders = {}) {
  const body = `${status} ${http.STATUS_CODES[status] || ''}`;
  const headers = { Connection: 'close', 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...extraHeaders };
  const head = Object.keys(headers).map((k) => `${k}: ${headers[k]}`).join('\r\n');
  try {
    socket.end(`HTTP/1.1 ${status} ${http.STATUS_CODES[status] || ''}\r\n${head}\r\n\r\n${body}`);
  } catch (e) { /* socket déjà fermée */ }
  setTimeout(() => socket.destroy(), 1000).unref();
}

function onUpgrade(req, socket, head) {
  socket.on('error', () => { /* évite un plantage si la connexion est coupée pendant la poignée de main */ });
  try {
    const pathname = (req.url || '').split(/[?#]/)[0];
    if (pathname !== '/ws' && pathname !== '/ws/' && pathname !== '/') return abortHandshake(socket, 404);
    if (req.method !== 'GET') return abortHandshake(socket, 405);
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket') return abortHandshake(socket, 400);
    const connection = String(req.headers.connection || '').toLowerCase().split(',').map((s) => s.trim());
    if (!connection.includes('upgrade')) return abortHandshake(socket, 400);
    if (req.headers['sec-websocket-version'] !== '13') return abortHandshake(socket, 426, { 'Sec-WebSocket-Version': '13' });
    const key = String(req.headers['sec-websocket-key'] || '').trim();
    if (!/^[A-Za-z0-9+/]{22}==$/.test(key)) return abortHandshake(socket, 400);
    if (clients.size >= MAX_CONNECTIONS || shuttingDown) return abortHandshake(socket, 503);

    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.setNoDelay(true);
    socket.setTimeout(0);
    socket.setKeepAlive(true, 30000);

    const ws = new WsConnection(socket);
    const client = new Client(ws, clientIp(req));
    clients.add(client);
    ws.onMessage = (text) => onClientMessage(client, text);
    ws.onClose = (code) => {
      try { onDisconnect(client, code); } catch (e) { logError('déconnexion', e); }
    };
    ws.onProtocolError = (code, reason) => log(`${client.label} erreur de protocole ${code} : ${reason}`);
    log(`#${client.seq} connexion WebSocket depuis ${client.ip} [${clients.size} connexion(s)]`);
    if (head && head.length) ws._onData(head);
  } catch (e) {
    logError('poignée de main WebSocket', e);
    socket.destroy();
  }
  return undefined;
}

// ─── Battement de cœur : ping toutes les 20 s, coupure sans réponse depuis 40 s ───

function heartbeat() {
  const now = Date.now();
  for (const c of clients) {
    const ws = c.ws;
    if (ws.state === WS_CLOSED) continue;
    if (now - ws.lastSeen > PING_TIMEOUT_MS) {
      log(`${c.label} ne répond plus depuis ${Math.round((now - ws.lastSeen) / 1000)} s : déconnexion`);
      ws.terminate();
      continue;
    }
    if (now - ws.lastPing >= PING_INTERVAL_MS) ws.ping();
  }
}

// ─── Démarrage et arrêt ─────────────────────────────────────────────────────

let shuttingDown = false;
const server = http.createServer((req, res) => {
  onRequest(req, res).catch((e) => {
    logError(`HTTP ${req.method} ${safeLog(req.url, 200)}`, e);
    sendError(req, res, 500);
  });
});
server.on('upgrade', onUpgrade);
server.on('clientError', (err, socket) => {
  if (socket.writable && !socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  else socket.destroy();
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') logError('démarrage', new Error(`le port ${PORT} est déjà utilisé (variable PORT pour en choisir un autre)`));
  else logError('serveur HTTP', e);
  process.exit(1);
});

const heartbeatTimer = setInterval(heartbeat, Math.max(250, Math.min(5000, Math.floor(PING_INTERVAL_MS / 4))));

try {
  fs.mkdirSync(SAVES_DIR, { recursive: true });
  fs.accessSync(SAVES_DIR, fs.constants.W_OK);
} catch (e) {
  logError(`dossier de sauvegarde ${SAVES_DIR} inaccessible en écriture (les sauvegardes échoueront)`, e);
}
if (!fs.existsSync(ROOT)) logError('démarrage', new Error(`racine du jeu introuvable : ${ROOT}`));

server.listen(PORT, HOST, () => {
  const addr = server.address();
  const shown = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST.includes(':') ? `[${HOST}]` : HOST;
  log(`Nuit Blanche — serveur multijoueur prêt : http://${shown}:${addr.port}/ (WebSocket : /ws)`);
  log(`racine du jeu : ${ROOT} | sauvegardes : ${SAVES_DIR} | ${MAX_PLAYERS} joueurs/salon, ${MAX_ROOMS} salons max`);
});

function shutdown(signal) {
  if (shuttingDown) { process.exit(1); return; }
  shuttingDown = true;
  log(`arrêt demandé (${signal})…`);
  clearInterval(heartbeatTimer);
  server.close();
  if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
  for (const c of clients) c.ws.close(1001, 'serveur arrêté');
  const deadline = Date.now() + 3000;
  const wait = () => {
    if ((saveJobs.size > 0 || clients.size > 0) && Date.now() < deadline) { setTimeout(wait, 50); return; }
    for (const c of clients) c.ws.terminate();
    log('serveur arrêté');
    process.exit(0);
  };
  wait();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => logError('exception non interceptée', e));
process.on('unhandledRejection', (e) => logError('promesse rejetée non gérée', e));
