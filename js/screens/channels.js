// Chaînes de télévision (contenus animés en boucle).
import { drawText, drawTextS, textWidth } from './font.js';
import { rect, frame, circle, ellipse, poly, grad, hsl, star, hash, rng, person, drawNoise, line, clamp } from './util.js';

export const CHANNELS = [
  { id: 'news', title: 'Canal 9 — Le Journal', desc: 'Journal télévisé de la nuit, bandeau défilant avec les dernières nouvelles de la région et du centre Hélios.' },
  { id: 'weather', title: 'Canal 9 — Météo', desc: 'Carte de France et prévisions pour la nuit et le lendemain.' },
  { id: 'cartoon', title: 'Ciné-Mômes — Pipo le Chat', desc: 'Dessin animé : Pipo le chat court après un papillon.' },
  { id: 'shopping', title: 'Télé-Achat Direct', desc: 'Télé-achat : des produits miracles à prix cassés, appelez vite !' },
  { id: 'testcard', title: 'Mire', desc: 'Mire de réglage de la chaîne régionale.' },
  { id: 'night', title: 'Programme de nuit', desc: 'Aquarium de nuit, horloge et « fin des programmes ».' },
  { id: 'music', title: 'Clip TV', desc: 'Clips musicaux avec visualiseur.' },
];

const HEADLINES = [
  'Centre Commercial Hélios : recrutement d\'un gardien de nuit, « un poste calme » selon la direction',
  'Insolite : une peluche d\'ours retrouvée chaque matin devant le Royaume du Jouet',
  'Coupure de courant inexpliquée au sous-sol d\'Hélios, la direction dément tout problème',
  'Il y a 37 ans, le centre Hélios ouvrait ses portes en grande pompe',
  'ElectroMaison : rappel de grille-pains défectueux, ramenez-les en magasin',
  'Des clients entendent une musique d\'ascenseur... dans un ascenseur à l\'arrêt',
  'Football : l\'AS Hélios s\'incline 0-3 à domicile',
  'Un chat élu « employé du mois » à l\'animalerie Arche de Noé',
  'Le parking P2 du centre commercial fermé jusqu\'à nouvel ordre',
  'Brouillard attendu cette nuit sur la zone commerciale',
  'Pixel Planet : record de ventes pour la console Famicube',
  'La mairie rappelle : aucune visite du sous-sol B n\'est autorisée',
];

const STORIES = [
  { t: 'EMPLOI', s: 'Hélios cherche un gardien de nuit', ic: 'mall' },
  { t: 'FAITS DIVERS', s: 'Coupure au sous-sol B', ic: 'bolt' },
  { t: 'SPORT', s: 'L\'AS Hélios battue', ic: 'ball' },
  { t: 'MÉTÉO', s: 'Brouillard cette nuit', ic: 'cloud' },
  { t: 'INSOLITE', s: 'Le mystère de l\'ours', ic: 'bear' },
];

function logo(g, w, txt, col = '#fff') { drawTextS(g, txt, w - 6, 6, col, 1, 'right'); }

