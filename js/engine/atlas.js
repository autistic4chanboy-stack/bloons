// Atlas d'étiquettes des produits (séparé de textures.js : les étiquettes des articles évoluent indépendamment
// des matériaux d'architecture).
import * as THREE from 'three';
import { canvas, getMaxAnisotropy } from './textures.js';
import { mulberry32 } from './rng.js';

// ── Atlas d'étiquettes produits ──
// Toutes les étiquettes sont dessinées dans un unique canvas 2048×2048 (cellules 128×128) afin que
// tous les produits partagent un seul matériau (une seule draw call par magasin après fusion).
export class LabelAtlas {
  constructor() {
    this.size = 2048; this.cell = 128; this.cols = this.size / this.cell;
    this.c = canvas(this.size); this.ctx = this.c.getContext('2d');
    this.ctx.fillStyle = '#ffffff'; this.ctx.fillRect(0, 0, this.size, this.size);
    this.next = 1; // cellule 0 = blanc uni (faces sans étiquette)
    this.map = new Map();
    this.texture = null;
  }
  // rectangle UV {u0, v0, u1, v1} de la cellule blanche
  white() { return this.rect(0); }
  rect(i) {
    const cx = i % this.cols, cy = (i / this.cols) | 0; const s = this.cell / this.size; const pad = 2 / this.size;
    return { u0: cx * s + pad, v0: 1 - (cy + 1) * s + pad, u1: (cx + 1) * s - pad, v1: 1 - cy * s - pad };
  }
  label(key, text, color, style = 'box') {
    if (this.map.has(key)) return this.map.get(key);
    if (this.next >= this.cols * this.cols) return this.white();
    const i = this.next++;
    const cx = (i % this.cols) * this.cell, cy = ((i / this.cols) | 0) * this.cell; const ctx = this.ctx; const C = this.cell;
    const rnd = mulberry32(i * 97);
    ctx.save(); ctx.translate(cx, cy);
    // les couleurs du produit sont appliquées par la couleur de vertex : on dessine en niveaux clairs
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, C, C);
    const accent = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1'][(rnd() * 7) | 0];
    if (style === 'vinyl' || style === 'vhs') {
      ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, C, C);
      for (let k = 0; k < 4; k++) { ctx.fillStyle = `hsl(${(rnd() * 360) | 0},70%,${40 + rnd() * 30}%)`; ctx.fillRect(rnd() * C, rnd() * C, 20 + rnd() * 60, 20 + rnd() * 60); }
    } else {
      ctx.fillStyle = accent; ctx.fillRect(0, C * 0.62, C, C * 0.12);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(C * 0.5, C * 0.32, C * 0.22, 0, 7); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let fs = 26; ctx.font = `900 ${fs}px Arial`;
    const t = (text || '').toUpperCase().slice(0, 18);
    while (ctx.measureText(t).width > C - 10 && fs > 10) { fs -= 2; ctx.font = `900 ${fs}px Arial`; }
    ctx.fillText(t, C / 2, style === 'vinyl' || style === 'vhs' ? C * 0.5 : C * 0.32);
    ctx.font = '700 11px Arial'; ctx.fillStyle = '#333';
    if (style !== 'vinyl' && style !== 'vhs') ctx.fillText('HÉLIOS', C / 2, C * 0.86);
    ctx.restore();
    const r = this.rect(i); this.map.set(key, r);
    if (this.texture) this.texture.needsUpdate = true;
    return r;
  }
  finalize() {
    const t = new THREE.CanvasTexture(this.c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = getMaxAnisotropy(); t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
    this.texture = t; return t;
  }
}
