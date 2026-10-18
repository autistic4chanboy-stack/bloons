// Visée et interaction : rayon depuis la caméra contre les boîtes de visée des objets, bloqué par les murs.
// E = « use », R = « alt ». Un objet peut gérer l'interaction localement (UI) ou l'envoyer à l'hôte.
import * as THREE from 'three';
import { LAYER } from '../engine/physics.js';

export class Interaction {
  constructor(game) { this.game = game; this.target = null; this.prompt = ''; this.dist = 0; this.point = null; }

  ray(maxDist, layers) {
    const cam = this.game.camera; const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    return { o: cam.position, d, hit: this.game.world.physics.raycast(cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, maxDist, layers) };
  }
  // point visé dans le monde statique (pour poser des objets)
  rayWorld(maxDist = 3) {
    const r = this.ray(maxDist, LAYER.WALL | LAYER.FURN | LAYER.DOOR | LAYER.GLASS | LAYER.VENT);
    if (!r.hit) return null;
    const p = r.o.clone().addScaledVector(r.d, r.hit.t);
    return { point: [p.x, p.y, p.z], normal: r.hit.normal, t: r.hit.t, box: r.hit.box, dir: r.d };
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.target = null; this.prompt = '';
    if (!p.alive || !['walk', 'sit', 'hide'].includes(p.mode) || g.ui.modal) { g.ui.setPrompt(''); return; }
    const cam = g.camera; const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const maxD = p.inVent ? 3.0 : 2.6;
    const block = g.world.physics.raycast(cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, maxD, LAYER.WALL | LAYER.DOOR | LAYER.GLASS);
    const hit = g.world.pick.raycast(cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, maxD, LAYER.ALL);
    let obj = null;
    if (hit && hit.box.data && (!block || hit.t <= block.t + 0.12)) obj = hit.box.data;
    if (obj && obj.state?.where === 'held') obj = null;
    if (!obj && g.world.checkpoints) obj = this.nearReader(cam.position, d); // borne de ronde : il suffit d'être devant
    if (obj) {
      const pr = obj.prompt(p);
      if (pr) { const t = hit && hit.box.data === obj ? hit.t : cam.position.distanceTo(obj.center); this.target = obj; this.prompt = pr; this.dist = t; this.point = cam.position.clone().addScaledVector(d, t); }
    }
    g.ui.setPrompt(this.prompt, this.target);
    if (g.input.hit('KeyE')) this.activate('use');
    else if (g.input.hit('KeyR') && this.target) this.activate('alt');
  }

  // borne de ronde à moins de 1,8 m, à peu près dans le regard (cône de ±50°) et sans mur entre les deux
  nearReader(o, d) {
    const P = this.game.world.physics; let best = null, bs = 0;
    for (const r of Object.values(this.game.world.checkpoints)) {
      const c = r.center, dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z, L = Math.hypot(dx, dy, dz); if (L > 1.8 || L < 0.05) continue;
      const k = (dx * d.x + dy * d.y + dz * d.z) / L; if (k < 0.64 || k <= bs) continue;
      if (P.raycast(o.x, o.y, o.z, dx, dy, dz, L - 0.08, LAYER.WALL | LAYER.DOOR | LAYER.GLASS)) continue;
      best = r; bs = k;
    }
    return best;
  }

  activate(verb) {
    const g = this.game, p = g.player, t = this.target;
    if (!t) return;
    if (t.local && t.local(verb, p)) return;
    g.sim.do('interact', { id: t.id, verb, held: p.heldProp?.id || null, inVent: p.inVent });
  }
}
