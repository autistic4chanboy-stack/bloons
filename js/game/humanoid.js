// Modèle humanoïde low-poly animé (style « Source » simplifié) : joueurs, PNJ, gardien, braqueurs,
// policiers, pompiers, mannequins, Bobby l'Ourson.
import * as THREE from 'three';
import { GLOBAL_UNIFORMS } from '../engine/materials.js';
import { concatGeometries } from '../engine/geo.js';

const geoCache = {};
function G(key, fn) { return geoCache[key] || (geoCache[key] = fn()); }
const box = (w, h, d) => G('b' + w + h + d, () => new THREE.BoxGeometry(w, h, d));
const cyl = (r1, r2, h) => G('c' + r1 + r2 + h, () => new THREE.CylinderGeometry(r1, r2, h, 8));
const sph = (r) => G('s' + r, () => new THREE.SphereGeometry(r, 12, 9));

const matCache = new Map();
function M(color, rough = 0.75, emissive = 0) {
  const k = color + '|' + rough + '|' + emissive;
  if (!matCache.has(k)) { const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 }); if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1; } matCache.set(k, m); }
  return matCache.get(k);
}

// opts: {shirt, pants, skin, hair, shoes, hat, kind: 'human'|'mannequin'|'bear'|'firefighter'|'police'|'robber'|'ghost', height, female}
export function buildHumanoid(opts = {}) {
  const kind = opts.kind || 'human';
  const H = opts.height || 1.78; const k = H / 1.78;
  const shirt = opts.shirt ?? 0x3b4a6b, pants = opts.pants ?? 0x1f2a44, skin = opts.skin ?? 0xe0b89a, hair = opts.hair ?? 0x3e2723, shoes = opts.shoes ?? 0x111111;
  const root = new THREE.Group(); root.name = 'humanoid';
  const body = new THREE.Group(); root.add(body); body.scale.setScalar(k);
  const parts = {};
  const add = (parent, geo, mat, x, y, z, name) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); if (name) parts[name] = m; return m; };
  const mannequin = kind === 'mannequin';
  const bear = kind === 'bear';
  const ghost = kind === 'ghost';
  const skinM = M(mannequin ? 0xf0ece4 : bear ? 0xc8873a : skin, mannequin ? 0.35 : 0.7);
  const shirtM = M(mannequin ? 0xf0ece4 : bear ? 0xc8873a : shirt, mannequin ? 0.35 : 0.85);
  const pantsM = M(mannequin ? 0xf0ece4 : bear ? 0xb07430 : pants, mannequin ? 0.35 : 0.85);
  // hanches (pivot des jambes)
  const hips = new THREE.Group(); hips.position.y = 0.95; body.add(hips); parts.hips = hips;
  const torso = new THREE.Group(); hips.add(torso); parts.torso = torso;
  if (bear) { add(torso, sph(0.34), shirtM, 0, 0.28, 0); add(torso, sph(0.24), M(0xf3d2a2), 0, 0.22, 0.17); }
  else { add(torso, box(0.42, 0.56, 0.24), shirtM, 0, 0.3, 0); if (!mannequin && !ghost) add(torso, box(0.44, 0.08, 0.26), M(0x222222), 0, 0.03, 0); }
  // badge / détails
  if (kind === 'human' && opts.badge) add(torso, box(0.08, 0.05, 0.01), M(0xffd54f, 0.4), 0.11, 0.44, 0.125);
  if (kind === 'police') { add(torso, box(0.1, 0.07, 0.01), M(0xffd700, 0.3), -0.1, 0.45, 0.125); }
  if (kind === 'firefighter') { add(torso, box(0.43, 0.04, 0.25), M(0xffeb3b, 0.4, 0x333300), 0, 0.15, 0); add(torso, box(0.43, 0.04, 0.25), M(0xffeb3b, 0.4, 0x333300), 0, 0.42, 0); }
  // cou + tête
  const neck = new THREE.Group(); neck.position.y = 0.6; torso.add(neck); parts.neck = neck;
  const head = new THREE.Group(); head.position.y = 0.12; neck.add(head); parts.head = head;
  if (bear) {
    add(head, sph(0.26), skinM, 0, 0.14, 0);
    add(head, sph(0.09), skinM, -0.2, 0.36, 0); add(head, sph(0.09), skinM, 0.2, 0.36, 0);
    add(head, sph(0.11), M(0xf3d2a2), 0, 0.08, 0.2);
    add(head, sph(0.04), M(0x111111, 0.2), 0, 0.12, 0.31);
    const eyeM = M(0x111111, 0.1, opts.glowEyes ? 0x330000 : 0);
    parts.eyeL = add(head, sph(0.035), eyeM, -0.09, 0.22, 0.22); parts.eyeR = add(head, sph(0.035), eyeM, 0.09, 0.22, 0.22);
    add(head, box(0.18, 0.02, 0.02), M(0x3e2723), 0, 0.02, 0.24);
    add(torso, box(0.2, 0.06, 0.02), M(0xd32f2f), 0, 0.5, 0.2); // nœud papillon
  } else if (ghost) {
    add(head, sph(0.15), M(0xf5f5f5, 0.9), 0, 0.12, 0);
    add(head, box(0.05, 0.06, 0.01), M(0x111111), -0.06, 0.15, 0.14); add(head, box(0.05, 0.06, 0.01), M(0x111111), 0.06, 0.15, 0.14);
    add(torso, cyl(0.2, 0.42, 1.3), M(0xf5f5f5, 0.9), 0, -0.1, 0);
  } else {
    add(head, box(0.2, 0.25, 0.22), skinM, 0, 0.12, 0);
    if (!mannequin) {
      add(head, box(0.21, 0.07, 0.23), M(hair), 0, 0.26, -0.005);
      add(head, box(0.21, 0.12, 0.05), M(hair), 0, 0.18, -0.1);
      parts.eyeL = add(head, box(0.035, 0.025, 0.01), M(0x1a1a1a, 0.2), -0.05, 0.15, 0.111);
      parts.eyeR = add(head, box(0.035, 0.025, 0.01), M(0x1a1a1a, 0.2), 0.05, 0.15, 0.111);
      add(head, box(0.07, 0.015, 0.01), M(0x8a4a3a), 0, 0.05, 0.111);
      add(head, box(0.04, 0.05, 0.03), skinM, 0, 0.1, 0.12);
    }
    if (opts.hat === 'cap') add(head, box(0.23, 0.08, 0.24), M(opts.hatColor ?? 0x1a237e), 0, 0.29, 0), add(head, box(0.2, 0.02, 0.12), M(opts.hatColor ?? 0x1a237e), 0, 0.26, 0.16);
    if (opts.hat === 'helmet') add(head, sph(0.16), M(0x263238, 0.4), 0, 0.22, 0);
    if (opts.hat === 'balaclava') add(head, box(0.215, 0.27, 0.235), M(0x111111, 0.95), 0, 0.12, 0), add(head, box(0.15, 0.04, 0.01), M(0xd8b08c), 0, 0.15, 0.119);
    if (opts.hat === 'firehelmet') add(head, sph(0.17), M(0xffd600, 0.4), 0, 0.22, 0);
  }
  // bras
  const mkArm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.27, 0.53, 0); torso.add(sh);
    add(sh, box(0.11, 0.3, 0.12), shirtM, 0, -0.14, 0);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
    add(el, box(0.1, 0.28, 0.11), bear ? shirtM : (opts.sleeves === false ? skinM : shirtM), 0, -0.13, 0);
    const hand = add(el, bear ? sph(0.075) : box(0.09, 0.09, 0.09), skinM, 0, -0.31, 0);
    return { sh, el, hand };
  };
  const aL = mkArm(-1), aR = mkArm(1);
  parts.armL = aL.sh; parts.armR = aR.sh; parts.elbowL = aL.el; parts.elbowR = aR.el; parts.handR = aR.hand; parts.handL = aL.hand;
  // jambes
  const mkLeg = (side) => {
    const hp = new THREE.Group(); hp.position.set(side * 0.11, 0, 0); hips.add(hp);
    if (!ghost) add(hp, box(0.15, 0.45, 0.16), pantsM, 0, -0.22, 0);
    const kn = new THREE.Group(); kn.position.y = -0.45; hp.add(kn);
    if (!ghost) { add(kn, box(0.13, 0.43, 0.14), pantsM, 0, -0.2, 0); add(kn, box(0.13, 0.08, 0.24), M(bear ? 0x8d5a24 : mannequin ? 0xf0ece4 : shoes), 0, -0.44, 0.04); }
    return { hp, kn };
  };
  const lL = mkLeg(-1), lR = mkLeg(1);
  parts.legL = lL.hp; parts.legR = lR.hp; parts.kneeL = lL.kn; parts.kneeR = lR.kn;
  if (mannequin) { // pied de mannequin
    const stand = new THREE.Mesh(cyl(0.2, 0.2, 0.03), M(0x333333)); stand.position.y = 0.015; root.add(stand); parts.stand = stand;
  }
  root.userData.parts = parts; root.userData.kind = kind;
  root.userData.anim = { phase: 0, speed: 0 };
  if (opts.merge !== false) mergeRigid(root);
  return root;
}