function icon(g, kind, x, y, s, t) {
  if (kind === 'sun') { circle(g, x, y, 6 * s, '#ffd030'); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t * 0.5; rect(g, x + Math.cos(a) * 9 * s - 1, y + Math.sin(a) * 9 * s - 1, 2 * s, 2 * s, '#ffd030'); } }
  else if (kind === 'moon') { circle(g, x, y, 6 * s, '#f0f0c0'); circle(g, x + 3 * s, y - 2 * s, 5 * s, '#1a3a80'); }
  else if (kind === 'cloud' || kind === 'rain' || kind === 'storm' || kind === 'fog') {
    if (kind === 'rain') for (let i = 0; i < 3; i++) rect(g, x - 5 * s + i * 4 * s, y + 4 * s + ((t * 20 + i * 3) % 6), 1, 3, '#6cf');
    if (kind === 'storm') poly(g, [x, y + 2, x - 3, y + 9, x, y + 8, x - 2, y + 14, x + 4, y + 6, x + 1, y + 7], '#ff0');
    const c = kind === 'fog' ? '#bbb' : kind === 'cloud' ? '#eee' : '#999';
    circle(g, x - 4 * s, y + 1 * s, 4 * s, c); circle(g, x + 1 * s, y - 2 * s, 5 * s, c); circle(g, x + 5 * s, y + 1 * s, 4 * s, c); rect(g, x - 8 * s, y + 1 * s, 16 * s, 4 * s, c);
    if (kind === 'fog') { rect(g, x - 9 * s, y + 6 * s, 18 * s, 1, '#ccc'); rect(g, x - 7 * s, y + 8 * s, 14 * s, 1, '#ccc'); }
  } else if (kind === 'mall') {
    rect(g, x - 14, y - 4, 28, 14, '#d8c8a0'); poly(g, [x - 16, y - 4, x, y - 14, x + 16, y - 4], '#a04030');
    rect(g, x - 4, y + 2, 8, 8, '#334'); drawText(g, 'HÉLIOS', x, y - 2, '#a04030', 1, 'center');
  } else if (kind === 'bolt') poly(g, [x + 2, y - 12, x - 8, y + 2, x - 1, y + 2, x - 4, y + 12, x + 8, y - 3, x + 1, y - 3], '#ffd000');
  else if (kind === 'ball') { circle(g, x, y, 10, '#fff'); circle(g, x, y, 3, '#222'); circle(g, x - 7, y - 4, 2, '#222'); circle(g, x + 6, y + 5, 2, '#222'); }
  else if (kind === 'bear') { circle(g, x - 7, y - 8, 4, '#a0622d'); circle(g, x + 7, y - 8, 4, '#a0622d'); circle(g, x, y, 10, '#a0622d'); ellipse(g, x, y + 4, 5, 3.5, '#e0b080'); rect(g, x - 4, y - 3, 2, 2, '#000'); rect(g, x + 3, y - 3, 2, 2, '#000'); }
}

// Contour approximatif de la France (repère 0..1)
const FR = [0.52, 0, 0.62, 0.06, 0.72, 0.12, 0.84, 0.17, 0.9, 0.24, 0.86, 0.4, 0.84, 0.48, 0.9, 0.58, 0.88, 0.7, 0.93, 0.8, 0.8, 0.86, 0.7, 0.85, 0.6, 0.88, 0.52, 0.95, 0.4, 0.93, 0.28, 0.9, 0.3, 0.78, 0.31, 0.62, 0.24, 0.52, 0.2, 0.45, 0.1, 0.4, 0, 0.33, 0.08, 0.28, 0.2, 0.28, 0.27, 0.2, 0.36, 0.2, 0.44, 0.12, 0.5, 0.04];
const CITIES = [['Paris', 0.5, 0.25], ['Lille', 0.56, 0.07], ['Strasbourg', 0.84, 0.25], ['Brest', 0.07, 0.33], ['Nantes', 0.24, 0.46], ['Lyon', 0.72, 0.6], ['Bordeaux', 0.33, 0.7], ['Toulouse', 0.44, 0.84], ['Marseille', 0.72, 0.84], ['Nice', 0.88, 0.78]];

