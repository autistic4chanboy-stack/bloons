// Écrans système : éteint, écran bleu, neige, caméra hors ligne, démarrage console, caisse, DAB.
import { drawText, drawTextS, textWidth } from './font.js';
import { rect, frame, circle, drawNoise, hash, grad, poly, hsl, star, rng, clamp } from './util.js';

export const BASIC = {
  off: (S) => ({ title: 'Éteint', update() { rect(S.g, 0, 0, S.w, S.h, '#000'); } }),

  blue: (S) => ({
    title: 'Entrée vidéo AV1',
    update() {
      const { g, w, h } = S;
      rect(g, 0, 0, w, h, '#0018c8');
      drawText(g, 'AV1', w - 12, 10, '#fff', 2, 'right');
      if (S.t < 4) drawText(g, 'PAS DE SIGNAL', w / 2, h / 2 - 4, '#fff', 1, 'center');
      drawText(g, '■', 12, 10, '#fff');
      drawText(g, 'STOP', 22, 10, '#fff');
    },
  }),

  static: (S) => ({
    title: 'Neige',
    update() {
      const { g, w, h } = S;
      drawNoise(g, w, h, S.t);
      // barres roulantes
      for (let i = 0; i < 2; i++) {
        const y = ((S.t * (25 + i * 17) + i * 80) % (h + 40)) - 20;
        g.fillStyle = i ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.35)';
        g.fillRect(0, y, w, 14 + i * 8);
      }
    },
  }),

  cctv_offline: (S) => ({
    title: 'Caméra hors ligne',
    update() {
      const { g, w, h } = S;
      rect(g, 0, 0, w, h, '#050805');
      drawNoise(g, w, h, S.t, 0.18);
      const cam = S.opts.cam || ('CAM ' + String(S.opts.camIndex || 13).padStart(2, '0'));
      drawText(g, cam, 8, 8, '#8f8');
      drawText(g, S.time(), w - 8, 8, '#8f8', 1, 'right');
      if ((S.t * 1.5 | 0) % 2 === 0) {
        rect(g, w / 2 - 70, h / 2 - 16, 140, 30, '#000');
        frame(g, w / 2 - 70, h / 2 - 16, 140, 30, '#f33');
        drawText(g, 'SIGNAL PERDU', w / 2, h / 2 - 9, '#f33', 2, 'center');
      }
      drawText(g, 'VÉRIFIER LA CONNEXION', w / 2, h - 20, '#6a6', 1, 'center');
    },
  }),

  boot: (S, id) => {
    const style = { famicube: 0, hyperdrive: 1, playbox: 2 }[id] ?? (hash(id ? id.length : 3) * 3 | 0);
    const names = ['FAMICUBE', 'HYPERDRIVE', 'PLAYBOX'];
    const name = id && !['famicube', 'hyperdrive', 'playbox'].includes(id) ? id.toUpperCase() : names[style];
    return {
      title: 'Démarrage ' + name,
      update() {
        const { g, w, h } = S;
        const t = S.t % 10;
        if (style === 0) {
          rect(g, 0, 0, w, h, '#000');
          const y = Math.min(h / 2 - 10, -20 + t * 60);
          drawText(g, name, w / 2, y, '#bbb', 3, 'center');
          if (t > 2) drawText(g, '®', w / 2 + 75, y, '#bbb');
          if (t > 3) drawText(g, 'Licencié par Famicube Corp.', w / 2, h / 2 + 30, '#888', 1, 'center');
          if (t > 5 && (S.t * 2 | 0) % 2) drawText(g, 'INSÉREZ UNE CARTOUCHE', w / 2, h - 30, '#fff', 1, 'center');
        } else if (style === 1) {
          rect(g, 0, 0, w, h, '#000');
          const x = Math.max(w / 2, w + 100 - t * 300);
          const sweep = clamp((t - 1.2) * 0.8, 0, 1);
          drawText(g, name, x, h / 2 - 14, `rgb(${40 + sweep * 60},${100 + sweep * 100},255)`, 3, 'center');
          if (t > 1.2 && t < 2.2) rect(g, w / 2 - 100 + (t - 1.2) * 200, h / 2 - 20, 6, 30, 'rgba(255,255,255,0.8)');
          if (t > 2.5) drawText(g, 'PRODUIT SOUS LICENCE', w / 2, h / 2 + 20, '#fff', 1, 'center');
          if (t > 6) drawText(g, 'CARTOUCHE ABSENTE', w / 2, h - 30, '#f66', 1, 'center');
        } else {
          grad(g, 0, 0, w, h, '#000', t > 3 ? '#112' : '#000');
          const n = 6;
          for (let i = 0; i < n; i++) {
            const a = t * 1.5 + i * Math.PI * 2 / n;
            const r = Math.max(10, 60 - t * 10);
            const x = w / 2 + Math.cos(a) * r, y = h / 2 - 10 + Math.sin(a) * r * 0.5;
            rect(g, x - 5, y - 5, 10, 10, hsl(i * 60 + t * 40, 70, 55));
          }
          if (t > 4) drawText(g, name, w / 2, h / 2 + 34, '#fff', 2, 'center');
          if (t > 6) drawText(g, 'Computer Entertainment', w / 2, h / 2 + 56, '#aaa', 1, 'center');
        }
      },
    };
  },

  pos: (S) => {
    const shop = S.opts.label || S.opts.shop || 'HÉLIOS';
    const r = rng((S.opts.seed || 7) * 31 + shop.length);
    const items = ['ART. DIVERS', 'PILES LR6 X4', 'SAC CABAS', 'CARTE CADEAU', 'BONBONS', 'T-SHIRT', 'CÂBLE HDMI', 'SAVON', 'JOUET', 'CAFÉ', 'BOUGIE', 'CAHIER'];
    const tickets = [];
    for (let i = 0; i < 7; i++) tickets.push([items[(r() * items.length) | 0], (r() * 45 + 1).toFixed(2).replace('.', ',')]);
    const nt = 40 + ((r() * 60) | 0);
    const day = (2000 + r() * 4000).toFixed(2).replace('.', ',');
    return {
      title: 'Terminal de caisse',
      update() {
        const { g, w, h } = S;
        rect(g, 0, 0, w, h, '#031a10');
        rect(g, 0, 0, w, 14, '#0b5');
        drawText(g, 'CAISSE 02 · ' + shop.toUpperCase().slice(0, 22), 4, 4, '#021', 1);
        drawText(g, S.time(), w - 4, 4, '#021', 1, 'right');
        drawText(g, 'DERNIERS ARTICLES', 6, 20, '#5f9');
        tickets.forEach((tk, i) => {
          drawText(g, tk[0], 10, 32 + i * 10, '#3d7');
          drawText(g, tk[1] + ' €', w - 10, 32 + i * 10, '#3d7', 1, 'right');
        });
        rect(g, 6, 106, w - 12, 1, '#3d7');
        drawText(g, 'TOTAL JOURNÉE', 10, 112, '#9fc');
        drawText(g, day + ' €', w - 10, 112, '#9fc', 1, 'right');
        drawText(g, 'TICKETS : ' + nt, 10, 124, '#3d7');
        rect(g, 6, 140, w - 12, 30, '#062');
        if ((S.t * 1.2 | 0) % 2 === 0) drawText(g, 'CAISSE FERMÉE', w / 2, 146, '#ff6', 2, 'center');
        drawText(g, 'TIROIR VERROUILLÉ · CODE GÉRANT REQUIS', w / 2, 178, '#2a6', 1, 'center');
      },
    };
  },

  atm: (S) => ({
    title: 'Distributeur de billets',
    update() {
      const { g, w, h } = S;
      grad(g, 0, 0, w, h, '#0a2a6a', '#041030');
      rect(g, 0, 0, w, 22, '#e8b020');
      drawText(g, 'BANQUE HÉLIOS', w / 2, 6, '#102040', 2, 'center');
      circle(g, w / 2, 70, 22, '#a33');
      rect(g, w / 2 - 14, 66, 28, 8, '#fff');
      drawText(g, 'HORS SERVICE', w / 2, 102, '#fff', 2, 'center');
      drawText(g, 'LA NUIT', w / 2, 122, '#fff', 2, 'center');
      drawText(g, 'Service disponible de 7h00 à 22h00', w / 2, 148, '#acf', 1, 'center');
      drawText(g, 'Veuillez nous excuser.', w / 2, 160, '#acf', 1, 'center');
      drawText(g, S.time(), w - 6, h - 12, '#fff', 1, 'right');
      if ((S.t | 0) % 2) rect(g, 6, h - 12, 6, 6, '#f33');
    },
  }),
};