// Fusion des pièces rigides : un seul mesh (couleurs par sommet) par segment animé (tête, torse, bras, avant-bras…).
// Environ 10 appels de dessin par personnage au lieu de 22 : la foule de la journée coûte deux fois moins cher.
const vcMats = new Map();
function vcMat(rough) {
  if (!vcMats.has(rough)) vcMats.set(rough, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0.02 }));
  return vcMats.get(rough);
}
function mergeRigid(root) {
  const groups = []; root.traverse((o) => { if (o.isGroup) groups.push(o); });
  for (const grp of groups) {
    const ms = grp.children.filter((c) => c.isMesh && c.visible && c.material && c.material.isMeshStandardMaterial && !c.material.transparent && c.material.emissive.getHex() === 0 && c.geometry.index && c.geometry.attributes.uv);
    if (ms.length < 2) continue;
    const list = []; let rough = 0;
    for (const m of ms) {
      m.updateMatrix();
      const src = m.geometry, n = src.attributes.position.count, col = new Float32Array(n * 3), c = m.material.color;
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.attributes.position); g.setAttribute('normal', src.attributes.normal); g.setAttribute('uv', src.attributes.uv);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(src.index);
      list.push({ geo: g, matrix: m.matrix.clone() }); rough += m.material.roughness;
    }
    const mesh = new THREE.Mesh(concatGeometries(list).geometry, vcMat(Math.round((rough / ms.length) * 10) / 10));
    mesh.castShadow = true; mesh.receiveShadow = true;
    for (const m of ms) grp.remove(m);
    grp.add(mesh);
  }
}