export const CHANNEL_BUILDERS = {
  news(S) {
    const ticker = HEADLINES.join('   •••   ') + '   •••   ';
    const tw = textWidth(ticker);
    return {
      title: 'Canal 9 — Le Journal',
      update() {
        const { g, w, h, t } = S;
        grad(g, 0, 0, w, h, '#0a2a6a', '#06153a');
        // décor : globe et lignes
        for (let i = 0; i < 6; i++) rect(g, 0, 20 + i * 22, w, 1, 'rgba(120,170,255,0.12)');
        circle(g, 60, 70, 46, 'rgba(80,140,255,0.15)');
        // incrustation sujet
        const st = STORIES[Math.floor(t / 8) % STORIES.length];
        rect(g, 150, 26, 96, 70, '#000'); frame(g, 150, 26, 96, 70, '#fff');
        grad(g, 151, 27, 94, 68, '#335', '#557');
        icon(g, st.ic, 198, 58, 1.2, t);
        rect(g, 150, 96, 96, 11, '#c00'); drawText(g, st.t, 198, 98, '#fff', 1, 'center');
        // présentatrice
        const ax = 72, ay = 150;
        rect(g, ax - 26, ay - 72, 52, 70, '#2a2a40');
        g.fillStyle = '#5a1020'; g.beginPath(); g.moveTo(ax - 30, ay); g.lineTo(ax - 24, ay - 48); g.lineTo(ax + 24, ay - 48); g.lineTo(ax + 30, ay); g.fill();
        poly(g, [ax - 6, ay - 48, ax, ay - 36, ax + 6, ay - 48], '#f0e0d0');
        rect(g, ax - 4, ay - 56, 8, 9, '#e8b896');
        ellipse(g, ax, ay - 66, 13, 15, '#e8b896');
        g.fillStyle = '#3a2010'; g.beginPath(); g.arc(ax, ay - 70, 15, Math.PI, 0); g.fill(); rect(g, ax - 15, ay - 70, 5, 22, '#3a2010'); rect(g, ax + 10, ay - 70, 5, 22, '#3a2010');
        const blink = (t % 4) < 0.12;
        rect(g, ax - 7, ay - 68, 4, blink ? 1 : 3, '#222'); rect(g, ax + 3, ay - 68, 4, blink ? 1 : 3, '#222');
        const talk = Math.abs(Math.sin(t * 11) * Math.sin(t * 3.1)) * 4 | 0;
        rect(g, ax - 4, ay - 59, 8, 1 + talk, '#8a2a3a');
        // bureau
        rect(g, 0, 140, 160, 40, '#1b3f8a'); rect(g, 0, 140, 160, 3, '#7ab0ff');
        drawText(g, 'CANAL 9', 80, 156, '#fff', 2, 'center');
        // titre
        rect(g, 0, 118, w, 0, '#000');
        rect(g, 150, 112, 106, 24, 'rgba(0,0,0,0.6)');
        drawText(g, st.s.slice(0, 17), 153, 115, '#fff');
        drawText(g, st.s.slice(17, 34), 153, 125, '#fff');
        // bandeau défilant
        rect(g, 0, h - 14, w, 14, '#e8e8e8'); rect(g, 0, h - 14, 46, 14, '#c00');
        drawText(g, 'INFO', 23, h - 10, '#fff', 1, 'center');
        g.save(); g.beginPath(); g.rect(46, h - 14, w - 46, 14); g.clip();
        const off = (t * 40) % tw;
        drawText(g, ticker, 50 - off, h - 10, '#111'); drawText(g, ticker, 50 - off + tw, h - 10, '#111');
        g.restore();
        rect(g, 4, 4, 52, 11, '#c00'); drawText(g, 'EN DIRECT', 30, 6, '#fff', 1, 'center');
        drawTextS(g, S.time(), w - 6, 6, '#fff', 1, 'right');
      },
    };
  },

  weather(S) {
    const kinds = ['sun', 'cloud', 'rain', 'storm', 'fog', 'moon'];
    const slots = ['CETTE NUIT', 'DEMAIN MATIN', 'DEMAIN APRÈS-MIDI'];
    return {
      title: 'Canal 9 — Météo',
      update() {
        const { g, w, h, t } = S;
        const slot = Math.floor(t / 7) % 3;
        grad(g, 0, 0, w, h, '#1060c0', '#0a3a80');
        const mx = 70, my = 26, ms = 150;
        rect(g, mx - 10, my - 6, ms + 20, ms + 8, 'rgba(0,30,90,0.5)');
        const p = FR.map((v, i) => (i % 2 ? my + v * ms : mx + v * ms));
        poly(g, p.map((v, i) => v + 2), '#03204a');
        poly(g, p, slot === 0 ? '#2f7a4a' : '#3fa060');
        ellipse(g, mx + 0.96 * ms, my + 0.92 * ms, 4, 8, slot === 0 ? '#2f7a4a' : '#3fa060');
        CITIES.forEach(([n, x, y], i) => {
          const r = rng(i * 17 + slot * 101 + 3);
          let k = kinds[(r() * 5) | 0];
          if (slot === 0 && k === 'sun') k = 'moon';
          const cx = mx + x * ms, cy = my + y * ms;
          icon(g, k, cx, cy - 4, 0.8, t + i);
          const temp = slot === 0 ? (2 + r() * 8) | 0 : (8 + r() * 12) | 0;
          drawTextS(g, temp + '°', cx, cy + 6, '#fff', 1, 'center');
        });
        // Hélios marqué
        const hx = mx + 0.55 * ms, hy = my + 0.3 * ms;
        if ((t * 2 | 0) % 2) { circle(g, hx, hy, 2, '#f33'); }
        drawTextS(g, 'Hélios', hx + 4, hy - 3, '#fdd');
        rect(g, 0, 0, w, 18, 'rgba(0,0,0,0.5)');
        drawText(g, 'MÉTÉO · ' + slots[slot], 6, 6, '#fff');
        logo(g, w, 'CANAL 9');
        // présentateur
        const px = 36, py = h - 10;
        person(g, px, py, 1.6, { shirt: '#444', pants: '#222', hair: '#222', arm: -2.2 + Math.sin(t * 2) * 0.2, mouth: (t * 8 | 0) % 2 + 1 });
        rect(g, 0, h - 16, w, 16, 'rgba(0,0,0,0.6)');
        const txt = ['Ciel dégagé puis brouillard dense sur la zone commerciale.', 'Fraîcheur matinale, quelques averses à l\'ouest.', 'Belles éclaircies, vent faible de nord-est.'][slot];
        drawText(g, txt.slice(0, 41), w / 2, h - 12, '#ff8', 1, 'center');
      },
    };
  },

  cartoon(S) {
    return {
      title: 'Pipo le Chat',
      update() {
        const { g, w, h, t } = S;
        const T = t % 40;
        drawCartoon(S, g, w, h, T);
        logo(g, w, 'CINÉ-MÔMES', '#ff0');
      },
    };
  },

  shopping(S) {
    const PRODUCTS = [
      { n: 'ÉPLUCHE-TOUT 3000', old: '89,90', p: '39,90', col: '#e33', shape: 'peeler' },
      { n: 'MATELAS RÊVE D\'OR', old: '599,00', p: '299,00', col: '#fc3', shape: 'bed' },
      { n: 'COUTEAUX SAMOURAÏ', old: '149,00', p: '59,90', col: '#ccc', shape: 'knife' },
      { n: 'CEINTURE ABDO-FLASH', old: '129,00', p: '49,90', col: '#3cf', shape: 'belt' },
    ];
    return {
      title: 'Télé-Achat Direct',
      update() {
        const { g, w, h, t } = S;
        const i = Math.floor(t / 15) % PRODUCTS.length, pr = PRODUCTS[i], lt = t % 15;
        grad(g, 0, 0, w, h, '#ff9ad0', '#8040c0');
        for (let k = 0; k < 10; k++) star(g, (k * 53 + t * 10) % w, 20 + (k * 37) % 120, 3, 'rgba(255,255,255,0.3)');
        // podium produit
        ellipse(g, 180, 130, 50, 12, '#333');
        ellipse(g, 180, 127, 50, 12, '#fff');
        g.save(); g.translate(180, 95); g.rotate(Math.sin(t * 1.5) * 0.15);
        const c = pr.col;
        if (pr.shape === 'peeler') { rect(g, -6, -30, 12, 34, c); rect(g, -12, 4, 24, 12, '#aaa'); rect(g, -8, 16, 16, 6, '#888'); }
        else if (pr.shape === 'bed') { rect(g, -40, -6, 80, 20, c); rect(g, -40, -10, 80, 6, '#fff8d0'); for (let k = -36; k < 40; k += 8) rect(g, k, -2, 2, 2, '#c90'); }
        else if (pr.shape === 'knife') { for (let k = 0; k < 4; k++) { rect(g, -30 + k * 16, -30, 6, 30, c); rect(g, -30 + k * 16, 0, 6, 14, '#422'); } }
        else { rect(g, -34, -6, 68, 14, c); rect(g, -8, -10, 16, 22, '#222'); rect(g, -5, -6, 10, 6, (t * 4 | 0) % 2 ? '#0f0' : '#060'); }
        g.restore();
        // présentateur
        person(g, 60, 160, 2.4, { shirt: '#fff', pants: '#335', hair: '#c80', arm: -0.9 + Math.sin(t * 6) * 0.5, arm2: 0.5, mouth: (t * 9 | 0) % 2 + 1 });
        rect(g, 52, 108, 16, 2, '#c00');
        // texte
        rect(g, 0, 0, w, 20, '#ff0'); drawText(g, 'TÉLÉ-ACHAT DIRECT', 6, 6, '#c0f', 1);
        drawText(g, pr.n, w / 2, 26, '#fff', 1, 'center');
        rect(g, 120, 140, 130, 30, '#fff');
        drawText(g, pr.old + ' €', 185, 143, '#888', 1, 'center'); rect(g, 150, 146, 70, 1, '#f00');
        drawText(g, pr.p + ' €', 185, 153, '#e00', 2, 'center');
        if (lt > 4 && (t * 3 | 0) % 2) { rect(g, 120, 40, 120, 14, '#f00'); drawText(g, 'APPELEZ VITE !', 180, 43, '#ff0', 1, 'center'); }
        drawText(g, 'STOCK : ' + Math.max(3, 50 - Math.floor(lt * 3)), 186, 58, '#fff', 1, 'center');
        rect(g, 0, h - 16, w, 16, '#2a0050'); drawText(g, '☎ 0 800 12 34 56 (appel gratuit)', w / 2, h - 12, '#ff0', 1, 'center');
      },
    };
  },

  testcard(S) {
    return {
      title: 'Mire',
      update() { drawTestcard(S, S.g, S.w, S.h, 'CANAL 9 RÉGION'); },
    };
  },

  night(S) {
    return {
      title: 'Programme de nuit',
      update() {
        const { g, w, h, t } = S;
        const T = t % 65;
        if (T < 30) drawAquarium(S, g, w, h, t);
        else if (T < 50) {
          rect(g, 0, 0, w, h, '#000');
          drawClock(S, g, w / 2, 78, 50, t);
          drawText(g, 'FIN DES PROGRAMMES', w / 2, 140, '#fff', 1, 'center');
          drawText(g, 'Reprise à 6h00 · Bonne nuit', w / 2, 154, '#888', 1, 'center');
        } else drawTestcard(S, g, w, h, 'FIN DES PROGRAMMES');
        logo(g, w, 'CANAL 9', 'rgba(255,255,255,0.6)');
      },
    };
  },

  music(S) {
    const CLIPS = [
      { a: 'Sophie Lune', s: 'Néon d\'Hélios', style: 0 },
      { a: 'Les Fantômes du Parking', s: 'Escalator', style: 1 },
      { a: 'DJ Caddie', s: 'Soldes Fever', style: 2 },
    ];
    return {
      title: 'Clip TV',
      update() {
        const { g, w, h, t } = S;
        const ci = Math.floor(t / 20) % 3, clip = CLIPS[ci], lt = t % 20;
        const beat = Math.pow(1 - ((t * 2) % 1), 3);
        if (clip.style === 0) {
          grad(g, 0, 0, w, h * 0.6, '#1a0030', '#ff3a8a');
          for (let i = 0; i < 7; i++) rect(g, w / 2 - 40, 50 + i * 7, 80, 3 + i * 0.4, i % 2 ? '#ffb030' : '#ff6a30');
          circle(g, w / 2, 60, 1, '#fff');
          rect(g, 0, h * 0.6, w, h * 0.4, '#100020');
          for (let i = 0; i < 10; i++) { const y = h * 0.6 + Math.pow(i / 10 + (t % 1) / 10, 2) * h * 0.4; rect(g, 0, y, w, 1, '#f0f'); }
          for (let i = -8; i <= 8; i++) line(g, w / 2 + i * 6, h * 0.6, w / 2 + i * 40, h, '#f0f');
        } else if (clip.style === 1) {
          rect(g, 0, 0, w, h, '#111');
          for (let i = 0; i < 5; i++) { const x = 30 + i * 50; g.fillStyle = `rgba(255,255,200,${0.15 + 0.15 * Math.sin(t * 3 + i)})`; g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 30, h); g.lineTo(x + 30, h); g.fill(); }
        } else {
          rect(g, 0, 0, w, h, '#000');
          for (let x = 0; x < 8; x++) for (let y = 0; y < 6; y++) rect(g, x * 32, y * 32, 31, 31, hsl((x + y) * 40 + t * 120, 80, 20 + 25 * ((x + y + (t * 4 | 0)) % 2)));
          circle(g, w / 2, 24, 14, '#ccc');
          for (let i = 0; i < 12; i++) rect(g, w / 2 - 12 + (i % 4) * 7, 14 + Math.floor(i / 4) * 7, 5, 5, (i + (t * 6 | 0)) % 3 ? '#fff' : '#888');
        }
        // chanteur silhouette
        const sx = w / 2 + Math.sin(t * 2) * 20, sy = 150;
        person(g, sx, sy, 2 + beat * 0.1, { skin: '#000', shirt: '#000', pants: '#000', noFace: true, arm: -2.5 + Math.sin(t * 4) * 0.4, arm2: 0.6, legs: t * 8 });
        // visualiseur
        for (let i = 0; i < 32; i++) {
          const v = (Math.sin(i * 0.7 + t * 6) * 0.5 + 0.5) * (0.4 + 0.6 * hash(i * 13 + (t * 8 | 0))) * (0.6 + beat * 0.4);
          const bh = v * 40;
          rect(g, i * 8, h - bh, 6, bh, hsl(i * 10 + t * 50, 90, 60));
        }
        if (lt < 6) { rect(g, 6, h - 64, 180, 24, 'rgba(0,0,0,0.7)'); drawText(g, '♪ ' + clip.a, 10, h - 61, '#fff'); drawText(g, '« ' + clip.s + ' »', 10, h - 51, '#ff0'); }
        logo(g, w, 'CLIP TV', '#0ff');
      },
    };
  },
};

