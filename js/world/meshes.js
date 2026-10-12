// Fabrique de formes des objets : chaque définition d'objet (js/data/items.js) est « cuite » en une seule
// BufferGeometry (couleurs par sommet + UV dans l'atlas d'étiquettes), mise en cache par id d'objet.
// Origine = centre de la boîte englobante (s[0], s[1], s[2]). meta : points d'ancrage (écran, porte, lumière…).
// Emballages : les faces étiquetées reçoivent une étiquette en couleurs réelles (atlas.pack) et un sommet blanc ;
// champs de définition utilisés : b (marque), l / label (nom imprimé), sub (variante, poids), pi (pictogramme),
// lc (fond de l'étiquette, sinon c), c2 (accent / bouchon / couvercle), pc (couleur du pictogramme), lay (mise
// en page), lk (type d'étiquette), sil (silhouette de bouteille), pk ({of, nx, nz} : lots et présentoirs).
// Budget : petits articles ≤ ~150 sommets (les étiquettes portent le détail).
import * as THREE from 'three';
import { GeoBuilder } from '../engine/geo.js';
import { mulberry32 } from '../engine/rng.js';
import { ITEMS } from '../data/items.js';

const U = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1),
  cone: new THREE.ConeGeometry(0.5, 1, 14, 1),
  sph: new THREE.SphereGeometry(0.5, 14, 10),
  sphLo: new THREE.SphereGeometry(0.5, 8, 6),
  torus: new THREE.TorusGeometry(0.4, 0.1, 6, 16),
  torusThin: new THREE.TorusGeometry(0.45, 0.05, 5, 20),
  // basses définitions des unités de présentoir (Kit.lod)
  cone6: new THREE.ConeGeometry(0.5, 1, 6, 1),
  torusLo: new THREE.TorusGeometry(0.4, 0.1, 4, 10),
  torusThinLo: new THREE.TorusGeometry(0.45, 0.05, 3, 10),
  cap: new THREE.CapsuleGeometry(0.5, 1, 4, 8),
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function mat(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s).clone();
}

// matrices courtes : TR(x, y, z), RX / RY / RZ (angle), SC(x, y, z) ; mm(a, b, …) = a × b × …
const TR = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z), RX = (a) => new THREE.Matrix4().makeRotationX(a), RY = (a) => new THREE.Matrix4().makeRotationY(a), RZ = (a) => new THREE.Matrix4().makeRotationZ(a);
const SC = (x, y, z) => new THREE.Matrix4().makeScale(x, y, z ?? y), mm = (...ms) => ms.reduce((a, b) => a.multiply(b), new THREE.Matrix4());
// contours 2D (sens trigonométrique) : rectangle arrondi (n segments par coin), ellipse
function rrect(w, h, r, n = 3, cx = 0, cy = 0) {
  r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5); if (r < 1e-5) return [[cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2], [cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2]];
  const P = []; for (const [qx, qy, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, 1.5 * Math.PI]]) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; P.push([cx + qx * (w / 2 - r) + Math.cos(a) * r, cy + qy * (h / 2 - r) + Math.sin(a) * r]); }
  return P;
}
function ellip(rx, ry, n = 12, cx = 0, cy = 0) { const P = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; P.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return P; }
function shade(c, k) {
  const r = Math.min(255, Math.max(0, ((c >> 16) & 255) * k)), g = Math.min(255, Math.max(0, ((c >> 8) & 255) * k)), b = Math.min(255, Math.max(0, (c & 255) * k));
  return (r << 16) | (g << 8) | b;
}

const _col = new THREE.Color(), _tv = new THREE.Vector3(), _tn = new THREE.Vector3();
function lin(c) { if (Array.isArray(c)) return c; _col.set(c); return [_col.r, _col.g, _col.b]; } // sRGB → linéaire (comme GeoBuilder)
const DENS = 420; // pixels d'étiquette par mètre de face
// Densité relative par type d'étiquette (cartons, bords unis et tissus n'ont pas besoin de détails fins)
const KDENS = { case: 0.5, plain: 0.6, fabric: 0.45, tray: 0.6, garment: 0.75, media: 0.8, device: 0.8, toybox: 0.8, card: 0.85, news: 0.8, mag: 0.85, spines: 0.85, book: 0.9, wrap: 0.92, box: 0.92 };
// Taille en pixels d'une étiquette fw × fh m : densité constante jusqu'à ~104 px, puis croissance ralentie (×0.4),
// plafond 176 px ; le rapport largeur/hauteur est conservé (texte non déformé).
function labelPx(kind, fw, fh, lo = 20) {
  const k = DENS * (KDENS[kind] ?? 1); const w0 = fw * k, h0 = fh * k, m = Math.max(w0, h0, 1);
  const t = Math.min(176, m <= 104 ? m : 104 + (m - 104) * 0.4), sc = t / m;
  return [Math.max(lo, Math.round(w0 * sc)), Math.max(lo, Math.round(h0 * sc))];
}
function mixc(a, b, t) { return (Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | Math.round((a & 255) * (1 - t) + (b & 255) * t); }
// Informations de dessin d'une étiquette à partir de la définition
function packInfo(d, kind, extra) {
  return Object.assign({ kind, brand: d.b, name: d.l ?? d.label ?? d.name, sub: d.sub, picto: d.pi, bg: d.lc ?? d.c, fg: d.fg, accent: d.c2, pc: d.pc, layout: d.lay, promo: d.promo, pat: d.pat, style: d.gs, n: d.pn, photo: d.photo }, extra);
}

// Kit de construction relatif au centre de l'objet
class Kit {
  constructor(b, atlas) { this.b = b; this.atlas = atlas; this.white = atlas.white(); this.meta = {}; this.T = null; this.N = null; this.lod = 0; }
  // ── primitives brutes (sommets poussés directement, normales et UV maîtrisées) ──
  setT(m) { this.T = m || null; this.N = m ? new THREE.Matrix3().getNormalMatrix(m) : null; return this; }
  vtx(x, y, z, nx, ny, nz, u, v, col) {
    if (this.T) { _tv.set(x, y, z).applyMatrix4(this.T); x = _tv.x; y = _tv.y; z = _tv.z; _tn.set(nx, ny, nz).applyMatrix3(this.N).normalize(); nx = _tn.x; ny = _tn.y; nz = _tn.z; }
    this.b._pushVert(x, y, z, nx, ny, nz, u, v, col);
  }
  // quadrilatère vu de l'extérieur : p0 bas-gauche, p1 bas-droite, p2 haut-droite, p3 haut-gauche (texte lisible)
  quad(p0, p1, p2, p3, c, r) {
    r = r || this.white; const col = lin(c);
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2], bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const o = this.b.vertexCount;
    this.vtx(p0[0], p0[1], p0[2], nx, ny, nz, r.u0, r.v0, col); this.vtx(p1[0], p1[1], p1[2], nx, ny, nz, r.u1, r.v0, col);
    this.vtx(p2[0], p2[1], p2[2], nx, ny, nz, r.u1, r.v1, col); this.vtx(p3[0], p3[1], p3[2], nx, ny, nz, r.u0, r.v1, col);
    this.b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    return this;
  }
  // boîte à étiquettes par face (F : rectangles UV, C : couleurs ; une face étiquetée est blanche par défaut). skip : faces omises
  pbox(x, y, z, w, h, d, c, F = {}, C = {}, skip = '') {
    const hx = w / 2, hy = h / 2, hz = d / 2, P = (a, b, e) => [x + a * hx, y + b * hy, z + e * hz];
    const col = (f) => C[f] ?? (F[f] ? 0xffffff : c);
    if (!skip.includes('Z')) this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), col('Z'), F.Z);
    if (!skip.includes('z')) this.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), col('z'), F.z);
    if (!skip.includes('X')) this.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), col('X'), F.X);
    if (!skip.includes('x')) this.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), col('x'), F.x);
    if (!skip.includes('Y')) this.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), col('Y'), F.Y);
    if (!skip.includes('y')) this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), col('y'), F.y);
    return this;
  }
  // Surface de révolution. rings : [{r, rz?, y, p, h?}] du bas vers le haut ; p = partie du segment qui MÈNE à cet
  // anneau ; parts : {clé: {c, rect}}. L'avant (+z) est au milieu de l'étiquette (u = 0,5). Une bande d'étiquette
  // couvre toute la longueur de sa suite de segments. h : arête vive à cet anneau (normales non lissées de part et
  // d'autre : bord de bouchon, lèvre, épaulement net). o.bottom / o.top : couleur des fonds (null = ouvert),
  // o.topRect : étiquette du dessus (disque).
  lathe(rings, segs, parts, o = {}) {
    if (this.lod) segs = Math.min(segs, 6);
    const n = rings.length, P = (i, j) => { const R = rings[i], f = 2 * Math.PI * (j / segs - 0.5); return [Math.max(1e-4, R.r) * Math.sin(f), R.y, Math.max(1e-4, R.rz ?? R.r) * Math.cos(f)]; };
    let r0 = 0, r1 = n - 1; // suite de segments en cours (bornes des normales aux arêtes vives)
    const nor = (i, j) => {
      const a = P(i, (j + 1) % segs), b = P(i, (j - 1 + segs) % segs), up = P(i === r1 && rings[i].h ? i : Math.min(n - 1, i + 1), j), dn = P(i === r0 && rings[i].h ? i : Math.max(0, i - 1), j);
      const tx = a[0] - b[0], ty = a[1] - b[1], tz = a[2] - b[2], ux = up[0] - dn[0], uy = up[1] - dn[1], uz = up[2] - dn[2];
      let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux; const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return [0, i === 0 ? -1 : 1, 0]; return [nx / l, ny / l, nz / l];
    };
    let k = 1;
    while (k < n) {
      const pk = rings[k].p; let e = k; while (e + 1 < n && rings[e + 1].p === pk && !rings[e].h) e++;
      const part = parts[pk] || { c: 0xffffff }; const r = part.rect || this.white; const col = lin(part.c ?? 0xffffff);
      const y0 = rings[k - 1].y, y1 = rings[e].y, base = this.b.vertexCount; r0 = k - 1; r1 = e;
      for (let i = k - 1; i <= e; i++) {
        const t = y1 > y0 ? (rings[i].y - y0) / (y1 - y0) : 0, vv = r.v0 + (r.v1 - r.v0) * t;
        for (let j = 0; j <= segs; j++) { const p = P(i, j % segs), nn = nor(i, j % segs); this.vtx(p[0], p[1], p[2], nn[0], nn[1], nn[2], r.u0 + (r.u1 - r.u0) * (j / segs), vv, col); }
      }
      const rowN = segs + 1;
      for (let i = 0; i < e - k + 1; i++) for (let j = 0; j < segs; j++) { const a = base + i * rowN + j, b = a + 1, c2 = a + rowN + 1, d = a + rowN; this.b.idx.push(a, b, c2, a, c2, d); }
      k = e + 1;
    }
    const cap = (i, color, up, rect) => {
      if (color == null) return; const col = lin(color), o = this.b.vertexCount;
      for (let j = 0; j < segs; j++) {
        const p = P(i, j); let u = 0, v = 0;
        if (rect) { const f = 2 * Math.PI * (j / segs - 0.5); u = rect.u0 + (rect.u1 - rect.u0) * (0.5 + 0.5 * Math.sin(f)); v = rect.v0 + (rect.v1 - rect.v0) * (0.5 + 0.5 * Math.cos(f) * (up ? -1 : 1)); } else { u = this.white.u0; v = this.white.v0; }
        this.vtx(p[0], p[1], p[2], 0, up ? 1 : -1, 0, u, v, col);
      }
      for (let j = 1; j < segs - 1; j++) up ? this.b.idx.push(o, o + j, o + j + 1) : this.b.idx.push(o, o + j + 1, o + j);
    };
    cap(0, o.bottom, false, o.bottomRect); cap(n - 1, o.top, true, o.topRect);
    return this;
  }
  // Ellipsoïde basse définition (segs × rings), via lathe
  blob(x, y, z, rx, ry, rz, c, segs = 6, rings = 4) {
    const R = []; for (let i = 0; i <= rings; i++) { const t = Math.PI * i / rings; R.push({ r: rx * Math.sin(t), rz: rz * Math.sin(t), y: -ry * Math.cos(t), p: 'a' }); }
    const T = this.T; const m = new THREE.Matrix4().makeTranslation(x, y, z); this.setT(T ? T.clone().multiply(m) : m);
    this.lathe(R, segs, { a: { c } }); this.setT(T);
    return this;
  }
  // Cylindre basse définition (axe y), étiquette facultative sur le flanc
  tube(x, y, z, r, h, c, segs = 8, o = {}) {
    const T = this.T; const m = new THREE.Matrix4().makeTranslation(x, y, z); if (o.m) m.multiply(o.m); this.setT(T ? T.clone().multiply(m) : m);
    this.lathe([{ r, rz: o.rz, y: -h / 2 }, { r: o.r1 ?? r, rz: o.rz1 ?? o.rz, y: h / 2, p: 'a' }], segs, { a: { c: o.rect ? 0xffffff : c, rect: o.rect } }, { bottom: o.open ? null : (o.bc ?? c), top: o.open ? null : (o.tc ?? c), topRect: o.topRect });
    this.setT(T); return this;
  }
  // Copie d'une géométrie déjà cuite (couleurs et UV conservées) avec une matrice
  copyGeo(g, m) {
    const P = g.attributes.position, N = g.attributes.normal, Uv = g.attributes.uv, Co = g.attributes.color; const o = this.b.vertexCount;
    const T = this.T; this.setT(T ? T.clone().multiply(m) : m);
    const pa = P.array, na = N.array, ua = Uv.array, ca = Co ? Co.array : null, cc = [1, 1, 1]; // accès directs, couleur réutilisée (copiée par _pushVert)
    for (let i = 0, j = 0; i < P.count; i++, j += 3) { if (ca) { cc[0] = ca[j]; cc[1] = ca[j + 1]; cc[2] = ca[j + 2]; } this.vtx(pa[j], pa[j + 1], pa[j + 2], na[j], na[j + 1], na[j + 2], ua[i * 2], ua[i * 2 + 1], cc); }
    for (let i = 0; i < g.index.count; i++) this.b.idx.push(o + g.index.getX(i));
    this.setT(T); return this;
  }
  // ── formes libres ──
  // Surface paramétrique : P(u, v) → [x, y, z], u ∈ [0, 1] autour (fermée sauf o.open), v ∈ [0, 1] de bas en haut
  // (même sens que lathe : la normale u × v sort de la forme, u = 0,5 à l'avant). Normales lissées (moyenne des faces
  // voisines, pôles compris). o.col(u, v, p) → couleur par sommet (sinon c) ; o.rect : étiquette (u, v → rectangle) ;
  // o.flip : face intérieure.
  surf(nu, nv, P, c, o = {}) {
    if (this.lod) { nu = Math.max(3, Math.ceil(nu * 0.6)); nv = Math.max(1, Math.ceil(nv * 0.6)); }
    const open = !!o.open, cu = open ? nu + 1 : nu, G = [], N = new Float64Array(cu * (nv + 1) * 3);
    for (let j = 0; j <= nv; j++) for (let i = 0; i < cu; i++) G.push(P(i / nu, j / nv));
    const id = (i, j) => j * cu + (open ? i : i % nu);
    const tri = (a, b, e) => {
      const A = G[a], B = G[b], E = G[e], ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = E[0] - A[0], vy = E[1] - A[1], vz = E[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const q of [a, b, e]) { N[q * 3] += nx; N[q * 3 + 1] += ny; N[q * 3 + 2] += nz; }
    };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = id(i, j), b = id(i + 1, j), e = id(i + 1, j + 1), f = id(i, j + 1); tri(a, b, e); tri(a, e, f); }
    // pôle d'une surface ouverte (seulement des triangles dégénérés) : normale du voisin de la rangée
    for (let j = 0; j <= nv; j++) for (let i = 0; i < cu; i++) { const q = j * cu + i; if (Math.abs(N[q * 3]) + Math.abs(N[q * 3 + 1]) + Math.abs(N[q * 3 + 2]) < 1e-12) { const r = j * cu + (i > 0 ? i - 1 : Math.min(cu - 1, i + 1)); N[q * 3] = N[r * 3]; N[q * 3 + 1] = N[r * 3 + 1]; N[q * 3 + 2] = N[r * 3 + 2]; } }
    const r = o.rect, wc = c == null ? null : lin(c), sg = o.flip ? -1 : 1, base = this.b.vertexCount;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const q = id(i, j), p = G[q]; let nx = N[q * 3], ny = N[q * 3 + 1], nz = N[q * 3 + 2]; const l = Math.hypot(nx, ny, nz) || 1;
      const u = i / nu, v = j / nv, col = o.col ? lin(o.col(u, v, p)) : wc;
      this.vtx(p[0], p[1], p[2], sg * nx / l, sg * ny / l, sg * nz / l, r ? r.u0 + (r.u1 - r.u0) * u : this.white.u0, r ? r.v0 + (r.v1 - r.v0) * v : this.white.v0, col);
    }
    const row = nu + 1;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = base + j * row + i, b = a + 1, e = a + row + 1, f = a + row; o.flip ? this.b.idx.push(a, e, b, a, f, e) : this.b.idx.push(a, b, e, a, e, f); }
    return this;
  }
  // Ellipsoïde (centre x, y, z ; demi-axes rx, ry, rz) : o.f(u, v, p) → p déforme le point (creux, bosses, pointes),
  // o.col comme surf ; o.e = [ev, eh] : superellipsoïde (exposants < 1 : pavé aux bords arrondis, viennoiseries,
  // savons, coussins). Même paramétrage que lathe (u = 0,5 face à +z, v = 0 en bas).
  orb(x, y, z, rx, ry, rz, c, nu = 10, nv = 7, o = {}) {
    const [ev, eh] = o.e || [1, 1], sp = (w, e) => (e === 1 ? w : Math.sign(w) * Math.pow(Math.abs(w), e));
    return this.surf(nu, nv, (u, v) => {
      const a = 2 * Math.PI * (u - 0.5), t = Math.PI * v, s = sp(Math.sin(t), ev); let p = [rx * s * sp(Math.sin(a), eh), -ry * sp(Math.cos(t), ev), rz * s * sp(Math.cos(a), eh)];
      if (o.f) p = o.f(u, v, p); return [x + p[0], y + p[1], z + p[2]];
    }, c, o);
  }
  // Tube le long d'une polyligne pts ([x, y, z]…), repères à transport parallèle ; r : rayon (nombre ou fonction
  // r(t) avec t ∈ [0, 1] le long du tube), rz : aplatissement de la section ; o.nu : segments de la section ;
  // o.cap0 / o.cap1 : disques de fermeture ; o.col(u, t) ; o.up : vecteur de référence de la section.
  sweep(pts, r, c, o = {}) {
    const n = pts.length, nu = this.lod ? Math.min(o.nu || 6, 4) : o.nu || 6, T = [], Nn = [], Bn = [], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }, crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    for (let i = 0; i < n; i++) T.push(nrm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
    let N0 = o.up ? crs(crs(T[0], o.up), T[0]) : crs(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    N0 = nrm(N0);
    for (let i = 0; i < n; i++) { if (i) { const p = Nn[i - 1], t = T[i], k = p[0] * t[0] + p[1] * t[1] + p[2] * t[2]; N0 = nrm([p[0] - k * t[0], p[1] - k * t[1], p[2] - k * t[2]]); } Nn.push(N0); Bn.push(crs(T[i], N0)); }
    const R = typeof r === 'function' ? r : () => r, rz = o.rz ?? 1;
    const ring = (j, u) => { const a = 2 * Math.PI * u, rr = R(j / (n - 1)), ca = Math.cos(a) * rr, sa = Math.sin(a) * rr * rz, p = pts[j], N = Nn[j], B = Bn[j]; return [p[0] + ca * N[0] + sa * B[0], p[1] + ca * N[1] + sa * B[1], p[2] + ca * N[2] + sa * B[2]]; };
    this.surf(nu, n - 1, (u, v) => ring(Math.round(v * (n - 1)), u), c, { col: o.col ? (u, v) => o.col(u, v) : null, rect: o.rect });
    const cap = (j, s) => { const o2 = this.b.vertexCount, col = lin(c), t = T[j]; for (let i = 0; i < nu; i++) { const p = ring(j, i / nu); this.vtx(p[0], p[1], p[2], s * t[0], s * t[1], s * t[2], this.white.u0, this.white.v0, col); } for (let i = 1; i < nu - 1; i++) s > 0 ? this.b.idx.push(o2, o2 + i, o2 + i + 1) : this.b.idx.push(o2, o2 + i + 1, o2 + i); };
    if (o.cap0) cap(0, -1); if (o.cap1) cap(n - 1, 1);
    return this;
  }
  // Prisme : contour 2D [[x, y]…] (trous facultatifs : o.holes) extrudé sur l'épaisseur d (z ∈ [-d/2, d/2]).
  // o.bev : chanfrein des arêtes avant et arrière (normales arrondies) ; o.F / o.B : étiquettes des faces avant /
  // arrière (projetées sur la boîte du contour) ; o.cs : couleur du chant ; o.cb : couleur du dos ; o.smooth : chant
  // lissé entre arêtes voisines de moins de ~40° (contours courbes) ; o.back === false : pas de face arrière.
  prism(pts, d, c, o = {}) {
    const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    const C0 = area(pts) < 0 ? pts.slice().reverse() : pts, H0 = (o.holes || []).map((h) => (area(h) > 0 ? h.slice().reverse() : h));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of C0) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const hz = d / 2, bv = this.lod ? 0 : Math.min(o.bev || 0, hz * 0.9);
    // contour décalé vers l'intérieur de b (onglets bornés) pour les faces chanfreinées
    const inset = (P, b) => P.map((p, i) => {
      const a = P[(i - 1 + P.length) % P.length], q = P[(i + 1) % P.length]; let e1 = [p[0] - a[0], p[1] - a[1]], e2 = [q[0] - p[0], q[1] - p[1]]; const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
      const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2]; let mx = n1[0] + n2[0], my = n1[1] + n2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
      const k = Math.min(3, 1 / Math.max(0.3, mx * n1[0] + my * n1[1])); return [p[0] + mx * b * k, p[1] + my * b * k];
    });
    const face = (C, Hs, z, s, rect, col) => {
      const v2 = (P) => P.map((p) => new THREE.Vector2(p[0], p[1])), all = [...C, ...Hs.flat()], tris = THREE.ShapeUtils.triangulateShape(v2(C), Hs.map(v2));
      const o2 = this.b.vertexCount, cl = lin(col);
      for (const p of all) { const u = rect ? rect.u0 + (rect.u1 - rect.u0) * (s > 0 ? (p[0] - x0) / (x1 - x0 || 1) : (x1 - p[0]) / (x1 - x0 || 1)) : this.white.u0, v = rect ? rect.v0 + (rect.v1 - rect.v0) * (p[1] - y0) / (y1 - y0 || 1) : this.white.v0; this.vtx(p[0], p[1], z, 0, 0, s, u, v, cl); }
      for (const t of tris) { const A = all[t[0]], B = all[t[1]], E = all[t[2]], cw = (B[0] - A[0]) * (E[1] - A[1]) - (B[1] - A[1]) * (E[0] - A[0]); (cw > 0) === (s > 0) ? this.b.idx.push(o2 + t[0], o2 + t[1], o2 + t[2]) : this.b.idx.push(o2 + t[0], o2 + t[2], o2 + t[1]); }
    };
    const fc = o.F ? 0xffffff : c, bc = o.B ? 0xffffff : (o.cb ?? c), cs = lin(o.cs ?? c);
    const iC = bv ? inset(C0, bv) : C0, iH = bv ? H0.map((h) => inset(h, bv)) : H0;
    face(iC, iH, hz, 1, o.F, fc); if (o.back !== false) face(iC, iH, -hz, -1, o.B, bc);
    // chant (+ chanfreins) : normales par arête, lissées aux sommets peu anguleux si o.smooth (sommets partagés)
    const side = (P, IP) => {
      const m = P.length, En = [], NL = [], NR = [], w = this.white, za = hz - bv;
      for (let i = 0; i < m; i++) { const p = P[i], q = P[(i + 1) % m], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; En.push([(q[1] - p[1]) / l, -(q[0] - p[0]) / l]); }
      for (let i = 0; i < m; i++) { const a = En[(i - 1 + m) % m], b = En[i]; if (o.smooth && a[0] * b[0] + a[1] * b[1] >= 0.76) { const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1; NL[i] = NR[i] = [x / l, y / l]; } else { NL[i] = a; NR[i] = b; } }
      const ring = (z, nz, col) => { const R = [], Lf = []; for (let i = 0; i < m; i++) { const p = P[i]; R[i] = this.b.vertexCount; this.vtx(p[0], p[1], z, NR[i][0] * (1 - Math.abs(nz)), NR[i][1] * (1 - Math.abs(nz)), nz, w.u0, w.v0, col); if (NL[i] === NR[i]) Lf[i] = R[i]; else { Lf[i] = this.b.vertexCount; this.vtx(p[0], p[1], z, NL[i][0], NL[i][1], nz, w.u0, w.v0, col); } } return [R, Lf]; };
      const [b0, b0L] = ring(-za, 0, cs), [t0, t0L] = ring(za, 0, cs);
      for (let i = 0; i < m; i++) { const j = (i + 1) % m; this.b.idx.push(b0[i], b0L[j], t0L[j], b0[i], t0L[j], t0[i]); }
      if (bv) for (const s of [1, -1]) {
        const cf = s > 0 ? lin(fc) : lin(bc), [oR, oL] = s > 0 ? [t0, t0L] : [b0, b0L], inn = [];
        for (let i = 0; i < m; i++) { inn[i] = this.b.vertexCount; this.vtx(IP[i][0], IP[i][1], s * hz, 0, 0, s, w.u0, w.v0, cf); }
        for (let i = 0; i < m; i++) { const j = (i + 1) % m; s > 0 ? this.b.idx.push(oR[i], oL[j], inn[j], oR[i], inn[j], inn[i]) : this.b.idx.push(oR[i], inn[j], oL[j], oR[i], inn[i], inn[j]); }
      }
    };
    if (o.side !== false) { side(C0, iC); H0.forEach((h, i) => side(h, iH[i])); }
    return this;
  }
  // Boîte aux arêtes adoucies (chanfrein r, normales arrondies : le reflet court le long des arêtes) avec étiquettes
  // par face comme pbox (F : rectangles UV, C : couleurs, skip : faces omises). L'étiquette couvre la face plane,
  // son liseré se prolonge sur le chanfrein.
  rbox(x, y, z, w, h, d, c, r, F = {}, C = {}, skip = '') {
    if (this.lod) return this.pbox(x, y, z, w, h, d, c, F, C, skip);
    const hx = w / 2, hy = h / 2, hz = d / 2; r = Math.max(0, Math.min(r, hx * 0.45, hy * 0.45, hz * 0.45));
    if (r < 1e-4) return this.pbox(x, y, z, w, h, d, c, F, C, skip);
    const E = [hx - r, hy - r, hz - r], white = this.white, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    // repère de chaque face : normale, axe u, axe v (mêmes orientations que pbox)
    const FD = { Z: [[0, 0, 1], [1, 0, 0], [0, 1, 0]], z: [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], X: [[1, 0, 0], [0, 0, -1], [0, 1, 0]], x: [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], Y: [[0, 1, 0], [1, 0, 0], [0, 0, -1]], y: [[0, -1, 0], [1, 0, 0], [0, 0, 1]] };
    // sommet de la face f au-dessus du point p de la boîte intérieure (étiquette étalée sur la face plane)
    const V = (f, p, fu = f) => {
      const n = FD[f][0], [, U, W] = FD[fu], R = F[fu] || white, cl = lin(C[fu] ?? (F[fu] ? 0xffffff : c));
      const u = Math.min(1, Math.max(0, (dot(U, p) / (Math.abs(dot(U, E)) || 1) + 1) / 2)), v = Math.min(1, Math.max(0, (dot(W, p) / (Math.abs(dot(W, E)) || 1) + 1) / 2));
      this.vtx(x + p[0] + n[0] * r, y + p[1] + n[1] * r, z + p[2] + n[2] * r, n[0], n[1], n[2], R.u0 + (R.u1 - R.u0) * u, R.v0 + (R.v1 - R.v0) * v, cl);
    };
    for (const f of 'ZzXxYy') { // faces planes
      if (skip.includes(f)) continue; const [n, U, W] = FD[f], o2 = this.b.vertexCount;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) V(f, [0, 1, 2].map((k) => (U[k] * su + W[k] * sv + n[k]) * E[k]));
      this.b.idx.push(o2, o2 + 1, o2 + 2, o2, o2 + 2, o2 + 3);
    }
    // arêtes : bande entre deux faces voisines (12) ; coins : triangle entre trois faces (8)
    const fs = (axis, s) => (axis === 0 ? (s > 0 ? 'X' : 'x') : axis === 1 ? (s > 0 ? 'Y' : 'y') : (s > 0 ? 'Z' : 'z')), pick = (...q) => q.find((f) => F[f]) ?? q[0];
    for (let a = 0; a < 3; a++) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      const b1 = (a + 1) % 3, b2 = (a + 2) % 3, o2 = this.b.vertexCount;
      const p = (t) => { const q = [0, 0, 0]; q[a] = t * E[a]; q[b1] = s1 * E[b1]; q[b2] = s2 * E[b2]; return q; };
      const f1 = fs(b1, s1), f2 = fs(b2, s2), fu = pick(f1, f2); V(f1, p(-1), fu); V(f1, p(1), fu); V(f2, p(1), fu); V(f2, p(-1), fu);
      // la bande regarde vers l'extérieur si e_a × (n2 − n1) va dans le sens de n1 + n2
      const d1 = [0, 0, 0]; d1[b1] = -s1; d1[b2] = s2; const cr = [0, 0, 0]; cr[(a + 1) % 3] = -d1[(a + 2) % 3]; cr[(a + 2) % 3] = d1[(a + 1) % 3];
      cr[b1] * s1 + cr[b2] * s2 > 0 ? this.b.idx.push(o2, o2 + 1, o2 + 2, o2, o2 + 2, o2 + 3) : this.b.idx.push(o2, o2 + 2, o2 + 1, o2, o2 + 3, o2 + 2);
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const p = [sx * E[0], sy * E[1], sz * E[2]], o2 = this.b.vertexCount, fx = fs(0, sx), fy = fs(1, sy), fz = fs(2, sz), fu = pick(fx, fy, fz); V(fx, p, fu); V(fy, p, fu); V(fz, p, fu);
      sx * sy * sz > 0 ? this.b.idx.push(o2, o2 + 1, o2 + 2) : this.b.idx.push(o2, o2 + 2, o2 + 1);
    }
    return this;
  }
  // Boîte aux seules arêtes verticales adoucies (cartons, emballages) : 48 sommets au lieu de 96, dessus et dessous
  // octogonaux ; étiquettes (F), couleurs (C) et faces omises (skip) comme pbox. Chaque chanfrein prolonge le bord
  // de l'étiquette de la face qui le précède.
  vbox(x, y, z, w, h, d, c, r, F = {}, C = {}, skip = '') {
    const hx = w / 2, hy = h / 2, hz = d / 2; r = Math.max(0, Math.min(r, hx * 0.45, hz * 0.45));
    if (this.lod || r < 1e-4) return this.pbox(x, y, z, w, h, d, c, F, C, skip);
    const W = this.white, col = (f) => lin(C[f] ?? (F[f] ? 0xffffff : c)), q = (px, py, pz, n, u, v, cl) => this.vtx(x + px, y + py, z + pz, n[0], 0, n[1], u, v, cl);
    const sides = [['Z', [-hx + r, hz], [hx - r, hz], [0, 1]], ['X', [hx, hz - r], [hx, -hz + r], [1, 0]], ['z', [hx - r, -hz], [-hx + r, -hz], [0, -1]], ['x', [-hx, -hz + r], [-hx, hz - r], [-1, 0]]];
    for (let i = 0; i < 4; i++) {
      const [f, a, b, n] = sides[i], [f2, a2, , n2] = sides[(i + 1) % 4], R = F[f] || W, cl = col(f);
      if (!skip.includes(f)) { const o = this.b.vertexCount; q(a[0], -hy, a[1], n, R.u0, R.v0, cl); q(b[0], -hy, b[1], n, R.u1, R.v0, cl); q(b[0], hy, b[1], n, R.u1, R.v1, cl); q(a[0], hy, a[1], n, R.u0, R.v1, cl); this.b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3); }
      if (skip.includes(f) && skip.includes(f2)) continue;
      const o = this.b.vertexCount; q(b[0], -hy, b[1], n, R.u1, R.v0, cl); q(a2[0], -hy, a2[1], n2, R.u1, R.v0, cl); q(a2[0], hy, a2[1], n2, R.u1, R.v1, cl); q(b[0], hy, b[1], n, R.u1, R.v1, cl); this.b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const oct = [[-hx + r, hz], [hx - r, hz], [hx, hz - r], [hx, -hz + r], [hx - r, -hz], [-hx + r, -hz], [-hx, -hz + r], [-hx, hz - r]];
    for (const [f, sy] of [['Y', 1], ['y', -1]]) {
      if (skip.includes(f)) continue; const R = F[f] || W, cl = col(f), o = this.b.vertexCount;
      for (const [px, pz] of oct) { const u = (px + hx) / w, v = sy > 0 ? (hz - pz) / d : (pz + hz) / d; this.vtx(x + px, y + sy * hy, z + pz, 0, sy, 0, R.u0 + (R.u1 - R.u0) * u, R.v0 + (R.v1 - R.v0) * v, cl); }
      for (let i = 1; i < 7; i++) sy > 0 ? this.b.idx.push(o, o + i, o + i + 1) : this.b.idx.push(o, o + i + 1, o + i);
    }
    return this;
  }
  // étiquette d'emballage en couleurs réelles pour une face de fw × fh mètres
  pk(d, kind, fw, fh, extra = {}, key = null, lo = 20) { if (!this.atlas.pack) return this.white; const [w, h] = labelPx(kind, fw, fh, lo); return this.atlas.pack(key || (d.id + ':' + kind), w, h, packInfo(d, kind, extra)); }
  shared(key, w, h, info) { return this.atlas.pack ? this.atlas.pack(key, w, h, info) : this.white; }
  // primitives three.js (le repère courant setT s'applique aussi)
  _M(m) { return this.T ? this.T.clone().multiply(m) : m; }
  box(x, y, z, w, h, d, c, opts = {}) { this.b.box(x, y, z, w, h, d, { color: c, flat: true, rotY: opts.ry || 0, matrix: this.T ? (opts.m ? this.T.clone().multiply(opts.m) : this.T) : opts.m, label: opts.label, faces: opts.faces }); return this; }
  boxR(x, y, z, w, h, d, c, rx, ry, rz) { this.b.geometry(U.box, this._M(mat(x, y, z, w, h, d, rx, ry, rz)), { color: c, rect: this.white }); return this; }
  cyl(x, y, z, r, h, c, rx = 0, ry = 0, rz = 0, lo = false) { this.b.geometry(lo || this.lod ? U.cyl8 : U.cyl, this._M(mat(x, y, z, r * 2, h, r * 2, rx, ry, rz)), { color: c, rect: this.white }); return this; }
  cylS(x, y, z, rx_, h, rz_, c, ax = 0, ay = 0, az = 0) { this.b.geometry(this.lod ? U.cyl8 : U.cyl, this._M(mat(x, y, z, rx_ * 2, h, rz_ * 2, ax, ay, az)), { color: c, rect: this.white }); return this; }
  cone(x, y, z, r, h, c, rx = 0, ry = 0, rz = 0) { this.b.geometry(this.lod ? U.cone6 : U.cone, this._M(mat(x, y, z, r * 2, h, r * 2, rx, ry, rz)), { color: c, rect: this.white }); return this; }
  sph(x, y, z, rx, ry, rz, c, lo = false) { this.b.geometry(lo || this.lod ? U.sphLo : U.sph, this._M(mat(x, y, z, rx * 2, ry * 2, rz * 2)), { color: c, rect: this.white }); return this; }
  torus(x, y, z, r, c, rx = Math.PI / 2, ry = 0, rz = 0, thin = false, sy = 1) { this.b.geometry(thin ? (this.lod ? U.torusThinLo : U.torusThin) : (this.lod ? U.torusLo : U.torus), this._M(mat(x, y, z, r * 2.2, r * 2.2 * sy, r * 2.2, rx, ry, rz)), { color: c, rect: this.white }); return this; }
  cap(x, y, z, r, len, c, rx = 0, ry = 0, rz = 0) { this.b.geometry(U.cap, this._M(mat(x, y, z, r * 2, len / 2, r * 2, rx, ry, rz)), { color: c, rect: this.white }); return this; }
  label(key, text, color, style) { return this.atlas.label(key, text, color, style); }
}

const SHAPES = {};
function S(names, fn) { for (const n of names.split(',')) SHAPES[n.trim()] = fn; }
// Formes ajoutées par d'autres modules (décor du centre…) : fn(kit, s, couleur, définition)
const EXTERNAL = new Set();
export function registerShape(names, fn) { S(names, fn); for (const n of names.split(',')) EXTERNAL.add(n.trim()); }

// ───────── génériques ─────────
// Habillage des anciens articles étiquetés (emballages en couleurs réelles) : type d'étiquette, marque, pictogramme
const LEGACY = {
  cereal: ['box', 'Matinal', 'bowl'], bread: ['box', 'Fournil Doré', 'bread'], chocolate: ['box', 'Mireille', 'choco'], pasta: ['box', 'Pastavia', 'pasta'],
  frozen_pizza: ['box', 'Grand Froid', 'pizza'], sugar: ['box', 'Sucrerie du Nord', 'sparkle'], coffee_pack: ['box', 'Arôme Noir', 'bean'], tea: ['box', 'Thé des Brumes', 'tea'],
  macarons: ['box', 'Maison Rose', 'heart'], nuggets: ['box', 'Big Burger', 'chicken'], lego: ['toybox', 'Joué-Club Hélios', 'cube'], puzzle: ['toybox', 'Ravenel', 'puzzle'],
  board_game: ['toybox', 'Jeux Lunaires', 'ghost'], toy_blocks: ['box', 'Bois & Malice', 'cube'], light_bulbs: ['box', 'Lumina', 'bulb'], game_box: ['media', 'PIXEL', 'pad'],
  shoe_box: ['shoebox', 'Pas de Deux'], candle_set: ['box', 'Cire & Mèche', 'flame'], pizza_box: ['box', 'Pizzeria Napoli', 'pizza'], cardboard_box: ['case', 'HÉLIOS'],
  soda: ['wrap', 'Hélios', 'bubbles'], lemonade: ['wrap', 'Limonaderie Dubois', 'lemon'], energy_drink: ['wrap', 'VOLT', 'bolt'], canned_food: ['wrap', 'Bonne Table', 'soup'],
  hot_ravioli: ['wrap', 'Bonne Table', 'soup'], green_tea: ['wrap', 'Zen', 'leaf'], deodorant: ['wrap', 'Fraîcheur Alpine', 'snow'], hair_spray: ['wrap', 'Tif\'Hair', 'sparkle'],
  air_horn: ['wrap', 'Tonnerre', 'bolt'], paint_can: ['wrap', 'Couleurs Martin', 'paint'], milk: ['box', 'Laiterie Clément', 'cow'], juice: ['box', 'Fruitéa', 'orange'],
  chips: ['bag', 'Croustil', 'chips'], flour: ['bag', 'Moulin de Lune', 'wheat'], cat_food: ['bag', 'Miaou', 'cat'], ice_bag: ['bag', 'Banquise', 'snow'], marshmallow: ['bag', 'Sucrette', 'candy'],
  bird_seed: ['bag', 'Arche de Noé', 'wheat'], water: ['wrap', 'Source des Aiguilles', 'mountain'], bleach: ['wrap', 'Javelor', 'sparkle'], cough_syrup: ['wrap', 'Pharmalys', 'cross'],
  sanitizer: ['wrap', 'Pharmalys', 'drop'], sunscreen: ['wrap', 'Soleil d\'Été', 'sun'], wd40: ['wrap', 'Dégripp\'Tout', 'tool'], shampoo: ['wrap', 'Brillance', 'drop'],
  contact_lens: ['wrap', 'Clairvoyance', 'eye'], ketchup: ['wrap', 'Tomatissima', 'tomato'], baby_bottle: ['wrap', 'Bébé Câlin', 'baby'], honey: ['wrap', 'Rucher du Val', 'flower'],
  jam: ['wrap', 'Mère Odile', 'strawberry'], vitamins: ['wrap', 'Pharmalys', 'orange'], fish_food: ['wrap', 'Arche de Noé', 'fish'], detergent: ['wrap', 'Lave+', 'sparkle'],
};
const LEG = (d) => LEGACY[d.id] || [];
const legacyInfo = (d, extra = {}) => { const L = LEG(d); return { brand: d.b ?? L[1], picto: d.pi ?? L[2], name: d.l ?? d.label ?? d.name, ...extra }; };
// rayon du chanfrein des emballages carton selon la taille (arêtes vives sur les petites boîtes)
const BEV = (s, f = 0.035, hi = 0.003) => Math.max(0.0007, Math.min(hi, Math.min(s[0], s[1], s[2]) * f));
// boîte d'emballage : arêtes verticales chanfreinées, sauf les unités des présentoirs (lod) et les très petites boîtes
const cbox = (k, x, y, z, w, h, dd, c, F, C, skip, r) => (k.lod || Math.min(w, h, dd) < 0.012 ? k.pbox(x, y, z, w, h, dd, c, F, C, skip) : k.vbox(x, y, z, w, h, dd, c, r ?? BEV([w, h, dd]), F, C, skip));
S('box', (k, s, c, d) => (BOXV[d.id] ? BOXV[d.id](k, s, c, d) : k.rbox(0, 0, 0, s[0], s[1], s[2], c, BEV(s, 0.08, 0.004))));
S('labelbox', (k, s, c, d) => {
  const L = LEG(d), kind = d.lk || L[0] || (d.use === 'scatter' || d.use === 'read' ? 'toybox' : 'box');
  if (kind === 'eggs' || d.id === 'eggs') { k.rbox(0, 0, 0, s[0], s[1], s[2], c, 0.006, { Y: k.pk(d, 'eggs', s[0], s[2], { brand: 'Ferme du Coq', name: 'x6', nx: 3 }), Z: k.pk(d, 'plain', s[0], s[1], { bg: c, brand: 'ŒUFS FRAIS' }, d.id + ':edge') }); return; }
  const flat = s[1] < Math.min(s[0], s[2]) * 0.45;
  if (flat) {
    const r = k.pk(d, kind, s[0], s[2], legacyInfo(d)), e = k.pk(d, 'plain', s[0], s[1], { bg: c, brand: legacyInfo(d).brand || d.label }, d.id + ':edge');
    if (kind === 'toybox') { const lh = s[1] * 0.42; k.vbox(0, -lh / 2, 0, s[0] * 0.985, s[1] - lh, s[2] * 0.985, shade(c, 0.85), 0.0015, { Z: e, z: e }, {}, 'Y'); k.vbox(0, s[1] / 2 - lh / 2, 0, s[0], lh, s[2], c, 0.0015, { Y: r, Z: e, z: e }); return; } // couvercle de jeu de société
    cbox(k, 0, 0, 0, s[0], s[1], s[2], c, { Y: r, Z: e, z: e }); return;
  }
  const r = k.pk(d, kind, s[0], s[1], legacyInfo(d));
  if (kind === 'case') { cbox(k, 0, 0, 0, s[0], s[1], s[2], c, { Z: r, z: r, X: r, x: r, Y: k.shared('casetop', 64, 64, { kind: 'casetop' }) }, {}, '', 0.0035); return; }
  cbox(k, 0, 0, 0, s[0], s[1], s[2], c, { Z: r, z: r });
});
const CARD = { postcard: ['card', 'Hélios', 'sun', 'Bons baisers d\'Hélios'], scratch_card: ['card', 'FDJ Hélios', 'star', 'MILLIONNAIRE'], lottery: ['card', 'Loto Hélios', 'star', 'LOTO'], seeds: ['box', 'Jardins de Lune', 'flower', 'Belle-de-nuit'], movie_poster: ['media', '', 'skull', 'LA NUIT DES MANNEQUINS'], ticket: ['price', '', null, 'CINÉ HÉLIOS · SALLE 1'] };

// ───────── outils ─────────
S('ladder', (k, s, c) => { for (const x of [-1, 1]) k.box(x * s[0] * 0.45, 0, 0, 0.04, s[1], 0.06, c); for (let i = 0; i < 5; i++) k.box(0, -s[1] / 2 + 0.25 + i * 0.3, 0, s[0] * 0.9, 0.03, 0.1, shade(c, 0.85)); });

// ───────── alimentation ─────────
S('carton', (k, s, c, d) => S_BRICK(k, s, c, { ...d, b: d.b ?? LEG(d)[1], pi: d.pi ?? LEG(d)[2], l: d.l ?? d.label ?? d.name }, true));
const BOTTLE_SIL = { water: 'water', baby_bottle: 'baby', bleach: 'bleach', cough_syrup: 'syrup', sanitizer: 'pump', sunscreen: 'flat', wd40: 'aero', shampoo: 'shampoo', nail_polish: 'polish', contact_lens: 'lotion', ketchup: 'sauce' };
S('bottle', (k, s, c, d) => S_BOTTLE(k, s, c, { ...d, sil: d.sil || BOTTLE_SIL[d.id] || 'water', b: d.b ?? LEG(d)[1], pi: d.pi ?? LEG(d)[2], l: d.l ?? d.label ?? d.name.replace(/^(Bouteille d'|Sirop pour la |Gel |Crème |Solution pour )/i, '') }));
const WINE = { wine: ['wine', 'Château Lacombe', 'Bordeaux', 'grape', 0x7b1f1f], champagne: ['bubbly', 'Maison Hélios', 'Champagne', 'star', 0xffd700], director_whisky: ['liquor', 'Glen Desmarais', '18 ans d\'âge', 'mountain', 0x3e2723] };
S('wine', (k, s, c, d) => { const W = WINE[d.id] || ['wine', 'Domaine', d.name, 'grape', 0x7b1f1f]; S_BOTTLE(k, s, c, { ...d, sil: d.sil || W[0], b: d.b ?? W[1], l: d.l ?? W[2], pi: d.pi ?? W[3], c2: d.c2 ?? W[4], lc: d.lc ?? 0xf5f0e0 }); });
S('cotton_candy', (k, s, c) => { k.sph(0, s[1] * 0.15, 0, s[0] / 2, s[1] * 0.35, s[2] / 2, c); k.cyl(0, -s[1] * 0.3, 0, 0.005, s[1] * 0.4, 0xffffff); });

// ───────── papier ─────────
S('book', (k, s, c, d) => S_BOOK(k, s, c, { ...d, l: d.l ?? d.label ?? d.name.replace(/^(Roman|Album|Livre de|Manuel d')\s*/i, '').replace(/[«»]/g, '').trim() }));

// ───────── électronique ─────────
S('tv', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, -s[1] / 2 - 0.12, -0.02, 0.25, 0.02, 0.18, 0x222222); k.box(0, -s[1] / 2 - 0.06, -0.02, 0.05, 0.12, 0.03, 0x222222); k.meta.screen = { x: 0, y: 0, z: s[2] / 2 + 0.002, w: s[0] * 0.95, h: s[1] * 0.92 }; });
S('crt', (k, s, c) => { k.box(0, 0, -s[2] * 0.05, s[0], s[1], s[2] * 0.9, c); k.box(0, -s[1] * 0.02, -s[2] * 0.4, s[0] * 0.7, s[1] * 0.7, s[2] * 0.3, shade(c, 0.8)); k.box(s[0] * 0.38, -s[1] * 0.3, s[2] * 0.4, 0.06, 0.12, 0.01, 0x111111); k.meta.screen = { x: -s[0] * 0.08, y: s[1] * 0.04, z: s[2] * 0.4 + 0.003, w: s[0] * 0.66, h: s[1] * 0.72 }; });
S('microwave', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(-s[0] * 0.12, 0, s[2] / 2, s[0] * 0.68, s[1] * 0.8, 0.004, 0x111111); k.box(s[0] * 0.37, 0, s[2] / 2, s[0] * 0.2, s[1] * 0.8, 0.004, 0x333333); k.box(s[0] * 0.37, s[1] * 0.25, s[2] / 2 + 0.003, s[0] * 0.14, s[1] * 0.12, 0.003, 0x113311); k.meta.door = { x: -s[0] * 0.12, y: 0, z: s[2] / 2, w: s[0] * 0.7, h: s[1] * 0.85 }; k.meta.display = [s[0] * 0.37, s[1] * 0.25, s[2] / 2 + 0.005]; });
S('oven_big', (k, s, c) => { k.box(0, -s[1] * 0.25, 0, s[0], s[1] * 0.5, s[2], 0x9e9e9e); k.sph(0, s[1] * 0.1, 0, s[0] * 0.5, s[1] * 0.45, s[2] * 0.5, c); k.box(0, s[1] * 0.05, s[2] * 0.45, s[0] * 0.4, s[1] * 0.2, 0.05, 0x111111); k.cyl(0, s[1] * 0.45, -s[2] * 0.2, 0.08, s[1] * 0.3, 0x5d4037); k.meta.glow = [0, s[1] * 0.05, s[2] * 0.48]; });
S('washer', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.42, s[2] / 2, s[0], s[1] * 0.12, 0.01, 0xdddddd); if (d.id === 'fryer') { k.box(0, s[1] / 2, 0, s[0] * 0.8, 0.02, s[2] * 0.7, 0x5d4037); return; } k.cyl(0, -s[1] * 0.05, s[2] / 2 + 0.01, s[0] * 0.32, 0.02, 0x37474f, Math.PI / 2); k.cyl(0, -s[1] * 0.05, s[2] / 2 + 0.02, s[0] * 0.26, 0.01, 0x7da8c0, Math.PI / 2); k.meta.drum = [0, -s[1] * 0.05, s[2] / 2 + 0.025, s[0] * 0.26]; });
S('fridge', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.18, s[2] / 2 + 0.003, s[0] * 0.98, 0.01, 0.005, 0x9e9e9e); k.box(s[0] * 0.4, s[1] * 0.3, s[2] / 2 + 0.03, 0.02, 0.3, 0.03, 0xbdbdbd); k.meta.door = { x: 0, y: -s[1] * 0.1, z: s[2] / 2, w: s[0], h: s[1] * 0.8 }; });
S('freezer', (k, s, c) => { k.box(0, -s[1] * 0.08, 0, s[0], s[1] * 0.84, s[2], c); k.box(0, s[1] * 0.42, 0, s[0], 0.03, s[2], 0xcfe8ef); k.meta.lid = true; });
S('coffee_maker', (k, s, c, d) => { k.box(0, 0, -s[2] * 0.15, s[0], s[1], s[2] * 0.7, c); k.box(0, s[1] * 0.42, s[2] * 0.15, s[0], s[1] * 0.16, s[2] * 0.4, c); k.box(0, -s[1] * 0.45, s[2] * 0.2, s[0] * 0.8, s[1] * 0.06, s[2] * 0.4, 0x555555); k.box(0, s[1] * 0.25, s[2] * 0.2, s[0] * 0.2, s[1] * 0.08, 0.005, 0x113311); if (d.id === 'soda_fountain') { for (let i = -1; i <= 1; i++) k.box(i * s[0] * 0.28, s[1] * 0.05, s[2] * 0.25, s[0] * 0.2, s[1] * 0.2, 0.01, [0xd50000, 0xc0ca33, 0xff9800][i + 1]); } k.meta.spout = [0, s[1] * 0.25, s[2] * 0.25]; });
S('cotton', (k, s, c) => { k.cyl(0, -s[1] * 0.3, 0, s[0] * 0.3, s[1] * 0.4, c); k.cyl(0, s[1] * 0.05, 0, s[0] * 0.5, s[1] * 0.25, 0xeeeeee); k.cyl(0, s[1] * 0.18, 0, s[0] * 0.48, 0.005, 0xf8bbd0); });
S('console', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] / 2, s[2] * 0.2, s[0] * 0.3, 0.004, 0.08, 0x333333); k.box(s[0] * 0.35, s[1] * 0.2, s[2] / 2, 0.02, 0.01, 0.004, 0xff1744); k.box(-s[0] * 0.4, 0, s[2] / 2 + 0.08, 0.12, 0.03, 0.08, 0x212121); });
S('turntable', (k, s, c) => { k.box(0, -s[1] * 0.2, 0, s[0], s[1] * 0.6, s[2], c); k.cyl(-s[0] * 0.1, s[1] * 0.15, 0, s[2] * 0.42, 0.015, 0x222222); k.cyl(-s[0] * 0.1, s[1] * 0.16, 0, 0.004, 0.02, 0xc0c0c0); k.box(s[0] * 0.32, s[1] * 0.2, -s[2] * 0.2, 0.012, 0.012, s[2] * 0.5, 0xc0c0c0, { ry: 0.3 }); k.meta.platter = [-s[0] * 0.1, s[1] * 0.16, 0]; });
S('vcr', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(-s[0] * 0.1, 0, s[2] / 2, s[0] * 0.5, s[1] * 0.25, 0.004, 0x111111); k.box(s[0] * 0.3, 0, s[2] / 2, s[0] * 0.2, s[1] * 0.3, 0.004, 0x003311); k.meta.display = [s[0] * 0.3, 0, s[2] / 2 + 0.003]; });
const VINYL_PI = { jazz: 'note', disco: 'star', rock: 'bolt', classical: 'note', synthwave: 'sun', funk: 'star', chanson: 'heart', reggae: 'leaf', metal: 'skull', ambient: 'moon', piano_bar: 'note', xmas: 'snow', creepy_vinyl: 'moon' };
S('tent', (k, s, c) => { k.boxR(-s[0] * 0.25, 0, 0, s[0] * 0.03, s[1] * 1.15, s[2], c, 0, 0, -0.52); k.boxR(s[0] * 0.25, 0, 0, s[0] * 0.03, s[1] * 1.15, s[2], c, 0, 0, 0.52); k.box(0, -s[1] / 2 + 0.01, 0, s[0], 0.02, s[2], shade(c, 0.5)); k.box(0, 0, -s[2] / 2, s[0] * 0.5, s[1] * 0.8, 0.02, shade(c, 0.8)); });
S('bike', (k, s, c) => { k.box(0, -s[1] * 0.45, 0, s[0] * 0.8, 0.06, s[2] * 0.9, 0x333333); k.cyl(0, -s[1] * 0.1, s[2] * 0.3, s[1] * 0.3, 0.06, 0x111111, 0, 0, Math.PI / 2); k.box(0, 0, -s[2] * 0.1, 0.06, s[1] * 0.6, 0.06, c, { ry: 0 }); k.box(0, s[1] * 0.3, -s[2] * 0.25, 0.25, 0.06, 0.12, 0x111111); k.box(0, s[1] * 0.35, s[2] * 0.35, s[0] * 0.8, 0.04, 0.04, c); k.box(0, s[1] * 0.1, s[2] * 0.35, 0.05, s[1] * 0.5, 0.05, c); });
S('piano', (k, s, c, d) => { k.box(0, 0.05, -s[2] * 0.25, s[0], s[1] * 0.9, s[2] * 0.5, c); k.box(0, -s[1] * 0.1, s[2] * 0.15, s[0], 0.1, s[2] * 0.3, c); k.box(0, -s[1] * 0.04, s[2] * 0.18, s[0] * 0.92, 0.02, s[2] * 0.22, 0xfafafa); for (let i = 0; i < 36; i++) { if ([1, 3, 6, 8, 10].includes(i % 12)) k.box(-s[0] * 0.46 + i * s[0] * 0.92 / 36, -s[1] * 0.02, s[2] * 0.14, s[0] * 0.012, 0.025, s[2] * 0.12, 0x111111); } for (const x of [-1, 1]) k.box(x * s[0] * 0.47, -s[1] * 0.3, s[2] * 0.15, 0.05, s[1] * 0.4, 0.05, c); k.meta.keys = { x: 0, y: -s[1] * 0.02, z: s[2] * 0.18, w: s[0] * 0.92 }; });
S('keyboardsynth', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.5, s[2] * 0.15, s[0] * 0.9, 0.01, s[2] * 0.5, 0xfafafa); k.box(0, s[1] * 0.5, -s[2] * 0.3, s[0] * 0.3, 0.012, s[2] * 0.2, 0x113311); for (const x of [-1, 1]) k.boxR(x * s[0] * 0.4, -0.4, 0, 0.03, 0.8, 0.03, 0x222222, 0.3, 0, 0); });
S('drumkit', (k, s, c) => { k.cyl(0, -s[1] * 0.2, 0, s[1] * 0.28, s[2] * 0.3, c, Math.PI / 2); k.cyl(0, -s[1] * 0.2, s[2] * 0.15, s[1] * 0.27, 0.01, 0xfafafa, Math.PI / 2); k.cyl(-s[0] * 0.32, 0, s[2] * 0.25, 0.18, 0.14, c); k.cyl(s[0] * 0.25, 0.05, s[2] * 0.15, 0.16, 0.16, c); k.cyl(-s[0] * 0.15, s[1] * 0.1, -s[2] * 0.05, 0.12, 0.12, c); k.cyl(s[0] * 0.38, s[1] * 0.35, 0, 0.22, 0.008, 0xd4af37); k.cyl(-s[0] * 0.45, s[1] * 0.15, s[2] * 0.3, 0.17, 0.008, 0xd4af37); k.cyl(s[0] * 0.38, 0, 0, 0.01, s[1] * 0.7, 0x9e9e9e); k.cyl(-s[0] * 0.45, -0.1, s[2] * 0.3, 0.01, s[1] * 0.5, 0x9e9e9e); });
S('salonchair', (k, s, c, d) => { k.cyl(0, -s[1] * 0.45, 0, s[0] * 0.35, 0.05, 0xc0c0c0); k.cyl(0, -s[1] * 0.3, 0, 0.05, s[1] * 0.3, 0xc0c0c0); k.box(0, -s[1] * 0.08, 0, s[0] * 0.8, s[1] * 0.12, s[2] * 0.75, c); k.box(0, s[1] * 0.2, -s[2] * 0.35, s[0] * 0.8, s[1] * 0.55, s[2] * 0.1, c); for (const x of [-1, 1]) k.box(x * s[0] * 0.42, s[1] * 0.02, 0, s[0] * 0.1, s[1] * 0.08, s[2] * 0.6, c); if (d.id === 'massage_chair') k.box(0, -s[1] * 0.3, s[2] * 0.35, s[0] * 0.6, s[1] * 0.3, s[2] * 0.25, c); });
S('head', (k, s, c) => { k.sph(0, s[1] * 0.1, 0, s[0] / 2, s[1] * 0.4, s[2] / 2, c); k.cyl(0, -s[1] * 0.35, 0, s[0] * 0.2, s[1] * 0.3, c); k.sph(0, s[1] * 0.08, s[2] * 0.48, s[0] * 0.08, s[1] * 0.1, 0.03, c); });
S('photobooth', (k, s, c) => { k.box(0, 0, -s[2] * 0.2, s[0], s[1], s[2] * 0.6, c); k.box(0, s[1] * 0.42, s[2] * 0.1, s[0], s[1] * 0.16, s[2] * 0.6, c); k.box(s[0] * 0.48, 0, s[2] * 0.3, 0.02, s[1] * 0.68, s[2] * 0.4, 0x880e4f); k.box(-s[0] * 0.45, -s[1] * 0.2, s[2] * 0.1, s[0] * 0.1, s[1] * 0.05, s[2] * 0.3, 0x333333); k.box(0, s[1] * 0.42, s[2] * 0.4, s[0] * 0.8, s[1] * 0.1, 0.01, 0xffeb3b); k.meta.flash = [0, s[1] * 0.2, -s[2] * 0.05]; });
S('mirror', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], 0x6d4c41); k.box(0, 0, s[2] / 2 + 0.001, s[0] * 0.94, s[1] * 0.92, 0.002, 0xcfd8dc); k.meta.mirror = { w: s[0] * 0.94, h: s[1] * 0.92, z: s[2] / 2 + 0.003 }; });

// ───────── grandes bornes / mobilier ─────────
S('arcade', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2];
  k.box(0, -h * 0.2, 0, w, h * 0.6, dd * 0.7, c);
  k.boxR(0, h * 0.18, dd * 0.1, w, h * 0.3, dd * 0.15, c, -0.25, 0, 0);
  k.box(0, h * 0.38, -dd * 0.1, w, h * 0.24, dd * 0.6, c);
  k.box(0, h * 0.0, dd * 0.38, w * 0.9, 0.05, dd * 0.25, 0x212121);
  k.cyl(-w * 0.2, h * 0.06, dd * 0.4, 0.012, 0.08, 0x222222); k.sph(-w * 0.2, h * 0.11, dd * 0.4, 0.025, 0.025, 0.025, 0xe53935);
  for (let i = 0; i < 3; i++) k.cyl(w * (0.05 + i * 0.1), h * 0.035, dd * 0.42, 0.018, 0.01, [0xffeb3b, 0x43a047, 0x1e88e5][i]);
  k.box(0, h * 0.46, dd * 0.21, w * 0.92, h * 0.07, 0.01, 0xd500f9);
  k.box(0, -h * 0.25, dd * 0.36, w * 0.12, h * 0.08, 0.01, 0xffd600);
  for (const x of [-1, 1]) k.box(x * w * 0.5, 0, 0, 0.02, h, dd * 0.7, shade(c, 1.4));
  k.meta.screen = { x: 0, y: h * 0.2, z: dd * 0.19, w: w * 0.78, h: h * 0.22, tilt: -0.25 };
  k.meta.marquee = { x: 0, y: h * 0.46, z: dd * 0.22, w: w * 0.92, h: h * 0.07 };
});
S('claw', (k, s, c) => { const w = s[0], h = s[1], dd = s[2]; k.box(0, -h * 0.3, 0, w, h * 0.4, dd, c); k.box(0, h * 0.45, 0, w, h * 0.1, dd, c); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(x * w * 0.48, h * 0.15, z * dd * 0.48, 0.04, h * 0.6, 0.04, 0xc0c0c0); k.box(0, -h * 0.08, 0, w * 0.92, 0.02, dd * 0.92, 0x7e57c2); const rnd = mulberry32(3); for (let i = 0; i < 12; i++) k.sph((rnd() - 0.5) * w * 0.7, -h * 0.03 + rnd() * 0.05, (rnd() - 0.5) * dd * 0.7, 0.07, 0.07, 0.07, [0xff4081, 0xffeb3b, 0x29b6f6, 0x66bb6a, 0xab47bc][i % 5]); k.box(0, -h * 0.05, dd * 0.47, w * 0.4, 0.04, 0.12, 0x212121); k.meta.glass = { w: w * 0.96, h: h * 0.6, y: h * 0.15 }; k.meta.claw = [0, h * 0.35, 0]; });
S('kiddie', (k, s, c) => { const w = s[0], h = s[1], dd = s[2]; k.box(0, -h * 0.42, 0, w, h * 0.16, dd, 0x1e88e5); k.sph(0, -h * 0.05, 0, w * 0.42, h * 0.3, dd * 0.45, c); k.sph(0, h * 0.28, dd * 0.3, w * 0.28, h * 0.2, dd * 0.18, c); k.sph(-w * 0.2, h * 0.43, dd * 0.3, 0.07, 0.07, 0.04, c); k.sph(w * 0.2, h * 0.43, dd * 0.3, 0.07, 0.07, 0.04, c); k.sph(0, h * 0.24, dd * 0.47, 0.07, 0.05, 0.04, 0xf3d2a2); k.sph(-0.08, h * 0.32, dd * 0.45, 0.02, 0.02, 0.01, 0x111111); k.sph(0.08, h * 0.32, dd * 0.45, 0.02, 0.02, 0.01, 0x111111); k.box(0, h * 0.12, -dd * 0.1, w * 0.4, 0.06, dd * 0.4, 0xd32f2f); k.box(w * 0.45, -h * 0.3, dd * 0.45, 0.12, 0.2, 0.08, 0x333333); });
S('locker', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); if (d.id === 'locker') { k.box(0, s[1] * 0.35, s[2] / 2 + 0.002, s[0] * 0.6, 0.004, 0.003, 0x333333); k.box(0, s[1] * 0.3, s[2] / 2 + 0.002, s[0] * 0.6, 0.004, 0.003, 0x333333); k.box(s[0] * 0.35, 0, s[2] / 2 + 0.01, 0.02, 0.1, 0.02, 0x9e9e9e); k.meta.door = { x: 0, y: 0, z: s[2] / 2, w: s[0] * 0.95, h: s[1] * 0.95 }; } else if (d.id === 'token_machine') { k.box(0, s[1] * 0.2, s[2] / 2, s[0] * 0.6, s[1] * 0.2, 0.01, 0xffd600); k.box(0, -s[1] * 0.25, s[2] / 2, s[0] * 0.3, s[1] * 0.1, 0.04, 0x111111); } else if (d.id === 'extinguisher_box') { k.box(0, 0, s[2] / 2, s[0] * 0.85, s[1] * 0.85, 0.005, 0xb0bec5); } });
S('airhockey', (k, s, c) => { k.box(0, 0.1, 0, s[0], s[1] * 0.25, s[2], c); k.box(0, s[1] * 0.24, 0, s[0] * 0.92, 0.01, s[2] * 0.92, 0xe3f2fd); k.box(0, -s[1] * 0.25, 0, s[0] * 0.6, s[1] * 0.5, s[2] * 0.6, 0x111111); k.cyl(0, s[1] * 0.25, s[2] * 0.3, 0.05, 0.03, 0xd50000); k.cyl(0, s[1] * 0.25, -s[2] * 0.3, 0.05, 0.03, 0x1565c0); k.meta.screen = { x: 0, y: s[1] * 0.25, z: 0, w: s[0] * 0.9, h: s[2] * 0.9, top: true }; });
S('conveyor', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] / 2, 0, s[0] * 0.98, 0.01, s[2] * 0.7, 0x424242); });
S('gumball', (k, s, c) => { k.box(0, -s[1] * 0.3, 0, s[0] * 0.7, s[1] * 0.4, s[0] * 0.7, c); k.sph(0, s[1] * 0.18, 0, s[0] * 0.5, s[0] * 0.5, s[0] * 0.5, 0xe0f7fa); const rnd = mulberry32(9); for (let i = 0; i < 14; i++) k.sph((rnd() - 0.5) * s[0] * 0.6, s[1] * 0.08 + rnd() * s[0] * 0.3, (rnd() - 0.5) * s[0] * 0.6, 0.02, 0.02, 0.02, [0xff1744, 0x00e5ff, 0xffea00, 0x76ff03][i % 4], true); k.cyl(0, s[1] * 0.42, 0, s[0] * 0.2, 0.04, c); });
S('popcorn_machine', (k, s, c) => { k.box(0, -s[1] * 0.3, 0, s[0], s[1] * 0.4, s[2], c); k.box(0, s[1] * 0.15, 0, s[0], s[1] * 0.5, s[2], 0xfff8e1); k.box(0, s[1] * 0.45, 0, s[0], s[1] * 0.1, s[2], c); k.box(0, s[1] * 0.0, 0, s[0] * 0.9, s[1] * 0.15, s[2] * 0.9, 0xffffff); k.meta.glass = true; });
S('projector', (k, s, c) => { k.box(0, 0, 0, s[0], s[1] * 0.6, s[2], c); k.cyl(-s[0] * 0.3, s[1] * 0.45, -s[2] * 0.2, s[1] * 0.3, 0.05, 0x546e7a, 0, 0, Math.PI / 2); k.cyl(-s[0] * 0.3, s[1] * 0.45, s[2] * 0.25, s[1] * 0.3, 0.05, 0x546e7a, 0, 0, Math.PI / 2); k.cyl(0, 0, s[2] / 2 + 0.08, 0.08, 0.16, 0x111111, Math.PI / 2); k.meta.lens = [0, 0, s[2] / 2 + 0.16]; });
S('laptop', (k, s, c) => { k.box(0, -s[1] / 2, 0, s[0], s[1], s[2], c); k.boxR(0, s[2] * 0.42, -s[2] * 0.45, s[0], s[2] * 0.9, 0.01, c, -0.2, 0, 0); k.boxR(0, s[2] * 0.42, -s[2] * 0.443, s[0] * 0.92, s[2] * 0.8, 0.002, 0x0a1220, -0.2, 0, 0); k.box(0, -s[1] * 0.45, s[2] * 0.1, s[0] * 0.85, 0.002, s[2] * 0.45, 0x222222); k.meta.screen = { x: 0, y: s[2] * 0.42, z: -s[2] * 0.438, w: s[0] * 0.92, h: s[2] * 0.8, tilt: -0.2 }; });
S('printer', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, s[1] * 0.1, s[2] / 2 + 0.05, s[0] * 0.6, 0.01, 0.12, 0xfafafa); k.box(0, s[1] / 2, -s[2] * 0.2, s[0] * 0.6, 0.06, 0.15, 0xfafafa); k.box(s[0] * 0.35, s[1] * 0.4, s[2] / 2 + 0.002, 0.05, 0.03, 0.003, 0x113311); });
S('register', (k, s, c) => { k.box(0, -s[1] * 0.3, 0, s[0], s[1] * 0.4, s[2], c); k.boxR(0, s[1] * 0.05, s[2] * 0.15, s[0] * 0.8, s[1] * 0.12, s[2] * 0.4, 0x424242, -0.3, 0, 0); k.box(0, s[1] * 0.35, -s[2] * 0.2, s[0] * 0.5, s[1] * 0.35, 0.04, 0x212121); k.box(0, s[1] * 0.35, -s[2] * 0.2 + 0.021, s[0] * 0.45, s[1] * 0.28, 0.002, 0x0a2a1a); k.box(0, -s[1] * 0.3, s[2] / 2 + 0.002, s[0] * 0.9, s[1] * 0.28, 0.003, shade(c, 0.8)); k.meta.drawer = { x: 0, y: -s[1] * 0.3, z: s[2] / 2, w: s[0] * 0.9, h: s[1] * 0.3, d: s[2] * 0.8 }; k.meta.screen = { x: 0, y: s[1] * 0.35, z: -s[2] * 0.2 + 0.023, w: s[0] * 0.45, h: s[1] * 0.28 }; });
S('safe', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.cyl(s[0] * 0.15, s[1] * 0.05, s[2] / 2 + 0.02, s[0] * 0.1, 0.04, 0x9e9e9e, Math.PI / 2); k.box(-s[0] * 0.2, s[1] * 0.1, s[2] / 2 + 0.01, s[0] * 0.18, s[1] * 0.2, 0.02, 0x212121); k.box(s[0] * 0.38, 0, s[2] / 2 + 0.03, 0.03, s[1] * 0.25, 0.04, 0xbdbdbd); k.meta.door = { x: 0, y: 0, z: s[2] / 2, w: s[0] * 0.95, h: s[1] * 0.95 }; });
S('vending', (k, s, c, d) => { k.box(0, 0, 0, s[0], s[1], s[2], c); if (d.id === 'atm') { k.box(0, s[1] * 0.15, s[2] / 2 + 0.01, s[0] * 0.5, s[1] * 0.2, 0.01, 0x0a1a2a); k.box(0, -s[1] * 0.05, s[2] / 2 + 0.05, s[0] * 0.5, 0.02, 0.12, 0x333333); k.meta.screen = { x: 0, y: s[1] * 0.15, z: s[2] / 2 + 0.016, w: s[0] * 0.48, h: s[1] * 0.18 }; return; } k.box(-s[0] * 0.12, s[1] * 0.08, s[2] / 2 + 0.005, s[0] * 0.65, s[1] * 0.7, 0.01, 0x223038); const rnd = mulberry32(4); for (let r = 0; r < 5; r++) for (let i = 0; i < 4; i++) k.box(-s[0] * 0.36 + i * s[0] * 0.16, s[1] * 0.36 - r * s[1] * 0.13, s[2] * 0.35, s[0] * 0.1, s[1] * 0.09, 0.05, [0xd50000, 0x1e88e5, 0xffeb3b, 0x43a047, 0xff9800][(rnd() * 5) | 0]); k.box(s[0] * 0.35, s[1] * 0.1, s[2] / 2 + 0.005, s[0] * 0.2, s[1] * 0.3, 0.01, 0x333333); k.box(0, -s[1] * 0.38, s[2] / 2 + 0.005, s[0] * 0.6, s[1] * 0.1, 0.02, 0x111111); k.meta.glow = [-s[0] * 0.12, s[1] * 0.08, s[2] / 2 + 0.02]; });
S('cooler', (k, s, c) => { k.box(0, -s[1] * 0.15, 0, s[0], s[1] * 0.7, s[2], c); k.cyl(0, s[1] * 0.35, 0, s[0] * 0.4, s[1] * 0.3, 0x81d4fa); });
S('sink', (k, s, c) => { k.box(0, s[1] * 0.35, 0, s[0], s[1] * 0.15, s[2], c); k.box(0, s[1] * 0.43, 0, s[0] * 0.75, 0.01, s[2] * 0.6, 0xb0bec5); k.cyl(0, -s[1] * 0.1, -s[2] * 0.2, 0.06, s[1] * 0.75, c); k.cyl(0, s[1] * 0.5, -s[2] * 0.4, 0.015, 0.12, 0xc0c0c0); k.cyl(0, s[1] * 0.55, -s[2] * 0.33, 0.012, 0.12, 0xc0c0c0, Math.PI / 2); k.meta.tap = [0, s[1] * 0.53, -s[2] * 0.27]; });
S('toilet', (k, s, c) => { k.cyl(0, -s[1] * 0.25, s[2] * 0.05, s[0] * 0.45, s[1] * 0.45, c); k.cylS(0, -s[1] * 0.01, s[2] * 0.05, s[0] * 0.5, 0.04, s[2] * 0.4, c); k.box(0, s[1] * 0.25, -s[2] * 0.35, s[0], s[1] * 0.5, s[2] * 0.25, c); });
S('bench', (k, s, c) => { k.box(0, s[1] * 0.1, 0, s[0], 0.06, s[2], c); for (const x of [-1, 1]) k.box(x * s[0] * 0.42, -s[1] * 0.2, 0, 0.06, s[1] * 0.6, s[2] * 0.9, 0x37474f); });
S('chair', (k, s, c, d) => { if (d.id === 'office_chair') { k.box(0, 0, 0, s[0] * 0.8, 0.08, s[2] * 0.8, c); k.box(0, s[1] * 0.3, -s[2] * 0.38, s[0] * 0.75, s[1] * 0.5, 0.06, c); k.cyl(0, -s[1] * 0.25, 0, 0.03, s[1] * 0.45, 0x555555); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.boxR(Math.cos(a) * s[0] * 0.2, -s[1] * 0.45, Math.sin(a) * s[0] * 0.2, s[0] * 0.4, 0.03, 0.04, 0x333333, 0, -a, 0); } return; } k.box(0, 0, 0, s[0], 0.05, s[2], c); k.box(0, s[1] * 0.27, -s[2] * 0.46, s[0], s[1] * 0.5, 0.04, c); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(x * s[0] * 0.44, -s[1] * 0.25, z * s[2] * 0.44, 0.03, s[1] * 0.5, 0.03, 0x37474f); });
S('fountainbig', (k, s, c) => { k.cyl(0, -s[1] * 0.25, 0, s[0] / 2, s[1] * 0.5, c); k.cyl(0, -s[1] * 0.02, 0, s[0] / 2 * 0.93, 0.02, 0x2c5866); k.cyl(0, s[1] * 0.3, 0, 0.3, s[1] * 0.9, c); k.cyl(0, s[1] * 0.75, 0, 1.0, 0.12, c); k.cyl(0, s[1] * 0.81, 0, 0.92, 0.02, 0x2c5866); k.meta.water = [0, s[1] * 0.9, 0]; });
S('board', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, 0, s[2] / 2, s[0] * 0.92, s[1] * 0.88, 0.003, 0xc8a165); const rnd = mulberry32(11); for (let i = 0; i < 9; i++) k.box((rnd() - 0.5) * s[0] * 0.75, (rnd() - 0.5) * s[1] * 0.7, s[2] / 2 + 0.004, 0.12 + rnd() * 0.1, 0.12 + rnd() * 0.08, 0.002, [0xfff59d, 0xffffff, 0xb3e5fc, 0xf8bbd0][i % 4]); });
S('generator', (k, s, c) => { const w = s[0], h = s[1], dd = s[2]; k.box(0, -h * 0.4, 0, w, h * 0.2, dd, 0x37474f); k.box(-w * 0.15, h * 0.05, 0, w * 0.6, h * 0.7, dd * 0.85, c); k.cyl(w * 0.32, 0, 0, dd * 0.38, w * 0.3, 0x455a64, 0, 0, Math.PI / 2); k.box(-w * 0.15, h * 0.45, 0, w * 0.4, h * 0.1, dd * 0.5, 0x263238); k.cyl(-w * 0.35, h * 0.5, dd * 0.2, 0.06, 0.15, 0x111111); k.box(w * 0.25, h * 0.3, dd * 0.45, w * 0.25, h * 0.25, 0.04, 0x263238); k.box(w * 0.25, h * 0.33, dd * 0.47, 0.08, 0.05, 0.005, 0x113311); k.box(-w * 0.45, 0, dd * 0.43, 0.05, 0.05, 0.1, 0x111111); k.meta.gauge = [w * 0.25, h * 0.33, dd * 0.475]; k.meta.cord = [-w * 0.45, 0, dd * 0.5]; });
S('panel', (k, s, c) => { k.box(0, 0, 0, s[0], s[1], s[2], c); k.box(0, 0, s[2] / 2, s[0] * 0.94, s[1] * 0.94, 0.005, 0x546e7a); });
S('console_pa', (k, s, c) => { k.box(0, -s[1] * 0.2, 0, s[0], s[1] * 0.6, s[2], c); k.boxR(0, s[1] * 0.15, 0, s[0], 0.05, s[2] * 0.9, 0x37474f, -0.2, 0, 0); for (let i = 0; i < 12; i++) k.box(-s[0] * 0.4 + i * s[0] * 0.07, s[1] * 0.2, 0, 0.015, 0.03, 0.12, 0x9e9e9e); k.cyl(s[0] * 0.3, s[1] * 0.35, -s[2] * 0.2, 0.008, 0.3, 0x212121, 0.4, 0, 0); k.sph(s[0] * 0.3, s[1] * 0.48, -s[2] * 0.14, 0.025, 0.035, 0.025, 0x333333); });
S('boiler', (k, s, c) => { k.cyl(0, 0, 0, s[0] / 2, s[1], c); k.cyl(0, s[1] * 0.3, s[0] * 0.45, 0.1, 0.02, 0xfafafa, Math.PI / 2); k.cyl(s[0] * 0.3, s[1] * 0.55, 0, 0.06, s[1] * 0.4, 0x8d6e63); k.cyl(-s[0] * 0.3, s[1] * 0.55, 0, 0.06, s[1] * 0.4, 0x8d6e63); });
S('forklift', (k, s, c) => { const w = s[0], h = s[1], L = s[2]; k.box(0, -h * 0.3, -L * 0.1, w, h * 0.3, L * 0.7, c); k.box(0, -h * 0.05, -L * 0.35, w, h * 0.25, L * 0.2, 0x37474f); for (const x of [-1, 1]) { k.box(x * w * 0.45, h * 0.15, -L * 0.05, 0.05, h * 0.7, 0.05, 0x212121); k.box(x * w * 0.45, h * 0.15, -L * 0.3, 0.05, h * 0.7, 0.05, 0x212121); } k.box(0, h * 0.48, -L * 0.18, w, 0.05, L * 0.3, 0x212121); k.box(0, -h * 0.05, -L * 0.15, w * 0.6, h * 0.1, L * 0.2, 0x111111); for (const x of [-1, 1]) { k.box(x * w * 0.3, 0, L * 0.3, 0.12, h * 0.9, 0.08, 0x37474f); k.box(x * w * 0.25, -h * 0.45, L * 0.42, 0.12, 0.05, L * 0.3, 0x9e9e9e); } for (const [x, z] of [[-1, -1], [1, -1], [-1, 0.6], [1, 0.6]]) k.cyl(x * w * 0.48, -h * 0.4, z * L * 0.3, 0.22, 0.2, 0x111111, 0, 0, Math.PI / 2); k.meta.light = [0, h * 0.5, L * 0.0]; });
S('car', (k, s, c) => {
  const w = s[0], h = s[1], L = s[2];
  k.box(0, -h * 0.2, 0, w, h * 0.38, L, c);
  k.box(0, h * 0.16, -L * 0.05, w * 0.88, h * 0.34, L * 0.5, c);
  k.box(0, h * 0.18, L * 0.205, w * 0.84, h * 0.28, 0.02, 0x101418); k.box(0, h * 0.18, -L * 0.305, w * 0.84, h * 0.28, 0.02, 0x101418);
  k.box(-w * 0.441, h * 0.17, -L * 0.05, 0.01, h * 0.26, L * 0.46, 0x101418); k.box(w * 0.441, h * 0.17, -L * 0.05, 0.01, h * 0.26, L * 0.46, 0x101418);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { k.cyl(x * w * 0.43, -h * 0.38, z * L * 0.32, h * 0.22, w * 0.16, 0x111111, 0, 0, Math.PI / 2); k.cyl(x * w * 0.5, -h * 0.38, z * L * 0.32, h * 0.12, 0.01, 0xbdbdbd, 0, 0, Math.PI / 2); }
  k.box(-w * 0.32, -h * 0.12, L * 0.5, w * 0.2, h * 0.08, 0.02, 0xfffde7); k.box(w * 0.32, -h * 0.12, L * 0.5, w * 0.2, h * 0.08, 0.02, 0xfffde7);
  k.box(-w * 0.35, -h * 0.1, -L * 0.5, w * 0.16, h * 0.07, 0.02, 0xb71c1c); k.box(w * 0.35, -h * 0.1, -L * 0.5, w * 0.16, h * 0.07, 0.02, 0xb71c1c);
  k.box(0, -h * 0.25, L * 0.505, w * 0.3, h * 0.08, 0.01, 0xfafafa); k.box(0, -h * 0.25, -L * 0.505, w * 0.3, h * 0.08, 0.01, 0xfafafa);
  k.meta.headlights = [[-w * 0.32, -h * 0.12, L * 0.51], [w * 0.32, -h * 0.12, L * 0.51]];
  k.meta.windows = [{ x: -w * 0.445, y: h * 0.17, z: -L * 0.05, w: L * 0.46, h: h * 0.26, side: -1 }, { x: w * 0.445, y: h * 0.17, z: -L * 0.05, w: L * 0.46, h: h * 0.26, side: 1 }];
});
S('mannequin', (k, s, c) => {
  const h = s[1];
  k.cyl(0, -h * 0.49, 0, 0.18, 0.02, 0x333333); k.cyl(0, -h * 0.28, 0, 0.012, h * 0.42, 0x9e9e9e);
  k.cylS(0, h * 0.12, 0, 0.17, h * 0.3, 0.1, c); k.cylS(0, -h * 0.05, 0, 0.15, h * 0.1, 0.1, c);
  k.cyl(0, h * 0.31, 0, 0.04, h * 0.06, c); k.sph(0, h * 0.4, 0, 0.1, 0.13, 0.11, c);
  k.cylS(-0.2, h * 0.08, 0, 0.04, h * 0.32, 0.04, c, 0, 0, 0.15); k.cylS(0.2, h * 0.08, 0, 0.04, h * 0.32, 0.04, c, 0, 0, -0.15);
  k.cylS(-0.08, -h * 0.28, 0, 0.055, h * 0.42, 0.055, c); k.cylS(0.08, -h * 0.28, 0, 0.055, h * 0.42, 0.055, c);
});
S('deskphone', (k, s, c) => { k.boxR(0, -s[1] * 0.2, 0, s[0], s[1] * 0.5, s[2], c, 0.15, 0, 0); k.cap(0, s[1] * 0.25, -s[2] * 0.1, 0.025, s[0] * 0.8, c, 0, 0, Math.PI / 2); for (let r = 0; r < 4; r++) for (let i = 0; i < 3; i++) k.box(-0.03 + i * 0.03, s[1] * 0.07, s[2] * 0.25 - r * 0.025, 0.02, 0.006, 0.018, 0xe0e0e0); k.meta.handset = [0, s[1] * 0.25, -s[2] * 0.1]; });
S('cage', (k, s, c, d) => { k.box(0, -s[1] * 0.47, 0, s[0], s[1] * 0.06, s[2], 0x5d4037); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.cyl(Math.cos(a) * s[0] * 0.45, 0, Math.sin(a) * s[2] * 0.45, 0.004, s[1] * 0.9, c); } k.cyl(0, s[1] * 0.45, 0, s[0] * 0.46, 0.01, c); k.cyl(0, 0, 0, 0.006, s[0] * 0.9, 0x8d6e63, 0, 0, Math.PI / 2); if (d.use === 'parrot') { k.sph(0, s[1] * 0.12, 0, 0.06, 0.09, 0.06, 0x43a047); k.sph(0, s[1] * 0.24, 0.02, 0.045, 0.045, 0.045, 0x66bb6a); k.cone(0, s[1] * 0.22, 0.07, 0.015, 0.04, 0xffb300, Math.PI / 2); k.box(0, s[1] * 0.0, -0.05, 0.04, 0.1, 0.02, 0xd32f2f); } if (d.use === 'hamster') { k.torus(s[0] * 0.15, -s[1] * 0.2, 0, s[1] * 0.25, 0xb0bec5, 0, 0, 0, true); k.sph(-s[0] * 0.2, -s[1] * 0.38, 0, 0.04, 0.03, 0.05, 0xffcc80); } });
S('aquarium', (k, s, c, d) => { k.box(0, -s[1] * 0.45, 0, s[0], s[1] * 0.1, s[2], 0x212121); k.box(0, s[1] * 0.47, 0, s[0], s[1] * 0.06, s[2], 0x212121); k.box(0, 0, 0, s[0] * 0.98, s[1] * 0.84, s[2] * 0.96, d.use === 'terrarium' ? 0x3e2a14 : 0x1b4f72); k.box(0, -s[1] * 0.38, 0, s[0] * 0.96, s[1] * 0.06, s[2] * 0.9, d.use === 'terrarium' ? 0x8d6e63 : 0xe6d3a3); if (d.use === 'terrarium') { k.cap(0, -s[1] * 0.3, 0, 0.04, s[0] * 0.6, 0x5d7a3a, 0, 0.3, Math.PI / 2); } else { for (let i = 0; i < 5; i++) k.box(-s[0] * 0.35 + i * s[0] * 0.17, -s[1] * 0.2, -s[2] * 0.2, 0.02, s[1] * (0.25 + (i % 3) * 0.12), 0.02, 0x2e7d32); } k.meta.light = [0, s[1] * 0.4, 0]; k.meta.fish = d.use === 'aquarium'; });


// ═════════════════════ EMBALLAGES & ARTICLES DE RAYON (couleurs réelles, budget bas) ═════════════════════
const segsOf = (k, d, n = 8) => (k.lod ? 6 : (d.segs || n));
// anneaux relatifs [r, y, partie, arête vive] → anneaux de lathe
const R01 = (rings, R, Rz, h) => rings.map((q) => ({ r: q[0] * R, rz: q[0] * Rz, y: -h / 2 + q[1] * h, p: q[2], h: q[3] ? 1 : 0 }));
const ridgeTex = (k, n = 20) => k.shared('ridges:' + n, 64, 8, { kind: 'ridges', n });
// silhouettes de bouteilles : r (détaillée : fond, épaulement, bague, bouchon moleté) et lo (présentoirs) ;
// [rayon relatif, hauteur relative, partie du segment, arête vive] (g verre/plastique, l étiquette, c bouchon,
// k capsule, m métal, w tétine) ; rz : aplatissement (flacons ovales)
const SIL = {
  water: { r: [[0.84, 0], [0.97, 0.015, 'g'], [1, 0.04, 'g'], [1, 0.2, 'g'], [0.95, 0.225, 'g'], [1, 0.25, 'g'], [1, 0.62, 'l'], [0.98, 0.66, 'g'], [0.9, 0.72, 'g'], [0.7, 0.79, 'g'], [0.48, 0.85, 'g'], [0.38, 0.885, 'g'], [0.37, 0.9, 'g', 1], [0.45, 0.905, 'g', 1], [0.45, 0.912, 'g', 1], [0.38, 0.915, 'g', 1], [0.42, 0.918, 'c', 1], [0.43, 0.99, 'c', 1], [0.39, 1, 'c', 1]],
    lo: [[0.88, 0], [1, 0.05, 'g'], [1, 0.62, 'l'], [0.9, 0.72, 'g'], [0.38, 0.9, 'g', 1], [0.42, 1, 'c']] },
  soda: { r: [[0.7, 0], [0.9, 0.012, 'g'], [1, 0.05, 'g'], [1, 0.2, 'g'], [0.94, 0.22, 'g'], [1, 0.24, 'g'], [1, 0.56, 'l'], [0.97, 0.6, 'g'], [0.86, 0.68, 'g'], [0.64, 0.76, 'g'], [0.44, 0.83, 'g'], [0.35, 0.875, 'g'], [0.33, 0.895, 'g', 1], [0.42, 0.9, 'g', 1], [0.42, 0.906, 'g', 1], [0.35, 0.91, 'g', 1], [0.4, 0.913, 'c', 1], [0.41, 0.99, 'c', 1], [0.37, 1, 'c', 1]],
    lo: [[0.8, 0], [1, 0.06, 'g'], [1, 0.56, 'l'], [0.9, 0.66, 'g'], [0.34, 0.9, 'g', 1], [0.4, 1, 'c']] },
  juice: { r: [[0.88, 0], [1, 0.04, 'g'], [1, 0.08, 'g'], [1, 0.66, 'l'], [0.96, 0.71, 'g'], [0.82, 0.77, 'g'], [0.6, 0.83, 'g'], [0.5, 0.86, 'g', 1], [0.56, 0.865, 'c', 1], [0.57, 0.99, 'c', 1], [0.52, 1, 'c', 1]],
    lo: [[0.9, 0], [1, 0.05, 'g'], [1, 0.66, 'l'], [0.5, 0.86, 'g', 1], [0.55, 1, 'c']] },
  wine: { r: [[0.94, 0], [1, 0.02, 'g'], [1, 0.12, 'g'], [1, 0.5, 'l'], [1, 0.58, 'g'], [0.94, 0.63, 'g'], [0.76, 0.67, 'g'], [0.5, 0.71, 'g'], [0.36, 0.75, 'g'], [0.32, 0.8, 'g'], [0.32, 0.84, 'g', 1], [0.335, 0.845, 'k', 1], [0.335, 0.975, 'k'], [0.36, 0.985, 'k'], [0.34, 1, 'k', 1]],
    lo: [[0.96, 0], [1, 0.12, 'g'], [1, 0.58, 'l'], [0.34, 0.76, 'g'], [0.32, 0.85, 'g', 1], [0.34, 1, 'k']] },
  bubbly: { r: [[0.94, 0], [1, 0.02, 'g'], [1, 0.1, 'g'], [1, 0.45, 'l'], [0.99, 0.5, 'g'], [0.92, 0.56, 'g'], [0.74, 0.62, 'g', 1], [0.6, 0.65, 'k', 1], [0.46, 0.7, 'k'], [0.38, 0.76, 'k'], [0.37, 0.84, 'k'], [0.41, 0.9, 'k'], [0.42, 0.97, 'k'], [0.36, 1, 'k', 1]],
    lo: [[0.96, 0], [1, 0.1, 'g'], [1, 0.5, 'l'], [0.6, 0.66, 'g', 1], [0.38, 0.8, 'k'], [0.4, 1, 'k']] },
  oil: { r: [[0.9, 0], [1, 0.03, 'g'], [1, 0.08, 'g'], [1, 0.6, 'l'], [0.97, 0.66, 'g'], [0.84, 0.72, 'g'], [0.55, 0.79, 'g'], [0.38, 0.84, 'g'], [0.34, 0.875, 'g', 1], [0.4, 0.88, 'c', 1], [0.41, 0.99, 'c', 1], [0.37, 1, 'c', 1]],
    lo: [[0.9, 0], [1, 0.04, 'g'], [1, 0.62, 'l'], [0.36, 0.84, 'g'], [0.34, 0.88, 'g', 1], [0.4, 1, 'c']] },
  beer: { r: [[0.93, 0], [1, 0.03, 'g'], [1, 0.1, 'g'], [1, 0.48, 'l'], [0.97, 0.53, 'g'], [0.8, 0.6, 'g'], [0.52, 0.67, 'g'], [0.4, 0.73, 'g'], [0.35, 0.85, 'g'], [0.37, 0.9, 'g'], [0.35, 0.925, 'g', 1], [0.42, 0.93, 'k', 1], [0.42, 0.985, 'k', 1], [0.36, 1, 'k', 1]],
    lo: [[0.95, 0], [1, 0.1, 'g'], [1, 0.5, 'l'], [0.42, 0.72, 'g'], [0.35, 0.93, 'g', 1], [0.4, 1, 'k']] },
  liquor: { r: [[0.98, 0], [1, 0.02, 'g'], [1, 0.56, 'l'], [0.98, 0.61, 'g'], [0.88, 0.65, 'g'], [0.6, 0.7, 'g'], [0.42, 0.74, 'g'], [0.37, 0.78, 'g', 1], [0.45, 0.785, 'c', 1], [0.46, 0.98, 'c', 1], [0.42, 1, 'c', 1]],
    lo: [[1, 0], [1, 0.58, 'l'], [0.46, 0.72, 'g'], [0.37, 0.8, 'g', 1], [0.44, 1, 'c']] },
  sauce: { r: [[0.84, 0], [0.96, 0.03, 'g'], [1, 0.08, 'g'], [1, 0.62, 'l'], [0.95, 0.69, 'g'], [0.78, 0.75, 'g'], [0.55, 0.79, 'g', 1], [0.58, 0.795, 'c', 1], [0.58, 0.9, 'c'], [0.42, 0.96, 'c'], [0.22, 0.985, 'c'], [0.14, 1, 'c', 1]],
    lo: [[0.86, 0], [1, 0.08, 'g'], [1, 0.62, 'l'], [0.55, 0.8, 'g', 1], [0.34, 1, 'c']] },
  shampoo: { rz: 0.56, r: [[0.86, 0], [0.97, 0.025, 'g'], [1, 0.06, 'g'], [1, 0.72, 'l'], [0.96, 0.78, 'g'], [0.84, 0.83, 'g'], [0.6, 0.86, 'g', 1], [0.62, 0.865, 'c', 1], [0.6, 0.98, 'c'], [0.5, 1, 'c', 1]],
    lo: [[0.88, 0], [1, 0.06, 'g'], [1, 0.74, 'l'], [0.58, 0.86, 'g', 1], [0.52, 1, 'c']] },
  flat: { rz: 0.5, r: [[0.8, 0], [0.95, 0.03, 'g'], [1, 0.08, 'g'], [1, 0.74, 'l'], [0.92, 0.8, 'g'], [0.7, 0.84, 'g', 1], [0.48, 0.86, 'c', 1], [0.48, 0.98, 'c'], [0.42, 1, 'c', 1]],
    lo: [[0.82, 0], [1, 0.08, 'g'], [1, 0.76, 'l'], [0.7, 0.85, 'g', 1], [0.46, 1, 'c']] },
  bleach: { rz: 0.72, r: [[0.9, 0], [1, 0.03, 'g'], [1, 0.08, 'g'], [1, 0.68, 'l'], [0.96, 0.74, 'g'], [0.82, 0.8, 'g'], [0.5, 0.87, 'g'], [0.36, 0.9, 'g', 1], [0.42, 0.905, 'c', 1], [0.43, 0.99, 'c', 1], [0.39, 1, 'c', 1]],
    lo: [[0.92, 0], [1, 0.05, 'g'], [1, 0.7, 'l'], [0.38, 0.9, 'g', 1], [0.42, 1, 'c']] },
  aero: { r: [[0.95, 0], [1, 0.012, 'm', 1], [1, 0.03, 'm'], [1, 0.72, 'l'], [0.98, 0.745, 'm'], [0.9, 0.765, 'm', 1], [0.93, 0.77, 'c', 1], [0.94, 0.97, 'c'], [0.86, 1, 'c', 1]],
    lo: [[0.95, 0], [1, 0.02, 'm'], [1, 0.74, 'l'], [0.92, 0.77, 'c', 1], [0.92, 1, 'c']] },
  syrup: { r: [[0.94, 0], [1, 0.03, 'g'], [1, 0.6, 'l'], [0.96, 0.66, 'g'], [0.78, 0.71, 'g'], [0.48, 0.75, 'g'], [0.42, 0.79, 'g', 1], [0.52, 0.795, 'c', 1], [0.53, 0.98, 'c', 1], [0.48, 1, 'c', 1]],
    lo: [[0.95, 0], [1, 0.05, 'g'], [1, 0.62, 'l'], [0.44, 0.78, 'g', 1], [0.52, 1, 'c']] },
  pump: { r: [[0.93, 0], [1, 0.03, 'g'], [1, 0.7, 'l'], [0.94, 0.75, 'g'], [0.6, 0.79, 'g', 1], [0.42, 0.795, 'c', 1], [0.42, 0.84, 'c', 1], [0.16, 0.845, 'c', 1], [0.15, 0.92, 'c', 1], [0.3, 0.925, 'c', 1], [0.3, 0.98, 'c'], [0.25, 1, 'c', 1]],
    lo: [[0.95, 0], [1, 0.05, 'g'], [1, 0.72, 'l'], [0.4, 0.8, 'c', 1], [0.36, 0.9, 'c', 1], [0.16, 1, 'c']] },
  lotion: { rz: 0.7, r: [[0.93, 0], [1, 0.03, 'g'], [1, 0.72, 'l'], [0.92, 0.78, 'g'], [0.6, 0.82, 'g', 1], [0.36, 0.825, 'c', 1], [0.34, 0.9, 'c', 1], [0.14, 0.905, 'c', 1], [0.14, 0.94, 'c', 1], [0.26, 0.945, 'c', 1], [0.26, 0.985, 'c'], [0.2, 1, 'c', 1]],
    lo: [[0.95, 0], [1, 0.05, 'g'], [1, 0.74, 'l'], [0.34, 0.83, 'c', 1], [0.3, 0.92, 'c', 1], [0.14, 1, 'c']] },
  baby: { r: [[0.95, 0], [1, 0.04, 'g'], [1, 0.68, 'l'], [1.02, 0.69, 'c', 1], [1.02, 0.8, 'c', 1], [0.5, 0.84, 'w', 1], [0.33, 0.9, 'w'], [0.27, 0.96, 'w'], [0.12, 1, 'w']],
    lo: [[0.95, 0], [1, 0.05, 'g'], [1, 0.68, 'l'], [1.02, 0.8, 'c', 1], [0.5, 0.84, 'w', 1], [0.12, 1, 'w']] },
  polish: { r: [[0.96, 0], [1, 0.03, 'g'], [1, 0.46, 'l'], [0.94, 0.5, 'g', 1], [0.4, 0.52, 'g', 1], [0.42, 0.53, 'c', 1], [0.42, 0.98, 'c'], [0.38, 1, 'c', 1]],
    lo: [[1, 0], [1, 0.48, 'l'], [0.5, 0.5, 'c', 1], [0.44, 1, 'c']] },
  milkjug: { rz: 0.8, r: [[0.9, 0], [1, 0.04, 'g'], [1, 0.66, 'l'], [0.94, 0.73, 'g'], [0.8, 0.79, 'g'], [0.5, 0.86, 'g'], [0.36, 0.885, 'g', 1], [0.41, 0.89, 'c', 1], [0.42, 0.99, 'c', 1], [0.38, 1, 'c', 1]],
    lo: [[0.92, 0], [1, 0.05, 'g'], [1, 0.68, 'l'], [0.38, 0.88, 'g', 1], [0.4, 1, 'c']] },
  vial: { r: [[0.96, 0], [1, 0.03, 'g'], [1, 0.7, 'l'], [0.92, 0.74, 'g'], [0.6, 0.77, 'g', 1], [0.64, 0.775, 'c', 1], [0.64, 0.98, 'c'], [0.58, 1, 'c', 1]],
    lo: [[1, 0], [1, 0.72, 'l'], [0.62, 0.78, 'c', 1], [0.6, 1, 'c']] },
};
const S_BOTTLE = (k, s, c, d) => {
  const sil = SIL[d.sil] || SIL.water, R = s[0] / 2, Rz = (s[2] / 2) * (sil.rz && s[2] === s[0] ? sil.rz : 1), h = s[1];
  const rings = R01(k.lod ? sil.lo : sil.r, R, Rz, h); let lh = 0; for (let i = 1; i < rings.length; i++) if (rings[i].p === 'l') lh += rings[i].y - rings[i - 1].y;
  const lab = k.pk(d, d.lk || 'wrap', Math.PI * (R + Rz), lh, {});
  const capC = d.cc ?? d.c2 ?? 0xeeeeee, last = rings[rings.length - 1].p, kc = d.c2 ?? 0x7b1f1f, rid = k.lod ? null : ridgeTex(k);
  k.lathe(rings, segsOf(k, d, sil.rz ? 14 : 12), { g: { c }, l: { c: 0xffffff, rect: lab }, c: { c: capC, rect: rid }, k: { c: kc }, m: { c: 0xc0c0c0 }, w: { c: 0xfff3e0 } }, { bottom: shade(c, 0.85), top: last === 'g' ? c : last === 'k' ? shade(kc, 0.9) : last === 'w' ? 0xfff3e0 : capC });
  if (d.sil === 'pump' || d.sil === 'lotion') { const y = d.sil === 'pump' ? h * 0.46 : h * 0.47; k.box(R * 0.42, y, 0, R * 0.62, h * 0.028, Math.min(R, Rz) * 0.3, capC); }
};
S('pbot', S_BOTTLE);
// Conserve : sertis haut et bas en relief, couvercle embouti en retrait, étiquette sur le fût (anneau d'ouverture
// sur les boîtes plates de poisson / pâtée)
function TIN(k, R, Rz, h, lab, metal, top, o = {}) {
  const s1 = Math.min(0.0035, h * 0.05), dr = Math.min(0.0012, R * 0.03), sg = segsOf(k, o, R > 0.06 ? 18 : 14), q = (r, y, p, hd) => ({ r: r, rz: r * Rz / R, y, p, h: hd ? 1 : 0 });
  const rings = k.lod ? [q(R * 0.96, -h / 2), q(R, -h / 2 + s1, 'm'), q(R, h / 2 - s1, 'l'), q(R, h / 2, 'm', 1), q(R - 0.0025, h / 2 - 0.0022, 'm')]
    : [q(R - 0.004, -h / 2), q(R, -h / 2 + 0.0015, 'm', 1), q(R, -h / 2 + s1, 'm', 1), q(R - dr, -h / 2 + s1 + 0.0006, 'm'), q(R - dr, h / 2 - s1 - 0.0006, 'l'), q(R, h / 2 - s1, 'm', 1), q(R, h / 2, 'm', 1), q(R - 0.0022, h / 2, 'm', 1), q(R - 0.0026, h / 2 - 0.003, 'm')];
  k.lathe(rings, sg, { m: { c: metal }, l: { c: 0xffffff, rect: lab } }, { bottom: shade(metal, 0.9), top: top ?? metal });
  if (o.ring && !k.lod) { k.torus(0, h / 2 - 0.0021, R * 0.45, Math.min(0.009, R * 0.28), shade(metal, 1.1), Math.PI / 2, 0, 0, true, 1); k.box(0, h / 2 - 0.0024, R * 0.2, R * 0.22, 0.0008, R * 0.3, shade(metal, 1.1)); }
}
// Canette : fond bombé rentré, épaulement et col rétreint, couvercle à languette
function BEVCAN(k, R, h, lab, metal, top) {
  const q = (r, y, p, hd) => ({ r: R * r, y: -h / 2 + y, p, h: hd ? 1 : 0 }), sg = k.lod ? 6 : 16;
  const rings = k.lod ? [q(0.7, 0), q(1, 0.012, 'm'), q(1, h - 0.014, 'l'), q(0.86, h, 'm', 1), q(0.78, h - 0.0015, 'm')]
    : [q(0.58, 0.003), q(0.68, 0, 'm', 1), q(0.9, 0.006, 'm'), q(1, 0.013, 'm'), q(1, 0.018, 'm'), q(1, h - 0.018, 'l'), q(0.97, h - 0.012, 'm'), q(0.88, h - 0.005, 'm'), q(0.84, h - 0.0015, 'm'), q(0.865, h, 'm', 1), q(0.8, h - 0.0012, 'm', 1)];
  k.lathe(rings, sg, { m: { c: metal }, l: { c: 0xffffff, rect: lab } }, { bottom: shade(metal, 0.8), top: top ?? metal });
  if (!k.lod) { k.box(0, h / 2 - 0.0008, R * 0.22, R * 0.34, 0.0007, R * 0.52, shade(metal, 1.08)); k.box(0, h / 2 - 0.0008, -R * 0.33, R * 0.3, 0.0005, R * 0.28, shade(metal, 0.55)); } // languette, ouverture
}
// Pot évasé (yaourt, crème dessert, compote, nouilles) : opercule ou couvercle, collerette
function POTE(k, R, h, lab, c, lid, foil) {
  const sg = k.lod ? 6 : 14, q = (r, y, p, hd) => ({ r: R * r, y: -h / 2 + y, p, h: hd ? 1 : 0 });
  k.lathe([q(0.76, 0), ...(k.lod ? [] : [q(0.79, 0.003, 'a')]), q(0.95, h - 0.005, 'l'), q(1, h - 0.0045, 'a', 1), q(1, h - (foil ? 0.0012 : 0.006), 'a', 1), ...(foil ? [] : [q(1, h - 0.001, 'k'), q(0.94, h, 'k', 1)])], sg, { a: { c: shade(c, 0.97) }, l: { c: 0xffffff, rect: lab }, k: { c: lid } }, { bottom: shade(c, 0.85), top: lid });
}
S('pcan', (k, s, c, d) => {
  const R = s[0] / 2, Rz = s[2] / 2, h = s[1], metal = d.mc ?? 0xc9c9c9, id = d.id, lid = d.lid;
  if (d.rim) { const lab = k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.82, {}); BEVCAN(k, R, h, lab, metal, d.lid); return; }
  if (/yogurt|dessert|compote/.test(id)) { POTE(k, R, h, k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.8, {}), c, lid ?? 0xd9d9d9, true); return; }
  if (/icecream|noodles/.test(id)) { POTE(k, R, h, k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.78, {}), c, lid ?? 0xffffff, /noodles/.test(id)); return; }
  if (/tuna|mackerel|cat_food_can/.test(id)) { TIN(k, R, Rz, h, k.pk(d, 'wrap', Math.PI * (R + Rz), h * 0.7, {}), metal, d.lid, { ring: 1 }); return; }
  const capped = lid != null || /cocoa|baby_milk|galettes|biscuit|polish|varnish|chips_tube|tennis|salt|parmesan/.test(id), sg = segsOf(k, d, R > 0.05 ? 18 : 14);
  if (id === 'party_popper') { const lab = k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.8, {}); k.lathe([{ r: R, y: -h / 2 }, { r: R * 0.95, y: -h / 2 + h * 0.08, p: 'k', h: 1 }, { r: R * 0.36, y: h / 2 - h * 0.06, p: 'l' }, { r: R * 0.2, y: h / 2, p: 'a', h: 1 }], sg, { k: { c: lid ?? 0xd32f2f }, l: { c: 0xffffff, rect: lab }, a: { c: 0xf5f5f5 } }, { bottom: lid ?? 0xd32f2f, top: 0xf5f5f5 }); k.sweep([[0, h / 2, 0], [R * 0.2, h / 2 - h * 0.04, R * 0.1], [R * 0.3, h / 2 - h * 0.12, 0]], 0.0008, 0xffffff, { nu: 3 }); return; }
  if (id === 'silicone') { const lab = k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.66, {}); k.lathe([{ r: R * 0.97, y: -h / 2 }, { r: R, y: -h / 2 + 0.004, p: 'a', h: 1 }, { r: R, y: h * 0.2, p: 'l' }, { r: R, y: h * 0.24, p: 'a', h: 1 }, { r: R * 0.42, y: h * 0.27, p: 'k', h: 1 }, { r: R * 0.12, y: h / 2 - 0.002, p: 'k' }, { r: R * 0.07, y: h / 2, p: 'k', h: 1 }], sg, { a: { c }, l: { c: 0xffffff, rect: lab }, k: { c: lid ?? 0xd32f2f } }, { bottom: 0x9e9e9e, top: lid ?? 0xd32f2f }); return; }
  if (id === 'pen_cup') { // pot à crayons ouvert : paroi intérieure, fond, trois stylos
    const lab = k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.8, {});
    k.lathe([{ r: R * 0.97, y: -h / 2 }, { r: R, y: -h / 2 + 0.003, p: 'a' }, { r: R, y: h / 2 - 0.003, p: 'l' }, { r: R * 0.97, y: h / 2, p: 'a', h: 1 }], sg, { a: { c }, l: { c: 0xffffff, rect: lab } }, { bottom: c });
    k.surf(sg, 1, (u, v) => { const a = 2 * Math.PI * (u - 0.5); return [R * 0.9 * Math.sin(a), -h / 2 + 0.004 + (h - 0.004) * v, R * 0.9 * Math.cos(a)]; }, shade(c, 0.6), { flip: true });
    k.surf(sg, 1, (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = R * (0.97 - 0.07 * v); return [r * Math.sin(a), h / 2, r * Math.cos(a)]; }, c);
    k.tube(0, -h / 2 + 0.0045, 0, R * 0.9, 0.001, shade(c, 0.5), sg);
    for (const [x, z, col] of [[-0.3, 0.2, 0x1565c0], [0.25, -0.1, 0xd32f2f], [0, -0.35, 0x212121]]) k.tube(x * R, h / 2 - 0.0105, z * R, 0.004, 0.02, col, 6);
    return;
  }
  if (id === 'plastic_cups') { const lab = k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.4, {}), n = k.lod ? 4 : 12, rr = []; for (let i = 0; i <= n; i++) { const y = -h / 2 + (i / n) * h * 0.97; rr.push({ r: R * (0.86 + 0.12 * (i / n)) * (i % 2 ? 1 : 0.985), y, p: i > n * 0.3 && i <= n * 0.7 ? 'l' : 'a' }); } rr.push({ r: R * 0.97, y: h / 2, p: 'a', h: 1 }); k.lathe(rr, sg, { a: { c: 0xf2f4f6 }, l: { c: 0xffffff, rect: lab } }, { bottom: 0xe8eaec, top: d.c2 ?? 0xe8eaec }); return; }
  if (capped) { // boîte ou tube à couvercle : fût étiqueté légèrement en retrait, couvercle (moleté pour le plastique)
    const lh = Math.min(h * 0.22, 0.03), lab = k.pk(d, 'wrap', Math.PI * (R + Rz), h - lh - 0.004, {}), plast = lid != null, lc = lid ?? (d.c2 ?? shade(metal, 0.95)), q = (r, y, p, hd) => ({ r: R * r, rz: Rz * r, y, p, h: hd ? 1 : 0 });
    const topR = /galettes|biscuit|polish/.test(id) ? k.pk(d, 'box', s[0] * 0.8, s[2] * 0.8, { layout: 3 }, id + ':top') : null;
    k.lathe([q(0.95, -h / 2), q(0.97, -h / 2 + 0.002, 'm', 1), q(0.97, h / 2 - lh - 0.001, 'l'), q(0.97, h / 2 - lh, 'm', 1), q(1, h / 2 - lh + 0.0005, 'k', 1), q(1, h / 2 - 0.0015, 'k'), q(0.97, h / 2, 'k', 1)], sg, { m: { c: metal }, l: { c: 0xffffff, rect: lab }, k: { c: topR ? shade(c, 0.9) : lc, rect: plast && !k.lod ? ridgeTex(k, 30) : null } }, { bottom: shade(metal, 0.9), top: topR ? 0xffffff : lc, topRect: topR });
    return;
  }
  TIN(k, R, Rz, h, k.pk(d, 'wrap', Math.PI * (R + Rz), h * 0.86, {}), metal, d.lid, d);
});
// Bocal en verre : épaule arrondie, col, couvercle vissé moleté (contenu visible au-dessus et au-dessous de l'étiquette)
const S_JAR = (k, s, c, d) => {
  const R = s[0] / 2, Rz = s[2] / 2, h = s[1], lab = k.pk(d, 'wrap', Math.PI * (R + Rz), h * 0.62), lid = d.c2 ?? 0xd4af37, g = d.gc ?? shade(c, 0.82);
  const lh = Math.min(h * 0.2, 0.024), q = (r, y, p, hd) => ({ r: R * r, rz: Rz * r, y: -h / 2 + y * h, p, h: hd ? 1 : 0 }), ly = 1 - lh / h;
  const rings = k.lod ? [q(0.92, 0), q(1, 0.1, 'g'), q(1, 0.72, 'l'), q(0.86, ly, 'g', 1), q(0.9, 1, 'c')]
    : [q(0.88, 0), q(0.97, 0.025, 'g'), q(1, 0.07, 'g'), q(1, 0.1, 'g'), q(1, 0.72, 'l'), q(0.98, 0.76, 'g'), q(0.92, ly - 0.06, 'g'), q(0.86, ly - 0.02, 'g'), q(0.86, ly, 'g', 1), q(0.91, ly + 0.005, 'c', 1), q(0.91, 0.985, 'c'), q(0.87, 1, 'c', 1)];
  k.lathe(rings, segsOf(k, d, 14), { l: { c: 0xffffff, rect: lab }, g: { c: g }, c: { c: lid, rect: k.lod ? null : ridgeTex(k, 36) } }, { bottom: shade(g, 0.85), top: lid });
};
S('pjar', S_JAR);
// Tube (crème, dentifrice, colle) posé sur son bouchon, extrémité soudée en haut
S('ptube', (k, s, c, d) => {
  const R = Math.min(s[0], s[2]) / 2, W = s[0] / 2, h = s[1], cap = d.c2 ?? 0xfafafa, ch = h * 0.16;
  const lab = k.pk(d, 'wrap', Math.PI * R * 2, h * 0.72);
  k.lathe([{ r: R * 0.8, y: -h / 2 }, { r: R * 0.85, y: -h / 2 + ch, p: 'c' }, { r: R, y: -h / 2 + ch + 0.002, p: 'c' }, { r: R, y: -h * 0.12, p: 'l' }, { r: W * 0.9, rz: R * 0.5, y: h * 0.3, p: 'l' }, { r: W, rz: 0.002, y: h * 0.44, p: 'l' }, { r: W, rz: 0.0015, y: h / 2, p: 's' }], segsOf(k, d, 8), { c: { c: cap }, l: { c: 0xffffff, rect: lab }, s: { c: d.lc ?? c, rect: k.lod ? null : ridgeTex(k, 24) } }, { bottom: cap });
});
// Soudure plate double face (sachets) de y0 à y1, bord supérieur cranté (n dents) ; z = 0
function sealFin(k, w, y0, y1, c, n, up = 1) {
  const col = lin(c), w2 = w / 2, N = Math.max(1, n), wh = k.white;
  for (const sz of [1, -1]) {
    const o = k.b.vertexCount;
    for (let i = 0; i <= N; i++) { const x = -w2 + (i / N) * w, t = n && i % 2 ? Math.abs(y1 - y0) * 0.22 : 0; k.vtx(x, y0, sz * 0.0003, 0, 0, sz, wh.u0, wh.v0, col); k.vtx(x, up > 0 ? y1 - t : y1 + t, sz * 0.0003, 0, 0, sz, wh.u0, wh.v0, col); }
    for (let i = 0; i < N; i++) { const a = o + i * 2; (sz > 0) === (up > 0) ? k.b.idx.push(a, a + 2, a + 3, a, a + 3, a + 1) : k.b.idx.push(a, a + 3, a + 2, a, a + 1, a + 3); }
  }
}
// Sachet « oreiller » (chips, bonbons, farine) : faces bombées dans les deux sens (le gonflement s'annule sur les plis
// latéraux), soudures haute et basse crantées
const S_PILLOW = (k, s, c, d) => {
  const w = s[0], h = s[1], dz = s[2] / 2, lab = k.pk(d, d.lk || 'bag', w, h * 0.86), sc = d.sc ?? shade(d.lc ?? c, 0.75);
  const fin = h * 0.07, y0 = -h / 2 + fin, bh = h - 2 * fin, nu = k.lod ? 4 : 5, nv = k.lod ? 4 : 5;
  const P = (sg) => (u, v) => { const g = Math.pow(Math.sin(Math.PI * v), 0.6), f = Math.pow(Math.sin(Math.PI * u), 0.5); return [sg * (u - 0.5) * w * (1 - 0.05 * g), y0 + bh * v, sg * dz * f * g]; };
  k.surf(nu, nv, P(1), 0xffffff, { open: true, rect: lab }); k.surf(nu, nv, P(-1), 0xffffff, { open: true, rect: lab });
  sealFin(k, w, y0 + bh - 0.0005, h / 2, sc, k.lod ? 0 : 8, 1); sealFin(k, w, y0 + 0.0005, -h / 2, sc, k.lod ? 0 : 8, -1);
};
S('pbag', S_PILLOW);
// Sachet tenant debout (doypack) : fond à soufflet ovale, faces bombées qui se rejoignent sous la soudure haute (zip)
S('ppouch', (k, s, c, d) => {
  const w = s[0], h = s[1], dz = s[2] / 2, ys = h * 0.4, lab = k.pk(d, d.lk || 'box', w, h * 0.9), sc = shade(d.lc ?? c, 0.8), nu = k.lod ? 4 : 7, nv = k.lod ? 3 : 5;
  const zf = (u, v) => dz * Math.pow(Math.sin(Math.PI * u), 0.45) * Math.pow(1 - Math.pow(v, 1.6), 0.8);
  const P = (sg) => (u, v) => [sg * (u - 0.5) * w * (1 - 0.03 * Math.sin(Math.PI * v)), -h / 2 + (ys + h / 2) * v, sg * zf(u, v)];
  k.surf(nu, nv, P(1), 0xffffff, { open: true, rect: lab }); k.surf(nu, nv, P(-1), 0xffffff, { open: true, rect: lab });
  const o = k.b.vertexCount, cl = lin(sc); k.vtx(0, -h / 2, 0, 0, -1, 0, k.white.u0, k.white.v0, cl); // fond (lentille)
  for (let i = 0; i <= nu * 2; i++) { const u = i <= nu ? i / nu : (i - nu) / nu, sg = i <= nu ? 1 : -1, p = P(sg)(u, 0); k.vtx(p[0], p[1], p[2], 0, -1, 0, k.white.u0, k.white.v0, cl); }
  for (let i = 1; i <= nu * 2; i++) k.b.idx.push(o, o + i + 1 > o + nu * 2 + 1 ? o + 1 : o + i + 1, o + i);
  sealFin(k, w, ys - 0.0005, h / 2, shade(d.lc ?? c, 0.9), k.lod ? 0 : 1, 1);
  if (!k.lod) { k.box(0, ys + (h / 2 - ys) * 0.35, 0, w * 0.96, 0.0014, 0.0016, shade(d.lc ?? c, 0.7)); k.box(w / 2 - 0.004, ys + (h / 2 - ys) * 0.7, 0, 0.003, 0.0012, 0.0012, 0x222222); } // zip, encoche
});
// Brique (lait, jus, soupe) : toit à pignon ou dessus plat avec bouchon
const S_BRICK = (k, s, c, d, gable = d.gable) => {
  const w = s[0], h = s[1], dd = s[2], bh = gable ? h * 0.8 : h * 0.94, y0 = -h / 2, straw = d.id === 'juice_kids', bd = straw ? dd - 0.003 : dd, bz = straw ? 0.0015 : 0;
  const lab = k.pk(d, d.lk || 'box', w, bh), side = k.pk(d, 'plain', bd, bh, { bg: d.lc ?? c, brand: d.b || d.l }, d.id + ':side');
  cbox(k, 0, y0 + bh / 2, bz, w, bh, bd, c, { Z: lab, z: lab, X: side, x: side }, {}, gable ? 'Y' : '', 0.0022);
  const cap = d.c2 ?? 0x1e88e5;
  if (gable) {
    const yt = y0 + bh, ya = h / 2 - h * 0.04, sc = shade(d.lc ?? c, 0.92);
    k.quad([-w / 2, yt, dd / 2], [w / 2, yt, dd / 2], [w / 2, ya, 0], [-w / 2, ya, 0], sc); k.quad([w / 2, yt, -dd / 2], [-w / 2, yt, -dd / 2], [-w / 2, ya, 0], [w / 2, ya, 0], sc);
    k.quad([w / 2, yt, dd / 2], [w / 2, yt, -dd / 2], [w / 2, ya, 0], [w / 2, ya, 0], sc); k.quad([-w / 2, yt, -dd / 2], [-w / 2, yt, dd / 2], [-w / 2, ya, 0], [-w / 2, ya, 0], sc);
    k.box(0, ya + h * 0.02, 0, w, h * 0.04, 0.006, sc);
    k.tube(w * 0.18, yt + (ya - yt) * 0.45, dd * 0.22, Math.min(w, dd) * 0.14, 0.014, cap, 6, { m: new THREE.Matrix4().makeRotationX(0.75) });
  } else { // brique : soudure du dessus, oreilles repliées sur les flancs, bouchon vissé strié (ou paille sous film au dos)
    if (k.lod) { if (!straw) k.tube(w * 0.2, y0 + bh + h * 0.027, dd * 0.15, Math.min(w, dd) * 0.13, h * 0.055, cap, 6); return; }
    const sc = shade(d.lc ?? c, 0.92); k.box(0, y0 + bh + 0.0014, bz, w * 0.97, 0.0028, 0.004, sc);
    if (!k.lod) for (const sx of [-1, 1]) k.setT(mm(TR(sx * (w / 2 + 0.0002), y0 + bh - bd * 0.2, bz), RY(sx * Math.PI / 2))).prism([[-bd * 0.42, bd * 0.18], [bd * 0.42, bd * 0.18], [0, -bd * 0.14]], 0.0006, sc, { back: false }).setT(null);
    if (straw) { k.setT(mm(TR(-w * 0.15, 0, -dd / 2 + 0.0014), RZ(0.22))).pbox(0, 0, 0, 0.007, h * 0.8, 0.0024, 0xf2f2f2).setT(null); return; }
    const rc = Math.min(w, dd) * 0.13, hc = h * 0.055; k.setT(TR(w * 0.2, y0 + bh, dd * 0.15)).lathe([{ r: rc * 1.1, y: 0 }, { r: rc * 1.1, y: hc * 0.2, p: 'b', h: 1 }, { r: rc, y: hc * 0.25, p: 'a' }, { r: rc, y: hc * 0.85, p: 'a' }, { r: rc * 0.88, y: hc, p: 'a', h: 1 }], k.lod ? 6 : 12, { b: { c: cap }, a: { c: cap, rect: k.lod ? null : ridgeTex(k, 24) } }, { top: shade(cap, 1.1) }).setT(null);
  }
};
S('pbrick', (k, s, c, d) => S_BRICK(k, s, c, d));
// Boîte en carton imprimée (céréales, biscuits, jouets, appareils…) ; boîte plate : étiquette dessus
S('pbox', (k, s, c, d) => {
  const kind = d.lk || 'box', flat = d.top ?? (s[1] < Math.min(s[0], s[2]) * 0.45);
  if (flat) { const r = k.pk(d, kind, s[0], s[2]); const e = k.pk(d, 'plain', s[0], Math.max(0.02, s[1]), { bg: d.lc ?? c, brand: d.b || d.l }, d.id + ':edge'); cbox(k, 0, 0, 0, s[0], s[1], s[2], c, { Y: r, Z: e, z: e }); return; }
  const r = k.pk(d, kind, s[0], s[1]);
  const sideL = d.sides ? k.pk(d, 'plain', s[2], s[1], { bg: d.lc ?? c, brand: d.b }, d.id + ':side') : null;
  cbox(k, 0, 0, 0, s[0], s[1], s[2], d.sc ?? c, { Z: r, z: d.back === false ? null : r, X: sideL, x: sideL });
});
// Paquet de rouleaux (papier toilette, essuie-tout) sous film : rouleaux en volume (mandrins visibles au-dessus),
// bandeau imprimé autour du lot
S('prolls', (k, s, c, d) => {
  const nx = d.rx || 3, ny = d.ry || 2, nz = d.rz || 2, W = s[0], H = s[1], D = s[2], rr = Math.min(W / nx, D / nz) / 2 * 0.97, rh = H / ny, sg = k.lod ? 7 : 11;
  const band = k.pk(d, 'rolls', W, H * 0.5, { nx, ny: 1 }), core = 0x9c7a52, film = shade(c, 0.97);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) for (let q = 0; q < nz; q++) {
    const x = -W / 2 + (i + 0.5) * W / nx, z = -D / 2 + (q + 0.5) * D / nz, y0 = -H / 2 + j * rh, top = j === ny - 1;
    k.setT(new THREE.Matrix4().makeTranslation(x, y0, z));
    k.lathe([{ r: rr * 0.9, y: 0 }, { r: rr, y: rh * 0.06, p: 'a' }, { r: rr, y: rh * 0.94, p: 'a' }, { r: rr * 0.9, y: rh, p: 'a' }], sg, { a: { c: film } }, { bottom: j ? null : film, top: top ? film : null });
    if (top) k.lathe([{ r: rr * 0.26, y: rh + 0.0004 }, { r: rr * 0.18, y: rh + 0.0004, p: 'k', h: 1 }], sg, { k: { c: core } }, { top: shade(core, 0.45) });
    k.setT(null);
  }
  k.rbox(0, -H * 0.06, 0, W + 0.0005, H * 0.5, D + 0.0005, c, 0.012, { Z: band, z: band }, {}, 'Yy');
});
// Boîte d'œufs (carton moulé) : fond à alvéoles bombées, couvercle étiqueté, languette de fermeture
S('peggs', (k, s, c, d) => {
  const top = k.pk(d, 'eggs', s[0], s[2], { nx: d.pn || 3, bg: c }), e = k.pk(d, 'plain', s[0], s[1], { bg: d.lc ?? c, brand: d.l || 'ŒUFS' }, d.id + ':edge');
  const W = s[0], H = s[1], D = s[2], n = Math.max(2, Math.round(W / 0.05)), pulp = shade(c, 0.92);
  for (let i = 0; i < n; i++) for (const sz of [-1, 1]) k.orb(-W / 2 + (i + 0.5) * W / n, -H / 2 + H * 0.24, sz * D * 0.24, W / n * 0.47, H * 0.24, D * 0.24, pulp, 8, 4, { f: (u, v, p) => (v > 0.5 ? [p[0], 0, p[2]] : p) });
  k.rbox(0, H * 0.06, 0, W, H * 0.14, D, pulp, 0.002, { Z: e, z: e }); // bord du fond
  k.rbox(0, H * 0.3, 0, W * 0.98, H * 0.34, D * 0.97, c, 0.007, { Y: top }); // couvercle
  k.box(0, H * 0.17, D / 2 - 0.004, W * 0.12, H * 0.16, 0.004, shade(c, 0.85)); // languette
});
// Boîte de médicament / comprimés
S('pills', (k, s, c, d) => { const r = k.pk(d, 'pharma', s[0], s[2], { bg: c === 0xffffff ? 0x00897b : c, name: d.l ?? d.name.split(' ')[0], sub: d.sub ?? (d.p?.amount ? '500 mg' : '16 comprimés'), brand: d.b ?? 'Pharmalys' }); cbox(k, 0, 0, 0, s[0], s[1], s[2], 0xffffff, { Y: r }, { Z: c, z: c }); });
// Blister sur carte
S('pblist', (k, s, c, d) => { // carte trouée (fente européenne) + coque transparente qui laisse voir le produit imprimé
  const W = s[0], H = s[1], D = s[2], ct = Math.min(0.0012, D * 0.1), r = k.pk(d, 'blister', W, H), bg = d.lc ?? c;
  if (k.lod) { k.pbox(0, 0, -D / 2 + ct / 2, W, H, ct, 0xffffff, { Z: r }, { z: shade(bg, 0.75) }); k.pbox(0, -H * 0.07, ct / 2, W * 0.76, H * 0.42, D - ct, d.c2 ?? 0xdfe8ed, { Z: { u0: r.u0 + (r.u1 - r.u0) * 0.12, u1: r.u0 + (r.u1 - r.u0) * 0.88, v0: r.v0 + (r.v1 - r.v0) * 0.22, v1: r.v0 + (r.v1 - r.v0) * 0.64 } }, {}, 'z'); return; }
  k.setT(TR(0, 0, -D / 2 + ct / 2)).prism(rrect(W, H, Math.min(0.004, W * 0.05), 2), ct, 0xffffff, { F: r, holes: [rrect(W * 0.24, H * 0.07, H * 0.035, 3, 0, H * 0.415)], cs: shade(bg, 0.85), cb: shade(bg, 0.75) }).setT(null);
  const win = { u0: r.u0 + (r.u1 - r.u0) * 0.12, u1: r.u0 + (r.u1 - r.u0) * 0.88, v0: r.v0 + (r.v1 - r.v0) * 0.22, v1: r.v0 + (r.v1 - r.v0) * 0.64 }, bd = D - ct;
  k.box(0, -H * 0.07, -D / 2 + ct + 0.0003, W * 0.82, H * 0.48, 0.0006, d.c2 ?? 0xe6edf1); // collerette
  cbox(k, 0, -H * 0.07, -D / 2 + ct + bd / 2, W * 0.76, H * 0.42, bd, d.c2 ?? 0xdfe8ed, { Z: win }, {}, 'z', Math.min(0.005, bd * 0.3));
});
// Boîte à chaussures (petit côté vers l'allée) : fond + couvercle débordant
S('pshoebox', (k, s, c, d) => { const r = k.pk(d, 'shoebox', s[0], s[1], { serif: d.serif }); k.pbox(0, -s[1] * 0.06, 0, s[0] * 0.98, s[1] * 0.88, s[2] * 0.98, c, { Z: r, z: r }); k.pbox(0, s[1] * 0.4, 0, s[0], s[1] * 0.2, s[2], d.c2 ?? shade(c, 0.75), {}, {}, 'y'); });
// Livre debout, couverture vers +z, dos à gauche (−x). Relié : plats cartonnés débordant du bloc de pages (chasse),
// dos arrondi ; broché : bloc unique aux arêtes adoucies dont les tranches montrent les pages.
const leaves = (k, v) => k.shared(v ? 'leaves:v' : 'leaves:h', 32, 32, { kind: 'leaves', v });
function BOOKG(k, w, h, t, c, cov, spine, back, hard) {
  if (!hard) { const pv = leaves(k, 1), ph = leaves(k, 0); k.rbox(0, 0, 0, w, h, t, c, Math.min(0.0012, t * 0.2), { Z: cov, z: back, x: spine, X: pv, Y: ph, y: ph }, { z: back ? 0xffffff : c }); return; }
  const bt = Math.min(0.003, Math.max(0.0011, t * 0.09)), ov = Math.min(0.0032, w * 0.025), rx = Math.min(bt * 1.8, w * 0.06), xc = -w / 2 + rx, bw = w / 2 - xc;
  k.pbox(xc + bw / 2, 0, t / 2 - bt / 2, bw, h, bt, c, { Z: cov }); // plat avant
  k.pbox(xc + bw / 2, 0, -t / 2 + bt / 2, bw, h, bt, c, back ? { z: back } : {});
  // dos arrondi (demi-ellipse) et ses deux bouts
  const sp = (u, y) => { const a = Math.PI * (u - 0.5); return [xc - rx * Math.cos(a), y, (t / 2) * Math.sin(a)]; };
  k.surf(6, 1, (u, v) => sp(u, -h / 2 + h * v), spine ? 0xffffff : c, { open: true, rect: spine });
  for (const s of [-1, 1]) { const o = k.b.vertexCount, cl = lin(c); k.vtx(xc, s * h / 2, 0, 0, s, 0, k.white.u0, k.white.v0, cl); for (let i = 0; i <= 6; i++) { const p = sp(i / 6, s * h / 2); k.vtx(p[0], p[1], p[2], 0, s, 0, k.white.u0, k.white.v0, cl); } for (let i = 1; i <= 6; i++) s > 0 ? k.b.idx.push(o, o + i, o + i + 1) : k.b.idx.push(o, o + i + 1, o + i); }
  const px0 = xc, px1 = w / 2 - ov, pv = leaves(k, 1), ph = leaves(k, 0); // bloc de pages en retrait
  k.pbox((px0 + px1) / 2, 0, 0, px1 - px0, h - 2 * ov, t - 2 * bt, 0xffffff, { X: pv, Y: ph, y: ph }, {}, 'xzZ');
}
const SOFTB = /mag|guide|map|notebook|coloring|crossword|sudoku|travel|manga|diary|binder/;
const S_BOOK = (k, s, c, d) => {
  const cov = k.pk(d, d.lk || 'book', s[0], s[1]), spine = k.pk(d, 'spine', Math.max(0.03, s[2]), s[1], {}, d.id + ':spine', 16);
  const back = d.bk ? k.pk(d, 'plain', s[0], s[1], { bg: c, brand: '' }, d.id + ':back') : null;
  if (d.id === 'binder') { // classeur à levier : dos large avec étiquette et trou de préhension
    k.rbox(0, 0, 0, s[0], s[1], s[2], c, 0.002, { x: spine, z: back }, { Z: shade(c, 0.9) });
    k.tube(-s[0] / 2 + 0.0017, -s[1] * 0.28, 0, s[2] * 0.09, 0.004, 0x1a1a1a, 10, { m: new THREE.Matrix4().makeRotationZ(Math.PI / 2) }); return;
  }
  BOOKG(k, s[0], s[1], s[2], c, cov, spine, back, !d.soft && !SOFTB.test(d.id) && s[2] >= 0.009 && s[1] >= 0.15);
};
S('pbook', S_BOOK);
// Magazine / revue : couverture souple, dos carré collé
S('pmag', (k, s, c, d) => { const r = k.pk(d, d.lk || 'mag', s[0], s[1]); k.rbox(0, 0, 0, s[0], s[1], s[2], 0xf5f5f5, Math.min(0.001, s[2] * 0.3), { Z: r, X: leaves(k, 1), Y: leaves(k, 0) }, { z: c, x: c }); });
// Rangée de livres (lot / série) : un volume par livre (largeurs et hauteurs variées, un livre parfois sorti du rang),
// dos imprimés sur une seule étiquette dont la disposition suit la géométrie
S('pspines', (k, s, c, d) => {
  const n = d.pn || Math.max(3, Math.round(s[0] / 0.028)), rnd = mulberry32(d.id.length * 131 + n), W = s[0], H = s[1], D = s[2];
  const pal = d.pal || [0x1565c0, 0xc62828, 0x2e7d32, 0xf9a825, 0x4e342e, 0x6a1b9a, 0x37474f, 0xad1457, 0x00838f, 0xef6c00];
  const ws = []; for (let i = 0; i < n; i++) ws.push(0.8 + rnd() * 0.4); const sw = ws.reduce((a, b) => a + b, 0), gap = Math.min(0.0015, W * 0.004);
  const case_ = /dvd|games/.test(d.id), vhs = /vhs/.test(d.id), books = []; let x = -W / 2;
  for (let i = 0; i < n; i++) { const bw = ws[i] / sw * W, hf = d.even || case_ || vhs ? 1 : 0.84 + rnd() * 0.16, col = d.even && d.lc != null ? d.lc : pal[(rnd() * pal.length) | 0]; books.push([(x + W / 2) / W, (x + bw - gap + W / 2) / W, hf, col, (rnd() < 0.18 ? 1 : 0) * Math.min(0.012, D * 0.08)]); x += bw; }
  const r = k.pk(d, 'spines', W, H, { n, titles: d.titles, books: books.map((b) => b.slice(0, 4)) });
  for (const [a, b, hf, col, out] of books) {
    const x0 = -W / 2 + a * W, x1 = -W / 2 + b * W, bh = H * hf, bd = D - Math.min(0.012, D * 0.08);
    const sub = { u0: r.u0 + (r.u1 - r.u0) * a, u1: r.u0 + (r.u1 - r.u0) * b, v0: r.v0, v1: r.v0 + (r.v1 - r.v0) * hf };
    k.pbox((x0 + x1) / 2, -H / 2 + bh / 2, D / 2 - bd / 2 - (Math.min(0.012, D * 0.08) - out), x1 - x0, bh, bd, col, { Z: sub }, { Y: case_ ? 0x151515 : vhs ? col : 0xefe6d2, z: shade(col, 0.7) });
  }
});
// Pile d'exemplaires identiques posés à plat (légers décalages) : couverture dessus, tranche (plats + pages) autour
S('ppile', (k, s, c, d) => {
  const n = d.pn || 5, cov = k.pk(d, d.lk || 'book', s[0], s[2], {}, d.id + ':cover'), ed = k.pk(d, 'pages', s[0], s[1] / n, { n: 1, bg: c }, d.id + ':edge1');
  const rnd = mulberry32(d.id.length * 17 + n), e = Math.min(0.004, s[0] * 0.03), bw = s[0] - 2 * e, bd = s[2] - 2 * e, bh = s[1] / n;
  for (let i = 0; i < n; i++) {
    const th = (rnd() - 0.5) * 2 * Math.min(0.03, e / Math.max(bw, bd)), sl = e - Math.abs(th) * Math.max(bw, bd) / 2, ox = (rnd() - 0.5) * 2 * sl, oz = (rnd() - 0.5) * 2 * sl;
    k.setT(new THREE.Matrix4().makeTranslation(ox, -s[1] / 2 + bh * (i + 0.5), oz).multiply(new THREE.Matrix4().makeRotationY(th)));
    k.pbox(0, 0, 0, bw, bh * 0.985, bd, c, { Y: cov, Z: ed, X: ed, x: ed, z: ed }); k.setT(null);
  }
});
// Cagette en bois à claire-voie (lattes, montants d'angle) remplie : tas bosselé à la texture des fruits + quelques
// fruits en volume posés dessus
S('pcrate', (k, s, c, d) => {
  const W = s[0], H = s[1], D = s[2], wood = d.c2 ?? 0xc8a165, y0 = -H / 2, wh = H * 0.55, st = 0.008, post = 0.022;
  const lab = k.pk(d, 'plain', W - 2 * post, wh * 0.42, { bg: wood, brand: d.b || 'VERGERS DE FRANCE', fg: 0x5d4037 }, (d.b || 'crate') + ':crate');
  const sl = wh * 0.42, gap = wh - 2 * sl, wd = (i) => shade(wood, 0.9 + 0.1 * ((i * 7) % 3) / 2);
  for (const sz of [1, -1]) for (let j = 0; j < 2; j++) k.pbox(0, y0 + sl / 2 + j * (sl + gap), sz * (D / 2 - st / 2), W - 2 * post, sl, st, wd(j + (sz > 0 ? 0 : 2)), j && sz > 0 ? { Z: lab } : {}); // lattes avant / arrière
  for (const sx of [1, -1]) for (let j = 0; j < 2; j++) k.box(sx * (W / 2 - st / 2), y0 + sl / 2 + j * (sl + gap), 0, st, sl, D - 2 * post, wd(j + 1));
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.box(sx * (W / 2 - post / 2), y0 + wh / 2 + 0.004, sz * (D / 2 - post / 2), post, wh + 0.008, post, shade(wood, 0.82)); // montants
  k.box(0, y0 + 0.003, 0, W - 0.004, 0.006, D - 0.004, shade(wood, 0.7)); // fond
  const U = ITEMS[d.pk?.of], fc = U ? U.c : c, top = k.shared('fruits:' + (fc >>> 0).toString(16), 96, 72, { kind: 'fruits', bg: fc }), my = y0 + wh * 0.9;
  const fr = U ? Math.min(U.s[0], U.s[1]) * 0.25 : 0.01;
  k.surf(8, 6, (u, v) => { const x = (u - 0.5) * (W - 2 * st - 0.002), z = (0.5 - v) * (D - 2 * st - 0.002), e = Math.sin(Math.PI * u) * Math.sin(Math.PI * v); return [x, my + fr * (0.6 * e + 0.4 * Math.abs(Math.sin(u * 23 + v * 7) * Math.cos(v * 19))), z]; }, 0xffffff, { open: true, rect: top });
  if (U) {
    const g = unitGeo(U, k.atlas, 1), rnd = mulberry32((d.id.length * 7) | 0), lay = U.s[1] > Math.max(U.s[0], U.s[2]) * 1.4, uw = Math.max(U.s[0], U.s[2]), uh = lay ? uw : U.s[1], ul = lay ? U.s[1] : uw, IW = W - 2 * post, ID = D - 2 * post;
    let nx = Math.max(1, Math.floor(IW / (ul * 1.08))), nz = Math.max(1, Math.floor(ID / (uw * 1.08))); const mx = k.lod ? 3 : 12; while (nx * nz > mx) { if (nx >= nz) nx--; else nz--; }
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) k.copyGeo(g, mm(TR(((a + 0.5) / nx - 0.5) * IW + (rnd() - 0.5) * 0.12 * ul, my + fr * 0.3 + uh * (0.26 + 0.08 * rnd()), ((b + 0.5) / nz - 0.5) * ID + (rnd() - 0.5) * 0.12 * uw), lay ? mm(RY((rnd() - 0.5) * 0.25), RZ(Math.PI / 2)) : mm(RY(rnd() * 6), RX((rnd() - 0.5) * 0.4))));
  }
});
// unités à couvercle (pots, boîtes, bouteilles) : dessus des rangs arrière couleur couvercle ; sinon couleur du produit
const JARLIKE = new Set(['pjar', 'jar', 'pcan', 'can', 'pbot', 'bottle', 'cyl', 'carton', 'pbrick']);
// Unité de présentoir : géométrie simplifiée (lod 1) si la rangée reste dans le budget, sinon silhouette étiquetée
// (cylindre ou boîte portant l'étiquette du produit)
const PACKS = new Set(['pjar', 'pcan', 'pbot', 'bottle', 'can', 'jar', 'pbox', 'labelbox', 'pbrick', 'carton', 'pills', 'ptube']);
function unitRow(k, U, xs, y, z, rot, maxV = 280) {
  const g = unitGeo(U, k.atlas, 1), n = g.attributes.position.count, pack = PACKS.has(U.shape);
  if (n * xs.length <= (pack ? maxV : maxV * 1.4)) { for (const x of xs) { const m = TR(x, y, z); if (rot) m.multiply(rot); k.copyGeo(g, m); } return; }
  const jar = JARLIKE.has(U.shape), [w, h, dd] = U.s;
  for (const x of xs) {
    if (!pack) k.box(x, y, z, w, h, dd, U.c); // objet détaillé en grand nombre : simple bloc coloré
    else if (jar) { const lab = k.pk(U, U.lk || 'wrap', Math.PI * (w + dd) / 2, h * 0.8); k.setT(TR(x, y, z)); k.lathe([{ r: w * 0.46, rz: dd * 0.46, y: -h / 2 }, { r: w / 2, rz: dd / 2, y: -h * 0.4, p: 'a' }, { r: w / 2, rz: dd / 2, y: h * 0.38, p: 'l' }, { r: w * 0.4, rz: dd * 0.4, y: h / 2, p: 'a' }], 6, { a: { c: U.c2 ?? U.c }, l: { c: 0xffffff, rect: lab } }, { bottom: U.c, top: U.c2 ?? U.lid ?? U.c }); k.setT(null); }
    else { const lab = k.pk(U, U.lk || 'box', w, h); k.pbox(x, y, z, w, h, dd, U.c, { Z: lab }); }
  }
}
// Présentoir prêt-à-vendre (barquette carton) : premier rang réel, rangs arrière en bloc (dessus : couvercles
// imprimés ; flancs : unités ombrées)
S('ptray', (k, s, c, d) => {
  const P = d.pk || {}, U = ITEMS[P.of]; if (!U) { k.box(0, 0, 0, s[0], s[1], s[2], c); return; }
  const nx = P.nx || 3, nz = P.nz || 3, W = s[0], H = s[1], D = s[2], y0 = -H / 2, t = 0.003, uh = U.s[1];
  const gx = (W - 2 * t) / nx, gz = (D - 2 * t) / nz, fh = Math.min(H, Math.max(0.025, uh * 0.3)), wh = Math.min(H, Math.max(0.03, uh * 0.5));
  const lab = k.pk(d, 'tray', W, fh, { bg: d.lc ?? 0xffffff, brand: U.b, name: U.l ?? U.name, picto: U.pi, accent: U.lc ?? U.c }, null, 12);
  const kc = d.c2 ?? shade(d.lc ?? 0xf5f5f5, 0.92);
  k.pbox(0, y0 + fh / 2, D / 2 - t / 2, W, fh, t, kc, { Z: lab }, {}, 'zyxX'); // bord avant imprimé (tranche du carton visible)
  const q2 = (a, b, e, f) => { k.quad(a, b, e, f, kc); k.quad(b, a, f, e, kc); }; // carton mince : deux faces
  q2([W / 2, y0, -D / 2], [-W / 2, y0, -D / 2], [-W / 2, y0 + wh, -D / 2], [W / 2, y0 + wh, -D / 2]);
  q2([W / 2, y0, D / 2 - t], [W / 2, y0, -D / 2], [W / 2, y0 + wh, -D / 2], [W / 2, y0 + fh, D / 2 - t]); q2([-W / 2, y0, -D / 2], [-W / 2, y0, D / 2 - t], [-W / 2, y0 + fh, D / 2 - t], [-W / 2, y0 + wh, -D / 2]);
  k.quad([-W / 2, y0, -D / 2], [W / 2, y0, -D / 2], [W / 2, y0, D / 2], [-W / 2, y0, D / 2], shade(kc, 0.85)); k.quad([W / 2, y0 + 0.0005, -D / 2], [-W / 2, y0 + 0.0005, -D / 2], [-W / 2, y0 + 0.0005, D / 2], [W / 2, y0 + 0.0005, D / 2], shade(kc, 0.9)); // fond (deux faces)
  if (P.hdr) { const hl = k.pk(d, 'box', W, H, { bg: U.lc ?? U.c, brand: U.b, name: U.l ?? U.name, picto: U.pi, sub: '× ' + nx * nz }, d.id + ':hdr'); k.pbox(0, 0, -D / 2 + 0.004, W, H, 0.008, kc, { Z: hl }); } // fronton imprimé
  const uy = y0 + 0.002 + uh / 2, xs = []; for (let i = 0; i < nx; i++) xs.push(-W / 2 + t + gx * (i + 0.5));
  unitRow(k, U, xs, uy, D / 2 - t - gz * 0.5, P.rot ? RY(P.rot) : null);
  if (nz > 1) {
    const z0 = -D / 2 + t, z1 = D / 2 - t - gz, top = y0 + 0.002 + uh * (P.tf ?? 0.97), jar = JARLIKE.has(U.shape);
    const lids = k.shared(`lids:${nx}:${nz - 1}:${P.sq ? 1 : 0}`, Math.min(192, 20 * nx), Math.min(192, 20 * (nz - 1)), { kind: 'lids', nx, nz: nz - 1, square: !!P.sq, ring: !!P.ring });
    const side = k.shared(`cols:${nz - 1}:${jar ? 0 : 1}`, Math.min(96, 16 * (nz - 1)), 24, { kind: 'cols', n: nz - 1, box: !jar }), bc = shade(P.bc ?? U.lc ?? U.c, 0.8);
    const fr = k.shared(`cols:${nx}:${jar ? 0 : 1}`, Math.min(96, 16 * nx), 24, { kind: 'cols', n: nx, box: !jar }); // face avant : rang suivant vu entre les unités
    k.pbox(0, (y0 + top) / 2, (z0 + z1) / 2, W - 2 * t, top - y0, z1 - z0, bc, { Y: lids, X: side, x: side, Z: fr }, { Y: P.lid ?? (jar ? U.c2 ?? 0xd6d6d6 : U.lc ?? U.c), X: bc, x: bc, Z: bc }, 'y');
  }
});
// Lot sous film / étui carton (packs de bouteilles, yaourts, canettes) : unités en volume (toutes si le lot est petit),
// étui imprimé qui cache le bas des unités, poignée
S('pmulti', (k, s, c, d) => {
  const P = d.pk || {}, U = ITEMS[P.of]; if (!U) { k.box(0, 0, 0, s[0], s[1], s[2], c); return; }
  const nx = P.nx || 3, nz = P.nz || 2, W = s[0], H = s[1], D = s[2], y0 = -H / 2, uh = U.s[1], gx = W / nx, gz = D / nz;
  const xs = []; for (let i = 0; i < nx; i++) xs.push(-W / 2 + gx * (i + 0.5));
  const all = nx * nz <= 6 || P.all, rows = all ? nz : 1;
  for (let j = 0; j < rows; j++) unitRow(k, U, xs, y0 + uh / 2, D / 2 - gz * (j + 0.5), null, 640);
  if (P.sleeve) { // étui carton imprimé qui cache le bas des unités
    const sh = Math.min(H, uh * (P.sh ?? 0.72)), lab = k.pk(d, d.lk || 'box', W, sh, { layout: d.lay ?? 3 }), side = k.pk(d, 'plain', D, sh, { bg: d.lc ?? c, brand: d.b }, d.id + ':side');
    cbox(k, 0, y0 + sh / 2, 0, W + 0.001, sh, D + 0.001, c, { Z: lab, z: lab, X: side, x: side }, {}, 'Y', 0.002);
    const ih = sh - 0.001, iw = W - 0.003, idd = D - 0.003, yc = y0 + 0.0005 + ih / 2, Q = (a, b, e) => [a * iw / 2, yc + b * ih / 2, e * idd / 2], ci = shade(c, 0.7); // parois intérieures (carton brut)
    k.quad(Q(1, -1, 1), Q(-1, -1, 1), Q(-1, 1, 1), Q(1, 1, 1), ci); k.quad(Q(-1, -1, -1), Q(1, -1, -1), Q(1, 1, -1), Q(-1, 1, -1), ci); k.quad(Q(1, -1, -1), Q(1, -1, 1), Q(1, 1, 1), Q(1, 1, -1), ci); k.quad(Q(-1, -1, 1), Q(-1, -1, -1), Q(-1, 1, -1), Q(-1, 1, 1), ci); k.quad(Q(-1, -1, 1), Q(1, -1, 1), Q(1, -1, -1), Q(-1, -1, -1), ci);
    if (P.handle) { k.box(0, y0 + sh + 0.012, 0, W * 0.3, 0.024, 0.004, c); k.box(0, y0 + sh + 0.004, 0, 0.004, 0.008, D * 0.9, shade(c, 0.85)); }
  }
  if (!all) { const top = y0 + uh * (P.tf ?? 0.8), lids = k.shared(`lids:${nx}:${nz - 1}:0`, Math.min(192, 20 * nx), Math.min(192, 20 * (nz - 1)), { kind: 'lids', nx, nz: nz - 1 }); k.pbox(0, (y0 + top) / 2, -gz / 2, W * 0.96, top - y0, D - gz, shade(U.c, 0.8), { Y: lids }, { Y: P.lid ?? U.c2 ?? 0xd6d6d6 }, 'y'); }
  if (P.handle && !P.sleeve) { k.box(0, H / 2 - 0.006, 0, W * 0.3, 0.004, 0.03, 0xfafafa); for (const sx of [-1, 1]) k.box(sx * W * 0.15, H / 2 - 0.012, 0, 0.004, 0.016, 0.03, 0xfafafa); }
});
// Carton de réserve fermé (étiquette imprimée, ruban adhésif sur le dessus)
S('pcase', (k, s, c, d) => {
  const r = k.pk(d, 'case', s[0], s[1], { bg: d.lc ?? c, fragile: d.fragile }), kc = ((d.lc ?? c) >>> 0).toString(16);
  const sd = k.shared('caseside:' + (d.b || '') + ':' + kc + (d.fragile ? ':f' : ''), 88, 64, { kind: 'case', bg: d.lc ?? c, brand: d.b || '', name: d.b ? '' : 'HÉLIOS', fragile: d.fragile, tape: 1 });
  cbox(k, 0, 0, 0, s[0], s[1], s[2], c, { Z: r, z: r, X: sd, x: sd, Y: k.shared('casetop:' + kc, 64, 64, { kind: 'casetop', bg: d.lc ?? c }) }, {}, '', Math.min(0.004, Math.min(...s) * 0.03));
});

// ═════════════════════ ALIMENTATION : FRUITS, LÉGUMES, PAINS, PÂTISSERIES, RESTAURATION ═════════════════════
// Bruit déterministe léger (taches, nervures, croûte) et transition douce
const hn = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// Pédoncule : petit tube incurvé
function stalk(k, x, y, z, len, r = 0.0018, c = 0x6d4c2f, lean = 0.4) { const P = []; for (let i = 0; i <= 3; i++) { const t = i / 3; P.push([x + Math.sin(lean) * len * t * t, y + len * t, z + Math.sin(lean * 0.6) * len * t * 0.3]); } k.sweep(P, (t) => r * (1 - 0.35 * t), c, { nu: 4, cap1: true }); }
// Feuille plate double face, nervure centrale pliée : base (x, y, z), direction (dx, dy, dz), largeur w
function leafAt(k, x, y, z, dx, dy, dz, len, w, c, fold = 0.25, nv = 4) {
  const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  let sx = -dz, sy = 0, sz = dx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl; if (Math.abs(dy) > 0.98) { sx = 1; sz = 0; }
  const ux = sy * dz - sz * dy, uy = sz * dx - sx * dz, uz = sx * dy - sy * dx; // normale du limbe
  const P = (sg) => (u, v) => { const a = (u - 0.5) * 2, wd = w * Math.sin(Math.PI * Math.pow(v, 0.8)) * 0.5, f = fold * w * Math.abs(a) - len * 0.12 * v * v, s = sg * a * wd; return [x + dx * len * v + sx * s + ux * f, y + dy * len * v + sy * s + uy * f, z + dz * len * v + sz * s + uz * f]; };
  k.surf(2, k.lod ? 2 : nv, P(1), c, { open: true }); k.surf(2, k.lod ? 2 : nv, P(1), shade(c, 0.85), { open: true, flip: true });
}
// Fruit rond déformable : creux du pédoncule (dt) et de l'œil (db), épaules (sh), côtes (rib : n, amplitude),
// couleur de base + fard (blush : couleur, part), taches (spot)
function fruitBody(k, x, y, z, rx, ry, rz, c, o = {}) {
  const nu = k.lod ? 10 : o.nu || 14, nv = k.lod ? 6 : o.nv || 10, dt = o.dt ?? 0.3, db = o.db ?? 0.15, sh = o.sh ?? 0, rib = o.rib || [0, 0];
  k.orb(x, y, z, rx, ry, rz, c, nu, nv, {
    f: (u, v, p) => { const a = 2 * Math.PI * u, rr = (1 + sh * (v - 0.5)) * (1 + rib[1] * Math.cos(rib[0] * a) * Math.sin(Math.PI * v)) * (o.lump ? 1 + o.lump * (hn(u * 7, v * 5) - 0.5) : 1); return [p[0] * rr, p[1] - ry * dt * sstep(0.82, 1, v) * (o.dtk ?? 1) + ry * db * sstep(0.16, 0, v), p[2] * rr]; },
    col: (u, v) => { let col = c; if (o.blush) col = mixc(col, o.blush, Math.max(0, Math.sin(2 * Math.PI * u + 1.1)) * (o.bk ?? 0.55) * (0.4 + 0.6 * v)); if (o.spot) col = mixc(col, o.spot, hn(u * 31, v * 17) > 0.86 ? 0.5 : 0); if (o.stripe) col = mixc(col, o.stripe, Math.max(0, Math.cos(o.sn * 2 * Math.PI * u)) ** 6 * 0.7); return col; },
  });
}
// Profil de révolution libre r(v), y(v) (poire, avocat, aubergine) ; même repère que lathe
function revo(k, x, y, z, R, Y, c, nu, nv, col) { return k.surf(nu, nv, (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = R(v); return [x + r * Math.sin(a), y + Y(v), z + r * Math.cos(a)]; }, c, { col }); }
const FRUIT = {
  apple: (k, w, h, dz, c, d) => { fruitBody(k, 0, -h * 0.14, 0, w, h * 0.86, dz, c, { sh: 0.14, rib: [5, 0.025], blush: d.id === 'green_apple' ? 0xd8d860 : 0xf0c040, bk: d.id === 'green_apple' ? 0.35 : 0.45, spot: 0xf6e7a0 }); stalk(k, 0, h * 0.4, 0, h * 0.5); if (d.lf !== false) leafAt(k, 0.002, h * 0.72, 0, 1, 0.18, 0.3, w * 0.7, w * 0.32, 0x4f8a2e); },
  orange: (k, w, h, dz, c) => { fruitBody(k, 0, 0, 0, w, h, dz, c, { dt: 0.06, db: 0.06, lump: 0.025, spot: shade(c, 0.85) }); k.orb(0, h * 0.95, 0, w * 0.1, h * 0.04, w * 0.1, 0x6b7a2a, 6, 3); },
  lemon: (k, w, h, dz, c) => { k.orb(0, -h * 0.14, 0, w * 0.76, h * 0.86, dz * 0.86, c, 14, 8, { f: (u, v, p) => { const e = Math.abs(p[0]) / w; return [p[0] * (1 + 0.32 * Math.pow(Math.max(0, 1 - Math.hypot(p[1] / h, p[2] / dz) * 1.4), 2)), p[1], p[2]]; }, col: (u, v) => mixc(c, shade(c, 0.88), hn(u * 23, v * 29) > 0.8 ? 0.6 : 0) }); },
  tomato: (k, w, h, dz, c) => { fruitBody(k, 0, 0, 0, w, h, dz, c, { dt: 0.18, db: 0.05, rib: [6, 0.05], blush: 0xff6040, bk: 0.25 }); const P = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? w * 0.12 : w * 0.42; P.push([Math.cos(a) * r, Math.sin(a) * r]); } k.setT(mm(TR(0, h * 0.84, 0), RX(-Math.PI / 2 + 0.05))).prism(P, 0.0012, 0x2e6b26).setT(null); stalk(k, 0, h * 0.86, 0, h * 0.2, 0.0016, 0x3e6b2a, 0.2); },
};
// Fruits et légumes du rayon (fr = variété) : demi-axes w, h, dz
const VEG = {
  pear: (k, w, h, dz, c, d) => { const R = (v) => w * Math.max(Math.sqrt(Math.max(0, 1 - ((v - 0.34) / 0.34) ** 2)), 0.5 * Math.sqrt(Math.max(0, 1 - ((v - 0.68) / 0.32) ** 2))); revo(k, 0, -h, 0, R, (v) => h * 1.84 * v, c, 14, 10, (u, v) => mixc(c, d.id === 'avocado' ? 0x1e3a12 : 0xc89a3a, hn(u * 19, v * 13) > 0.8 ? 0.45 : 0.1 * v)); if (d.fl !== false) stalk(k, 0, h * 0.8, 0, h * 0.18, 0.0016); },
  religieuse: (k, w, h, dz, c) => { revo(k, 0, -h, 0, (v) => w * 0.98 * Math.sin(Math.PI * Math.max(0.04, v)), (v) => h * 1.1 * v, c, 12, 7, (u, v) => (v > 0.55 ? c : 0xe0b070)); k.orb(0, h * 0.2, 0, w * 0.75, h * 0.08, w * 0.75, 0xfff5e0, 12, 3); revo(k, 0, h * 0.25, 0, (v) => w * 0.55 * Math.sin(Math.PI * Math.max(0.05, v)), (v) => h * 0.72 * v, c, 10, 6, (u, v) => (v > 0.5 ? c : 0xe0b070)); k.orb(0, h * 0.93, 0, w * 0.12, h * 0.07, w * 0.12, 0xfff5e0, 6, 3); },
  small: (k, w, h, dz, c, d) => { const lime = d.id === 'lime', hb = lime ? h : h * 0.9, yb = hb - h; fruitBody(k, 0, yb, 0, w, hb, dz, c, { nu: 10, nv: 7, dt: 0.15, db: 0.05, f: 1, rib: [1, 0], blush: d.id === 'apricot' ? 0xf06030 : null, bk: 0.4, spot: lime ? shade(c, 0.8) : null }); if (!lime) { if (!k.lod) { const P = []; for (let i = 0; i <= 6; i++) { const t = Math.PI * (0.15 + i / 6 * 0.68); P.push([0, yb - hb * Math.cos(t), dz * Math.sin(t) * 1.01]); } k.sweep(P, 0.0006, shade(c, 0.6), { nu: 3 }); } stalk(k, 0, yb + hb * 0.85, 0, h * 0.22, 0.0012); } },
  round: (k, w, h, dz, c, d) => {
    if (d.id === 'chausson' || d.id === 'calzone') { const P = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; P.push([Math.cos(a) * w, Math.sin(a) * dz * 1.9 - dz * 0.95]); } k.setT(mm(TR(0, -h * 0.05, 0), RX(-Math.PI / 2))).prism(P, h * 1.8, c, { bev: h * 0.7, smooth: true, cs: shade(c, 0.85) }).setT(null); for (let i = 0; i < 9; i++) { const a = i / 8 * Math.PI; k.box(Math.cos(a) * w * 0.94, -h * 0.1, Math.sin(a) * dz * 1.85 - dz * 0.92, 0.003, h * 0.5, 0.003, shade(c, 0.75)); } return; }
    if (d.id === 'potato') { fruitBody(k, 0, 0, 0, w, h, dz, c, { nu: 10, nv: 7, dt: 0, db: 0, lump: 0.16, spot: shade(c, 0.7) }); return; }
    if (d.id === 'kiwi') { k.orb(0, 0, 0, w, h, dz, c, 12, 8, { e: [0.92, 1], col: (u, v) => mixc(c, 0x4a3520, hn(u * 41, v * 37) * 0.5) }); return; }
    const st = d.fl !== false, hb = st ? h * (d.lf ? 0.88 : 0.92) : h, yb = hb - h;
    fruitBody(k, 0, yb, 0, w, hb, dz, c, { dt: d.id === 'clementine' ? 0.06 : 0.2, db: 0.06, lump: d.id === 'clementine' ? 0.03 : 0, blush: d.id === 'peach' || d.id === 'mango' ? 0xe0503a : null, bk: 0.6, sh: d.id === 'mango' ? -0.1 : 0 });
    if (st) { stalk(k, 0, yb + hb * 0.9, 0, h * 0.15, 0.0014); if (d.lf) leafAt(k, 0.001, yb + hb * 0.97, 0, 1, 0.12, -0.3, w * 0.85, w * 0.38, 0x3f7a2a, 0.15); }
  },
  long: (k, w, h, dz, c, d) => { // courgette, concombre, aubergine (debout)
    const egg = d.id === 'eggplant', R = (v) => (egg ? w * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, 0.15 + v * 0.75))) : w * 0.96) * Math.pow(Math.sin(Math.PI * Math.max(0.02, Math.min(0.98, v))), 0.35);
    revo(k, 0, -h, 0, R, (v) => h * 1.9 * v, c, 12, 9, (u, v) => (egg ? mixc(c, 0x6a3a8a, Math.max(0, Math.sin(u * 6.28 + 1)) * 0.3) : mixc(c, d.id === 'cucumber' ? 0x1d3a14 : 0x9fc46a, Math.pow(Math.max(0, Math.cos(u * 6.28 * 5)), 4) * 0.45 + (hn(u * 30, v * 40) > 0.9 ? 0.3 : 0))));
    const cc = d.c2 ?? 0x4f7a2a; k.lathe([{ r: R(0.96) * 1.3, y: h * 0.8 }, { r: w * 0.3, y: h * 0.86, p: 'a' }, { r: w * 0.2, y: h * 0.94, p: 'a' }, { r: w * 0.12, y: h, p: 'a', h: 1 }], 8, { a: { c: cc } }, { top: shade(cc, 0.8) });
  },
  leek: (k, w, h, dz, c) => { k.lathe([{ r: w * 0.7, y: -h }, { r: w * 0.9, y: -h + 0.006, p: 'a' }, { r: w * 0.85, y: h * 0.1, p: 'a' }, { r: w * 0.75, y: h * 0.35, p: 'g' }], 10, { a: { c: 0xf2f0e6 }, g: { c: 0xa8c87a } }, { bottom: 0xd8cfb0 }); for (let i = 0; i < 5; i++) { const a = i * 1.3; leafAt(k, Math.cos(a) * w * 0.2, h * 0.3, Math.sin(a) * w * 0.2, Math.cos(a) * 0.02, 1, Math.sin(a) * 0.02, h * 0.68, w * 0.8, i % 2 ? 0x3d6b30 : 0x4f7d3a, 0.4); } for (let i = 0; i < 6; i++) k.sweep([[0, -h, 0], [(i - 2.5) * 0.003, -h - 0.004, 0.002]], 0.0007, 0xcfc4a0, { nu: 3 }); },
  onion: (k, w, h, dz, c, d) => { const garlic = d.id === 'garlic'; k.orb(0, -h * 0.12, 0, w, h * 0.86, dz, c, 14, 9, { f: (u, v, p) => { const a = 2 * Math.PI * u, rr = garlic ? 1 + 0.07 * Math.cos(8 * a) * Math.sin(Math.PI * v) : 1; const top = sstep(0.6, 1, v); return [p[0] * rr * (1 - 0.82 * top * top), p[1] + h * 0.25 * top * top, p[2] * rr * (1 - 0.82 * top * top)]; }, col: (u, v) => mixc(c, garlic ? 0xd8c8b0 : 0x8a4a1e, Math.pow(Math.max(0, Math.cos(u * 6.28 * 7)), 8) * 0.5 + (garlic ? 0 : v * 0.15)) }); k.lathe([{ r: w * 0.06, y: h * 0.7 }, { r: w * 0.02, y: h, p: 'a' }], 5, { a: { c: shade(c, 0.75) } }); for (let i = 0; i < 5; i++) k.sweep([[0, -h * 0.9, 0], [(i - 2) * 0.002, -h, 0.0015]], 0.0006, 0xcdb890, { nu: 3 }); },
  pepper: (k, w, h, dz, c) => { k.orb(0, -h * 0.05, 0, w, h * 0.92, dz, c, 16, 9, { f: (u, v, p) => { const a = 2 * Math.PI * u, rr = 1 + 0.11 * Math.cos(4 * a) * Math.sin(Math.PI * v * 0.9 + 0.2); return [p[0] * rr * (0.82 + 0.2 * v), p[1] - h * 0.22 * sstep(0.85, 1, v) + h * 0.12 * sstep(0.2, 0, v) * (1 + Math.cos(4 * a)) * 0.5, p[2] * rr * (0.82 + 0.2 * v)]; }, col: (u, v) => mixc(c, 0xffffff, Math.pow(Math.max(0, Math.cos(u * 6.28 * 4)), 12) * 0.25) }); k.lathe([{ r: w * 0.28, y: h * 0.62 }, { r: w * 0.18, y: h * 0.72, p: 'a' }, { r: w * 0.1, y: h * 0.8, p: 'a' }, { r: w * 0.09, y: h, p: 'a', h: 1 }], 8, { a: { c: 0x3c6b2a } }, { top: 0x7a8a50 }); },
  pineapple: (k, w, h, dz, c) => { const bh = h * 1.2; k.orb(0, -h + bh / 2, 0, w, bh / 2, dz, c, 14, 10, { e: [0.9, 1], col: (u, v) => { const a = (u * 12 + v * 7) % 1, b = (u * 12 - v * 7 + 10) % 1; return mixc(c, 0x6b4a1e, Math.min(Math.abs(a - 0.5), Math.abs(b - 0.5)) < 0.08 ? 0.55 : hn(u * 9, v * 9) * 0.2); } }); for (let i = 0; i < 12; i++) { const a = i * 2.4, up = 0.6 + (i % 3) * 0.3; leafAt(k, Math.cos(a) * w * 0.12, -h + bh - 0.004, Math.sin(a) * w * 0.12, Math.cos(a) * 0.5, up * 1.6, Math.sin(a) * 0.5, (h * 2 - bh) * (0.75 + 0.25 * (i % 2)), w * 0.32, i % 2 ? 0x3d7a3a : 0x5a8f45, 0.5); } },
  cabbage: (k, w, h, dz, c, d) => { const cauli = d.id === 'cauliflower'; if (cauli) { k.orb(0, h * 0.05, 0, w * 0.8, h * 0.8, dz * 0.8, c, 14, 8, { f: (u, v, p) => { const b = 1 + 0.07 * Math.sin(u * 40) * Math.sin(v * 30); return [p[0] * b, Math.max(p[1] * b, -h * 0.3), p[2] * b]; }, col: (u, v) => mixc(c, 0xd8cfa0, hn(u * 17, v * 11) * 0.4) }); for (let i = 0; i < 7; i++) { const a = i * 0.9; leafAt(k, Math.cos(a) * w * 0.3, -h * 0.85, Math.sin(a) * w * 0.3, Math.cos(a) * 0.9, 0.9, Math.sin(a) * 0.9, h * 1.1, w * 0.7, i % 2 ? 0x4f7d3a : 0x6a9a4a, 0.15); } return; } k.orb(0, 0, 0, w * 0.92, h * 0.94, dz * 0.92, c, 14, 9, { col: (u, v) => mixc(c, 0xe8f0c0, Math.pow(Math.max(0, Math.cos(u * 6.28 * 5 + v * 3)), 10) * 0.6) }); for (let i = 0; i < 5; i++) { const a = i * 1.26, P = (sg) => (u, v) => { const ang = a + (u - 0.5) * 1.6, r = w * (0.6 + 0.4 * Math.sin(Math.PI * (0.3 + v * 0.7))) * (sg > 0 ? 1.0 : 0.97), y = -h * 0.9 + h * 1.5 * v; return [Math.cos(ang) * r, y, Math.sin(ang) * r]; }; k.surf(4, 4, P(1), shade(c, 0.85 + i * 0.04), { open: true, flip: true }); k.surf(4, 4, P(1), shade(c, 1.05), { open: true }); } },
  grapes: (k, w, h, dz, c) => { let i = 0; for (let row = 0; row < 5; row++) { const n = 5 - row, y = h * 0.55 - row * h * 0.36; for (let j = 0; j < n; j++) { const a = j / n * Math.PI * 2 + row, r = (n - 1) * w * 0.17; k.orb(Math.cos(a) * r, y, Math.sin(a) * r * 0.7, w * 0.25, w * 0.27, w * 0.25, i++ % 3 ? c : shade(c, 1.18), 6, 4); } } k.sweep([[0, h * 0.6, 0], [0, h * 0.95, 0.002], [w * 0.15, h, 0]], 0.0018, 0x6b5a2a, { nu: 4, cap1: true }); },
  mushroom: (k, w, h, dz, c) => { TUB(k, w * 1.9, dz * 1.9, w * 2, dz * 2, h * 0.5, 0.006, 0x3a7a3a, 0x2e5e2e, -h); for (const [x, z, s] of [[-0.45, -0.4, 1], [0.4, -0.35, 0.9], [-0.35, 0.45, 0.95], [0.45, 0.4, 1.05], [0, 0, 1.1]]) { const r = w * 0.62 * s, y0 = -h * 0.75; k.setT(TR(x * w * 0.8, 0, z * dz * 0.8)).lathe([{ r: r * 0.28, y: y0 }, { r: r * 0.32, y: y0 + h * 0.55, p: 's' }, { r: r * 0.95, y: y0 + h * 0.68, p: 'u', h: 1 }, { r: r, y: y0 + h * 0.8, p: 'c' }, { r: r * 0.7, y: y0 + h * 1.05, p: 'c' }, { r: 0.001, y: y0 + h * 1.12, p: 'c' }], 9, { s: { c: 0xf2ece0 }, u: { c: 0xb8a088 }, c: { c } }).setT(null); } },
  melon: (k, w, h, dz, c, d) => { const pumpkin = d.id === 'pumpkin'; fruitBody(k, 0, 0, 0, w, h, dz, c, { nu: 18, nv: 10, dt: pumpkin ? 0.25 : 0.08, db: 0.1, rib: [pumpkin ? 10 : 8, pumpkin ? 0.07 : 0.035], stripe: pumpkin ? shade(c, 0.75) : 0x6b8a3a, sn: pumpkin ? 10 : 8, spot: pumpkin ? null : 0xe0e0b0 }); stalk(k, 0, h * (pumpkin ? 0.7 : 0.9), 0, h * 0.25, pumpkin ? 0.008 : 0.003, pumpkin ? 0x5a6a2a : 0x8a7a4a, 0.3); },
  loaf: (k, w, h, dz, c, d) => { // pain de campagne, complet, fougasse
    if (d.id === 'fougasse') { const P = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; P.push([Math.cos(a) * w * (0.86 + 0.1 * Math.cos(a)), Math.sin(a) * dz * (0.9 - 0.25 * Math.max(0, Math.cos(a)))]); } const holes = []; for (const [hx, hz, ang] of [[-0.25, 0.3, 0.6], [-0.25, -0.3, -0.6], [0.2, 0.32, 0.5], [0.2, -0.32, -0.5], [0.45, 0, 0]]) { const H = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, rx = w * 0.13, rz = dz * 0.06; H.push([hx * w + Math.cos(a) * rx * Math.cos(ang) - Math.sin(a) * rz * Math.sin(ang), hz * dz + Math.cos(a) * rx * Math.sin(ang) + Math.sin(a) * rz * Math.cos(ang)]); } holes.push(H); } k.setT(RX(-Math.PI / 2)).prism(P, h * 1.9, c, { holes, bev: h * 0.6, smooth: true, cs: shade(c, 0.8) }).setT(null); return; }
    k.orb(0, -h * 0.02, 0, w, h * 0.98, dz, c, 16, 9, { e: [0.75, 0.9], f: (u, v, p) => [p[0], Math.max(p[1], -h * 0.95), p[2]], col: (u, v, p) => { const sc = Math.abs(((p[0] / w) * 2.2 + (p[2] / dz) * 0.8 + 10) % 1 - 0.5) < 0.05 && v > 0.62; return sc ? 0xe8d0a0 : mixc(c, 0xf2e8d8, hn(u * 21, v * 13) > 0.85 && v > 0.7 ? 0.5 : 0); } });
  },
};
S('fruit', (k, s, c, d) => (FRUIT[d.id] || FRUIT.apple)(k, s[0] / 2, s[1] / 2, s[2] / 2, c, d));
S('pfruit', (k, s, c, d) => { const f = d.id === 'religieuse' ? 'religieuse' : d.fr || 'round'; (VEG[f] || VEG.round)(k, s[0] / 2, s[1] / 2, s[2] / 2, c, d); });
// Banane (section pentagonale, bouts noircis) et carotte (racine conique annelée, fanes)
S('banana', (k, s, c, d) => {
  const L = s[2], R = s[0] / 2;
  if (d.id === 'carrot') { const P = []; for (let i = 0; i <= 8; i++) { const t = i / 8; P.push([0, -s[1] / 2 + R + Math.sin(t * Math.PI) * 0.002, -L / 2 + L * 0.8 * t]); } k.sweep(P, (t) => R * (0.12 + 0.88 * Math.pow(t, 0.55)) * (1 + 0.05 * Math.sin(t * 40)), c, { nu: 8, cap1: true, col: (u, t) => mixc(c, shade(c, 0.75), hn(u * 9, t * 33) > 0.85 ? 0.6 : 0) }); for (let i = 0; i < 4; i++) leafAt(k, 0, -s[1] / 2 + R, L * 0.3, (i - 1.5) * 0.15, 0.2 + (i % 2) * 0.15, 1, L * 0.22, R * 0.8, 0x3f7d2e, 0.1); return; }
  const P = []; for (let i = 0; i <= 8; i++) { const t = i / 8, a = (t - 0.5) * 1.5; P.push([0, -s[1] / 2 + R * 0.9 + (1 - Math.cos(a)) * L * 0.22, Math.sin(a) * L * 0.48]); }
  k.sweep(P, (t) => R * 0.9 * Math.pow(Math.sin(Math.PI * Math.min(0.97, Math.max(0.05, t))), 0.45), c, { nu: 5, cap0: true, cap1: true, col: (u, t) => (t < 0.06 || t > 0.94 ? 0x3b2a14 : mixc(c, 0x8a6a1a, hn(u * 7, t * 41) > 0.9 ? 0.5 : 0)) });
});
// Baguette & co : pain allongé grigné, saucisson, éclair, ficelle, sandwich, wrap (posés à plat, axe z)
S('baguette', (k, s, c, d) => {
  const w = s[0] / 2, h = s[1] / 2, L = s[2] / 2, id = d.id;
  if (id === 'saucisson') { k.orb(0, 0, 0, w * 0.95, h * 0.95, L, c, 10, 9, { e: [0.6, 1], col: (u, v) => mixc(c, 0xe8e0d0, hn(u * 13, v * 11) * 0.55) }); k.sweep([[0, 0, L * 0.98], [0, h * 0.2, L + 0.004], [0, h * 0.6, L + 0.006]], 0.0012, 0xf0e8d0, { nu: 3 }); return; }
  if (id === 'chicken_wrap') { k.orb(0, 0, 0, w, h, L, 0xf2dcae, 10, 8, { e: [0.85, 1], f: (u, v, p) => [p[0], p[1], Math.min(p[2], L * 0.7 + p[0] * 0.5)], col: (u, v) => mixc(0xf2dcae, 0xb07a40, hn(u * 23, v * 17) > 0.88 ? 0.5 : 0) }); k.orb(0, 0, L * 0.68, w * 0.8, h * 0.8, 0.004, 0x7cb342, 8, 4); return; }
  if (id === 'eclair') { k.orb(0, -h * 0.1, 0, w, h * 0.85, L, 0xd8a050, 10, 7, { e: [0.7, 1] }); k.orb(0, h * 0.18, 0, w * 0.82, h * 0.62, L * 0.92, c, 10, 6, { e: [0.6, 1], f: (u, v, p) => [p[0], Math.max(p[1], h * 0.05 - h * 0.18), p[2]] }); return; }
  if (id === 'sandwich_ham') { k.orb(0, -h * 0.45, 0, w, h * 0.5, L, c, 10, 6, { e: [0.7, 1], f: (u, v, p) => [p[0], Math.min(p[1], 0), p[2]] }); k.box(0, -h * 0.4, 0, w * 1.75, h * 0.18, L * 1.85, 0xe8a0a0); k.box(0, -h * 0.25, 0, w * 1.85, h * 0.08, L * 1.8, 0x8bc34a); k.orb(0, -h * 0.15, 0, w, h * 0.85, L, c, 10, 7, { e: [0.7, 1], f: (u, v, p) => [p[0], Math.max(p[1], 0), p[2]], col: (u, v) => mixc(c, 0xf0dca8, v > 0.75 && Math.abs(Math.sin(u * 30 + v * 9)) > 0.95 ? 0.6 : 0) }); return; }
  // baguette, ficelle : grignes en biais
  const n = Math.max(3, Math.min(7, Math.round(s[2] / 0.09)));
  k.orb(0, 0, 0, w, h, L, c, 10, 12, { e: [0.8, 1], f: (u, v, p) => [p[0], Math.max(p[1], -h * 0.85), p[2]], col: (u, v, p) => { const t = (p[2] / L + 1) / 2 * n, ph = t - Math.floor(t), top = p[1] > h * 0.35; const cut = top && Math.abs(ph - 0.5 + p[0] / w * 0.35) < 0.12; return cut ? 0xf0dcb0 : mixc(c, shade(c, 0.78), (1 - v) * 0.4 + (hn(u * 11, v * 23) > 0.9 ? 0.3 : 0)); } });
});
// Croissant : rouleaux feuilletés en arc, cornes effilées
S('croissant', (k, s, c) => { const P = []; for (let i = 0; i <= 18; i++) { const t = i / 18, a = (t - 0.5) * 2.4; P.push([Math.sin(a) * s[0] * 0.38, -s[1] / 2 + s[1] * 0.42 * (1 - 0.25 * Math.abs(t - 0.5)), (Math.cos(a) - 0.75) * s[2] * 0.9]); } k.sweep(P, (t) => s[1] * 0.5 * Math.pow(Math.sin(Math.PI * Math.max(0.06, Math.min(0.94, t))), 0.7) * (1 + 0.1 * Math.cos(t * Math.PI * 10)), c, { nu: 9, rz: 0.82, cap0: true, cap1: true, col: (u, t) => mixc(mixc(c, shade(c, 1.22), Math.max(0, Math.cos(t * Math.PI * 10)) * 0.55), 0x8a4a1a, Math.max(0, Math.sin(u * Math.PI * 2)) * 0.25) }); });
// Gâteaux, tartes, flans, muffins
S('cake', (k, s, c, d) => {
  const R = s[0] / 2, h = s[1], y0 = -h / 2, id = d.id;
  const crust = (fill, fc, ridge = true) => { k.lathe([{ r: R * 0.9, y: y0 }, { r: R * 0.98, y: y0 + h * 0.08, p: 'p' }, { r: R, y: y0 + h * 0.75, p: 'p' }, { r: R * 0.97, y: y0 + h * 0.86, p: 'p' }, { r: R * 0.9, y: y0 + h * 0.8, p: 'p' }, { r: R * 0.89, y: y0 + h * fill, p: 'f', h: 1 }], 20, { p: { c: 0xd8a055, rect: ridge && !k.lod ? ridgeTex(k, 24) : null }, f: { c: fc } }, { bottom: 0xc89048, top: fc }); };
  if (id === 'tarte' || id === 'quiche' || id === 'tarte_citron') { crust(0.7, id === 'tarte' ? 0xc0392b : id === 'quiche' ? 0xe8c060 : c); if (id === 'tarte') for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = R * (i % 2 ? 0.55 : 0.32); k.orb(Math.cos(a) * r, y0 + h * 0.72, Math.sin(a) * r, R * 0.1, h * 0.12, R * 0.1, 0xa31515, 6, 3); } if (id === 'tarte_citron') for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, r = i ? R * 0.55 : 0; k.setT(TR(Math.cos(a) * r, 0, Math.sin(a) * r)).lathe([{ r: R * 0.14, y: y0 + h * 0.68 }, { r: R * 0.08, y: y0 + h * 0.85, p: 'a' }, { r: 0.001, y: y0 + h, p: 'a' }], 6, { a: { c: 0xf5ecd8 } }).setT(null); } return; }
  if (id === 'flan') { k.lathe([{ r: R * 0.92, y: y0 }, { r: R, y: y0 + h * 0.15, p: 'p' }, { r: R, y: y0 + h * 0.9, p: 'f' }, { r: R * 0.96, y: y0 + h, p: 't', h: 1 }], 16, { p: { c: 0xd8a055 }, f: { c }, t: { c: 0xa0602a } }, { bottom: 0xc89048, top: 0xa0602a }); return; }
  if (id === 'muffin') { k.lathe([{ r: R * 0.72, y: y0 }, { r: R * 0.82, y: y0 + h * 0.5, p: 'p' }], 16, { p: { c: d.c2 ?? 0xf5f0e8, rect: k.lod ? null : ridgeTex(k, 28) } }, { bottom: 0xe8e0d0 }); k.orb(0, y0 + h * 0.5, 0, R, h * 0.5, R, c, 14, 7, { f: (u, v, p) => [p[0] * (1 + 0.08 * hn(u * 9, v * 7)), Math.max(p[1], 0) * (1 + 0.1 * hn(u * 7, v * 9)), p[2] * (1 + 0.08 * hn(u * 9, v * 7))], col: (u, v) => mixc(c, 0x2b1a10, hn(u * 23, v * 19) > 0.82 ? 0.7 : 0) }); return; }
  if (id === 'paris_brest') { const P = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2; P.push([Math.cos(a) * R * 0.68, y0 + h * 0.42, Math.sin(a) * R * 0.68]); } k.sweep(P, (t) => h * 0.36 * (1 + 0.15 * Math.cos(t * Math.PI * 16)), c, { nu: 8, rz: 1.0, col: (u, t) => mixc(c, 0xf5e6c8, Math.abs(Math.sin(u * Math.PI * 2)) < 0.25 ? 0.8 : 0) }); for (let i = 0; i < 10; i++) { const a = i * 0.63; deco(k, Math.cos(a) * R * 0.68, y0 + h * 0.86, Math.sin(a) * R * 0.68, 0.006, 0.0012, 0.004, 0xfafafa); } return; }
  if (id === 'galette_rois') { k.lathe([{ r: R * 0.92, y: y0 }, { r: R, y: y0 + h * 0.3, p: 'p' }, { r: R * 0.97, y: y0 + h * 0.85, p: 'p' }, { r: R * 0.9, y: y0 + h, p: 'p', h: 1 }], 20, { p: { c: shade(c, 0.9) } }, { bottom: shade(c, 0.8), top: c }); if (!k.lod) for (let i = -3; i <= 3; i++) for (const a of [0.6, -0.6]) { const L = R * 1.7 * Math.sqrt(Math.max(0.05, 1 - (i / 3.6) ** 2)); k.box(Math.sin(a) * i * R * 0.24, y0 + h + 0.0002, Math.cos(a) * i * R * 0.24, L, 0.0006, 0.0014, shade(c, 0.72), { ry: a + Math.PI / 2 }); } return; }
  // gâteau d'anniversaire / gâteau à étages : génoise, crème, glaçage, bougies
  k.lathe([{ r: R * 0.98, y: y0 }, { r: R, y: y0 + 0.003, p: 'a' }, { r: R, y: y0 + h * 0.72, p: 'a' }, { r: R * 0.97, y: y0 + h * 0.8, p: 'g', h: 1 }, { r: R * 0.9, y: y0 + h * 0.8, p: 'g', h: 1 }], 20, { a: { c }, g: { c: d.c2 ?? shade(c, 1.08) } }, { bottom: c, top: d.c2 ?? shade(c, 1.08) });
  const n = k.lod ? 8 : 18; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; k.orb(Math.cos(a) * R * 0.94, y0 + h * 0.76, Math.sin(a) * R * 0.94, R * 0.075, h * 0.07, R * 0.075, 0xfff8f0, 6, 3); }
  if (id === 'birthday_cake') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = Math.cos(a) * R * 0.5, z = Math.sin(a) * R * 0.5; k.tube(x, y0 + h * 0.8 + h * 0.08, z, 0.0035, h * 0.16, [0x42a5f5, 0xef5350, 0xffee58][i % 3], 6); k.tube(x, y0 + h * 0.97, z, 0.0007, h * 0.04, 0x222222, 3, { open: true }); } k.meta.candles = true; }
});
// Pizza entière : bord gonflé (cornicione), garniture imprimée, rondelles et olives en relief
S('pizza', (k, s, c) => { const R = s[0] / 2, h = s[1]; k.lathe([{ r: R * 0.93, y: -h / 2 }, { r: R, y: -h / 2 + h * 0.35, p: 'a' }, { r: R * 0.97, y: h / 2 - h * 0.05, p: 'a' }, { r: R * 0.9, y: h / 2, p: 'a' }, { r: R * 0.85, y: h * 0.1, p: 'a', h: 1 }], 24, { a: { c: 0xd8a055 } }, { bottom: 0xc8954f, top: 0xffffff, topRect: k.shared('top:pizza', 96, 96, { kind: 'pizza' }) }); if (!k.lod) for (let i = 0; i < 9; i++) { const a = i * 2.39, r = R * 0.6 * Math.sqrt((i + 0.5) / 9); k.tube(Math.cos(a) * r, h * 0.1 + 0.0012, Math.sin(a) * r, R * 0.09, 0.0024, 0xb3261e, 10); } });
// Burger : pain brioché sésame, steak, cheddar fondu aux coins, salade ondulée, tomate
S('burger', (k, s, c, d) => {
  const R = s[0] / 2, h = s[1], y0 = -h / 2, dbl = d.id === 'double_burger', bun = 0xd4924a;
  k.lathe([{ r: R * 0.9, y: y0 }, { r: R * 0.97, y: y0 + h * 0.06, p: 'a' }, { r: R * 0.95, y: y0 + h * 0.18, p: 'a' }, { r: R * 0.9, y: y0 + h * 0.2, p: 'c', h: 1 }], 16, { a: { c: bun }, c: { c: 0xf2dcb0 } }, { bottom: shade(bun, 0.9), top: 0xf2dcb0 });
  let y = y0 + h * 0.2; const layer = (th, r, col, wav = 0) => { k.surf(16, 1, (u, v) => { const a = 2 * Math.PI * (u - 0.5), rr = r * (1 + wav * Math.sin(a * 9)); return [rr * Math.sin(a), y + th * v + (wav ? wav * R * Math.sin(a * 7) * 0.3 : 0), rr * Math.cos(a)]; }, col); k.tube(0, y + th, 0, r * 0.98, 0.0006, col, 16); y += th; };
  layer(h * 0.08, R * 0.98, 0x6aa84f, 0.04);
  for (let i = 0; i < (dbl ? 2 : 1); i++) { k.lathe([{ r: R * 0.98, y }, { r: R, y: y + h * 0.08, p: 'm' }, { r: R * 0.96, y: y + h * 0.16, p: 'm' }], 16, { m: { c: 0x4a2a18 } }, { top: 0x5a321c }); y += h * 0.16; k.box(0, y + 0.001, 0, R * 1.52, 0.002, R * 1.52, 0xffb300, { ry: 0.4 + i }); y += 0.002; }
  k.tube(0, y + h * 0.025, 0, R * 0.8, h * 0.05, 0xd9382a, 14); y += h * 0.05;
  const ty = y; k.orb(0, ty, 0, R * 0.99, h - (ty - y0) - 0.001, R * 0.99, bun, 16, 7, { f: (u, v, p) => [p[0], Math.max(p[1], 0), p[2]], col: (u, v) => (v > 0.62 && hn(u * 37, v * 29) > 0.9 ? 0xfaf3e0 : mixc(bun, 0xb06a28, v * 0.3)) });
});
// Frites, pop-corn, oignons frits, nachos : contenant + garniture en volume
S('fries', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], id = d.id, rnd = mulberry32(d.id.length * 13);
  if (id === 'popcorn' || id === 'popcorn_large') { const R = w / 2; k.lathe([{ r: R * 0.72, y: -h / 2 }, { r: R * 0.98, y: h * 0.28, p: 'a', h: 1 }, { r: R * 0.95, y: h * 0.28, p: 'w', h: 1 }, { r: R * 0.93, y: h * 0.22, p: 'w', h: 1 }, { r: R * 0.6, y: h * 0.33, p: 'f' }, { r: 0.001, y: h * 0.37, p: 'f' }], 16, { a: { c: 0xffffff, rect: k.shared('stripes:' + (c >>> 0).toString(16), 64, 16, { kind: 'stripes', bg: c }) }, w: { c: 0xf5f5f5 }, f: { c: 0xfff3c4 } }, { bottom: 0xffffff }); for (let i = 0; i < (k.lod ? 6 : 16); i++) { const a = rnd() * 6.28, r = rnd() * R * 0.75; k.orb(Math.cos(a) * r, h * 0.3 + rnd() * h * 0.12 - Math.pow(r / R, 2) * h * 0.08, Math.sin(a) * r, R * 0.14, R * 0.12, R * 0.14, 0xfff8e1, 6, 4, { f: (u, v, p) => [p[0] * (1 + 0.3 * hn(u * 5, v * 3)), p[1], p[2] * (1 + 0.3 * hn(v * 5, u * 3))] }); } return; }
  if (id === 'nachos') { k.rbox(0, -h / 2 + h * 0.15, 0, w, h * 0.3, dd, 0x1a1a1a, 0.004); for (let i = 0; i < (k.lod ? 5 : 11); i++) { const a = rnd() * 6.28, P = [[0, 0.012], [-0.011, -0.008], [0.011, -0.008]]; k.setT(mm(TR((rnd() - 0.5) * w * 0.6, -h / 2 + h * 0.35 + rnd() * h * 0.3, (rnd() - 0.5) * dd * 0.55), RY(a), RX(-1.2 + rnd() * 0.6))).prism(P, 0.0015, c).setT(null); } k.lathe([{ r: w * 0.12, y: -h / 2 + h * 0.3 }, { r: w * 0.13, y: -h / 2 + h * 0.6, p: 'a' }], 10, { a: { c: 0xffffff } }, { top: 0xffb300 }); return; }
  // cornet carton évasé + bâtonnets / anneaux
  k.lathe([{ r: w * 0.4, rz: dd * 0.42, y: -h / 2 }, { r: w * 0.5, rz: dd * 0.5, y: h * 0.12, p: 'a', h: 1 }, { r: w * 0.47, rz: dd * 0.46, y: h * 0.12, p: 'i', h: 1 }, { r: w * 0.43, rz: dd * 0.4, y: -h * 0.06, p: 'i' }], 12, { a: { c }, i: { c: shade(c, 0.7) } }, { bottom: shade(c, 0.8), top: id === 'onion_rings' ? 0xc98a3a : 0xe0a83a });
  if (id === 'onion_rings') { for (let i = 0; i < 5; i++) k.torus((rnd() - 0.5) * w * 0.3, h * 0.18 + i * h * 0.05, (rnd() - 0.5) * dd * 0.2, w * 0.2, 0xd9a24a, Math.PI / 2 + (rnd() - 0.5) * 0.8, rnd(), 0); return; }
  const n = k.lod ? 8 : 18; for (let i = 0; i < n; i++) { const x = (rnd() - 0.5) * w * 0.72, z = (rnd() - 0.5) * dd * 0.62, l = h * (0.3 + rnd() * 0.2); k.boxR(x, h * 0.1 + l * 0.3, z, 0.008, l, 0.008, i % 4 ? 0xf2c14e : 0xe0a83a, (rnd() - 0.5) * 0.35, rnd(), (rnd() - 0.5) * 0.35); }
});
// Sucettes, esquimaux, glaces à l'eau, sucre d'orge
S('lollipop', (k, s, c, d) => {
  const id = d.id;
  if (id === 'candy_cane') { const r = s[2] * 0.42, rh = Math.min(s[0] / 2 - r, 0.012), xs = s[0] / 2 - r, ht = s[1] / 2 - r - rh, P = []; for (let i = 0; i <= 5; i++) P.push([xs, -s[1] / 2 + r + (ht + s[1] / 2 - r) * i / 5, 0]); for (let i = 1; i <= 7; i++) { const a = i / 7 * Math.PI; P.push([xs - rh + rh * Math.cos(a), ht + rh * Math.sin(a), 0]); } k.sweep(P, r, 0xffffff, { nu: 7, cap0: true, cap1: true, col: (u, t) => ((u + t * 7) % 0.5 < 0.2 ? c : 0xffffff) }); return; }
  if (id === 'eskimo' || id === 'ice_pop') { const bh = s[1] * 0.68; k.orb(0, s[1] / 2 - bh / 2, 0, s[0] / 2, bh / 2, s[2] / 2, c, 12, 8, { e: [0.4, 0.55], col: id === 'eskimo' ? (u, v) => mixc(c, 0x3a2414, hn(u * 9, v * 13) * 0.3) : null }); k.rbox(0, -s[1] / 2 + (s[1] - bh) / 2 + 0.006, 0, s[0] * 0.18, s[1] - bh + 0.012, s[2] * 0.25, 0xe8d2a6, 0.0015); return; }
  const R = Math.min(s[0], s[1] * 0.4) / 2; k.setT(TR(0, s[1] / 2 - R, 0)); const P = []; for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI * 6, r = R * 0.12 + R * 0.88 * i / 30; P.push([Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92]); } k.prism(ellip(R, R, 18), s[2] * 0.9, c, { bev: s[2] * 0.25, smooth: true }); k.sweep(P.map((p) => [p[0], p[1], s[2] * 0.45]), R * 0.05, 0xffffff, { nu: 3 }); k.setT(null); k.tube(0, -R * 0.5, 0, 0.0025, s[1] - R * 1.5, 0xf5f5f5, 6);
});
// Cornet de glace (gaufrette quadrillée, boules, coulure) ; chapeau de sorcière si non comestible
S('cone', (k, s, c, d) => {
  if (d.use === 'eat') { const R = s[0] / 2, ch = s[1] * 0.58; k.lathe([{ r: 0.002, y: -s[1] / 2 }, { r: R * 0.92, y: -s[1] / 2 + ch, p: 'a' }, { r: R * 0.98, y: -s[1] / 2 + ch + 0.006, p: 'a', h: 1 }], 12, { a: { c: 0xd8a055, rect: k.lod ? null : k.shared('waffle:cone', 32, 32, { kind: 'waffle', bg: 0xd8a055 }) } }); k.orb(0, -s[1] / 2 + ch + R * 0.75, 0, R * 0.98, R * 0.85, R * 0.98, c, 12, 8, { f: (u, v, p) => [p[0] * (1 + 0.08 * Math.sin(u * 30) * (1 - v)), p[1] - (v < 0.3 ? 0.004 * Math.max(0, Math.sin(u * 13)) : 0), p[2] * (1 + 0.08 * Math.sin(u * 30) * (1 - v))] }); k.orb(R * 0.15, s[1] / 2 - R * 0.62, 0, R * 0.62, R * 0.6, R * 0.62, d.id === 'cone_choco' ? 0x5d3a22 : shade(c, 1.1), 10, 6); return; }
  const R = s[0] / 2; k.lathe([{ r: R, y: -s[1] / 2 }, { r: R * 0.98, y: -s[1] / 2 + 0.006, p: 'a' }, { r: R * 0.36, y: -s[1] / 2 + 0.008, p: 'a', h: 1 }], 24, { a: { c } }, { bottom: shade(c, 0.8) }); k.tube(0, -s[1] / 2 + 0.02, 0, R * 0.36, 0.024, 0x6a1b9a, 20); const P = []; for (let i = 0; i <= 8; i++) { const t = i / 8; P.push([Math.pow(t, 3) * R * 0.25, -s[1] / 2 + 0.008 + t * (s[1] - 0.016), 0]); } k.sweep(P, (t) => R * 0.34 * (1 - t) + 0.002, c, { nu: 12, cap1: true });
});
// ═════════════════════ JOUETS, PELUCHES, BALLES, INSTRUMENTS ═════════════════════
// Membre de peluche : boudin effilé le long de points, bout arrondi
const limb = (k, P, r, c) => k.sweep(P, (t) => r * (1 - 0.18 * t), c, { nu: 5, cap0: true, cap1: true });
// Œil brillant (bille noire + reflet)
function eye(k, x, y, z, r, c = 0x111111) { k.orb(x, y, z, r, r * 1.1, r * 0.6, c, 5, 3); k.orb(x + r * 0.35, y + r * 0.4, z + r * 0.45, r * 0.28, r * 0.28, r * 0.2, 0xffffff, 3, 2); }
// Peluche assise (an : ours, lapin, chat, renard, chien, éléphant, licorne, lion, grenouille, panda, pingouin) :
// corps en poire, grosse tête, museau clair, oreilles doublées, bras et jambes en boudins, coussinets
function PLUSH(k, s, c, d, an) {
  const w = s[0], h = s[1], D = s[2], c2 = d.c2 ?? mixc(c, 0xffffff, 0.45), y0 = -h / 2, panda = an === 'panda', dark = 0x141414, lc = panda ? 0x1c1c1c : c;
  const bH = h * 0.47, bW = w * 0.6, bD = D * 0.8, hR = Math.min(w * 0.33, h * 0.25, D * 0.5), by = y0 + bH / 2, hy = y0 + bH * 0.88 + hR * 0.82, hz = D * 0.03;
  k.orb(0, by, -D * 0.04, bW / 2, bH / 2, bD / 2, c, 8, 5, { f: (u, v, p) => [p[0] * (1 + 0.16 * (0.5 - v)), p[1], p[2] * (1 + 0.12 * (0.5 - v))] });
  if (an === 'penguin' || an === 'bear' || an === 'dog' || an === 'fox' || panda) k.orb(0, by - bH * 0.04, bD * 0.12, bW * 0.34, bH * 0.36, bD * 0.36, an === 'penguin' || panda ? 0xf4f4f0 : c2, 6, 4);
  k.orb(0, hy, hz, hR, hR * 0.94, hR * 0.9, c, 8, 6);
  const fz = hz + hR * 0.86; // devant du visage
  if (an !== 'penguin' && an !== 'frog') { k.orb(0, hy - hR * 0.3, fz - hR * 0.12, hR * 0.42, hR * 0.3, hR * 0.3, an === 'elephant' ? c : c2, 6, 4); k.orb(0, hy - hR * 0.18, fz + hR * 0.15, hR * 0.12, hR * 0.08, hR * 0.07, dark, 4, 3); }
  for (const sx of [-1, 1]) { if (panda) k.orb(sx * hR * 0.36, hy + hR * 0.08, fz - hR * 0.12, hR * 0.2, hR * 0.24, hR * 0.12, dark, 7, 4); eye(k, sx * hR * 0.36, hy + hR * 0.1, fz - hR * 0.04, hR * 0.085, panda ? 0x2a2a2a : 0x111111); }
  // oreilles / signes distinctifs
  const ear = (sx, rx, ry, rz, yy, xx, inner, tilt = 0.25) => { k.setT(mm(TR(sx * xx, yy, hz - hR * 0.1), RZ(-sx * tilt))); k.orb(0, 0, 0, rx, ry, rz, panda ? dark : c, 5, 4); if (inner) k.orb(0, -ry * 0.05, rz * 0.55, rx * 0.62, ry * 0.7, rz * 0.5, inner, 4, 3); k.setT(null); };
  if (an === 'bunny') for (const sx of [-1, 1]) ear(sx, hR * 0.22, hR * 0.75, hR * 0.1, hy + hR * 1.4, hR * 0.32, c2, 0.12);
  else if (an === 'cat' || an === 'fox') for (const sx of [-1, 1]) { k.setT(mm(TR(sx * hR * 0.5, hy + hR * 0.72, hz), RZ(-sx * 0.35))).lathe([{ r: hR * 0.26, rz: hR * 0.12, y: 0 }, { r: 0.001, y: hR * 0.5, p: 'a' }], 6, { a: { c: an === 'fox' ? shade(c, 0.9) : c } }).setT(null); }
  else if (an === 'dog') for (const sx of [-1, 1]) limb(k, [[sx * hR * 0.8, hy + hR * 0.4, hz], [sx * hR * 1.02, hy - hR * 0.1, hz + hR * 0.1], [sx * hR * 0.98, hy - hR * 0.6, hz + hR * 0.2]], hR * 0.2, shade(c, 0.7));
  else if (an === 'elephant') { for (const sx of [-1, 1]) { k.setT(mm(TR(sx * hR * 0.95, hy, hz - hR * 0.2), RY(sx * 0.5))); k.orb(0, 0, 0, hR * 0.5, hR * 0.62, hR * 0.12, c, 8, 5); k.orb(0, 0, hR * 0.06, hR * 0.36, hR * 0.46, hR * 0.08, c2, 6, 4); k.setT(null); } limb(k, [[0, hy - hR * 0.2, fz], [0, hy - hR * 0.6, fz + hR * 0.25], [0, hy - hR * 0.9, fz + hR * 0.2]], hR * 0.18, c); }
  else if (an === 'frog') for (const sx of [-1, 1]) { k.orb(sx * hR * 0.45, hy + hR * 0.75, hz + hR * 0.3, hR * 0.32, hR * 0.32, hR * 0.32, c, 8, 5); eye(k, sx * hR * 0.45, hy + hR * 0.8, hz + hR * 0.58, hR * 0.13); }
  else if (an === 'penguin') { k.orb(0, hy - hR * 0.1, fz - hR * 0.2, hR * 0.55, hR * 0.6, hR * 0.3, 0xf4f4f0, 8, 5); k.setT(TR(0, hy - hR * 0.25, fz - hR * 0.05)).lathe([{ r: hR * 0.16, rz: hR * 0.1, y: 0 }, { r: 0.001, y: hR * 0.38, p: 'a' }], 5, { a: { c: d.c2 ?? 0xffa000 } }, {}).setT(null); }
  else { for (const sx of [-1, 1]) ear(sx, hR * 0.28, hR * 0.28, hR * 0.12, hy + hR * 0.78, hR * 0.66, panda ? null : c2); }
  if (an === 'unicorn') { k.setT(mm(TR(0, hy + hR * 0.85, hz + hR * 0.3), RX(0.35))).lathe([{ r: hR * 0.13, y: 0 }, { r: 0.001, y: hR * 0.7, p: 'a' }], 6, { a: { c: 0xffd54f, rect: k.lod ? null : ridgeTex(k, 6) } }).setT(null); for (let i = 0; i < 5; i++) k.orb(0, hy + hR * (0.8 - i * 0.35), hz - hR * (0.6 + i * 0.12), hR * 0.18, hR * 0.22, hR * 0.18, d.c3 ?? 0xab47bc, 6, 4); }
  if (an === 'lion') { const P = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 2; P.push([Math.cos(a) * hR * 0.98, hy + Math.sin(a) * hR * 0.98, hz - hR * 0.3]); } k.sweep(P, (t) => hR * 0.32 * (1 + 0.15 * Math.cos(t * Math.PI * 28)), d.c3 ?? 0x8d4a1d, { nu: 6 }); }
  // bras et jambes (assis, pieds en avant), coussinets
  for (const sx of [-1, 1]) {
    limb(k, [[sx * bW * 0.36, by + bH * 0.3, 0], [sx * bW * 0.55, by + bH * 0.02, bD * 0.12], [sx * bW * 0.46, by - bH * 0.22, bD * 0.28]], bW * 0.14, an === 'penguin' ? shade(c, 0.9) : lc);
    if (an !== 'penguin') { const lr = bW * 0.18, fx = sx * bW * 0.3; limb(k, [[sx * bW * 0.22, y0 + lr * 1.2, -bD * 0.05], [fx, y0 + lr, bD * 0.22], [fx, y0 + lr, bD * 0.38]], lr, lc); k.orb(fx, y0 + lr, bD * 0.38 + lr * 0.8, lr * 0.62, lr * 0.62, lr * 0.15, panda ? 0x3a3a3a : c2, 5, 3); }
    else k.orb(sx * bW * 0.22, y0 + bH * 0.05, bD * 0.25, bW * 0.16, bH * 0.05, bW * 0.22, d.c2 ?? 0xffa000, 6, 3);
  }
  if (d.c3 != null && an !== 'lion' && an !== 'unicorn') { k.orb(0, y0 + bH * 0.95, bD * 0.3, bW * 0.36, bH * 0.07, bD * 0.18, d.c3, 6, 3); for (const sx of [-1, 1]) k.orb(sx * bW * 0.12, y0 + bH * 0.95, bD * 0.46, bW * 0.1, bH * 0.07, bW * 0.04, d.c3, 4, 2); } // nœud
  if (an === 'cat' || an === 'fox' || an === 'dog' || an === 'lion') { const P = []; for (let i = 0; i <= 5; i++) { const t = i / 5; P.push([bW * 0.3 * Math.sin(t * 2.5), y0 + bH * (0.1 + t * 0.55), -bD * 0.5 - Math.sin(t * Math.PI) * D * 0.08]); } k.sweep(P, (t) => bW * (an === 'fox' ? 0.14 * Math.sin(Math.PI * Math.max(0.15, t)) + 0.04 : 0.07), c, { nu: 6, cap1: true, col: an === 'fox' ? (u, t) => (t > 0.8 ? 0xfafafa : c) : null }); }
}
// Poulet en caoutchouc (squeaky) : corps allongé, long cou, tête à crête et barbillons, bec
function CHICKEN(k, [w, h, D], c, d) { const y0 = -h / 2; k.orb(0, y0 + h * 0.18, -D * 0.05, w * 0.42, h * 0.17, D * 0.42, c, 10, 7); limb(k, [[0, y0 + h * 0.3, D * 0.18], [0, y0 + h * 0.55, D * 0.22], [0, y0 + h * 0.78, D * 0.12]], w * 0.12, c); k.orb(0, y0 + h * 0.83, D * 0.1, w * 0.17, h * 0.1, w * 0.17, c, 8, 6); for (let i = 0; i < 3; i++) k.orb(0, y0 + h * (0.93 + (i === 1 ? 0.03 : 0)), D * (0.04 + i * 0.07), w * 0.05, h * 0.05, w * 0.05, d.c2 ?? 0xd32f2f, 5, 3); k.setT(mm(TR(0, y0 + h * 0.82, D * 0.25), RX(Math.PI / 2))).lathe([{ r: w * 0.07, y: 0 }, { r: 0.001, y: w * 0.2, p: 'a' }], 5, { a: { c: 0xffa000 } }, {}).setT(null); k.orb(0, y0 + h * 0.76, D * 0.24, w * 0.04, h * 0.05, w * 0.03, d.c2 ?? 0xd32f2f, 5, 3); for (const sx of [-1, 1]) { eye(k, sx * w * 0.12, y0 + h * 0.86, D * 0.2, w * 0.035); k.orb(sx * w * 0.4, y0 + h * 0.22, -D * 0.05, w * 0.06, h * 0.08, D * 0.25, shade(c, 0.92), 6, 4); } for (const sx of [-1, 1]) k.orb(sx * w * 0.15, y0 + h * 0.02, D * 0.05, w * 0.1, h * 0.02, D * 0.14, 0xffa000, 6, 3); }
// Serpent lové : spirale effilée, tête aplatie, langue fourchue
function SNAKE(k, [w, h, D], c, d) { const P = [], n = 26; for (let i = 0; i <= n; i++) { const t = i / n, a = t * Math.PI * 4.2, r = w * (0.38 - 0.22 * t); P.push([Math.cos(a) * r, -h / 2 + w * 0.09 + t * h * 0.55, Math.sin(a) * r * (D / w)]); } k.sweep(P, (t) => w * (0.11 - 0.04 * t), c, { nu: 7, cap0: true, col: (u, t) => (Math.sin(t * 60) > 0.6 ? d.c2 ?? shade(c, 1.3) : c) }); const e = P[n]; k.orb(e[0] + w * 0.04, e[1] + w * 0.12, e[2] + w * 0.04, w * 0.11, w * 0.08, w * 0.15, c, 8, 5); for (const sx of [-1, 1]) eye(k, e[0] + w * 0.04 + sx * w * 0.06, e[1] + w * 0.17, e[2] + w * 0.13, w * 0.025); k.sweep([[e[0] + w * 0.04, e[1] + w * 0.1, e[2] + w * 0.19], [e[0] + w * 0.04, e[1] + w * 0.09, e[2] + w * 0.25]], 0.0012, 0xd32f2f, { nu: 3 }); }
// Dinosaure en peluche : corps, long cou, tête, queue, plaques dorsales
function DINO(k, [w, h, D], c) { const y0 = -h / 2; k.orb(-w * 0.05, y0 + h * 0.35, 0, w * 0.3, h * 0.28, D * 0.4, c, 11, 7); limb(k, [[w * 0.12, y0 + h * 0.5, 0], [w * 0.25, y0 + h * 0.72, 0], [w * 0.3, y0 + h * 0.82, 0]], h * 0.1, c); k.orb(w * 0.36, y0 + h * 0.84, 0, w * 0.13, h * 0.11, D * 0.25, c, 9, 6); for (const sz of [-1, 1]) eye(k, w * 0.42, y0 + h * 0.9, sz * D * 0.17, h * 0.025); const T = []; for (let i = 0; i <= 5; i++) { const t = i / 5; T.push([-w * 0.25 - t * w * 0.24, y0 + h * (0.35 - 0.2 * t), Math.sin(t * 2) * D * 0.1]); } k.sweep(T, (t) => h * 0.16 * (1 - 0.85 * t), c, { nu: 7, cap1: true }); for (let i = 0; i < 6; i++) { const t = i / 5, x = w * (0.2 - t * 0.6); k.setT(TR(x, y0 + h * (0.6 - 0.1 * Math.abs(t - 0.4)), 0)).lathe([{ r: h * 0.05, rz: h * 0.015, y: 0 }, { r: 0.001, y: h * 0.08, p: 'a' }], 4, { a: { c: shade(c, 1.3) } }, {}).setT(null); } for (const [x, z] of [[0.08, 1], [0.08, -1], [-0.2, 1], [-0.2, -1]]) limb(k, [[x * w, y0 + h * 0.25, z * D * 0.25], [x * w + 0.01, y0 + h * 0.08, z * D * 0.3]], h * 0.08, c); }
// Gant de boxe : poing rembourré, pouce, manchette, laçage
function GLOVE(k, [w, h, D], c) { k.orb(0, h * 0.08, D * 0.08, w * 0.48, h * 0.4, D * 0.4, c, 12, 8, { e: [0.85, 0.85], f: (u, v, p) => [p[0], p[1], p[2] + (p[1] > 0 ? p[1] * 0.25 : 0)] }); k.orb(w * 0.4, h * 0.0, D * 0.18, w * 0.13, h * 0.22, D * 0.2, c, 7, 5); k.lathe([{ r: w * 0.3, rz: D * 0.26, y: -h / 2 }, { r: w * 0.34, rz: D * 0.3, y: -h * 0.15, p: 'a' }], 10, { a: { c: 0xfafafa } }, { bottom: 0xeeeeee }); for (let i = 0; i < 4; i++) deco(k, 0, -h * 0.4 + i * h * 0.07, -D * 0.29, w * 0.18, 0.002, 0.004, 0xfafafa); }
S('plush', (k, s, c, d) => { if (d.id === 'boxing_gloves') return GLOVE(k, s, c); if (d.id === 'dino_plush') return DINO(k, s, c); PLUSH(k, s, c, d.id === 'bobby_plush' ? { ...d, c3: 0xd32f2f } : d, d.id === 'bunny_plush' ? 'bunny' : d.id === 'cat_plush' ? 'cat' : 'bear'); });
S('pplush', (k, s, c, d) => { if (d.id === 'squeaky_chicken') return CHICKEN(k, s, c, d); if (d.an === 'snake') return SNAKE(k, s, c, d); PLUSH(k, s, c, d, d.an || 'bear'); });
// Robot mécanique en fer-blanc : tronc, tête à antenne, yeux, cadrans, bras articulés, pieds, clé de remontage
S('robot', (k, s, c) => { const [w, h, D] = s, y0 = -h / 2; k.rbox(0, y0 + h * 0.48, 0, w * 0.7, h * 0.36, D * 0.66, c, 0.004); k.rbox(0, y0 + h * 0.79, 0, w * 0.5, h * 0.22, D * 0.56, shade(c, 1.08), 0.004); k.tube(0, y0 + h * 0.95, 0, 0.0016, h * 0.1, 0x9e9e9e, 5); k.orb(0, h / 2 - 0.004, 0, 0.004, 0.004, 0.004, 0xd32f2f, 5, 3); for (const sx of [-1, 1]) { k.tube(sx * w * 0.11, y0 + h * 0.82, D * 0.28, w * 0.07, 0.003, 0xffeb3b, 10, { m: RX(Math.PI / 2) }); k.box(sx * w * 0.42, y0 + h * 0.5, 0, w * 0.12, h * 0.26, D * 0.22, shade(c, 0.85)); k.box(sx * w * 0.42, y0 + h * 0.34, D * 0.06, w * 0.08, h * 0.06, D * 0.12, 0x777777); k.box(sx * w * 0.17, y0 + h * 0.18, 0, w * 0.2, h * 0.24, D * 0.4, shade(c, 0.8)); k.rbox(sx * w * 0.17, y0 + h * 0.03, D * 0.06, w * 0.28, h * 0.06, D * 0.6, 0x555555, 0.002); } k.box(0, y0 + h * 0.74, D * 0.29, w * 0.24, h * 0.025, 0.002, 0x333333); for (let i = 0; i < 3; i++) k.tube(-w * 0.15 + i * w * 0.15, y0 + h * 0.5, D * 0.33, w * 0.045, 0.003, [0xd32f2f, 0x43a047, 0x1e88e5][i], 8, { m: RX(Math.PI / 2) }); k.torus(0, y0 + h * 0.5, -D * 0.4, w * 0.12, 0xc0a040, 0, Math.PI / 2, 0, true); k.meta.eyes = true; });
// Petite voiture / locomotive : silhouette de profil extrudée, vitres, roues à jantes
S('toycar', (k, s, c, d) => {
  const [w, h, L] = s, y0 = -h / 2, wr = h * 0.24;
  const wheel = (x, z, r) => { k.tube(x, y0 + r, z, r, w * 0.16, 0x151515, 12, { m: RZ(Math.PI / 2), rect: k.lod ? null : ridgeTex(k, 24) }); k.tube(x + Math.sign(x) * w * 0.081, y0 + r, z, r * 0.55, 0.001, 0xc0c0c0, 10, { m: RZ(Math.PI / 2) }); };
  if (d.id === 'toy_train') { k.rbox(0, y0 + h * 0.3, 0, w * 0.86, h * 0.14, L, 0x222222, 0.002); k.tube(0, y0 + h * 0.55, L * 0.12, w * 0.36, L * 0.56, c, 14, { m: RX(Math.PI / 2) }); k.rbox(0, y0 + h * 0.62, -L * 0.32, w * 0.86, h * 0.62, L * 0.32, shade(c, 0.85), 0.003); k.box(0, h / 2 - h * 0.04, -L * 0.32, w * 0.96, h * 0.08, L * 0.38, 0x222222); k.tube(0, y0 + h * 0.86, L * 0.3, w * 0.1, h * 0.28, 0x222222, 8); for (const sx of [-1, 1]) { k.box(sx * w * 0.44, y0 + h * 0.7, -L * 0.32, 0.002, h * 0.22, L * 0.18, 0x9fd3ff); for (const z of [0.3, 0.05, -0.32]) wheel(sx * w * 0.42, z * L, wr * 1.05); } k.tube(0, y0 + h * 0.55, L * 0.42, w * 0.18, 0.004, 0xffeb3b, 10, { m: RX(Math.PI / 2) }); return; }
  const P = [[-L / 2, y0 + h * 0.18], [L / 2, y0 + h * 0.18], [L / 2, y0 + h * 0.48], [L * 0.38, y0 + h * 0.56], [L * 0.16, y0 + h * 0.6], [L * 0.02, y0 + h * 0.95], [-L * 0.3, y0 + h * 0.97], [-L * 0.42, y0 + h * 0.62], [-L / 2, y0 + h * 0.56]];
  k.setT(RY(-Math.PI / 2)).prism(P, w * 0.8, c, { bev: w * 0.06 }).setT(null);
  for (const sx of [-1, 1]) { k.quad([sx * w * 0.4 + sx * 0.0003, y0 + h * 0.62, sx > 0 ? L * 0.12 : -L * 0.27], [sx * w * 0.4 + sx * 0.0003, y0 + h * 0.62, sx > 0 ? -L * 0.27 : L * 0.12], [sx * w * 0.4 + sx * 0.0003, y0 + h * 0.88, sx > 0 ? -L * 0.27 : L * 0.02], [sx * w * 0.4 + sx * 0.0003, y0 + h * 0.88, sx > 0 ? L * 0.02 : -L * 0.27], 0x203040); for (const z of [-0.32, 0.32]) wheel(sx * w * 0.36, z * L, wr); }
  k.box(0, y0 + h * 0.4, L / 2 - 0.0005, w * 0.6, h * 0.08, 0.002, 0xdddddd); for (const sx of [-1, 1]) deco(k, sx * w * 0.28, y0 + h * 0.4, L / 2 + 0.0003, w * 0.12, h * 0.08, 0.001, 0xfff6c0);
});
// Poupée : robe en cloche, buste, tête et chevelure, bras, jambes, souliers ; figurines articulées
S('doll', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, creepy = d.p?.creepy || d.id === 'porcelain_doll', skin = creepy ? 0xf2ece4 : c, dress = creepy ? 0xe8e0d8 : d.c2 ?? 0xe91e63, hair = d.id === 'figurine' ? 0x00e5ff : creepy ? 0x2b1a12 : d.c3 ?? 0xfbc02d;
  if (d.id === 'figurine' || d.id === 'figurine_hero') { const cc = d.id === 'figurine_hero' ? c : 0x1565c0; k.rbox(0, y0 + h * 0.015, 0, w * 0.9, h * 0.03, D * 0.9, 0x222222, 0.002); for (const sx of [-1, 1]) { limb(k, [[sx * w * 0.12, y0 + h * 0.5, 0], [sx * w * 0.14, y0 + h * 0.25, 0.002], [sx * w * 0.14, y0 + h * 0.05, 0.004]], w * 0.09, cc); limb(k, [[sx * w * 0.24, y0 + h * 0.72, 0], [sx * w * 0.36, y0 + h * 0.56, D * 0.1], [sx * w * 0.38, y0 + h * 0.44, D * 0.12]], w * 0.065, cc); } k.orb(0, y0 + h * 0.64, 0, w * 0.26, h * 0.15, D * 0.24, cc, 9, 6); k.orb(0, y0 + h * 0.86, 0, w * 0.15, h * 0.08, w * 0.15, 0xf2c6a0, 9, 6); k.orb(0, y0 + h * 0.9, -0.002, w * 0.16, h * 0.06, w * 0.16, hair, 9, 5, { f: (u, v, p) => [p[0], Math.max(p[1], -h * 0.01), p[2]] }); if (d.id === 'figurine_hero') for (const [oz, fl, cc2] of [[0, true, 0xd32f2f], [0.0008, false, 0x8e1b1b]]) k.surf(4, 3, (u, v) => [(u - 0.5) * w * (0.4 + 0.4 * (1 - v)), y0 + h * (0.8 - 0.7 * (1 - v)), -D * 0.2 - (1 - v) * D * 0.15 + oz], cc2, { open: true, flip: fl }); return; }
  k.lathe([{ r: w * 0.48, rz: D * 0.48, y: y0 + h * 0.2 }, { r: w * 0.44, rz: D * 0.44, y: y0 + h * 0.24, p: 'a' }, { r: w * 0.16, rz: D * 0.16, y: y0 + h * 0.56, p: 'a' }], 12, { a: { c: dress } }, { bottom: shade(dress, 0.7) });
  k.orb(0, y0 + h * 0.6, 0, w * 0.17, h * 0.07, D * 0.2, dress, 8, 5);
  for (const sx of [-1, 1]) { limb(k, [[sx * w * 0.08, y0 + h * 0.22, 0], [sx * w * 0.09, y0 + h * 0.04, 0]], w * 0.055, skin); k.orb(sx * w * 0.09, y0 + h * 0.025, D * 0.06, w * 0.07, h * 0.025, D * 0.16, creepy ? 0x2a2a2a : 0xd32f2f, 6, 3); limb(k, [[sx * w * 0.16, y0 + h * 0.6, 0], [sx * w * 0.26, y0 + h * 0.45, D * 0.06], [sx * w * 0.28, y0 + h * 0.36, D * 0.1]], w * 0.045, skin); }
  k.orb(0, y0 + h * 0.79, 0, w * 0.2, h * 0.11, D * 0.36, skin, 10, 7);
  k.orb(0, y0 + h * 0.83, -D * 0.06, w * 0.23, h * 0.11, D * 0.4, hair, 10, 6, { f: (u, v, p) => [p[0], p[1], Math.min(p[2], D * 0.1 + p[1] * 0.4)] });
  for (const sx of [-1, 1]) { eye(k, sx * w * 0.07, y0 + h * 0.8, D * 0.32, w * 0.03, creepy ? 0x0a0a0a : 0x1565c0); k.orb(sx * w * 0.24, y0 + h * 0.74, -D * 0.02, w * 0.06, h * 0.11, w * 0.06, hair, 6, 4); }
  k.orb(0, y0 + h * 0.75, D * 0.33, w * 0.03, h * 0.008, 0.002, creepy ? 0x6a1010 : 0xd81b60, 5, 3);
});
// Diable en boîte : caisse décorée, manivelle, couvercle
S('jackbox', (k, s, c) => { const [w, h, D] = s; k.rbox(0, -h * 0.04, 0, w * 0.96, h * 0.92, D * 0.96, c, 0.004); k.rbox(0, h / 2 - h * 0.04, 0, w, h * 0.08, D, 0xffeb3b, 0.003); for (const [sx, col] of [[-1, 0x1e88e5], [1, 0x43a047]]) k.tube(0, -h * 0.04, sx * D * 0.48, w * 0.22, 0.002, col, 10, { m: RX(Math.PI / 2) }); k.tube(w / 2 - 0.004, 0, 0, 0.003, 0.012, 0xc0c0c0, 6, { m: RZ(Math.PI / 2) }); k.sweep([[w / 2, 0, 0], [w / 2, -h * 0.25, 0]], 0.002, 0xc0c0c0, { nu: 4 }); k.tube(w / 2, -h * 0.27, 0, 0.004, 0.012, 0xd32f2f, 8, { m: RZ(Math.PI / 2) }); });
// Ballons : panneaux nets (football : icosaèdre tronqué), coutures (tennis, basket), quartiers (plage)
const ICO = (() => { const t = (1 + Math.sqrt(5)) / 2, V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => { const l = Math.hypot(...v); return v.map((x) => x / l); }); const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]; return { V, F }; })();
function soccer(k, R, c1, c2) {
  const { V, F } = ICO, nrm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); }, lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const fan = (pts, col) => { const cen = nrm(pts.reduce((a, p) => a.map((x, i) => x + p[i]), [0, 0, 0])), o = k.b.vertexCount, cl = lin(col), wh = k.white; k.vtx(cen[0] * R, cen[1] * R, cen[2] * R, cen[0], cen[1], cen[2], wh.u0, wh.v0, cl); const ring = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; ring.push(nrm(a), nrm(lerp(a, b, 0.5))); } for (const p of ring) k.vtx(p[0] * R, p[1] * R, p[2] * R, p[0], p[1], p[2], wh.u0, wh.v0, cl); const n = ring.length; for (let i = 0; i < n; i++) { const a = o + 1 + i, b = o + 1 + (i + 1) % n, A = ring[i], B = ring[(i + 1) % n], cr = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]]; cr[0] * cen[0] + cr[1] * cen[1] + cr[2] * cen[2] > 0 ? k.b.idx.push(o, a, b) : k.b.idx.push(o, b, a); } };
  for (let vi = 0; vi < 12; vi++) { const nb = []; for (const f of F) if (f.includes(vi)) for (const j of f) if (j !== vi && !nb.includes(j)) nb.push(j); const P = nb.map((j) => lerp(V[vi], V[j], 1 / 3)), c0 = V[vi]; const ref = nrm(P[0].map((x, i) => x - c0[i])), bi = nrm([c0[1] * ref[2] - c0[2] * ref[1], c0[2] * ref[0] - c0[0] * ref[2], c0[0] * ref[1] - c0[1] * ref[0]]); P.sort((a, b) => { const da = a.map((x, i) => x - c0[i]), db = b.map((x, i) => x - c0[i]); return Math.atan2(da[0] * bi[0] + da[1] * bi[1] + da[2] * bi[2], da[0] * ref[0] + da[1] * ref[1] + da[2] * ref[2]) - Math.atan2(db[0] * bi[0] + db[1] * bi[1] + db[2] * bi[2], db[0] * ref[0] + db[1] * ref[1] + db[2] * ref[2]); }); fan(P, c2); }
  for (const [a, b, cc] of F) fan([lerp(V[a], V[b], 1 / 3), lerp(V[a], V[b], 2 / 3), lerp(V[b], V[cc], 1 / 3), lerp(V[b], V[cc], 2 / 3), lerp(V[cc], V[a], 1 / 3), lerp(V[cc], V[a], 2 / 3)], c1);
}
// Couture sur la sphère (courbe paramétrée normalisée au rayon R)
const seam = (k, R, f, c, r = 0.0012, n = 24) => { const P = []; for (let i = 0; i <= n; i++) { const p = f(i / n * Math.PI * 2), l = Math.hypot(...p); P.push(p.map((x) => x / l * R)); } k.sweep(P, r, c, { nu: 3 }); };
S('ball', (k, s, c, d) => {
  const R = s[0] / 2, id = d.id, lo = k.lod;
  if (id === 'football' && !lo) return soccer(k, R, c, 0x151515);
  if (id === 'beach_ball') { const cols = [0xe53935, c, 0x1e88e5, 0xfafafa, 0x43a047, 0xff9800]; for (let i = 0; i < 6; i++) k.surf(4, 10, (u, v) => { const a = 2 * Math.PI * ((i + u) / 6 - 0.5), t = Math.PI * v; return [R * Math.sin(t) * Math.sin(a), -R * Math.cos(t), R * Math.sin(t) * Math.cos(a)]; }, cols[i], { open: true }); for (const sy of [-1, 1]) k.tube(0, sy * R * 0.985, 0, R * 0.16, R * 0.03, 0xfafafa, 10); return; }
  k.orb(0, 0, 0, R, s[1] / 2, s[2] / 2, c, lo ? 8 : 16, lo ? 6 : 12, { col: id === 'volleyball' ? (u, v) => (Math.floor(u * 6 + (v > 0.5 ? 0.5 : 0)) % 3 === 0 ? 0x1565c0 : Math.floor(u * 6) % 3 === 1 ? 0xffd600 : c) : id === 'dog_ball' ? (u, v) => mixc(c, 0xffffff, hn(u * 20, v * 20) > 0.85 ? 0.4 : 0) : null });
  if (lo) return;
  if (id === 'basketball') { seam(k, R * 1.004, (t) => [Math.cos(t), Math.sin(t), 0], 0x111111); seam(k, R * 1.004, (t) => [0, Math.sin(t), Math.cos(t)], 0x111111); for (const sx of [-1, 1]) seam(k, R * 1.004, (t) => [sx * 0.55 + Math.cos(t) * 0.25, Math.sin(t) * 0.83, Math.cos(t) * 0.8], 0x111111); }
  if (id === 'tennis_ball' || id === 'dog_ball') seam(k, R * 1.01, (t) => [Math.cos(t) + 0.4 * Math.cos(3 * t), Math.sin(t) - 0.4 * Math.sin(3 * t), 1.1 * Math.sin(2 * t)], 0xf5f5f5, R * 0.05);
  if (id === 'handball') { seam(k, R * 1.004, (t) => [Math.cos(t), Math.sin(t), 0], 0xfafafa); seam(k, R * 1.004, (t) => [0, Math.sin(t), Math.cos(t)], 0xfafafa); }
  if (id === 'hamster_ball') { k.torus(0, 0, 0, R * 0.9, shade(c, 0.8), Math.PI / 2, 0, 0, true); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; for (const y of [0.45]) deco(k, Math.cos(a) * R * 0.89 * Math.sqrt(1 - y * y), y * R, Math.sin(a) * R * 0.89 * Math.sqrt(1 - y * y), 0.004, 0.012, 0.004, shade(c, 0.6)); } }
  if (id === 'ball' || id === 'prize_ball') seam(k, R * 1.004, (t) => [Math.cos(t), 0.25 * Math.sin(3 * t), Math.sin(t)], 0xffffff, R * 0.06);
});
// Boîte à musique : coffret, couvercle entrouvert (miroir), danseuse, manivelle
S('musicbox', (k, s, c) => { const [w, h, D] = s, y0 = -h / 2, bh = h * 0.5, lt = y0 + bh + h * 0.08; k.rbox(0, y0 + bh / 2, 0, w, bh, D, c, 0.003); k.rbox(0, y0 + bh + h * 0.04, 0, w * 1.0, h * 0.08, D * 1.0, shade(c, 1.1), 0.003); k.box(0, lt + 0.0004, 0, w * 0.8, 0.001, D * 0.76, 0x7a1d3a); k.box(0, y0 + bh * 0.5, D / 2 + 0.0002, w * 0.5, bh * 0.3, 0.0008, 0xd4af37); k.lathe([{ r: w * 0.12, y: lt }, { r: w * 0.12, y: lt + h * 0.03, p: 'a' }, { r: w * 0.05, y: lt + h * 0.05, p: 'a', h: 1 }], 10, { a: { c: 0xd4af37 } }, { top: 0xd4af37 }); const dy = lt + h * 0.05; k.orb(0, dy + h * 0.1, 0, w * 0.1, h * 0.035, w * 0.1, 0xf8bbd0, 10, 3); k.tube(0, dy + h * 0.05, 0, w * 0.012, h * 0.1, 0xf2d0b0, 5); k.tube(0, dy + h * 0.17, 0, w * 0.022, h * 0.11, 0xf8bbd0, 6); k.orb(0, h / 2 - w * 0.03, 0, w * 0.028, w * 0.03, w * 0.028, 0xf2d0b0, 6, 4); k.sweep([[-w * 0.07, dy + h * 0.27, 0], [0, h / 2 - w * 0.02, 0], [w * 0.07, dy + h * 0.27, 0]], 0.0012, 0xf2d0b0, { nu: 3 }); k.tube(w / 2 + 0.002, y0 + h * 0.3, 0, 0.002, 0.006, 0xd4af37, 6, { m: RZ(Math.PI / 2) }); k.box(w / 2 + 0.004, y0 + h * 0.24, 0, 0.003, h * 0.14, 0.004, 0xd4af37); });
// Toupie, métronome, anneaux à empiler
S('top', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2;
  if (d.id === 'metronome') { k.setT(RY(0)).prism([[-w / 2, y0], [w / 2, y0], [w * 0.16, h / 2], [-w * 0.16, h / 2]], D * 0.9, c, { bev: 0.002, cs: shade(c, 0.85) }).setT(null); k.box(0, y0 + h * 0.5, D * 0.45, w * 0.2, h * 0.6, 0.002, 0xf5e6c8); k.boxR(0, y0 + h * 0.55, D * 0.46 + 0.001, 0.003, h * 0.62, 0.002, 0xd4af37, 0, 0, 0.15); k.box(0.012, y0 + h * 0.7, D * 0.465, w * 0.12, h * 0.05, 0.004, 0xd4af37); return; }
  if (d.id === 'stacking_rings') { k.rbox(0, y0 + h * 0.06, 0, w, h * 0.12, D, 0x8d6e63, 0.006); k.tube(0, y0 + h * 0.55, 0, w * 0.06, h * 0.8, 0xd7ccc8, 8); const cols = [0xe53935, 0xff9800, 0xffeb3b, 0x43a047, 0x1e88e5]; for (let i = 0; i < 5; i++) { const rr = w * (0.36 - i * 0.05), tr = h * 0.06, yc = y0 + h * (0.18 + i * 0.13), P = []; for (let j = 0; j <= 8; j++) { const f = -Math.PI / 2 + j / 8 * Math.PI * 2; P.push({ r: rr + tr * Math.cos(f), y: yc + tr * Math.sin(f), p: 'a' }); } k.lathe(P, k.lod ? 6 : 12, { a: { c: cols[i] } }, {}); } k.orb(0, y0 + h * 0.93, 0, w * 0.12, w * 0.1, w * 0.12, 0xab47bc, 8, 5); return; }
  k.lathe([{ r: 0.001, y: y0 }, { r: w * 0.12, y: y0 + h * 0.12, p: 'a' }, { r: w * 0.5, y: y0 + h * 0.45, p: 'b' }, { r: w * 0.46, y: y0 + h * 0.56, p: 'a', h: 1 }, { r: w * 0.1, y: y0 + h * 0.62, p: 'a', h: 1 }, { r: w * 0.07, y: y0 + h * 0.66, p: 'a' }, { r: w * 0.06, y: h / 2, p: 's' }], 16, { a: { c }, b: { c: shade(c, 1.3) }, s: { c: 0x5d4037 } }, { top: 0x5d4037 });
});
S('yoyo', (k, s, c) => { const R = s[0] / 2, t = s[1]; for (const sy of [-1, 1]) k.lathe(sy > 0 ? [{ r: R * 0.15, y: t * 0.04 }, { r: R * 0.85, y: t * 0.1, p: 'a' }, { r: R, y: t * 0.3, p: 'a' }, { r: R * 0.96, y: t * 0.5, p: 'a', h: 1 }, { r: R * 0.55, y: t * 0.5, p: 'b', h: 1 }] : [{ r: R * 0.55, y: -t * 0.5 }, { r: R * 0.96, y: -t * 0.5, p: 'b', h: 1 }, { r: R, y: -t * 0.3, p: 'a', h: 1 }, { r: R * 0.85, y: -t * 0.1, p: 'a' }, { r: R * 0.15, y: -t * 0.04, p: 'a' }], 18, { a: { c }, b: { c: 0xfafafa } }, sy > 0 ? { top: 0xfafafa } : { bottom: 0xfafafa }); k.tube(0, 0, 0, R * 0.15, t * 0.1, 0xdddddd, 8); });
// Rubik's cube : corps noir arrondi, 54 pastilles de couleur
S('rubik', (k, s) => { const e = s[0], cols = { Z: 0xffffff, z: 0xffeb3b, X: 0xe53935, x: 0xff9800, Y: 0x1e88e5, y: 0x43a047 }; k.rbox(0, 0, 0, e, e, e, 0x111111, e * 0.06); const g = e / 3, st = g * 0.84, hz = e / 2 + 0.0003; for (const [f, n, U, V] of [['Z', [0, 0, 1], [1, 0, 0], [0, 1, 0]], ['z', [0, 0, -1], [-1, 0, 0], [0, 1, 0]], ['X', [1, 0, 0], [0, 0, -1], [0, 1, 0]], ['x', [-1, 0, 0], [0, 0, 1], [0, 1, 0]], ['Y', [0, 1, 0], [1, 0, 0], [0, 0, -1]], ['y', [0, -1, 0], [1, 0, 0], [0, 0, 1]]]) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c0 = [0, 1, 2].map((q) => n[q] * hz + U[q] * i * g + V[q] * j * g), P = (a, b) => [0, 1, 2].map((q) => c0[q] + U[q] * a * st / 2 + V[q] * b * st / 2); k.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), cols[f]); } });
// Xylophone (lames dégressives sur deux montants, baguettes) / piano jouet
S('xylo', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2;
  if (d.id === 'toy_piano') { k.rbox(0, y0 + h * 0.4, -D * 0.1, w, h * 0.8, D * 0.8, c ?? 0xd32f2f, 0.004); for (let i = 0; i < 12; i++) k.box(-w * 0.44 + i * w * 0.08, y0 + h * 0.62, D * 0.32, w * 0.075, h * 0.16, D * 0.3, 0xfafafa); for (const i of [0, 1, 3, 4, 5, 7, 8, 10]) k.box(-w * 0.4 + i * w * 0.08, y0 + h * 0.76, D * 0.24, w * 0.04, h * 0.14, D * 0.16, 0x111111); return; }
  const cols = [0xe53935, 0xff9800, 0xffeb3b, 0x43a047, 0x1e88e5, 0x3949ab, 0x8e24aa, 0xec407a];
  for (const sz of [-1, 1]) k.pbox(0, y0 + h * 0.2, sz * D * 0.3, w, h * 0.4, D * 0.12, 0x8d6e63);
  for (let i = 0; i < 8; i++) { const L = D * (0.95 - i * 0.055), x = -w / 2 + (i + 0.5) * w / 8; k.pbox(x, y0 + h * 0.52, 0, w / 9.5, h * 0.18, L, cols[i]); }
  for (const sx of [-1, 1]) { k.sweep([[sx * w * 0.2, y0 + h * 0.66, D * 0.45], [sx * w * 0.3, y0 + h * 0.66, -D * 0.1]], 0.0025, 0xe8d2a6, { nu: 5 }); k.orb(sx * w * 0.3, y0 + h * 0.72, -D * 0.12, h * 0.12, h * 0.12, h * 0.12, 0xd32f2f, 5, 4); }
});
// Tambour (cordes en zigzag, cerclages, peau) / bongos
S('drum', (k, s, c, d) => {
  const drum = (x, R, H, y0) => { k.lathe([{ r: R * 0.98, y: y0 }, { r: R, y: y0 + H * 0.08, p: 'r', h: 1 }, { r: R * 0.97, y: y0 + H * 0.1, p: 's', h: 1 }, { r: R * 0.97, y: y0 + H * 0.9, p: 's' }, { r: R, y: y0 + H * 0.92, p: 'r', h: 1 }, { r: R * 1.0, y: y0 + H, p: 'r' }, { r: R * 0.95, y: y0 + H, p: 'p', h: 1 }], 18, { r: { c: 0xffd600 }, s: { c }, p: { c: 0xf5efe0 } }, { bottom: 0xf5efe0, top: 0xf5efe0 }); const P = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2; P.push([x + Math.cos(a) * R * 0.985, y0 + (i % 2 ? H * 0.88 : H * 0.12), Math.sin(a) * R * 0.985]); } k.sweep(P, 0.0012, 0xfafafa, { nu: 3 }); };
  if (d.id === 'bongos') { const r1 = s[0] * 0.24, r2 = s[0] * 0.2; k.setT(TR(-s[0] / 2 + r1, 0, 0)); drum(0, r1, s[1], -s[1] / 2); k.setT(TR(s[0] / 2 - r2, 0, 0)); drum(0, r2, s[1] * 0.9, -s[1] / 2); k.setT(null); k.box(0, s[1] * 0.1, 0, s[0] * 0.2, s[1] * 0.12, s[1] * 0.1, 0x5d4037); return; }
  drum(0, s[0] / 2, s[1], -s[1] / 2);
});
// Pistolets jouets : profil extrudé, canon, réservoir (eau) ou fléchettes
S('gun', (k, s, c, d) => { const [w, h, L] = s, y0 = -h / 2, water = d.id === 'water_gun', P = [[-L * 0.42, y0 + h * 0.58], [L * 0.3, y0 + h * 0.58], [L * 0.32, y0 + h * 0.86], [-L * 0.46, y0 + h * 0.9], [-L * 0.5, y0 + h * 0.8], [-L * 0.48, y0 + h * 0.58]]; k.setT(RY(-Math.PI / 2)).prism(P, w * 0.62, c, { bev: w * 0.08 }).prism([[-L * 0.4, y0 + h * 0.6], [-L * 0.22, y0 + h * 0.6], [-L * 0.28, y0], [-L * 0.46, y0 + h * 0.04]], w * 0.56, shade(c, 0.8), { bev: w * 0.06 }).setT(null); k.tube(0, y0 + h * 0.74, L * 0.4, h * 0.09, L * 0.2, water ? 0xffeb3b : 0xff6f00, 10, { m: RX(Math.PI / 2) }); k.sweep([[0, y0 + h * 0.56, -L * 0.18], [0, y0 + h * 0.38, -L * 0.12], [0, y0 + h * 0.5, -L * 0.06]], 0.002, 0x222222, { nu: 4 }); if (water) k.orb(0, y0 + h * 0.92 - h * 0.08, -L * 0.05, w * 0.42, h * 0.12, L * 0.18, 0x29b6f6, 10, 6); if (d.id === 'bubble_gun') k.tube(0, y0 + h * 0.75, L * 0.48, h * 0.16, 0.003, 0xe040fb, 12, { m: RX(Math.PI / 2) }); });
// Trompette jouet / trompette : embouchure, tube, pistons, pavillon
S('horn', (k, s, c, d) => { const L = s[2], R = Math.min(s[0], s[1]) / 2; if (d.id === 'trumpet') { const P = []; for (let i = 0; i <= 14; i++) { const t = i / 14; P.push([0, -s[1] * 0.15 + (t > 0.5 ? Math.sin((t - 0.5) * Math.PI * 2) * s[1] * 0.25 : 0), -L / 2 + L * 0.7 * t]); } k.sweep(P, R * 0.08, c, { nu: 6 }); k.sweep([[0, -s[1] * 0.15, -L * 0.15], [0, s[1] * 0.12, -L * 0.15], [0, s[1] * 0.12, L * 0.2]], R * 0.08, c, { nu: 6 }); for (let i = 0; i < 3; i++) k.tube(0, s[1] * 0.02, -L * 0.05 + i * L * 0.06, R * 0.11, s[1] * 0.3, shade(c, 0.9), 8); k.setT(mm(TR(0, s[1] * 0.12, L * 0.2), RX(Math.PI / 2))).lathe([{ r: R * 0.08, y: 0 }, { r: R * 0.2, y: L * 0.18, p: 'a' }, { r: R * 0.96, y: L * 0.3, p: 'a' }, { r: R, y: L * 0.3, p: 'a', h: 1 }, { r: R * 0.92, y: L * 0.3 - 0.0015, p: 'i', h: 1 }, { r: R * 0.16, y: L * 0.18, p: 'i' }, { r: R * 0.05, y: L * 0.02, p: 'i' }], 16, { a: { c }, i: { c: shade(c, 0.7) } }).setT(null); k.tube(0, -s[1] * 0.15, -L / 2 + 0.01, R * 0.12, 0.02, shade(c, 1.1), 8, { m: RX(Math.PI / 2) }); return; } k.setT(RX(Math.PI / 2)).lathe([{ r: R * 0.3, y: -L / 2 }, { r: R * 0.28, y: -L * 0.4, p: 'm' }, { r: R * 0.2, y: -L * 0.35, p: 'a', h: 1 }, { r: R * 0.22, y: L * 0.15, p: 'a' }, { r: R * 0.5, y: L * 0.38, p: 'a' }, { r: R * 0.98, y: L / 2, p: 'a' }, { r: R * 0.9, y: L / 2, p: 'a', h: 1 }, { r: R * 0.86, y: L / 2 - 0.004, p: 'i' }, { r: R * 0.44, y: L * 0.37, p: 'i' }, { r: R * 0.16, y: L * 0.15, p: 'i' }], 14, { a: { c }, m: { c: 0x222222 }, i: { c: shade(c, 0.7) } }, { bottom: 0x222222 }).setT(null); });
// Dé : arêtes arrondies, points en creux
S('dice', (k, s, c) => { const e = s[0], h = e / 2 + 0.0002, pr = e * 0.085, wh = k.white; k.rbox(0, 0, 0, e, e, e, c, e * 0.12); const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }; for (const [nf, n, U, V] of [[1, [0, 0, 1], [1, 0, 0], [0, 1, 0]], [6, [0, 0, -1], [-1, 0, 0], [0, 1, 0]], [2, [1, 0, 0], [0, 0, -1], [0, 1, 0]], [5, [-1, 0, 0], [0, 0, 1], [0, 1, 0]], [3, [0, 1, 0], [1, 0, 0], [0, 0, -1]], [4, [0, -1, 0], [1, 0, 0], [0, 0, 1]]]) for (const [a, b] of (k.lod && n[2] < 1 && n[1] < 1 ? [] : PIPS[nf])) { const cx = [0, 1, 2].map((q) => n[q] * h + (U[q] * a + V[q] * b) * e * 0.26), o = k.b.vertexCount, cl = lin(nf === 1 ? 0xd32f2f : 0x111111); k.vtx(cx[0], cx[1], cx[2], n[0], n[1], n[2], wh.u0, wh.v0, cl); for (let i = 0; i < 7; i++) { const t = i / 7 * Math.PI * 2, p = [0, 1, 2].map((q) => cx[q] + (U[q] * Math.cos(t) + V[q] * Math.sin(t)) * pr); k.vtx(p[0], p[1], p[2], n[0], n[1], n[2], wh.u0, wh.v0, cl); } for (let i = 0; i < 7; i++) k.b.idx.push(o, o + 1 + i, o + 1 + (i + 1) % 7); } });
// Os à mâcher : fût tourné et quatre nœuds
S('bone', (k, s, c) => { const [w, h, L] = s, kr = Math.min(w * 0.27, h * 0.48), ky = Math.min(h / 2, kr), r = kr * 0.55, zk = L / 2 - kr, xk = w / 2 - kr, yc = -h / 2 + ky;
  ZL(k, [{ r: r * 1.5, y: -zk }, { r: r * 1.15, y: -zk + kr * 0.9, p: 'a' }, { r, y: -zk + kr * 1.7, p: 'a' }, { r, y: zk - kr * 1.7, p: 'a' }, { r: r * 1.15, y: zk - kr * 0.9, p: 'a' }, { r: r * 1.5, y: zk, p: 'a' }], k.lod ? 6 : 10, { a: { c } }, {}, 0, yc);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.orb(sx * xk, yc, sz * zk, kr, ky, kr, c, k.lod ? 6 : 10, k.lod ? 4 : 7); });
// Guitare, guitare électrique, basse, violon, ukulélé : caisse au contour en 8, rosace, chevalet, manche, tête,
// mécaniques, cordes
function bodyOutline(w, h, waist = 0.62, top = 0.78) { const P = []; for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, y = Math.sin(a), x = Math.cos(a); const r = y < 0 ? 1 : top + (1 - top) * (1 - y); const pinch = 1 - (1 - waist) * Math.exp(-Math.pow((y - 0.15) / 0.28, 2)); P.push([x * w * r * pinch, y * h]); } return P; }
S('guitar', (k, s, c, d) => {
  const [w, H, D] = s, y0 = -H / 2, id = d.id, elec = id === 'electric_guitar' || id === 'bass_guitar', violin = id === 'violin';
  const bh = H * (violin ? 0.58 : id === 'ukulele' ? 0.48 : elec ? 0.42 : 0.5), bt = elec ? D * 0.8 : D * 0.92;
  const out = elec ? (() => { const P = []; for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, x = Math.cos(a), y = Math.sin(a); P.push([x * w * 0.5 * (y > 0.3 ? 0.8 + 0.25 * Math.sin(a * 2) : 1), y * bh * 0.5 + (y > 0.5 && x > 0 ? bh * 0.12 : 0)]); } return P; })() : bodyOutline(w * 0.5, bh * 0.5, violin ? 0.55 : 0.66, 0.8);
  k.setT(TR(0, y0 + bh * 0.5, 0)).prism(out, bt, c, { bev: bt * 0.22, smooth: true, cs: violin ? shade(c, 0.8) : elec ? c : shade(c, 0.75), cb: shade(c, 0.85) }).setT(null);
  const fz = bt / 2 + 0.0003;
  if (!elec && !violin) { k.tube(0, y0 + bh * 0.62, fz - 0.001, w * 0.13, 0.0024, 0x151008, 14, { m: RX(Math.PI / 2) }); k.box(0, y0 + bh * 0.25, fz, w * 0.3, bh * 0.05, 0.004, 0x3e2723); }
  if (violin) { for (const sx of [-1, 1]) k.box(sx * w * 0.14, y0 + bh * 0.48, fz, 0.003, bh * 0.22, 0.001, 0x151008); k.box(0, y0 + bh * 0.36, fz + 0.006, w * 0.2, 0.012, 0.004, 0xe8d2a6); k.orb(w * 0.18, y0 + bh * 0.1, fz + 0.004, w * 0.14, bh * 0.07, 0.006, 0x222222, 7, 4); }
  if (elec) { for (let i = 0; i < (id === 'bass_guitar' ? 1 : 2); i++) k.box(0, y0 + bh * (0.36 + i * 0.16), fz, w * 0.26, bh * 0.07, 0.006, 0x1a1a1a); k.box(0, y0 + bh * 0.2, fz, w * 0.22, bh * 0.05, 0.006, 0xc0c0c0); for (let i = 0; i < 3; i++) k.tube(w * 0.22 + i * w * 0.05, y0 + bh * (0.15 + i * 0.06), fz + 0.004, w * 0.035, 0.008, 0xd4d4d4, 8, { m: RX(Math.PI / 2) }); }
  // manche, touche, tête, mécaniques, cordes
  const ny0 = y0 + bh * 0.9, ny1 = H / 2 - H * (violin ? 0.1 : 0.15), nw = w * (elec ? 0.14 : 0.13);
  k.box(0, (ny0 + ny1) / 2, D * 0.05, nw, ny1 - ny0, D * 0.3, elec ? 0xd8b080 : 0x6d4c41); k.box(0, (ny0 + ny1) / 2 + 0.01, D * 0.2 + 0.001, nw * 0.92, ny1 - ny0, 0.004, 0x2a1a10);
  if (!violin) for (let i = 1; i < 12; i++) deco(k, 0, ny1 - (ny1 - ny0) * Math.pow(i / 12, 0.8), D * 0.22 + 0.001, nw * 0.92, 0.0012, 0.0008, 0xd4d4d4);
  if (violin) { k.box(0, ny1 + H * 0.04, D * 0.05, nw * 0.9, H * 0.08, D * 0.3, 0x5d3a22); k.orb(0, H / 2 - H * 0.015, D * 0.05, nw * 0.5, H * 0.015, D * 0.18, 0x5d3a22, 8, 5); for (const sx of [-1, 1]) k.tube(sx * nw * 0.7, ny1 + H * 0.04, D * 0.05, 0.002, nw * 0.6, 0x111111, 6, { m: RZ(Math.PI / 2) }); }
  else { k.rbox(0, ny1 + (H / 2 - ny1) / 2, D * 0.02, nw * (elec ? 1.3 : 1.6), H / 2 - ny1, D * 0.24, elec ? 0xd8b080 : 0x3e2723, 0.003); for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { const y = ny1 + (H / 2 - ny1) * (0.25 + i * 0.25); k.tube(sx * nw * (elec ? 0.75 : 0.95), y, D * 0.02, 0.0025, nw * 0.4, 0xd4d4d4, 6, { m: RZ(Math.PI / 2) }); } }
  for (let i = 0; i < (id === 'bass_guitar' || violin || id === 'ukulele' ? 4 : 6); i++) { const n = id === 'bass_guitar' || violin || id === 'ukulele' ? 4 : 6, x = (i - (n - 1) / 2) * nw * 0.14; k.box(x, (y0 + bh * 0.25 + ny1) / 2, D * 0.2 + 0.004 + (elec ? 0 : 0.002), 0.0007, ny1 - (y0 + bh * 0.25), 0.0007, 0xe0e0e0); }
});
// Maracas / hochet : tête ovale peinte, poignée tournée
S('maracas', (k, s, c, d) => { const [w, h] = s, R = w / 2, rattle = d.id === 'baby_rattle'; k.orb(0, h / 2 - R * 1.1, 0, R, R * 1.1, R, c, 12, 8, { col: (u, v) => (Math.abs(v - 0.5) < 0.06 ? 0xffeb3b : Math.abs(v - 0.62) < 0.03 || Math.abs(v - 0.38) < 0.03 ? 0x43a047 : c) }); k.lathe([{ r: R * 0.28, y: -h / 2 }, { r: R * 0.32, y: -h / 2 + 0.005, p: 'a', h: 1 }, { r: R * 0.2, y: -h / 2 + 0.012, p: 'a' }, { r: R * 0.16, y: h / 2 - R * 2.1, p: 'a' }, { r: R * 0.3, y: h / 2 - R * 1.9, p: 'a' }], 10, { a: { c: rattle ? 0xffffff : 0x8d5524 } }, { bottom: rattle ? 0xffffff : 0x8d5524 }); });
// Triangle (barre pliée ouverte + baguette) / carillon à vent
S('triangle', (k, s, c, d) => {
  if (d.id === 'wind_chime') { const [w, h] = s; k.tube(0, h / 2 - 0.006, 0, w * 0.32, 0.01, 0x8d6e63, 14); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, L = h * (0.45 - i * 0.04); k.tube(Math.cos(a) * w * 0.25, h / 2 - 0.03 - L / 2 - h * 0.08, Math.sin(a) * w * 0.25, 0.004, L, c, 8); k.sweep([[Math.cos(a) * w * 0.25, h / 2 - 0.011, Math.sin(a) * w * 0.25], [Math.cos(a) * w * 0.25, h / 2 - 0.03 - h * 0.08, Math.sin(a) * w * 0.25]], 0.0005, 0xeeeeee, { nu: 3 }); } k.tube(0, -h * 0.3, 0, w * 0.1, 0.004, 0x8d6e63, 10); k.sweep([[0, h / 2, 0], [0, h / 2 + 0.0001, 0]], 0.001, 0xeeeeee, { nu: 3 }); return; }
  const [w, h] = s, r = 0.0035, A = [0, h * 0.42], B = [-w * 0.44, -h * 0.4], C = [w * 0.44, -h * 0.4], L = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, 0], P = [L(A, B, 0.1), L(A, B, 0.5), L(A, B, 0.92), L(B, C, 0.04), L(B, C, 0.5), L(B, C, 0.96), L(C, A, 0.08), L(C, A, 0.5), L(C, A, 0.9)];
  k.sweep(P, r, c, { nu: 6, cap0: true, cap1: true }); k.sweep([[w * 0.1, -h * 0.47, s[2] * 0.2], [w * 0.48, -h * 0.47, s[2] * 0.2]], 0.002, c, { nu: 5, cap0: true, cap1: true });
});
// Voiture radiocommandée (buggy) : châssis, carrosserie, roues crantées, aileron, antenne
S('rccar', (k, s, c) => { const [w, h, L] = s, y0 = -h / 2, wr = h * 0.32; k.rbox(0, y0 + h * 0.3, 0, w * 0.5, h * 0.12, L * 0.9, 0x222222, 0.003); k.orb(0, y0 + h * 0.45, -L * 0.02, w * 0.3, h * 0.22, L * 0.36, c, 12, 7, { e: [0.6, 0.8], f: (u, v, p) => [p[0], Math.max(p[1], -h * 0.08), p[2]] }); k.orb(0, y0 + h * 0.6, -L * 0.06, w * 0.16, h * 0.1, L * 0.14, 0x111111, 8, 5); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { k.tube(x * w * 0.38, y0 + wr, z * L * 0.33, wr, w * 0.22, 0x151515, 14, { m: RZ(Math.PI / 2), rect: k.lod ? null : ridgeTex(k, 18) }); k.tube(x * (w * 0.38 + w * 0.111), y0 + wr, z * L * 0.33, wr * 0.55, 0.001, 0xffd600, 10, { m: RZ(Math.PI / 2) }); } k.box(0, y0 + h * 0.75, -L * 0.42, w * 0.7, 0.004, L * 0.12, shade(c, 0.8)); for (const sx of [-1, 1]) k.box(sx * w * 0.2, y0 + h * 0.62, -L * 0.42, 0.003, h * 0.24, L * 0.06, 0x222222); k.tube(w * 0.15, h / 2 - h * 0.2, -L * 0.25, 0.001, h * 0.4, 0x111111, 4); });
// Radiocommande : boîtier, deux manches, antenne télescopique, interrupteurs
S('remote', (k, s, c) => { const [w, h, D] = s, y0 = -h / 2; k.rbox(0, y0 + h * 0.3, 0, w, h * 0.6, D, c, 0.006); k.box(0, y0 + h * 0.6 + 0.0005, D * 0.15, w * 0.3, 0.001, D * 0.2, 0x1b2a1d); for (const sx of [-1, 1]) { k.tube(sx * w * 0.28, y0 + h * 0.62, -D * 0.05, w * 0.08, 0.004, 0x333333, 10); k.tube(sx * w * 0.28, y0 + h * 0.75, -D * 0.05, 0.002, h * 0.26, 0x777777, 5); k.orb(sx * w * 0.28, y0 + h * 0.88, -D * 0.05, 0.005, 0.005, 0.005, 0x111111, 6, 4); } k.tube(w * 0.38, y0 + h * 0.62 + h * 0.19, -D * 0.38, 0.0015, h * 0.38, 0x999999, 5); deco(k, -w * 0.38, y0 + h * 0.6, D * 0.3, 0.006, 0.006, 0.012, 0xd32f2f); });
// ═════════════════════ VÊTEMENTS, CHAUSSURES, CHAPEAUX ═════════════════════
// Empreinte de semelle (talon arrondi, cambrure, avant-pied large, bout rond) : demi-largeur selon t (talon 0 → bout 1)
const footHW = (t) => Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.33) * (0.68 + 0.3 * Math.exp(-(((t - 0.7) / 0.2) ** 2)) - 0.1 * Math.exp(-(((t - 0.38) / 0.12) ** 2)));
// Chaussure (bout vers +z) dans la boîte x ∈ ±w/2, y ∈ [y0, y0 + H], z ∈ ±L/2 ; side : ±1 (pied droit / gauche)
// st : sneaker, derby, boot, heel (escarpin), sandal, ballet, slipper, espadrille
function SHOE(k, x0, y0, w, H, L, c, sole, st, side = 1, acc = null) {
  const n = k.lod ? 6 : 8, pts = [], toe = 0.05 * side * w; // contour (sens trigo vu de dessus)
  for (let i = 0; i <= n; i++) { const t = (1 - Math.cos(Math.PI * i / n)) / 2; pts.push([x0 + footHW(t) * w / 2 + toe * (t - 0.5), -L / 2 + L * t]); }
  for (let i = n - 1; i > 0; i--) { const t = (1 - Math.cos(Math.PI * i / n)) / 2; pts.push([x0 - footHW(t) * w / 2 + toe * (t - 0.5), -L / 2 + L * t]); }
  const pumps = st === 'heel', heelUp = pumps ? H * 0.55 : st === 'boot' ? H * 0.04 : 0, sh = pumps || st === 'ballet' || st === 'sandal' ? H * (st === 'ballet' ? 0.12 : 0.08) : st === 'boot' ? H * 0.08 : H * 0.17;
  const ys = (z) => (pumps ? heelUp * (1 - sstep(-L * 0.12, L * 0.22, z)) : heelUp), base = (z) => y0 + ys(z) + sh, at = (u) => pts[Math.round((1 - u) * pts.length) % pts.length];
  // semelle : contour extrudé (plat) ou bande cambrée et talon aiguille (escarpins)
  if (!pumps) k.setT(mm(TR(0, y0 + heelUp + sh / 2, 0), RX(-Math.PI / 2))).prism(pts.map(([x, z]) => [x, -z]), sh, sole, { bev: Math.min(sh * 0.35, 0.004), smooth: true, cs: st === 'espadrille' ? 0xc8a46e : sole }).setT(null);
  else {
    k.surf(pts.length, 1, (u, v) => { const p = at(u); return [p[0], y0 + ys(p[1]) + sh * v, p[1]]; }, sole);
    k.surf(pts.length, 1, (u, v) => { const p = at(u); return [x0 + (p[0] - x0) * (1 - v), base(p[1]), p[1] * (1 - v * 0.02)]; }, mixc(sole, c, 0.3));
    k.surf(pts.length, 1, (u, v) => { const p = at(u); return [x0 + (p[0] - x0) * (1 - v), y0 + ys(p[1]), p[1] * (1 - v * 0.02)]; }, shade(sole, 0.8), { flip: true });
    const hz = -L * 0.36; k.setT(TR(x0, 0, hz)).lathe([{ r: w * 0.1, rz: L * 0.055, y: y0 }, { r: w * 0.09, rz: L * 0.05, y: y0 + 0.004, p: 'a' }, { r: w * 0.14, rz: L * 0.06, y: y0 + ys(hz), p: 'a' }], 8, { a: { c: sole } }, { bottom: 0x111111 }).setT(null);
  }
  if (st === 'sandal') { for (const [t, r] of [[0.78, 0.5], [0.58, 0.55], [0.12, 0.45]]) { const z = -L / 2 + L * t, hw = footHW(t) * w / 2, P = []; for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI; P.push([x0 + Math.cos(a) * hw, base(z) + Math.sin(a) * H * r * 0.6, z]); } k.sweep(P, 0.0035, c, { nu: 4, rz: 0.4 }); } return; }
  // tige : dôme posé sur le contour (bas : bord de semelle, haut : arête du cou-de-pied)
  const prof = (t) => (st === 'ballet' ? 0.3 : pumps ? 0.42 : 0.42 + 0.58 * (1 - sstep(0.45, 0.88, t))) * (st === 'slipper' ? 0.85 : 1);
  const uH = (st === 'boot' ? H * 0.42 : H - sh - heelUp * 0.15) * (pumps ? 0.42 : 1);
  k.surf(pts.length, k.lod ? 3 : 4, (u, v) => { const p = at(u), t = (p[1] + L / 2) / L, s2 = 1 - Math.cos(v * Math.PI / 2); return [x0 + (p[0] - x0) * (1 - s2 * 0.97), base(p[1]) + uH * prof(t) * Math.sin(v * Math.PI / 2), p[1] + (p[1] > 0 ? -s2 * L * 0.03 : s2 * L * 0.02)]; }, c, { col: (u, v) => (acc && v < 0.35 ? acc : c) });
  // ouverture du col (ellipse sombre) ou tige de botte
  const oz = -L / 2 + L * (st === 'ballet' || pumps ? 0.42 : 0.26), orx = w * (st === 'ballet' || pumps ? 0.32 : 0.22), orz = L * (st === 'ballet' || pumps ? 0.3 : 0.17), oy = base(oz) + uH * prof((oz + L / 2) / L) + 0.0006;
  if (st !== 'boot') { const o = k.b.vertexCount, cl = lin(0x1a1410), wh = k.white; k.vtx(x0, oy - 0.002, oz, 0, 1, 0, wh.u0, wh.v0, cl); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.vtx(x0 + Math.cos(a) * orx, oy, oz + Math.sin(a) * orz, 0, 1, 0, wh.u0, wh.v0, cl); } for (let i = 0; i < 10; i++) k.b.idx.push(o, o + 1 + (i + 1) % 10, o + 1 + i); }
  else k.setT(TR(x0, 0, -L * 0.18)).lathe([{ r: w * 0.36, rz: L * 0.22, y: base(-L * 0.18) + uH * 0.6 }, { r: w * 0.33, rz: L * 0.2, y: y0 + H - 0.006, p: 'a' }, { r: w * 0.34, rz: L * 0.21, y: y0 + H, p: 'a', h: 1 }, { r: w * 0.3, rz: L * 0.18, y: y0 + H, p: 'i', h: 1 }], k.lod ? 6 : 12, { a: { c }, i: { c: 0x1a1410 } }, { top: 0x1a1410 }).setT(null);
  if (k.lod) return;
  // lacets (sneaker, derby) : barrettes croisées sur le cou-de-pied ; bande latérale ; nœud de ballerine
  if (st === 'sneaker' || st === 'derby') for (let i = 0; i < 4; i++) { const t = 0.5 + i * 0.075, z = -L / 2 + L * t, y = base(z) + uH * prof(t) + 0.0012, a = i % 2 ? 0.25 : -0.25, ca = Math.cos(a) * w * 0.15, sa = Math.sin(a) * w * 0.15, q = 0.0018; const qs = q * Math.sin(a), qc = q * Math.cos(a); k.quad([x0 - ca + qs, y, z + sa + qc], [x0 + ca + qs, y, z - sa + qc], [x0 + ca - qs, y, z - sa - qc], [x0 - ca - qs, y, z + sa - qc], st === 'derby' ? 0x2a1d14 : 0xf5f5f5); }
  if (st === 'sneaker') k.box(x0 + side * w * 0.45, base(0) + uH * 0.3, -L * 0.05, 0.002, uH * 0.12, L * 0.38, acc ?? shade(c, 0.8));
  if (st === 'ballet') k.orb(x0, base(L * 0.24) + uH * prof(0.74) + 0.002, -L / 2 + L * 0.74, w * 0.1, 0.003, w * 0.06, shade(c, 0.7), 5, 3);
}
S('ppair', (k, s, c, d) => { const w = s[0] / 2, st = d.st === 'heel' && /sandal/.test(d.id) ? 'sandal' : d.st === 'heel' && /ballerina/.test(d.id) ? 'ballet' : /espadrille/.test(d.id) ? 'espadrille' : d.st || 'sneaker', sole = d.c2 ?? (st === 'heel' || st === 'ballet' ? 0x212121 : st === 'espadrille' ? 0xd8c090 : 0xf5f5f5); for (const sx of [-1, 1]) SHOE(k, sx * w * 0.52, -s[1] / 2, w * 0.92, s[1], s[2], c, sole, st, sx, d.c3 ?? null); });
S('shoe', (k, s, c, d) => { const st = { sneakers: 'sneaker', heels: 'heel', boots: 'boot', slippers: 'slipper' }[d.id] || 'derby'; SHOE(k, 0, -s[1] / 2, s[0], s[1], s[2], c, st === 'sneaker' ? 0xffffff : st === 'slipper' ? shade(c, 0.85) : shade(c, 0.45), st, 1, st === 'sneaker' ? 0x1e88e5 : null); });
// Vêtement plié posé à plat : corps plié, col, patte boutonnée, poche (chemises, vestes, costumes, capes)
S('shirt', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, id = d.id, cape = id === 'cape' || id === 'costume_ghost';
  k.rbox(0, y0 + h * 0.42, 0, w, h * 0.84, D, c, Math.min(h * 0.38, 0.012));
  if (cape) { for (let i = 0; i < 3; i++) deco(k, 0, y0 + h * 0.84 + 0.0003, -D * 0.25 + i * D * 0.25, w * 0.9, 0.0008, 0.003, shade(c, 0.85)); return; }
  const P = []; for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.15 + 0.7 * i / 8); P.push([Math.cos(a) * w * 0.17, y0 + h * 0.88, D / 2 - D * 0.1 - Math.sin(a) * D * 0.12]); }
  k.sweep(P, (t) => h * 0.12, id === 'jacket_leather' || id === 'suit' ? shade(c, 0.8) : shade(c, 1.08), { nu: 5, rz: 0.4, cap0: true, cap1: true }); // col
  if (/shirt|suit|raincoat|police|firefighter/.test(id)) { k.box(0, y0 + h * 0.84 + 0.0005, -D * 0.05, w * 0.05, 0.001, D * 0.72, shade(c, 0.92)); for (let i = 0; i < 4; i++) k.tube(0, y0 + h * 0.84 + 0.0012, D * 0.22 - i * D * 0.17, 0.0035, 0.0014, id === 'suit' ? 0x111111 : 0xeeeeee, 6); }
  if (/hoodie|costume_bear|costume_cat/.test(id)) k.orb(0, y0 + h * 0.85, D * 0.25, w * 0.25, h * 0.15, D * 0.18, shade(c, 0.88), 8, 4);
  if (/police|firefighter|astronaut|clown/.test(id)) k.tube(w * 0.22, y0 + h * 0.84 + 0.001, -D * 0.05, w * 0.07, 0.0016, id === 'costume_police' ? 0xffd600 : id === 'costume_firefighter' ? 0xffeb3b : id === 'costume_clown' ? 0xffeb3b : 0x90a4ae, 10);
  if (id === 'shirt_hawaii') for (let i = 0; i < 8; i++) { const r = mulberry32(i + 3); deco(k, (r() - 0.5) * w * 0.8, y0 + h * 0.84 + 0.0003, (r() - 0.5) * D * 0.8, w * 0.07, 0.0008, w * 0.07, [0xffeb3b, 0xff5722, 0xe91e63][i % 3]); }
  if (id === 'shirt_white' || id === 'suit') k.box(w * 0.2, y0 + h * 0.84 + 0.0004, D * 0.1, w * 0.16, 0.001, D * 0.18, shade(c, 0.94)); // poche
});
// Pile de vêtements pliés : une couche arrondie par pièce (léger désalignement), plis visibles de face
S('pfold', (k, s, c, d) => {
  const n = Math.max(1, d.pn || Math.max(2, Math.round(s[1] / 0.04))), f = k.pk(d, 'folded', s[0], s[1], { n }), t = k.pk(d, 'fabric', s[0], s[2], { pat: d.pat || 'plain' }, d.id + ':top');
  const lh = s[1] / n, rnd = mulberry32(d.id.length * 23 + n), e = Math.min(0.006, s[0] * 0.02);
  for (let i = 0; i < n; i++) {
    const fr = { u0: f.u0, u1: f.u1, v0: f.v0 + (f.v1 - f.v0) * i / n, v1: f.v0 + (f.v1 - f.v0) * (i + 1) / n }, ox = (rnd() - 0.5) * e, oz = (rnd() - 0.5) * e;
    k.rbox(ox, -s[1] / 2 + lh * (i + 0.5), oz, s[0] - e, lh * 0.98, s[2] - e, shade(c, 0.85), Math.min(lh * 0.45, 0.02), { Z: fr, z: fr, ...(i === n - 1 ? { Y: t } : {}) });
  }
});
// Vêtement sur cintre (portants) : cintre en bois et crochet, silhouette découpée (épaules, manches, jambes)
function garmentPts(st, w, h) {
  if (st === 'pants') return [[-w * 0.36, h / 2], [w * 0.36, h / 2], [w * 0.4, -h / 2], [w * 0.06, -h / 2], [0, h * 0.18], [-w * 0.06, -h / 2], [-w * 0.4, -h / 2]];
  if (st === 'dress') return [[-w * 0.18, h / 2], [-w * 0.06, h * 0.46], [w * 0.06, h * 0.46], [w * 0.18, h / 2], [w * 0.24, h * 0.42], [w * 0.2, h * 0.18], [w * 0.48, -h / 2], [-w * 0.48, -h / 2], [-w * 0.2, h * 0.18], [-w * 0.24, h * 0.42]];
  const sl = st === 'tee' ? 0.3 : 0.62, sw = st === 'tee' ? 0.5 : 0.5;
  return [[-w * 0.1, h / 2], [w * 0.1, h / 2], [w * 0.3, h * 0.45], [w * sw, h * (0.45 - sl * 0.4)], [w * (sw - 0.07), h * (0.45 - sl * 0.45)], [w * 0.32, h * 0.12], [w * 0.33, -h / 2], [-w * 0.33, -h / 2], [-w * 0.32, h * 0.12], [-w * (sw - 0.07), h * (0.45 - sl * 0.45)], [-w * sw, h * (0.45 - sl * 0.4)], [-w * 0.3, h * 0.45]];
}
S('phang', (k, s, c, d) => {
  const w = s[0], h = s[1], t = Math.max(0.018, s[2] * 0.5), st = d.gs || 'shirt';
  const lab = k.pk(d, 'garment', w * 0.66, h * 0.86, { style: st }), gh = h - 0.07;
  k.setT(TR(0, -h / 2 + gh / 2, 0)).prism(garmentPts(st, w, gh), t, 0xffffff, { F: lab, B: lab, cs: shade(c, 0.85), bev: t * 0.3 }).setT(null);
  const hy = h / 2 - 0.05, P = []; for (let i = 0; i <= 8; i++) { const x = (i / 8 - 0.5) * w * 0.74; P.push([x, hy - 0.01 + Math.cos(x / (w * 0.37) * Math.PI / 2) * 0.012, 0]); }
  k.sweep(P, 0.0055, d.hc ?? 0x8d6e63, { nu: 5, rz: 0.55, cap0: true, cap1: true }); // cintre
  const Hk = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI * 1.25; Hk.push(i === 0 ? [0, hy + 0.004, 0] : [Math.cos(a) * 0.012 + 0.0, hy + 0.028 + Math.sin(a) * 0.012, 0]); }
  k.sweep([[0, hy, 0], [0, hy + 0.016, 0], ...Hk.slice(1)], 0.0013, 0xb0b0b0, { nu: 4 }); // crochet
});
// Chapeaux : casque de chantier, feutre, casquette, bonnet, béret, paille, bonnet de bain, casque vélo, tricorne,
// couronne, haut-de-forme, chapeau de cow-boy
S('hat', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, R = w / 2, Rz = D / 2, id = d.id;
  const brim = (r0, r1, rz1, y, curl = 0, th = 0.003, col = c) => { const P = (dy) => (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = r0 + (r1 - r0) * v, rz = r0 * (Rz / R) + (rz1 - r0 * (Rz / R)) * v, cu = curl * v * v * (1 - 0.6 * Math.abs(Math.cos(a))); return [r * Math.sin(a), y + cu + dy, rz * Math.cos(a)]; }; k.surf(k.lod ? 10 : 20, 2, P(0), col, { flip: true }); k.surf(k.lod ? 10 : 20, 2, P(-th), shade(col, 0.8)); k.surf(k.lod ? 10 : 20, 1, (u, sv) => P(-th * sv)(u, 1), shade(col, 0.7), { flip: true }); };
  const dome = (rx, ry, rz, yb, col, nu = 14, nv = 7, f) => k.orb(0, yb, 0, rx, ry, rz, col, nu, nv, { f: (u, v, p) => { let q = [p[0], Math.max(p[1], 0), p[2]]; if (f) q = f(u, v, q); return q; } });
  if (id === 'helmet' || id === 'bike_helmet') { if (id === 'helmet') { dome(R * 0.78, h * 0.9, Rz * 0.72, y0 + h * 0.08, c, 16, 8); k.setT(TR(0, y0 + h * 0.08, 0)).lathe([{ r: R * 0.98, rz: Rz * 0.98, y: 0 }, { r: R * 0.8, rz: Rz * 0.76, y: h * 0.03, p: 'a' }], 18, { a: { c } }, { bottom: shade(c, 0.7) }).setT(null); k.orb(0, y0 + h * 0.6, 0, R * 0.12, h * 0.42, Rz * 0.7, shade(c, 1.05), 8, 6, { f: (u, v, p) => [p[0], Math.max(p[1], -h * 0.3), p[2]] }); return; } k.orb(0, y0 + h * 0.05, 0, R * 0.95, h * 0.95, Rz * 0.98, c, 18, 8, { f: (u, v, p) => [p[0], Math.max(p[1], 0), p[2] - (p[2] < 0 ? Math.max(p[1], 0) * 0.25 : 0)], col: (u, v) => (v > 0.62 && Math.abs(((u * 9) % 1) - 0.5) < 0.16 && Math.abs(u - 0.5) > 0.04 ? 0x161616 : c) }); k.box(0, y0 + h * 0.08, 0, R * 1.6, 0.003, Rz * 1.8, 0x111111); return; }
  if (id === 'cap') { dome(R * 0.92, h * 0.95, R * 0.92, y0 + h * 0.05, c, 16, 7); k.orb(0, y0 + h * 0.99, 0, R * 0.08, h * 0.04, R * 0.08, c, 6, 3); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; deco(k, Math.sin(a) * R * 0.5, y0 + h * 0.72, Math.cos(a) * R * 0.5, 0.0015, 0.0015, 0.0015, shade(c, 0.6)); } k.surf(8, 3, (u, v) => { const x = (0.5 - u) * R * 1.6, z = R * 0.82 + v * (Rz * 2 - R * 1.82) * (1 - (2 * u - 1) ** 2 * 0.35); return [x, y0 + h * 0.06 - (x / R) ** 2 * h * 0.08, z]; }, shade(c, 0.95), { open: true }); k.surf(8, 3, (u, v) => { const x = (u - 0.5) * R * 1.6, z = R * 0.82 + v * (Rz * 2 - R * 1.82) * (1 - (2 * u - 1) ** 2 * 0.35); return [x, y0 + h * 0.06 - (x / R) ** 2 * h * 0.08 - 0.002, z]; }, shade(c, 0.75), { open: true }); return; }
  if (id === 'beanie' || id === 'swim_cap') { dome(R * 0.95, h * (id === 'beanie' ? 0.85 : 0.95), Rz * 0.95, y0, c, 16, 8, id === 'beanie' ? (u, v, p) => [p[0] * (1 + 0.02 * Math.cos(u * 6.28 * 18)), p[1], p[2] * (1 + 0.02 * Math.cos(u * 6.28 * 18))] : null); if (id === 'beanie') { k.lathe([{ r: R * 0.98, rz: Rz * 0.98, y: y0 }, { r: R, rz: Rz, y: y0 + h * 0.28, p: 'a' }, { r: R * 0.94, rz: Rz * 0.94, y: y0 + h * 0.3, p: 'a' }], 16, { a: { c: shade(c, 0.9), rect: k.lod ? null : ridgeTex(k, 40) } }).setT(null); k.orb(0, y0 + h * 0.88, 0, R * 0.22, h * 0.14, R * 0.22, 0xfafafa, 8, 6, { f: (u, v, p) => [p[0] * (1 + 0.15 * hn(u * 9, v * 7)), p[1], p[2] * (1 + 0.15 * hn(v * 9, u * 7))] }); } return; }
  if (id === 'beret') { k.orb(0, y0 + h * 0.5, 0, R, h * 0.5, Rz, c, 18, 7, { f: (u, v, p) => [p[0] * (v < 0.35 ? 0.8 + v * 0.55 : 1), p[1] * (v > 0.5 ? 0.7 : 1), p[2] * (v < 0.35 ? 0.8 + v * 0.55 : 1)] }); k.tube(0, y0 + h * 0.88, 0, 0.003, h * 0.22, c, 5); return; }
  if (id === 'crown_gold') { k.lathe([{ r: R * 0.92, y: y0 }, { r: R * 0.95, y: y0 + h * 0.4, p: 'a', h: 1 }, { r: R * 0.95 - 0.003, y: y0 + h * 0.4, p: 'a', h: 1 }, { r: R * 0.92 - 0.003, y: y0, p: 'i', h: 1 }, { r: R * 0.92, y: y0, p: 'a' }], 16, { a: { c }, i: { c: shade(c, 0.75) } }); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.setT(mm(TR(Math.sin(a) * R * 0.93, y0 + h * 0.4, Math.cos(a) * R * 0.93), RY(a))).lathe([{ r: R * 0.17, rz: 0.002, y: 0 }, { r: 0.001, rz: 0.001, y: h * 0.5, p: 'a' }], 4, { a: { c } }).setT(null); k.orb(Math.sin(a) * R * 0.95, y0 + h * 0.2, Math.cos(a) * R * 0.95, R * 0.07, h * 0.08, R * 0.05, [0xd32f2f, 0x1e88e5, 0x43a047][i % 3], 6, 4); } return; }
  // chapeaux à bord : calotte (pincée / creusée / haute), ruban, bord (recourbé pour le cow-boy)
  const cowboy = id === 'cowboy_hat', top = id === 'top_hat', pirate = id === 'hat_pirate', straw = id === 'hat_straw', ch = top ? h * 0.92 : h * (cowboy ? 0.85 : 0.8), cr = R * (top ? 0.55 : 0.52);
  if (pirate) { for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; k.setT(mm(TR(0, y0, 0), RY(a))).surf(6, 2, (u, v) => { const x = (u - 0.5) * R * 1.6, z = R * 0.25 + v * R * 0.25; return [x, h * (0.15 + v * 0.75) - Math.abs(x / R) * h * 0.2, z + Math.abs(x / R) * R * 0.1]; }, c, { open: true }).surf(6, 2, (u, v) => { const x = (0.5 - u) * R * 1.6, z = R * 0.25 + v * R * 0.25 - 0.002; return [x, h * (0.15 + v * 0.75) - Math.abs(x / R) * h * 0.2, z + Math.abs(x / R) * R * 0.1]; }, shade(c, 0.8), { open: true }).setT(null); } dome(R * 0.5, h * 0.75, R * 0.5, y0 + h * 0.1, c, 12, 6); k.orb(0, y0 + h * 0.55, R * 0.56, R * 0.12, h * 0.15, 0.003, 0xfafafa, 6, 4); return; }
  k.lathe([{ r: cr, rz: cr * Rz / R, y: y0 + h * 0.05 }, { r: cr * (top ? 1 : 0.98), rz: cr * Rz / R, y: y0 + ch * 0.85, p: 'a' }, { r: cr * (top ? 1.03 : 0.85), rz: cr * Rz / R * (top ? 1.03 : 0.85), y: y0 + ch, p: 'a', h: 1 }], 18, { a: { c, rect: straw && !k.lod ? ridgeTex(k, 48) : null } }, { top: cowboy || id === 'hat_fedora' ? shade(c, 0.85) : c });
  k.lathe([{ r: cr * (top ? 1.03 : 0.85) * 0.95, rz: cr * Rz / R * (top ? 1.03 : 0.85) * 0.95, y: y0 + ch - 0.003 }, { r: cr * (top ? 1 : 0.98) * 0.96, rz: cr * Rz / R * 0.96, y: y0 + ch * 0.85, p: 'l' }, { r: cr * 0.96, rz: cr * Rz / R * 0.96, y: y0 + h * 0.05, p: 'l' }], k.lod ? 8 : 18, { l: { c: shade(c, 0.45) } }, { bottom: shade(c, 0.4) }); // doublure
  if (cowboy || id === 'hat_fedora') k.orb(0, y0 + ch - 0.004, 0, cr * 0.18, h * 0.06, cr * 0.7, shade(c, 0.7), 6, 3);
  k.lathe([{ r: cr * 1.005, rz: cr * 1.005 * Rz / R, y: y0 + h * 0.06 }, { r: cr * 1.005, rz: cr * 1.005 * Rz / R, y: y0 + h * (top ? 0.22 : 0.24), p: 'b' }], 18, { b: { c: d.c2 ?? (straw ? 0x3e2723 : shade(c, 0.35)) } });
  brim(cr * 0.98, R, Rz, y0 + h * 0.055, cowboy ? h * 0.35 : id === 'hat_fedora' ? h * 0.08 : top ? h * 0.05 : 0, 0.0035, c);
});
// ═════════════════════ ACCESSOIRES : MASQUES, CORDES, BIJOUX, MONTRES, LUNETTES, PARFUMS ═════════════════════
// Ouverture sombre (ellipse) collée devant une surface : yeux de masque, bouche, orbite
function hole(k, x, y, z, rx, ry, c = 0x0c0c0c, n = 9, nz = 1) { const o = k.b.vertexCount, cl = lin(c), wh = k.white; k.vtx(x, y, z, 0, 0, nz, wh.u0, wh.v0, cl); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; k.vtx(x + Math.cos(a) * rx, y + Math.sin(a) * ry, z, 0, 0, nz, wh.u0, wh.v0, cl); } for (let i = 0; i < n; i++) nz > 0 ? k.b.idx.push(o, o + 1 + i, o + 1 + (i + 1) % n) : k.b.idx.push(o, o + 1 + (i + 1) % n, o + 1 + i); }
// Masques de carnaval / d'Halloween : coque ovale bombée (relief du visage), envers sombre, trous des yeux, attributs
S('mask', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id, venice = id === 'mask_venice';
  if (id === 'dust_mask') { k.orb(0, 0, D * 0.05 - D / 2, w / 2, h / 2, D * 0.9, c, 12, 8, { f: (u, v, p) => [p[0], p[1], Math.max(p[2], 0)] }); k.orb(0, -h * 0.05, D * 0.4, w * 0.16, w * 0.16, D * 0.1, 0x9e9e9e, 8, 4); for (const sx of [-1, 1]) k.sweep([[sx * w * 0.48, 0, -D * 0.4], [sx * w * 0.5, h * 0.3, -D * 0.5]], 0.0015, 0xfafafa, { nu: 3 }); return; }
  const zf = (u, v) => { const x = 2 * u - 1, y = 2 * v - 1, nose = venice ? 0 : 0.22 * Math.exp(-(x * x) / 0.02 - ((y - 0.05) ** 2) / 0.12), brow = 0.06 * Math.exp(-((y - 0.32) ** 2) / 0.01) * (1 - x * x); return D * (0.62 * (1 - 0.75 * x * x) * (1 - 0.35 * y * y) + nose + brow) - D / 2; };
  const xs = (u, v) => (u - 0.5) * w * Math.pow(Math.max(0, 1 - Math.pow(2 * v - 1, 2) * (venice ? 0.4 : 0.8)), 0.5);
  k.surf(10, 8, (u, v) => [xs(u, v), (v - 0.5) * h, zf(u, v)], c, { open: true, col: id === 'mask_zombie' ? (u, v) => mixc(c, 0x3b4a2a, hn(u * 9, v * 9) > 0.8 ? 0.6 : 0) : null });
  k.surf(10, 8, (u, v) => [xs(1 - u, v), (v - 0.5) * h, zf(1 - u, v) - 0.003], shade(c, 0.55), { open: true });
  { const B = []; for (let i = 0; i < 10; i++) B.push([i / 10, 0]); for (let i = 0; i < 8; i++) B.push([1, i / 8]); for (let i = 0; i < 10; i++) B.push([1 - i / 10, 1]); for (let i = 0; i < 8; i++) B.push([0, 1 - i / 8]); // chant
    k.surf(B.length, 1, (t, sv) => { const [u, v] = B[Math.round(t * B.length) % B.length]; return [xs(u, v), (v - 0.5) * h, zf(u, v) - sv * 0.003]; }, shade(c, 0.7), { flip: true }); }
  const ez = zf(0.3, 0.62) + 0.0012, er = venice ? [w * 0.12, h * 0.22] : id === 'mask_skull' ? [w * 0.11, h * 0.1] : [w * 0.07, h * 0.045];
  for (const sx of [-1, 1]) hole(k, sx * w * 0.2, venice ? 0 : h * 0.12, ez + (venice ? 0.004 : 0), er[0], er[1]);
  const fz = (y) => zf(0.5, y / h + 0.5) + 0.002;
  if (id === 'mask_clown') { k.orb(0, h * 0.0, Math.min(fz(0) + w * 0.06, D / 2 - w * 0.1), w * 0.1, w * 0.1, w * 0.1, 0xff1744, 8, 6); hole(k, 0, -h * 0.25, fz(-h * 0.25), w * 0.2, h * 0.05, 0xd50000); for (const sx of [-1, 1]) { k.orb(sx * w * 0.38, h * 0.18, -D * 0.1, w * 0.11, h * 0.15, D * 0.28, 0xff5722, 7, 5); hole(k, sx * w * 0.2, h * 0.24, ez + 0.001, w * 0.09, h * 0.02, 0x1565c0); } }
  if (id === 'mask_pig') { k.tube(0, -h * 0.05, fz(-h * 0.05) + D * 0.08, w * 0.15, D * 0.18, shade(c, 1.05), 12, { m: RX(Math.PI / 2), tc: shade(c, 0.9) }); for (const sx of [-1, 1]) { hole(k, sx * w * 0.05, -h * 0.05, fz(-h * 0.05) + D * 0.17 + 0.0005, w * 0.025, h * 0.035, 0x4a1a2a, 7); k.setT(mm(TR(sx * w * 0.3, h * 0.3, 0), RZ(-sx * 0.4))).lathe([{ r: w * 0.1, rz: D * 0.12, y: 0 }, { r: 0.002, y: h * 0.17, p: 'a' }], 6, { a: { c } }).setT(null); } }
  if (id === 'mask_skull') { hole(k, 0, -h * 0.05, fz(-h * 0.05) + 0.001, w * 0.04, h * 0.06, 0x0c0c0c, 3); for (let i = -3; i <= 3; i++) k.box(i * w * 0.045, -h * 0.3, fz(-h * 0.3), w * 0.038, h * 0.07, 0.003, 0xf5f0e0); deco(k, 0, -h * 0.3, fz(-h * 0.3) - 0.0012, w * 0.34, 0.003, 0.002, 0x222222); }
  if (id === 'mask_witch') { const P = [], z0 = fz(0) - D * 0.12, z1 = D / 2 - w * 0.012; for (let i = 0; i <= 5; i++) { const t = i / 5; P.push([0, h * 0.05 - t * h * 0.2, z0 + t * (z1 - z0)]); } k.sweep(P, (t) => w * 0.07 * (1 - t * 0.85), c, { nu: 6, cap1: true }); k.orb(w * 0.032, -h * 0.07, z0 + 0.6 * (z1 - z0), w * 0.015, w * 0.015, w * 0.015, 0x5d4037, 4, 3); hole(k, 0, -h * 0.3, fz(-h * 0.3), w * 0.12, h * 0.02, 0x3a1a1a); }
  if (id === 'mask_vampire') { hole(k, 0, -h * 0.28, fz(-h * 0.28), w * 0.12, h * 0.02, 0x6a0000); for (const sx of [-1, 1]) k.setT(TR(sx * w * 0.06, -h * 0.29, fz(-h * 0.29) + 0.001)).lathe([{ r: 0.0004, y: -h * 0.07 }, { r: 0.003, y: 0, p: 'a' }], 5, { a: { c: 0xfafafa } }, { top: 0xfafafa }).setT(null); k.orb(0, h * 0.38, -D * 0.05, w * 0.4, h * 0.12, D * 0.35, 0x111111, 10, 4, { f: (u, v, p) => [p[0], p[1] - Math.abs(p[0]) * 0.4, p[2]] }); }
  if (id === 'mask_zombie') { hole(k, 0, -h * 0.28, fz(-h * 0.28), w * 0.13, h * 0.05, 0x2a1a10); for (let i = 0; i < 3; i++) deco(k, -w * 0.15 + i * w * 0.03, h * 0.3 - i * h * 0.04, fz(h * 0.3), 0.003, h * 0.12, 0.002, 0x3a2a1a); }
  if (venice) { for (let i = 0; i < 7; i++) { const a = Math.PI * (0.15 + 0.7 * i / 6); k.orb(Math.cos(a) * w * 0.36, Math.sin(a) * h * 0.36, D * 0.1, w * 0.032, w * 0.032, w * 0.032, i % 2 ? 0xd32f2f : 0xfafafa, 5, 3); } k.tube(w * 0.38, -h * 0.25, 0, 0.002, h * 0.42, 0xd4af37, 5, { m: RZ(-0.5) }); }
});
// Bobines : corde, tuyau, rallonge, laisse, corde à sauter, guirlande ; chaîne ; écharpe ; ceinture enroulée
function coil(k, R, r, y0, turns, c, o = {}) { const P = [], n = Math.round(turns * (k.lod ? 6 : 12)); for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * Math.PI * 2, rr = R * (1 + 0.04 * Math.sin(a * 2.3)); P.push([Math.cos(a) * rr, y0 + r + (o.h ?? r * 1.6) * t + r * 0.25 * Math.sin(a * 0.7), Math.sin(a) * rr]); } k.sweep(P, r, c, { nu: o.nu || 6, cap0: true, cap1: true, col: o.col }); return P; }
S('rope', (k, s, c, d) => {
  const [w, h, D] = s, R = Math.min(w, D) * 0.33, y0 = -h / 2, id = d.id;
  if (id === 'scarf') { for (let i = 0; i < 3; i++) k.rbox(0, y0 + h * (0.17 + i * 0.32), (i - 1) * D * 0.03, w * (0.9 - i * 0.05), h * 0.3, D * 0.94, i % 2 ? shade(c, 0.9) : c, h * 0.13); for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) k.box(sx * (w * 0.45 + 0.004), y0 + h * 0.1, -D * 0.36 + i * D * 0.18, 0.008, 0.002, 0.003, c); return; }
  if (id === 'chain') { const n = k.lod ? 8 : 12, lr = Math.min(h, w) * 0.2; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = R * (0.85 + 0.15 * (i % 3) / 2), y = y0 + lr * 0.5 + 0.004 + (i % 2) * h * 0.2, P = []; for (let j = 0; j <= 10; j++) { const b = j / 10 * Math.PI * 2; P.push([Math.cos(b) * lr * 1.5, Math.sin(b) * lr, 0]); } k.setT(mm(TR(Math.cos(a) * rr, y, Math.sin(a) * rr), RY(-a + Math.PI / 2), RX(i % 2 ? Math.PI / 2 : 0))).sweep(P, lr * 0.28, c, { nu: 4 }).setT(null); } return; }
  if (id === 'belt_leather') { const P = []; for (let i = 0; i <= 30; i++) { const t = i / 30, a = t * Math.PI * 5, rr = R * (0.35 + 0.65 * t); P.push([Math.cos(a) * rr, y0 + h * 0.5, Math.sin(a) * rr]); } k.sweep(P, h * 0.48, c, { nu: 4, rz: 0.12, cap0: true, cap1: true }); const e = P[30]; k.setT(TR(e[0], y0 + h * 0.5, e[2])).prism(rrect(h * 1.2, h * 0.9, h * 0.2, 2), 0.004, 0xd4af37, { holes: [rrect(h * 0.8, h * 0.5, h * 0.1, 2)] }).setT(null); return; }
  const tex = id === 'rope' ? (u, t) => (((u * 3 + t * 60) % 1) < 0.5 ? c : shade(c, 0.78)) : null;
  const P = coil(k, R, h * (id === 'garden_hose' ? 0.16 : id === 'rope' ? 0.17 : 0.1), y0, id === 'garden_hose' ? 3.2 : 3.6, c, { h: h * 0.4, col: tex });
  const end = P[P.length - 1];
  if (id === 'extension_cord') { k.rbox(end[0], end[1], end[2] + w * 0.04, w * 0.12, h * 0.4, w * 0.1, c, 0.004); for (const sx of [-1, 1]) k.tube(end[0] + sx * w * 0.02, end[1], end[2] + w * 0.1, 0.002, w * 0.04, CHROME, 5, { m: RX(Math.PI / 2) }); }
  if (id === 'leash') { k.torus(end[0], end[1], end[2], w * 0.04, METAL, 0, 0, 0, true); k.box(end[0], end[1], end[2] + w * 0.05, w * 0.03, h * 0.3, w * 0.05, METAL); }
  if (id === 'jump_rope' || id === 'jump_rope_pro') for (const e of [P[0], end]) k.setT(TR(e[0], 0, e[2])).lathe([{ r: w * 0.04, y: y0 }, { r: w * 0.05, y: y0 + h * 0.2, p: 'a' }, { r: w * 0.045, y: y0 + h * 0.9, p: 'a' }, { r: w * 0.03, y: h / 2, p: 'a', h: 1 }], 8, { a: { c: id === 'jump_rope' ? 0xd7b46a : 0x212121 } }, { bottom: 0x8d6e63 }).setT(null);
  if (id === 'string_lights') for (let i = 2; i < P.length; i += 3) { const p = P[i]; k.orb(p[0], p[1] + h * 0.12, p[2], h * 0.1, h * 0.16, h * 0.1, [0xffd54f, 0xff7043, 0x4fc3f7, 0x81c784][i % 4], 5, 4); }
});
// Anneaux : couronne de Noël, bracelets, miroir soleil, collier pour chien, bandeau éponge (axe z)
S('ring_big', (k, s, c, d) => {
  const [w, h, D] = s, R = Math.min(w, h) / 2, id = d.id, ring = (r, t, col, n = 24, rz = 1) => { const P = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; P.push([Math.cos(a) * r, Math.sin(a) * r, 0]); } k.sweep(P, t, col, { nu: k.lod ? 5 : 8, rz }); };
  if (id === 'wreath') { ring(R * 0.72, R * 0.2, c, 24, D / (R * 0.4)); for (let i = 0; i < (k.lod ? 8 : 14); i++) { const a = i / 14 * Math.PI * 2 + 0.2, r = R * (0.62 + (i % 3) * 0.1); leafAt(k, Math.cos(a) * r, Math.sin(a) * r, D * 0.2, Math.cos(a + 1.4), Math.sin(a + 1.4), 0.3, R * 0.28, R * 0.12, i % 2 ? 0x2e6b30 : 0x3d7d3a, 0.2); } for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; k.orb(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, D * 0.32, R * 0.04, R * 0.04, R * 0.04, 0xc62828, 5, 3); } k.orb(0, -R * 0.78, D * 0.3, R * 0.16, R * 0.1, D * 0.15, 0xd32f2f, 7, 4); return; }
  if (id === 'mirror_deco') { k.tube(0, 0, 0, R * 0.55, D * 0.6, 0xd4af37, 24, { m: RX(Math.PI / 2) }); k.tube(0, 0, D * 0.3, R * 0.48, 0.002, 0xcfd8dc, 24, { m: RX(Math.PI / 2) }); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; k.setT(mm(RZ(a - Math.PI / 2), TR(0, R * 0.55, 0))).lathe([{ r: R * 0.04, rz: D * 0.15, y: 0 }, { r: 0.002, y: R * (i % 2 ? 0.42 : 0.3), p: 'a' }], 4, { a: { c: 0xd4af37 } }).setT(null); } k.meta.mirror = { w: R * 0.96, h: R * 0.96, z: D * 0.3 + 0.002 }; return; }
  if (id === 'headband') { ring(R * 0.78, R * 0.2, c, 24, D / (R * 0.42)); return; }
  const rr = id === 'dog_collar' ? R * 0.62 : R * 0.85; ring(rr, Math.min(D, R * 0.15) / 2, c, 28, id === 'dog_collar' ? 2.2 : 1);
  if (id === 'dog_collar') { k.box(0, -rr, 0, R * 0.3, R * 0.2, D * 0.95, METAL); k.torus(0, -R * 0.72, 0, R * 0.09, METAL, 0, 0, 0, true); k.tube(0, -R * 0.84, 0, R * 0.12, 0.002, 0xd4af37, 10, { m: RX(Math.PI / 2) }); }
  if (id === 'bracelet_charm') for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; k.orb(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85 - R * 0.12, 0, R * 0.08, R * 0.08, R * 0.05, [0xd32f2f, 0x1e88e5, 0xd4af37, 0xec407a, 0x43a047][i], 6, 4); }
});
// Collier posé à plat : chaîne fine (ou perles), pendentif cœur ou pierre
S('necklace', (k, s, c, d) => {
  const [w, h, D] = s, R = Math.min(w, D) * 0.42, y = -h / 2 + 0.002, P = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; P.push([Math.cos(a) * R, y, Math.sin(a) * R * 0.9 + (Math.sin(a) > 0 ? Math.sin(a) ** 4 * R * 0.12 : 0)]); }
  if (d.id === 'necklace') { for (let i = 0; i < 28; i += (k.lod ? 3 : 1)) k.orb(P[i][0], y + 0.002, P[i][2], 0.004, 0.004, 0.004, 0xfdfbf5, 5, 3); return; }
  k.sweep(P, 0.0009, c, { nu: 3 });
  const pz = R * 1.02 + 0.006;
  if (d.id === 'pendant_heart') { const H = []; for (let i = 0; i < 14; i++) { const t = i / 14 * Math.PI * 2; H.push([16 * Math.sin(t) ** 3 / 17 * 0.009, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 * 0.009]); } k.setT(mm(TR(0, y + 0.002, pz), RX(-Math.PI / 2))).prism(H, 0.003, 0xd81b60, { bev: 0.001, smooth: true }).setT(null); }
  else k.setT(TR(0, y + 0.003, pz)).lathe([{ r: 0.001, y: -0.003 }, { r: 0.005, y: 0, p: 'g', h: 1 }, { r: 0.0035, y: 0.002, p: 'g', h: 1 }], 8, { g: { c: d.id === 'chain_gold' ? 0xd4af37 : 0xe0f7fa } }, { top: 0xf0faff }).setT(null);
});
// Bagues (debout, axe z) : anneau bombé, chaton à griffes et pierre taillée ; boucles d'oreilles ; broche
const gem = (k, x, y, z, r, c) => k.setT(TR(x, y, z)).lathe([{ r: 0.0003, y: -r * 0.9 }, { r: r, y: 0, p: 'g', h: 1 }, { r: r * 0.92, y: r * 0.18, p: 'c', h: 1 }, { r: r * 0.55, y: r * 0.42, p: 'c', h: 1 }], 8, { g: { c: shade(c, 0.75) }, c: { c } }, { top: mixc(c, 0xffffff, 0.35) }).setT(null);
S('ring', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id;
  if (/earrings/.test(id)) { for (const sx of [-1, 1]) { if (id === 'earrings_pearl') { k.orb(sx * w * 0.25, -h / 2 + w * 0.2, 0, w * 0.2, w * 0.2, w * 0.2, 0xfdfbf5, 7, 5); k.tube(sx * w * 0.25, -h / 2 + w * 0.45, 0, 0.0005, w * 0.2, 0xd4af37, 4); } else { k.torus(sx * w * 0.25, 0, 0, w * 0.2, c, 0, 0, 0, true); gem(k, sx * w * 0.25, -h * 0.35, 0, w * 0.08, 0xff4081); } } return; }
  if (id === 'cursed_brooch') { k.setT(RX(0)).prism(ellip(w * 0.45, h * 0.4, 14), D * 0.5, c, { bev: D * 0.15, smooth: true }).setT(null); k.torus(0, 0, D * 0.25, w * 0.36, 0x9e9e9e, 0, 0, 0, true); gem(k, 0, 0, D * 0.3, w * 0.14, 0x4a148c); return; }
  const R = w * 0.4, P = []; for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2; P.push([Math.cos(a) * R, -h / 2 + R + 0.0015 + Math.sin(a) * R, 0]); }
  k.sweep(P, (t) => Math.min(D * 0.45, 0.0026) * (1 + 0.25 * Math.max(0, Math.sin(t * Math.PI * 2 + Math.PI / 2))), /ruby|sapphire/.test(id) ? 0xe8c060 : c, { nu: 6, rz: 0.36 });
  const top = -h / 2 + 2 * R + 0.0015, gc = id === 'diamond_ring' ? 0xe0f7fa : id === 'ring_ruby' ? 0xd50000 : id === 'ring_sapphire' ? 0x1a237e : null;
  if (gc != null && !k.lod) { for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.tube(x * 0.0018, top + 0.0016, z * 0.0018, 0.0004, 0.0032, 0xe0e0e0, 4); gem(k, 0, top + 0.0032, 0, 0.0032, gc); }
});
// Montres à plat : boîtier, lunette, cadran et aiguilles, couronne, bracelet ; montre connectée carrée
S('watch', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, smart = d.id === 'smartwatch', R = Math.min(w, D) * (smart ? 0.42 : 0.34), sc = d.id === 'watch_sport' || smart ? 0x212121 : d.id === 'watch_gold' ? 0xd4af37 : 0x5d4037;
  for (const sz of [-1, 1]) { if (k.lod) { k.pbox(0, y0 + h * 0.2, sz * (R * 0.8 + (D / 2 - R * 0.8) / 2), R * 1.2, R * 0.15, D / 2 - R * 0.8, sc); continue; } const P = []; for (let i = 0; i <= 5; i++) { const t = i / 5; P.push([0, y0 + h * 0.2, sz * (R * 0.8 + t * (D / 2 - R * 0.8 - 0.002))]); } k.sweep(P, R * 0.6, sc, { nu: 4, rz: 0.12, cap1: true }); }
  if (smart) { k.rbox(0, y0 + h * 0.55, 0, R * 1.8, h * 0.7, R * 2.1, c, 0.003); k.box(0, y0 + h * 0.9, 0, R * 1.6, 0.001, R * 1.85, 0x0a1220); k.tube(R * 0.95, y0 + h * 0.6, -R * 0.3, 0.0015, 0.002, 0x777777, 6, { m: RZ(Math.PI / 2) }); return; }
  k.lathe([{ r: R * 0.92, y: y0 + h * 0.15 }, { r: R, y: y0 + h * 0.4, p: 'a' }, { r: R, y: y0 + h * 0.72, p: 'a' }, { r: R * 0.94, y: y0 + h * 0.85, p: 'b', h: 1 }, { r: R * 0.82, y: y0 + h * 0.85, p: 'd', h: 1 }], 20, { a: { c }, b: { c: shade(c, 1.15) }, d: { c: d.id === 'watch_sport' ? 0x111111 : 0xf8f6f0 } }, { bottom: shade(c, 0.8), top: d.id === 'watch_sport' ? 0x111111 : 0xf8f6f0 });
  const yy = y0 + h * 0.85 + 0.0003, mk = d.id === 'watch_sport' ? 0xeeeeee : 0x222222;
  if (!k.lod) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; deco(k, Math.cos(a) * R * 0.7, yy, Math.sin(a) * R * 0.7, i % 3 ? 0.0008 : 0.0015, 0.0005, i % 3 ? 0.0008 : 0.0015, mk); } k.box(0, yy + 0.0003, -R * 0.22, 0.0012, 0.0004, R * 0.44, mk); k.box(R * 0.3, yy + 0.0005, 0, R * 0.6, 0.0004, 0.0009, mk); }
  if (!k.lod) k.tube(R + 0.0012, y0 + h * 0.55, 0, 0.0012, 0.003, shade(c, 1.1), 8, { m: RZ(Math.PI / 2) });
});
// Lunettes (optique, solaires, 3D, sécurité) : deux cerclages évidés, pont, verres teintés, branches et charnières
function frameRim(st, r) { if (st === 'round' || st === 'kids') return [ellip(r, r * 0.95, 10), ellip(r * 0.82, r * 0.77, 10)]; if (st === 'cateye') { const P = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P.push([Math.cos(a) * r * 1.05, Math.sin(a) * r * 0.78 + (Math.cos(a) > 0.3 && Math.sin(a) > 0 ? r * 0.28 * Math.cos(a) : 0)]); } return [P, P.map(([x, y]) => [x * 0.82, y * 0.78])]; } const ww = st === 'reading' ? r * 1.15 : r * 1.1, hh = st === 'reading' ? r * 0.62 : r * 0.82; return [rrect(ww * 2, hh * 2, r * 0.3, 2), rrect(ww * 1.66, hh * 1.62, r * 0.22, 2)]; }
function GLASSES(k, [w, h, L], c, lens, st, lens2) {
  const r = Math.min(w * 0.22, h * 0.5), cx = w * 0.25, fz = L / 2 - 0.003, t = 0.004, [outer, inner] = frameRim(st, r);
  for (const sx of [-1, 1]) {
    k.setT(TR(sx * cx, 0, fz)).prism(outer, t, c, { holes: [inner], smooth: true }).setT(null);
    const lp = inner.map(([x, y]) => [x * 1.01, y * 1.01]); k.setT(TR(sx * cx, 0, fz - 0.0005)).prism(lp, 0.0008, sx < 0 ? lens : lens2 ?? lens, { side: false }).setT(null);
    const ex = sx * (cx + r * 1.08); k.box(ex - sx * 0.002, r * 0.35, fz - 0.003, 0.004, 0.006, 0.006, c); // charnière
    k.sweep([[ex, r * 0.35, fz - 0.005], [ex, r * 0.33, -L * 0.25], [ex * 0.98, r * 0.1, -L / 2 + 0.006]], 0.0018, c, { nu: 4, rz: 1.8, cap1: true }); // branche
    if (!k.lod) k.orb(sx * w * 0.06, -r * 0.2, fz - 0.006, 0.002, 0.003, 0.0012, 0xeeeeee, 4, 2); // plaquette
  }
  k.sweep([[-cx + r * 0.8, r * 0.3, fz], [0, r * 0.42, fz + 0.001], [cx - r * 0.8, r * 0.3, fz]], 0.0018, c, { nu: 4 }); // pont
}
S('pglass', (k, s, c, d) => { const id = d.id, st = /round|kids/.test(id) ? 'round' : /cateye/.test(id) ? 'cateye' : /reading/.test(id) ? 'reading' : 'square'; if (id === 'safety_glasses') { k.surf(8, 2, (u, v) => { const a = (u - 0.5) * 2.4; return [Math.sin(a) * s[0] * 0.48, (v - 0.5) * s[1] * 0.9, Math.cos(a) * s[2] * 0.35 + s[2] * 0.12]; }, d.c2 ?? 0xc8dde6, { open: true }); k.surf(8, 2, (u, v) => { const a = (0.5 - u) * 2.4; return [Math.sin(a) * s[0] * 0.48, (v - 0.5) * s[1] * 0.9, Math.cos(a) * s[2] * 0.35 + s[2] * 0.12 - 0.001]; }, shade(d.c2 ?? 0xc8dde6, 0.9), { open: true }); for (const sx of [-1, 1]) k.sweep([[sx * s[0] * 0.47, s[1] * 0.2, 0], [sx * s[0] * 0.46, s[1] * 0.15, -s[2] * 0.45]], 0.002, c, { nu: 4, rz: 2 }); return; } GLASSES(k, s, c, d.c2 ?? 0x37474f, st); });
S('glasses', (k, s, c, d) => GLASSES(k, s, c, d.p?.mode === 'anaglyph' ? 0xd50000 : 0x111111, d.p?.mode === 'anaglyph' ? 'square' : 'round', d.p?.mode === 'anaglyph' ? 0x00b8d4 : null));
// Lunettes de vision nocturne / de natation ; jumelles ; loupe
S('goggles', (k, s, c, d) => { const [w, h, D] = s; if (d.id === 'swim_goggles') { for (const sx of [-1, 1]) { k.setT(mm(TR(sx * w * 0.22, 0, D * 0.1), RX(Math.PI / 2))).lathe([{ r: h * 0.48, rz: h * 0.38, y: -D * 0.15 }, { r: h * 0.45, rz: h * 0.36, y: D * 0.15, p: 'a' }, { r: h * 0.36, rz: h * 0.28, y: D * 0.2, p: 'l', h: 1 }], 12, { a: { c }, l: { c: 0x1565c0 } }, { top: 0x1565c0, bottom: 0x0d3c78 }).setT(null); } k.sweep([[-w * 0.06, 0, D * 0.25], [0, h * 0.1, D * 0.28], [w * 0.06, 0, D * 0.25]], 0.002, c, { nu: 4 }); k.sweep([[-w * 0.45, 0, D * 0.05], [-w * 0.48, 0, -D * 0.4], [w * 0.48, 0, -D * 0.4], [w * 0.45, 0, D * 0.05]], 0.0025, 0x111111, { nu: 4, rz: 0.3 }); return; } k.rbox(0, 0, -D * 0.15, w * 0.8, h * 0.8, D * 0.5, c, 0.008); for (const sx of [-1, 1]) { k.tube(sx * w * 0.2, 0, D * 0.2, h * 0.32, D * 0.4, 0x222222, 12, { m: RX(Math.PI / 2) }); k.tube(sx * w * 0.2, 0, D * 0.4 + 0.0005, h * 0.24, 0.001, 0x1b5e20, 12, { m: RX(Math.PI / 2) }); } k.sweep([[-w * 0.4, 0, -D * 0.3], [0, h * 0.45, -D * 0.5], [w * 0.4, 0, -D * 0.3]], 0.006, 0x111111, { nu: 4, rz: 0.3 }); });
S('binoculars', (k, s, c, d) => { const [w, h, L] = s, R = h * 0.5; for (const sx of [-1, 1]) k.setT(mm(TR(sx * w * 0.27, 0, 0), RX(Math.PI / 2))).lathe([{ r: R * 0.55, y: -L / 2 }, { r: R * 0.62, y: -L / 2 + L * 0.12, p: 'e' }, { r: R * 0.62, y: -L / 2 + L * 0.15, p: 'e', h: 1 }, { r: R * 0.8, y: -L * 0.2, p: 'b', h: 1 }, { r: R * 0.82, y: L * 0.32, p: 'b' }, { r: R, y: L * 0.4, p: 'b', h: 1 }, { r: R, y: L / 2, p: 'r', h: 1 }, { r: R * 0.8, y: L / 2, p: 'g', h: 1 }], 14, { e: { c: 0x111111 }, b: { c }, r: { c: 0x222222 }, g: { c: 0x203a50 } }, { bottom: 0x0a0a0a, top: 0x203a50 }).setT(null); k.box(0, 0, -L * 0.05, w * 0.3, R * 0.6, L * 0.4, 0x222222); k.tube(0, R * 0.25, -L * 0.15, R * 0.35, w * 0.12, 0x444444, 12, { m: RZ(Math.PI / 2), rect: k.lod ? null : ridgeTex(k, 16) }); });
S('magnifier', (k, s, c) => { const [w, h, L] = s, R = w * 0.44, cz = L / 2 - R - h * 0.3; k.setT(TR(0, 0, cz)).sweep(Array.from({ length: 21 }, (_, i) => { const a = i / 20 * Math.PI * 2; return [Math.cos(a) * R, 0, Math.sin(a) * R]; }), h * 0.3, 0x5d4037, { nu: 6 }).setT(mm(TR(0, 0, cz), RX(-Math.PI / 2))).prism(ellip(R * 0.96, R * 0.96, 16), h * 0.22, 0xcfe8ef, {}).setT(null); k.setT(mm(TR(0, 0, cz - R), RX(-Math.PI / 2))).lathe([{ r: h * 0.22, y: 0 }, { r: h * 0.3, y: L * 0.06, p: 'a' }, { r: h * 0.38, y: L * 0.15, p: 'a' }, { r: h * 0.4, y: cz - R + L / 2 - 0.002, p: 'a' }], 10, { a: { c: 0x3e2723 } }, { top: 0x3e2723 }).setT(null); });
// Parfum : flacon de verre facetté (contour extrudé), étiquette, col doré, bouchon sculpté
S('perfume', (k, s, c, d) => { const [w, h, D] = s, bh = h * 0.68, P = d.id === 'perfume2' ? rrect(w, D, w * 0.45, 3) : [[-w / 2, -D * 0.3], [-w * 0.3, -D / 2], [w * 0.3, -D / 2], [w / 2, -D * 0.3], [w / 2, D * 0.3], [w * 0.3, D / 2], [-w * 0.3, D / 2], [-w / 2, D * 0.3]]; k.setT(mm(TR(0, -h / 2 + bh / 2, 0), RX(-Math.PI / 2))).prism(P, bh, c, { bev: 0.002, cs: shade(c, 1.15) }).setT(null); k.lathe([{ r: w * 0.13, y: -h / 2 + bh }, { r: w * 0.13, y: -h / 2 + bh + h * 0.06, p: 'a', h: 1 }, { r: w * 0.1, y: -h / 2 + bh + h * 0.08, p: 'a' }], 10, { a: { c: 0xd4af37 } }); k.orb(0, h / 2 - h * 0.1, 0, w * 0.22, h * 0.1, w * 0.22, d.c2 ?? 0x111111, 10, 6, { e: [0.6, 0.6] }); });
S('pperf', (k, s, c, d) => {
  const w = s[0], h = s[1], dd = s[2], bh = h * 0.64, y0 = -h / 2, lab = k.pk(d, 'cosmetic', w * 0.7, bh * 0.5, { bg: d.lc ?? 0xfafafa });
  const P = d.cap === 'ball' ? rrect(w, dd, Math.min(w, dd) * 0.45, 3) : [[-w / 2, -dd * 0.32], [-w * 0.32, -dd / 2], [w * 0.32, -dd / 2], [w / 2, -dd * 0.32], [w / 2, dd * 0.32], [w * 0.32, dd / 2], [-w * 0.32, dd / 2], [-w / 2, dd * 0.32]];
  k.setT(mm(TR(0, y0 + bh / 2, 0), RX(-Math.PI / 2))).prism(P, bh, c, { bev: k.lod ? 0 : Math.min(0.002, w * 0.04), cs: shade(c, 1.12), cb: shade(c, 0.9) }).setT(null);
  k.quad([-w * 0.32, y0 + bh * 0.28, dd / 2 + 0.0004], [w * 0.32, y0 + bh * 0.28, dd / 2 + 0.0004], [w * 0.32, y0 + bh * 0.72, dd / 2 + 0.0004], [-w * 0.32, y0 + bh * 0.72, dd / 2 + 0.0004], 0xffffff, lab);
  k.lathe([{ r: Math.min(w, dd) * 0.16, y: y0 + bh }, { r: Math.min(w, dd) * 0.16, y: y0 + bh + h * 0.07, p: 'a', h: 1 }, { r: Math.min(w, dd) * 0.12, y: y0 + bh + h * 0.08, p: 'a' }], 10, { a: { c: d.c2 ?? 0xd4af37 } });
  if (d.cap === 'ball') k.orb(0, y0 + bh + h * 0.2, 0, w * 0.26, h * 0.13, w * 0.26, d.c3 ?? 0x212121, 9, 6); else k.rbox(0, y0 + bh + h * 0.2, 0, w * 0.42, h * 0.24, dd * 0.62, d.c3 ?? 0x212121, 0.003);
});
// Sac à main : corps trapézoïdal extrudé, rabat, fermoir doré, anses ; autres sachets
S('bag', (k, s, c, d) => {
  if (d.id === 'handbag') { const [w, h, D] = s, y0 = -h / 2, bh = h * 0.62, bd = D * 0.86; k.prism([[-w / 2, y0], [w / 2, y0], [w * 0.4, y0 + bh], [-w * 0.4, y0 + bh]], bd, c, { bev: bd * 0.2, smooth: true }); k.surf(6, 2, (u, v) => [(u - 0.5) * w * 0.82, y0 + bh - v * bh * 0.45, bd / 2 + 0.002 + Math.sin(Math.PI * v) * 0.004], shade(c, 0.85), { open: true, flip: true }); k.rbox(0, y0 + bh * 0.55, bd / 2 + 0.0035, w * 0.1, h * 0.06, 0.006, 0xd4af37, 0.002); for (const zs of [-1, 1]) { const P = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI; P.push([Math.cos(a) * w * 0.16, y0 + bh + Math.sin(a) * (h - bh - 0.004), zs * D * 0.18]); } k.sweep(P, 0.004, shade(c, 0.8), { nu: 5 }); } return; }
  S_PILLOW(k, s, c, { ...d, b: d.b ?? LEG(d)[1], pi: d.pi ?? LEG(d)[2], l: d.l ?? d.label ?? d.name });
});
// Bougie : cire au bord fondu, mèche noircie
S('candle', (k, s, c) => { const R = s[0] / 2, h = s[1]; k.lathe([{ r: R * 0.98, y: -h / 2 }, { r: R, y: -h / 2 + 0.003, p: 'a' }, { r: R, y: h * 0.38, p: 'a' }, { r: R * 0.96, y: h * 0.42, p: 'a', h: 1 }, { r: R * 0.8, y: h * 0.4, p: 't' }, { r: 0.002, y: h * 0.37, p: 't' }], 16, { a: { c }, t: { c: shade(c, 0.92) } }, { bottom: shade(c, 0.9) }); k.sweep([[0, h * 0.37, 0], [0.001, h * 0.45, 0], [0.002, h * 0.48, 0.001]], 0.0012, 0x1a1a1a, { nu: 3, cap1: true }); k.meta.flame = [0, h * 0.53, 0]; });
// ═════════════════════ VAISSELLE, BOISSONS SERVIES, PLANTES ═════════════════════
// Récipient ouvert de révolution : paroi extérieure (profil R(v)), lèvre, paroi intérieure, fond intérieur ou liquide
function OPENCUP(k, R0, R1, h, y0, c, ci, o = {}) {
  const sg = k.lod ? 8 : o.sg || 12, t = o.t ?? Math.min(0.003, R1 * 0.08), lv = o.liquid != null ? o.lv ?? 0.82 : null, rect = o.rect;
  k.lathe([{ r: R0 * 0.94, y: y0 }, { r: R0, y: y0 + Math.min(0.004, h * 0.06), p: 'a' }, { r: R1, y: y0 + h - 0.0015, p: rect ? 'l' : 'a' }, { r: R1 - t * 0.3, y: y0 + h, p: 'a', h: 1 }], sg, { a: { c }, l: { c: 0xffffff, rect } }, { bottom: shade(c, 0.8) });
  const ri = (v) => R0 - t + (R1 - R0) * v, yb = y0 + Math.min(0.006, h * 0.12);
  k.surf(sg, 1, (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = v ? R1 - t : ri(0) ; return [r * Math.sin(a), v ? y0 + h : yb, r * Math.cos(a)]; }, ci, { flip: true });
  k.surf(sg, 1, (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = v ? R1 - t : R1 - t * 0.3; return [r * Math.sin(a), y0 + h, r * Math.cos(a)]; }, c);
  const ly = lv != null ? y0 + h * lv : yb + 0.0002, lr = ri((ly - y0) / h);
  k.tube(0, ly - 0.0005, 0, lr, 0.001, lv != null ? o.liquid : ci, sg);
}
// Anse en C (tasses, mugs) : attaches sur la paroi (xb en bas, xt en haut), hauteur hh
const handle = (k, xb, xt, y, hh, r, c) => { const P = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI, t = (Math.sin(a) + 1) / 2; P.push([xb + (xt - xb) * t + Math.cos(a) * hh * 0.42, y + Math.sin(a) * hh * 0.5, 0]); } k.sweep(P, r, c, { nu: 5, rz: 0.7 }); };
// Soucoupe
const saucer = (k, R, y0, c) => k.lathe([{ r: R * 0.55, y: y0 }, { r: R * 0.6, y: y0 + 0.002, p: 'a' }, { r: R, y: y0 + 0.008, p: 'a' }, { r: R * 0.97, y: y0 + 0.0095, p: 'a', h: 1 }, { r: R * 0.85, y: y0 + 0.007, p: 'a' }, { r: R * 0.42, y: y0 + 0.004, p: 'a' }], k.lod ? 8 : 12, { a: { c } }, { bottom: shade(c, 0.9), top: c });
S('cup', (k, s, c, d) => {
  const [w, h, D] = s, R = Math.min(w, D) / 2, y0 = -h / 2, id = d.id;
  if (id === 'coffee' || id === 'soda_cup_large' || id === 'milkshake' || id === 'milkshake_vanilla') { // gobelet à emporter : manchon, couvercle, paille
    const lid = id === 'coffee' ? 0x212121 : 0xf5f5f5, cold = id !== 'coffee', lh = cold ? h * 0.12 : h * 0.1;
    k.lathe([{ r: R * 0.7, y: y0 }, { r: R * 0.72, y: y0 + 0.003, p: 'a' }, { r: R * 0.92, y: y0 + h - lh, p: 'a' }, { r: R * 0.97, y: y0 + h - lh + 0.003, p: 'k', h: 1 }, { r: R * 0.97, y: y0 + h - lh + 0.006, p: 'k' }, { r: cold ? R * 0.9 : R * 0.86, y: y0 + h - 0.003, p: 'k' }, { r: cold ? R * 0.15 : R * 0.8, y: y0 + h, p: 'k' }], 16, { a: { c }, k: { c: lid } }, { bottom: shade(c, 0.85), top: lid });
    if (id === 'coffee') { k.lathe([{ r: R * 0.81, y: y0 + h * 0.35 }, { r: R * 0.87, y: y0 + h * 0.72, p: 's' }], 16, { s: { c: 0x9c7a52 } }); k.box(R * 0.35, y0 + h - 0.0006, 0, R * 0.25, 0.0012, R * 0.12, 0x111111); }
    else k.sweep([[R * 0.05, y0 + h * 0.7, 0], [R * 0.08, h / 2 - 0.002, R * 0.12]], 0.0035, id === 'soda_cup_large' ? 0xd32f2f : 0xec407a, { nu: 6, cap1: true });
    return;
  }
  if (id === 'sundae' || id === 'sundae_caramel') { const glass = id === 'sundae' ? 0xdfeaf0 : 0xf5f5f5; k.lathe([{ r: R * 0.45, y: y0 }, { r: R * 0.5, y: y0 + 0.004, p: 'a', h: 1 }, { r: R * 0.12, y: y0 + 0.008, p: 'a' }, { r: R * 0.1, y: y0 + h * 0.2, p: 'a' }, { r: R * 0.85, y: y0 + h * 0.45, p: 'a' }, { r: R * 0.95, y: y0 + h * 0.55, p: 'a', h: 1 }, { r: R * 0.9, y: y0 + h * 0.55, p: 'a', h: 1 }, { r: R * 0.8, y: y0 + h * 0.46, p: 'a' }, { r: R * 0.08, y: y0 + h * 0.24, p: 'a' }], 14, { a: { c: glass } }, { bottom: glass, top: glass }); for (let i = 0; i < 3; i++) k.orb((i - 1) * R * 0.35, y0 + h * 0.62, (i % 2) * R * 0.1, R * 0.42, R * 0.38, R * 0.42, [c, 0xfff8e1, 0x795548][i], 8, 6); k.lathe([{ r: R * 0.5, y: y0 + h * 0.72 }, { r: R * 0.3, y: y0 + h * 0.85, p: 'a' }, { r: 0.001, y: y0 + h * 0.96, p: 'a' }], 8, { a: { c: 0xfffdf7 } }); k.orb(0, h / 2 - R * 0.12, 0, R * 0.12, R * 0.12, R * 0.12, 0xc62828, 6, 4); if (id === 'sundae_caramel') k.sweep([[R * 0.3, y0 + h * 0.8, 0], [R * 0.5, y0 + h * 0.6, R * 0.2], [R * 0.6, y0 + h * 0.5, 0]], 0.003, 0xb3651e, { nu: 4 }); return; }
  if (id === 'latte' || id === 'orange_juice_glass') { const juice = id === 'orange_juice_glass'; k.lathe([{ r: R * 0.82, y: y0 }, { r: R * 0.86, y: y0 + 0.006, p: 'g', h: 1 }, { r: R * 0.88, y: y0 + h * 0.4, p: 'a' }, { r: R * 0.94, y: y0 + h * 0.8, p: 'b' }, { r: R * 0.96, y: y0 + h * 0.92, p: 'f' }, { r: R * 0.97, y: y0 + h, p: 'g', h: 1 }, { r: R * 0.9, y: y0 + h * 0.97, p: 'f', h: 1 }], 16, { g: { c: 0xe6eef2 }, a: { c: juice ? c : 0x8d5a3a }, b: { c: juice ? c : 0xd8b28a }, f: { c: juice ? shade(c, 1.1) : 0xfaf3e6 } }, { bottom: 0xd8e2e8, top: juice ? shade(c, 1.1) : 0xfaf3e6 }); if (juice) k.setT(TR(R * 0.62, h / 2 - R * 0.36 - 0.001, 0)).prism(ellip(R * 0.36, R * 0.36, 10), 0.004, 0xffb300, { cs: 0xf57c00 }).setT(null); return; }
  if (id === 'miso_soup') { OPENCUP(k, R * 0.55, R, h, y0, c, shade(c, 0.6), { liquid: 0xc8a060, lv: 0.75 }); for (let i = 0; i < 4; i++) deco(k, (i - 1.5) * R * 0.25, y0 + h * 0.75 + 0.0003, (i % 2 - 0.5) * R * 0.3, 0.006, 0.0006, 0.006, i % 2 ? 0x7cb342 : 0xfff8e1); return; }
  // tasse en céramique sur soucoupe : café, crème, cappuccino, thé, chocolat
  const hasS = h < 0.11, cy0 = hasS ? y0 + 0.008 : y0, cR = hasS ? R * 0.66 : R * 0.8, ch = Math.min(h - (cy0 - y0), cR * 2.2), liq = { coffee: 0x3e2723, espresso: 0x2a1a10, cafe_creme: 0xa77a52, cappuccino: 0xe8d6bc, hot_choc: 0x5d3a22, tea_cup: 0xb5651d }[id] ?? 0x6d4c41;
  if (hasS) saucer(k, R, y0, c);
  const R0 = cR * 0.62, hr = Math.max(0.0025, ch * 0.05), hh = Math.min(ch * 0.62, (R * 0.97 - cR * 0.95 - hr) / 0.42), hy = cy0 + ch * 0.55, rw = (y) => R0 + (cR - R0) * (y - cy0) / ch - hr * 0.5;
  OPENCUP(k, R0, cR, ch, cy0, c, shade(c, 0.92), { liquid: liq, lv: 0.86 });
  handle(k, rw(hy - hh / 2), rw(hy + hh / 2), hy, hh, hr, c);
  if (id === 'cappuccino' && !k.lod) k.orb(0, cy0 + ch * 0.86, 0, cR * 0.25, 0.0008, cR * 0.2, 0x8d5a3a, 6, 2);
});
// Mug imprimé : étiquette enveloppante, intérieur, café, anse
S('pmug', (k, s, c, d) => {
  const [w, h, D] = s, hh = h * 0.6, hr = 0.0055, reach = hh * 0.42 + hr, R = Math.min((w - reach) / 1.95, D / 2), lab = d.l || d.pi ? k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.7, { bg: c }) : null;
  k.setT(TR(-(reach - 0.05 * R) / 2, 0, 0)); OPENCUP(k, R * 0.92, R, h, -h / 2, c, d.c2 ?? shade(c, 0.9), { rect: lab, liquid: 0x3e2723, lv: 0.85, t: 0.004 });
  handle(k, R * 0.95 - hr * 0.5, R * 0.99 - hr * 0.5, 0, hh, hr, c); k.setT(null);
});
// Seau, bac à litière, panier en osier, coupe déco
S('ppan', (k, s, c, d) => {
  const [w, h, D] = s, R = Math.min(w, D) / 2, id = d.id, ci = d.c2 ?? shade(c, 1.1);
  if (id === 'litter_tray') { TUB(k, w * 0.92, D * 0.92, w, D, h, 0.03, c, ci, -h / 2); k.box(0, -h / 2 + h * 0.3, 0, w * 0.86, 0.002, D * 0.86, 0xd7ccc8); return; }
  if (id === 'wicker_basket') { const rx = w / 2, rz = D / 2; k.lathe([{ r: rx * 0.8, rz: rz * 0.8, y: -h / 2 }, { r: rx * 0.98, rz: rz * 0.98, y: h / 2 - 0.006, p: 'a' }, { r: rx, rz: rz, y: h / 2, p: 'b', h: 1 }, { r: rx * 0.94, rz: rz * 0.94, y: h / 2, p: 'b', h: 1 }], 18, { a: { c, rect: k.lod ? null : ridgeTex(k, 36) }, b: { c: shade(c, 0.8) } }, { bottom: shade(c, 0.7) }); k.surf(18, 1, (u, v) => { const a = 2 * Math.PI * (u - 0.5), f = v ? 0.94 : 0.78; return [rx * f * Math.sin(a), v ? h / 2 : -h / 2 + 0.008, rz * f * Math.cos(a)]; }, ci, { flip: true }); k.tube(0, -h / 2 + 0.008, 0, rx * 0.78, 0.001, ci, 14, { rz: rz * 0.78 }); for (const sx of [-1, 1]) { const P = []; for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI; P.push([sx * rx * 0.9, h / 2 + Math.sin(a) * 0.0001 - 0.003, Math.cos(a) * rz * 0.25]); } k.sweep(P, 0.004, shade(c, 0.8), { nu: 4 }); } return; }
  if (id === 'bucket') { OPENCUP(k, R * 0.78, R * 0.98, h, -h / 2, c, ci, { t: 0.003, sg: 18 }); for (const yy of [0.25, 0.7]) k.lathe([{ r: R * (0.78 + 0.2 * yy) + 0.0015, y: -h / 2 + h * yy - 0.003 }, { r: R * (0.78 + 0.2 * yy) + 0.0015, y: -h / 2 + h * yy + 0.003, p: 'a' }], 18, { a: { c: shade(c, 0.85) } }); const yp = h / 2 - h * 0.1, P = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI, y = yp - Math.sin(a) * h * 0.32, rr = R * (0.78 + 0.2 * (y + h / 2) / h) + 0.0025; P.push([Math.cos(a) * rr, y, Math.sin(a) * rr]); } k.sweep(P, 0.0018, 0x9e9e9e, { nu: 4 }); for (const sx of [-1, 1]) k.box(sx * (R * 0.96 + 0.0015), yp, 0, 0.003, 0.014, 0.012, shade(c, 0.8)); return; }
  OPENCUP(k, R * 0.5, R, h, -h / 2, c, ci, { t: 0.004, sg: 20 });
});
// Pot de terre cuite : pied, cône, bourrelet, terre en retrait
function POT(k, x, y, r, h, c) {
  const y0 = y - h / 2, sg = k.lod ? 8 : 14, soil = 0x3b2a1e;
  k.setT(TR(x, 0, 0)).lathe([{ r: r * 0.68, y: y0 }, { r: r * 0.72, y: y0 + h * 0.04, p: 'a', h: 1 }, { r: r * 0.92, y: y0 + h * 0.76, p: 'a' }, { r: r, y: y0 + h * 0.78, p: 'a', h: 1 }, { r: r, y: y0 + h, p: 'a' }, { r: r * 0.9, y: y0 + h, p: 'a', h: 1 }, { r: r * 0.88, y: y0 + h * 0.9, p: 'a' }], sg, { a: { c } }, { bottom: shade(c, 0.7), top: soil }).setT(null);
}
// Feuillage : touffe bosselée (sphère déformée, nuances)
const tuft = (k, x, y, z, rx, ry, rz, c, nu = 9, nv = 6) => k.orb(x, y, z, rx, ry, rz, c, nu, nv, { f: (u, v, p) => { const b = 1 + 0.16 * (hn(u * 7.3, v * 5.1) - 0.5) + 0.08 * Math.sin(u * 37) * Math.sin(v * 23); return [p[0] * b, p[1] * b, p[2] * b]; }, col: (u, v) => mixc(c, shade(c, 1.35), Math.max(0, v - 0.4) * 0.6 + (hn(u * 13, v * 9) > 0.8 ? 0.3 : 0)) });
S('pplant', (k, s, c, d) => {
  const w = s[0], h = s[1], f = d.fo || 'bush';
  if (f === 'none') { // pot vide : paroi épaisse, bourrelet, intérieur visible, trou de drainage
    const R1 = w * 0.48, t = 0.008, yr = h / 2 - h * 0.2;
    k.lathe([{ r: R1 * 0.7, y: -h / 2 }, { r: R1 * 0.73, y: -h / 2 + 0.005, p: 'a', h: 1 }, { r: R1 * 0.92, y: yr, p: 'a' }, { r: R1, y: yr + 0.002, p: 'a', h: 1 }, { r: R1, y: h / 2 - 0.003, p: 'a' }, { r: R1 - 0.003, y: h / 2, p: 'a' }, { r: R1 - t + 0.002, y: h / 2, p: 'a', h: 1 }, { r: R1 * 0.92 - t, y: yr, p: 'i' }, { r: R1 * 0.7 - t, y: -h / 2 + 0.012, p: 'i' }], k.lod ? 8 : 18, { a: { c }, i: { c: shade(c, 0.78) } }, { top: shade(c, 0.6), bottom: shade(c, 0.75) });
    k.tube(0, -h / 2 + 0.0125, 0, 0.008, 0.001, 0x2a1d14, 8); return;
  }
  const ph = Math.min(h * 0.38, w * 0.9), py = -h / 2 + ph / 2; POT(k, 0, py, w * 0.36, ph, d.c2 ?? 0xb5653a);
  const top = -h / 2 + ph * 0.92, fh = h / 2 - top, Rm = w * 0.46, rnd = mulberry32(d.id.length * 41);
  // feuille partant du cœur (rayon r0, hauteur y) vers un écart horizontal ht et une montée vt
  const leafTo = (a, r0, y, ht, vt, bw, cc, fold) => leafAt(k, Math.cos(a) * r0, y, Math.sin(a) * r0, Math.cos(a) * ht, vt, Math.sin(a) * ht, Math.hypot(ht, vt), bw, cc, fold);
  if (f === 'succulent') { for (let i = 0; i < (k.lod ? 6 : 12); i++) { const a = i * 2.4, r = (i < 5 ? 0.3 : 0.16) * w, up = i < 5 ? 0.35 : 0.9; leafAt(k, Math.cos(a) * w * 0.04, top, Math.sin(a) * w * 0.04, Math.cos(a) * (1 - up), up, Math.sin(a) * (1 - up), r * 1.4, r * 0.8, i % 2 ? c : shade(c, 1.2), 0.45); } return; }
  if (f === 'cactus') { const R = w * 0.18, P = [[0, top, 0], [0, top + fh * 0.98, 0]]; k.sweep(P, (t) => R * (t > 0.85 ? Math.sqrt(Math.max(0.05, (1 - t) / 0.15)) : 1), c, { nu: 10, cap0: true, col: (u, t) => (Math.abs(((u * 8) % 1) - 0.5) < 0.08 ? shade(c, 0.7) : hn(u * 17, t * 31) > 0.9 ? 0xf5f5e0 : c) }); for (const sx of [-1, 1]) { const y = top + fh * (sx > 0 ? 0.42 : 0.6); k.sweep([[sx * R * 0.6, y, 0], [sx * w * 0.32, y + 0.004, 0], [sx * w * 0.34, y + fh * 0.22, 0]], (t) => R * 0.55 * (t > 0.85 ? 0.6 : 1), c, { nu: 8, cap1: true }); } return; }
  if (f === 'tall') { const P = [[0, top, 0], [w * 0.03, top + fh * 0.35, 0.01], [-w * 0.02, top + fh * 0.65, 0]]; k.sweep(P, (t) => w * 0.035 * (1 - 0.4 * t), 0x6d4c41, { nu: 6 }); for (let i = 0; i < (k.lod ? 3 : 5); i++) { const a = i * 1.3, r = i ? w * 0.2 : 0, ry = fh * 0.2; tuft(k, Math.cos(a) * r, i ? top + fh * 0.6 : h / 2 - ry * 1.1, Math.sin(a) * r, w * 0.25, ry, w * 0.25, i % 2 ? c : shade(c, 1.1)); } return; }
  if (f === 'palm') { // monstera : grandes feuilles sur pétioles, des plus basses (étalées) aux plus hautes (dressées)
    const n = k.lod ? 4 : 7, bl = w * 0.3, bw = w * 0.24;
    for (let i = 0; i < n; i++) { const a = i * 2.4 + rnd() * 0.3, t = (i + 0.5) / n, e = 0.25 + 0.65 * t, r = Math.max(0.01, Rm - bl * Math.cos(e) - bw * 0.3), ty = top + (fh - bl * Math.sin(e) - 0.01) * (0.4 + 0.6 * t), lx = Math.cos(a) * r, lz = Math.sin(a) * r; k.sweep([[0, top, 0], [lx * 0.3, top + (ty - top) * 0.6, lz * 0.3], [lx, ty, lz]], 0.0035, shade(c, 0.8), { nu: 4 }); leafAt(k, lx, ty, lz, Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), bl, bw, i % 2 ? c : shade(c, 1.15), 0.18); }
    return;
  }
  if (f === 'flower') { tuft(k, 0, top + fh * 0.22, 0, w * 0.4, fh * 0.25, w * 0.4, 0x3f7a35, 9, 5); const n = k.lod ? 5 : 9; for (let i = 0; i < n; i++) { const a = i * 2.4, r = (i % 3 + 0.4) * w * 0.12, x = Math.cos(a) * r, z = Math.sin(a) * r, y = top + fh * (0.5 + (i % 2) * 0.12); if (d.id === 'lavender_pot') { const ys = top + fh * (0.66 + (i % 2) * 0.12); k.sweep([[x * 0.3, top + fh * 0.2, z * 0.3], [x, ys - fh * 0.1, z]], 0.0012, 0x5f7a4a, { nu: 3 }); k.orb(x, ys, z, w * 0.03, fh * 0.11, w * 0.03, i % 2 ? c : shade(c, 1.2), 5, 4); } else k.orb(x, y, z, w * 0.13, fh * 0.07, w * 0.13, i % 2 ? c : shade(c, 1.2), 8, 4, { col: (u, v) => (v > 0.6 && v < 0.8 ? shade(c, 0.75) : c) }); } return; }
  // touffe (fougère, basilic, plante de bureau) : feuilles rayonnantes + cœur bosselé
  const fern = d.id === 'fern', bw = w * (fern ? 0.13 : 0.2), n = k.lod ? 5 : fern ? 11 : 9;
  tuft(k, 0, top + fh * 0.2, 0, w * 0.27, fh * 0.22, w * 0.27, shade(c, 0.85), 8, 5);
  for (let i = 0; i < n; i++) { const a = i * 2.4 + rnd() * 0.4, vt = fh * (fern ? 0.5 + 0.35 * rnd() : 0.45 + 0.45 * rnd()), ht = Math.max(w * 0.06, (Rm - w * 0.05 - bw * 0.35) * (0.6 + 0.4 * rnd()) - vt * 0.08); leafTo(a, w * 0.05, top + fh * 0.08, ht, vt, bw, i % 2 ? c : shade(c, 1.18), 0.3); }
});
// Fleurs en pot : tulipes, tournesol, orchidée, bonsaïs
S('flowerpot', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id, y0 = -h / 2;
  if (id === 'bonsai' || id === 'bonsai_juniper') { k.rbox(0, y0 + h * 0.07, 0, w * 0.8, h * 0.14, D * 0.75, 0x37474f, 0.004); k.box(0, y0 + h * 0.14 + 0.0005, 0, w * 0.74, 0.001, D * 0.68, 0x4a3726); k.sweep([[0, y0 + h * 0.14, 0], [-w * 0.08, y0 + h * 0.3, 0], [w * 0.05, y0 + h * 0.45, 0.01], [w * 0.15, y0 + h * 0.55, 0]], (t) => w * 0.05 * (1 - 0.6 * t), 0x5d4037, { nu: 6 }); for (const [x, y, r] of [[-0.18, 0.62, 0.22], [0.12, 0.72, 0.26], [0.3, 0.6, 0.16], [-0.02, 0.85, 0.18]]) tuft(k, x * w, y0 + h * y, 0, w * r, h * 0.1, D * 0.3, id === 'bonsai_juniper' ? shade(c, 0.85) : c, 8, 5); return; }
  const ph = h * 0.26; POT(k, 0, y0 + ph / 2, w * 0.42, ph, d.c2 ?? 0xa1543a); const top = y0 + ph * 0.92;
  if (id === 'sunflower') { k.sweep([[0, top, 0], [0.004, top + (h - ph) * 0.6, 0], [0, h / 2 - w * 0.4, w * 0.05]], 0.004, 0x558b2f, { nu: 5 }); leafAt(k, 0, top + (h - ph) * 0.3, 0, 1, 0.4, 0.2, w * 0.4, w * 0.25, 0x558b2f); leafAt(k, 0, top + (h - ph) * 0.45, 0, -1, 0.3, -0.2, w * 0.4, w * 0.25, 0x689f38); const P = []; for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, r = i % 2 ? w * 0.28 : w * 0.48; P.push([Math.cos(a) * r, Math.sin(a) * r]); } k.setT(mm(TR(0, h / 2 - w * 0.48, w * 0.06), RX(-0.35))).prism(P, 0.004, c, { cs: shade(c, 0.85) }).setT(null); k.setT(mm(TR(0, h / 2 - w * 0.48, w * 0.06 + 0.003), RX(-0.35))).prism(ellip(w * 0.22, w * 0.22, 14), 0.006, 0x4e342e, { bev: 0.002 }).setT(null); return; }
  if (id === 'orchid' || id === 'orchid_white') { for (const sx of [-1, 1]) leafAt(k, 0, top, 0, sx, 0.25, 0.1, w * 0.45, w * 0.22, 0x2e7d32, 0.15); const P = [[0, top, 0], [0, top + (h - ph) * 0.6, 0], [w * 0.15, top + (h - ph) * 0.88, 0], [w * 0.35, top + (h - ph) * 0.78, 0]]; k.sweep(P, 0.0018, 0x6b7a4a, { nu: 4 }); k.tube(-0.004, top + (h - ph) * 0.4, 0, 0.0015, (h - ph) * 0.75, 0x8d6e63, 4); for (let i = 0; i < 4; i++) { const t = 0.35 + i * 0.2, a = Math.PI * 0.5 * t; const x = w * 0.42 * Math.sin(a) * 0.9, y = top + (h - ph) * (0.86 - (i % 2) * 0.06); const PT = []; for (let j = 0; j < 10; j++) { const b = j / 10 * Math.PI * 2, r = w * (j % 2 ? 0.06 : 0.11); PT.push([Math.cos(b) * r, Math.sin(b) * r]); } k.setT(mm(TR(x, y, 0.006), RX(-0.2))).prism(PT, 0.0015, c, { cs: shade(c, 0.9) }).setT(null); k.orb(x, y, 0.009, w * 0.025, w * 0.025, 0.004, 0xffd54f, 5, 3); } return; }
  // tulipes : feuilles longues, tiges, fleurs en coupe
  for (let i = 0; i < 4; i++) { const a = i * 1.6; leafAt(k, Math.cos(a) * w * 0.08, top, Math.sin(a) * w * 0.08, Math.cos(a) * 0.28, 1, Math.sin(a) * 0.28, (h - ph) * 0.5, w * 0.18, 0x558b2f, 0.35); }
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.3, r = i ? w * 0.2 : 0, x = Math.cos(a) * r, z = Math.sin(a) * r, hy = top + (h - ph) * (0.78 + (i % 2) * 0.08); k.sweep([[x * 0.3, top, z * 0.3], [x, hy - 0.02, z]], 0.0022, 0x558b2f, { nu: 4 }); k.lathe([{ r: w * 0.02, y: hy - 0.022 }, { r: w * 0.1, y: hy - 0.012, p: 'a' }, { r: w * 0.11, y: hy + 0.008, p: 'a' }, { r: w * 0.08, y: hy + 0.022, p: 'a' }, { r: w * 0.06, y: hy + 0.018, p: 'i', h: 1 }], 8, { a: { c: i % 2 ? c : shade(c, 1.15) }, i: { c: shade(c, 0.6) } }, {}); void x; }
});
S('cactus', (k, s, c) => { const [w, h] = s, ph = h * 0.3; POT(k, 0, -h / 2 + ph / 2, w * 0.48, ph, 0xa1543a); const top = -h / 2 + ph * 0.92, R = w * 0.26; k.sweep([[0, top, 0], [0, h / 2 - 0.002, 0]], (t) => R * (t > 0.8 ? Math.sqrt(Math.max(0.05, (1 - t) / 0.2)) : 1), c, { nu: 10, cap0: true, col: (u, t) => (Math.abs(((u * 8) % 1) - 0.5) < 0.08 ? shade(c, 0.7) : hn(u * 17, t * 31) > 0.9 ? 0xf5f5e0 : c) }); const y = top + (h / 2 - top) * 0.4; k.sweep([[R * 0.6, y, 0], [w * 0.33, y + 0.004, 0], [w * 0.35, y + h * 0.15, 0]], R * 0.45, c, { nu: 8, cap1: true }); k.orb(0, h / 2 - 0.004, 0, R * 0.35, 0.004, R * 0.35, 0xec407a, 6, 3); });
// Bouquet emballé : cornet de papier, fleurs (roses, lys, champêtre, pivoines, gerberas, œillets), feuillage, ruban
S('bouquet', (k, s, c, d) => {
  const [w, h] = s, y0 = -h / 2, id = d.id, paper = d.c2 ?? 0xf5f0e6, yc = y0 + h * 0.68, Rm = w * 0.47, rc = (y) => w * 0.04 + w * 0.36 * (y - y0) / (yc - y0 - h * 0.04);
  k.lathe([{ r: w * 0.04, y: y0 }, { r: w * 0.4, y: yc - h * 0.04, p: 'a' }, { r: w * 0.48, y: yc, p: 'a' }], 9, { a: { c: paper } }, { bottom: shade(paper, 0.9) }); k.lathe([{ r: w * 0.48 - 0.0012, y: yc }, { r: w * 0.4 - 0.0012, y: yc - h * 0.04, p: 'i' }, { r: w * 0.06, y: y0 + h * 0.08, p: 'i' }], 9, { i: { c: shade(paper, 0.85) } }, { top: shade(paper, 0.7) });
  const ya = y0 + h * 0.2, yb = y0 + h * 0.24; k.lathe([{ r: rc(ya) + 0.0015, y: ya }, { r: rc(yb) + 0.0015, y: yb, p: 'a' }], 9, { a: { c: 0xd32f2f } }); if (!k.lod) for (const sx of [-1, 1]) k.orb(sx * w * 0.05, (ya + yb) / 2, rc(ya) + 0.004, w * 0.055, h * 0.018, 0.004, 0xc62828, 6, 4);
  const n = k.lod ? 4 : id === 'lilies' ? 5 : 7, rnd = mulberry32(id.length * 7), fr = w * 0.13;
  for (let i = 0; i < n; i++) { const a = i * 2.4, r = (i ? 0.1 + (i % 3) * 0.09 : 0) * w, x = Math.cos(a) * r, z = Math.sin(a) * r, y = h / 2 - fr * 1.1 - (i ? h * (0.03 + 0.12 * rnd()) : 0);
    if (id === 'lilies') { for (let p = 0; p < 4; p++) { const b = p / 4 * Math.PI * 2 + i; leafAt(k, x, y, z, Math.cos(b), 0.55, Math.sin(b), fr * 1.3, fr * 0.55, c, 0.3, 2); } k.orb(x, y + 0.004, z, 0.004, 0.006, 0.004, 0xff8f00, 4, 3); continue; }
    if (id === 'gerberas' || id === 'bouquet_field') { const P = []; for (let j = 0; j < 12; j++) { const b = j / 12 * Math.PI * 2, rr = j % 2 ? fr * 0.55 : fr; P.push([Math.cos(b) * rr, Math.sin(b) * rr]); } k.setT(mm(TR(x, y, z), RX(-Math.PI / 2 + 0.3 * Math.cos(a)), RY(a))).prism(P, 0.002, id === 'bouquet_field' ? [c, 0xffffff, 0x9575cd, 0xffeb3b][i % 4] : i % 2 ? c : shade(c, 1.2), { cs: shade(c, 0.85) }).setT(null); k.orb(x, y + 0.002, z, fr * 0.3, 0.003, fr * 0.3, 0x5d4037, 5, 2); continue; }
    k.orb(x, y, z, fr, fr * 0.85, fr, i % 2 ? c : shade(c, 1.15), 7, 5, { f: (u, v, p) => { const sp = 1 + 0.12 * Math.sin(u * Math.PI * 2 * (id === 'carnations' ? 9 : 5) + v * 9); return [p[0] * sp, p[1], p[2] * sp]; }, col: (u, v) => mixc(c, shade(c, 0.6), Math.max(0, Math.sin(u * 31 + v * 20)) * 0.35 * v) });
  }
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4, vt = h * 0.2, ht = Math.max(w * 0.05, Rm - w * 0.15 - w * 0.06 - vt * 0.08); leafAt(k, Math.cos(a) * w * 0.15, yc - h * 0.05, Math.sin(a) * w * 0.15, Math.cos(a) * ht, vt, Math.sin(a) * ht, Math.hypot(ht, vt), w * 0.14, 0x2e7d32, 0.25, 3); }
});
S('pbucket', (k, s, c, d) => { const w = s[0], h = s[1], bh = h * 0.4; OPENCUP(k, w * 0.32, w * 0.4, bh, -h / 2, d.c2 ?? 0x90a4ae, 0x37474f, { t: 0.002, sg: 14 }); const top = -h / 2 + bh; for (let i = 0; i < (k.lod ? 6 : 11); i++) { const a = i * 2.4, r = (i % 3) * w * 0.12, y = h / 2 - h * 0.1 - (i % 2) * 0.03; k.sweep([[Math.cos(a) * r * 0.4, top - 0.02, Math.sin(a) * r * 0.4], [Math.cos(a) * r, y, Math.sin(a) * r]], 0.002, 0x558b2f, { nu: 3 }); k.orb(Math.cos(a) * r, y + w * 0.04, Math.sin(a) * r, w * 0.11, w * 0.09, w * 0.11, i % 3 === 2 ? shade(c, 1.25) : c, 7, 5, { f: (u, v, p) => { const sp = 1 + 0.12 * Math.sin(u * 31 + v * 9); return [p[0] * sp, p[1], p[2] * sp]; } }); } for (let i = 0; i < 5; i++) { const a = i * 1.26; leafAt(k, Math.cos(a) * w * 0.12, top, Math.sin(a) * w * 0.12, Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5, h * 0.3, w * 0.12, 0x2e7d32, 0.3); } });
// Arrosoir : réservoir ovale, bec effilé, pomme, anse
S('watering', (k, s, c) => { const [w, h, D] = s, R = Math.min(h, D) * 0.45, y0 = -h / 2, bx = -w * 0.15; k.setT(TR(bx, 0, 0)).lathe([{ r: R * 0.9, rz: D * 0.42, y: y0 }, { r: R, rz: D * 0.46, y: y0 + 0.005, p: 'a' }, { r: R, rz: D * 0.46, y: y0 + h * 0.62, p: 'a' }, { r: R * 0.6, rz: D * 0.3, y: y0 + h * 0.78, p: 'a', h: 1 }, { r: R * 0.32, rz: D * 0.18, y: y0 + h * 0.8, p: 'a' }], 14, { a: { c } }, { bottom: shade(c, 0.8), top: shade(c, 0.5) }).setT(null); k.sweep([[bx + R * 0.8, y0 + h * 0.2, 0], [w * 0.25, y0 + h * 0.55, 0], [w * 0.4, y0 + h * 0.82, 0]], (t) => 0.012 * (1 - 0.5 * t), c, { nu: 6 }); k.setT(mm(TR(w * 0.415, y0 + h * 0.85, 0), RZ(-0.6))).lathe([{ r: 0.006, y: -0.01 }, { r: 0.016, y: 0.004, p: 'a' }, { r: 0.016, y: 0.008, p: 'a', h: 1 }], 10, { a: { c: shade(c, 1.1) } }, { top: 0x9e9e9e }).setT(null); const P = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI; P.push([bx - Math.cos(a) * R * 0.85, y0 + h * 0.7 + Math.sin(a) * h * 0.24, 0]); } k.sweep(P, 0.006, c, { nu: 5 }); });
// ═════════════════════ APPAREILS PORTATIFS, PETIT ÉLECTROMÉNAGER, LAMPES, HORLOGES ═════════════════════
// Repère posé sur une surface : axe z le long de la normale n, origine en (x, y, z)
const onN = (x, y, z, nx, ny, nz) => { const m = new THREE.Matrix4().lookAt(new THREE.Vector3(nx, ny, nz), new THREE.Vector3(0, 0, 0), Math.abs(ny) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)); m.setPosition(x, y, z); return m; };
const starPts = (r1, r2, n = 5, a0 = Math.PI / 2) => Array.from({ length: n * 2 }, (_, i) => { const a = a0 + i * Math.PI / n, r = i % 2 ? r2 : r1; return [Math.cos(a) * r, Math.sin(a) * r]; });
const crossPts = (r, t) => [[t, r], [-t, r], [-t, t], [-r, t], [-r, -t], [-t, -t], [-t, -r], [t, -r], [t, -t], [r, -t], [r, t], [t, t]];
const lumi = (c) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
// Polyligne lissée (Catmull-Rom) échantillonnée en n points
function spl(P, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1) * (P.length - 1), j = Math.min(P.length - 2, Math.floor(t)), f = t - j, p0 = P[Math.max(0, j - 1)], p1 = P[j], p2 = P[j + 1], p3 = P[Math.min(P.length - 1, j + 2)]; out.push([0, 1, 2].map((q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * f + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * f * f + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * f * f * f))); }
  return out;
}
// Objectif le long de +z depuis z0 : fût, bague (striée si o.knurl), retour intérieur et verre sombre en retrait
function LENS(k, x, y, z0, R, len, c, o = {}) {
  const sg = k.lod ? 6 : o.sg || 12;
  k.setT(mm(TR(x, y, z0), RX(Math.PI / 2))).lathe([{ r: R, y: 0 }, { r: R, y: len * 0.55, p: 'a', h: 1 }, { r: R * 0.92, y: len * 0.6, p: 'b' }, { r: R * 0.92, y: len * 0.9, p: 'b', h: 1 }, { r: R * 0.98, y: len * 0.93, p: 'a' }, { r: R * 0.95, y: len, p: 'a', h: 1 }, { r: R * 0.74, y: len, p: 'i', h: 1 }, { r: R * 0.7, y: len * 0.9, p: 'i' }], sg, { a: { c }, b: { c: o.ring ?? shade(c, 0.6), rect: !k.lod && o.knurl ? ridgeTex(k, 24) : null }, i: { c: 0x101418 } }, { top: o.glass ?? 0x1c2a3a }).setT(null);
}
// Bouton rotatif strié (axe +z, ou +y si o.up)
function KNOB(k, x, y, z, r, h, c, o = {}) {
  k.setT(o.up ? TR(x, y, z) : mm(TR(x, y, z), RX(Math.PI / 2))).lathe([{ r, y: 0 }, { r, y: h * 0.8, p: 'a' }, { r: r * 0.88, y: h, p: 't', h: 1 }], k.lod ? 6 : 12, { a: { c, rect: !k.lod && o.knurl !== false ? ridgeTex(k, 16) : null }, t: { c: shade(c, 1.15) } }, { top: shade(c, 1.15) }).setT(null);
}
// Lampes de poche : culot, corps (moleté s'il est en métal), col évasé, tête, bague, réflecteur et LED
S('flashlight', (k, s, c, d) => {
  const [w, , L0] = s, kind = d.p?.kind || 'basic', key = d.id === 'keychain_torch', metal = d.mat === 'metal', R = w / 2;
  const L = key ? L0 * 0.72 : L0, z0 = L0 / 2 - L, ty = L0 / 2, rb = R * (kind === 'tactical' ? 0.74 : kind === 'cheap' ? 0.8 : 0.76), hl = L * (kind === 'tactical' ? 0.24 : 0.2), nk = L * 0.09;
  k.setT(RX(Math.PI / 2)).lathe([
    { r: rb * 0.86, y: z0 }, { r: rb, y: z0 + L * 0.02, p: 'a' }, { r: rb, y: z0 + L * 0.09, p: 'a', h: 1 },
    { r: rb * 0.96, y: z0 + L * 0.1, p: 'g' }, { r: rb * 0.96, y: z0 + L * 0.52, p: 'g', h: 1 },
    { r: rb, y: z0 + L * 0.53, p: 'a' }, { r: rb, y: ty - hl - nk, p: 'a' }, { r: R, y: ty - hl, p: 'a' }, { r: R, y: ty - 0.003, p: 'a', h: 1 },
    { r: R * 0.97, y: ty, p: 'b', h: 1 }, { r: R * 0.8, y: ty, p: 'b', h: 1 }, { r: R * 0.76, y: ty - 0.002, p: 'b' }
  ], k.lod ? 6 : 14, { a: { c }, g: { c: metal ? shade(c, 1.3) : shade(c, 0.86), rect: !k.lod && metal ? ridgeTex(k, 28) : null }, b: { c: metal ? 0x9ea4a8 : shade(c, 0.7) } }, { bottom: kind === 'tactical' ? 0x2a2a2a : shade(c, 0.75), top: kind === 'uv' ? 0x9575cd : 0xd8dee2 }).setT(null);
  k.tube(0, 0, ty - 0.0016, R * 0.2, 0.0018, kind === 'uv' ? 0x6a1b9a : 0xfff3c4, 8, { m: RX(Math.PI / 2) });
  if (kind === 'tactical') { k.box(rb + 0.0008, 0, z0 + L * 0.32, 0.0016, rb * 0.55, L * 0.32, 0x101010); if (!k.lod) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.box(Math.cos(a) * R * 0.87, Math.sin(a) * R * 0.87, ty - 0.0012, R * 0.2, R * 0.2, 0.0024, 0x1a1a1a); } }
  else k.orb(0, rb * 0.96, z0 + L * 0.62, rb * 0.34, 0.0026, rb * 0.48, kind === 'cheap' ? 0x212121 : 0x37474f, 6, 4);
  if (key) { const rr = (L0 - L) * 0.42, zc = -L0 / 2 + rr + 0.001, P = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2; P.push([Math.sin(a) * rr, 0, zc + Math.cos(a) * rr]); } k.sweep(P, 0.0008, 0xc0c4c8, { nu: 4 }); }
  k.meta.lens = [0, 0, ty];
});
// Lampe frontale : bandeau élastique plat, boîtier orientable à lentille, bouton, pile à l'arrière
S('headlamp', (k, s, c) => {
  const [w, h, D] = s, rx = w * 0.44, rz = D * 0.34, hb = h * 0.24, P = [];
  for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; P.push([Math.sin(a) * rx, -h * 0.04, Math.cos(a) * rz]); }
  k.sweep(P, 0.0016, 0x263238, { nu: 6, rz: hb / 0.0016 });
  const zf = rz + 0.0015; k.rbox(0, 0, zf + 0.0105, 0.058, 0.04, 0.021, c, 0.007);
  k.setT(TR(0, 0.001, zf + 0.0215)).prism(ellip(0.0125, 0.0125, k.lod ? 8 : 14), 0.0025, 0xe8eef0, { cs: 0x9e9e9e }).setT(null);
  k.tube(0, 0.001, zf + 0.0232, 0.003, 0.0008, 0xfff3c4, 8, { m: RX(Math.PI / 2) });
  k.pbox(0, 0.0212, zf + 0.012, 0.016, 0.0045, 0.008, 0x212121, {}, {}, 'y'); deco(k, 0.021, -0.012, zf + 0.021, 0.004, 0.004, 0.0015, 0xd50000);
  for (const sx of [-1, 1]) k.tube(sx * 0.0305, 0, zf + 0.008, 0.005, 0.004, 0x212121, 8, { m: RZ(Math.PI / 2) });
  k.rbox(0, 0, -rz - 0.0085, 0.05, 0.034, 0.014, c, 0.005);
});
// Piles AA (deux éléments) ; fusible à cartouche céramique
S('battery', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, sg = k.lod ? 6 : 12;
  if (d.id === 'fuse') { const R = Math.min(w, D) / 2 - 0.0005, fc = 0xb8bcc0; k.lathe([{ r: R * 0.9, y: y0 }, { r: R, y: y0 + 0.001, p: 'm' }, { r: R, y: y0 + h * 0.2, p: 'm', h: 1 }, { r: R * 0.9, y: y0 + h * 0.2, p: 'm', h: 1 }, { r: R * 0.9, y: y0 + h * 0.8, p: 'c' }, { r: R, y: y0 + h * 0.8, p: 'm', h: 1 }, { r: R, y: h / 2 - 0.001, p: 'm' }, { r: R * 0.9, y: h / 2, p: 'm' }], sg, { m: { c: fc }, c: { c } }, { bottom: fc, top: fc }); if (!k.lod) k.lathe([{ r: R * 0.905, y: -h * 0.06 }, { r: R * 0.905, y: h * 0.06, p: 'b' }], sg, { b: { c: 0x9e9e9e } }); return; }
  const r = Math.min(D / 2, w / 4) - 0.0003;
  for (const sx of [-1, 1]) k.setT(TR(sx * w / 4, 0, 0)).lathe([{ r: r * 0.5, y: y0 }, { r: r * 0.86, y: y0 + 0.0006, p: 's' }, { r, y: y0 + 0.0015, p: 's', h: 1 }, { r, y: y0 + h * 0.64, p: 'a' }, { r, y: h / 2 - 0.0028, p: 'k', h: 1 }, { r: r * 0.9, y: h / 2 - 0.0018, p: 's', h: 1 }, { r: r * 0.36, y: h / 2 - 0.0016, p: 's', h: 1 }, { r: r * 0.34, y: h / 2, p: 's' }], sg, { s: { c: 0xc8ccd0 }, a: { c }, k: { c: 0x1e1e1e } }, { bottom: 0xb0b4b8, top: 0xc8ccd0 }).setT(null);
});
// Ampoule à vis (culot fileté, isolant noir, verre dépoli en poire) ; clochette d'oiseau
S('bulb', (k, s, c, d) => {
  const [w, h] = s, y0 = -h / 2, sg = k.lod ? 6 : 14;
  if (d.id === 'bird_toy') {
    const R = w * 0.46; k.lathe([{ r: R * 0.93, y: y0 + h * 0.185 }, { r: R, y: y0 + h * 0.18, p: 'a', h: 1 }, { r: R * 0.96, y: y0 + h * 0.22, p: 'a' }, { r: R * 0.74, y: y0 + h * 0.32, p: 'a' }, { r: R * 0.62, y: y0 + h * 0.5, p: 'a' }, { r: R * 0.55, y: y0 + h * 0.66, p: 'a' }, { r: R * 0.36, y: y0 + h * 0.76, p: 'a' }, { r: R * 0.1, y: y0 + h * 0.79, p: 'a' }, { r: 0.001, y: y0 + h * 0.795, p: 'a', h: 1 }, { r: R * 0.3, y: y0 + h * 0.72, p: 'i' }, { r: R * 0.5, y: y0 + h * 0.62, p: 'i' }, { r: R * 0.56, y: y0 + h * 0.48, p: 'i' }, { r: R * 0.68, y: y0 + h * 0.31, p: 'i' }, { r: R * 0.9, y: y0 + h * 0.21, p: 'i' }, { r: R * 0.93, y: y0 + h * 0.185, p: 'i' }], sg, { a: { c }, i: { c: shade(c, 0.6) } }, {});
    k.orb(0, y0 + h * 0.09, 0, R * 0.22, R * 0.22, R * 0.22, shade(c, 0.85), 6, 4); k.tube(0, y0 + h * 0.15, 0, 0.0012, h * 0.12, 0x9e9e9e, 4, { open: true });
    const L = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2; L.push([Math.sin(a) * h * 0.08, y0 + h * 0.88 + Math.cos(a) * h * 0.08, 0]); } k.sweep(L, 0.0012, 0xb0b0b0, { nu: 4 });
    return;
  }
  const R = w / 2, Y = (t) => y0 + t * h / 0.1, rings = [{ r: R * 0.12, y: Y(0) }, { r: R * 0.14, y: Y(0.0015), p: 'm', h: 1 }, { r: R * 0.28, y: Y(0.003), p: 'i' }, { r: R * 0.32, y: Y(0.007), p: 'i', h: 1 }];
  for (let i = 0; i < (k.lod ? 2 : 6); i++) rings.push({ r: R * (i % 2 ? 0.4 : 0.43), y: Y(0.008 + (k.lod ? 0.009 : 0.0035) * (i + 1)), p: 's' });
  rings.push({ r: R * 0.43, y: Y(0.029), p: 's', h: 1 });
  for (const [t, rr] of [[0.031, 0.41], [0.042, 0.52], [0.055, 0.78], [0.066, 0.95], [0.075, 1], [0.083, 0.95], [0.09, 0.8], [0.096, 0.55], [0.0995, 0.2]]) rings.push({ r: R * rr, y: Y(t), p: 'g' });
  k.lathe(rings, sg, { m: { c: 0x8d8d8d }, i: { c: 0x1a1a1a }, s: { c: 0xc4c8cc }, g: { c } }, { bottom: 0x8d8d8d, top: c });
});
// Détecteur de mouvement : boîtier arrondi, dôme à facettes de Fresnel, voyant
S('sensor', (k, s, c) => {
  const [w, h, D] = s; k.rbox(0, 0, -D * 0.12, w, h, D * 0.76, c, 0.008);
  k.orb(0, -h * 0.14, D * 0.26, w * 0.3, w * 0.3, D * 0.24, 0xf4f4f0, k.lod ? 6 : 10, k.lod ? 4 : 6, { col: (u) => (Math.floor(u * 10) % 2 ? 0xf4f4f0 : 0xe2e2dc) });
  deco(k, w * 0.3, h * 0.36, D * 0.26 + 0.0005, 0.005, 0.005, 0.001, 0xd50000); deco(k, -w * 0.18, h * 0.38, D * 0.26 + 0.0005, w * 0.3, 0.003, 0.001, shade(c, 0.75));
});
// Appareils photo et caméras
S('camera', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id;
  if (id === 'webcam') { // capsule sur pince
    const cy = h * 0.12; k.orb(0, cy, 0, w / 2, h * 0.36, D * 0.36, c, k.lod ? 8 : 14, k.lod ? 5 : 8, { e: [0.7, 0.6] });
    LENS(k, 0, cy, D * 0.3, h * 0.17, D * 0.17, 0x101010, { ring: 0x2a2a2a, sg: 10 }); deco(k, w * 0.3, cy + h * 0.1, D * 0.355, 0.003, 0.003, 0.001, 0x00e676);
    k.rbox(0, -h * 0.3, -D * 0.05, w * 0.36, h * 0.1, D * 0.62, 0x1a1a1a, 0.004); k.rbox(0, -h * 0.4, -D * 0.33, w * 0.36, h * 0.2, D * 0.08, 0x1a1a1a, 0.003);
    k.meta.lens = [0, cy, D / 2]; return;
  }
  if (id === 'polaroid') { // instantané : corps arrondi, gros objectif, capot du flash, viseur, arc-en-ciel, fente à photo
    k.rbox(0, -h * 0.06, -D * 0.06, w, h * 0.88, D * 0.88, c, 0.014); k.rbox(0, h * 0.4, -D * 0.12, w * 0.92, h * 0.2, D * 0.62, shade(c, 0.94), 0.008);
    deco(k, w * 0.12, h * 0.42, D * 0.19 + 0.0005, w * 0.42, h * 0.11, 0.001, 0xe4e4e4); deco(k, -w * 0.3, h * 0.42, D * 0.19 + 0.0005, w * 0.12, h * 0.1, 0.001, 0x101418);
    LENS(k, 0, -h * 0.04, D * 0.38, h * 0.26, D * 0.12, 0x1a1a1a, { ring: 0x2c2c2c, knurl: true, sg: 16 });
    if (!k.lod) for (let i = 0; i < 5; i++) deco(k, -0.006 + i * 0.003, -h * 0.37, D * 0.38 + 0.0005, 0.003, h * 0.13, 0.001, [0xe53935, 0xff9800, 0xfdd835, 0x43a047, 0x1e88e5][i]);
    k.box(0, -h * 0.47, D * 0.38, w * 0.62, 0.0025, 0.002, 0x101010); k.rbox(w * 0.36, h * 0.12, D * 0.38, w * 0.1, w * 0.1, 0.008, 0xd32f2f, 0.0025);
    k.meta.lens = [0, -h * 0.04, D / 2]; return;
  }
  if (id === 'disposable_cam') { // jetable : boîtier noir habillé de carton imprimé, flash, viseur, molette d'avance
    k.rbox(0, -h * 0.05, 0, w, h * 0.9, D * 0.9, 0x1a1a1a, 0.004);
    k.pbox(0, -h * 0.07, D * 0.45 + 0.0004, w * 0.98, h * 0.72, 0.0008, 0xffffff, { Z: k.pk(d, 'box', w, h * 0.72, { brand: 'FLASH', name: '27 poses', bg: c }) }, {}, 'zy');
    LENS(k, w * 0.08, -h * 0.06, D * 0.45, h * 0.15, D * 0.05, 0x101010, { ring: 0x222222, sg: 10 });
    deco(k, -w * 0.3, h * 0.2, D * 0.45 + 0.001, w * 0.22, h * 0.2, 0.001, 0xe8e8e8); deco(k, w * 0.32, h * 0.22, D * 0.45 + 0.001, w * 0.1, h * 0.12, 0.001, 0x20262c);
    k.tube(w * 0.34, h * 0.4 + 0.002, -D * 0.25, 0.007, 0.006, 0x333333, 10); k.pbox(-w * 0.3, h * 0.4 + 0.0012, 0, w * 0.12, 0.003, D * 0.3, 0x333333, {}, {}, 'y');
    k.meta.lens = [w * 0.08, -h * 0.06, D / 2]; return;
  }
  if (id === 'camera_compact') { // compact : boîtier fin, objectif à bague, flash, déclencheur et molette
    k.rbox(0, -h * 0.04, -D * 0.2, w, h * 0.92, D * 0.6, c, 0.008);
    LENS(k, w * 0.12, -h * 0.04, D * 0.1, h * 0.32, D * 0.2, 0x2a2e33, { ring: 0x9ea4a8, sg: 10 });
    deco(k, -w * 0.3, h * 0.26, D * 0.1 + 0.0005, w * 0.14, h * 0.16, 0.001, 0xf0f0f0); deco(k, -w * 0.12, h * 0.3, D * 0.1 + 0.0005, 0.004, 0.004, 0.001, 0xff6d00);
    k.tube(w * 0.3, h * 0.42 + 0.0015, -D * 0.2, 0.0045, 0.003, 0xb0b4b8, 10); k.tube(w * 0.08, h * 0.42 + 0.0012, -D * 0.25, 0.006, 0.0024, 0x2a2a2a, 10);
    k.meta.lens = [w * 0.12, -h * 0.04, D * 0.3]; return;
  }
  // caméra de surveillance posable : socle, rotule, corps à visière, objectif, couronne de LED infrarouges, voyant
  const by = -h / 2, bh = 0.008, cy = h * 0.12, bl = D * 0.78;
  k.lathe([{ r: w * 0.34, y: by }, { r: w * 0.34, y: by + bh * 0.7, p: 'a' }, { r: w * 0.28, y: by + bh, p: 'a' }], k.lod ? 8 : 16, { a: { c: shade(c, 0.85) } }, { bottom: 0x111111, top: shade(c, 0.85) });
  k.tube(0, by + bh + h * 0.12, -D * 0.05, 0.006, h * 0.24, 0x3a3a3a, 8); k.orb(0, by + bh + h * 0.26, -D * 0.05, 0.009, 0.009, 0.009, 0x3a3a3a, 6, 4);
  k.rbox(0, cy, -D * 0.04, w * 0.62, h * 0.52, bl, c, 0.012); k.rbox(0, cy + h * 0.27, D * 0.02, w * 0.74, 0.004, bl, shade(c, 1.2), 0.0015);
  LENS(k, 0, cy, D * 0.35, h * 0.17, D * 0.14, 0x101010, { ring: 0x222222 });
  if (!k.lod) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; deco(k, Math.cos(a) * h * 0.21, cy + Math.sin(a) * h * 0.21, D * 0.35 + 0.0005, 0.004, 0.004, 0.001, 0x3b0d0d); }
  deco(k, w * 0.22, cy + h * 0.18, D * 0.35 + 0.0005, 0.003, 0.003, 0.001, 0xff1744);
  k.meta.lens = [0, cy, D / 2];
});
// Talkie-walkie : boîtier, grille de haut-parleur, écran, touches, antenne caoutchouc, molette, pince de ceinture
S('walkie', (k, s, c) => {
  const [w, h, D] = s, by = -h * 0.12, bh = h * 0.76, top = by + bh / 2, zf = D * 0.5 - 0.0005;
  k.rbox(0, by, D * 0.08 - 0.0005, w, bh, D * 0.84 - 0.001, c, 0.006);
  k.pbox(0, by + bh * 0.22, zf, w * 0.78, bh * 0.36, 0.0008, 0x222222, { Z: k.shared('grille:holes', 48, 64, { kind: 'grille', holes: true, bg: 0x2a2a2a, n: 7 }) }, {}, 'zy');
  k.pbox(0, by - bh * 0.06, zf, w * 0.6, bh * 0.14, 0.0008, 0x2f3d2f, { Z: k.shared('screen:lcd', 48, 20, { kind: 'screen', mode: 'lcd' }) }, {}, 'zy');
  for (let i = 0; i < 3; i++) k.pbox((i - 1) * w * 0.26, by - bh * 0.28, zf - 0.0004, w * 0.18, bh * 0.07, 0.0016, 0x3a3a3a, {}, {}, 'z');
  k.sweep([[-w * 0.24, top - 0.002, D * 0.05], [-w * 0.24, h / 2 - 0.004, D * 0.05]], (t) => 0.0045 - 0.0012 * t, 0x1a1a1a, { nu: 8, cap1: true });
  KNOB(k, w * 0.18, top, D * 0.05, 0.0055, 0.009, 0x2a2a2a, { up: true });
  k.pbox(-w / 2 + 0.0008, by + bh * 0.12, D * 0.05, 0.0016, bh * 0.25, D * 0.4, 0x333333, {}, {}, 'X');
  k.rbox(0, by + bh * 0.05, -D * 0.42, w * 0.4, bh * 0.45, D * 0.14, 0x1a1a1a, 0.0015);
});
// Téléphones : à touches (petit écran, pavé), ordiphone (dalle, écran verrouillé, bloc photo), jouet à tirer
S('phone', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id;
  if (id === 'toy_phone') {
    const y0 = -h / 2, bh = h * 0.5, by = y0 + h * 0.08 + bh / 2, dy = by + bh / 2, dz = D * 0.2;
    k.rbox(0, by, 0, w * 0.86, bh, D * 0.88, c, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.tube(sx * w * 0.4, y0 + h * 0.09, sz * D * 0.3, h * 0.09, w * 0.06, 0x212121, 10, { m: RZ(Math.PI / 2), tc: 0xfdd835, bc: 0xfdd835 });
    k.setT(TR(0, dy + 0.002, dz)).lathe([{ r: w * 0.18, y: -0.003 }, { r: w * 0.18, y: 0.003, p: 'a' }, { r: w * 0.06, y: 0.004, p: 'b', h: 1 }], k.lod ? 8 : 16, { a: { c: 0xfdd835 }, b: { c: 0xfafafa } }, { top: 0xfafafa }).setT(null);
    if (!k.lod) for (let i = 0; i < 10; i++) { const a = -0.6 + i / 10 * Math.PI * 1.7, x = Math.cos(a) * w * 0.125, z = dz + Math.sin(a) * w * 0.125, e = 0.0035, y = dy + 0.0052; k.quad([x - e, y, z + e], [x + e, y, z + e], [x + e, y, z - e], [x - e, y, z - e], 0xc49000); }
    const hy = dy + 0.012, hz = -D * 0.25; k.sweep([[-w * 0.36, hy, hz], [-w * 0.2, hy + 0.012, hz], [w * 0.2, hy + 0.012, hz], [w * 0.36, hy, hz]], 0.008, 0xd32f2f, { nu: 8 });
    for (const sx of [-1, 1]) k.orb(sx * w * 0.36, hy - 0.002, hz, 0.016, 0.01, 0.018, 0xd32f2f, 8, 5);
    for (const sx of [-1, 1]) { k.orb(sx * w * 0.15, by + bh * 0.1, D * 0.435, 0.012, 0.014, 0.005, 0xffffff, 8, 5); k.orb(sx * w * 0.15, by + bh * 0.06, D * 0.475, 0.006, 0.007, 0.002, 0x111111, 6, 4); }
    return;
  }
  if (id === 'smartphone') {
    const t = D * 0.7, scr = k.pk(d, 'screen', w, h, { mode: 'lock', bezel: 0.04, bezelY: 0.025, cam: true });
    k.prism(rrect(w - 0.001, h, 0.009, k.lod ? 2 : 4), t, c, { bev: 0.0012, smooth: true, F: scr });
    k.rbox(-w * 0.24, h * 0.36, -t / 2 - 0.0005, w * 0.36, w * 0.36, 0.0012, shade(c, 0.8), 0.0004); for (const [x, y] of [[-0.28, 0.4], [-0.2, 0.32]]) k.tube(x * w, y * h, -t / 2 - 0.0012, 0.0045, 0.0006, 0x0a0e12, 8, { m: RX(Math.PI / 2) });
    for (const [y, l] of [[h * 0.2, 0.018], [h * 0.06, 0.01]]) k.box(w / 2 - 0.0005, y, 0, 0.0008, l, t * 0.4, shade(c, 1.2));
    k.meta.screen = { x: 0, y: 0, z: t / 2, w: w * 0.92, h: h * 0.95 }; return;
  }
  const t = D * 0.85, sh = h * 0.32, sy = h * 0.2; if (k.lod) k.pbox(0, 0, 0, w, h, t, c); else k.prism(rrect(w, h, 0.011, 3), t, c, { bev: 0.0025, smooth: true });
  k.pbox(0, sy, t / 2 + 0.0002, w * 0.74, sh, 0.0006, 0x0a0a0a, { Z: k.pk(d, 'screen', w * 0.74, sh, { mode: 'lcd', bezel: 0.06, frame: 0x1a1a1a }) }, {}, 'zy');
  k.pbox(0, -h * 0.24, t / 2 + 0.0002, w * 0.78, h * 0.42, 0.0006, c, { Z: k.pk(d, 'keys', w * 0.78, h * 0.42, { bg: shade(c, 1.6), pad: 'phone' }) }, {}, 'zy');
  deco(k, 0, h * 0.42, t / 2 + 0.0003, w * 0.24, 0.0018, 0.0006, 0x050505);
  k.meta.screen = { x: 0, y: sy, z: t / 2 + 0.0005, w: w * 0.66, h: sh * 0.88 };
});
// Tablette durcie : dalle arrondie, écran éteint à reflet, coins en caoutchouc, capteur photo
S('tablet', (k, s, c, d) => {
  const [w, h, D] = s, t = D * 0.7, scr = k.pk(d, 'screen', w, h, { mode: 'off', bezel: 0.045, bezelY: 0.065, cam: true });
  k.prism(rrect(w * 0.97, h * 0.96, 0.011, k.lod ? 2 : 4), t, c, { bev: 0.0015, smooth: true, F: scr });
  if (!k.lod) for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.setT(TR(sx * (w / 2 - 0.013), sy * (h / 2 - 0.013), 0)).prism(rrect(0.026, 0.026, 0.01, 2), D * 0.98, 0x212121, { bev: 0.002, smooth: true }).setT(null);
  k.rbox(-w * 0.4, h * 0.36, -t / 2 - 0.0004, 0.012, 0.012, 0.001, 0x111111, 0.0003);
  k.meta.screen = { x: 0, y: 0, z: t / 2 + 0.0002, w: w * 0.88, h: h * 0.83 };
});
// Manette : coque à poignées, croix, quatre boutons de couleur, deux sticks, gâchettes
S('controller', (k, s, c, d) => {
  const [w, h, D] = s, th = h * 0.55, yb = -h * 0.05, top = yb + th / 2, half = [[0, -0.36], [0.2, -0.38], [0.38, -0.4], [0.47, -0.36], [0.5, -0.2], [0.49, 0.05], [0.47, 0.3], [0.42, 0.46], [0.34, 0.5], [0.27, 0.44], [0.2, 0.26], [0.12, 0.2], [0, 0.19]];
  const out = [...half.map(([x, z]) => [x * w, -z * D]), ...half.slice(1, -1).reverse().map(([x, z]) => [-x * w, -z * D])];
  k.setT(mm(TR(0, yb, 0), RX(-Math.PI / 2))).prism(out, th, c, { bev: Math.min(0.006, th * 0.4), smooth: true }).setT(null);
  for (const sx of [-1, 1]) k.orb(sx * w * 0.36, -h * 0.2, D * 0.3, w * 0.12, h * 0.3, D * 0.2, c, 8, 5);
  k.setT(mm(TR(-w * 0.27, top + 0.0013, -D * 0.06), RX(-Math.PI / 2))).prism(crossPts(0.0085, 0.003), 0.003, 0x2a2a2a, { back: false }).setT(null);
  for (const [dx, dz, bc] of [[0, -1, 0x43a047], [1, 0, 0xe53935], [-1, 0, 0x1e88e5], [0, 1, 0xfdd835]]) k.tube(w * 0.27 + dx * 0.0085, top + 0.0012, -D * 0.06 + dz * 0.0085, 0.0042, 0.0026, bc, 7);
  for (const sx of [-1, 1]) { const x = sx * w * 0.13, z = D * 0.12; k.tube(x, top + 0.0008, z, 0.0105, 0.0018, 0x1a1a1a, 10, { bc: null }); k.setT(TR(x, 0, z)).lathe([{ r: 0.004, y: top + 0.0015 }, { r: 0.009, y: top + 0.0068, p: 'a' }, { r: 0.008, y: top + 0.0088, p: 'a', h: 1 }, { r: 0.006, y: top + 0.008, p: 't' }], k.lod ? 6 : 10, { a: { c: 0x2a2a2a }, t: { c: 0x3a3a3a } }, { top: 0x3a3a3a }).setT(null); }
  for (const sx of [-1, 1]) k.pbox(sx * w * 0.07, top + 0.0008, -D * 0.14, 0.007, 0.002, 0.0035, 0x555555, {}, {}, 'y');
  k.tube(0, top + 0.0008, -D * 0.02, 0.005, 0.0018, d.id === 'controller_wireless' ? 0x1e88e5 : 0x424242, 10);
  for (const sx of [-1, 1]) { k.pbox(sx * w * 0.33, yb + th * 0.25, -D * 0.43, w * 0.22, th * 0.45, D * 0.1, shade(c, 0.85), {}, {}, 'Z'); k.pbox(sx * w * 0.33, yb - th * 0.25, -D * 0.41, w * 0.18, th * 0.4, D * 0.1, shade(c, 0.7), {}, {}, 'y'); }
});
// Console portable : coque à grand arrondi en bas à droite, écran LCD vert encadré, croix, A/B, start/select, haut-parleur
S('handheld', (k, s, c, d) => {
  const [w, h, D] = s, r1 = 0.006, r2 = w * 0.28, n = k.lod ? 2 : 4, P = [];
  for (const [cx, cy, r, a0, m] of [[w / 2 - r1, h / 2 - r1, r1, 0, n], [-w / 2 + r1, h / 2 - r1, r1, Math.PI / 2, n], [-w / 2 + r1, -h / 2 + r1, r1, Math.PI, n], [w / 2 - r2, -h / 2 + r2, r2, Math.PI * 1.5, n * 2]]) for (let i = 0; i <= m; i++) { const a = a0 + i / m * Math.PI / 2; P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  const t = D * 0.86, zf = -D * 0.07 + t / 2, sy = h * 0.2, sw = w * 0.8, sh = h * 0.4;
  k.setT(TR(0, 0, -D * 0.07)).prism(P, t, c, { bev: 0.002, smooth: true }).setT(null);
  k.pbox(0, sy, zf + 0.0003, sw, sh, 0.0008, 0x4a4f5a, { Z: k.pk(d, 'screen', sw, sh, { mode: 'lcd', bezel: 0.17, bezelY: 0.12, frame: 0x50555f, led: true }) }, {}, 'zy');
  k.setT(TR(-w * 0.24, -h * 0.14, zf + 0.0015)).prism(crossPts(0.0105, 0.0035), 0.003, 0x1e1e1e, { bev: 0.0006 }).setT(null);
  for (const [x, y] of [[w * 0.33, -h * 0.1], [w * 0.15, -h * 0.15]]) k.setT(mm(TR(x, y, zf), RX(Math.PI / 2))).lathe([{ r: 0.0058, y: 0 }, { r: 0.0058, y: 0.0016, p: 'a' }, { r: 0.0046, y: 0.0026, p: 'a' }], k.lod ? 6 : 10, { a: { c: 0x8e2a6b } }, { top: 0x8e2a6b }).setT(null);
  for (const sx of [-1, 1]) k.setT(mm(TR(sx * w * 0.09, -h * 0.31, zf + 0.0006), RZ(0.45))).rbox(0, 0, 0, 0.012, 0.0035, 0.0016, 0x6b6b6b, 0.0007).setT(null);
  if (!k.lod) for (let i = 0; i < 6; i++) k.setT(mm(TR(w * 0.12 + i * 0.0045, -h * 0.34 + i * 0.0018, zf + 0.0002), RZ(0.45))).box(0, 0, 0, 0.0016, 0.014, 0.0006, 0x55585e).setT(null);
  k.meta.screen = { x: 0, y: sy, z: zf + 0.001, w: sw * 0.66, h: sh * 0.76 };
});
// Cartouches de jeu ; chariot de supermarché (panier en fil, châssis, poignée, siège enfant, roulettes)
S('cart', (k, s, c, d) => {
  if (d.id === 'shopping_cart') {
    const [w, h, L] = s, y0 = -h / 2, wire = (a, b, r = 0.0026, col = 0xc8ccd0) => k.sweep([a, b], r, col, { nu: 3 }), lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
    const yt = 0.38 * h, yb = -0.02 * h, T = [[0.28 * w / 0.6, yt, -0.36 * L / 0.9], [0.26 * w / 0.6, yt, 0.43 * L / 0.9]], B = [[0.24 * w / 0.6, yb, -0.3 * L / 0.9], [0.2 * w / 0.6, yb, 0.36 * L / 0.9]];
    const tp = (sx, i) => [sx * T[i][0], T[i][1], T[i][2]], bt = (sx, i) => [sx * B[i][0], B[i][1], B[i][2]], rim = (a, b) => k.sweep([a, b], 0.006, 0xc8ccd0, { nu: 4 });
    for (const [a, b] of [[tp(1, 0), tp(1, 1)], [tp(-1, 0), tp(-1, 1)], [tp(1, 1), tp(-1, 1)], [tp(1, 0), tp(-1, 0)], [bt(1, 0), bt(1, 1)], [bt(-1, 0), bt(-1, 1)], [bt(1, 1), bt(-1, 1)], [bt(1, 0), bt(-1, 0)]]) rim(a, b);
    const nv = k.lod ? 4 : 9;
    for (const sx of [-1, 1]) { for (let i = 1; i < nv; i++) { const t = i / nv; wire(lerp(bt(sx, 0), bt(sx, 1), t), lerp(tp(sx, 0), tp(sx, 1), t)); } for (const f of [0.34, 0.67]) wire(lerp(bt(sx, 0), tp(sx, 0), f), lerp(bt(sx, 1), tp(sx, 1), f)); }
    for (let i = 1; i < 7; i++) { const t = i / 7; wire(lerp(bt(-1, 1), bt(1, 1), t), lerp(tp(-1, 1), tp(1, 1), t)); wire(lerp(bt(-1, 0), bt(1, 0), t), lerp(tp(-1, 0), tp(1, 0), t)); }
    wire(lerp(bt(-1, 1), tp(-1, 1), 0.5), lerp(bt(1, 1), tp(1, 1), 0.5)); wire(lerp(bt(-1, 0), tp(-1, 0), 0.5), lerp(bt(1, 0), tp(1, 0), 0.5));
    for (let i = 1; i < 6; i++) { const t = i / 6; wire(lerp(bt(-1, 0), bt(1, 0), t), lerp(bt(-1, 1), bt(1, 1), t)); } for (const f of [0.33, 0.66]) wire(lerp(bt(-1, 0), bt(-1, 1), f), lerp(bt(1, 0), bt(1, 1), f));
    // châssis tubulaire, montants de poignée, poignée rouge, siège enfant, plateau inférieur
    const hz = -0.43 * L / 0.9, hy = 0.44 * h, ch = 0xb8bcc0;
    for (const sx of [-1, 1]) { k.sweep([[sx * 0.27 * w / 0.6, hy, hz], [sx * 0.275 * w / 0.6, yt, -0.38 * L / 0.9], [sx * 0.25 * w / 0.6, -0.42 * h, -0.37 * L / 0.9], [sx * 0.17 * w / 0.6, -0.44 * h, 0.4 * L / 0.9]], 0.011, ch, { nu: 6 }); k.sweep([[sx * 0.18 * w / 0.6, -0.43 * h, 0.37 * L / 0.9], [sx * B[1][0], yb, B[1][2]]], 0.007, ch, { nu: 5 }); }
    k.tube(0, hy, hz, 0.0135, w * 0.95, ch, k.lod ? 6 : 10, { m: RZ(Math.PI / 2) }); k.tube(0, hy, hz, 0.0165, w * 0.62, 0xd32f2f, k.lod ? 6 : 12, { m: RZ(Math.PI / 2) });
    k.setT(mm(TR(0, 0.3 * h, -0.31 * L / 0.9), RX(-0.3))).rbox(0, 0, 0, w * 0.62, 0.13 * h, 0.012, 0xd32f2f, 0.004).setT(null);
    for (let i = 0; i < 5; i++) wire([(-0.12 + i * 0.06) * w / 0.6, -0.38 * h, -0.3 * L / 0.9], [(-0.1 + i * 0.05) * w / 0.6, -0.38 * h, 0.34 * L / 0.9], 0.003);
    for (const z of [-0.28, 0.32]) wire([-0.16 * w / 0.6, -0.38 * h, z * L / 0.9], [0.16 * w / 0.6, -0.38 * h, z * L / 0.9], 0.004);
    // roulettes : chape et roue à moyeu clair
    for (const [x, z] of [[-0.24, -0.36], [0.24, -0.36], [-0.17, 0.39], [0.17, 0.39]]) { const X = x * w / 0.6, Z = z * L / 0.9; k.pbox(X, y0 + 0.075, Z, 0.022, 0.035, 0.03, 0x9e9e9e); k.tube(X, y0 + 0.045, Z, 0.045, 0.026, 0x2a2a2a, k.lod ? 6 : 12, { m: RZ(Math.PI / 2), tc: 0xbdbdbd, bc: 0xbdbdbd }); }
    return;
  }
  // cartouche : coque grise à encoche, stries de préhension, étiquette en creux, contacts dorés
  const [w, h, D] = s, ch = 0.008, P = [[w / 2, h / 2 - ch], [w / 2 - ch, h / 2], [-w / 2 + 0.002, h / 2], [-w / 2, h / 2 - 0.002], [-w / 2, -h / 2 + 0.002], [-w / 2 + 0.002, -h / 2], [w / 2 - 0.002, -h / 2], [w / 2, -h / 2 + 0.002]];
  k.prism(P, D * 0.9, 0x9e9e9e, { bev: 0.0008 });
  const zf = D * 0.45, r = k.label(d.id, d.name.replace(/Cartouche «\s*|\s*»/g, ''), c);
  k.pbox(0, -h * 0.06, zf + 0.0002, w * 0.8, h * 0.58, 0.0005, 0xffffff, { Z: r }, {}, 'zy');
  if (!k.lod) for (let i = 0; i < 4; i++) k.box(0, h * 0.33 + i * 0.0025, zf + 0.0002, w * 0.56, 0.0009, 0.0006, 0x8a8a8a);
  k.box(0, -h / 2 + 0.004, -zf - 0.0002, w * 0.78, 0.006, 0.0005, 0xd4af37);
});
// Casque de réalité virtuelle : visière arrondie, mousse faciale, sangle, molette, capteurs
S('vr', (k, s, c) => {
  const [w, h, D] = s, vz = D * 0.16, vd = D * 0.3;
  k.orb(0, 0, vz, w * 0.45, h * 0.46, vd, c, k.lod ? 8 : 16, k.lod ? 5 : 8, { e: [0.4, 0.35] });
  const F = rrect(w * 0.78, h * 0.72, h * 0.25, k.lod ? 2 : 3).map(([x, y]) => [x, y, vz - vd * 0.85]); F.push(F[0]); k.sweep(F, 0.007, 0x37474f, { nu: 5 });
  const P = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; P.push([Math.cos(a) * w * 0.44, 0, vz - vd * 0.7 - Math.sin(a) * (D * 0.5 + vz - vd * 0.7 - 0.006)]); }
  k.sweep(P, 0.0022, 0x455a64, { nu: 6, rz: h * 0.17 / 0.0022 }); k.tube(0, 0, -D / 2 + 0.008, 0.012, 0.012, 0x37474f, 10, { m: RX(Math.PI / 2) });
  if (!k.lod) for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) deco(k, x * w * 0.34, y * h * 0.28, vz + vd * 0.95, 0.006, 0.006, 0.0015, 0x263238);
});
// Casques audio : coques (coussin, coque, plaque), arceau plat rembourré, micro sur perche ; anti-bruit jaune
S('headset', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id, muff = id === 'ear_muffs', office = id === 'headset_office';
  const cr = muff ? h * 0.27 : office ? h * 0.19 : h * 0.24, crz = Math.min(D * 0.46, cr * 0.84), cd = muff ? w * 0.22 : office ? w * 0.13 : w * 0.18;
  const cx = w / 2 - cd, cy = -h / 2 + cr + 0.002, shell = muff ? c : office ? 0x262626 : 0x1c1c1c, cush = 0x2a2a2a, acc = muff ? 0x212121 : office ? 0x3a3a3a : c;
  for (const sx of [-1, 1]) k.setT(mm(TR(sx * cx, cy, 0), RZ(-sx * Math.PI / 2))).lathe([
    { r: cr * 0.42, rz: crz * 0.42, y: 0 }, { r: cr * 0.8, rz: crz * 0.8, y: 0, p: 'f', h: 1 }, { r: cr * 0.96, rz: crz * 0.96, y: cd * 0.12, p: 'p' }, { r: cr, rz: crz, y: cd * 0.3, p: 'p', h: 1 },
    { r: cr * 0.98, rz: crz * 0.98, y: cd * 0.34, p: 's', h: 1 }, { r: cr, rz: crz, y: cd * 0.62, p: 's' }, { r: cr * 0.86, rz: crz * 0.86, y: cd * 0.92, p: 's' }, { r: cr * 0.6, rz: crz * 0.6, y: cd, p: 'a', h: 1 }
  ], k.lod ? 8 : 12, { f: { c: 0x151515 }, p: { c: cush }, s: { c: shell }, a: { c: acc } }, { bottom: 0x101010, top: acc }).setT(null);
  const bt = muff ? 0.005 : office ? 0.003 : 0.004, bw = muff ? 0.02 : office ? 0.009 : 0.017, Rb = cx + (office ? 0 : cd * 0.25), yc = cy + cr * 0.3, Hb = h / 2 - bt - yc - 0.001, P = [];
  for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; P.push([Math.cos(a) * Rb, yc + Math.sin(a) * Hb, 0]); }
  k.sweep(P, bw, muff ? 0x212121 : shell, { nu: 6, rz: bt / bw });
  if (!office) k.sweep(P.slice(3, 10).map(([x, y]) => [x * 0.93, y - bt * 1.8, 0]), bw * 0.75, cush, { nu: 6, rz: 0.5 });
  if (!muff) { const x0 = -(cx + cd * 0.5), M = office ? [[x0, cy - cr * 0.2, crz * 0.5], [x0 + w * 0.05, cy - cr * 0.6, D * 0.3], [x0 + w * 0.22, cy - cr * 0.85, D * 0.42]] : [[x0, cy - cr * 0.3, crz * 0.6], [x0 + w * 0.04, cy - cr * 0.7, D * 0.36], [x0 + w * 0.16, cy - cr * 0.85, D * 0.4]];
    k.sweep(M, 0.0022, 0x1a1a1a, { nu: 5 }); const e = M[2]; k.orb(e[0] + 0.004, e[1], e[2], 0.006, 0.005, 0.005, office ? 0x333333 : c, 6, 4); }
});
// Clavier : coque biseautée, rangées de touches en gradins (texture de touches par rangée), voyants
S('keyboard', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, hf = h * 0.42, hb = h * 0.62, frame = lumi(c) > 0.5 ? shade(c, 0.9) : shade(c, 1.25);
  k.setT(RY(Math.PI / 2)).prism([[-D / 2, y0], [D / 2, y0], [D / 2, y0 + hf], [-D / 2, y0 + hb]].map(([z, y]) => [-z, y]), w, frame, { bev: 0.0015 }).setT(null);
  const keys = k.pk(d, 'keys', w * 0.94, D * 0.8, { bg: c }), rows = 5, zk0 = -D * 0.42, zk1 = D * 0.4, rd = (zk1 - zk0) / rows, kh = Math.min(0.008, h * 0.3), V = (a) => keys.v1 - (keys.v1 - keys.v0) * a / 5.4;
  for (let j = 0; j < rows; j++) { const zc = zk0 + rd * (j + 0.5), yt = y0 + hb + (hf - hb) * ((zc + D / 2) / D) + kh * 0.6; k.pbox(0, yt - kh / 2, zc, w * 0.94, kh, rd * 0.97, shade(c, 0.85), { Y: { u0: keys.u0, u1: keys.u1, v0: V(1.2 + j), v1: V(0.2 + j) } }, { Z: shade(c, 0.55) }, 'y'); }
  for (let i = 0; i < 3; i++) deco(k, w * 0.4 + i * 0.008, y0 + hb - 0.0008, -D * 0.46, 0.003, 0.001, 0.003, i ? 0x2e7d32 : 0x66bb6a);
});
// Bouilloire électrique, théière, cuiseur à riz
S('kettle', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, id = d.id, sg = k.lod ? 8 : 16;
  if (id === 'teapot') { // corps renflé, couvercle à bouton, bec effilé, anse, filet bleu
    const R = Math.min(D, h * 1.2) * 0.46;
    k.lathe([{ r: R * 0.55, y: y0 }, { r: R * 0.62, y: y0 + 0.004, p: 'a', h: 1 }, { r: R * 0.92, y: y0 + h * 0.2, p: 'a' }, { r: R, y: y0 + h * 0.42, p: 'a' }, { r: R * 0.9, y: y0 + h * 0.62, p: 'a' }, { r: R * 0.66, y: y0 + h * 0.74, p: 'a', h: 1 }, { r: R * 0.64, y: y0 + h * 0.76, p: 'l' }, { r: R * 0.5, y: y0 + h * 0.84, p: 'l' }, { r: R * 0.14, y: y0 + h * 0.88, p: 'l', h: 1 }, { r: R * 0.12, y: y0 + h * 0.9, p: 'k' }, { r: R * 0.16, y: y0 + h * 0.96, p: 'k' }, { r: 0.002, y: h / 2, p: 'k' }], sg, { a: { c }, l: { c }, k: { c } }, { bottom: shade(c, 0.85) });
    k.lathe([{ r: R * 1.004, y: y0 + h * 0.38 }, { r: R * 1.004, y: y0 + h * 0.46, p: 'b' }], sg, { b: { c: 0x1e5aa8 } });
    k.sweep(spl([[R * 0.8, y0 + h * 0.25, 0], [R * 1.1, y0 + h * 0.4, 0], [R * 1.28, y0 + h * 0.62, 0], [w / 2 - 0.006, y0 + h * 0.8, 0]], k.lod ? 4 : 7), (t) => R * 0.2 * (1 - 0.55 * t), c, { nu: 8, cap1: true });
    k.sweep(spl([[-R * 0.85, y0 + h * 0.66, 0], [-R * 1.2, y0 + h * 0.68, 0], [-R * 1.38, y0 + h * 0.48, 0], [-R * 1.22, y0 + h * 0.24, 0], [-R * 0.92, y0 + h * 0.2, 0]], k.lod ? 5 : 9), R * 0.075, c, { nu: 6, rz: 0.6 });
    return;
  }
  if (id === 'rice_cooker') { // corps galbé, couvercle bombé, panneau de commande, soupape, anse
    const R = Math.min(w, D) * 0.46;
    k.lathe([{ r: R * 0.85, y: y0 }, { r: R * 0.92, y: y0 + 0.01, p: 'a' }, { r: R, y: y0 + h * 0.3, p: 'a' }, { r: R, y: y0 + h * 0.6, p: 'a' }, { r: R * 0.96, y: y0 + h * 0.68, p: 'a', h: 1 }, { r: R * 0.97, y: y0 + h * 0.7, p: 'l' }, { r: R * 0.85, y: y0 + h * 0.84, p: 'l' }, { r: R * 0.5, y: y0 + h * 0.93, p: 'l' }, { r: 0.004, y: y0 + h * 0.95, p: 'l' }], sg, { a: { c }, l: { c: shade(c, 0.96) } }, { bottom: 0x9e9e9e });
    k.rbox(0, y0 + h * 0.42, R - 0.007, R * 0.8, h * 0.26, 0.018, 0x37474f, 0.006); deco(k, 0, y0 + h * 0.47, R + 0.0025, R * 0.35, h * 0.07, 0.002, 0x80cbc4); for (let i = 0; i < 3; i++) deco(k, (i - 1) * R * 0.22, y0 + h * 0.36, R + 0.0025, R * 0.14, h * 0.035, 0.002, 0xeceff1);
    k.tube(R * 0.3, y0 + h * 0.94, 0, 0.012, 0.012, 0x9e9e9e, 10); const P = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI; P.push([Math.cos(a) * R * 0.75, y0 + h * 0.88 + Math.sin(a) * 0.006, -R * 0.15]); } k.sweep(P, 0.006, shade(c, 0.85), { nu: 5 }); return;
  }
  // bouilloire : socle d'alimentation, corps ovale conique, fenêtre de niveau, couvercle et bouton, bec, anse et interrupteur
  const R = Math.min(D * 0.46, w * 0.34), Rz = D * 0.42, bx = w * 0.08;
  k.setT(TR(bx, 0, 0)).lathe([{ r: R * 1.05, rz: Rz * 1.05, y: y0 }, { r: R * 1.08, rz: Rz * 1.08, y: y0 + 0.006, p: 'b' }, { r: R * 1.06, rz: Rz * 1.06, y: y0 + h * 0.07, p: 'b', h: 1 }, { r: R, rz: Rz, y: y0 + h * 0.075, p: 'a' }, { r: R * 0.98, rz: Rz * 0.98, y: y0 + h * 0.5, p: 'a' }, { r: R * 0.86, rz: Rz * 0.86, y: y0 + h * 0.86, p: 'a' }, { r: R * 0.84, rz: Rz * 0.84, y: y0 + h * 0.88, p: 'a', h: 1 }, { r: R * 0.8, rz: Rz * 0.8, y: y0 + h * 0.9, p: 'l' }, { r: R * 0.45, rz: Rz * 0.45, y: y0 + h * 0.95, p: 'l' }], sg, { b: { c: 0x2a2a2a }, a: { c }, l: { c: shade(c, 0.95) } }, { bottom: 0x1a1a1a, top: shade(c, 0.95) }).setT(null);
  k.sweep([[bx, y0 + h * 0.2, Rz * 0.985], [bx, y0 + h * 0.7, Rz * 0.92]], 0.0015, 0x8fb3c8, { nu: 6, rz: 4.5 });
  k.rbox(bx - R * 0.45, y0 + h * 0.94, 0, 0.024, 0.008, 0.02, shade(c, 0.85), 0.003);
  k.sweep([[bx + R * 0.7, y0 + h * 0.82, 0], [bx + R * 0.98, y0 + h * 0.88, 0], [w / 2 - 0.012, y0 + h * 0.93, 0]], (t) => 0.016 - 0.006 * t, c, { nu: 8, rz: 0.7 });
  k.sweep(spl([[bx - R * 0.75, y0 + h * 0.86, 0], [bx - R - 0.016, y0 + h * 0.84, 0], [bx - R - 0.024, y0 + h * 0.6, 0], [bx - R - 0.02, y0 + h * 0.3, 0], [bx - R * 0.95, y0 + h * 0.18, 0]], k.lod ? 5 : 9), 0.01, c, { nu: 6, rz: 0.75 });
  k.rbox(bx - R - 0.01, y0 + h * 0.16, 0, 0.012, 0.012, 0.016, 0x2a2a2a, 0.003); deco(k, bx - R - 0.016, y0 + h * 0.16, 0, 0.001, 0.004, 0.006, 0xff6d00);
});
// Grille-pain : coque inox, flancs noirs, deux fentes, levier, molette de brunissage, tiroir à miettes, pieds
S('toaster', (k, s, c) => {
  const [w, h, D] = s, y0 = -h / 2, bw = w * 0.78, bh = h * 0.93, by = y0 + h * 0.035 + bh / 2, ex = bw / 2 + 0.006, fx = ex + 0.013;
  k.rbox(0, by, 0, bw, bh, D, c, 0.028);
  for (const sx of [-1, 1]) k.rbox(sx * ex, by, 0, 0.026, bh * 0.98, D * 0.97, 0x2a2a2a, 0.012);
  for (const z of [-D * 0.18, D * 0.18]) k.box(0, by + bh / 2 - 0.0012, z, bw * 0.72, 0.0026, D * 0.13, 0x0c0c0c);
  k.box(fx + 0.0006, by + bh * 0.05, 0, 0.0012, bh * 0.55, 0.008, 0x111111); k.rbox(fx + 0.0052, by + bh * 0.18, 0, 0.0104, 0.012, 0.03, 0x1a1a1a, 0.0035);
  k.setT(mm(TR(fx, by - bh * 0.22, 0), RZ(-Math.PI / 2))).lathe([{ r: 0.011, y: 0 }, { r: 0.011, y: 0.007, p: 'a' }, { r: 0.009, y: 0.009, p: 'a', h: 1 }], k.lod ? 6 : 12, { a: { c: 0x1a1a1a, rect: k.lod ? null : ridgeTex(k, 16) } }, { top: 0x2a2a2a }).setT(null);
  k.box(0, y0 + h * 0.04, D / 2 - 0.004, bw * 0.6, 0.006, 0.008, 0x3a3a3a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.tube(sx * bw * 0.4, y0 + 0.0035, sz * D * 0.36, 0.006, 0.007, 0x111111, 6, { tc: null });
});
// Blender : socle moteur, panneau à molette, bol carré arrondi (smoothie au fond), anse, couvercle à bouchon
S('blender', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, bh = h * 0.3, sg = k.lod ? 8 : 16;
  k.rbox(0, y0 + bh / 2, 0, w * 0.94, bh, D * 0.94, c, 0.022);
  k.rbox(0, y0 + bh * 0.45, D * 0.47 - 0.006, w * 0.62, bh * 0.5, 0.008, 0x212121, 0.003); KNOB(k, 0, y0 + bh * 0.45, D * 0.47 - 0.002, 0.012, 0.006, 0xd0d0d0);
  for (const sx of [-1, 1]) deco(k, sx * w * 0.2, y0 + bh * 0.45, D * 0.47 - 0.0015, 0.008, 0.006, 0.001, 0x9e9e9e);
  const jy0 = y0 + bh + 0.012, jh = h * 0.6, jx = w * 0.04, sq = (a) => [Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.45), Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.45)], hs = (v) => w * (0.27 + 0.08 * v);
  k.lathe([{ r: w * 0.3, y: y0 + bh - 0.001 }, { r: w * 0.3, y: jy0 + 0.002, p: 'a' }], sg, { a: { c: 0x2a2a2a } }, { top: 0x2a2a2a });
  const glass = 0xd4e6ec, fill = d.p?.smoothie ? 0xf06292 : glass, VV = [0, 0.44, 0.46, 0.75, 1];
  k.surf(sg, 4, (u, v) => { const a = 2 * Math.PI * (u - 0.5), vv = VV[Math.round(v * 4)], [px, pz] = sq(a); return [jx + px * hs(vv), jy0 + jh * vv, pz * hs(vv)]; }, glass, { col: (u, v) => (v < 0.4 ? fill : glass) });
  k.rbox(jx, jy0 + jh + 0.007, 0, hs(1) * 2.06, 0.014, hs(1) * 2.06, 0x212121, 0.005); k.tube(jx, jy0 + jh + 0.017, 0, 0.018, 0.008, 0x2a2a2a, 10);
  k.sweep(spl([[jx - hs(0.9), jy0 + jh * 0.9, 0], [jx - hs(0.85) - 0.016, jy0 + jh * 0.86, 0], [jx - hs(0.5) - 0.022, jy0 + jh * 0.5, 0], [jx - hs(0.18) - 0.014, jy0 + jh * 0.17, 0], [jx - hs(0.12) + 0.002, jy0 + jh * 0.12, 0]], k.lod ? 5 : 9), 0.007, 0x2a2a2a, { nu: 6, rz: 0.8 });
});
// Fer à repasser : semelle pointue, coque effilée (réservoir bleuté), poignée en boucle, thermostat, cordon
S('iron', (k, s, c) => {
  const [w, h, L] = s, y0 = -h / 2, sp = 0.011, n = k.lod ? 6 : 10, O = [], hw = (t) => w * 0.48 * (t < 0.45 ? 1 - 0.08 * (1 - t / 0.45) ** 3 : Math.pow(Math.max(0, Math.cos((t - 0.45) / 0.55 * Math.PI / 2)), 0.75));
  for (let i = 0; i <= n; i++) { const t = i / n; O.push([hw(t), -L / 2 + L * t]); }
  for (let i = n - 1; i >= 0; i--) { const t = i / n; O.push([-hw(t), -L / 2 + L * t]); }
  k.setT(mm(TR(0, y0 + sp / 2, 0), RX(-Math.PI / 2))).prism(O.map(([x, z]) => [x, -z]), sp, 0xd5dbe0, { bev: 0.0025, smooth: true, cs: 0xb0b8c0 }).setT(null);
  const top = y0 + sp + h * 0.36, m = O.length, at = (u) => O[Math.round(u * m) % m], sc = (v, z) => (1 - 0.32 * v * v) * (z > 0 ? 1 - 0.1 * v : 1);
  k.surf(m, k.lod ? 2 : 3, (u, v) => { const p = at(u), f = sc(v, p[1]); return [p[0] * (1 - 0.32 * v * v), y0 + sp + (top - y0 - sp) * Math.sin(v * Math.PI / 2), p[1] * f]; }, c, { flip: true, col: (u, v) => (at(u)[1] > L * 0.12 && v < 0.7 ? 0x9fd3f0 : c) });
  k.setT(mm(TR(0, top, 0), RX(-Math.PI / 2))).prism(O.map(([x, z]) => [x * 0.68, -z * sc(1, z)]), 0.001, c, { back: false, side: false }).setT(null);
  k.sweep(spl([[0, top - 0.004, -L * 0.36], [0, top + h * 0.2, -L * 0.33], [0, top + h * 0.34, -L * 0.12], [0, top + h * 0.33, L * 0.1], [0, top + h * 0.12, L * 0.24], [0, top - 0.004, L * 0.28]], k.lod ? 6 : 12), (t) => 0.012 * (t < 0.15 ? 1.3 - 2 * t : 1), c, { nu: 8, rz: 0.75 });
  k.tube(0, top + 0.0025, L * 0.02, 0.016, 0.005, 0xeceff1, k.lod ? 6 : 12); deco(k, 0, top + 0.0052, L * 0.02 + 0.012, 0.002, 0.0006, 0.006, 0xd32f2f);
  k.orb(0, top - 0.002, L * 0.37, 0.006, 0.005, 0.006, 0xeceff1, 6, 4);
  k.sweep([[0, y0 + sp + 0.02, -L * 0.42], [0, y0 + sp + 0.016, -L * 0.475]], (t) => 0.0055 - 0.0015 * t, 0x9e9e9e, { nu: 6, cap1: true });
});
// Ventilateur : socle, mât télescopique, moteur, grille (cercles et rayons), pales, enjoliveur
S('fan', (k, s, c) => {
  const [w, h, D] = s, y0 = -h / 2, R = Math.min(w * 0.47, h * 0.3), yc = h / 2 - R - 0.006, zc = D * 0.12, sg = k.lod ? 12 : 20, gc = 0xe0e0e0;
  k.lathe([{ r: w * 0.3, rz: D * 0.42, y: y0 }, { r: w * 0.3, rz: D * 0.42, y: y0 + 0.008, p: 'a' }, { r: w * 0.25, rz: D * 0.35, y: y0 + 0.022, p: 'a' }, { r: w * 0.1, rz: D * 0.1, y: y0 + 0.03, p: 'a', h: 1 }], k.lod ? 8 : 18, { a: { c } }, { bottom: 0x222222, top: c });
  k.tube(0, (y0 + yc) / 2 - 0.03, -D * 0.1, 0.014, yc - y0 - 0.06, c, 10); k.tube(0, yc - 0.06, -D * 0.1, 0.01, 0.06, shade(c, 0.9), 8);
  k.orb(0, yc, zc - 0.07, 0.05, 0.05, 0.06, c, k.lod ? 8 : 12, k.lod ? 5 : 7);
  const ring = (r, z, rr = 0.0018) => { const P = []; for (let i = 0; i <= sg; i++) { const a = i / sg * Math.PI * 2; P.push([Math.cos(a) * r, yc + Math.sin(a) * r, z]); } k.sweep(P, rr, gc, { nu: 4 }); };
  ring(R, zc, 0.004); ring(R * 0.66, zc + 0.012); ring(R * 0.34, zc + 0.02); ring(R, zc - 0.03, 0.003);
  const ns = k.lod ? 8 : 16; for (let i = 0; i < ns; i++) { const a = i / ns * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); k.sweep([[ca * R * 0.12, yc + sa * R * 0.12, zc + 0.026], [ca * R * 0.5, yc + sa * R * 0.5, zc + 0.016], [ca * R, yc + sa * R, zc]], 0.0012, gc, { nu: 3 }); if (i % 2 === 0) k.sweep([[ca * R * 0.3, yc + sa * R * 0.3, zc - 0.045], [ca * R, yc + sa * R, zc - 0.03]], 0.0012, gc, { nu: 3 }); }
  k.setT(mm(TR(0, yc, zc + 0.026), RX(Math.PI / 2))).lathe([{ r: R * 0.13, y: 0 }, { r: R * 0.12, y: 0.004, p: 'a' }], 12, { a: { c: 0x1e88e5 } }, { top: 0x1e88e5 }).setT(null);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.3; k.setT(mm(TR(0, yc, zc - 0.012), RZ(a), TR(R * 0.5, 0, 0), RX(0.35))).prism(ellip(R * 0.4, R * 0.24, 10), 0.002, 0xb3e5fc, {}).setT(null); }
  k.meta.blades = [0, yc, zc - 0.012, R * 0.9];
});
// Abat-jour : tronc de cône ouvert (dehors, dedans), liserés haut et bas
function SHADE(k, y0, y1, r0, r1, c, sg) {
  k.lathe([{ r: r0, y: y0 }, { r: r0, y: y0 + 0.004, p: 't', h: 1 }, { r: r0 + (r1 - r0) * 0.03, y: y0 + 0.005, p: 'a' }, { r: r1 - (r1 - r0) * 0.03, y: y1 - 0.005, p: 'a', h: 1 }, { r: r1, y: y1 - 0.004, p: 't' }, { r: r1, y: y1, p: 't' }], sg, { a: { c }, t: { c: shade(c, 0.85) } });
  k.surf(sg, 1, (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = (v ? r1 : r0) - 0.0015; return [r * Math.sin(a), v ? y1 : y0, r * Math.cos(a)]; }, shade(c, 1.05), { flip: true });
}
// Lampe de chevet (pied en céramique, douille, abat-jour, lyre et finial) ; veilleuse projecteur d'étoiles
S('lamp', (k, s, c, d) => {
  const [w, h] = s, y0 = -h / 2, sg = k.lod ? 8 : 16;
  if (d.id === 'nightlight') {
    const R = w * 0.46, bh = h * 0.28, dr = R * 0.96, cy = y0 + bh + dr * 0.55;
    k.lathe([{ r: R * 0.92, y: y0 }, { r: R, y: y0 + 0.004, p: 'a' }, { r: R, y: y0 + bh - 0.004, p: 'a' }, { r: R * 0.96, y: y0 + bh, p: 'a', h: 1 }], sg, { a: { c: 0xf0f0f0 } }, { bottom: 0xcccccc, top: 0xf0f0f0 });
    k.orb(0, cy, 0, dr, dr, dr, c, k.lod ? 8 : 14, k.lod ? 6 : 9); deco(k, 0, y0 + bh * 0.5, R + 0.0005, 0.008, 0.006, 0.001, 0x90caf9);
    for (let i = 0; i < (k.lod ? 4 : 9); i++) { const th = 0.25 + (i % 3) * 0.32, ph = i * 2.1, nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph); k.setT(onN(nx * dr * 1.003, cy + ny * dr * 1.003, nz * dr * 1.003, nx, ny, nz)).prism(starPts(dr * 0.16, dr * 0.07), 0.0008, 0xffe082, { back: false, side: false }).setT(null); }
    k.meta.light = [0, cy, 0]; return;
  }
  const R = w / 2, base = 0x5f8a8b, ys = y0 + h * 0.64;
  k.lathe([{ r: R * 0.36, y: y0 }, { r: R * 0.4, y: y0 + 0.006, p: 'a', h: 1 }, { r: R * 0.62, y: y0 + h * 0.12, p: 'a' }, { r: R * 0.66, y: y0 + h * 0.2, p: 'a' }, { r: R * 0.55, y: y0 + h * 0.32, p: 'a' }, { r: R * 0.22, y: y0 + h * 0.4, p: 'a' }, { r: R * 0.18, y: y0 + h * 0.43, p: 'a', h: 1 }], sg, { a: { c: base } }, { bottom: 0x3e2723, top: 0xc9a227 });
  k.tube(0, y0 + h * 0.5, 0, 0.007, h * 0.14, 0xc9a227, 8); k.lathe([{ r: 0.016, y: y0 + h * 0.56 }, { r: 0.017, y: y0 + h * 0.6, p: 'a' }, { r: 0.015, y: ys, p: 'a' }], 10, { a: { c: 0x8d6e63 } }, { bottom: 0x8d6e63, top: 0x8d6e63 });
  k.orb(0, ys + 0.024, 0, 0.018, 0.024, 0.018, 0xfff8e1, 8, 6);
  for (const sx of [-1, 1]) k.sweep([[sx * 0.016, ys - 0.004, 0], [sx * 0.034, y0 + h * 0.82, 0], [sx * 0.004, h / 2 - 0.008, 0]], 0.0012, 0xc9a227, { nu: 3 });
  SHADE(k, y0 + h * 0.5, h / 2 - 0.012, R * 0.98, R * 0.6, c, sg); k.orb(0, h / 2 - 0.006, 0, 0.007, 0.006, 0.007, 0xc9a227, 6, 4);
  k.meta.light = [0, y0 + h * 0.7, 0];
});
// Lampe de table (pied tourné en bois, abat-jour) ; lampe boule (verre opalin sur socle)
S('plamp', (k, s, c, d) => {
  const [w, h] = s, y0 = -h / 2, sg = k.lod ? 8 : 16, wood = d.c2 ?? 0x8d6e63;
  if ((d.lt || 'table') === 'globe') {
    const R = Math.min(w * 0.48, h * 0.4), bh = h - 2 * R * 0.98 - 0.002;
    k.lathe([{ r: w * 0.3, y: y0 }, { r: w * 0.3, y: y0 + bh * 0.4, p: 'a' }, { r: w * 0.24, y: y0 + bh * 0.7, p: 'a', h: 1 }, { r: w * 0.16, y: y0 + bh * 0.8, p: 'a' }, { r: w * 0.14, y: y0 + bh, p: 'b' }], sg, { a: { c: d.c2 ?? 0x5d4037 }, b: { c: 0xc9a227 } }, { bottom: 0x2a1d14, top: 0xc9a227 });
    k.orb(0, y0 + bh + R * 0.98, 0, R, R, R, c, k.lod ? 8 : 16, k.lod ? 6 : 10, { col: (u, v) => mixc(c, 0xffffff, 0.35 * Math.max(0, v - 0.5)) }); k.meta.light = [0, y0 + bh + R, 0]; return;
  }
  const R = w / 2; k.lathe([{ r: R * 0.48, y: y0 }, { r: R * 0.5, y: y0 + 0.008, p: 'a', h: 1 }, { r: R * 0.44, y: y0 + 0.016, p: 'a' }, { r: R * 0.2, y: y0 + h * 0.08, p: 'a' }, { r: R * 0.16, y: y0 + h * 0.12, p: 'a' }, { r: R * 0.24, y: y0 + h * 0.16, p: 'a' }, { r: R * 0.11, y: y0 + h * 0.22, p: 'a' }, { r: R * 0.09, y: y0 + h * 0.4, p: 'a' }, { r: R * 0.15, y: y0 + h * 0.44, p: 'a' }, { r: R * 0.08, y: y0 + h * 0.48, p: 'a', h: 1 }], sg, { a: { c: wood } }, { bottom: 0x2a1d14, top: 0xc9a227 });
  k.tube(0, y0 + h * 0.53, 0, 0.012, h * 0.1, 0xc9a227, 8); k.orb(0, y0 + h * 0.62, 0, 0.022, 0.03, 0.022, 0xfff8e1, 8, 6);
  SHADE(k, y0 + h * 0.48, h / 2 - 0.004, R * 0.98, R * 0.62, c, sg);
  k.meta.light = [0, y0 + h * 0.7, 0];
});
// Lampe à lave : socle conique métallique, flacon en fuseau (bulles de cire peintes sur le verre), capuchon
S('lavalamp', (k, s, c) => {
  const [w, h] = s, y0 = -h / 2, R = w / 2, sg = k.lod ? 8 : 14, met = 0xa8acb0, gy0 = y0 + h * 0.33, gy1 = y0 + h * 0.86;
  k.lathe([{ r: R * 0.96, y: y0 }, { r: R, y: y0 + 0.004, p: 'a' }, { r: R * 0.98, y: y0 + 0.012, p: 'a', h: 1 }, { r: R * 0.56, y: gy0 - h * 0.01, p: 'a' }, { r: R * 0.6, y: gy0, p: 'a', h: 1 }], sg, { a: { c: met } }, { bottom: 0x333333, top: met });
  const gr = (v) => R * (v < 0.35 ? 0.5 + 0.22 * Math.sin(Math.PI / 2 * v / 0.35) : 0.72 - 0.36 * (v - 0.35) / 0.65), blobs = [[0.15, 0.2, 0.09, 0.12], [0.6, 0.55, 0.12, 0.1], [0.35, 0.82, 0.08, 0.07], [0.85, 0.32, 0.07, 0.09], [0.45, 0.06, 0.3, 0.06]];
  const lava = (u, v) => { let f = 0; for (const [bu, bv, su, sv] of blobs) { const du = Math.min(Math.abs(u - bu), 1 - Math.abs(u - bu)); f += Math.exp(-(du * du) / (su * su) - ((v - bv) ** 2) / (sv * sv)); } return f; };
  k.surf(sg, k.lod ? 6 : 14, (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = gr(v); return [r * Math.sin(a), gy0 + (gy1 - gy0) * v, r * Math.cos(a)]; }, 0xffb74d, { col: (u, v) => mixc(0xffb74d, c, Math.min(1, Math.max(0, (lava(u, v) - 0.45) * 4))) });
  k.lathe([{ r: R * 0.38, y: gy1 - 0.002 }, { r: R * 0.4, y: gy1 + 0.004, p: 'a', h: 1 }, { r: R * 0.22, y: h / 2 - 0.003, p: 'a' }, { r: R * 0.18, y: h / 2, p: 'a', h: 1 }], sg, { a: { c: met } }, { top: met });
  k.meta.light = [0, (gy0 + gy1) / 2, 0];
});
// Aspirateur traîneau : corps ovale, ceinture pare-chocs, bac, poignée, grandes roues, roulette, flexible annelé
S('vacuum', (k, s, c) => {
  const [w, h, D] = s, y0 = -h / 2, by = y0 + h * 0.3, wr = h * 0.2, sg = k.lod ? 10 : 16;
  k.orb(0, by, -D * 0.025, w * 0.43, h * 0.24, D * 0.42, c, sg, k.lod ? 6 : 9, { e: [0.75, 1] });
  k.lathe([{ r: w * 0.43 + 0.003, rz: D * 0.42 + 0.003, y: by - 0.014 }, { r: w * 0.43 + 0.003, rz: D * 0.42 + 0.003, y: by + 0.004, p: 'a' }], sg, { a: { c: 0x2a2a2a } });
  k.orb(0, by + h * 0.2, -D * 0.02, w * 0.33, h * 0.13, D * 0.3, shade(c, 0.75), sg, k.lod ? 5 : 7, { e: [0.6, 1] });
  k.sweep(spl([[0, by + h * 0.28, -D * 0.17], [0, by + h * 0.44, -D * 0.12], [0, by + h * 0.47, D * 0.05], [0, by + h * 0.42, D * 0.18], [0, by + h * 0.3, D * 0.22]], k.lod ? 5 : 9), 0.011, 0x2a2a2a, { nu: 6 });
  for (const sx of [-1, 1]) k.tube(sx * (w / 2 - 0.016), y0 + wr, -D * 0.22, wr, 0.03, 0x212121, sg, { m: RZ(Math.PI / 2), tc: 0x9e9e9e, bc: 0x9e9e9e });
  k.orb(0, y0 + 0.02, D * 0.3, 0.02, 0.02, 0.02, 0x212121, 6, 4);
  k.tube(0, by + 0.01, D * 0.42, 0.024, 0.04, 0x37474f, 10, { m: RX(Math.PI / 2) });
  k.sweep(spl([[0, by + 0.01, D * 0.45], [0.05, by + 0.05, D * 0.46], [0.12, by + 0.12, D * 0.4], [0.13, by + 0.19, D * 0.18], [0.12, by + 0.2, -D * 0.05]], k.lod ? 6 : 18), 0.016, 0x37474f, { nu: k.lod ? 5 : 8, col: (u, t) => (Math.round(t * 34) % 2 ? 0x37474f : 0x4b5d66), cap1: true });
  if (!k.lod) for (let i = 0; i < 5; i++) deco(k, (i - 2) * 0.012, by + 0.02, -D * 0.445, 0.006, 0.03, 0.002, 0x212121);
});
// Radio en bois : caisse arrondie, toile de haut-parleur à lamelles, cadran FM, boutons striés, poignée, antenne repliée
S('radio', (k, s, c) => {
  const [w, h, D] = s, cy = -h * 0.03, ch = h * 0.94, top = cy + ch / 2, zf = D * 0.37;
  k.rbox(0, cy, -D * 0.06, w, ch, D * 0.86, c, 0.014);
  k.pbox(-w * 0.2, cy - h * 0.02, zf + 0.0005, w * 0.5, h * 0.66, 0.001, 0x5d4037, { Z: k.shared('grille:radio', 96, 64, { kind: 'grille', bg: 0xc8b48a, slats: 5, slatC: 0x6d4c41 }) }, {}, 'zy');
  k.pbox(w * 0.27, h * 0.12, zf + 0.0005, w * 0.36, h * 0.28, 0.001, 0x3e2723, { Z: k.shared('tuner:fm', 96, 40, { kind: 'tuner' }) }, {}, 'zy');
  for (const x of [w * 0.17, w * 0.37]) k.setT(mm(TR(x, -h * 0.2, zf), RX(Math.PI / 2))).lathe([{ r: 0.013, y: 0 }, { r: 0.013, y: 0.008, p: 'a' }, { r: 0.011, y: 0.011, p: 'a', h: 1 }, { r: 0.004, y: 0.0115, p: 't' }], k.lod ? 6 : 12, { a: { c: 0xe8dcc0, rect: k.lod ? null : ridgeTex(k, 18) }, t: { c: 0xd4c4a0 } }, { top: 0xd4c4a0 }).setT(null);
  const P = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI; P.push([Math.cos(a) * w * 0.28, top + Math.sin(a) * Math.min(0.012, h / 2 - top - 0.004), -D * 0.06]); } k.sweep(P, 0.009, 0x3e2723, { nu: 6, rz: 0.35 });
  k.tube(w * 0.42, top + 0.003, -D * 0.32, 0.006, 0.006, 0xc0c0c0, 8); k.sweep([[w * 0.42, top + 0.004, -D * 0.32], [-w * 0.3, top + 0.004, -D * 0.32]], (t) => 0.003 - 0.0015 * t, 0xd0d0d0, { nu: 6, cap1: true });
  k.meta.dial = [w * 0.27, h * 0.12, zf + 0.001];
});
// Horloges : murales (jonc tourné, cadran imprimé en retrait, aiguilles en relief), de gare, coucou suisse
S('clock', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id, sg = k.lod ? 12 : 28;
  const hands = (R, zf, fg, sec) => { const hd = (len, wd, a, z) => k.setT(mm(TR(0, 0, z), RZ(-a))).prism([[-wd * 0.5, -len * 0.18], [wd * 0.5, -len * 0.18], [wd * 0.3, len], [0, len * 1.04], [-wd * 0.3, len]], 0.0012, fg, {}).setT(null);
    hd(R * 0.5, R * 0.07, (10 + 10 / 60) / 12 * Math.PI * 2, zf); hd(R * 0.74, R * 0.05, 10 / 60 * Math.PI * 2, zf + 0.0014);
    if (sec === 'station') { k.setT(mm(TR(0, 0, zf + 0.0028), RZ(-0.7))).prism([[-0.0012, -R * 0.2], [0.0012, -R * 0.2], [0.0012, R * 0.62], [-0.0012, R * 0.62]], 0.0008, 0xd50000, {}).setT(null); k.setT(TR(Math.sin(0.7) * R * 0.62, Math.cos(0.7) * R * 0.62, zf + 0.0028)).prism(ellip(R * 0.09, R * 0.09, 10), 0.0008, 0xd50000, {}).setT(null); }
    else if (sec) k.setT(mm(TR(0, 0, zf + 0.0028), RZ(-2.2))).prism([[-0.0007, -R * 0.2], [0.0007, -R * 0.2], [0.0005, R * 0.8], [-0.0005, R * 0.8]], 0.0006, 0xd32f2f, {}).setT(null);
    k.tube(0, 0, zf + 0.002, R * 0.04, 0.004, fg, 8, { m: RX(Math.PI / 2) }); };
  if (id === 'cuckoo_clock') { // chalet : façade, toit débordant, pignon, cadran romain, porte du coucou, feuilles sculptées, balancier, poids
    const dk = shade(c, 0.7), hw = w * 0.72, hh = h * 0.36, hd = D * 0.6, hy0 = -h * 0.02, zf = -D * 0.1 + hd / 2, ry = hy0 + hh, ra = 0.62, rl = hw * 0.62;
    k.rbox(0, hy0 + hh / 2, -D * 0.1, hw, hh, hd, c, 0.004);
    for (const sx of [-1, 1]) k.setT(mm(TR(sx * hw * 0.26, ry + Math.sin(ra) * rl * 0.42, -D * 0.08), RZ(-sx * ra))).rbox(0, 0, 0, rl, 0.008, hd * 1.3, dk, 0.002).setT(null);
    k.setT(TR(0, ry, zf - 0.003)).prism([[-hw * 0.48, 0], [hw * 0.48, 0], [0, hw * 0.3]], 0.006, c, {}).setT(null);
    const R = hw * 0.3, dy = hy0 + hh * 0.42, dial = k.pk(d, 'dial', R * 2, R * 2, { bg: 0xf3e3c3, fg: 0x2a1d14, num: 'roman', rim: dk });
    k.setT(mm(TR(0, dy, zf), RX(Math.PI / 2))).lathe([{ r: R, y: 0 }, { r: R, y: 0.004, p: 'a' }, { r: R * 0.9, y: 0.005, p: 'a', h: 1 }], k.lod ? 10 : 20, { a: { c: dk } }, { top: 0xffffff, topRect: dial }).setT(null);
    hands(R * 0.9, zf + 0.0062, 0x1a1a1a, false);
    k.pbox(0, ry + hw * 0.1, zf + 0.0015, hw * 0.14, hw * 0.13, 0.003, dk); deco(k, 0, ry + hw * 0.1, zf + 0.0032, hw * 0.1, hw * 0.09, 0.0006, 0x2a1d14);
    if (!k.lod) { for (const a of [0.1, 0.3, 0.7, 0.9].map((f) => f * Math.PI)) leafAt(k, Math.cos(a) * hw * 0.11, ry + hw * 0.03, zf + 0.002, Math.cos(a), Math.sin(a) * 0.7, 0.15, hw * 0.14, hw * 0.065, shade(c, a < 0.5 || a > 2.6 ? 0.9 : 1.05), 0.2); k.orb(0, ry + hw * 0.22, zf + 0.004, 0.009, 0.007, 0.006, dk, 6, 4); }
    k.box(0, hy0 - h * 0.13, zf - 0.01, 0.003, h * 0.26, 0.002, 0xc9a227); k.setT(TR(0, hy0 - h * 0.27, zf - 0.008)).prism(ellip(0.02, 0.026, 10), 0.003, 0xc9a227, { bev: 0.001 }).setT(null);
    const cyT = -h / 2 + 0.078; for (const sx of [-1, 1]) { const x = sx * hw * 0.25; k.tube(x, (hy0 + cyT) / 2, -D * 0.12, 0.0008, hy0 - cyT, 0x9e9e9e, 4, { open: true }); k.setT(TR(x, 0, -D * 0.12)).lathe([{ r: 0.004, y: -h / 2 + 0.002 }, { r: 0.012, y: -h / 2 + 0.02, p: 'a' }, { r: 0.013, y: -h / 2 + 0.05, p: 'a' }, { r: 0.008, y: -h / 2 + 0.072, p: 'a' }, { r: 0.003, y: cyT, p: 'a' }], k.lod ? 6 : 10, { a: { c: 0x8d6e3f } }, { bottom: 0x6d4c2f, top: 0x6d4c2f }).setT(null); }
    return;
  }
  const R = Math.min(w, h) / 2, st = { wall_clock: { rim: c, bez: 0xd0d0d0, num: 'arabic', bg: 0xffffff, fg: 0x1a1a1a, sec: true }, clock_wall_retro: { rim: c, bez: 0xdadcde, num: 'arabic', bg: 0xfff8e6, fg: 0x2a2a2a, sec: true }, clock_station: { rim: 0x1a1a1a, bez: 0x2a2a2a, num: 'none', bold: true, bg: 0xfafafa, fg: 0x111111, sec: 'station' } }[id] || { rim: c, bez: 0xc0c0c0, num: 'arabic', bg: 0xffffff, fg: 0x111111, sec: true };
  const dial = k.pk(d, 'dial', R * 2, R * 2, { bg: st.bg, fg: st.fg, num: st.num, bold: st.bold, rim: st.rim });
  k.setT(mm(TR(0, 0, -D / 2), RX(Math.PI / 2))).lathe([{ r: R * 0.9, y: 0 }, { r: R * 0.98, y: 0.002, p: 'b' }, { r: R, y: D * 0.3, p: 'a' }, { r: R * 0.99, y: D * 0.85, p: 'a' }, { r: R * 0.95, y: D, p: 'a', h: 1 }, { r: R * 0.9, y: D, p: 'z', h: 1 }, { r: R * 0.89, y: D * 0.8, p: 'z' }], sg, { a: { c: st.rim }, b: { c: shade(st.rim, 0.6) }, z: { c: st.bez } }, { top: 0xffffff, topRect: dial, bottom: shade(st.rim, 0.5) }).setT(null);
  hands(R * 0.89, -D / 2 + D * 0.8 + 0.0015, st.fg, st.sec);
});
// Boule à neige : socle mouluré à filet doré, globe (neige au fond, flocons)
S('snowglobe', (k, s, c) => {
  const [w, h] = s, y0 = -h / 2, bh = h * 0.26, R = Math.min(w * 0.46, (h - bh) / 1.92), sg = k.lod ? 8 : 16;
  k.lathe([{ r: w * 0.46, y: y0 }, { r: w * 0.48, y: y0 + 0.004, p: 'a', h: 1 }, { r: w * 0.44, y: y0 + bh * 0.5, p: 'a' }, { r: w * 0.36, y: y0 + bh, p: 'a', h: 1 }], sg, { a: { c: 0x5d4037 } }, { bottom: 0x3e2723, top: 0x3e2723 });
  k.lathe([{ r: w * 0.462, y: y0 + bh * 0.3 }, { r: w * 0.455, y: y0 + bh * 0.42, p: 'g' }], sg, { g: { c: 0xd4af37 } });
  k.orb(0, y0 + bh + R * 0.94, 0, R, R, R, c, k.lod ? 10 : 16, k.lod ? 7 : 12, { col: (u, v) => (v < 0.3 ? 0xf5f8fc : hn(u * 31, v * 17) > 0.86 ? 0xffffff : mixc(c, 0xffffff, 0.25 * v)) });
});
// Globe terrestre : pied tourné, tige, méridien incliné, sphère à planisphère
S('globe', (k, s, c, d) => {
  const [w, h] = s, y0 = -h / 2, R = Math.min(w * 0.42, h * 0.33), cy = h / 2 - R - 0.022, tilt = 0.41, Rm = R + 0.012, T = mm(TR(0, cy, 0), RZ(tilt));
  k.lathe([{ r: w * 0.26, y: y0 }, { r: w * 0.27, y: y0 + 0.008, p: 'a', h: 1 }, { r: w * 0.22, y: y0 + 0.02, p: 'a' }, { r: w * 0.08, y: y0 + 0.03, p: 'a' }, { r: w * 0.05, y: y0 + 0.05, p: 'a', h: 1 }], k.lod ? 8 : 16, { a: { c: 0x4e342e } }, { bottom: 0x2a1d14, top: 0x4e342e });
  const pole = (t, r = Rm) => { const v = new THREE.Vector3(-Math.sin(t) * r, -Math.cos(t) * r, 0).applyMatrix4(T); return [v.x, v.y, v.z]; };
  const nm = k.lod ? 8 : 16; k.sweep(Array.from({ length: nm + 1 }, (_, i) => pole(i / nm * Math.PI)), 0.004, 0xc9a227, { nu: 5, rz: 2.2 });
  const sp = pole(0); k.sweep(spl([[0, y0 + 0.048, 0], [sp[0] * 0.3, y0 + 0.06 + (sp[1] - y0) * 0.4, 0], [sp[0], sp[1] - 0.002, 0]], 5), 0.006, 0xc9a227, { nu: 6 });
  for (const t of [0, Math.PI]) { const a = pole(t, R + 0.004), b = pole(t, Rm); k.sweep([a, b], 0.003, 0xc9a227, { nu: 5 }); }
  k.setT(T).orb(0, 0, 0, R, R, R, c, k.lod ? 10 : 24, k.lod ? 8 : 16, { rect: k.pk(d, 'globe', 0.5, 0.25, { bg: c }) }).setT(null);
});
// ═════════════════════ OUTILS, QUINCAILLERIE, SPORT, BÂTONNETS ═════════════════════
// Tour le long de +z (profil : y = position sur l'axe), décalé en (x, y)
const ZL = (k, rings, segs, parts, o = {}, x = 0, y = 0) => k.setT(mm(TR(x, y, 0), RX(Math.PI / 2))).lathe(rings, segs, parts, o).setT(null);
const REV = (P) => P.map((q, j) => ({ ...P[P.length - 1 - j], p: j ? P[P.length - j].p : undefined }));
// Plaque à plat : contour vu de dessus [[x, z]…] extrudé sur l'épaisseur t (axe y), centrée en y
const FLAT = (k, pts, t, c, o = {}, y = 0) => k.setT(mm(TR(0, y, 0), RX(-Math.PI / 2))).prism(pts.map(([x, z]) => [x, -z]), t, c, { ...o, holes: o.holes ? o.holes.map((h) => h.map(([x, z]) => [x, -z])) : undefined }).setT(null);
// Clé plate : anneau de tête percé, tige à dents (x le long de la clé, anneau centré à l'origine)
function keyPts(L, rb, bw, seed = 1) {
  const P = [], a0 = Math.asin(Math.min(0.95, bw / 2 / rb)), r = mulberry32(seed), nT = 5;
  P.push([rb * Math.cos(a0), -bw / 2], [rb + L - bw * 0.6, -bw / 2], [rb + L, -bw * 0.1], [rb + L - bw * 0.25, bw / 2]);
  for (let i = 0; i < nT; i++) { const x = rb + L - bw * 0.6 - i * L * 0.8 / nT; P.push([x, bw / 2 - bw * (0.15 + 0.3 * r())], [x - L * 0.4 / nT, bw / 2]); }
  for (let i = 0; i <= 8; i++) { const a = a0 + (2 * Math.PI - 2 * a0) * i / 8; P.push([rb * Math.cos(a), rb * Math.sin(a)]); }
  return P;
}
// Clé posée à plat dont le trou est sur l'anneau (centre cx, cz, rayon Rr) à l'angle phi
function KEY(k, cx, cz, Rr, phi, y, L, rb, bw, c, seed) {
  const hx = cx + Math.cos(phi) * Rr, hz = cz + Math.sin(phi) * Rr, ox = hx + Math.cos(phi) * rb * 0.4, oz = hz + Math.sin(phi) * rb * 0.4;
  k.setT(mm(TR(ox, y, oz), RY(-phi), RX(-Math.PI / 2))).prism(keyPts(L, rb, bw, seed), 0.0018, c, { holes: [ellip(rb * 0.3, rb * 0.3, 8, -rb * 0.4, 0)], bev: k.lod ? 0 : 0.0004 }).setT(null);
}
const ringXZ = (k, cx, y, cz, R, r, c, n = 14) => { const P = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; P.push([cx + Math.cos(a) * R, y, cz + Math.sin(a) * R]); } k.sweep(P, r, c, { nu: 4 }); };
// Trousseau, passe-partout, clé à étiquette, porte-clés à breloque
S('keys', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id, y = -h / 2 + 0.0015;
  if (id === 'b13_key') { const cx = -w * 0.3, cz = -D * 0.15; ringXZ(k, cx, y + 0.001, cz, 0.008, 0.0009, 0x9e9e9e); KEY(k, cx, cz, 0.008, 0.1, y + 0.002, w * 0.42, 0.008, 0.0065, c, 13);
    k.sweep([[cx - 0.004, y + 0.001, cz + 0.006], [cx + 0.001, y + 0.001, cz + 0.011]], 0.0005, 0xd7ccc8, { nu: 3 }); k.setT(mm(TR(cx + 0.003, y, cz + 0.017), RY(0.3))).pbox(0, 0, 0, 0.017, 0.0008, 0.012, 0xf3e3c3, { Y: k.label(d.id + ':tag', 'B-13', 0xf3e3c3) }).setT(null); return; }
  const cx = -w * 0.22, cz = -D * 0.22, Rr = Math.min(w, D) * 0.14; ringXZ(k, cx, y + 0.0025, cz, Rr, 0.0011, 0xb0b4b8);
  if (id === 'prize_keychain') { // chaînette et étoile en plastique
    for (let i = 0; i < 3; i++) ringXZ(k, cx + Rr + 0.004 + i * 0.006, y + 0.002, cz + Rr * 0.6 + i * 0.006, 0.003, 0.0007, 0xc0c0c0, 8);
    k.setT(mm(TR(w * 0.12, y + 0.004, D * 0.12), RX(-Math.PI / 2))).prism(starPts(Math.min(w, D) * 0.3, Math.min(w, D) * 0.14), 0.007, c, { bev: 0.002, smooth: false }).setT(null); return;
  }
  if (d.p?.master) { KEY(k, cx, cz, Rr, Math.PI / 4, y + 0.002, Math.min(w, D) * 0.48, 0.011, 0.008, c, 7); return; }
  [0.45, 0.8, 1.15].forEach((phi, i) => KEY(k, cx, cz, Rr, phi, y + 0.0005 + i * 0.0021, Math.min(w, D) * (0.36 + 0.06 * (i % 2)), 0.009, 0.0068, i === 1 ? 0xb0b4b8 : c, i + 3));
});
// Crochets de serrurier : crochet à manche gainé, clé de tension coudée
S('lockpick', (k, s, c) => {
  const [w, h, D] = s, t = 0.0007, y0 = -h / 2;
  k.rbox(-w * 0.28, y0 + h * 0.3, -D * 0.2, w * 0.42, h * 0.55, D * 0.32, 0x1a1a1a, 0.0015);
  FLAT(k, [[-w * 0.07, -D * 0.23], [w * 0.4, -D * 0.23], [w * 0.44, -D * 0.12], [w * 0.47, -D * 0.12], [w * 0.47, -D * 0.06], [w * 0.42, -D * 0.06], [w * 0.4, -D * 0.17], [-w * 0.07, -D * 0.17]].map(([x, z]) => [x, z]), t, c, {}, y0 + h * 0.3);
  FLAT(k, [[-w * 0.45, D * 0.1], [w * 0.2, D * 0.1], [w * 0.2, D * 0.45], [w * 0.15, D * 0.45], [w * 0.15, D * 0.18], [-w * 0.45, D * 0.18]], 0.0012, 0x9e9e9e, {}, y0 + 0.0006);
});
// Cadenas : corps (laiton ou à code), entrée de clé ou molettes, anse en U chromée
S('padlock', (k, s, c, d) => {
  const [w, h, D] = s, code = d.id === 'padlock_code', bh = h * 0.56, by = -h / 2 + bh / 2, rt = Math.min(0.005, w * 0.09), R = w * 0.3 - rt * 0.2, yb = by + bh / 2, yc = h / 2 - rt - R;
  k.rbox(0, by, 0, w, bh, D, c, Math.min(0.006, D * 0.3));
  const P = [[-R, yb - 0.003, 0], [-R, yc, 0]]; for (let i = 1; i < 8; i++) { const a = Math.PI - i / 8 * Math.PI; P.push([Math.cos(a) * R, yc + Math.sin(a) * R, 0]); } P.push([R, yc, 0], [R, yb - 0.003, 0]);
  k.sweep(P, rt, 0xc8ccd0, { nu: 8 });
  if (code) { for (let i = 0; i < 4; i++) { const x = (i - 1.5) * w * 0.2; k.tube(x, by - bh * 0.12, D / 2 - 0.005, 0.0048, w * 0.16, 0x262626, k.lod ? 6 : 10, { m: RZ(Math.PI / 2) }); deco(k, x, by - bh * 0.12, D / 2 - 0.0001, 0.0025, 0.0035, 0.0006, 0xf5f5f5); } return; }
  k.tube(0, by - bh * 0.08, D / 2 - 0.0002, 0.0042, 0.0012, 0x1a1a1a, 10, { m: RX(Math.PI / 2) }); deco(k, 0, by - bh * 0.22, D / 2, 0.0018, 0.008, 0.0012, 0x1a1a1a);
  if (!k.lod) for (const sx of [-1, 1]) deco(k, sx * w * 0.5, by, 0, 0.0008, bh * 0.85, D * 0.6, shade(c, 0.8));
});
// Bâtonnets (outils, cosmétiques, jouets, instruments) : un modèle par article, axe le long de z
const LIPSTICK = (k, [w, h, L], c) => {
  const R = Math.min(w, h) / 2, z0 = -L / 2, gold = 0xc9a227, bz = z0 + L * 0.55;
  ZL(k, [{ r: R * 0.92, y: z0 }, { r: R, y: z0 + 0.002, p: 'b' }, { r: R, y: z0 + L * 0.42, p: 'b', h: 1 }, { r: R * 0.96, y: z0 + L * 0.42, p: 'g', h: 1 }, { r: R * 0.96, y: bz - 0.002, p: 'g' }, { r: R * 0.78, y: bz, p: 'g', h: 1 }], 12, { b: { c: 0x1a1a1a }, g: { c: gold } }, { bottom: 0x1a1a1a, top: gold });
  const r = R * 0.62, zt = L / 2 - 0.001, sl = Math.min(L / 2 - bz - 0.004, r * 1.1);
  k.surf(k.lod ? 6 : 12, 2, (u, v) => { const a = 2 * Math.PI * (u - 0.5); if (v === 0) return [r * Math.sin(a), -r * Math.cos(a), bz - 0.001]; if (v < 1) return [r * Math.sin(a), -r * Math.cos(a), zt - sl * (1 - Math.cos(a)) / 2]; return [0, 0, zt - sl / 2]; }, c);
};
const STK = {
  crowbar: (k, [w, h, L], c) => { const r = Math.min(w, h) * 0.3, y0 = -h / 2 + r; k.sweep(spl([[0, y0 + 0.002, -L / 2 + 0.004], [0, y0 + 0.0005, -L / 2 + 0.04], [0, y0, -L * 0.3], [0, y0, L * 0.3], [0, y0 + 0.003, L / 2 - 0.05], [0, y0 + 0.01, L / 2 - 0.02], [0, h / 2 - r, L / 2 - r - 0.002]], k.lod ? 6 : 14), (t) => r * (t < 0.04 ? 0.55 + t / 0.04 * 0.45 : t > 0.93 ? 1 - (t - 0.93) / 0.07 * 0.4 : 1), c, { nu: 6, rz: 0.85 }); k.box(0, h / 2 - r * 1.1, L / 2 - r * 1.2, 0.0015, r * 1.4, r * 1.2, 0x1a1a1a); },
  baseball_bat: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2; ZL(k, [{ r: R * 0.5, y: z0 }, { r: R * 0.55, y: z0 + 0.008, p: 'k' }, { r: R * 0.36, y: z0 + 0.016, p: 'k', h: 1 }, { r: R * 0.38, y: z0 + 0.018, p: 'g' }, { r: R * 0.4, y: z0 + L * 0.3, p: 'g', h: 1 }, { r: R * 0.42, y: z0 + L * 0.32, p: 'a' }, { r: R * 0.62, y: z0 + L * 0.55, p: 'a' }, { r: R * 0.95, y: z0 + L * 0.8, p: 'a' }, { r: R, y: z0 + L * 0.92, p: 'a' }, { r: R * 0.85, y: L / 2 - 0.004, p: 'a' }, { r: R * 0.5, y: L / 2, p: 'a' }], 12, { k: { c: shade(c, 0.85) }, g: { c: 0x1e1e1e, rect: k.lod ? null : ridgeTex(k, 12) }, a: { c } }, { bottom: shade(c, 0.8), top: shade(c, 0.9) }); },
  screwdriver: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, hl = L * 0.42; ZL(k, [{ r: R * 0.7, y: z0 }, { r: R * 0.92, y: z0 + 0.004, p: 'a' }, { r: R, y: z0 + hl * 0.3, p: 'g' }, { r: R * 0.95, y: z0 + hl * 0.8, p: 'g', h: 1 }, { r: R * 0.8, y: z0 + hl * 0.86, p: 'a' }, { r: R * 0.5, y: z0 + hl, p: 'a', h: 1 }, { r: R * 0.42, y: z0 + hl, p: 'm', h: 1 }, { r: R * 0.42, y: z0 + hl + 0.006, p: 'm', h: 1 }, { r: R * 0.27, y: z0 + hl + 0.007, p: 's' }, { r: R * 0.27, y: L / 2 - 0.012, p: 's' }, { r: R * 0.3, rz: R * 0.1, y: L / 2 - 0.004, p: 's' }, { r: R * 0.28, rz: R * 0.05, y: L / 2, p: 's' }], 10, { a: { c }, g: { c: 0x212121, rect: k.lod ? null : ridgeTex(k, 10) }, m: { c: 0xb0b4b8 }, s: { c: 0xc8ccd0 } }, { bottom: shade(c, 0.85), top: 0xc8ccd0 }); },
  wrench: (k, [w, h, L], c) => { const t = h * 0.55, hw = w * 0.2, hz = L / 2 - L * 0.24, O = [];
    for (let i = 0; i <= 5; i++) { const a = Math.PI + i / 5 * Math.PI; O.push([Math.cos(a) * hw, -L / 2 + hw + Math.sin(a) * hw]); }
    O.push([hw * 1.05, hz - L * 0.04], [w * 0.32, hz], [w * 0.5, hz + L * 0.07], [w * 0.5, L / 2 - L * 0.01], [w * 0.18, L / 2], [w * 0.12, L / 2 - L * 0.08], [-w * 0.1, L / 2 - L * 0.08], [-w * 0.14, L / 2 - L * 0.005], [-w * 0.42, L / 2 - L * 0.02], [-w * 0.48, hz + L * 0.06], [-w * 0.3, hz], [-hw * 1.05, hz - L * 0.04]);
    FLAT(k, O, t, c, { holes: [ellip(hw * 0.45, hw * 0.45, 8, 0, -L / 2 + hw * 1.3)], bev: k.lod ? 0 : 0.001, cs: shade(c, 0.85) });
    k.tube(0, 0, hz + L * 0.05, 0.005, w * 0.5, 0x9e9e9e, k.lod ? 6 : 10, { m: RZ(Math.PI / 2), rect: k.lod ? null : ridgeTex(k, 14) }); },
  saw: (k, [w, h, L], c) => { const z0 = -L / 2 + L * 0.24, B = [[w * 0.3, z0], [-w * 0.48, z0]], nt = k.lod ? 0 : 16;
    for (let i = 0; i < nt; i++) { const z = z0 + (L / 2 - z0 - 0.004) * (i + 0.5) / nt; B.push([-w * 0.48, z - 0.004], [-w * 0.5, z]); }
    B.push([-w * 0.48, L / 2], [-w * 0.18, L / 2]); FLAT(k, B, 0.0012, 0xc8ccd0, {});
    FLAT(k, [[-w * 0.46, -L / 2 + 0.01], [-w * 0.3, -L / 2], [w * 0.45, -L / 2 + 0.01], [w * 0.48, z0 - 0.01], [w * 0.36, z0 + 0.03], [-w * 0.44, z0 + 0.02]], h * 0.85, 0x8d5524, { holes: [rrect(w * 0.5, L * 0.07, 0.01, 2, w * 0.02, -L / 2 + L * 0.09)], bev: k.lod ? 0 : 0.002, smooth: true });
    for (const [x, z] of [[-w * 0.3, z0 + 0.008], [w * 0.2, z0 + 0.012], [-w * 0.05, z0 - 0.01]]) k.tube(x, 0, z, 0.003, h * 0.9, 0xc9a227, 6); },
  kaleidoscope: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2; ZL(k, [{ r: R * 0.55, y: z0 }, { r: R * 0.85, y: z0 + 0.002, p: 'b', h: 1 }, { r: R * 0.9, y: z0 + 0.012, p: 'b', h: 1 }, { r: R * 0.82, y: z0 + 0.013, p: 'a' }, { r: R * 0.82, y: L / 2 - 0.03, p: 'a', h: 1 }, { r: R, y: L / 2 - 0.028, p: 'b' }, { r: R, y: L / 2 - 0.004, p: 'b', h: 1 }, { r: R * 0.85, y: L / 2, p: 'c', h: 1 }], 12, { a: { c: 0xffffff, rect: k.lod ? null : k.shared('stripes:kal:' + c, 64, 16, { kind: 'stripes', n: 10, bg: c }) }, b: { c: 0xd4af37 }, c: { c: 0xffe082 } }, { bottom: 0x1a1a1a, top: 0xfff3c4 }); if (!k.lod) for (let i = 0; i < 3; i++) { const a = i * 2.1; deco(k, Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4, L / 2 + 0.0002, 0.004, 0.004, 0.0006, [0xe53935, 0x43a047, 0x1e88e5][i]); } },
  thermometer: (k, [w, h, L], c) => { const z0 = -L / 2, bl = L * 0.7, t = h * 0.65; FLAT(k, rrect(w * 0.95, bl, w * 0.45, k.lod ? 2 : 4, 0, z0 + bl / 2), t, c, { bev: 0.0015, smooth: true }); ZL(k, [{ r: 0.0024, y: z0 + bl - 0.002 }, { r: 0.0019, y: L / 2 - 0.003, p: 'm' }, { r: 0.0012, y: L / 2, p: 'm' }], 8, { m: { c: 0xc8ccd0 } }, { top: 0xc8ccd0 }); deco(k, 0, t / 2, z0 + bl * 0.55, w * 0.6, 0.0006, bl * 0.3, 0x546e7a); deco(k, 0, t / 2, z0 + bl * 0.18, w * 0.35, 0.0008, w * 0.35, 0x29b6f6); },
  cat_toy: (k, [w, h, L], c) => { const z0 = -L / 2; ZL(k, [{ r: 0.0035, y: z0 }, { r: 0.0035, y: z0 + L * 0.62, p: 'a' }, { r: 0.0025, y: z0 + L * 0.64, p: 'a' }], 6, { a: { c: 0xf5f5f5 } }, { bottom: 0xf5f5f5 }); k.sweep([[0, 0, z0 + L * 0.63], [0.002, -0.002, z0 + L * 0.7], [0, -0.001, z0 + L * 0.76]], 0.0006, 0x9e9e9e, { nu: 3 }); for (let i = 0; i < (k.lod ? 3 : 6); i++) { const a = i / 6 * Math.PI * 2; leafAt(k, 0, -0.001, z0 + L * 0.76, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 1, L * 0.22, w * 0.45, i % 2 ? c : shade(c, 1.25), 0.15); } },
  toothbrush: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, hz = L / 2 - L * 0.06; ZL(k, [{ r: R * 0.8, y: z0 }, { r: R * 0.95, y: z0 + 0.006, p: 'a' }, { r: R * 0.95, y: z0 + 0.012, p: 'r', h: 1 }, { r: R * 0.97, y: z0 + 0.018, p: 'r', h: 1 }, { r: R, y: z0 + L * 0.3, p: 'a' }, { r: R * 0.88, y: z0 + L * 0.55, p: 'a' }, { r: R * 0.55, y: z0 + L * 0.62, p: 'a', h: 1 }, { r: R * 0.5, y: z0 + L * 0.63, p: 'n' }, { r: R * 0.22, y: z0 + L * 0.72, p: 'n' }, { r: R * 0.2, y: hz - L * 0.04, p: 'n' }], 12, { a: { c: 0xf5f5f5 }, r: { c }, n: { c: 0xf5f5f5 } }, { bottom: 0xbdbdbd }); deco(k, 0, R * 0.97, z0 + L * 0.42, R * 0.6, 0.0016, R * 0.9, c); k.orb(0, 0, hz, R * 0.38, R * 0.32, L * 0.06, 0xf5f5f5, 8, 5); k.tube(0, R * 0.3 + 0.004, hz, R * 0.34, 0.008, 0xe0f7fa, 8, { tc: c }); },
  lipstick: LIPSTICK, lipstick_red: LIPSTICK, lipstick_pink: LIPSTICK, lipstick_nude: LIPSTICK,
  golf_club: (k, [w, h, L], c) => { const z0 = -L / 2; ZL(k, [{ r: 0.0075, y: z0 }, { r: 0.0085, y: z0 + 0.004, p: 'g' }, { r: 0.0078, y: z0 + L * 0.26, p: 'g', h: 1 }, { r: 0.0048, y: z0 + L * 0.27, p: 'a' }, { r: 0.0034, y: L / 2 - 0.06, p: 'a' }, { r: 0.006, y: L / 2 - 0.045, p: 'a', h: 1 }], 8, { g: { c: 0x1e1e1e, rect: k.lod ? null : ridgeTex(k, 12) }, a: { c } }, { bottom: 0x111111 }); k.setT(mm(TR(0, -h * 0.06, L / 2 - 0.021), RX(0.35))).rbox(0, 0, 0, w * 0.85, h * 0.6, 0.036, 0xb0b8c0, 0.004).setT(null); if (!k.lod) for (let i = 0; i < 4; i++) deco(k, 0, -h * 0.3 + i * 0.004, L / 2 - 0.002 - i * 0.0014, w * 0.6, 0.0008, 0.002, 0x6d757d); },
  flute: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2; ZL(k, [{ r: R * 0.35, rz: R * 0.2, y: z0 }, { r: R * 0.62, rz: R * 0.4, y: z0 + 0.012, p: 'm' }, { r: R * 0.9, y: z0 + 0.04, p: 'm' }, { r: R, y: z0 + 0.075, p: 'm', h: 1 }, { r: R * 0.82, y: z0 + 0.08, p: 'a' }, { r: R * 0.72, y: L / 2 - 0.06, p: 'a', h: 1 }, { r: R * 0.85, y: L / 2 - 0.055, p: 'f' }, { r: R * 0.78, y: L / 2 - 0.035, p: 'f' }, { r: R * 0.95, y: L / 2 - 0.004, p: 'f' }, { r: R, y: L / 2, p: 'f' }], 12, { m: { c }, a: { c }, f: { c } }, { bottom: 0x3e2723, top: 0x2a1d14 }); deco(k, 0, R * 0.84, z0 + 0.05, R * 0.6, 0.0012, 0.006, 0x2a1d14); if (!k.lod) for (let i = 0; i < 7; i++) deco(k, 0, R * 0.76, z0 + 0.1 + i * 0.022, 0.0035, 0.0012, 0.0035, 0x3e2723); },
  magic_wand: (k, [w, h, L], c) => { const z0 = -L / 2, sr = Math.min(w, h) * 0.5; ZL(k, [{ r: 0.0028, y: z0 }, { r: 0.0032, y: z0 + 0.004, p: 'a' }, { r: 0.0026, y: L / 2 - sr * 1.4, p: 'a' }], 8, { a: { c: 0xffffff, rect: k.lod ? null : k.shared('stripes:wand:' + c, 64, 16, { kind: 'stripes', n: 8, bg: c }) } }, { bottom: c }); k.setT(mm(TR(0, 0, L / 2 - sr), RY(Math.PI / 2))).prism(starPts(sr, sr * 0.45), 0.003, c, { bev: k.lod ? 0 : 0.0008 }).setT(null); },
  plastic_sword: (k, [w, h, L], c) => { const z0 = -L / 2, gz = z0 + L * 0.2, bw = w * 0.34, t = h * 0.3; FLAT(k, [[-bw, gz], [bw, gz], [bw * 0.85, L / 2 - bw * 2.2], [0, L / 2], [-bw * 0.85, L / 2 - bw * 2.2]], t, c, { bev: t * 0.45 }); k.rbox(0, 0, gz, w, h * 0.7, 0.012, 0xffb300, 0.003); ZL(k, [{ r: 0.007, y: z0 + 0.012 }, { r: 0.0075, y: z0 + 0.016, p: 'g' }, { r: 0.0075, y: gz - 0.006, p: 'g' }], 10, { g: { c: 0x6d4c41, rect: k.lod ? null : ridgeTex(k, 14) } }, {}); k.orb(0, 0, z0 + 0.009, 0.0095, 0.0095, 0.0095, 0xffb300, 8, 6); },
  chopsticks: (k, [w, h, L], c) => { for (const sx of [-1, 1]) ZL(k, [{ r: w * 0.24, y: -L / 2 }, { r: w * 0.25, y: -L / 2 + L * 0.35, p: 'a' }, { r: w * 0.1, y: L / 2, p: 'a' }], 4, { a: { c } }, { bottom: shade(c, 0.85), top: shade(c, 0.9) }, sx * w * 0.25, 0); },
  microphone: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, hr = R * 0.98; ZL(k, [{ r: R * 0.45, y: z0 }, { r: R * 0.5, y: z0 + 0.004, p: 'k', h: 1 }, { r: R * 0.52, y: z0 + 0.012, p: 'a' }, { r: R * 0.72, y: L / 2 - hr * 1.7, p: 'a' }, { r: R * 0.8, y: L / 2 - hr * 1.55, p: 'r', h: 1 }], 12, { k: { c: 0x111111 }, a: { c }, r: { c: 0xb0b4b8 } }, { bottom: 0x111111 }); k.orb(0, 0, L / 2 - hr, hr, hr, hr, 0xb8bcc0, k.lod ? 8 : 12, k.lod ? 6 : 9, { rect: k.lod ? null : k.shared('grille:mesh', 32, 32, { kind: 'grille', holes: true, bg: 0xb8bcc0, n: 10 }) }); deco(k, 0, R * 0.62, z0 + L * 0.45, R * 0.35, 0.002, R * 0.7, 0x424242); },
  foam_dart: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2; ZL(k, [{ r: R * 0.92, y: -L / 2 }, { r: R, y: -L / 2 + 0.002, p: 'a' }, { r: R, y: L / 2 - 0.016, p: 'a', h: 1 }, { r: R, y: L / 2 - 0.015, p: 't' }, { r: R * 0.95, y: L / 2 - 0.006, p: 't' }, { r: R * 0.6, y: L / 2 - 0.001, p: 't' }, { r: 0.0005, y: L / 2, p: 't' }], 10, { a: { c }, t: { c: 0x1565c0 } }, { bottom: shade(c, 0.8) }); },
  umbrella_compact: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, hl = L * 0.3, pr = (t) => R * (0.62 + 0.28 * Math.sin(Math.PI * Math.min(1, t * 1.25)) ** 0.6) * (1 - 0.65 * Math.max(0, t - 0.8) / 0.2);
    ZL(k, [{ r: R * 0.55, y: z0 }, { r: R * 0.62, y: z0 + 0.006, p: 'h' }, { r: R * 0.6, y: z0 + hl, p: 'h', h: 1 }, { r: R * 0.25, y: z0 + hl + 0.004, p: 'm' }], 10, { h: { c: 0x1a1a1a, rect: k.lod ? null : ridgeTex(k, 10) }, m: { c: 0x9e9e9e } }, { bottom: 0x1a1a1a });
    k.surf(k.lod ? 8 : 16, k.lod ? 3 : 6, (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = pr(v) * (1 + 0.09 * Math.cos(a * 8)); return [r * Math.sin(a), -r * Math.cos(a), z0 + hl + 0.003 + (L - hl - 0.016) * v]; }, c);
    ZL(k, [{ r: R * 0.18, y: L / 2 - 0.014 }, { r: R * 0.12, y: L / 2 - 0.002, p: 'm' }, { r: R * 0.08, y: L / 2, p: 'm' }], 8, { m: { c: 0x9e9e9e } }, { top: 0x9e9e9e });
    const zs = z0 + hl + (L - hl) * 0.5; ZL(k, [{ r: pr(0.5) * 1.1 + 0.0006, y: zs }, { r: pr(0.53) * 1.1 + 0.0006, y: zs + 0.012, p: 's' }], 10, { s: { c: shade(c, 0.6) } }, {}); },
  lip_balm: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2; ZL(k, [{ r: R * 0.92, y: -L / 2 }, { r: R, y: -L / 2 + 0.002, p: 'b' }, { r: R, y: -L / 2 + L * 0.58, p: 'b', h: 1 }, { r: R * 0.97, y: -L / 2 + L * 0.58, p: 'c', h: 1 }, { r: R, y: -L / 2 + L * 0.6, p: 'c' }, { r: R, y: L / 2 - 0.002, p: 'c' }, { r: R * 0.9, y: L / 2, p: 'c' }], 10, { b: { c: 0xf5f5f5 }, c: { c } }, { bottom: 0xe0e0e0, top: c }); },
  hacksaw: (k, [w, h, L], c) => { const X = (f) => f * w, Z = (f) => f * L; k.sweep([[X(-0.3), 0, Z(0.46)], [X(0.38), 0, Z(0.46)], [X(0.42), 0, Z(0.4)], [X(0.42), 0, Z(-0.3)], [X(0.36), 0, Z(-0.34)], [X(-0.3), 0, Z(-0.34)]], 0.004, c, { nu: 6, rz: 0.7 }); k.box(X(-0.3), 0, Z(0.06), 0.012, 0.0008, L * 0.8, 0xc0c4c8); if (!k.lod) k.box(X(-0.37), 0, Z(0.06), 0.002, 0.0009, L * 0.78, 0x6d757d); FLAT(k, [[X(-0.24), Z(-0.33)], [X(0.4), Z(-0.33)], [X(0.4), Z(-0.36)], [X(-0.2), Z(-0.5)], [X(-0.48), Z(-0.47)], [X(-0.42), Z(-0.4)]], h * 0.9, 0x212121, { bev: k.lod ? 0 : 0.002 }); k.tube(X(-0.3), 0, Z(0.47), 0.006, h * 0.9, 0x9e9e9e, 8); },
  chisel: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, hl = L * 0.5; ZL(k, [{ r: R * 0.75, y: z0 }, { r: R * 0.95, y: z0 + 0.006, p: 'a' }, { r: R, y: z0 + hl * 0.6, p: 'a' }, { r: R * 0.8, y: z0 + hl - 0.008, p: 'a', h: 1 }, { r: R * 0.82, y: z0 + hl - 0.007, p: 'm' }, { r: R * 0.7, y: z0 + hl, p: 'm', h: 1 }], 10, { a: { c }, m: { c: 0xb0b4b8 } }, { bottom: shade(c, 0.85) }); FLAT(k, [[-R * 0.6, z0 + hl - 0.002], [R * 0.6, z0 + hl - 0.002], [R * 0.75, L / 2 - 0.01], [R * 0.75, L / 2], [-R * 0.75, L / 2], [-R * 0.75, L / 2 - 0.01]], R * 0.45, 0xc8ccd0, { bev: k.lod ? 0 : 0.0006 }); },
  broom: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, bz = L / 2 - L * 0.28, br = (f) => 0.013 + (R - 0.013) * Math.pow(f, 0.7); ZL(k, [{ r: 0.011, y: z0 }, { r: 0.012, y: z0 + 0.006, p: 'a' }, { r: 0.012, y: bz + 0.02, p: 'a' }], 8, { a: { c } }, { bottom: shade(c, 0.8) });
    k.surf(k.lod ? 8 : 16, k.lod ? 2 : 4, (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = br(v) * (1 + 0.04 * Math.sin(a * 13 + v * 7)); return [r * Math.sin(a), -r * Math.cos(a), bz + (L / 2 - bz) * v]; }, 0xd9b45c, { col: (u, v) => (hn(u * 37, v * 5) > 0.6 ? 0xc9a24c : 0xe0bf6a) });
    for (const f of [0.08, 0.3]) ZL(k, [{ r: br(f) * 1.04 + 0.001, y: bz + (L / 2 - bz) * f }, { r: br(f + 0.04) * 1.04 + 0.001, y: bz + (L / 2 - bz) * (f + 0.04), p: 'w' }], 8, { w: { c: 0x8d1f1f } }, {});
    k.tube(0, 0, L / 2 - 0.0005, R * 0.98, 0.001, 0xc9a24c, 10, { m: RX(Math.PI / 2) }); },
  fish_net: (k, [w, h, L], c) => { const z0 = -L / 2, fz = L / 2 - w * 0.47; ZL(k, [{ r: 0.004, y: z0 }, { r: 0.0045, y: z0 + 0.005, p: 'a' }, { r: 0.0042, y: z0 + L * 0.35, p: 'a', h: 1 }, { r: 0.0022, y: z0 + L * 0.36, p: 'm' }, { r: 0.0022, y: fz - w * 0.44, p: 'm' }], 8, { a: { c }, m: { c: 0xb0b4b8 } }, { bottom: c });
    const F = rrect(w * 0.94, w * 0.9, w * 0.2, k.lod ? 2 : 3, 0, fz).map(([x, z]) => [x, 0, z]); F.push(F[0]); k.sweep(F, 0.0018, 0xb0b4b8, { nu: 4 });
    const mesh = k.lod ? null : k.shared('grille:net', 32, 32, { kind: 'grille', holes: true, bg: 0x2e7d32, n: 9 });
    for (const fl of [false, true]) k.surf(4, 4, (u, v) => [(u - 0.5) * w * 0.88, -h * 0.3 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) + (fl ? -0.0004 : 0), fz + (v - 0.5) * w * 0.84], 0x66bb6a, { open: true, flip: !fl, rect: mesh }); },
  ballpoint_pen: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2; ZL(k, [{ r: R * 0.86, y: z0 + 0.004 }, { r: R * 0.86, y: L / 2 - 0.03, p: 'b' }, { r: R * 0.6, y: L / 2 - 0.022, p: 'b' }], 6, { b: { c: 0xf2f4f5 } }, {}); ZL(k, [{ r: R * 0.5, y: z0 }, { r: R * 0.6, y: z0 + 0.004, p: 'e' }], 8, { e: { c } }, { bottom: c, top: c }); ZL(k, [{ r: R * 0.95, y: L / 2 - 0.035 }, { r: R, y: L / 2 - 0.03, p: 'c' }, { r: R * 0.9, y: L / 2 - 0.003, p: 'c' }, { r: R * 0.55, y: L / 2, p: 'c' }], 8, { c: { c } }, { bottom: c, top: c }); k.box(0, R * 0.9, L / 2 - 0.022, R * 0.5, 0.0008, 0.03, c); },
  toy_microphone: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, hr = R * 0.95; ZL(k, [{ r: R * 0.42, y: z0 }, { r: R * 0.45, y: z0 + 0.004, p: 'a' }, { r: R * 0.55, y: L / 2 - hr * 1.75, p: 'a' }, { r: R * 0.78, y: L / 2 - hr * 1.45, p: 'r' }, { r: R * 0.82, y: L / 2 - hr * 1.4, p: 'r', h: 1 }], 12, { a: { c }, r: { c: 0xf5f5f5 } }, { bottom: shade(c, 0.8) }); k.orb(0, 0, L / 2 - hr, hr, hr, hr, 0xd0d4d8, k.lod ? 8 : 12, k.lod ? 6 : 9, { rect: k.lod ? null : k.shared('grille:mesh', 32, 32, { kind: 'grille', holes: true, bg: 0xb8bcc0, n: 10 }) }); for (let i = 0; i < 3; i++) deco(k, 0, R * 0.5, z0 + L * (0.3 + i * 0.08), R * 0.25, 0.002, R * 0.25, [0xffeb3b, 0x00e5ff, 0x76ff03][i]); },
  selfie_stick: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, gl = L * 0.36; ZL(k, [{ r: R * 0.75, y: z0 }, { r: R * 0.85, y: z0 + 0.006, p: 'g' }, { r: R * 0.85, y: z0 + gl, p: 'g', h: 1 }, { r: R * 0.5, y: z0 + gl + 0.003, p: 'a' }, { r: R * 0.48, y: z0 + gl + L * 0.2, p: 'a', h: 1 }, { r: R * 0.4, y: z0 + gl + L * 0.2 + 0.002, p: 'a' }, { r: R * 0.38, y: L / 2 - 0.05, p: 'a', h: 1 }], 10, { g: { c: 0x2a2a2a }, a: { c: 0x3a3a3a } }, { bottom: 0x1a1a1a }); deco(k, 0, R * 0.84, z0 + gl * 0.7, R * 0.45, 0.002, R * 0.5, 0x1e88e5); k.rbox(0, 0, L / 2 - 0.025, w * 0.9, h * 0.6, 0.042, 0x212121, 0.004); for (const z of [L / 2 - 0.002, L / 2 - 0.048]) k.pbox(0, 0, z, w * 0.9, h * 0.72, 0.004, 0x37474f); },
  mascara: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2; ZL(k, [{ r: R * 0.9, y: z0 }, { r: R, y: z0 + 0.002, p: 'b' }, { r: R, y: z0 + L * 0.42, p: 'b', h: 1 }, { r: R * 0.96, y: z0 + L * 0.42, p: 'g', h: 1 }, { r: R * 0.96, y: z0 + L * 0.44, p: 'g', h: 1 }, { r: R * 0.98, y: z0 + L * 0.44, p: 'c', h: 1 }, { r: R, y: z0 + L * 0.46, p: 'c' }, { r: R * 0.9, y: L / 2 - 0.002, p: 'c' }, { r: R * 0.7, y: L / 2, p: 'c' }], 10, { b: { c: shade(c, 1.6) }, g: { c: 0xc9a227 }, c: { c } }, { bottom: shade(c, 1.6), top: c }); },
  eyeliner: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2; ZL(k, [{ r: R * 0.85, y: -L / 2 }, { r: R * 0.95, y: -L / 2 + 0.002, p: 'a' }, { r: R * 0.95, y: L / 2 - 0.018, p: 'a', h: 1 }, { r: R * 0.92, y: L / 2 - 0.0175, p: 'w' }, { r: R * 0.35, y: L / 2 - 0.004, p: 'w', h: 1 }, { r: R * 0.32, y: L / 2 - 0.0035, p: 'l' }, { r: R * 0.06, y: L / 2, p: 'l' }], 8, { a: { c }, w: { c: 0xd9b48a }, l: { c: 0x1a1a1a } }, { bottom: 0xc9a227 }); },
  shoe_horn: (k, [w, h, L], c) => { const z0 = -L / 2, hwf = (t) => w * (t < 0.45 ? 0.2 + 0.05 * Math.sin(t / 0.45 * Math.PI) : 0.2 + 0.28 * Math.sin(Math.min(1, (t - 0.45) / 0.45) * Math.PI / 2)) * (t > 0.95 ? 1 - (t - 0.95) / 0.05 * 0.3 : 1), curl = (t, sx) => -h * 0.32 * (1 - sx * sx) * Math.min(1, t / 0.4);
    for (const fl of [true, false]) k.surf(k.lod ? 3 : 6, k.lod ? 6 : 12, (u, v) => { const sx = (u - 0.5) * 2; return [sx * hwf(v), curl(v, sx) + h * 0.12, z0 + L * v]; }, fl ? c : shade(c, 0.9), { open: true, flip: fl }); },
  kazoo: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2; ZL(k, [{ r: R * 0.5, y: z0 }, { r: R * 0.55, y: z0 + 0.003, p: 'a', h: 1 }, { r: R * 0.6, y: z0 + 0.004, p: 'a' }, { r: R * 0.92, y: L / 2 - 0.03, p: 'a' }, { r: R * 0.95, y: L / 2 - 0.004, p: 'a', h: 1 }, { r: R * 0.85, y: L / 2, p: 'a' }], 10, { a: { c } }, { bottom: 0x1a1a1a, top: 0x1a1a1a }); k.tube(0, R * 0.7, L / 2 - 0.035, R * 0.45, R * 0.6, c, 8, { tc: 0xf5f5f5 }); },
  drumsticks: (k, [w, h, L], c) => { const R = Math.min(w, h) / 4; for (const sx of [-1, 1]) ZL(k, [{ r: R * 0.7, y: -L / 2 }, { r: R * 0.95, y: -L / 2 + 0.004, p: 'a' }, { r: R, y: -L / 2 + L * 0.55, p: 'a' }, { r: R * 0.45, y: L / 2 - 0.012, p: 'a' }, { r: R * 0.42, y: L / 2 - 0.01, p: 'a' }, { r: R * 0.62, y: L / 2 - 0.005, p: 'a' }, { r: R * 0.3, y: L / 2, p: 'a' }], 8, { a: { c } }, { bottom: shade(c, 0.85) }, sx * R * 1.02, 0); },
  pirate_hook: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, cl = L * 0.42, rh = Math.min(0.013, R * 0.42), z1 = L / 2 - rh - 0.003; ZL(k, [{ r: R * 0.78, y: z0 }, { r: R * 0.92, y: z0 + 0.004, p: 'l' }, { r: R * 0.62, y: z0 + cl, p: 'l', h: 1 }, { r: R * 0.32, y: z0 + cl, p: 'm', h: 1 }, { r: R * 0.28, y: z0 + cl + 0.012, p: 'm' }], 12, { l: { c: 0x5d4037 }, m: { c: 0x9e9e9e } }, { bottom: 0x1a1a1a, top: 0x9e9e9e });
    const P = [[0, 0, z0 + cl + 0.01], [0, 0, z1]]; for (let i = 1; i <= 10; i++) { const f = i / 10 * Math.PI * 1.25; P.push([0, rh - rh * Math.cos(f), z1 + rh * Math.sin(f)]); } k.sweep(P, (t) => 0.0045 * (1 - 0.65 * t * t), c, { nu: 6, cap1: true }); },
  curling_iron: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, hl = L * 0.42; ZL(k, [{ r: R * 0.35, y: z0 }, { r: R * 0.5, y: z0 + 0.012, p: 's' }, { r: R * 0.62, y: z0 + 0.02, p: 'a' }, { r: R * 0.7, y: z0 + hl * 0.6, p: 'a' }, { r: R * 0.6, y: z0 + hl, p: 'a', h: 1 }, { r: R * 0.42, y: z0 + hl, p: 'm', h: 1 }, { r: R * 0.42, y: L / 2 - 0.016, p: 'm', h: 1 }, { r: R * 0.45, y: L / 2 - 0.015, p: 't' }, { r: R * 0.3, y: L / 2, p: 't' }], 12, { s: { c: 0x2a2a2a }, a: { c }, m: { c: 0xc8ccd0 }, t: { c: 0x1a1a1a } }, { bottom: 0x2a2a2a, top: 0x1a1a1a });
    for (const [rr, fl] of [[0.5, true], [0.47, false]]) k.surf(k.lod ? 3 : 6, 1, (u, v) => { const a = Math.PI * (0.15 + 0.7 * u), r = R * rr; return [-r * Math.cos(a), r * Math.sin(a), z0 + hl + 0.006 + (L - hl - 0.03) * v]; }, 0xb0b4b8, { open: true, flip: fl }); k.pbox(0, R * 0.62, z0 + hl - 0.012, R * 0.5, R * 0.3, 0.03, 0x2a2a2a); deco(k, 0, R * 0.68, z0 + hl * 0.5, R * 0.5, 0.002, R * 0.8, 0x80deea); },
  tripod: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, hz = L / 2 - 0.05;
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5, x = Math.cos(a) * R * 0.42, y = Math.sin(a) * R * 0.42; ZL(k, [{ r: R * 0.13, y: z0 }, { r: R * 0.16, y: z0 + 0.012, p: 'f' }, { r: R * 0.17, y: z0 + 0.014, p: 'a' }, { r: R * 0.17, y: z0 + L * 0.42, p: 'a', h: 1 }, { r: R * 0.21, y: z0 + L * 0.43, p: 'a' }, { r: R * 0.21, y: hz - 0.02, p: 'a', h: 1 }], 8, { f: { c: 0x1a1a1a }, a: { c } }, { bottom: 0x111111 }, x, y); k.pbox(x * 1.35, y * 1.35, z0 + L * 0.42, R * 0.18, R * 0.18, 0.022, 0x2a2a2a); }
    ZL(k, [{ r: R * 0.6, y: hz - 0.022 }, { r: R * 0.62, y: hz - 0.01, p: 'a' }, { r: R * 0.45, y: hz, p: 'a', h: 1 }, { r: R * 0.25, y: hz + 0.004, p: 'b' }], 10, { a: { c: 0x2a2a2a }, b: { c: 0x3a3a3a } }, { bottom: 0x2a2a2a });
    k.orb(0, 0, hz + 0.016, R * 0.38, R * 0.38, R * 0.38, 0x2a2a2a, 8, 6); k.rbox(0, 0, L / 2 - 0.008, R * 1.5, R * 1.2, 0.012, 0x1a1a1a, 0.003); k.sweep([[R * 0.3, 0, hz + 0.01], [R * 0.85, R * 0.5, hz - 0.03], [R * 0.85, R * 0.6, hz - 0.12]], 0.004, 0x1a1a1a, { nu: 6 }); },
  toilet_brush: (k, [w, h, L], c) => { const R = Math.min(w, h) / 2, z0 = -L / 2, br = R * 0.95, bz = L / 2 - br; ZL(k, [{ r: 0.008, y: z0 }, { r: 0.0095, y: z0 + 0.008, p: 'a' }, { r: 0.0075, y: z0 + 0.06, p: 'a' }, { r: 0.006, y: bz - br * 0.6, p: 'a' }, { r: 0.0035, y: bz, p: 'm' }], 10, { a: { c }, m: { c: 0x9e9e9e } }, { bottom: c }); k.orb(0, 0, bz, br, br, br * 0.9, 0xe8e8e8, k.lod ? 8 : 14, k.lod ? 6 : 9, { f: (u, v, p) => { const b = 1 + 0.07 * (hn(u * 23, v * 17) - 0.5); return [p[0] * b, p[1] * b, p[2] * b]; }, col: (u, v) => (hn(u * 41, v * 29) > 0.55 ? 0xf5f5f5 : 0xd5d5d5) }); },
};
S('stick', (k, s, c, d) => {
  const f = STK[d.id]; if (f) { f(k, s, c, d); return; }
  const R = Math.min(s[0], s[1]) / 2, L = s[2]; ZL(k, [{ r: R * 0.85, y: -L / 2 }, { r: R, y: -L / 2 + 0.004, p: 'a' }, { r: R * 0.9, y: L / 2 - 0.004, p: 'a' }, { r: R * 0.7, y: L / 2, p: 'a' }], 10, { a: { c } }, { bottom: shade(c, 0.85), top: shade(c, 0.9) });
});
// Marteau (panne, œil, arrache-clou fendu, manche galbé) ; maillet en caoutchouc
S('hammer', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, steel = 0x8a9096;
  if (d.id === 'mallet') { const R = Math.min(D / 2, h * 0.11), hy = h / 2 - R;
    k.setT(mm(TR(0, hy, 0), RZ(-Math.PI / 2))).lathe([{ r: R * 0.8, y: -w / 2 }, { r: R * 0.97, y: -w / 2 + 0.006, p: 'a' }, { r: R, y: -w / 2 + 0.014, p: 'a' }, { r: R, y: w / 2 - 0.014, p: 'a' }, { r: R * 0.97, y: w / 2 - 0.006, p: 'a' }, { r: R * 0.8, y: w / 2, p: 'a' }], k.lod ? 8 : 14, { a: { c } }, { bottom: shade(c, 0.85), top: shade(c, 0.85) }).setT(null);
    k.lathe([{ r: 0.012, rz: 0.009, y: y0 }, { r: 0.0135, rz: 0.01, y: y0 + 0.006, p: 'a' }, { r: 0.0115, rz: 0.0085, y: y0 + h * 0.4, p: 'a' }, { r: 0.0095, rz: 0.0075, y: hy, p: 'a' }], 10, { a: { c: 0xc8a165 } }, { bottom: 0xb08850 }); return; }
  const hy = h / 2 - 0.014, hl = w;
  k.setT(mm(TR(-hl * 0.27, hy, 0), RZ(-Math.PI / 2))).lathe([{ r: 0.0112, y: -hl * 0.23 }, { r: 0.0125, y: -hl * 0.22, p: 'a', h: 1 }, { r: 0.0125, y: -hl * 0.05, p: 'a' }, { r: 0.0095, y: hl * 0.08, p: 'a' }], k.lod ? 6 : 12, { a: { c: steel } }, { bottom: 0xb0b6bc }).setT(null);
  k.rbox(0, hy, 0, hl * 0.2, 0.026, 0.024, steel, 0.003);
  const cl = (t, sg) => [hl * (0.08 + 0.42 * t), hy - 0.034 * t * t + sg * (0.011 - 0.009 * t)], prong = (t0, t1, z, th) => { const P = []; for (let i = 0; i <= 5; i++) P.push(cl(t0 + (t1 - t0) * i / 5, 1)); for (let i = 5; i >= 0; i--) P.push(cl(t0 + (t1 - t0) * i / 5, -1)); k.setT(TR(0, 0, z)).prism(P, th, steel, { bev: k.lod ? 0 : 0.001 }).setT(null); };
  prong(0, 0.4, 0, 0.022); for (const sz of [-1, 1]) prong(0.35, 1, sz * 0.0065, 0.009);
  k.lathe([{ r: 0.0125, rz: 0.009, y: y0 }, { r: 0.0145, rz: 0.0105, y: y0 + 0.012, p: 'a' }, { r: 0.0128, rz: 0.0095, y: y0 + h * 0.35, p: 'a' }, { r: 0.0105, rz: 0.008, y: hy - 0.03, p: 'a' }, { r: 0.0115, rz: 0.0088, y: hy - 0.012, p: 'a' }], 10, { a: { c } }, { bottom: shade(c, 0.8) });
  k.box(0, hy + 0.0131, 0, 0.012, 0.0008, 0.008, shade(c, 0.85));
});
// Perceuse-visseuse (corps, bague de couple, mandrin, foret, poignée gainée, gâchette, batterie) ; sèche-cheveux
S('drill', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, blk = 0x212121, sg = k.lod ? 8 : 14;
  if (d.id === 'hairdryer') { const R = Math.min(w * 0.48, 0.04), by = h / 2 - R - 0.002;
    k.setT(mm(TR(0, by, 0), RX(Math.PI / 2))).lathe([{ r: R * 0.84, y: -D / 2 + 0.002 }, { r: R * 0.92, y: -D / 2 + 0.006, p: 'a' }, { r: R, y: -D / 2 + 0.03, p: 'a' }, { r: R * 0.95, y: D * 0.15, p: 'a', h: 1 }, { r: R * 0.82, y: D * 0.2, p: 'n' }, { r: R * 0.62, rz: R * 0.36, y: D / 2 - 0.004, p: 'n' }, { r: R * 0.58, rz: R * 0.3, y: D / 2, p: 'n' }], sg, { a: { c }, n: { c: 0x2a2a2a } }, { bottom: 0x2a2a2a, bottomRect: k.lod ? null : k.shared('grille:holes', 48, 64, { kind: 'grille', holes: true, bg: 0x2a2a2a, n: 7 }), top: 0x111111 }).setT(null);
    k.setT(mm(TR(0, 0, -D * 0.12), RX(0.18))).lathe([{ r: 0.014, rz: 0.012, y: y0 + 0.004 }, { r: 0.0165, rz: 0.0145, y: y0 + 0.012, p: 'a' }, { r: 0.0185, rz: 0.0155, y: by - 0.02, p: 'a' }, { r: 0.02, rz: 0.017, y: by, p: 'a' }], 10, { a: { c } }, { bottom: shade(c, 0.85) }).setT(null);
    for (let i = 0; i < 2; i++) { const yb = y0 + h * (0.42 + i * 0.14); k.rbox(0, yb, -D * 0.12 + yb * Math.sin(0.18) + 0.017, 0.01, 0.018, 0.006, i ? 0xf5f5f5 : 0x2a2a2a, 0.002); }
    k.sweep([[0, y0 + 0.006, -D * 0.125], [0, y0 + 0.002, -D * 0.2]], 0.004, 0x2a2a2a, { nu: 6, cap1: true }); return; }
  const R = Math.min(w * 0.45, 0.034), by = h / 2 - R - 0.002;
  k.setT(mm(TR(0, by, 0), RX(Math.PI / 2))).lathe([{ r: R * 0.65, y: -D / 2 + 0.001 }, { r: R * 0.88, y: -D / 2 + 0.008, p: 'a' }, { r: R, y: -D / 2 + 0.03, p: 'a' }, { r: R * 0.94, y: D * 0.06, p: 'a', h: 1 }, { r: R * 0.92, y: D * 0.065, p: 'c' }, { r: R * 0.92, y: D * 0.13, p: 'c', h: 1 }, { r: R * 0.7, y: D * 0.15, p: 'a' }], sg, { a: { c }, c: { c: 0x3a3a3a, rect: k.lod ? null : ridgeTex(k, 20) } }, { bottom: blk }).setT(null);
  ZL(k, [{ r: R * 0.62, y: D * 0.15 }, { r: R * 0.6, y: D * 0.3, p: 'k' }, { r: R * 0.4, y: D * 0.33, p: 'k', h: 1 }, { r: R * 0.32, y: D * 0.33, p: 'k' }], k.lod ? 6 : 12, { k: { c: blk, rect: k.lod ? null : ridgeTex(k, 16) } }, { top: 0x9e9e9e }, 0, by);
  ZL(k, [{ r: 0.0035, y: D * 0.33 }, { r: 0.0035, y: D / 2 - 0.006, p: 'b' }, { r: 0.0008, y: D / 2, p: 'b' }], 6, { b: { c: 0xb8bcc0, rect: k.lod ? null : ridgeTex(k, 6) } }, {}, 0, by);
  k.setT(mm(TR(0, (by + y0 + 0.045) / 2, -D * 0.2), RX(0.18))).rbox(0, 0, 0, w * 0.46, by - y0 - 0.05, 0.042, blk, 0.012).setT(null);
  k.pbox(0, by - R - 0.01, -D * 0.06, 0.011, 0.02, 0.014, 0x111111); k.pbox(0, by - R * 0.85, -D * 0.2, w * 0.7, 0.008, 0.01, 0x9e9e9e);
  k.rbox(0, y0 + 0.022, -D * 0.12, w * 0.92, 0.044, D * 0.48, c, 0.006); k.pbox(0, y0 + 0.022, -D * 0.12 + D * 0.24 + 0.0005, w * 0.6, 0.012, 0.001, blk, {}, {}, 'z');
  if (!k.lod) for (let i = 0; i < 4; i++) deco(k, 0, by + (i - 1.5) * 0.007, -D / 2 + 0.004, R * 0.9, 0.003, 0.002, blk);
});
// Rouleaux : adhésif (spires, mandrin en carton, amorce), ruban isolant, bobine de bolduc
S('tape', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, y1 = h / 2, sg = k.lod ? 8 : 20, id = d.id;
  if (id === 'gift_ribbon') { const fr = Math.min(w, D) / 2, rr = fr * 0.86, hc = fr * 0.32, f = 0.0025;
    k.lathe([{ r: hc, y: y0 }, { r: fr, y: y0, p: 'f', h: 1 }, { r: fr, y: y0 + f, p: 'f', h: 1 }, { r: rr, y: y0 + f, p: 'f', h: 1 }, { r: rr, y: y1 - f, p: 'r', h: 1 }, { r: fr, y: y1 - f, p: 'f', h: 1 }, { r: fr, y: y1, p: 'f', h: 1 }, { r: hc, y: y1, p: 'f', h: 1 }, { r: hc, y: y0, p: 'i' }], sg, { f: { c: 0xf5f5f5 }, r: { c, rect: k.lod ? null : ridgeTex(k, 30) }, i: { c: 0xdddddd } }, {}); return; }
  const R = Math.min(w, D) / 2 - 0.006, Rc = R * (id === 'electrical_tape' ? 0.64 : 0.6), t = 0.003;
  if (k.lod) { k.lathe([{ r: R, y: y0 }, { r: R, y: y1, p: 'o', h: 1 }, { r: Rc, y: y1, p: 's', h: 1 }, { r: Rc, y: y0, p: 'n', h: 1 }, { r: R, y: y0, p: 's' }], 6, { o: { c }, s: { c: shade(c, 1.15) }, n: { c: 0xb8925a } }, {}); return; }
  k.lathe([{ r: R, y: y0 }, { r: R, y: y1, p: 'o', h: 1 }, { r: Rc + t, y: y1, p: 's', h: 1 }, { r: Rc + t, y: y1 - 0.0005, p: 'k', h: 1 }, { r: Rc, y: y1 - 0.0005, p: 'k', h: 1 }, { r: Rc, y: y0 + 0.0005, p: 'n', h: 1 }, { r: Rc + t, y: y0 + 0.0005, p: 'k', h: 1 }, { r: Rc + t, y: y0, p: 'k', h: 1 }, { r: R, y: y0, p: 's' }], sg, { o: { c }, s: { c: shade(c, 1.15) }, k: { c: 0xc8a46e }, n: { c: 0xb8925a } }, {});
  if (!k.lod) for (const fl of [false, true]) k.surf(4, 1, (u, v) => { const a = 0.6 + u * 0.55, r = R + (fl ? 0 : 0.0005) + u * u * 0.0055; return [r * Math.sin(a), y0 + 0.0005 + (h - 0.001) * v, r * Math.cos(a)]; }, fl ? shade(c, 0.85) : c, { open: true, flip: fl });
});
// Ciseaux : lames d'acier entrouvertes (deux couches), anneaux en plastique, vis de pivot
S('scissors', (k, s, c) => {
  const [w, h, L] = s, t = 0.0018, pz = L * 0.06, hc = 0x37474f, sw = w / 0.07;
  for (const sx of [1, -1]) {
    const rot = mm(TR(0, sx * t * 0.5, pz), RY(sx * 0.06), TR(0, 0, -pz)), B = [[-sx * 0.003, pz - 0.012], [sx * 0.011, pz - 0.006], [sx * 0.012, pz + 0.012], [sx * 0.008, L * 0.3], [sx * 0.003, L / 2 - 0.006], [0, L / 2 - 0.002], [-sx * 0.0015, L * 0.3], [-sx * 0.004, pz + 0.004]].map(([x, z]) => [x * sw, z]);
    k.setT(mm(rot, RX(-Math.PI / 2))).prism(B.map(([x, z]) => [x, -z]), t, c, { bev: k.lod ? 0 : 0.0005 }).setT(null);
    const hx = -sx * w * 0.24, hz = -L * 0.28, O = ellip(w * 0.23, L * 0.16, k.lod ? 8 : 14, hx, hz), Hh = ellip(w * 0.15, L * 0.1, k.lod ? 8 : 12, hx, hz);
    k.setT(mm(rot, RX(-Math.PI / 2))).prism(O.map(([x, z]) => [x, -z]), h * 0.5, hc, { holes: [Hh.map(([x, z]) => [x, -z])], bev: k.lod ? 0 : 0.0012, smooth: true }).setT(null);
    k.setT(mm(rot, RX(-Math.PI / 2))).prism([[-sx * 0.004 * sw, pz - 0.006], [sx * 0.004 * sw, pz - 0.014], [hx + sx * w * 0.08, hz + L * 0.14], [hx - sx * w * 0.06, hz + L * 0.15]].map(([x, z]) => [x, -z]), h * 0.42, hc, {}).setT(null);
  }
  k.tube(0, 0, pz, 0.0032, h * 0.6, 0x9e9e9e, 8);
});
// Extincteur : réservoir à étiquette, culot, robinet en laiton, levier et poignée, manomètre, goupille, flexible et lance
S('extinguisher', (k, s, c, d) => {
  const [w, h] = s, y0 = -h / 2, R = w * 0.4, ht = y0 + h * 0.8, sg = k.lod ? 8 : 16, lab = k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.3, { brand: 'ABC', name: 'Extincteur', bg: 0xffffff, accent: 0xcc1111 });
  k.lathe([{ r: R * 0.9, y: y0 }, { r: R * 0.96, y: y0 + 0.006, p: 'b' }, { r: R, y: y0 + 0.02, p: 'b', h: 1 }, { r: R, y: y0 + h * 0.3, p: 'a' }, { r: R, y: y0 + h * 0.6, p: 'l' }, { r: R, y: ht - R * 0.5, p: 'a' }, { r: R * 0.86, y: ht - R * 0.15, p: 'a' }, { r: R * 0.55, y: ht + R * 0.12, p: 'a' }, { r: R * 0.25, y: ht + R * 0.2, p: 'a', h: 1 }], sg, { b: { c: 0x2a2a2a }, a: { c }, l: { c: 0xffffff, rect: lab } }, { bottom: 0x1a1a1a });
  const vy = ht + R * 0.2; k.tube(0, vy + 0.012, 0, 0.012, 0.024, 0xc9a227, 10); k.rbox(0, vy + 0.032, 0, 0.026, 0.024, 0.04, 0x1a1a1a, 0.004);
  k.setT(RY(Math.PI / 2)).prism([[0.012, vy + 0.02], [-0.07, vy + 0.024], [-0.072, vy + 0.034], [0.012, vy + 0.03]].map(([z, y]) => [-z, y]), 0.02, 0x1a1a1a, { bev: k.lod ? 0 : 0.002 }).setT(null);
  k.setT(RY(Math.PI / 2)).prism([[0.01, vy + 0.044], [-0.068, vy + 0.054], [-0.07, vy + 0.062], [0.012, vy + 0.052]].map(([z, y]) => [-z, y]), 0.018, 0xcc1111, { bev: k.lod ? 0 : 0.002 }).setT(null);
  k.tube(0, vy + 0.032, 0.026, 0.011, 0.008, 0x1a1a1a, 12, { m: RX(Math.PI / 2), tc: 0xf5f5f5 }); deco(k, 0.004, vy + 0.034, 0.0305, 0.006, 0.003, 0.0006, 0x43a047);
  ringXZ(k, 0.016, vy + 0.03, 0, 0.007, 0.0012, 0xffd600, 10);
  k.sweep(spl([[0.013, vy + 0.03, -0.01], [R + 0.004, vy, -0.02], [R + 0.005, y0 + h * 0.4, -0.012], [R + 0.003, y0 + h * 0.18, 0.004]], k.lod ? 5 : 10), 0.0055, 0x1a1a1a, { nu: 6 });
  k.setT(mm(TR(R + 0.003, y0 + h * 0.13, 0.006), RX(Math.PI))).lathe([{ r: 0.007, y: -0.03 }, { r: 0.011, y: 0.02, p: 'a' }, { r: 0.0095, y: 0.024, p: 'a' }], 8, { a: { c: 0x1a1a1a } }, { top: 0x111111 }).setT(null);
});
// Jerrican métallique (X embouti, soudure, trois poignées, bec) ; bidons en plastique à poignée creuse et bouchon
S('jerrycan', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2;
  if (d.id === 'fuel_can') { const bh = h * 0.86, by = y0 + bh / 2, top = y0 + bh;
    k.rbox(0, by, 0, w - 0.002, bh - 0.002, D, c, 0.012); k.box(0, by, 0, w, bh, 0.003, shade(c, 0.85));
    const a = Math.atan2(bh, w), dl = Math.hypot(w, bh) * 0.86; for (const sz of [-1, 1]) for (const sa of [-1, 1]) k.setT(mm(TR(0, by, sz * (D / 2 - 0.0005)), RZ(sa * a))).rbox(0, 0, 0, dl, 0.012, 0.003, shade(c, 1.06), 0.001).setT(null);
    for (const z of [-D * 0.3, 0, D * 0.3]) k.sweep([[-w * 0.3, top - 0.002, z], [-w * 0.26, h / 2 - 0.007, z], [w * 0.04, h / 2 - 0.007, z], [w * 0.08, top - 0.002, z]], 0.0055, shade(c, 0.9), { nu: 5 });
    k.tube(w * 0.32, top + 0.012, 0, 0.016, 0.024, shade(c, 0.85), 10); k.rbox(w * 0.32, top + 0.026, -0.008, 0.012, 0.006, 0.03, shade(c, 0.7), 0.002); return; }
  const lab = d.l || d.b ? k.pk(d, 'box', w * 0.8, h * 0.5, legacyInfo(d, { layout: 3 })) : null, bh = h * 0.78, top = y0 + bh, cap = d.c2 ?? shade(c, 0.75);
  k.rbox(0, y0 + bh / 2, 0, w, bh, D, c, Math.min(0.016, D * 0.3), lab ? { Z: lab } : {});
  k.sweep(spl([[-w * 0.42, top - 0.004, 0], [-w * 0.4, h / 2 - 0.013, 0], [-w * 0.06, h / 2 - 0.013, 0], [-w * 0.02, top - 0.004, 0]], k.lod ? 5 : 9), 0.011, c, { nu: 6, rz: 0.8 });
  k.tube(w * 0.28, top + 0.004, 0, 0.022, 0.008, c, 12); k.tube(w * 0.28, top + 0.018, 0, 0.019, 0.022, cap, 12);
});
// Raquettes : cadre ovale profilé, gorge ouverte ou tige, cordage tressé, manche octogonal grippé
S('racket', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2, bad = d.id === 'badminton_racket', hl = h * (bad ? 0.3 : 0.38), hy1 = y0 + hl, ha = w * (bad ? 0.42 : 0.46), hb = h * (bad ? 0.18 : 0.24), hc = h / 2 - hb - 0.004;
  const n = k.lod ? 16 : 32, F = []; for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; F.push([Math.sin(a) * ha, hc + Math.cos(a) * hb, 0]); }
  k.sweep(F, D * (bad ? 0.16 : 0.32), c, { nu: 6, rz: bad ? 1 : 0.55 });
  const fb = (a) => [Math.sin(a) * ha, hc + Math.cos(a) * hb, 0];
  if (bad) k.lathe([{ r: 0.0032, y: hy1 - 0.004 }, { r: 0.0032, y: hc - hb + 0.002, p: 'a' }], 6, { a: { c: 0x9e9e9e } }, {});
  else for (const sx of [-1, 1]) { const p = fb(Math.PI + sx * 0.45); k.sweep(spl([p, [p[0] * 0.45, (p[1] + hy1) / 2, 0], [sx * w * 0.03, hy1, 0]], 5), D * 0.28, c, { nu: 6, rz: 0.6 }); }
  const gr = bad ? 0.011 : 0.0145; k.lathe([{ r: gr * 0.92, y: y0 }, { r: gr * 1.03, y: y0 + 0.006, p: 'g' }, { r: gr, y: hy1 - 0.02, p: 'g', h: 1 }, { r: gr * 0.8, y: hy1, p: 'a' }], 8, { g: { c: 0x1a1a1a, rect: k.lod ? null : ridgeTex(k, 8) }, a: { c } }, { bottom: 0x2a2a2a });
  const nm = k.lod ? 0 : bad ? 14 : 16, nc = k.lod ? 0 : bad ? 16 : 19, ia = ha - 0.006, ib = hb - 0.006, sc = bad ? 0xf5f5f5 : 0xeeeeee;
  for (let i = 1; i < nm; i++) { const x = -ia + 2 * ia * i / nm, e = ib * Math.sqrt(Math.max(0, 1 - (x / ia) ** 2)); k.sweep([[x, hc - e, 0.0004], [x, hc + e, 0.0004]], 0.0006, sc, { nu: 3 }); }
  for (let j = 1; j < nc; j++) { const y = -ib + 2 * ib * j / nc, e = ia * Math.sqrt(Math.max(0, 1 - (y / ib) ** 2)); k.sweep([[-e, hc + y, -0.0004], [e, hc + y, -0.0004]], 0.0006, sc, { nu: 3 }); }
});
// Haltère : barre moletée, disques en fonte (grand et petit), écrous de serrage
S('dumbbell', (k, s, c) => {
  const [w, h] = s, R = h / 2, hw = w / 2, rim = shade(c, 1.25), half = [[-hw, R * 0.28, null], [-hw + 0.004, R * 0.33, 'k'], [-hw + 0.012, R * 0.33, 'k', 1], [-hw + 0.012, R * 0.8, 'p', 1], [-hw + 0.016, R * 0.84, 'p'], [-hw + 0.03, R * 0.84, 'p'], [-hw + 0.034, R * 0.8, 'p', 1], [-hw + 0.034, R * 0.96, 'q', 1], [-hw + 0.038, R, 'q'], [-hw + 0.06, R, 'q'], [-hw + 0.064, R * 0.96, 'q', 1], [-hw + 0.064, R * 0.33, 'k', 1], [-hw + 0.072, R * 0.33, 'k', 1], [-hw + 0.072, R * 0.22, 'g', 1]];
  const rings = [...half, ...half.slice().reverse().map(([y, r, p, hh], i, a) => [-y, r, i ? a[i - 1][2] : 'g', hh])].map(([y, r, p, hh]) => ({ y, r, p: p || undefined, h: hh ? 1 : undefined }));
  k.setT(RZ(-Math.PI / 2)).lathe(rings, k.lod ? 8 : 14, { k: { c: 0xb0b4b8 }, p: { c }, q: { c: rim }, g: { c: 0xc8ccd0, rect: k.lod ? null : ridgeTex(k, 20) } }, { bottom: 0x9e9e9e, top: 0x9e9e9e }).setT(null);
});
// Skateboard : plateau à double kick et léger creux (grip noir dessus), chant, trucks (embase, axe), roues
S('skate', (k, s, c) => {
  const [w, h, L] = s, y0 = -h / 2, dt = 0.011, wr = 0.026, ww = 0.032, dy = y0 + wr + 0.024, nz = k.lod ? 10 : 22, nx = k.lod ? 2 : 4;
  const kick = (z) => { const t = (Math.abs(z) - L * 0.32) / (L * 0.18); return t > 0 ? Math.min(1, t) ** 1.6 * h * 0.25 : 0; }, hwz = (z) => { const t = Math.abs(z) / (L / 2); return w * 0.5 * (t < 0.72 ? 1 : Math.sqrt(Math.max(0, 1 - ((t - 0.72) / 0.28) ** 2)) * 0.98 + 0.02); };
  const deck = (top) => (u, v) => { const z = -L / 2 + L * v, x = (u - 0.5) * 2 * hwz(z), cc = 0.004 * (1 - ((u - 0.5) * 2) ** 2); return [x, dy + kick(z) - cc + (top ? dt : 0), z]; };
  k.surf(nx, nz, deck(true), 0x1c1c1c, { open: true, flip: true }); k.surf(nx, nz, deck(false), c, { open: true });
  const PE = []; for (let i = 0; i <= nz; i++) PE.push([0, i / nz]); for (let i = nz; i >= 0; i--) PE.push([1, i / nz]);
  k.surf(PE.length, 1, (u, v) => { const [eu, ev] = PE[Math.round(u * PE.length) % PE.length], p = deck(false)(eu, ev); return [p[0], p[1] + dt * v, p[2]]; }, shade(c, 0.8));
  for (const zs of [-1, 1]) { const z = zs * L * 0.31, ay = y0 + wr;
    k.pbox(0, dy - 0.004, z, 0.05, 0.008, 0.07, 0x9e9e9e, {}, {}, 'Y');
    k.setT(TR(0, 0, z)).prism([[-w * 0.33, ay - 0.006], [w * 0.33, ay - 0.006], [w * 0.12, dy - 0.008], [-w * 0.12, dy - 0.008]], 0.02, 0xb0b4b8, { bev: k.lod ? 0 : 0.002 }).setT(null);
    k.tube(0, ay, z, 0.004, w * 0.86, 0xc8ccd0, 6, { m: RZ(Math.PI / 2) });
    for (const sx of [-1, 1]) k.setT(mm(TR(sx * (w / 2 - ww / 2), ay, z), RZ(-Math.PI / 2))).lathe([{ r: wr * 0.4, y: -ww / 2 }, { r: wr * 0.85, y: -ww / 2, p: 'a', h: 1 }, { r: wr, y: -ww * 0.3, p: 'a' }, { r: wr, y: ww * 0.3, p: 'a' }, { r: wr * 0.85, y: ww / 2, p: 'a', h: 1 }, { r: wr * 0.4, y: ww / 2, p: 'b' }], k.lod ? 6 : 14, { a: { c: 0xfff3c0 }, b: { c: 0x9e9e9e } }, { bottom: 0x9e9e9e, top: 0x9e9e9e }).setT(null); }
});
// Panneau de basket sur pied (socle lesté, mât, planche à carré rouge, cercle, filet) ; basket d'arcade (piste, filets, borne)
const NET = (k, x, y, z, R, H) => { const n = k.lod ? 6 : 10; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 0.5) / n * Math.PI * 2; k.sweep([[x + Math.cos(a) * R, y, z + Math.sin(a) * R], [x + Math.cos(b) * R * 0.78, y - H * 0.5, z + Math.sin(b) * R * 0.78], [x + Math.cos(a) * R * 0.6, y - H, z + Math.sin(a) * R * 0.6]], 0.0018, 0xf5f5f5, { nu: 3 }); } ringXZ(k, x, y - H, z, R * 0.6, 0.0018, 0xf5f5f5, n); };
S('hoop', (k, s, c, d) => {
  const [w, h, D] = s, y0 = -h / 2;
  if (d.p?.arcade) { const z1 = D / 2, z0 = -D / 2, lane = mm(TR(0, -h * 0.1, 0.05), RX(0.07));
    k.rbox(0, y0 + h * 0.22, z1 - 0.2, w, h * 0.44, 0.4, 0x1565c0, 0.03); k.pbox(0, y0 + h * 0.12, z1 - 0.0005, w * 0.3, h * 0.12, 0.001, 0x212121, {}, {}, 'z'); for (const sx of [-1, 1]) deco(k, sx * 0.08, y0 + h * 0.15, z1 - 0.0005, 0.03, 0.05, 0.002, 0xffd600);
    k.pbox(0, y0 + h * 0.34, z1 - 0.0005, w * 0.4, 0.12, 0.001, 0x111111, { Z: k.pk(d, 'plain', w * 0.4, 0.12, { bg: 0x111111, brand: '088', fg: 0xff1744 }) }, {}, 'z');
    k.setT(lane).rbox(0, 0, 0, w * 0.92, 0.04, D * 0.72, 0x0d47a1, 0.01).setT(null);
    for (const sx of [-1, 1]) { k.rbox(sx * (w / 2 - 0.02), y0 + h * 0.3, 0, 0.04, h * 0.6, D * 0.8, 0x1565c0, 0.01); const F = [[sx * (w / 2 - 0.02), -h * 0.05, z1 - 0.45], [sx * (w / 2 - 0.02), h * 0.3, z1 - 0.45], [sx * (w / 2 - 0.02), h * 0.42, z0 + 0.3], [sx * (w / 2 - 0.02), -h * 0.05, z0 + 0.3]]; F.push(F[0]); k.sweep(F, 0.012, 0x212121, { nu: 5 }); }
    k.rbox(0, 0, z0 + 0.12, w, h, 0.24, 0x1565c0, 0.03); const by = h * 0.22, bz = z0 + 0.24 + 0.02;
    k.rbox(0, by, bz, w * 0.72, h * 0.26, 0.03, 0xfafafa, 0.006); for (const [x, y, ww, hh] of [[0, by + h * 0.04, w * 0.2, 0.01], [0, by - h * 0.06, w * 0.2, 0.01], [-w * 0.1, by - h * 0.01, 0.01, h * 0.1], [w * 0.1, by - h * 0.01, 0.01, h * 0.1]]) k.box(x, y, bz + 0.016, ww, hh, 0.002, 0xd32f2f);
    const ry = by - h * 0.1, rz = bz + 0.16; ringXZ(k, 0, ry, rz, 0.13, 0.008, c, k.lod ? 10 : 20); k.pbox(0, ry, bz + 0.03, 0.06, 0.02, 0.05, c); NET(k, 0, ry, rz, 0.13, 0.22);
    k.pbox(0, h / 2 - 0.12, z0 + 0.25 + 0.001, w * 0.9, 0.2, 0.01, 0xffffff, { Z: k.pk(d, 'box', w * 0.9, 0.2, { brand: 'BASKET', name: 'Arcade', bg: 0xe65100 }) }, {}, 'zy');
    for (let i = 0; i < 3; i++) k.orb((i - 1) * 0.2, -h * 0.1 - 0.03, z1 - 0.55, 0.09, 0.09, 0.09, c, 10, 7, { col: (u, v) => (Math.abs(((u * 4) % 1) - 0.5) < 0.04 || Math.abs(v - 0.5) < 0.03 ? 0x2a1a10 : c) });
    return; }
  // panier sur pied : socle, mât, planche, cercle et filet
  const bz = -D / 2 + 0.03, bh = h * 0.34, by = h / 2 - bh / 2 - 0.004;
  k.rbox(0, y0 + 0.05, -D * 0.1, w * 0.9, 0.1, D * 0.75, 0x263238, 0.03); k.tube(0, (y0 + 0.1 + by) / 2, bz - 0.005, 0.022, by - y0 - 0.1, 0x37474f, 10);
  k.rbox(0, by, bz + 0.012, w * 0.94, bh, 0.024, 0xfafafa, 0.008);
  for (const [x, y, ww, hh] of [[0, by + bh * 0.12, w * 0.3, 0.012], [0, by - bh * 0.24, w * 0.3, 0.012], [-w * 0.15, by - bh * 0.06, 0.012, bh * 0.36], [w * 0.15, by - bh * 0.06, 0.012, bh * 0.36]]) k.box(x, y, bz + 0.0245, ww, hh, 0.002, 0xd32f2f);
  const ry = by - bh * 0.32, R = Math.min(0.13, (D / 2 - bz - 0.03) / 2.1), rz = bz + 0.03 + R; ringXZ(k, 0, ry, rz, R, 0.007, c, k.lod ? 10 : 20); k.pbox(0, ry, bz + 0.035, 0.05, 0.016, 0.03, c); NET(k, 0, ry, rz, R, 0.2);
});
// Petit outillage : pince universelle, cutter, niveau à bulle, pinceaux et brosses, rouleau à peinture, truelle
S('ptool', (k, s, c, d) => {
  const [w, h, L] = s, t = d.tl || 'pliers', m = 0x9ea4aa;
  if (t === 'pliers') { const pz = L * 0.1, th = h * 0.42;
    for (const sx of [-1, 1]) { FLAT(k, [[0, pz - 0.006], [sx * w * 0.2, pz + 0.002], [sx * w * 0.12, L / 2 - L * 0.12], [sx * w * 0.04, L / 2], [0, L / 2]], th, 0x8d9399, { bev: k.lod ? 0 : 0.0008 });
      k.sweep([[sx * w * 0.06, 0, pz - 0.002], [-sx * w * 0.04, 0, pz - L * 0.1]], 0.0045, 0x8d9399, { nu: 6, rz: 0.7 });
      k.sweep(spl([[-sx * w * 0.03, 0, pz - L * 0.08], [-sx * w * 0.18, 0, -L * 0.15], [-sx * w * 0.3, 0, -L / 2 + 0.012]], k.lod ? 4 : 7), 0.0068, c, { nu: 6, rz: 0.75, cap1: true }); }
    k.tube(0, 0, pz, 0.009, th * 1.15, 0xb0b6bc, 10); return; }
  if (t === 'cutter') { k.rbox(0, 0, -L * 0.05, w, h, L * 0.88, c, 0.006); for (const sx of [-1, 1]) k.pbox(sx * (w * 0.5 - 0.0004), 0, -L * 0.15, 0.001, h * 0.6, L * 0.45, 0x212121, {}, {}, sx > 0 ? 'x' : 'X'); k.rbox(0, h / 2 - 0.0016, -L * 0.1, w * 0.45, 0.0036, L * 0.12, 0x212121, 0.0015); k.pbox(0, 0, L / 2 - L * 0.07, w * 0.7, h * 0.5, L * 0.06, 0xb0b4b8); FLAT(k, [[-w * 0.15, L / 2 - L * 0.07], [w * 0.2, L / 2 - L * 0.07], [w * 0.2, L / 2 - 0.012], [-w * 0.15, L / 2]], 0.0008, 0xd8dde2, {}); return; }
  if (t === 'level') { k.rbox(0, 0, 0, w - 0.002, h - 0.002, L, c, 0.003); for (const sz of [-1, 1]) k.pbox(0, 0, sz * (L / 2 - 0.008), w, h, 0.016, 0x212121); k.pbox(0, h / 2 - 0.0008, 0, w * 0.6, 0.0006, L * 0.12, 0x1a1a1a, {}, {}, 'y'); k.tube(0, h / 2 - 0.0052, 0, 0.004, L * 0.09, 0xc6ff00, 8, { m: RX(Math.PI / 2) });
    for (const z of [-L * 0.3, L * 0.3]) { k.tube(0, 0, z, h * 0.3, w - 0.001, 0x1a1a1a, 10, { m: RZ(Math.PI / 2) }); k.tube(0, 0, z, h * 0.12, w, 0xc6ff00, 8, { m: RZ(Math.PI / 2) }); } return; }
  if (t === 'roller') { const R = Math.min(h / 2, 0.03), ry = -h / 2 + R, rz = L / 2 - R, rw = w * 0.88;
    k.setT(mm(TR(-w * 0.04, ry, rz), RZ(-Math.PI / 2))).lathe([{ r: R * 0.5, y: -rw / 2 }, { r: R * 0.92, y: -rw / 2, p: 'a', h: 1 }, { r: R, y: -rw / 2 + 0.006, p: 'a' }, { r: R, y: rw / 2 - 0.006, p: 'a' }, { r: R * 0.92, y: rw / 2, p: 'a', h: 1 }, { r: R * 0.5, y: rw / 2, p: 'e' }], k.lod ? 8 : 14, { a: { c }, e: { c: 0x9e9e9e } }, { bottom: 0x9e9e9e, top: 0x9e9e9e }).setT(null);
    k.sweep(spl([[-w * 0.04 + rw / 2 + 0.002, ry, rz], [w / 2 - 0.006, ry, rz - 0.01], [w * 0.3, ry + 0.012, rz - 0.07], [0.012, ry + 0.016, rz - 0.1]], k.lod ? 4 : 8), 0.0032, 0xb0b4b8, { nu: 5 });
    ZL(k, REV([{ r: 0.008, y: rz - 0.1 }, { r: 0.012, y: rz - 0.11, p: 'a' }, { r: 0.0125, y: -L / 2 + 0.03, p: 'a' }, { r: 0.0105, y: -L / 2, p: 'a' }]), 10, { a: { c: 0xffc107 } }, { bottom: 0xe6a800 }, 0.012, ry + 0.016); return; }
  if (t === 'trowel') { FLAT(k, [[0, L / 2], [w * 0.48, L * 0.05], [w * 0.4, -L * 0.04], [-w * 0.4, -L * 0.04], [-w * 0.48, L * 0.05]], 0.0016, 0xa8b0b8, { bev: k.lod ? 0 : 0.0004 }, -h / 2 + 0.0012);
    k.sweep([[0, -h / 2 + 0.002, 0], [0, -h / 2 + 0.008, -L * 0.06], [0, h * 0.08, -L * 0.12], [0, h * 0.08, -L * 0.16]], 0.003, 0x8d9399, { nu: 5 });
    ZL(k, REV([{ r: 0.007, y: -L * 0.16 }, { r: 0.009, y: -L * 0.18, p: 'm' }, { r: 0.011, y: -L * 0.2, p: 'a' }, { r: 0.0125, y: -L * 0.38, p: 'a' }, { r: 0.0105, y: -L / 2 + 0.004, p: 'a' }, { r: 0.008, y: -L / 2, p: 'a' }]), 10, { m: { c: 0xb0b4b8 }, a: { c } }, { bottom: shade(c, 0.85) }, 0, h * 0.08); return; }
  // pinceaux et brosses
  if (d.id === 'makeup_brush') { const R = Math.min(w, h) / 2, z0 = -L / 2; ZL(k, [{ r: R * 0.3, y: z0 }, { r: R * 0.4, y: z0 + 0.004, p: 'a' }, { r: R * 0.48, y: z0 + L * 0.55, p: 'a', h: 1 }, { r: R * 0.5, y: z0 + L * 0.56, p: 'm' }, { r: R * 0.55, y: z0 + L * 0.7, p: 'm', h: 1 }, { r: R * 0.6, y: z0 + L * 0.71, p: 'b' }, { r: R * 0.95, y: z0 + L * 0.86, p: 'b' }, { r: R * 0.8, y: L / 2 - 0.006, p: 't' }, { r: 0.001, y: L / 2, p: 't' }], 10, { a: { c }, m: { c: 0xc8ccd0 }, b: { c: 0x8d6e63 }, t: { c: 0xf3e5d0 } }, { bottom: c }); return; }
  if (d.id === 'paint_brush') { const z0 = -L / 2, fz = L * 0.06;
    FLAT(k, [[-w * 0.12, z0 + 0.012], [w * 0.12, z0 + 0.012], [w * 0.16, fz - L * 0.12], [w * 0.38, fz], [-w * 0.38, fz], [-w * 0.16, fz - L * 0.12]], h * 0.5, c, { bev: k.lod ? 0 : 0.0015, holes: [ellip(0.0035, 0.0035, 8, 0, z0 + 0.02)] }); k.orb(0, 0, z0 + 0.012, w * 0.12, h * 0.25, 0.008, c, 6, 4);
    k.rbox(0, 0, fz + L * 0.06, w * 0.82, h * 0.72, L * 0.12, 0xb0b4b8, 0.002); k.rbox(0, 0, fz + L * 0.12 + L * 0.13, w * 0.8, h * 0.6, L * 0.27, 0xd9c7a0, 0.0025); if (!k.lod) k.box(0, 0, L / 2 - 0.004, w * 0.78, h * 0.55, 0.008, 0xc9b48a); return; }
  // brosse (cheveux, animaux) : tête ovale ou rectangulaire, coussin à picots, manche
  const pet = d.id === 'pet_brush', hz = L * 0.18, hlen = L * 0.5, head = pet ? rrect(w, hlen, 0.008, 2, 0, hz) : ellip(w / 2, hlen / 2, k.lod ? 10 : 16, 0, hz);
  FLAT(k, [[-w * 0.13, -L / 2 + 0.004], [w * 0.13, -L / 2 + 0.004], [w * 0.17, hz - hlen * 0.4], [-w * 0.17, hz - hlen * 0.4]], h * 0.32, c, { bev: k.lod ? 0 : 0.002 }, -h * 0.25);
  FLAT(k, head, h * 0.32, c, { bev: k.lod ? 0 : 0.002, smooth: true }, -h * 0.25);
  const pins = k.lod ? null : k.shared(pet ? 'grille:pins:pet' : 'grille:pins', 32, 48, { kind: 'grille', holes: true, bg: pet ? 0x9e9e9e : 0x2e2e2e, n: 8 });
  FLAT(k, pet ? rrect(w * 0.88, hlen * 0.9, 0.006, 2, 0, hz) : ellip(w * 0.42, hlen * 0.44, k.lod ? 10 : 16, 0, hz), h * 0.3, pet ? 0x9e9e9e : 0x2e2e2e, { F: pins }, h * 0.06);
});
// ═════════════════════ PAPIER, MÉDIAS, MONNAIE, OBJETS RONDS DIVERS ═════════════════════
// Pièce (bimétal à tranche striée, faces imprimées) ; jeton d'arcade en laiton
S('coin', (k, s, c, d) => {
  const [w, h] = s, R = w / 2, tok = d.p?.token, edge = tok ? c : 0xcfd2d6, face = k.pk(d, 'coin', w, w, tok ? { bg: c, name: 'H' } : { bg: 0xcfd2d6, inner: c, name: '2' });
  k.lathe([{ r: R * 0.95, y: -h / 2 }, { r: R, y: -h / 2 + h * 0.2, p: 'e' }, { r: R, y: h / 2 - h * 0.2, p: 'e' }, { r: R * 0.95, y: h / 2, p: 'e' }], k.lod ? 8 : 20, { e: { c: shade(edge, 0.92), rect: k.lod ? null : ridgeTex(k, 40) } }, { top: 0xffffff, topRect: face, bottom: 0xffffff, bottomRect: face });
});
// Liasse de billets : couches légèrement décalées (tranches de papier), billet imprimé dessus, bande de papier
S('cash', (k, s, c, d) => {
  const [w, h, D] = s, bw = w * 0.96, bd = D * 0.94, bill = k.pk(d, 'bill', bw, bd, { bg: c, n: d.id === 'cash_drawer_money' ? 20 : 50 }), L = leaves(k, false), n = k.lod ? 1 : 3, lh = h * 0.9 / n, rnd = mulberry32(7), ec = shade(c, 1.25);
  for (let i = 0; i < n; i++) k.setT(mm(TR((rnd() - 0.5) * 0.004, -h / 2 + lh * (i + 0.5), (rnd() - 0.5) * 0.003), RY((rnd() - 0.5) * 0.04))).pbox(0, 0, 0, bw, lh, bd, ec, { Y: i === n - 1 ? bill : null, X: L, x: L, Z: L, z: L }, { X: ec, x: ec, Z: ec, z: ec }, i ? 'y' : '').setT(null);
  k.pbox(0, -h * 0.05, 0, w * 0.22, h * 0.92, D, 0xd7c49e);
});
// Vinyle : pochette imprimée (recto, verso) d'où dépasse le disque (sillons, rond central)
S('vinyl', (k, s, c, d) => {
  const [w, h, D] = s, g = d.p?.genre, sw = w * 0.96, sh = h * 0.9, nm = (d.label || d.name).replace(/^Vinyle «\s*|\s*»$/g, '');
  const r = k.pk(d, 'media', sw, sh, { name: d.label || d.name, picto: VINYL_PI[g], bg: c, sub: g === 'creepy_vinyl' ? '1987' : '33 tours', brand: g === 'creepy_vinyl' ? '' : 'DISQUES HÉLIOS' });
  const rec = k.pk(d, 'record', 0.2, 0.2, { bg: g === 'creepy_vinyl' ? 0xf5f0e0 : shade(c, 1.35), name: nm.slice(0, 16) }, d.id + ':rec'), R = Math.min(sw, h) * 0.48;
  k.setT(mm(TR(0, h / 2 - R, 0), RX(Math.PI / 2))).lathe([{ r: R, y: -0.0008 }, { r: R, y: 0.0008, p: 'a' }], k.lod ? 10 : 16, { a: { c: 0x111111 } }, { top: 0xffffff, topRect: rec, bottom: 0xffffff, bottomRect: rec }).setT(null);
  k.pbox(0, -h / 2 + sh / 2, 0, sw, sh, D * 0.9, c, { Z: r, z: r }, { X: shade(c, 0.85), x: shade(c, 0.85), Y: shade(c, 0.85), y: shade(c, 0.85) });
});
// Cassette VHS : coque noire, étiquette du dessus, étiquette de tranche, fenêtre et bobines de bande
S('vhs', (k, s, c, d) => {
  const [w, h, D] = s, nm = (d.label || d.name).replace(/^Cassette VHS «\s*|\s*»$/g, ''), top = k.pk(d, 'media', w * 0.56, D * 0.62, { name: d.label || d.name, bg: c, sub: 'VHS · PAL', brand: '' }), spine = k.pk(d, 'plain', w * 0.8, h * 0.6, { bg: 0xf5f5f5, brand: nm, fg: 0x1a1a1a }, d.id + ':spine');
  k.rbox(0, 0, 0, w, h - 0.0012, D - 0.0012, 0x1a1a1a, 0.002);
  k.pbox(-w * 0.16, h / 2 - 0.0005, -D * 0.04, w * 0.56, 0.0006, D * 0.62, 0xffffff, { Y: top }, {}, 'y');
  k.pbox(0, 0, D / 2 - 0.0005, w * 0.8, h * 0.6, 0.0006, 0xffffff, { Z: spine }, {}, 'z');
  k.pbox(w * 0.3, h / 2 - 0.0005, -D * 0.04, w * 0.28, 0.0006, D * 0.5, 0x262b30, {}, {}, 'y');
  if (!k.lod) for (const [x, r] of [[w * 0.25, D * 0.17], [w * 0.36, D * 0.1]]) { k.tube(x, h / 2 - 0.0003, -D * 0.04, r, 0.0004, 0x3e2723, 10); k.tube(x, h / 2 - 0.0001, -D * 0.04, D * 0.045, 0.0004, 0xeeeeee, 8); }
});
// Journal plié : liasse de pages (tranches lignées), une imprimée, pli arrondi, feuillets décalés
S('newspaper', (k, s, c, d) => {
  const [w, h, D] = s, old = d.id === 'old_newspaper', r = k.pk(d, 'news', w, D, { name: d.l ?? (old ? 'L\'ÉCHO D\'HÉLIOS' : 'LE JOURNAL'), sub: d.sub ?? (old ? 'DRAME AU CENTRE HÉLIOS' : 'NUIT AGITÉE AU CENTRE'), bg: old ? 0xe8d9b0 : 0xf3f0e8 }), pg = leaves(k, false);
  k.pbox(h * 0.25, 0, 0, w - h * 0.5, h, D, c, { Y: r, X: pg, Z: pg, z: pg }, { X: c, Z: c, z: c });
  ZL(k, [{ r: h / 2, y: -D / 2 }, { r: h / 2, y: D / 2, p: 'a' }], k.lod ? 6 : 10, { a: { c } }, { bottom: c, top: c }, -w / 2 + h / 2, 0);
  if (!k.lod) for (let i = 1; i < 3; i++) k.pbox(w / 2 - 0.0025 * i, -h / 2 + h * i / 3, 0, 0.003, 0.0008, D * 0.98, shade(c, 0.9));
});
// Boîtes métalliques : canettes, conserves, aérosols, corne de brume, pots de peinture (anse rabattue)
S('can', (k, s, c, d) => {
  const [w, h, D] = s, R = w / 2, Rz = D / 2, id = d.id, metal = 0xc9c9c9;
  if (id === 'deodorant' || id === 'hair_spray') { S_BOTTLE(k, s, c, { ...d, sil: 'aero', b: d.b ?? LEG(d)[1], pi: d.pi ?? LEG(d)[2], l: d.l ?? d.label ?? d.name }); return; }
  if (id === 'air_horn') { const lab = k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.4, legacyInfo(d, { bg: c, name: 'Corne de brume' })), bh = h * 0.56, sg = k.lod ? 8 : 14;
    k.lathe([{ r: R * 0.9, y: -h / 2 }, { r: R, y: -h / 2 + 0.004, p: 'm', h: 1 }, { r: R, y: -h / 2 + bh - 0.012, p: 'l' }, { r: R * 0.8, y: -h / 2 + bh - 0.002, p: 'm' }, { r: R * 0.35, y: -h / 2 + bh + 0.004, p: 'm', h: 1 }], sg, { m: { c: metal }, l: { c: 0xffffff, rect: lab } }, { bottom: shade(metal, 0.85) });
    k.lathe([{ r: R * 0.32, y: -h / 2 + bh }, { r: R * 0.34, y: -h / 2 + bh + 0.016, p: 'h' }, { r: R * 0.22, y: -h / 2 + bh + 0.03, p: 'h' }, { r: R * 0.28, y: h * 0.25, p: 'h' }, { r: R * 0.6, y: h / 2 - 0.012, p: 'h' }, { r: R * 0.98, y: h / 2, p: 'h', h: 1 }, { r: R * 0.85, y: h / 2 - 0.004, p: 'i' }], sg, { h: { c }, i: { c: 0x1a1a1a } }, { top: 0x111111 });
    k.pbox(R * 0.36, -h / 2 + bh + 0.022, 0, 0.012, 0.01, 0.014, 0x1a1a1a); return; }
  if (d.use === 'paint') { const Rb = R * 0.92, lab = k.pk(d, 'wrap', Math.PI * 2 * Rb, h * 0.66, legacyInfo(d, { bg: c, name: d.l || d.name.replace(/\s*\d.*$/, '') })), q = (r, y, p, hd) => ({ r: Rb * r, y: -h / 2 + y, p, h: hd ? 1 : 0 });
    k.lathe([q(0.95, 0), q(1, 0.003, 'm', 1), q(1, 0.008, 'm', 1), q(0.985, 0.01, 'm'), q(0.985, h * 0.86, 'l'), q(1, h - 0.008, 'm', 1), q(1, h - 0.002, 'm', 1), q(0.93, h, 'm', 1), q(0.9, h - 0.003, 'm', 1)], k.lod ? 8 : 18, { m: { c: metal }, l: { c: 0xffffff, rect: lab } }, { bottom: shade(metal, 0.85), top: shade(metal, 0.95) });
    if (!k.lod) k.tube(0, h / 2 - 0.0028, 0, Rb * 0.5, 0.0004, c, 12);
    const ye = h / 2 - 0.022, P = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI, y = ye - Math.sin(a) * h * 0.32; P.push([Math.cos(a) * (Rb + 0.003), y, Math.sin(a) * (Rb + 0.003)]); }
    k.sweep(P, 0.0016, 0x9e9e9e, { nu: 4 }); for (const sx of [-1, 1]) k.pbox(sx * (Rb + 0.0015), ye, 0, 0.003, 0.012, 0.01, metal); k.setT(TR(0, ye - h * 0.32, Rb + 0.002)).tube(0, 0, 0, Math.min(0.004, R * 0.06), R * 0.5, 0x212121, 6, { m: RZ(Math.PI / 2) }).setT(null); return; }
  const lab = k.pk(d, 'wrap', Math.PI * (R + Rz), h * 0.82, legacyInfo(d, { bg: d.lc ?? c, name: d.label || d.l || d.name }));
  if (d.mat === 'can' && /soda|lemonade|energy|tea/.test(id)) { BEVCAN(k, R, h, lab, metal, null); return; }
  TIN(k, R, Rz, h, lab, metal, null, {});
});
// Vases (céramique galbée, verre épais), bocaux à bonbons (bonbons visibles à travers le verre, couvercle à bouton)
S('jar', (k, s, c, d) => {
  const [w, h] = s, R = w / 2, y0 = -h / 2, id = d.id, sg = k.lod ? 8 : 18;
  if (id === 'vase') { k.lathe([{ r: R * 0.42, y: y0 }, { r: R * 0.48, y: y0 + 0.006, p: 'a', h: 1 }, { r: R * 0.5, y: y0 + 0.012, p: 'a' }, { r: R * 0.92, y: y0 + h * 0.3, p: 'a' }, { r: R, y: y0 + h * 0.42, p: 'a' }, { r: R * 0.78, y: y0 + h * 0.62, p: 'a' }, { r: R * 0.42, y: y0 + h * 0.8, p: 'a' }, { r: R * 0.4, y: y0 + h * 0.88, p: 'a' }, { r: R * 0.56, y: h / 2 - 0.004, p: 'a' }, { r: R * 0.58, y: h / 2, p: 'a', h: 1 }, { r: R * 0.5, y: h / 2, p: 'i', h: 1 }, { r: R * 0.34, y: y0 + h * 0.85, p: 'i' }], sg, { a: { c }, i: { c: shade(c, 0.35) } }, { bottom: shade(c, 0.7), top: shade(c, 0.25) }); return; }
  if (id === 'vase_glass') { k.lathe([{ r: R * 0.9, y: y0 }, { r: R * 0.94, y: y0 + 0.004, p: 'g', h: 1 }, { r: R * 0.94, y: y0 + h * 0.08, p: 'b' }, { r: R * 0.96, y: h / 2 - 0.003, p: 'g' }, { r: R * 0.98, y: h / 2, p: 'g', h: 1 }, { r: R * 0.86, y: h / 2, p: 'i', h: 1 }, { r: R * 0.84, y: y0 + h * 0.1, p: 'i' }], sg, { g: { c }, b: { c: shade(c, 0.8) }, i: { c: shade(c, 0.7) } }, { bottom: shade(c, 0.75), top: shade(c, 0.6) }); return; }
  if (/candy_jar/.test(id)) {
    const pal = id === 'candy_jar_bears' ? [0xff7043, 0xffca28, 0x66bb6a, 0xef5350, 0xfafafa] : id === 'candy_jar_lemon' ? [0xfff176, 0xffee58, 0xfdd835, 0xfff59d, 0xc6ff00] : [0xff4081, 0x40c4ff, 0xffeb3b, 0x69f0ae, 0xfafafa], glass = 0xdfeef2, jh = h * 0.76, lv = 0.72;
    k.surf(sg, k.lod ? 4 : 10, (u, v) => { const a = 2 * Math.PI * (u - 0.5), r = R * (v < 0.06 ? 0.9 + v / 0.06 * 0.1 : v > 0.9 ? 1 - (v - 0.9) * 1.2 : 1); return [r * Math.sin(a), y0 + jh * v, r * Math.cos(a)]; }, glass, { col: (u, v) => (v < lv ? pal[Math.floor(hn(u * 23.1, v * 17.3) * pal.length)] : glass) });
    k.tube(0, y0 + 0.001, 0, R * 0.9, 0.002, glass, sg);
    k.lathe([{ r: R * 0.9, y: y0 + jh }, { r: R * 0.93, y: y0 + jh + 0.006, p: 'g', h: 1 }, { r: R * 0.72, y: y0 + jh + (h - jh) * 0.55, p: 'g' }, { r: R * 0.16, y: h / 2 - 0.022, p: 'g' }], sg, { g: { c: glass } }, { top: glass });
    k.orb(0, h / 2 - 0.012, 0, 0.012, 0.012, 0.012, glass, 8, 6); return;
  }
  S_JAR(k, s, c, { ...d, b: d.b ?? LEG(d)[1], pi: d.pi ?? LEG(d)[2], l: d.l ?? d.label ?? d.name.replace(/^(Pot de |Pot d'|Nourriture pour )/i, ''), c2: d.c2 ?? (d.id === 'slime' ? 0xffffff : 0xd4af37) });
});
// Poudrier / miroir de poche : deux coques galbées, joint, charnière, fermoir, motif en relief
function COMPACT(k, w, h, c, powder) {
  const R = w / 2, y0 = -h / 2, sg = k.lod ? 10 : 20;
  if (k.lod) { k.lathe([{ r: R * 0.85, y: y0 }, { r: R, y: y0 + h * 0.35, p: 'a' }, { r: R, y: y0 + h * 0.6, p: 'a' }, { r: R * 0.6, y: h / 2, p: 'a' }], 6, { a: { c } }, { bottom: c, top: c }); return; }
  k.lathe([{ r: R * 0.82, y: y0 }, { r: R * 0.97, y: y0 + h * 0.15, p: 'a' }, { r: R, y: y0 + h * 0.42, p: 'a', h: 1 }, { r: R * 0.97, y: y0 + h * 0.46, p: 's', h: 1 }, { r: R, y: y0 + h * 0.5, p: 'a' }, { r: R * 0.97, y: y0 + h * 0.85, p: 'a' }, { r: R * 0.8, y: h / 2 - 0.0005, p: 'a' }, { r: R * 0.55, y: h / 2, p: 'e' }], sg, { a: { c }, s: { c: shade(c, 0.55) }, e: { c: shade(c, 1.1) } }, { bottom: shade(c, 0.9), top: shade(c, 1.1) });
  k.tube(0, y0 + h * 0.45, -R * 0.98, 0.002, R * 0.3, shade(c, 0.8), 6, { m: RZ(Math.PI / 2) }); k.pbox(0, y0 + h * 0.45, R * 0.985, R * 0.18, h * 0.22, 0.002, shade(c, 0.85));
  if (powder && !k.lod) k.setT(mm(TR(0, h / 2 + 0.0002, 0), RX(-Math.PI / 2))).prism(starPts(R * 0.35, R * 0.16, 6), 0.0004, shade(c, 1.2), { back: false, side: false }).setT(null);
}
// Objets cylindriques : un modèle par article (fromage, papier toilette, enceinte, détecteur, bobine, poubelle…)
const CYL = {
  cheese: (k, [w, h], c, d) => { const R = w / 2, y0 = -h / 2, wood = 0xe3cc9a, lab = k.pk(d, 'box', w * 0.9, w * 0.9, { brand: 'Normandie', name: 'Camembert', bg: 0xf5ecd0, layout: 3 }, d.id + ':top');
    k.lathe([{ r: R * 0.94, y: y0 }, { r: R * 0.96, y: y0 + 0.002, p: 'b' }, { r: R * 0.96, y: y0 + h * 0.6, p: 'b' }], k.lod ? 8 : 18, { b: { c: wood } }, { bottom: shade(wood, 0.9) });
    k.lathe([{ r: R, y: y0 + h * 0.38 }, { r: R, y: h / 2 - 0.0015, p: 'l' }, { r: R * 0.98, y: h / 2, p: 'l', h: 1 }], k.lod ? 8 : 18, { l: { c: shade(wood, 0.95) } }, { top: 0xffffff, topRect: lab }); },
  toilet_paper: (k, [w, h], c) => { const R = w / 2 - 0.004, Rc = R * 0.4, y0 = -h / 2, y1 = h / 2, t = 0.0015;
    k.lathe([{ r: R, y: y0 }, { r: R, y: y1, p: 'o', h: 1 }, { r: Rc + t, y: y1, p: 's', h: 1 }, { r: Rc + t, y: y1 - 0.0005, p: 'k', h: 1 }, { r: Rc, y: y1 - 0.0005, p: 'k', h: 1 }, { r: Rc, y: y0 + 0.0005, p: 'n', h: 1 }, { r: Rc + t, y: y0 + 0.0005, p: 'k', h: 1 }, { r: Rc + t, y: y0, p: 'k', h: 1 }, { r: R, y: y0, p: 's' }], k.lod ? 8 : 20, { o: { c, rect: k.lod ? null : k.shared('grille:emboss', 32, 32, { kind: 'grille', holes: true, bg: 0xffffff, n: 6 }) }, s: { c: shade(c, 0.95) }, k: { c: 0xc8a46e }, n: { c: 0xb8925a } }, {});
    if (!k.lod) k.surf(4, 1, (u, v) => { const a = 0.45 + u * 0.18, r = R + 0.0004 + u * u * 0.0035; return [r * Math.sin(a), y0 + 0.001 + (h - 0.002) * v, r * Math.cos(a)]; }, c, { open: true }); },
  cookie: (k, [w, h], c) => { const R = w / 2; k.orb(0, 0, 0, R * 0.97, h / 2 * 0.86, R * 0.97, c, k.lod ? 8 : 16, k.lod ? 4 : 6, { e: [0.5, 1], f: (u, v, p) => { const b = 1 + 0.06 * (hn(u * 13, v * 7) - 0.5); return [p[0] * b, p[1] * (1 + 0.3 * (hn(u * 9, v * 11) - 0.5)), p[2] * b]; }, col: (u, v) => (v > 0.55 && hn(u * 31, v * 19) > 0.8 ? 0x3e2723 : mixc(c, shade(c, 1.15), v)) });
    if (!k.lod) for (let i = 0; i < 6; i++) { const a = i * 2.3, r = R * (0.2 + (i % 3) * 0.25); k.orb(Math.cos(a) * r, h * 0.3, Math.sin(a) * r, R * 0.1, h * 0.22, R * 0.09, 0x3e2723, 5, 3); } },
  bandage: (k, [w, h], c) => { const R = w / 2 - 0.002, y0 = -h / 2 + 0.004, y1 = h / 2 - 0.004;
    k.lathe([{ r: R * 0.25, y: y0 }, { r: R, y: y0, p: 's', h: 1 }, { r: R, y: y1, p: 'o', h: 1 }, { r: R * 0.25, y: y1, p: 's', h: 1 }, { r: R * 0.25, y: y0, p: 'i' }], k.lod ? 8 : 16, { o: { c: 0xffffff, rect: k.lod ? null : k.shared('fabric:gauze', 32, 32, { kind: 'fabric', bg: c, pat: 'check' }) }, s: { c: shade(c, 0.94) }, i: { c: shade(c, 0.8) } }, {});
    if (!k.lod) k.surf(3, 1, (u, v) => { const a = 0.2 + u * 0.5, r = R + 0.0005 + u * 0.002; return [r * Math.sin(a), y0 + (y1 - y0) * v, r * Math.cos(a)]; }, c, { open: true }); },
  pet_bed: (k, [w, h], c) => { const R = w / 2, y0 = -h / 2; k.lathe([{ r: R * 0.9, y: y0 }, { r: R, y: y0 + h * 0.15, p: 'o' }, { r: R * 0.98, y: y0 + h * 0.75, p: 'o' }, { r: R * 0.9, y: h / 2 - 0.004, p: 'o' }, { r: R * 0.8, y: h / 2, p: 'o' }, { r: R * 0.7, y: y0 + h * 0.75, p: 'o' }, { r: R * 0.66, y: y0 + h * 0.45, p: 'c' }, { r: R * 0.4, y: y0 + h * 0.5, p: 'c' }, { r: 0.01, y: y0 + h * 0.48, p: 'c' }], k.lod ? 10 : 24, { o: { c }, c: { c: 0xd7ccc8 } }, { bottom: shade(c, 0.6) }); },
  speaker: (k, [w, h], c) => { const R = w / 2, y0 = -h / 2; k.lathe([{ r: R * 0.88, y: y0 }, { r: R * 0.98, y: y0 + 0.006, p: 'k' }, { r: R * 0.98, y: y0 + 0.014, p: 'k', h: 1 }, { r: R, y: y0 + 0.016, p: 'f' }, { r: R, y: h / 2 - 0.016, p: 'f', h: 1 }, { r: R * 0.98, y: h / 2 - 0.014, p: 'k' }, { r: R * 0.97, y: h / 2 - 0.005, p: 'k' }, { r: R * 0.85, y: h / 2 - 0.001, p: 'k', h: 1 }], k.lod ? 8 : 16, { k: { c: 0x1a1a1a }, f: { c: 0xffffff, rect: k.lod ? null : k.shared('grille:spk:' + c, 32, 64, { kind: 'grille', bg: c }) } }, { bottom: 0x111111, top: 0x222222 });
    if (!k.lod) for (let i = 0; i < 3; i++) k.tube((i - 1) * R * 0.38, h / 2 - 0.0004, 0, R * 0.12, 0.0012, i === 1 ? 0x43a047 : 0x424242, 8); },
  smoke_detector: (k, [w, h], c) => { const R = w / 2, y0 = -h / 2; k.lathe([{ r: R, y: y0 }, { r: R, y: y0 + h * 0.3, p: 'a' }, { r: R * 0.96, y: y0 + h * 0.36, p: 'a', h: 1 }, { r: R * 0.9, y: y0 + h * 0.4, p: 'v' }, { r: R * 0.82, y: y0 + h * 0.75, p: 'v' }, { r: R * 0.6, y: h / 2 - 0.003, p: 'a' }, { r: R * 0.3, y: h / 2 - 0.0022, p: 'a' }], k.lod ? 10 : 24, { a: { c }, v: { c: 0xffffff, rect: k.lod ? null : ridgeTex(k, 24) } }, { bottom: 0xe0e0e0, top: c }); k.tube(0, h / 2 - 0.0011, 0, R * 0.22, 0.002, 0xf0f0f0, 12); deco(k, R * 0.45, h / 2 - 0.0028, 0, 0.004, 0.003, 0.004, 0xd50000); },
  compact_mirror: (k, [w, h], c) => COMPACT(k, w, h, c, false),
  powder_compact: (k, [w, h], c) => COMPACT(k, w, h, c, true),
  yoga_mat: (k, [w, h], c, d) => { const R = w / 2 - 0.003, sp = k.pk(d, 'spiral', w, w, { bg: c, n: 7 }); k.lathe([{ r: R, y: -h / 2 }, { r: R, y: h / 2, p: 'a' }], k.lod ? 8 : 18, { a: { c } }, { top: 0xffffff, topRect: sp, bottom: 0xffffff, bottomRect: sp });
    for (const y of [-h * 0.3, h * 0.3]) k.lathe([{ r: R + 0.0015, y: y - 0.012 }, { r: R + 0.0015, y: y + 0.012, p: 's' }], k.lod ? 8 : 18, { s: { c: 0x37474f } }, {});
    k.sweep([[R + 0.0022, -h * 0.3, 0], [R + 0.0026, 0, 0], [R + 0.0022, h * 0.3, 0]], 0.008, 0x37474f, { nu: 4, rz: 0.08 }); },
  sleeping_bag: (k, [w, h], c) => { const R = w / 2, y0 = -h / 2; k.lathe([{ r: R * 0.85, y: y0 }, { r: R * 0.97, y: y0 + 0.012, p: 'a' }, { r: R, y: y0 + h * 0.3, p: 'a' }, { r: R * 0.98, y: y0 + h * 0.75, p: 'a' }, { r: R * 0.85, y: h / 2 - 0.03, p: 'a' }, { r: R * 0.3, y: h / 2 - 0.012, p: 'a' }, { r: R * 0.12, y: h / 2 - 0.006, p: 'a' }], k.lod ? 8 : 16, { a: { c } }, { bottom: shade(c, 0.8), top: shade(c, 0.6) });
    k.sweep([[0, h / 2 - 0.008, 0], [0.012, h / 2 - 0.004, 0.006], [0.02, h / 2 - 0.012, 0.012]], 0.0015, 0x212121, { nu: 3 }); k.pbox(0.022, h / 2 - 0.018, 0.014, 0.008, 0.014, 0.008, 0x212121);
    if (!k.lod) for (let i = 0; i < 4; i++) k.setT(RY(-(i / 4 * Math.PI * 2 + 0.4))).pbox(0, 0, R * 0.985, 0.016, h * 0.62, 0.002, 0x263238).setT(null); },
  tambourine: (k, [w, h], c) => { const R = w / 2 - 0.009, y0 = -h / 2, wood = 0xb07a45, sg = k.lod ? 10 : 24;
    k.lathe([{ r: R * 0.93, y: y0 }, { r: R, y: y0 + 0.002, p: 'w' }, { r: R, y: h / 2 - 0.004, p: 'w' }, { r: R * 0.99, y: h / 2, p: 's', h: 1 }, { r: R * 0.93, y: h / 2, p: 'i', h: 1 }, { r: R * 0.93, y: y0, p: 'i' }], sg, { w: { c: wood }, s: { c }, i: { c: shade(wood, 0.8) } }, {}); k.tube(0, h / 2 - 0.001, 0, R * 0.93, 0.0015, c, sg);
    for (let i = 0; i < (k.lod ? 3 : 5); i++) { const a = i / 5 * Math.PI * 2, x = Math.sin(a) * R, z = Math.cos(a) * R; for (const dy of [-0.0035, 0.0035]) k.tube(x, dy, z, 0.0085, 0.0012, 0xd4c48a, 8); k.setT(mm(TR(x, 0, z), RY(a))).pbox(0, 0, 0, 0.02, h * 0.42, 0.004, 0x2a1d14).setT(null); } },
  film_roll: (k, [w, h], c, d) => { const R = w / 2 - 0.002, y0 = -h / 2, lab = k.pk(d, 'wrap', Math.PI * 2 * R, h * 0.7, { brand: 'HÉLIOCOLOR', name: '200', bg: c });
    k.lathe([{ r: R * 0.92, y: y0 + 0.003 }, { r: R, y: y0 + 0.005, p: 'm', h: 1 }, { r: R, y: h / 2 - 0.007, p: 'l' }, { r: R * 0.92, y: h / 2 - 0.005, p: 'm', h: 1 }], k.lod ? 8 : 14, { m: { c: 0x2a2a2a }, l: { c: 0xffffff, rect: lab } }, { bottom: 0x2a2a2a, top: 0x2a2a2a });
    k.tube(0, h / 2 - 0.0025, 0, R * 0.32, 0.005, 0x1a1a1a, 8); k.tube(0, y0 + 0.0015, 0, R * 0.25, 0.003, 0x1a1a1a, 8); k.setT(RY(0.3)).pbox(0, 0, R * 0.95, R * 0.7, h * 0.6, 0.0012, 0x3e2723).setT(null); },
  licorice: (k, [w, h], c, d) => { const R = w / 2, sp = k.pk(d, 'spiral', w, w, { bg: c, n: 6, core: 0xe91e63 }); k.lathe([{ r: R * 0.96, y: -h / 2 }, { r: R, y: -h / 2 + 0.002, p: 'a' }, { r: R, y: h / 2 - 0.002, p: 'a' }, { r: R * 0.96, y: h / 2, p: 'a' }], k.lod ? 8 : 16, { a: { c, rect: k.lod ? null : ridgeTex(k, 16) } }, { top: 0xffffff, topRect: sp, bottom: 0xffffff, bottomRect: sp }); k.orb(0, h / 2 - h * 0.15, 0, R * 0.16, h * 0.15, R * 0.16, 0xe91e63, 6, 4); },
  film_reel: (k, [w, h], c) => { const R = w / 2, t = 0.0018, win = [0, 1, 2, 3, 4, 5].map((i) => { const a0 = i / 6 * Math.PI * 2 + 0.15, a1 = a0 + Math.PI / 3 - 0.3, P = []; for (let j = 0; j <= 2; j++) { const a = a0 + (a1 - a0) * j / 2; P.push([Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88]); } for (let j = 2; j >= 0; j--) { const a = a0 + (a1 - a0) * j / 2; P.push([Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4]); } return P; });
    for (const y of [-h / 2 + t / 2, h / 2 - t / 2]) k.setT(mm(TR(0, y, 0), RX(-Math.PI / 2))).prism(ellip(R, R, k.lod ? 12 : 28), t, c, { holes: k.lod ? [] : win, cs: shade(c, 0.85) }).setT(null);
    k.lathe([{ r: R * 0.62, y: -h / 2 + t }, { r: R * 0.62, y: h / 2 - t, p: 'f' }], k.lod ? 10 : 24, { f: { c: 0x2b1d14 } }, { top: 0x3e2a1c, bottom: 0x3e2a1c }); k.tube(0, 0, 0, R * 0.16, h, shade(c, 0.8), 12, { tc: 0x1a1a1a, bc: 0x1a1a1a }); },
  trash_can: (k, [w, h], c) => { const R = w / 2, sg = k.lod ? 10 : 24; k.lathe([{ r: R * 0.86, y: -h / 2 }, { r: R * 0.88, y: -h / 2 + 0.02, p: 'b', h: 1 }, { r: R * 0.9, y: -h / 2 + 0.022, p: 'a' }, { r: R * 0.97, y: h / 2 - h * 0.14, p: 'a', h: 1 }, { r: R, y: h / 2 - h * 0.13, p: 'r' }, { r: R, y: h / 2 - h * 0.1, p: 'r', h: 1 }, { r: R * 0.98, y: h / 2 - h * 0.1, p: 'd' }, { r: R * 0.85, y: h / 2 - h * 0.03, p: 'd' }, { r: R * 0.5, y: h / 2 - 0.004, p: 'd' }, { r: R * 0.1, y: h / 2, p: 'd' }], sg, { b: { c: 0x212121 }, a: { c, rect: k.lod ? null : ridgeTex(k, 32) }, r: { c: shade(c, 1.2) }, d: { c: shade(c, 1.1) } }, { bottom: 0x1a1a1a, top: shade(c, 1.1) });
    k.setT(mm(TR(0, h / 2 - h * 0.07, R * 0.86), RX(-0.6))).pbox(0, 0, 0, R * 0.9, h * 0.045, 0.004, 0x0a0a0a).setT(null); },
  pet_bowl: (k, [w, h], c) => { const R = w / 2; OPENCUP(k, R, R * 0.8, h, -h / 2, c, shade(c, 1.1), { t: 0.008, sg: k.lod ? 8 : 18 }); },
  pain_raisins: (k, [w, h], c) => { const R = w / 2, sw = (u, p) => Math.sin(u * Math.PI * 2 + Math.hypot(p[0], p[2]) / R * 14);
    k.orb(0, 0, 0, R, h / 2 * 0.88, R, c, k.lod ? 10 : 22, k.lod ? 4 : 7, { e: [0.6, 1], f: (u, v, p) => [p[0], p[1] * (1 + (v > 0.5 ? 0.12 * sw(u, p) : 0)), p[2]], col: (u, v, p) => (v > 0.5 ? (hn(u * 41, v * 23) > 0.86 ? 0x3e1f14 : mixc(shade(c, 0.75), shade(c, 1.15), sw(u, p) * 0.5 + 0.5)) : shade(c, 0.85)) }); },
  canele: (k, [w, h], c) => { const R = w / 2, y0 = -h / 2, n = k.lod ? 12 : 24;
    k.surf(n, k.lod ? 3 : 5, (u, v) => { const a = 2 * Math.PI * (u - 0.5), fl = 1 - 0.07 * Math.max(0, Math.cos(a * 8)), r = R * (0.92 - 0.1 * v) * fl; return [r * Math.sin(a), y0 + h * 0.92 * v, r * Math.cos(a)]; }, c, { col: (u, v) => mixc(c, 0x2a1205, v > 0.8 ? 0.5 : 0) });
    k.lathe([{ r: R * 0.76, y: y0 + h * 0.92 }, { r: R * 0.55, y: y0 + h * 0.88, p: 't' }, { r: R * 0.1, y: y0 + h * 0.86, p: 't' }], k.lod ? 8 : 14, { t: { c: 0x3a1a08 } }, {}); k.tube(0, y0 + 0.001, 0, R * 0.88, 0.002, shade(c, 0.8), 12); },
  frisbee: (k, [w, h], c) => { const R = w / 2, y0 = -h / 2, sg = k.lod ? 10 : 28;
    k.lathe([{ r: R * 0.95, y: y0 }, { r: R * 0.99, y: y0 + 0.002, p: 'a' }, { r: R, y: h / 2 - 0.012, p: 'a' }, { r: R * 0.9, y: h / 2 - 0.006, p: 'a' }, { r: R * 0.6, y: h / 2 - 0.002, p: 'a' }, { r: 0.002, y: h / 2, p: 'a' }], sg, { a: { c } }, {});
    k.lathe([{ r: 0.002, y: h / 2 - 0.004 }, { r: R * 0.85, y: h / 2 - 0.009, p: 'i' }, { r: R * 0.95, y: y0, p: 'i' }], sg, { i: { c: shade(c, 0.8) } }, {}); },
  compass: (k, [w, h], c, d) => { const R = w / 2, y0 = -h / 2, face = k.pk(d, 'dial', w * 0.8, w * 0.8, { bg: 0xf5f5f0, fg: 0x222222, num: 'compass', rim: 0x222222 });
    k.lathe([{ r: R * 0.9, y: y0 }, { r: R, y: y0 + 0.003, p: 'a' }, { r: R, y: h / 2 - 0.003, p: 'a' }, { r: R * 0.94, y: h / 2, p: 'a', h: 1 }, { r: R * 0.82, y: h / 2, p: 'b', h: 1 }, { r: R * 0.8, y: h / 2 - 0.004, p: 'b' }], k.lod ? 10 : 20, { a: { c }, b: { c: 0x9e9e9e } }, { bottom: shade(c, 0.8), top: 0xffffff, topRect: face });
    for (const [sg, col] of [[1, 0xd50000], [-1, 0xf5f5f5]]) k.setT(mm(TR(0, h / 2 - 0.0028, 0), RX(-Math.PI / 2), RZ(0.3))).prism([[R * 0.08 * sg, 0], [0, R * 0.6 * sg], [-R * 0.08 * sg, 0]], 0.0008, col, { back: false }).setT(null);
    k.tube(0, h / 2 - 0.0024, 0, R * 0.06, 0.0012, 0x9e9e9e, 8); },
  castanets: (k, [w, h], c) => { const R = w / 2; for (const sy of [-1, 1]) k.orb(0, sy * h * 0.24, 0, R * 0.92, h * 0.22, R * 0.98, sy > 0 ? c : shade(c, 0.85), k.lod ? 8 : 14, k.lod ? 4 : 6, { e: [0.6, 1] });
    k.sweep([[-0.008, h * 0.4, -R * 0.85], [0, h * 0.47, -R * 0.97], [0.008, h * 0.4, -R * 0.85], [0.006, -h * 0.4, -R * 0.85], [-0.006, -h * 0.4, -R * 0.85], [-0.008, h * 0.4, -R * 0.85]], 0.0012, 0xd32f2f, { nu: 3 }); },
  cymbal: (k, [w, h], c) => { const R = w / 2, y0 = -h / 2, sg = k.lod ? 12 : 32;
    k.lathe([{ r: R, y: y0 }, { r: R * 0.6, y: y0 + h * 0.25, p: 'w' }, { r: R * 0.18, y: y0 + h * 0.45, p: 'w', h: 1 }, { r: R * 0.12, y: h / 2 - 0.0015, p: 'b' }, { r: 0.004, y: h / 2, p: 'b' }], sg, { w: { c, rect: k.lod ? null : leaves(k, false) }, b: { c } }, {});
    k.lathe([{ r: 0.004, y: h / 2 - 0.0012 }, { r: R * 0.12, y: h / 2 - 0.0027, p: 'u' }, { r: R * 0.18, y: y0 + h * 0.45 - 0.0012, p: 'u' }, { r: R * 0.99, y: y0 + 0.0002, p: 'u' }], sg, { u: { c: shade(c, 0.85) } }, {}); },
  camera_lens: (k, [w, h], c) => { const R = w / 2, y0 = -h / 2;
    k.lathe([{ r: R * 0.8, y: y0 }, { r: R * 0.84, y: y0 + 0.003, p: 'm', h: 1 }, { r: R * 0.92, y: y0 + 0.004, p: 'm', h: 1 }, { r: R * 0.92, y: y0 + 0.008, p: 'a' }, { r: R * 0.95, y: y0 + h * 0.3, p: 'a', h: 1 }, { r: R, y: y0 + h * 0.32, p: 'g' }, { r: R, y: y0 + h * 0.72, p: 'g', h: 1 }, { r: R * 0.96, y: y0 + h * 0.74, p: 'a' }, { r: R * 0.98, y: h / 2, p: 'a', h: 1 }, { r: R * 0.8, y: h / 2, p: 'i', h: 1 }, { r: R * 0.76, y: h / 2 - 0.006, p: 'i' }], k.lod ? 8 : 18, { m: { c: 0xc0c4c8 }, a: { c }, g: { c: 0x2a2a2a, rect: k.lod ? null : ridgeTex(k, 36) }, i: { c: 0x101010 } }, { bottom: 0x111111, top: 0x1c2a3a });
    if (!k.lod) deco(k, 0, y0 + h * 0.24, R * 0.95, 0.002, 0.004, 0.001, 0xf5f5f5); },
};
S('cyl', (k, s, c, d) => { const f = CYL[d.id]; if (f) { f(k, s, c, d); return; } const R = s[0] / 2, Rz = s[2] / 2, h = s[1]; k.lathe([{ r: R * 0.95, rz: Rz * 0.95, y: -h / 2 }, { r: R, rz: Rz, y: -h / 2 + Math.min(0.004, h * 0.1), p: 'a' }, { r: R, rz: Rz, y: h / 2 - Math.min(0.004, h * 0.1), p: 'a' }, { r: R * 0.95, rz: Rz * 0.95, y: h / 2, p: 'a' }], k.lod ? 8 : 16, { a: { c } }, { bottom: shade(c, 0.85), top: shade(c, 1.05) }); });
// Objets sphériques : pastèque rayée, salade, brioche, perruques, boule à facettes, ballons, kettlebell, ocarina…
const SPH = {
  watermelon: (k, [w, h, D], c) => { k.orb(0, 0, 0, w / 2, h / 2, D / 2, c, k.lod ? 10 : 22, k.lod ? 6 : 12, { col: (u, v) => (v < 0.04 || v > 0.96 ? 0xc5b358 : Math.sin(u * Math.PI * 2 * 10 + Math.sin(v * Math.PI * 4) * 0.8) > 0.25 ? shade(c, 0.6) : mixc(c, 0x9ccc65, 0.35)) }); },
  salad: (k, [w, h], c) => { const R = w / 2; k.orb(0, -h * 0.05, 0, R * 0.62, h * 0.42, R * 0.62, mixc(c, 0xdcedc8, 0.4), k.lod ? 8 : 12, k.lod ? 5 : 8, { f: (u, v, p) => { const b = 1 + 0.08 * Math.sin(u * 40) * Math.sin(v * 9); return [p[0] * b, p[1], p[2] * b]; } });
    for (let i = 0; i < (k.lod ? 4 : 7); i++) { const a = i * 0.9; leafAt(k, Math.cos(a) * R * 0.22, -h / 2 + h * 0.06, Math.sin(a) * R * 0.22, Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35, h * 0.92, R * 0.62, i % 2 ? c : shade(c, 1.12), 0.5); } },
  brioche: (k, [w, h], c) => { const R = w / 2, y0 = -h / 2, n = k.lod ? 12 : 24;
    k.surf(n, k.lod ? 3 : 6, (u, v) => { const a = 2 * Math.PI * (u - 0.5), lobe = 0.88 + 0.12 * Math.abs(Math.cos(a * 4)), r = R * lobe * (v < 0.15 ? 0.82 + v / 0.15 * 0.18 : Math.cos((v - 0.15) / 0.85 * Math.PI * 0.45)); return [r * Math.sin(a), y0 + h * 0.7 * Math.sin(v * Math.PI / 2), r * Math.cos(a)]; }, c, { col: (u, v) => mixc(c, 0x8d4f1c, v * 0.5) });
    k.tube(0, y0 + 0.001, 0, R * 0.8, 0.002, shade(c, 0.85), 12); k.orb(0, y0 + h * 0.76, 0, R * 0.36, h * 0.24, R * 0.36, shade(c, 0.8), 10, 6); },
  wig: (k, [w, h, D], c) => { k.orb(0, h * 0.02, 0, w / 2 * 0.95, h / 2 * 0.94, D / 2 * 0.95, c, k.lod ? 10 : 18, k.lod ? 6 : 12, { f: (u, v, p) => { const b = 1 + 0.06 * (hn(u * 17, v * 13) - 0.5) + 0.03 * Math.sin(u * 60) * Math.sin(v * 40); return [p[0] * b, p[1] * b, p[2] * b]; }, col: (u, v) => mixc(c, shade(c, 0.7), hn(u * 29, v * 31) * 0.6) }); k.orb(0, -h * 0.3, 0, w * 0.34, h * 0.1, D * 0.34, 0x2a1a10, 10, 4); },
  wig_blonde: (k, [w, h, D], c) => { const top = h / 2, cr = Math.min(w, D) * 0.42, curtain = (r0, fl, col) => k.surf(k.lod ? 8 : 16, k.lod ? 3 : 6, (u, v) => { const a = Math.PI * (0.25 + 1.5 * u), y = top - cr * 0.9 - (h - cr * 0.95) * v, r = r0 * (1 + 0.08 * v) * (1 + 0.04 * Math.sin(u * 40 + v * 6)); return [r * Math.sin(a), y, D * 0.42 / (w * 0.44) * r * Math.cos(a)]; }, col, { open: true, flip: fl, col: (u) => mixc(col, shade(col, 0.75), Math.abs(Math.sin(u * 48)) * 0.6) });
    k.orb(0, top - cr * 0.95, 0, w * 0.42, cr * 0.95, D * 0.44, c, k.lod ? 10 : 16, k.lod ? 5 : 9, { col: (u) => mixc(c, shade(c, 0.8), Math.abs(Math.sin(u * 50)) * 0.5) }); curtain(w * 0.44, true, c); curtain(w * 0.41, false, shade(c, 0.7)); },
  disco_ball: (k, [w, h, D], c) => { const R = Math.min(w, h, D) / 2 - 0.005, nu = k.lod ? 10 : 20, nv = k.lod ? 6 : 10, rnd = mulberry32(5), P = (uu, vv) => { const a = 2 * Math.PI * uu, t = Math.PI * vv; return [R * Math.sin(t) * Math.sin(a), -R * Math.cos(t), R * Math.sin(t) * Math.cos(a)]; }, g = 0.08;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) k.quad(P((i + g) / nu, (j + g) / nv), P((i + 1 - g) / nu, (j + g) / nv), P((i + 1 - g) / nu, (j + 1 - g) / nv), P((i + g) / nu, (j + 1 - g) / nv), [0xffffff, 0xdfe6ec, 0xb0bec5, 0x90a4ae, 0xf5f5f5, 0x78909c][(rnd() * 6) | 0]);
    k.orb(0, 0, 0, R * 0.97, R * 0.97, R * 0.97, 0x263238, k.lod ? 6 : 10, k.lod ? 4 : 6); k.tube(0, R + 0.003, 0, 0.004, 0.006, 0x9e9e9e, 6); },
  gumball: (k, [w, h, D], c) => { k.orb(0, 0, 0, w / 2, h / 2, D / 2, c, k.lod ? 6 : 10, k.lod ? 4 : 7, { col: (u, v) => mixc(c, 0xffffff, Math.max(0, v - 0.75) * 1.2) }); },
  bath_bomb: (k, [w], c) => { const R = w / 2 * 0.99; k.orb(0, 0, 0, R, R, R, c, k.lod ? 8 : 14, k.lod ? 6 : 9, { col: (u, v) => (hn(u * 33, v * 27) > 0.85 ? 0xffffff : hn(u * 13, v * 7) > 0.8 ? 0xf48fb1 : c) }); k.lathe([{ r: R * 1.008, y: -0.002 }, { r: R * 1.008, y: 0.002, p: 's' }], k.lod ? 8 : 14, { s: { c: shade(c, 0.85) } }); },
  rugby_ball: (k, [w, h, D], c) => { k.setT(RX(Math.PI / 2)).orb(0, 0, 0, w / 2, D / 2, h / 2, c, k.lod ? 8 : 16, k.lod ? 6 : 12, { e: [1.3, 1], col: (u, v) => (Math.abs(((u * 4) % 1) - 0.5) > 0.47 ? 0x5d4037 : (v > 0.2 && v < 0.27) || (v > 0.73 && v < 0.8) ? 0x1565c0 : c) }).setT(null);
    if (!k.lod) for (let i = 0; i < 6; i++) k.box(0, h / 2 - 0.0015, (i - 2.5) * 0.012, 0.012, 0.002, 0.003, 0xf5f5f5); },
  petanque_ball: (k, [w], c) => { const R = w / 2; k.orb(0, 0, 0, R, R, R, c, k.lod ? 8 : 14, k.lod ? 6 : 10, { col: (u, v) => { const g = Math.abs(Math.sin((v + Math.sin(u * Math.PI * 2) * 0.08) * Math.PI * 7)); return g < 0.12 ? shade(c, 0.6) : mixc(c, 0xffffff, Math.max(0, v - 0.6) * 0.5); } }); },
  kettlebell: (k, [w, h, D], c) => { const R = Math.min(w, D) / 2, by = -h / 2 + R * 0.88; k.orb(0, by, 0, R, R, R, c, k.lod ? 10 : 16, k.lod ? 6 : 10, { f: (u, v, p) => [p[0], Math.max(p[1], -R * 0.86), p[2]] });
    const P = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.12 + 0.76 * i / 10); P.push([Math.cos(a) * R * 0.62, by + R * 0.5 + Math.sin(a) * (h / 2 - by - R * 0.5 - 0.013), 0]); } k.sweep(P, 0.012, c, { nu: 8 }); deco(k, 0, by, R * 0.99, 0.02, 0.016, 0.002, 0xfdd835); },
  ocarina: (k, [w, h, D], c) => { k.orb(-w * 0.06, 0, 0, w * 0.4, h / 2 * 0.95, D / 2 * 0.95, c, k.lod ? 10 : 16, k.lod ? 6 : 9, { f: (u, v, p) => [p[0] * (p[0] > 0 ? 1.12 : 1), p[1], p[2]] });
    k.tube(w * 0.38, h * 0.1, 0, 0.005, w * 0.24, c, 8, { m: RZ(Math.PI / 2), rz: 0.009 }); deco(k, w * 0.24, h * 0.42, 0, 0.008, 0.002, 0.005, 0x2a1d14);
    if (!k.lod) for (const [x, z] of [[-0.03, -0.012], [-0.012, -0.016], [0.006, -0.016], [-0.03, 0.012], [-0.012, 0.016], [0.006, 0.016]]) deco(k, x * w / 0.1, h * 0.43, z * D / 0.07, 0.006, 0.002, 0.006, 0x2a1d14); },
  clown_nose: (k, [w], c) => { const R = w / 2 * 0.98; k.orb(0, 0, 0, R, R, R, c, k.lod ? 8 : 12, k.lod ? 6 : 8, { col: (u, v) => mixc(c, 0xffffff, Math.max(0, 1 - Math.hypot(u - 0.42, v - 0.7) * 6) * 0.5) }); deco(k, 0, 0, -R * 0.97, R * 0.8, 0.003, 0.002, 0x7f0000); },
};
S('sphere', (k, s, c, d) => { const f = SPH[d.id]; if (f) { f(k, s, c, d); return; } k.orb(0, 0, 0, s[0] / 2, s[1] / 2, s[2] / 2, c, k.lod ? 8 : 14, k.lod ? 6 : 9); });
// Papier : sachets à soudure crantée, cadres photo, coques de téléphone, enseigne au néon
function PACKET(k, s, c, d, r, both = false) {
  const [w, h, D] = s, t = Math.max(0.0012, D * 0.55), sh = h * (both ? 0.08 : 0.1);
  k.rbox(0, both ? 0 : -sh / 2, 0, w, h - sh * (both ? 2 : 1), t, 0xffffff, Math.min(t * 0.4, 0.0008), { Z: r }, { z: shade(c, 0.95) });
  sealFin(k, w, h / 2 - sh, h / 2, shade(c, 0.95), k.lod ? 0 : 16, 1); if (both) sealFin(k, w, -h / 2 + sh, -h / 2, shade(c, 0.95), k.lod ? 0 : 16, -1);
}
function FRAME(k, s, c, d) {
  const [w, h, D] = s, bw = Math.min(w, h) * 0.12, photo = k.pk(d, 'photo', w - 2 * bw, h - 2 * bw, { full: true, frame: 0x222222 }, d.id + ':ph');
  k.prism([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], D * 0.6, c, { holes: [[[-w / 2 + bw, -h / 2 + bw], [w / 2 - bw, -h / 2 + bw], [w / 2 - bw, h / 2 - bw], [-w / 2 + bw, h / 2 - bw]]], bev: k.lod ? 0 : Math.min(bw * 0.4, D * 0.22), cs: shade(c, 0.85) });
  k.pbox(0, 0, -D * 0.08, w - 2 * bw + 0.002, h - 2 * bw + 0.002, 0.002, 0xffffff, { Z: photo }, {}, 'z');
  k.pbox(0, 0, -D * 0.3 - 0.001, w * 0.94, h * 0.94, 0.003, 0x4e342e, {}, {}, 'Z');
}
function PHONECASE(k, s, c, d) {
  const [w, h, D] = s, r = Math.min(w, h) * 0.13, n = k.lod ? 2 : 4, t = Math.min(0.0016, D * 0.2), back = d.id === 'phone_case_flower' ? k.pk(d, 'fabric', w, h, { bg: c, pat: 'floral' }) : d.b ? k.pk(d, 'plain', w, h, { bg: c, brand: d.b }) : null;
  k.setT(TR(0, 0, -D / 2 + t / 2)).prism(rrect(w, h, r, n), t, c, { B: back }).setT(null);
  k.prism(rrect(w, h, r, n), D, c, { holes: [rrect(w - 0.003, h - 0.003, r * 0.9, n)], bev: k.lod ? 0 : 0.0008, smooth: true });
  deco(k, -w * 0.25, h * 0.36, -D / 2 - 0.0001, w * 0.3, w * 0.3, 0.0004, 0x1a1a1a);
  if (d.id === 'phone_case_black' && !k.lod) for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.orb(sx * (w / 2 - r * 0.75), sy * (h / 2 - r * 0.75), 0, r * 0.75, r * 0.75, D * 0.5, 0x111111, 8, 5);
}
function NEON(k, s, c) {
  const [w, h, D] = s, lw = w * 0.17, lh = h * 0.56, gap = w * 0.04, x0 = -(4 * lw + 3 * gap) / 2 + lw / 2, r = Math.min(0.005, h * 0.02), z = D * 0.15, sx = (i) => x0 + i * (lw + gap), X = lw / 2 - r, Y = lh / 2;
  k.rbox(0, 0, -D / 2 + 0.003, w * 0.97, h * 0.92, 0.006, 0x151515, 0.002);
  const O = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2; O.push([sx(0) + Math.sin(a) * X, Math.cos(a) * Y, z]); }
  const strokes = [O, [[sx(1) - X, -Y, z], [sx(1) - X, Y, z], ...spl([[sx(1) - X, Y, z], [sx(1) + X * 0.7, Y * 0.95, z], [sx(1) + X, Y * 0.5, z], [sx(1) + X * 0.7, 0.02 * Y, z], [sx(1) - X, 0, z]], 7).slice(1)],
    [[sx(2) + X, Y, z], [sx(2) - X, Y, z], [sx(2) - X, -Y, z], [sx(2) + X, -Y, z]], [[sx(2) - X, 0, z], [sx(2) + X * 0.7, 0, z]], [[sx(3) - X, -Y, z], [sx(3) - X, Y, z], [sx(3) + X, -Y, z], [sx(3) + X, Y, z]]];
  for (const P of strokes) { k.sweep(P, r, c, { nu: k.lod ? 4 : 6 }); for (const e of [P[0], P[P.length - 1]]) k.tube(e[0], e[1], e[2] - D * 0.12, r * 1.2, D * 0.24, 0x1a1a1a, 6, { m: RX(Math.PI / 2) }); }
  k.sweep([[w * 0.42, -h * 0.4, -D / 2 + 0.004], [w * 0.46, -h * 0.47, -D / 2 + 0.004]], 0.002, 0x1a1a1a, { nu: 4 });
}
const CARDX = { photo: 1, polaroid_strip: 1, gerard_note: 1, lore_page: 1, eye_chart: 1, sheet_music: 1, photo_frame: 1, phone_case: 1, neon_sign: 1, seeds: 1, sugar_packet: 1 };
S('card', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id, C = CARD[id];
  if (CARDX[id]) {
    if (id === 'photo' || id === 'polaroid_strip') { k.pbox(0, 0, 0, w, h, D, 0xfafafa, { Z: k.pk(d, 'photo', w, h, { strip: id === 'polaroid_strip' ? 4 : 0 }) }, { z: 0xeeeeee }); return; }
    if (id === 'gerard_note') { k.pbox(0, 0, -D * 0.2, w, h, D * 0.5, c, { Z: k.pk(d, 'note', w, h, { bg: c }) }); if (!k.lod) k.setT(mm(TR(w / 2 - w * 0.08, -h / 2 + w * 0.08, D * 0.05), RZ(Math.PI / 4), RX(-0.25))).quad([-w * 0.11, 0, 0], [w * 0.11, 0, 0], [w * 0.11, w * 0.06, 0], [-w * 0.11, w * 0.06, 0], shade(c, 0.9)).setT(null); return; }
    if (id === 'lore_page') { const P = [[-w / 2, -h / 2], [w / 2, -h / 2]]; for (let i = 1; i < 10; i++) P.push([w / 2 - (i % 2) * w * 0.03 - 0.002 * Math.abs(Math.sin(i * 3)), -h / 2 + h * i / 10]); P.push([w / 2, h / 2], [-w / 2, h / 2]); k.prism(P, D, c, { F: k.pk(d, 'note', w, h, { bg: c, print: true }) }); return; }
    if (id === 'eye_chart') { k.rbox(0, 0, -D * 0.25, w, h, D * 0.5, 0xf5f5f5, 0.002); k.pbox(0, 0, D * 0.2, w * 0.94, h * 0.94, 0.001, 0xffffff, { Z: k.pk(d, 'chart', w * 0.94, h * 0.94) }, {}, 'z'); return; }
    if (id === 'sheet_music') { k.pbox(0, 0, 0, w, h, D, 0xfbf8f0, { Z: k.pk(d, 'sheet', w, h, { name: 'Nocturne' }) }); return; }
    if (id === 'photo_frame') { FRAME(k, s, c, d); return; }
    if (id === 'phone_case') { PHONECASE(k, s, c, d); return; }
    if (id === 'neon_sign') { NEON(k, s, c, d); return; }
    PACKET(k, s, c, d, C ? k.pk(d, C[0], w, h, { brand: C[1], picto: C[2], name: C[3] }) : k.pk(d, 'box', w, h, { brand: 'Sucre', name: 'en poudre', bg: 0xffffff }), id === 'sugar_packet'); return;
  }
  const r = C ? k.pk(d, C[0], w, h, { brand: C[1], picto: C[2], name: C[3], sub: id === 'ticket' ? '23 H 00 · M13' : C[0] === 'card' ? 'Centre Commercial Hélios' : undefined, bg: d.lc ?? (C[0] === 'card' ? c : undefined) }) : d.label ? k.label(id, d.label, c) : null;
  if (C && /scratch|lottery/.test(id)) { k.prism(rrect(w, h, Math.min(w, h) * 0.06, 2), D, 0xffffff, { F: r, cs: c }); return; }
  if (C) { k.pbox(0, 0, 0, w, h, D, c, { Z: r, z: id === 'movie_poster' ? r : null }); return; }
  k.box(0, 0, 0, w, h, D, c, r ? { label: { face: 'zZ', rect: r } } : {});
});
S('pcard', (k, s, c, d) => {
  const [w, h, D] = s, id = d.id, r = () => k.pk(d, d.lk || 'card', w, h);
  if (/phone_case/.test(id)) { PHONECASE(k, s, c, d); return; }
  if (/^frame_|photo_frame/.test(id)) { FRAME(k, s, c, d); return; }
  if (/^seeds_/.test(id)) { PACKET(k, s, c, d, r()); return; }
  if (id === 'sauce_sachet') { PACKET(k, s, c, d, r(), true); return; }
  if (/phone_card|sim_card/.test(id)) { k.prism(rrect(w, h, Math.min(w, h) * 0.08, 2), D, 0xffffff, { F: r(), cs: c }); deco(k, -w * 0.28, 0, D / 2 - 0.0001, w * 0.16, h * 0.22, 0.0004, 0xd4af37); return; }
  if (id === 'mouse_pad' || id === 'lens_cloth') { k.prism(rrect(w, h, Math.min(w, h) * 0.06, 3), D, c, { F: r(), bev: D * 0.3, smooth: true, cs: shade(c, 0.7) }); return; }
  if (/scratch|stamps/.test(id)) { k.prism(rrect(w, h, Math.min(w, h) * 0.05, 2), D, 0xffffff, { F: r(), cs: c }); return; }
  if (id === 'greeting_card') { k.pbox(0, 0, D * 0.25, w, h, D * 0.36, 0xffffff, { Z: r() }); k.pbox(0, 0, -D * 0.25, w, h, D * 0.36, 0xf5f5f5); k.tube(-w / 2 + D * 0.42, 0, 0, D * 0.42, h, 0xf0f0f0, 6); return; }
  k.pbox(0, 0, 0, w, h, D, 0xffffff, { Z: r() });
});
// ═════════════════════ PETITS OBJETS DU QUOTIDIEN (forme « box » : un modèle par article) ═════════════════════
// Repère : origine au centre de la boîte s, base posée en y = −s[1]/2 ; les décors de façade dépassent de ≤ 0,3 mm.
const DARK = 0x1c1c1e, METAL = 0xb4b8bc, CHROME = 0xdadcde, WOODC = 0xb07a45, CRUST = 0x9c5a22;
const deco = (k, x, y, z, w, h, d, c) => (k.lod ? k : k.box(x, y, z, w, h, d, c)); // pastille / fente / voyant (boîte fine), omis en présentoir
// tranche de pain (contour à épaules), à plat : épaisseur selon y
function slicePts(w, l) { const P = [], n = 7; P.push([w / 2, -l / 2]); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI; P.push([Math.cos(a) * w / 2 * (1 - 0.05 * Math.sin(a) ** 2), l * 0.18 + Math.sin(a) * l * 0.32]); } P.push([-w / 2, -l / 2]); return P; }
function toastSlice(k, x, y, z, w, t, l, crumb, crust, ry = 0) { k.setT(mm(TR(x, y, z), RY(ry), RX(-Math.PI / 2))).prism(slicePts(w, l), t, crumb, { cs: crust, bev: t * 0.3, smooth: true }).setT(null); }
// barre emballée (chocolat, céréales) : corps arrondi, soudures plates aux deux bouts
function wrappedBar(k, s, c, d, kind = 'box') {
  const [w, h, dd] = s, fin = Math.min(0.012, w * 0.09), r = k.pk(d, kind, w - 2 * fin, dd, legacyInfo(d, { layout: 3 }));
  k.rbox(0, 0, 0, w - 2 * fin, h, dd, c, h * 0.4, { Y: r });
  for (const sx of [-1, 1]) { k.box(sx * (w / 2 - fin / 2), -h * 0.1, 0, fin, h * 0.18, dd * 0.92, shade(c, 0.85)); for (let i = 0; i < 3; i++) k.box(sx * (w / 2 - fin * (0.25 + i * 0.25)), -h * 0.1, 0, 0.0006, h * 0.2, dd * 0.92, shade(c, 0.6)); }
}
function sushiNigiri(k, x, y, z, ry, fish) { k.orb(x, y + 0.006, z, 0.011, 0.006, 0.02, 0xf4f1ea, 7, 4, { e: [0.7, 0.6], f: (u, v, p) => [Math.cos(ry) * p[0] + Math.sin(ry) * p[2], p[1], -Math.sin(ry) * p[0] + Math.cos(ry) * p[2]] }); k.orb(x, y + 0.0125, z, 0.0125, 0.0028, 0.024, fish, 7, 3, { e: [0.6, 0.5], f: (u, v, p) => [Math.cos(ry) * p[0] + Math.sin(ry) * p[2], p[1] + 0.0018 * Math.cos(p[2] / 0.024 * 1.6), -Math.sin(ry) * p[0] + Math.cos(ry) * p[2]] }); }
function sushiMaki(k, x, y, z, r, hh, fill) { k.tube(x, y + hh / 2, z, r, hh, 0x15201a, 9, { tc: 0xf4f1ea }); k.tube(x, y + hh + 0.0003, z, r * 0.42, 0.0008, fill, 7); }
const BOXV = {
  powerbank: (k, [w, h, d], c) => { k.rbox(0, 0, 0, w, h, d, c, h * 0.42); deco(k, -w * 0.18, 0, d / 2 - 0.0008, w * 0.24, h * 0.26, 0.0019, 0x0b0b0b); deco(k, w * 0.18, 0, d / 2 - 0.0008, w * 0.13, h * 0.22, 0.0019, 0x0b0b0b); for (let i = 0; i < 4; i++) deco(k, -w * 0.15 + i * w * 0.1, h / 2 - 0.0006, d * 0.36, 0.003, 0.0015, 0.003, i < 3 ? 0x39d353 : 0x2a2a2a); },
  nails: (k, s, c, d) => { const r = k.pk(d, 'box', s[0], s[1], legacyInfo(d, { name: 'Pointes', sub: '2,5 × 40', picto: 'tool', bg: 0xd9c49a })); cbox(k, 0, 0, 0, s[0], s[1], s[2], 0xc8a46e, { Z: r, z: r }); },
  measuring_tape: (k, [w, h, d], c) => {
    const r = Math.min(w, h) * 0.2; k.prism(rrect(w, h * 0.96, r, 3), d * 0.8, c, { bev: d * 0.08, smooth: true }); k.setT(TR(0, -h * 0.02, 0));
    for (const sz of [-1, 1]) k.tube(0, 0, sz * d * 0.4, w * 0.3, d * 0.06, DARK, 14, { m: RX(Math.PI / 2) }); k.setT(null);
    k.box(w * 0.3, -h / 2 + h * 0.07, 0, w * 0.4, h * 0.03, d * 0.42, 0xe8e0a0); k.box(w / 2 - 0.0015, -h / 2 + h * 0.08, 0, 0.003, h * 0.12, d * 0.46, METAL); // ruban + crochet
    k.box(w * 0.18, h / 2 - h * 0.05, d * 0.2, w * 0.18, h * 0.1, d * 0.2, DARK); k.box(0, 0, -d / 2 + d * 0.06, w * 0.5, h * 0.7, d * 0.12, DARK); // blocage + clip
  },
  lighter: (k, [w, h, d], c) => { const bh = h * 0.78; k.rbox(0, -h / 2 + bh / 2, 0, w, bh, d, c, d * 0.45); k.rbox(0, -h / 2 + bh + h * 0.07, 0, w * 0.9, h * 0.14, d * 0.92, CHROME, 0.001); k.tube(-w * 0.12, h / 2 - h * 0.05, 0, h * 0.045, d * 0.6, 0x555555, 10, { m: RX(Math.PI / 2) }); k.box(w * 0.22, h / 2 - h * 0.09, 0, w * 0.34, h * 0.06, d * 0.6, 0x222222); },
  lighter_disposable: (k, s, c, d) => BOXV.lighter(k, s, c, d),
  lighter_storm: (k, [w, h, d], c) => { k.rbox(0, -h * 0.12, 0, w, h * 0.76, d, CHROME, d * 0.3); k.rbox(0, h * 0.38, 0, w, h * 0.24, d, CHROME, d * 0.3); deco(k, 0, h * 0.25, 0, w * 1.0, 0.0008, d * 1.0, 0x777777); k.box(-w * 0.32, h * 0.38, d * 0.5 - 0.001, w * 0.1, h * 0.16, 0.0021, 0x9a9a9a); },
  matches: (k, [w, h, d], c, def) => { const r = k.pk(def, 'box', w, d, legacyInfo(def, { name: 'Allumettes', picto: 'flame', bg: c })); k.rbox(0, 0, 0, w, h, d, c, 0.0008, { Y: r }, { X: 0x4e342e, x: 0x4e342e }); },
  toast: (k, [w, h, d], c) => toastSlice(k, 0, 0, 0, w, h, d, c, shade(c, 0.62)),
  burnt_toast: (k, [w, h, d], c) => toastSlice(k, 0, 0, 0, w, h, d, c, 0x140c06),
  yogurt: (k, [w, h, d], c, def) => { const lab = k.pk(def, 'wrap', Math.PI * d * 0.92, h * 0.7, legacyInfo(def, { name: 'Yaourt', picto: 'cow', bg: c })); for (const sx of [-1, 1]) { k.setT(TR(sx * w / 4, 0, 0)); k.lathe([{ r: d * 0.38, y: -h / 2 }, { r: d * 0.4, y: -h / 2 + 0.003, p: 'a' }, { r: d * 0.47, y: h / 2 - 0.004, p: 'l' }, { r: d * 0.5, y: h / 2 - 0.0035, p: 'a', h: 1 }, { r: d * 0.5, y: h / 2 - 0.001, p: 'a', h: 1 }], 12, { a: { c: shade(c, 0.95) }, l: { c: 0xffffff, rect: lab } }, { bottom: c, top: 0xd7d9db }); k.setT(null); } },
  basket: (k, [w, h, d], c) => { TUB(k, w * 0.86, d * 0.84, w * 0.98, d * 0.98, h * 0.82, 0.03, c, shade(c, 0.8), -h / 2); for (const sz of [-1, 1]) { const P = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI; P.push([Math.cos(a) * w * 0.3, -h / 2 + h * 0.82 + Math.sin(a) * h * 0.16, sz * d * 0.47]); } k.sweep(P, 0.0045, shade(c, 0.85), { nu: 6 }); } },
  sponge: (k, [w, h, d], c) => { k.rbox(0, -h * 0.15, 0, w, h * 0.7, d, c, h * 0.2); k.rbox(0, h * 0.35, 0, w * 0.995, h * 0.3, d * 0.995, 0x2e7d32, h * 0.08); },
  pain_choc: (k, [w, h, d], c) => { k.setT(RX(-Math.PI / 2)).prism(rrect(w, d, d * 0.3, 3), h, c, { bev: h * 0.42, smooth: true, cs: shade(c, 1.12) }).setT(null); for (let i = 1; i < 4; i++) deco(k, 0, -h / 2 + h * i / 4, d / 2 - 0.0016, w * 0.9, 0.0008, 0.002, shade(c, 0.8)); for (const sx of [-1, 1]) for (const zz of [-0.18, 0.18]) k.orb(sx * (w / 2 - 0.0012), -h * 0.05, zz * d, 0.002, h * 0.12, d * 0.09, 0x3b2314, 6, 3); },
  first_aid: (k, [w, h, d], c) => { k.rbox(0, -h * 0.08, 0, w, h * 0.84, d, c, 0.008); deco(k, 0, h * 0.1, 0, w * 1.0, 0.0012, d * 1.0, shade(c, 0.7)); k.box(0, -h * 0.08, d / 2 - 0.0009, w * 0.07, h * 0.42, 0.002, 0xffffff); k.box(0, -h * 0.08, d / 2 - 0.0009, w * 0.24, h * 0.13, 0.002, 0xffffff); for (const sx of [-1, 1]) k.box(sx * w * 0.36, h * 0.1, d / 2 - 0.002, w * 0.08, h * 0.12, 0.004, 0xe0e0e0); const P = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI; P.push([Math.cos(a) * w * 0.17, h * 0.34 + Math.sin(a) * h * 0.13, 0]); } k.sweep(P, h * 0.035, DARK, { nu: 6 }); },
  mask_medical: (k, [w, h, d], c) => { const zf = (x) => d / 2 - 0.004 - d * 0.32 * (x / (w * 0.4)) ** 2; k.surf(8, 6, (u, v) => { const x = (u - 0.5) * w * 0.8, y = (v - 0.5) * h; return [x, y, zf(x) + 0.0018 * ((v * 6) % 1 > 0.5 ? 1 : -1) * Math.cos((u - 0.5) * 2.4)]; }, c, { open: true }); k.surf(8, 6, (u, v) => { const x = (0.5 - u) * w * 0.8, y = (v - 0.5) * h; return [x, y, zf(x) - 0.003]; }, shade(c, 0.9), { open: true }); for (const sx of [-1, 1]) { const P = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI * 2; P.push([sx * (w * 0.4 + Math.sin(a / 2) * w * 0.08), Math.cos(a) * h * 0.38, zf(w * 0.4) - Math.sin(a / 2) * d * 0.55]); } k.sweep(P, 0.0012, 0xf5f5f5, { nu: 4 }); } },
  earplugs: (k, [w, h, d], c) => { for (const sx of [-1, 1]) k.setT(mm(TR(sx * w * 0.2, -h / 2 + h * 0.36, 0), RY(sx * 0.3))).orb(0, 0, 0, h * 0.36, h * 0.36, d * 0.34, c, 8, 5, { e: [0.8, 1] }).setT(null); },
  gloves: (k, s, c) => GLOVES(k, s, c), gloves_leather: (k, s, c) => GLOVES(k, s, c),
  toolbox: (k, [w, h, d], c) => { k.rbox(0, -h * 0.13, 0, w, h * 0.74, d, c, 0.006); k.rbox(0, h * 0.27, 0, w * 0.99, h * 0.18, d * 0.99, shade(c, 1.1), 0.006); for (const sx of [-1, 1]) k.box(sx * w * 0.3, h * 0.2, d / 2 - 0.002, w * 0.07, h * 0.12, 0.006, METAL); for (const sx of [-1, 1]) k.box(sx * w * 0.19, h * 0.4, 0, 0.012, h * 0.2, 0.02, DARK); k.tube(0, h * 0.455, 0, h * 0.04, w * 0.42, DARK, 8, { m: RZ(Math.PI / 2) }); },
  mousetrap: (k, [w, h, d], c) => { k.rbox(0, -h * 0.25, 0, w, h * 0.5, d, c, 0.001); const P = [[-w * 0.4, 0, -d * 0.36], [-w * 0.4, h * 0.42, -d * 0.36], [-w * 0.4, h * 0.42, d * 0.36], [-w * 0.4, 0, d * 0.36]]; k.sweep(P, 0.0012, METAL, { nu: 4 }); k.sweep([[-w * 0.4, h * 0.42, -d * 0.36], [w * 0.05, h * 0.42, -d * 0.36]], 0.0012, METAL, { nu: 4 }); k.sweep([[-w * 0.4, h * 0.42, d * 0.36], [w * 0.05, h * 0.42, d * 0.36]], 0.0012, METAL, { nu: 4 }); k.tube(0, h * 0.12, 0, h * 0.18, d * 0.55, METAL, 8, { m: RX(Math.PI / 2) }); k.box(w * 0.28, h * 0.05, 0, w * 0.2, h * 0.12, d * 0.4, 0xd7b46a); },
  gum: (k, s, c, d) => { const r = k.pk(d, 'box', s[0], s[1], legacyInfo(d, { name: 'Chewing-gum', picto: 'leaf', bg: c })); cbox(k, 0, 0, 0, s[0], s[1], s[2], c, { Z: r, z: r, Y: r }); },
  candy_bar: (k, s, c, d) => wrappedBar(k, s, c, d), energy_bar: (k, s, c, d) => wrappedBar(k, s, c, d),
  shaver: (k, [w, h, d], c) => { k.orb(0, -h * 0.12, 0, w / 2, h * 0.38, d / 2, c, 12, 8, { e: [0.6, 0.7], f: (u, v, p) => [p[0] * (0.82 + 0.18 * v), p[1], p[2] * (0.85 + 0.15 * v)] }); k.rbox(0, h * 0.33, 0, w * 0.94, h * 0.12, d * 0.86, DARK, 0.004); for (const sz of [-1, 1]) k.tube(0, h * 0.43, sz * d * 0.18, d * 0.2, w * 0.82, CHROME, 10, { m: RZ(Math.PI / 2) }); k.tube(0, 0, d / 2 - 0.001, w * 0.13, 0.002, 0xdddddd, 10, { m: RX(Math.PI / 2) }); },
  clippers: (k, [w, h, d], c) => { k.orb(0, -h * 0.08, 0, w / 2, h * 0.42, d / 2, c, 12, 8, { e: [0.6, 0.7], f: (u, v, p) => [p[0] * (0.78 + 0.22 * v), p[1], p[2] * (0.8 + 0.2 * v)] }); k.box(0, h * 0.39, 0, w * 0.92, h * 0.06, d * 0.4, CHROME); for (let i = 0; i < 9; i++) k.box(-w * 0.42 + i * w * 0.105, h * 0.465, d * 0.05, w * 0.05, h * 0.07, d * 0.32, 0x8a8f94); k.box(0, -h * 0.05, d / 2 - 0.0012, w * 0.22, h * 0.12, 0.0024, 0x9e9e9e); },
  walkman: (k, [w, h, d], c) => { k.rbox(0, -h * 0.04, 0, w, h * 0.92, d, c, 0.004); k.rbox(0, -h * 0.04, d / 2 - 0.0012, w * 0.8, h * 0.56, 0.0025, 0x1a1a1a, 0.002); k.box(0, -h * 0.04, d / 2 - 0.0004, w * 0.6, h * 0.2, 0.002, 0x3a3020); for (let i = 0; i < 5; i++) k.box(-w * 0.3 + i * w * 0.15, h * 0.46, 0, w * 0.11, h * 0.08, d * 0.5, i === 4 ? 0xd32f2f : 0x9e9e9e); k.tube(w * 0.38, h * 0.38, 0, 0.0028, 0.004, 0x111111, 8); },
  audio_tape: (k, [w, h, d], c, def) => { const lab = k.pk(def, 'media', w * 0.8, h * 0.42, { name: def.label || 'C60', bg: 0xf2efe6, sub: 'FERRO', brand: '' }, def.id + ':tape'); k.rbox(0, 0, -d * 0.06, w, h, d * 0.88, c, 0.0012, {}, {}, ''); k.box(0, h * 0.12, d * 0.38 - 0.0003, w * 0.8, h * 0.42, 0.001, 0xffffff); k.quad([-w * 0.4, -h * 0.09, d * 0.38 + 0.0003], [w * 0.4, -h * 0.09, d * 0.38 + 0.0003], [w * 0.4, h * 0.33, d * 0.38 + 0.0003], [-w * 0.4, h * 0.33, d * 0.38 + 0.0003], 0xffffff, lab); k.box(0, h * 0.1, d * 0.38 + 0.0004, w * 0.42, h * 0.16, 0.0005, 0x2a2a2a); for (const sx of [-1, 1]) k.tube(sx * w * 0.21, h * 0.1, d * 0.38 + 0.0006, h * 0.06, 0.0005, 0xf0f0f0, 8, { m: RX(Math.PI / 2) }); k.box(0, -h * 0.38, d * 0.38 - 0.0005, w * 0.56, h * 0.2, 0.002, shade(c, 0.8)); },
  earbuds: (k, [w, h, d], c) => { k.orb(0, 0, 0, w / 2, h / 2, d / 2, c, 12, 6, { e: [0.5, 0.6] }); deco(k, 0, h * 0.18, 0, w * 1.0, 0.0006, d * 1.0, shade(c, 0.8)); k.tube(0, -h * 0.05, d / 2 - 0.0008, 0.0012, 0.002, 0x39d353, 6, { m: RX(Math.PI / 2) }); },
  charger: (k, [w, h, d], c) => { k.rbox(0, 0, d * 0.12, w, h, d * 0.76, c, 0.004); for (const sx of [-1, 1]) k.tube(sx * w * 0.2, 0, -d * 0.38, 0.0022, d * 0.24, CHROME, 8, { m: RX(Math.PI / 2) }); deco(k, 0, 0, d / 2 - 0.0007, w * 0.34, h * 0.14, 0.0016, 0x111111); },
  soap: (k, [w, h, d], c) => { k.orb(0, 0, 0, w / 2, h / 2, d / 2, c, 14, 7, { e: [0.5, 0.42] }); k.orb(0, h * 0.44, 0, w * 0.3, h * 0.07, d * 0.26, shade(c, 0.9), 10, 3, { e: [1, 1] }); },
  whistle: (k, [w, h, d], c) => { k.tube(w * 0.12, 0, 0, h * 0.48, d * 0.96, c, 12, { m: RX(Math.PI / 2) }); k.rbox(-w * 0.22, h * 0.12, 0, w * 0.5, h * 0.5, d * 0.7, c, 0.0018); k.box(w * 0.02, h * 0.42, 0, w * 0.1, h * 0.12, d * 0.4, 0x111111); k.torus(-w * 0.44, h * 0.15, 0, h * 0.18, METAL, Math.PI / 2, 0, 0, true); },
  harmonica: (k, [w, h, d], c) => { k.rbox(0, 0, 0, w, h * 0.56, d * 0.9, 0x5d4037, 0.0008); for (const sy of [-1, 1]) k.rbox(0, sy * h * 0.34, 0, w, h * 0.32, d, CHROME, h * 0.13); for (let i = 0; i < 10; i++) deco(k, -w * 0.42 + i * w * 0.093, 0, d * 0.45 - 0.0008, w * 0.055, h * 0.3, 0.0019, 0x150d08); },
  fake_mustache: (k, [w, h, d], c) => { for (const sx of [-1, 1]) { const P = []; for (let i = 0; i <= 8; i++) { const t = i / 8; P.push([sx * (0.002 + t * w * 0.44), -h * 0.37 + Math.sin(t * Math.PI * 1.15) * h * 0.3 + (t > 0.85 ? (t - 0.85) * h * 2.5 : 0), d * 0.1 * (1 - t)]); } k.sweep(P, (t) => h * 0.48 * (1 - t * 0.75) * Math.min(1, 0.6 + t * 4), c, { nu: 6, rz: 0.55 }); } },
  comb: (k, [w, h, d], c) => { const P = [], n = 14, L = d, back = w * 0.32; P.push([w / 2, L / 2], [w / 2 - back, L / 2]); for (let i = 0; i < n; i++) { const z0 = L / 2 - (i + 0.15) * L / n, z1 = L / 2 - (i + 0.6) * L / n; P.push([w / 2 - back, z0], [-w / 2, z0 - L / n * 0.05], [-w / 2, z1 + L / n * 0.05], [w / 2 - back, z1]); } P.push([w / 2 - back, -L / 2], [w / 2, -L / 2]); k.setT(RX(-Math.PI / 2)).prism(P, h, c).setT(null); },
  cushion: (k, [w, h, d], c) => { k.orb(0, 0, 0, w / 2, h / 2, d / 2, c, 16, 8, { e: [0.85, 0.22], f: (u, v, p) => { const m = Math.max(Math.abs(p[0]) / (w / 2), Math.abs(p[2]) / (d / 2)); return [p[0], p[1] * (1 - 0.55 * m ** 4), p[2]]; } }); },
  pizza_slice: (k, [w, h, d], c) => { k.setT(mm(TR(0, -h * 0.15, 0), RX(-Math.PI / 2))); const P = [[0, d / 2]]; for (let i = 0; i <= 6; i++) { const a = 0.5 - i / 6; P.push([a * w * 0.98, -d / 2 + (1 - Math.cos(a * 1.2)) * d * 0.04]); } k.prism(P, h * 0.6, 0xf2b84b, { cs: 0xe0a24a, bev: h * 0.15 }); k.setT(null); k.sweep([[-w * 0.43, -h * 0.05, d * 0.43], [-w * 0.22, -h * 0.02, d * 0.445], [0, 0, d * 0.45], [w * 0.22, -h * 0.02, d * 0.445], [w * 0.43, -h * 0.05, d * 0.43]], h * 0.42, 0xc8823a, { nu: 6, cap0: true, cap1: true }); for (const [x, z] of [[-0.15, 0.25], [0.18, 0.2], [0, -0.05], [-0.02, 0.36], [0.05, -0.28]]) k.tube(x * w, h * 0.32, z * d, w * 0.075, h * 0.12, 0xb3261e, 9); },
  sushi: (k, [w, h, d], c) => { k.rbox(0, -h / 2 + h * 0.12, 0, w, h * 0.24, d, 0x151515, 0.002); const y = -h / 2 + h * 0.24; [0xf26b3a, 0xe8e2d0, 0xd23a3a].forEach((f, i) => sushiNigiri(k, -w * 0.3 + i * w * 0.12, y, -d * 0.18, 0.2, f)); for (let i = 0; i < 3; i++) sushiMaki(k, w * 0.12 + i * w * 0.12, y, d * 0.2, d * 0.13, h * 0.5, [0xf26b3a, 0x7cb342, 0xd23a3a][i]); k.orb(w * 0.4, y + 0.004, -d * 0.25, 0.008, 0.005, 0.008, 0x8bc34a, 6, 3); },
  maki: (k, [w, h, d], c) => { k.rbox(0, -h / 2 + h * 0.1, 0, w, h * 0.2, d, 0x151515, 0.002); for (let i = 0; i < 6; i++) sushiMaki(k, -w * 0.3 + (i % 3) * w * 0.3, -h / 2 + h * 0.2, (i < 3 ? -1 : 1) * d * 0.22, d * 0.17, h * 0.72, [0xf26b3a, 0x7cb342, 0xd23a3a][i % 3]); },
  wasabi: (k, [w, h, d], c) => { k.orb(0, -h / 2, 0, w / 2, h * 0.86, d * 0.42, c, 8, 6, { f: (u, v, p) => (v < 0.5 ? [p[0], 0, p[2]] : [p[0], p[1] * (1 + 0.15 * Math.sin(u * 19)), p[2]]) }); },
  waffle: (k, [w, h, d], c, def) => { const top = k.shared('waffle:' + (c >>> 0).toString(16), 64, 44, { kind: 'waffle', bg: c }); k.rbox(0, 0, 0, w, h, d, c, h * 0.3, { Y: top }); },
  mouse: (k, s, c) => MOUSE(k, s, c, true), mouse_wireless: (k, s, c) => MOUSE(k, s, c, false),
  usb_key: (k, [w, h, d], c) => { k.rbox(0, 0, -d * 0.12, w, h, d * 0.76, c, h * 0.4); k.box(0, -h * 0.1, d * 0.38, w * 0.62, h * 0.55, d * 0.24, CHROME); deco(k, 0, h * 0.05, d * 0.42, w * 0.3, h * 0.2, d * 0.06, 0x1a1a1a); k.tube(0, 0, -d * 0.42, w * 0.16, h + 0.0001, 0x222222, 8); }, usb_16: (k, s, c, d) => BOXV.usb_key(k, s, c, d),
  hard_drive: (k, [w, h, d], c, def) => { const lab = k.pk(def, 'device', w * 0.8, d * 0.55, { name: '2 To', brand: 'DISQUE', bg: 0xf0f0f0 }, def.id + ':lab'); k.rbox(0, 0, 0, w, h, d, METAL, 0.0015, {}, { y: 0x2e7d32 }); k.box(0, h / 2 - 0.0003, d * 0.08, w * 0.8, 0.001, d * 0.55, 0xffffff); k.quad([-w * 0.4, h / 2 + 0.0003, d * 0.355], [w * 0.4, h / 2 + 0.0003, d * 0.355], [w * 0.4, h / 2 + 0.0003, -d * 0.195], [-w * 0.4, h / 2 + 0.0003, -d * 0.195], 0xffffff, lab); k.box(0, -h * 0.1, -d / 2 + 0.0008, w * 0.6, h * 0.3, 0.002, 0x111111); if (!k.lod) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.tube(x * w * 0.43, h / 2 - 0.0002, z * d * 0.45, 0.002, 0.0008, 0x777777, 6); },
  hdd_external: (k, [w, h, d], c) => { k.rbox(0, 0, 0, w, h, d, c, h * 0.45); deco(k, w * 0.3, h / 2 - 0.0004, d * 0.42, 0.003, 0.001, 0.003, 0x2196f3); deco(k, 0, 0, d / 2 - 0.0007, w * 0.2, h * 0.3, 0.0016, 0x0b0b0b); },
  router: (k, [w, h, d], c) => { k.rbox(0, -h * 0.05, 0, w, h * 0.9, d, c, 0.004); for (let i = 0; i < 6; i++) deco(k, -w * 0.3 + i * w * 0.08, -h * 0.05, d / 2 - 0.0007, 0.003, 0.002, 0.0016, i === 2 ? 0xffb300 : 0x39d353); for (let i = 0; i < 7; i++) deco(k, -w * 0.3 + i * w * 0.1, h * 0.4, -d * 0.1, w * 0.05, 0.0012, d * 0.5, 0x0a0a0a); for (const sx of [-1, 1]) k.box(sx * w * 0.42, h * 0.45, -d * 0.2, w * 0.05, h * 0.1, d * 0.5, DARK); },
  fire_alarm: (k, [w, h, d], c) => { k.rbox(0, 0, 0, w, h, d, c, 0.006); k.rbox(0, 0, d / 2 - 0.004, w * 0.66, h * 0.66, 0.008, 0xf2f2f2, 0.001); k.box(0, 0, d / 2 - 0.0002, w * 0.5, h * 0.5, 0.0008, 0xc9d6dc); k.box(0, 0, d / 2 + 0.0004, w * 0.08, h * 0.08, 0.0006, 0xd32f2f); },
  hand_dryer: (k, [w, h, d], c) => { k.orb(0, h * 0.05, 0, w / 2, h * 0.45, d / 2, c, 14, 8, { e: [0.55, 0.45], f: (u, v, p) => [p[0], p[1], p[2] < 0 ? Math.max(p[2], -d / 2) : p[2] * (0.6 + 0.4 * v)] }); k.tube(0, -h * 0.44, d * 0.18, w * 0.1, h * 0.12, 0x9e9e9e, 12); k.tube(0, -h * 0.485, d * 0.18, w * 0.08, h * 0.03, 0x222222, 12); deco(k, 0, h * 0.18, d * 0.48, w * 0.12, w * 0.12, 0.004, 0x222222); },
  pallet: (k, [w, h, d], c) => { const tb = h * 0.15, bb = h * 0.15, bk = h - tb - bb, cw = shade(c, 0.92); for (let i = 0; i < 5; i++) k.box(-w / 2 + w * 0.05 + i * w * 0.225, h / 2 - tb / 2, 0, w * 0.1, tb, d, i % 2 ? c : cw); for (const z of [-1, 0, 1]) { k.box(0, h / 2 - tb - 0.011, z * (d / 2 - 0.05), w, 0.022, 0.1, shade(c, 0.85)); for (const x of [-1, 0, 1]) k.box(x * (w / 2 - 0.05), -h / 2 + bb + bk / 2 - 0.011, z * (d / 2 - 0.05), 0.1, bk - 0.022, 0.1, shade(c, 0.8)); } for (const x of [-1, 0, 1]) k.box(x * (w / 2 - 0.05), -h / 2 + bb / 2, 0, 0.1, bb, d, cw); },
  banana_peel: (k, [w, h, d], c) => { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4, P = []; for (let j = 0; j <= 6; j++) { const t = j / 6; P.push([Math.cos(a) * t * w * 0.46, -h / 2 + h * 0.4 + Math.sin(t * Math.PI) * h * 0.25, Math.sin(a) * t * d * 0.46]); } k.sweep(P, (t) => d * 0.13 * Math.sin(Math.min(1, 0.15 + t) * Math.PI) + 0.001, c, { nu: 5, rz: 0.25, col: (u, t) => (t > 0.85 ? 0x5d4037 : c) }); } k.tube(0, -h / 2 + h * 0.5, 0, d * 0.06, h * 0.6, 0x6d5a1e, 6); },
  socket_strip: (k, [w, h, d], c) => { k.rbox(0, 0, 0, w, h, d, c, 0.006); for (let i = 0; i < 4; i++) { const x = -w * 0.32 + i * w * 0.19; k.tube(x, h / 2 - 0.0012, 0, d * 0.33, 0.0026, 0xe8e8e8, 12); for (const sx of [-1, 1]) deco(k, x + sx * d * 0.12, h / 2 + 0.0001, 0, 0.0036, 0.0008, 0.0036, 0x111111); } k.rbox(w * 0.43, h / 2 - 0.002, 0, w * 0.07, 0.006, d * 0.5, 0xd32f2f, 0.0015); },
  tartine: (k, [w, h, d], c) => { k.orb(0, -h * 0.05, 0, w / 2, h * 0.45, d / 2, 0xc8873a, 12, 6, { e: [0.6, 0.5], f: (u, v, p) => [p[0], Math.min(p[1], h * 0.18), p[2]] }); k.orb(0, h * 0.13, 0, w * 0.47, h * 0.12, d * 0.44, c, 12, 4, { e: [0.4, 0.5], f: (u, v, p) => [p[0], Math.max(p[1], -h * 0.02), p[2]] }); },
  croque_monsieur: (k, [w, h, d], c) => { toastSlice(k, 0, -h * 0.35, 0, w * 0.98, h * 0.3, d * 0.98, 0xe8c68a, 0xb8782e); k.orb(0, -h * 0.05, 0, w * 0.47, h * 0.1, d * 0.47, 0xd88a8a, 10, 3, { e: [0.4, 0.3] }); toastSlice(k, 0, h * 0.18, 0, w * 0.96, h * 0.3, d * 0.96, 0xe8c68a, 0xb8782e, 0.05); k.orb(0, h * 0.36, -d * 0.02, w * 0.46, h * 0.1, d * 0.44, c, 12, 4, { e: [0.5, 0.4], col: (u, v) => (Math.sin(u * 37) * Math.cos(v * 23) > 0.5 ? shade(c, 0.75) : c) }); },
  cake_slice: (k, [w, h, d], c) => { const P = [[0, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]; const L = [[0.32, 0xd8a85e], [0.18, 0xfff3e0], [0.3, c], [0.2, 0xfff3e0]]; let y = -h / 2; for (const [f, col] of L) { k.setT(mm(TR(0, y + f * h / 2, 0), RX(-Math.PI / 2))).prism(P, f * h * 0.999, col, { cs: shade(col, 0.95) }).setT(null); y += f * h; } k.orb(0, h / 2 - 0.007, d * 0.3, 0.007, 0.007, 0.007, 0xc62828, 8, 5); },
  kitchen_scale: (k, [w, h, d], c) => { k.rbox(0, -h * 0.2, 0, w, h * 0.6, d, c, 0.006); k.rbox(0, h * 0.3, 0, w * 0.92, h * 0.12, d * 0.92, 0xd0d6da, 0.003); deco(k, 0, -h * 0.2, d / 2 - 0.0006, w * 0.36, h * 0.3, 0.0014, 0x1d2a20); for (const sx of [-1, 1]) deco(k, sx * w * 0.3, -h * 0.2, d / 2 - 0.0006, w * 0.06, h * 0.22, 0.0014, 0x666666); },
  wallet: (k, [w, h, d], c) => { k.rbox(0, -h * 0.25, 0, w, h * 0.48, d, c, h * 0.2); k.rbox(0, h * 0.25, 0, w * 0.99, h * 0.48, d * 0.98, shade(c, 1.08), h * 0.2); deco(k, 0, h * 0.49, 0, w * 0.9, 0.0006, d * 0.86, shade(c, 0.8)); },
  tuner: (k, [w, h, d], c) => { k.rbox(0, 0, 0, w, h, d, c, h * 0.4); k.box(0, h / 2 - 0.0004, d * 0.12, w * 0.7, 0.0012, d * 0.45, 0x1b2a1d); deco(k, 0, h / 2 - 0.0003, -d * 0.3, w * 0.25, 0.001, d * 0.12, 0x555555); },
  vampire_teeth: (k, [w, h, d], c) => { const P = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10); P.push([Math.cos(a) * w * 0.38, h * 0.12, -Math.sin(a) * d * 0.55 + d * 0.27]); } k.sweep(P, h * 0.24, 0xc62828, { nu: 6, rz: 1.3, cap0: true, cap1: true }); for (let i = 1; i < 10; i++) { const a = Math.PI * (i / 10), fang = i === 3 || i === 7; const L = fang ? h * 0.5 : h * 0.26; k.setT(TR(Math.cos(a) * w * 0.38, 0, -Math.sin(a) * d * 0.55 + d * 0.27)).lathe([{ r: 0.0004, y: -L }, { r: fang ? 0.0026 : 0.0028, y: 0, p: 'a' }], 5, { a: { c } }, { top: c }).setT(null); } },
  eyepatch: (k, [w, h, d], c) => { const P = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; P.push([Math.cos(a) * w * 0.36, Math.sin(a) * h * 0.45 * (a < Math.PI ? 1 : 0.8) - h * 0.13]); } k.prism(P, d * 0.5, c, { bev: d * 0.2, smooth: true }); for (const sx of [-1, 1]) k.sweep([[sx * w * 0.34, h * 0.1, 0], [sx * w * 0.48, h * 0.25, -d * 0.3]], 0.0009, 0x111111, { nu: 4 }); },
  flash_unit: (k, [w, h, d], c) => { k.rbox(0, -h * 0.18, -d * 0.1, w * 0.86, h * 0.5, d * 0.7, c, 0.004); k.rbox(0, h * 0.26, 0, w, h * 0.42, d * 0.92, c, 0.004); k.box(0, h * 0.26, d * 0.46 - 0.0005, w * 0.8, h * 0.32, 0.002, 0xeeeeee); k.box(0, -h * 0.47, -d * 0.1, w * 0.4, h * 0.06, d * 0.3, 0x444444); deco(k, 0, -h * 0.12, -d * 0.45 - 0.0004, w * 0.5, h * 0.2, 0.0012, 0x1d2a20); },
  wood_tray: (k, [w, h, d], c) => { TUB(k, w * 0.94, d * 0.92, w, d, h, 0.02, c, shade(c, 0.9), -h / 2); },
  crepe_sugar: (k, [w, h, d], c) => { k.setT(RX(-Math.PI / 2)); const P = [[-w / 2, -d / 2]]; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; P.push([-w / 2 + Math.cos(Math.PI / 2 - a) * w, -d / 2 + Math.sin(Math.PI / 2 - a) * d]); } k.prism(P, h * 0.9, c, { bev: h * 0.35, smooth: true, cs: shade(c, 0.85) }); k.setT(null); const rnd = mulberry32(7); for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI / 2, r = rnd() * 0.85; deco(k, -w / 2 + Math.sin(a) * r * w * 0.95, h * 0.45, -d / 2 + Math.cos(a) * r * d * 0.95, 0.002, 0.0005, 0.002, 0xfafafa); } },
  stapler: (k, [w, h, d], c) => { k.rbox(0, -h * 0.38, 0, w, h * 0.24, d, c, 0.004); k.setT(mm(TR(0, -h * 0.26, -d * 0.42), RX(-0.06))); k.rbox(0, h * 0.22, d * 0.44, w * 0.9, h * 0.32, d * 0.95, c, 0.006); k.box(0, h * 0.04, d * 0.44, w * 0.6, h * 0.06, d * 0.88, CHROME); k.setT(null); k.tube(0, -h * 0.2, -d * 0.42, h * 0.12, w * 0.7, DARK, 8, { m: RZ(Math.PI / 2) }); },
  calculator: (k, [w, h, d], c, def) => { const keys = k.shared('calc:' + (c >>> 0).toString(16), 48, 64, { kind: 'keys', bg: c, nx: 4, ny: 5, calc: 1 }); k.rbox(0, 0, 0, w, h, d, c, h * 0.35); k.quad([-w * 0.42, h / 2 + 0.0003, d * 0.42], [w * 0.42, h / 2 + 0.0003, d * 0.42], [w * 0.42, h / 2 + 0.0003, -d * 0.12], [-w * 0.42, h / 2 + 0.0003, -d * 0.12], 0xffffff, keys); k.box(0, h / 2 - 0.0002, -d * 0.3, w * 0.8, 0.001, d * 0.22, 0x9fb59a); deco(k, w * 0.3, h / 2 - 0.0002, -d * 0.44, w * 0.25, 0.001, d * 0.05, 0x3a3a3a); },
  rubber_stamp: (k, [w, h, d], c) => { k.rbox(0, -h * 0.38, 0, w, h * 0.16, d, 0x8d6e63, 0.002); k.box(0, -h * 0.48, 0, w * 0.94, h * 0.04, d * 0.94, 0xb71c1c); k.lathe([{ r: w * 0.16, y: -h * 0.3 }, { r: w * 0.12, y: -h * 0.05, p: 'a' }, { r: w * 0.16, y: h * 0.15, p: 'a' }, { r: w * 0.32, y: h * 0.38, p: 'a' }, { r: w * 0.2, y: h * 0.5, p: 'a' }], 12, { a: { c } }, { top: c }); },
};
// Bac ouvert aux coins arrondis (corbeille, plateau, panier) : paroi extérieure, intérieure, lèvre et fonds
function TUB(k, w0, d0, w1, d1, h, r, c, ci, y0 = 0, n = 3) {
  const P0 = rrect(w0, d0, r, n), P1 = rrect(w1, d1, r, n), m = P0.length, t = Math.min(0.006, w1 * 0.03), inP = (P, k2) => P.map((p) => [p[0] * k2[0], p[1] * k2[1]]);
  const Q1 = inP(P1, [(w1 - 2 * t) / w1, (d1 - 2 * t) / d1]), Q0 = inP(P0, [(w0 - 2 * t) / w0, (d0 - 2 * t) / d0]), yb = y0 + Math.min(t, h * 0.3);
  const at = (P, i) => P[((i % m) + m) % m];
  // paramétrage u le long du contour (sens horaire vu de dessus pour des normales extérieures avec v vers le haut)
  k.surf(m, 1, (u, v) => { const p = at(v ? P1 : P0, Math.round((1 - u) * m)); return [p[0], y0 + h * v, p[1]]; }, c);
  k.surf(m, 1, (u, v) => { const p = at(v ? Q1 : Q0, Math.round((1 - u) * m)); return [p[0], yb + (y0 + h - yb) * v, p[1]]; }, ci, { flip: true });
  k.surf(m, 1, (u, v) => { const p = at(v ? Q1 : P1, Math.round((1 - u) * m)); return [p[0], y0 + h, p[1]]; }, c);
  k.setT(mm(TR(0, y0, 0), RX(Math.PI / 2))).prism(P0, 0.0002, c, { back: false, side: false }).setT(null);
  k.setT(mm(TR(0, yb, 0), RX(-Math.PI / 2))).prism(Q0, 0.0002, ci, { back: false, side: false }).setT(null);
}
// Paire de gants à plat (paume, doigts, pouce), l'un sur l'autre
function glovePts(w, l) {
  const P = [], fw = w * 0.2, gap = w * 0.012, cuff = l * 0.28, palm = l * 0.34, y0 = -l / 2 + cuff + palm, fl = [0.3, 0.34, 0.32, 0.25];
  P.push([-w * 0.36, -l / 2], [w * 0.36, -l / 2], [w * 0.42, -l / 2 + cuff], [w * 0.47, y0 - palm * 0.3]); // poignet, tranche de la main
  for (let i = 3; i >= 0; i--) { const cx = -w * 0.36 + fw / 2 + i * (fw + gap), L = fl[i] * l; P.push([cx + fw / 2, y0]); for (let j = 0; j <= 4; j++) { const a = j / 4 * Math.PI; P.push([cx + Math.cos(a) * fw / 2, y0 + L - fw / 2 + Math.sin(a) * fw / 2]); } P.push([cx - fw / 2, y0]); }
  P.push([-w * 0.36, y0 - palm * 0.1], [-w * 0.46, y0 - palm * 0.2], [-w * 0.5, y0 - palm * 0.38], [-w * 0.48, y0 - palm * 0.56], [-w * 0.4, y0 - palm * 0.78], [-w * 0.38, -l / 2 + cuff]); // pouce
  return P;
}
function GLOVES(k, [w, h, d], c) { const P = glovePts(w * 0.9, d * 0.96); for (let i = 0; i < 2; i++) k.setT(mm(TR((i ? -1 : 1) * w * 0.03, -h / 2 + h * (0.25 + i * 0.5), (i ? 1 : -1) * d * 0.01), RY(i ? 0.04 : -0.03), RX(-Math.PI / 2))).prism(P, h * 0.48, i ? c : shade(c, 0.9), { bev: h * 0.16, smooth: true }).setT(null); }
// Souris d'ordinateur : coque bombée plus haute à l'arrière, séparation des boutons, molette (fil coupé court)
function MOUSE(k, [w, h, d], c, wired) {
  k.orb(0, -h / 2, 0, w / 2, h, d / 2, c, 14, 8, { e: [0.7, 0.75], f: (u, v, p) => (v < 0.5 ? [p[0], 0, p[2]] : [p[0] * (1 - 0.12 * Math.max(0, p[2] / (d / 2))), p[1] * (0.62 + 0.38 * Math.cos(Math.max(0, (p[2] / (d / 2) + 0.3)) * 1.6)), p[2]]) });
  deco(k, 0, h * 0.18, d * 0.28, 0.0007, h * 0.3, d * 0.36, shade(c, 0.5)); k.tube(0, h * 0.3, d * 0.22, h * 0.13, w * 0.12, 0x333333, 10, { m: RZ(Math.PI / 2) });
  if (wired) k.sweep([[0, -h * 0.28, d / 2 - 0.004], [0, -h * 0.32, d / 2 - 0.0012]], 0.0018, 0x222222, { nu: 5, cap1: true });
}
const geoCache = new Map();
const metaCache = new Map();

// Contrat de la boîte s (rangement, étiquettes, physique) : pour les formes de ce module (hors grands appareils et
// formes enregistrées ailleurs), un reste de débordement est résorbé par une légère mise à l'échelle par axe
// (normales corrigées) et l'objet est posé sur le fond de sa boîte (sauf vêtements sur cintre).
const NOFIT = new Set('vending,arcade,claw,kiddie,airhockey,photobooth,fridge,freezer,cooler,oven_big,conveyor,register,safe,generator,panel,console_pa,forklift,car,boiler,washer,microwave,coffee_maker,tv,crt,printer,laptop,projector,popcorn_machine,gumball,cotton_candy,cotton,fountainbig,mannequin,bench,locker,sink,toilet,mirror,salonchair,chair,piano,drumkit,keyboardsynth,bike,tent,ladder,aquarium,cage,deskphone,vcr,console,turntable,board,head'.split(','));
const NOGROUND = new Set(['phang']);
function fitBox(b, s, ground, meta) {
  const P = b.pos, N = b.nor, n = P.length / 3; if (!n) return;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) { const a = i % 3; if (P[i] < lo[a]) lo[a] = P[i]; if (P[i] > hi[a]) hi[a] = P[i]; }
  const k = [1, 1, 1], off = [0, 0, 0], mid = [0, 0, 0]; let touched = false;
  for (let a = 0; a < 3; a++) {
    const ext = hi[a] - lo[a], h = s[a] / 2; mid[a] = (lo[a] + hi[a]) / 2;
    if (ext > s[a] + 2e-4) { k[a] = s[a] / ext; touched = true; }
    const e2 = ext * k[a] / 2; let m = Math.min(h - e2, Math.max(-h + e2, mid[a]));
    if (a === 1 && ground) m = -h + e2; // posé sur le fond
    off[a] = m; if (Math.abs(m - mid[a]) > 2e-4) touched = true;
  }
  if (!touched) return;
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) P[i * 3 + a] = (P[i * 3 + a] - mid[a]) * k[a] + off[a];
  if (k[0] !== 1 || k[1] !== 1 || k[2] !== 1) for (let i = 0; i < n; i++) { const x = N[i * 3] / k[0], y = N[i * 3 + 1] / k[1], z = N[i * 3 + 2] / k[2], l = Math.hypot(x, y, z) || 1; N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l; }
  // points d'ancrage (écran, flamme, lentille…) déplacés de la même façon
  const mv = (v) => { if (Array.isArray(v) && v.length === 3 && typeof v[0] === 'number') { for (let a = 0; a < 3; a++) v[a] = (v[a] - mid[a]) * k[a] + off[a]; } else if (v && typeof v === 'object' && typeof v.x === 'number' && typeof v.y === 'number') { v.x = (v.x - mid[0]) * k[0] + off[0]; v.y = (v.y - mid[1]) * k[1] + off[1]; if (typeof v.z === 'number') v.z = (v.z - mid[2]) * k[2] + off[2]; if (typeof v.w === 'number') v.w *= k[0]; if (typeof v.h === 'number') v.h *= k[1]; } };
  for (const key in meta) mv(meta[key]);
}
function bake(def, atlas, lod) {
  const b = new GeoBuilder({ colors: true, white: atlas.white() });
  const kit = new Kit(b, atlas); kit.lod = lod;
  const fn = SHAPES[def.shape] || SHAPES.box;
  try { fn(kit, def.s, def.c, def); } catch (e) { console.warn('forme', def.id, e); b.pos.length = b.nor.length = b.uv.length = b.col.length = b.idx.length = 0; SHAPES.box(kit, def.s, def.c, def); }
  if (b.vertexCount === 0) SHAPES.box(kit, def.s, def.c, def);
  if (!NOFIT.has(def.shape) && !EXTERNAL.has(def.shape)) fitBox(b, def.s, !NOGROUND.has(def.shape), kit.meta);
  return { g: b.build(), meta: kit.meta };
}
export function buildItemGeometry(def, atlas) {
  if (geoCache.has(def.id)) return geoCache.get(def.id);
  const { g, meta } = bake(def, atlas, 0);
  geoCache.set(def.id, g); metaCache.set(def.id, meta);
  return g;
}
// Géométrie simplifiée d'une unité (dans les lots, présentoirs et cagettes)
function unitGeo(def, atlas, lod = 1) {
  const key = def.id + '#' + lod; if (geoCache.has(key)) return geoCache.get(key);
  const { g } = bake(def, atlas, lod); geoCache.set(key, g); return g;
}
export function itemMeta(id) { return metaCache.get(id) || {}; }
export const SHAPE_NAMES = Object.keys(SHAPES);

// Petite géométrie générique colorée (pour les fixtures construites à la volée)
export function quickGeometry(atlas, fn) {
  const b = new GeoBuilder({ colors: true, white: atlas.white() });
  const kit = new Kit(b, atlas);
  fn(kit);
  return { geometry: b.build(), meta: kit.meta };
}