// Animation de marche / pose. speed en m/s. pose : 'idle' | 'walk' | 'run' | 'crouch' | 'sit' | 'reach' | 'aim' | 'tpose' | 'dead' | 'crawl' | 'cheer' | mannequin poses 0..3
export function animateHumanoid(h, dt, speed, pose = 'auto', extra = {}) {
  const P = h.userData.parts; const A = h.userData.anim;
  const moving = speed > 0.15;
  A.phase += dt * (moving ? 2.2 + speed * 1.6 : 1.2);
  const s = Math.sin(A.phase * 2), c = Math.cos(A.phase * 2);
  const amp = moving ? Math.min(1, speed / 3) : 0;
  if (typeof pose === 'number') { mannequinPose(P, pose); return; }
  const crouch = pose === 'crouch' || pose === 'crawl';
  P.hips.position.y = crouch ? 0.6 : 0.95 + (moving ? Math.abs(s) * 0.04 * amp : Math.sin(A.phase) * 0.005);
  P.legL.rotation.x = s * 0.7 * amp + (crouch ? -1.2 : 0); P.legR.rotation.x = -s * 0.7 * amp + (crouch ? -1.2 : 0);
  P.kneeL.rotation.x = Math.max(0, -s) * 0.9 * amp + (crouch ? 1.9 : 0); P.kneeR.rotation.x = Math.max(0, s) * 0.9 * amp + (crouch ? 1.9 : 0);
  P.armL.rotation.x = -s * 0.6 * amp; P.armR.rotation.x = s * 0.6 * amp;
  P.elbowL.rotation.x = -0.25 - amp * 0.3; P.elbowR.rotation.x = -0.25 - amp * 0.3;
  P.armL.rotation.z = 0.06; P.armR.rotation.z = -0.06;
  P.torso.rotation.x = crouch ? 0.35 : (pose === 'run' ? 0.15 : 0.02);
  P.head.rotation.x = extra.pitch ? -extra.pitch * 0.6 : 0;
  if (pose === 'sit') { P.hips.position.y = 0.5; P.legL.rotation.x = P.legR.rotation.x = -1.5; P.kneeL.rotation.x = P.kneeR.rotation.x = 1.5; }
  if (pose === 'reach' || extra.holding) { P.armR.rotation.x = -1.1; P.elbowR.rotation.x = -0.4; }
  if (pose === 'aim') { P.armR.rotation.x = -1.5; P.armL.rotation.x = -1.4; P.armL.rotation.z = -0.4; P.elbowR.rotation.x = 0; }
  if (pose === 'flashlight') { P.armR.rotation.x = -1.3 - (extra.pitch || 0); P.elbowR.rotation.x = -0.1; }
  if (pose === 'tpose') { P.armL.rotation.z = 1.5; P.armR.rotation.z = -1.5; P.armL.rotation.x = P.armR.rotation.x = 0; }
  if (pose === 'dead') { h.rotation.x = -Math.PI / 2; P.hips.position.y = 0.15; }
  if (pose === 'crawl') { h.rotation.x = 0; P.torso.rotation.x = 1.3; P.hips.position.y = 0.35; P.armL.rotation.x = -2.6 + s * 0.4; P.armR.rotation.x = -2.6 - s * 0.4; }
  if (pose === 'cheer') { P.armL.rotation.x = P.armR.rotation.x = -2.8 + s * 0.2; }
  if (pose === 'hunched') { P.torso.rotation.x = 0.55; P.neck.rotation.x = -0.4; P.armL.rotation.x = -0.4 + s * 0.3; P.armR.rotation.x = -0.4 - s * 0.3; P.elbowL.rotation.x = P.elbowR.rotation.x = -1.2; }
}