export function drawTestcard(S, g, w, h, label) {
  rect(g, 0, 0, w, h, '#777');
  for (let x = 0; x < w; x += 16) rect(g, x, 0, 1, h, '#ddd');
  for (let y = 0; y < h; y += 16) rect(g, 0, y, w, 1, '#ddd');
  const cx = w / 2, cy = h / 2;
  circle(g, cx, cy, h * 0.42, '#222');
  g.save(); g.beginPath(); g.arc(cx, cy, h * 0.42 - 2, 0, Math.PI * 2); g.clip();
  const bars = ['#fff', '#ff0', '#0ff', '#0f0', '#f0f', '#f00', '#00f', '#000'];
  const bw = (h * 0.84) / 8;
  bars.forEach((c, i) => rect(g, cx - h * 0.42 + i * bw, cy - h * 0.42, bw + 1, h * 0.36, c));
  for (let i = 0; i < 10; i++) rect(g, cx - h * 0.42 + i * (h * 0.084), cy - h * 0.06, h * 0.084 + 1, h * 0.14, `rgb(${i * 28},${i * 28},${i * 28})`);
  rect(g, cx - h * 0.42, cy + h * 0.08, h * 0.84, h * 0.34, '#333');
  for (let i = 0; i < 20; i++) rect(g, cx - h * 0.4 + i * h * 0.04, cy + h * 0.12, i % 2 ? h * 0.02 : h * 0.02, h * 0.1, '#fff');
  g.restore();
  rect(g, cx - 1, cy - h * 0.45, 2, h * 0.9, '#000');
  rect(g, cx - h * 0.45, cy - 1, h * 0.9, 2, '#000');
  rect(g, cx - 60, cy + 30, 120, 13, '#000');
  drawText(g, label, cx, cy + 33, '#fff', 1, 'center');
  drawText(g, S.time(), cx, cy - h * 0.3, '#000', 1, 'center');
}

