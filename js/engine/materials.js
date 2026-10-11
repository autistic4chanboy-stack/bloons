// Bibliothèque de matériaux. Chaque matériau peut être « cloné par zone » : la zone injecte une lumière
// ambiante (zoneLight) dans le shader, ce qui permet d'éclairer un magasin entier pour le prix d'un uniform,
// en complément des quelques vraies lumières dynamiques (pool) proches du joueur.
// irBoost (global) éclaire toute la scène pendant le rendu des caméras infrarouges.
import * as THREE from 'three';
import * as TX from './textures.js';

export const GLOBAL_UNIFORMS = {
  irBoost: { value: 0 },
  uvPos: { value: new THREE.Vector3() }, uvDir: { value: new THREE.Vector3(0, 0, -1) }, uvCos: { value: 0.9 }, uvOn: { value: 0 },
  time: { value: 0 },
};

function patch(mat, zoneU) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.zoneLight = zoneU;
    sh.uniforms.irBoost = GLOBAL_UNIFORMS.irBoost;
    sh.fragmentShader = 'uniform vec3 zoneLight;\nuniform float irBoost;\n' + sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      '#if defined( RE_IndirectDiffuse )\n\tirradiance += zoneLight + vec3(irBoost);\n#endif\n#include <lights_fragment_end>');
  };
  mat.customProgramCacheKey = () => 'zl1';
  return mat;
}

const DEFS = {
  terrazzo: () => ({ tex: TX.terrazzo(), rough: 0.35, rep: 0.25, metal: 0 }),
  concrete: () => ({ tex: TX.concrete(0x8d8a85), rough: 0.9, rep: 0.25 }),
  concrete_dark: () => ({ tex: TX.concrete(0x5e5b57, 'd'), rough: 0.9, rep: 0.25 }),
  concrete_floor: () => ({ tex: TX.concrete(0x77746e, 'f'), rough: 0.7, rep: 0.2 }),
  asphalt: () => ({ tex: TX.asphalt(), rough: 0.85, rep: 0.2 }),
  brick: () => ({ tex: TX.brick(), rough: 0.9, rep: 0.4 }),
  block: () => ({ tex: TX.blockWall(0xb8b4aa), rough: 0.92, rep: 0.3 }),
  block_dark: () => ({ tex: TX.blockWall(0x7d7a73), rough: 0.92, rep: 0.3 }),
  wood_floor: () => ({ tex: TX.woodPlanks(0x8d6038), rough: 0.5, rep: 0.3 }),
  wood_dark: () => ({ tex: TX.woodPlanks(0x4e3420, 'd'), rough: 0.55, rep: 0.3 }),
  lino: () => ({ tex: TX.linoleum(0x9fa59a), rough: 0.5, rep: 0.3 }),
  lino_blue: () => ({ tex: TX.linoleum(0x7a8ea0), rough: 0.5, rep: 0.3 }),
  checker: () => ({ tex: TX.checker(0x1a1a1a, 0xe8e8e8), rough: 0.3, rep: 0.5 }),
  diamond: () => ({ tex: TX.diamondPlate(), rough: 0.45, rep: 0.8, metal: 0.6 }),
  metal: () => ({ tex: TX.metalPanel(), rough: 0.5, rep: 0.5, metal: 0.5 }),
  vent: () => ({ tex: TX.metalPanel(0xa5abb0), rough: 0.4, rep: 1, metal: 0.7 }),
  woodpanel: () => ({ tex: TX.woodPanelWall(), rough: 0.6, rep: 0.5 }),
  ceiling: () => ({ tex: TX.ceilingTiles(), rough: 0.95, rep: 0.5 }),
  corrugated: () => ({ tex: TX.corrugated(), rough: 0.5, rep: 0.3, metal: 0.4 }),
  toilet_tiles: () => ({ tex: TX.tiles(0xe6eef0, 0x9aa5a8, 8, 'wc', 0.2), rough: 0.2, rep: 0.5 }),
};

export class Materials {
  constructor(atlasTexture) {
    this.cache = new Map();
    this.zoneUniforms = new Map();
    this.atlas = atlasTexture;
    this.envIntensity = 1;
  }

  zoneUniform(zone) {
    const k = zone || '_';
    if (!this.zoneUniforms.has(k)) this.zoneUniforms.set(k, { value: new THREE.Color(0, 0, 0) });
    return this.zoneUniforms.get(k);
  }

  _make(name) {
    if (DEFS[name]) {
      const d = DEFS[name]();
      const m = new THREE.MeshStandardMaterial({ map: d.tex.map, normalMap: d.tex.normalMap, roughnessMap: d.tex.roughnessMap, roughness: d.rough, metalness: d.metal || 0 });
      m.userData.texRepeat = d.rep;
      return m;
    }
    let mm;
    if ((mm = name.match(/^tile_([0-9a-f]{6})_([0-9a-f]{6})_(\d+)$/))) {
      const t = TX.tiles(parseInt(mm[1], 16), parseInt(mm[2], 16), +mm[3]);
      const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 0.4 });
      m.userData.texRepeat = 0.4; return m;
    }
    if ((mm = name.match(/^plaster_([0-9a-f]{6})$/))) {
      const t = TX.plaster(parseInt(mm[1], 16));
      const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92 });
      m.userData.texRepeat = 0.5; return m;
    }
    if ((mm = name.match(/^carpet_([0-9a-f]{6})$/))) {
      const t = TX.carpet(parseInt(mm[1], 16));
      const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 1 });
      m.userData.texRepeat = 0.5; return m;
    }
    if (name === 'furniture') return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
    if (name === 'furniture_metal') return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 });
    if (name === 'props') return new THREE.MeshStandardMaterial({ vertexColors: true, map: this.atlas, roughness: 0.55, metalness: 0.02 });
    if (name === 'glass') return new THREE.MeshStandardMaterial({ color: 0xaac8d0, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    if (name === 'glass_dirty') return new THREE.MeshStandardMaterial({ color: 0x8aa0a0, transparent: true, opacity: 0.32, roughness: 0.3, metalness: 0.0, depthWrite: false, side: THREE.DoubleSide });
    if (name === 'chrome') return new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.18, metalness: 1 });
    if (name === 'black') return new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 });
    if (name === 'skin') return new THREE.MeshStandardMaterial({ color: 0xe0b89a, roughness: 0.7 });
    if (name === 'water') return new THREE.MeshStandardMaterial({ color: 0x3a6a80, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75 });
    console.warn('matériau inconnu', name);
    return new THREE.MeshStandardMaterial({ color: 0xff00ff });
  }

  // Matériau pour une zone (clone partageant le même programme shader)
  get(name, zone = null) {
    const key = name + '|' + (zone || '_');
    let m = this.cache.get(key);
    if (m) return m;
    const base = this.cache.get(name + '|base') || (() => { const b = this._make(name); this.cache.set(name + '|base', b); return b; })();
    m = base.clone();
    m.userData = { ...base.userData, zone };
    if (!m.transparent) patch(m, this.zoneUniform(zone));
    this.cache.set(key, m);
    return m;
  }

  emissive(color, intensity = 1) {
    const key = 'emi|' + color + '|' + intensity;
    let m = this.cache.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }); m.toneMapped = false; this.cache.set(key, m); }
    return m;
  }

  setZoneLight(zone, r, g, b) { this.zoneUniform(zone).value.setRGB(r, g, b); }
}