function mannequinPose(P, i) {
  const poses = [
    { aL: [0, 0, 0.15], aR: [0, 0, -0.15], h: [0, 0, 0] },
    { aL: [-0.4, 0, 0.3], aR: [0.2, 0, -1.2], h: [0, 0.4, 0] },
    { aL: [0, 0, 1.2], aR: [-1.0, 0, -0.2], h: [0.2, -0.3, 0] },
    { aL: [-2.4, 0, 0.2], aR: [-2.4, 0, -0.2], h: [-0.3, 0, 0] },
    { aL: [-1.4, 0, 0], aR: [-1.4, 0, 0], h: [0, 0, 0] }, // bras tendus (en approche)
  ];
  const p = poses[i % poses.length];
  P.armL.rotation.set(...p.aL); P.armR.rotation.set(...p.aR); P.head.rotation.set(...p.h);
  P.legL.rotation.x = P.legR.rotation.x = 0; P.kneeL.rotation.x = P.kneeR.rotation.x = 0; P.hips.position.y = 0.95; P.torso.rotation.x = 0;
}

export function setHumanoidLayer(h, layer) { h.traverse(o => o.layers.set(layer)); }

// Matériaux éclairés par la lumière de zone (comme le décor) : chaque présence a son propre uniform.
export function litHumanoid(root) {
  const u = { value: new THREE.Color(0, 0, 0) }; const cache = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.material || o.material.isMeshBasicMaterial || o.material.isShaderMaterial) return;
    let m = cache.get(o.material);
    if (!m) {
      m = o.material.clone();
      m.onBeforeCompile = (sh) => {
        sh.uniforms.zoneLight = u; sh.uniforms.irBoost = GLOBAL_UNIFORMS.irBoost;
        sh.fragmentShader = 'uniform vec3 zoneLight;\nuniform float irBoost;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', '#if defined( RE_IndirectDiffuse )\n\tirradiance += zoneLight * 0.85 + vec3(irBoost);\n#endif\n#include <lights_fragment_end>');
      };
      m.customProgramCacheKey = () => 'zlh1';
      cache.set(o.material, m);
    }
    o.material = m;
  });
  root.userData.zoneU = u;
  return u;
}