export function drawClock(S, g, cx, cy, r, t) {
  circle(g, cx, cy, r + 3, '#335'); circle(g, cx, cy, r, '#eef');
  for (let i = 0; i < 60; i++) {
    const a = i * Math.PI / 30; const big = i % 5 === 0;
    const r1 = r - (big ? 7 : 3);
    rect(g, cx + Math.cos(a) * r1 - 1, cy + Math.sin(a) * r1 - 1, big ? 3 : 1, big ? 3 : 1, '#112');
  }
  const [hh, mm] = (S.time() || '00:00').split(':').map(Number);
  const sec = t % 60;
  const hand = (a, len, wd, col) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); g.stroke(); };
  hand(((hh % 12) + mm / 60) * Math.PI / 6, r * 0.5, 3, '#112');
  hand((mm + sec / 60) * Math.PI / 30, r * 0.78, 2, '#112');
  hand(Math.floor(sec) * Math.PI / 30, r * 0.85, 1, '#d00');
  circle(g, cx, cy, 2, '#d00');
}

function drawAquarium(S, g, w, h, t) {
  grad(g, 0, 0, w, h, '#063a5a', '#021828');
  for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(120,200,255,0.06)'; g.beginPath(); const x = (i * 60 + Math.sin(t * 0.3 + i) * 20); g.moveTo(x, 0); g.lineTo(x + 30, 0); g.lineTo(x - 20, h); g.lineTo(x - 50, h); g.fill(); }
  rect(g, 0, h - 20, w, 20, '#a08850');
  for (let i = 0; i < 12; i++) { const x = i * 22 + 5; for (let k = 0; k < 5; k++) rect(g, x + Math.sin(t * 1.5 + k * 0.8 + i) * 3 * k / 5, h - 20 - k * 8, 3, 8, '#1a7a3a'); }
  for (let i = 0; i < 7; i++) {
    const dir = i % 2 ? 1 : -1, sp = 10 + i * 3;
    const x = ((t * sp * dir + i * 80) % (w + 60) + w + 60) % (w + 60) - 30;
    const y = 40 + i * 18 + Math.sin(t + i) * 6;
    const c = hsl(i * 50 + 10, 80, 55);
    ellipse(g, x, y, 9, 5, c);
    poly(g, [x - dir * 8, y, x - dir * 15, y - 5, x - dir * 15, y + 5], c);
    rect(g, x + dir * 5, y - 2, 1, 1, '#000');
  }
  for (let i = 0; i < 15; i++) { const y = h - ((t * 20 + i * 37) % h); circle(g, 200 + Math.sin(t * 2 + i) * 4, y, 1 + (i % 3), 'rgba(200,240,255,0.5)'); }
  // ombre furtive (rare)
  const k = (t % 97);
  if (k > 60 && k < 63) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(((k - 60) / 3) * w * 1.4 - 60, 0, 60, h); }
  drawTextS(g, 'LES NUITS DE CANAL 9 · AQUARIUM', 6, h - 12, '#9cf');
}

