// Physique simplifiée « façon Source » :
// - Monde statique = boîtes alignées sur les axes (AABB) rangées dans une grille de hachage 2D (x, z).
// - Personnage = cylindre vertical (rayon, hauteur) avec marche automatique (escaliers), gravité, saut.
// - Objets dynamiques = boîtes avec vitesse, rebond, friction, mise en sommeil.
// - Lancers de rayons contre la grille (interaction, ligne de vue, occlusion audio).

export const LAYER = { WALL: 1, FURN: 2, GLASS: 4, DOOR: 8, PROP: 16, VENT: 32, ALL: 0xffff };

export class Box {
  constructor(x0, y0, z0, x1, y1, z1, layer = LAYER.WALL, data = null) {
    this.min = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
    this.max = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    this.layer = layer; this.data = data; this.enabled = true; this.id = 0; this._q = 0;
  }
  set(x0, y0, z0, x1, y1, z1) {
    this.min[0] = Math.min(x0, x1); this.min[1] = Math.min(y0, y1); this.min[2] = Math.min(z0, z1);
    this.max[0] = Math.max(x0, x1); this.max[1] = Math.max(y0, y1); this.max[2] = Math.max(z0, z1);
  }
}

export class PhysicsWorld {
  constructor(cell = 4) {
    this.cell = cell; this.grid = new Map(); this.boxes = []; this.query = 1;
    this.dynamic = new Set(); this.gravity = -18;
  }
  key(ix, iz) { return ix * 100003 + iz; }