function drawCartoon(S, g, w, h, T) {
  // décor défilant
  grad(g, 0, 0, w, 120, '#6cf', '#bef');
  circle(g, 220, 30, 14, '#ff0');
  const sc = T * 40;
  for (let i = 0; i < 4; i++) { const x = ((i * 90 - sc * 0.3) % 360 + 360) % 360 - 50; circle(g, x, 30 + i * 8, 10, '#fff'); circle(g, x + 12, 28 + i * 8, 13, '#fff'); circle(g, x + 25, 30 + i * 8, 9, '#fff'); }
  for (let i = 0; i < 5; i++) { const x = ((i * 80 - sc * 0.6) % 400 + 400) % 400 - 60; ellipse(g, x, 130, 50, 30, '#5b5'); }
  rect(g, 0, 130, w, h - 130, '#3a3');
  for (let i = 0; i < 20; i++) { const x = ((i * 23 - sc) % 460 + 460) % 460 - 20; rect(g, x, 140 + (i % 3) * 12, 2, 4, '#2a2'); }
  if (T < 4) {
    rect(g, 0, 0, w, h, '#fc3');
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#f93' : '#fc3'; g.beginPath(); g.moveTo(w / 2, h / 2); g.arc(w / 2, h / 2, 200, i * Math.PI / 6 + T, (i + 1) * Math.PI / 6 + T); g.fill(); }
    drawTextS(g, 'PIPO', w / 2, 60, '#fff', 4, 'center', '#a30');
    drawTextS(g, 'LE CHAT', w / 2, 100, '#fff', 2, 'center', '#a30');
    return;
  }
  // papillon
  const bx = 150 + Math.sin(T * 1.3) * 50, by = 80 + Math.sin(T * 2.7) * 20;
  const fl = Math.abs(Math.sin(T * 15));
  ellipse(g, bx - 4, by, 4 * fl + 1, 5, '#f6c'); ellipse(g, bx + 4, by, 4 * fl + 1, 5, '#f6c'); rect(g, bx - 1, by - 3, 2, 6, '#222');
  // Pipo
  const phase = Math.floor((T - 4) / 9) % 4;
  let px = 80, py = 150, jump = 0, dizzy = false;
  const lt = (T - 4) % 9;
  if (phase === 1) jump = Math.max(0, Math.sin(lt * 2.2)) * 40;
  if (phase === 2) { px = 80 + lt * 10; if (lt > 4) { py = 150 + Math.min(40, (lt - 4) * 30); } }
  if (phase === 3) dizzy = lt < 5;
  py -= jump;
  if (phase === 2) { ellipse(g, 130, 152, 22, 5, '#222'); }
  const run = T * 14;
  const c = '#f80';
  ellipse(g, px, py - 14, 14, 10, c);
  circle(g, px + 12, py - 26, 10, c);
  poly(g, [px + 5, py - 33, px + 7, py - 42, px + 12, py - 35], c); poly(g, [px + 14, py - 35, px + 19, py - 42, px + 20, py - 32], c);
  circle(g, px + 9, py - 27, 3, '#fff'); circle(g, px + 16, py - 27, 3, '#fff');
  rect(g, px + 9, py - 27, 2, 2, '#000'); rect(g, px + 16, py - 27, 2, 2, '#000');
  rect(g, px + 12, py - 22, 3, 2, '#f39');
  for (let k = 0; k < 4; k++) rect(g, px - 10 + k * 6, py - 6, 3, 6 + (jump ? 0 : Math.sin(run + k * 2) * 2), c);
  g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(px - 13, py - 16); g.quadraticCurveTo(px - 26, py - 30 + Math.sin(T * 5) * 5, px - 20, py - 40); g.stroke();
  if (dizzy) for (let k = 0; k < 3; k++) { const a = T * 5 + k * 2.1; star(g, px + 12 + Math.cos(a) * 14, py - 44 + Math.sin(a) * 4, 3, '#ff0'); }
  if (phase === 2 && lt > 4) drawTextS(g, 'OUPS !', px, 110, '#fff', 2, 'center', '#000');
  if (phase === 1 && jump > 30) drawTextS(g, 'HOP !', px, 90, '#fff', 2, 'center', '#000');
}