  add(box) {
    box.id = this.boxes.length; this.boxes.push(box);
    this._insert(box);
    return box;
  }
  _insert(box) {
    const c = this.cell;
    const x0 = Math.floor(box.min[0] / c), x1 = Math.floor(box.max[0] / c), z0 = Math.floor(box.min[2] / c), z1 = Math.floor(box.max[2] / c);
    box._cells = [];
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this.key(ix, iz); let arr = this.grid.get(k); if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(box); box._cells.push(k);
    }
  }
  remove(box) {
    if (!box._cells) return;
    for (const k of box._cells) { const arr = this.grid.get(k); if (arr) { const i = arr.indexOf(box); if (i >= 0) arr.splice(i, 1); } }
    box._cells = null;
  }
  // à appeler après avoir modifié les dimensions d'une boîte (portes, rideaux)
  update(box) { this.remove(box); this._insert(box); }

  // Boîtes qui chevauchent une zone xz (out : tableau à remplir, vidé ici ; les requêtes internes de chaque image passent
  // un tableau de travail réutilisé plutôt que d'en allouer un par appel)
  near(x0, z0, x1, z1, layers = LAYER.ALL, out = []) {
    out.length = 0;
    const c = this.cell; const q = ++this.query;
    const ix0 = Math.floor(x0 / c), ix1 = Math.floor(x1 / c), iz0 = Math.floor(z0 / c), iz1 = Math.floor(z1 / c);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const arr = this.grid.get(this.key(ix, iz)); if (!arr) continue;
      for (const b of arr) { if (b._q === q || !b.enabled || !(b.layer & layers)) continue; b._q = q; out.push(b); }
    }
    return out;
  }

  // Hauteur du sol sous un point (le dessus de boîte le plus haut <= maxY)
  groundAt(x, z, maxY, radius = 0.25, layers = LAYER.WALL | LAYER.FURN | LAYER.DOOR | LAYER.GLASS) {
    const arr = this.near(x - radius, z - radius, x + radius, z + radius, layers, _nearG);
    let g = -Infinity, hit = null;
    for (const b of arr) {
      if (x + radius * 0.7 < b.min[0] || x - radius * 0.7 > b.max[0] || z + radius * 0.7 < b.min[2] || z - radius * 0.7 > b.max[2]) continue;
      const top = b.max[1];
      if (top <= maxY && top > g) { g = top; hit = b; }
    }
    return { y: g, box: hit };
  }

  // Déplace un cylindre (personnage) avec collisions, marche et gravité.
  // body: {pos:[x,y,z], vel:[x,y,z], radius, height, onGround, stepHeight}
  moveCharacter(body, dt, layers = LAYER.WALL | LAYER.FURN | LAYER.DOOR | LAYER.GLASS) {
    const p = body.pos, v = body.vel, r = body.radius;
    v[1] += this.gravity * dt;
    if (v[1] < -30) v[1] = -30;
    const steps = Math.max(1, Math.ceil(Math.hypot(v[0], v[2]) * dt / (r * 0.5)));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      p[0] += v[0] * sdt; p[2] += v[2] * sdt;
      this._resolveXZ(body, layers);
    }
    // vertical
    const newY = p[1] + v[1] * dt;
    const ground = this.groundAt(p[0], p[2], p[1] + body.stepHeight + 0.01, r, layers);
    body.groundBox = null;
    if (v[1] <= 0 && newY <= ground.y + 0.001 && ground.y > -Infinity) {
      // marche vers le haut douce
      if (ground.y > p[1]) p[1] = Math.min(ground.y, p[1] + Math.max(0.05, (ground.y - p[1]) * 0.6 + dt * 4)); else p[1] = ground.y;
      if (ground.y - p[1] < 0.001) p[1] = ground.y;
      v[1] = 0; body.onGround = true; body.groundBox = ground.box;
    } else {
      // plafond
      if (v[1] > 0) {
        const head = newY + body.height;
        const arr = this.near(p[0] - r, p[2] - r, p[0] + r, p[2] + r, layers, _nearC);
        for (const b of arr) {
          if (p[0] + r * 0.7 < b.min[0] || p[0] - r * 0.7 > b.max[0] || p[2] + r * 0.7 < b.min[2] || p[2] - r * 0.7 > b.max[2]) continue;
          if (b.min[1] >= p[1] + body.height - 0.01 && b.min[1] < head) { v[1] = 0; break; }
        }
      }
      p[1] += v[1] * dt; body.onGround = false;
      // rattrapage si on est passé sous le sol
      const g2 = this.groundAt(p[0], p[2], p[1] + 0.3, r, layers);
      if (g2.y > p[1] && g2.y - p[1] < 0.3) { p[1] = g2.y; v[1] = 0; body.onGround = true; body.groundBox = g2.box; }
    }
  }

  _resolveXZ(body, layers) {
    const p = body.pos, r = body.radius;
    const feet = p[1] + body.stepHeight, head = p[1] + body.height;
    const arr = this.near(p[0] - r - 0.1, p[2] - r - 0.1, p[0] + r + 0.1, p[2] + r + 0.1, layers, _nearX);
    for (let it = 0; it < 2; it++) for (const b of arr) {
      if (b.max[1] <= feet || b.min[1] >= head) continue;
      // cercle vs rectangle
      const cx = Math.max(b.min[0], Math.min(p[0], b.max[0]));
      const cz = Math.max(b.min[2], Math.min(p[2], b.max[2]));
      let dx = p[0] - cx, dz = p[2] - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        // centre à l'intérieur : sortie par la face la plus proche
        const e0 = p[0] - b.min[0], e1 = b.max[0] - p[0], e2 = p[2] - b.min[2], e3 = b.max[2] - p[2], m = Math.min(e0, e1, e2, e3);
        if (m === e0) p[0] = b.min[0] - r; else if (m === e1) p[0] = b.max[0] + r; else if (m === e2) p[2] = b.min[2] - r; else p[2] = b.max[2] + r;
        continue;
      }
      const d = Math.sqrt(d2); const push = r - d; dx /= d; dz /= d;
      p[0] += dx * push; p[2] += dz * push;
      const vn = body.vel[0] * dx + body.vel[2] * dz;
      if (vn < 0) { body.vel[0] -= vn * dx; body.vel[2] -= vn * dz; }
      if (body.onBump) body.onBump(b);
    }
  }

  // Le cylindre tient-il debout ici (pour se relever d'accroupi, sortir d'un conduit…) ?
  fits(x, y, z, r, h, layers = LAYER.WALL | LAYER.FURN | LAYER.DOOR | LAYER.GLASS) {
    const arr = this.near(x - r, z - r, x + r, z + r, layers, _nearF);
    for (const b of arr) {
      if (b.max[1] <= y + 0.3 || b.min[1] >= y + h) continue;
      const cx = Math.max(b.min[0], Math.min(x, b.max[0])), cz = Math.max(b.min[2], Math.min(z, b.max[2]));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r * 0.9) return false;
    }
    return true;
  }

  // Lancer de rayon contre les boîtes statiques. Retourne {t, box, normal} ou null.
  raycast(ox, oy, oz, dx, dy, dz, maxT, layers = LAYER.WALL | LAYER.FURN | LAYER.DOOR | LAYER.GLASS, ignore = null) {
    const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    const c = this.cell; const q = ++this.query;
    let ix = Math.floor(ox / c), iz = Math.floor(oz / c);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(c / dx) : Infinity, tDeltaZ = dz !== 0 ? Math.abs(c / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((dx > 0 ? (ix + 1) * c - ox : ox - ix * c) / Math.abs(dx)) : Infinity;
    let tMaxZ = dz !== 0 ? ((dz > 0 ? (iz + 1) * c - oz : oz - iz * c) / Math.abs(dz)) : Infinity;
    let best = null, bestT = maxT, bAx = -1, bSg = 0;
    for (let guard = 0; guard < 200; guard++) {
      const arr = this.grid.get(this.key(ix, iz));
      if (arr) for (const b of arr) {
        if (b._q === q || !b.enabled || !(b.layer & layers) || b === ignore) continue; b._q = q;
        const t = rayBoxT(ox, oy, oz, dx, dy, dz, b);
        if (t >= 0 && t < bestT) { bestT = t; best = b; bAx = _rb.axis; bSg = _rb.sign; }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (best && bestT <= tNext) break;
      if (tNext > maxT) break;
      if (tMaxX < tMaxZ) { ix += stepX; tMaxX += tDeltaX; } else { iz += stepZ; tMaxZ += tDeltaZ; }
    }
    if (!best) return null;
    const n = [0, 0, 0]; if (bAx >= 0) n[bAx] = bSg;
    return { t: bestT, box: best, normal: n };
  }

  // Nombre de murs (couche WALL/DOOR) entre deux points — pour l'occlusion sonore
  countWalls(a, b, max = 4) {
    let n = 0; let ox = a[0], oy = a[1], oz = a[2];
    const dx = b[0] - ox, dy = b[1] - oy, dz = b[2] - oz; let remaining = Math.hypot(dx, dy, dz);
    if (remaining < 0.01) return 0;
    const ux = dx / remaining, uy = dy / remaining, uz = dz / remaining;
    let ignore = null;
    while (n < max && remaining > 0.05) {
      const hit = this.raycast(ox, oy, oz, ux, uy, uz, remaining, LAYER.WALL | LAYER.DOOR, ignore);
      if (!hit) break;
      n++;
      // traverser l'épaisseur de la boîte
      const exit = rayBoxExit(ox, oy, oz, ux, uy, uz, hit.box);
      const adv = Math.max(hit.t + 0.02, exit + 0.02);
      ox += ux * adv; oy += uy * adv; oz += uz * adv; remaining -= adv; ignore = hit.box;
    }
    return n;
  }

  // ── Corps dynamiques (objets lancés) ──
  addBody(body) { this.dynamic.add(body); body.sleeping = false; body.sleepTimer = 0; }
  removeBody(body) { this.dynamic.delete(body); }

  stepBodies(dt, onImpact) {
    const layers = LAYER.WALL | LAYER.FURN | LAYER.DOOR | LAYER.GLASS;
    for (const b of this.dynamic) {
      if (b.sleeping) continue;
      if (b.held) continue;
      const sub = Math.max(1, Math.min(6, Math.ceil(Math.hypot(b.vel[0], b.vel[1], b.vel[2]) * dt / 0.08)));
      const sdt = dt / sub;
      for (let s = 0; s < sub; s++) {
        b.vel[1] += this.gravity * sdt * (b.gravityScale ?? 1);
        if (b.drag) { const k = Math.exp(-b.drag * sdt); b.vel[0] *= k; b.vel[1] *= k; b.vel[2] *= k; }
        for (let ax = 0; ax < 3; ax++) {
          b.pos[ax] += b.vel[ax] * sdt;
          const hit = this._bodyOverlap(b, layers);
          if (hit) {
            const v = b.vel[ax];
            // repositionner hors de la boîte sur cet axe
            if (v > 0) b.pos[ax] = hit.min[ax] - b.half[ax] - 0.001; else b.pos[ax] = hit.max[ax] + b.half[ax] + 0.001;
            const speed = Math.abs(v);
            if (speed > 1.2 && onImpact) onImpact(b, speed, hit, ax);
            b.vel[ax] = -v * (b.bounce ?? 0.3);
            if (ax === 1 && v < 0) {
              // friction au sol
              const f = Math.exp(-(b.friction ?? 6) * sdt);
              b.vel[0] *= f; b.vel[2] *= f; b.onGround = true;
              if (Math.abs(b.vel[1]) < 0.6) b.vel[1] = 0;
            } else if (ax !== 1) {
              b.vel[ax === 0 ? 2 : 0] *= 0.85;
            }
          }
        }
      }
      // rotation visuelle
      if (b.spin) { const sp = Math.hypot(b.vel[0], b.vel[2]); b.rot[0] += b.spin[0] * dt * (b.onGround ? sp * 2 : 1); b.rot[1] += b.spin[1] * dt; b.rot[2] += b.spin[2] * dt * (b.onGround ? sp * 2 : 1); if (b.onGround) { b.spin[0] *= 0.9; b.spin[2] *= 0.9; b.spin[1] *= 0.95; } }
      const sp2 = b.vel[0] ** 2 + b.vel[1] ** 2 + b.vel[2] ** 2;
      if (sp2 < 0.02 && b.onGround) { b.sleepTimer += dt; if (b.sleepTimer > 0.4) { b.sleeping = true; b.vel[0] = b.vel[1] = b.vel[2] = 0; if (b.onSleep) b.onSleep(b); } }
      else b.sleepTimer = 0;
      b.onGround = false;
      if (b.pos[1] < -20) { b.pos[1] = 2; b.vel[1] = 0; } // filet de sécurité
    }
  }

  _bodyOverlap(b, layers) {
    const arr = this.near(b.pos[0] - b.half[0], b.pos[2] - b.half[2], b.pos[0] + b.half[0], b.pos[2] + b.half[2], layers, _nearB);
    let best = null, bestVol = 0;
    for (const s of arr) {
      if (s === b.ignoreBox) continue;
      const ox = Math.min(b.pos[0] + b.half[0], s.max[0]) - Math.max(b.pos[0] - b.half[0], s.min[0]);
      const oy = Math.min(b.pos[1] + b.half[1], s.max[1]) - Math.max(b.pos[1] - b.half[1], s.min[1]);
      const oz = Math.min(b.pos[2] + b.half[2], s.max[2]) - Math.max(b.pos[2] - b.half[2], s.min[2]);
      if (ox > 0 && oy > 0 && oz > 0) { const vol = ox * oy * oz; if (vol > bestVol) { bestVol = vol; best = s; } }
    }
    return best;
  }
}

// Tableaux de travail des requêtes internes (aucune ne relance une requête du même type pendant son parcours)
const _nearG = [], _nearC = [], _nearX = [], _nearF = [], _nearB = [];
// Rayon contre boîte (méthode des dalles), sans allocation : renvoie t ≥ 0 (0 si l'origine est dedans) ou -1 ; l'axe et
// le signe de la face d'entrée restent dans _rb (les lancers testent des centaines de boîtes par appel)
const _rb = { axis: -1, sign: 0 };
function rayBoxT(ox, oy, oz, dx, dy, dz, b) {
  let tmin = -Infinity, tmax = Infinity, ax = -1, sg = 0, t1, t2, s;
  const mn = b.min, mx = b.max;
  if (Math.abs(dx) < 1e-9) { if (ox < mn[0] || ox > mx[0]) return -1; }
  else { t1 = (mn[0] - ox) / dx; t2 = (mx[0] - ox) / dx; s = -1; if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; } if (t1 > tmin) { tmin = t1; ax = 0; sg = s; } if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  if (Math.abs(dy) < 1e-9) { if (oy < mn[1] || oy > mx[1]) return -1; }
  else { t1 = (mn[1] - oy) / dy; t2 = (mx[1] - oy) / dy; s = -1; if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; } if (t1 > tmin) { tmin = t1; ax = 1; sg = s; } if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < mn[2] || oz > mx[2]) return -1; }
  else { t1 = (mn[2] - oz) / dz; t2 = (mx[2] - oz) / dz; s = -1; if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; } if (t1 > tmin) { tmin = t1; ax = 2; sg = s; } if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  if (tmax < 0) return -1;
  _rb.axis = ax; _rb.sign = sg;
  return tmin > 0 ? tmin : 0;
}
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  const t = rayBoxT(ox, oy, oz, dx, dy, dz, b); if (t < 0) return null;
  const n = [0, 0, 0]; if (_rb.axis >= 0) n[_rb.axis] = _rb.sign;
  return { t, n };
}

function rayBoxExit(ox, oy, oz, dx, dy, dz, b) {
  let tmax = Infinity;
  if (Math.abs(dx) >= 1e-9) tmax = Math.min(tmax, Math.max((b.min[0] - ox) / dx, (b.max[0] - ox) / dx));
  if (Math.abs(dy) >= 1e-9) tmax = Math.min(tmax, Math.max((b.min[1] - oy) / dy, (b.max[1] - oy) / dy));
  if (Math.abs(dz) >= 1e-9) tmax = Math.min(tmax, Math.max((b.min[2] - oz) / dz, (b.max[2] - oz) / dz));
  return tmax;
}
