// Répertoire du domaine public (compositeurs morts avant 1955, œuvres publiées avant 1930 : libres en Europe et aux
// États-Unis), joué par les instruments de music.js. Seules des pièces connues note pour note sont encodées ; quand une
// œuvre est trop longue pour être garantie en entier, seul un passage complet et exact est donné (signalé).
//
// Notation (une chaîne par voix) : hauteur (lettre, altération # ou b, octave ; C4 = do central) suivie de la durée
// w = ronde, h = blanche, q = noire, e = croche, s = double croche, t = triple ; « . » pointé, « 3 » triolet ;
// r = silence ; [C4,E4,G4]q = accord ; « ~ » = liée à la note suivante ; « | » = barre de mesure (le moteur vérifie la
// durée de chaque mesure) ; !p !mf !f = nuance. Les durées sont en temps de noire (m = temps par mesure, pk = levée).
// ch : accords (une mesure par groupe, plusieurs accords séparés par des virgules) pour l'accompagnement des mélodies
// populaires — ces harmonisations simples sont des arrangements, les mélodies sont exactes.

// Bach, Prélude en do majeur BWV 846 (Le Clavier bien tempéré I, 1722) : 35 mesures. Mesures 1–32 : chaque demi-mesure
// = n1 (blanche), n2 (entre à la 2e double croche, tenue), puis n3 n4 n5 n3 n4 n5 en doubles croches.
const BWV846 = [
  'C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5', 'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5', 'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5',
  'A3 C4 E4 G4 C5', 'D3 A3 D4 F#4 C5', 'G3 B3 D4 G4 B4', 'G3 Bb3 E4 G4 C#5', 'F3 A3 D4 A4 D5', 'F3 Ab3 D4 F4 B4', 'E3 G3 C4 G4 C5', 'E3 F3 A3 C4 F4',
  'D3 F3 A3 C4 F4', 'G2 D3 G3 B3 F4', 'C3 E3 G3 C4 E4', 'C3 G3 Bb3 C4 E4', 'F2 F3 A3 C4 E4', 'F#2 C3 A3 C4 Eb4', 'Ab2 F3 B3 C4 D4', 'G2 F3 G3 B3 D4',
  'G2 E3 G3 C4 E4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'G2 Eb3 A3 C4 F#4', 'G2 E3 G3 C4 G4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'C2 C3 G3 Bb3 E4',
];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = (s) => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
function bwv846() {
  const ev = [];
  BWV846.forEach((ch, bar) => {
    const n = ch.split(' ').map(midi);
    for (const h of [0, 2]) {
      const t = bar * 4 + h;
      ev.push([t, 2, n[0], 0.62], [t + 0.25, 1.75, n[1], 0.5]);
      [2, 3, 4, 2, 3, 4].forEach((k, j) => ev.push([t + 0.5 + j * 0.25, 0.3, n[k], j % 3 === 0 ? 0.56 : 0.5]));
    }
  });
  // mesures 33–34 : pédale de do (ronde) + figure descendante ; 35 : accord final
  const tail = [['C3', 'F3 A3 C4 F4 C4 A3 C4 A3 F3 A3 F3 D3 F3 D3'], ['B2', 'G3 B3 D4 F4 D4 B3 D4 B3 G3 B3 D3 F3 E3 D3']];
  tail.forEach(([n2, fig], i) => {
    const t = (32 + i) * 4; ev.push([t, 4, midi('C2'), 0.62], [t + 0.25, 3.75, midi(n2), 0.5]);
    fig.split(' ').forEach((x, j) => ev.push([t + 0.5 + j * 0.25, 0.3, midi(x), 0.5]));
  });
  ['C2', 'C3', 'E4', 'G4', 'C5'].forEach((x, j) => ev.push([34 * 4 + j * 0.06, 4, midi(x), 0.55]));
  return ev;
}

export const REPERTOIRE = {
  // ─────────── pièces classiques ───────────
  bach_prelude: { t: 'Prélude en do majeur, BWV 846', by: 'J.-S. Bach', m: 4, bpm: 68, ev: bwv846(), bars: 35, end: 'rit' },
  fur_elise: { t: 'Für Elise (thème)', by: 'L. van Beethoven', m: 1.5, bpm: 78, pk: 0.5,
    // la reprise (1re fin) puis la 2e fin, conclue sur le la
    v: {
      rh: 'E5s D#5s | E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s G#4s B4s | C5e rs E4s E5s D#5s | E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s C5s B4s | A4e re E5s D#5s '
        + '| E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s G#4s B4s | C5e rs E4s E5s D#5s | E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s C5s B4s | A4q.',
      lh: 'rs rs | re. re. | A2s E3s A3s rs rs rs | E2s E3s G#3s rs rs rs | A2s E3s A3s rs rs rs | re. re. | A2s E3s A3s rs rs rs | E2s E3s G#3s rs rs rs | A2s E3s A3s rs rs rs '
        + '| re. re. | A2s E3s A3s rs rs rs | E2s E3s G#3s rs rs rs | A2s E3s A3s rs rs rs | re. re. | A2s E3s A3s rs rs rs | E2s E3s G#3s rs rs rs | A2s E3s A3s re.',
    }, end: 'rit' },
  ode_joie: { t: 'Ode à la joie (9e symphonie)', by: 'L. van Beethoven', m: 4, bpm: 100,
    v: { mel: 'F#4q F#4q G4q A4q | A4q G4q F#4q E4q | D4q D4q E4q F#4q | F#4q. E4e E4h | F#4q F#4q G4q A4q | A4q G4q F#4q E4q | D4q D4q E4q F#4q | E4q. D4e D4h '
      + '| E4q E4q F#4q D4q | E4q F#4e G4e F#4q D4q | E4q F#4e G4e F#4q E4q | D4q E4q A3h | F#4q F#4q G4q A4q | A4q G4q F#4q E4q | D4q D4q E4q F#4q | E4q. D4e D4h' },
    ch: 'D D,A D D,A D D,A D A,D A,D A,D A,A7 D,A D D,A D A,D', end: 'rit' },
  menuet_sol: { t: 'Menuet en sol majeur, BWV Anh. 114 (mélodie ; basse simplifiée)', by: 'C. Petzold', m: 3, bpm: 112,
    v: {
      mel: 'D5q G4e A4e B4e C5e | D5q G4q G4q | E5q C5e D5e E5e F#5e | G5q G4q G4q | C5q D5e C5e B4e A4e | B4q C5e B4e A4e G4e | F#4q G4e A4e B4e G4e | A4h. '
        + '| D5q G4e A4e B4e C5e | D5q G4q G4q | E5q C5e D5e E5e F#5e | G5q G4q G4q | C5q D5e C5e B4e A4e | B4q C5e B4e A4e G4e | A4q B4e A4e G4e F#4e | G4h.',
      bass: 'G3h A3q | B3h. | C4h. | B3h. | A3h. | G3h. | D4q B3q G3q | D4h D3q | G3h A3q | B3h. | C4h. | B3h. | A3h. | G3h. | C4q D4q D3q | G3h G2q',
    }, end: 'rit' },
  canon: { t: 'Canon en ré (basse obstinée et trois premières variations, en canon)', by: 'J. Pachelbel', m: 4, bpm: 58,
    v: {
      bass: 'D3q A2q B2q F#2q | G2q D2q G2q A2q | '.repeat(6) + 'D2w',
      v1: 'rw | rw | F#5q E5q D5q C#5q | B4q A4q B4q C#5q | D5q C#5q B4q A4q | G4q F#4q G4q E4q | D4e F#4e A4e G4e F#4e D4e F#4e E4e | D4e B3e D4e A4e G4e B4e A4e G4e | F#5q E5q D5q C#5q | B4q A4q B4q C#5q | D5q C#5q B4q A4q | G4q F#4q G4q E4q | F#4w',
      v2: 'rw | rw | rw | rw | F#5q E5q D5q C#5q | B4q A4q B4q C#5q | D5q C#5q B4q A4q | G4q F#4q G4q E4q | D4e F#4e A4e G4e F#4e D4e F#4e E4e | D4e B3e D4e A4e G4e B4e A4e G4e | F#5q E5q D5q C#5q | B4q A4q B4q C#5q | A4w',
      v3: 'rw | rw | rw | rw | rw | rw | F#5q E5q D5q C#5q | B4q A4q B4q C#5q | D5q C#5q B4q A4q | G4q F#4q G4q E4q | D4e F#4e A4e G4e F#4e D4e F#4e E4e | D4e B3e D4e A4e G4e B4e A4e G4e | D5w',
    },
    ch: 'D,A,Bm,F#m G,D,G,A '.repeat(6) + 'D', end: 'rit' },
  roi_montagne: { t: 'Dans l\'antre du roi de la montagne (thème)', by: 'E. Grieg', m: 4, bpm: 96,
    v: { mel: 'B3e C#4e D4e E4e F#4e D4e F#4q | F4e C#4e F4q E4e C4e E4q | B3e C#4e D4e E4e F#4e D4e F#4e B4e | A4e F#4e D4e F#4e A4h' }, loop: 6, accel: 1.9 },
  greensleeves: { t: 'Greensleeves', by: 'traditionnel anglais (XVIe s.)', m: 3, bpm: 96, pk: 1,
    v: { mel: 'A4q | C5h D5q | E5q. F5e E5q | D5h B4q | G4q. A4e B4q | C5h A4q | A4q. G#4e A4q | B4h G#4q | E4h A4q | C5h D5q | E5q. F5e E5q | D5h B4q | G4q. A4e B4q | C5q. B4e A4q | G#4q. F#4e G#4q | A4h. | A4h. '
      + '| G5h. | G5q. F#5e E5q | D5h B4q | G4q. A4e B4q | C5h A4q | A4q. G#4e A4q | B4h G#4q | E4h. | G5h. | G5q. F#5e E5q | D5h B4q | G4q. A4e B4q | C5q. B4e A4q | G#4q. F#4e G#4q | A4h. | A4h.' },
    ch: 'r Am C G Em Am Am E E,E,Am Am C G Em Am E Am Am C Em G Em Am Am E E C Em G Em Am E Am Am', end: 'rit' },
  // ─────────── comptines et chansons traditionnelles françaises ───────────
  clair_lune: { t: 'Au clair de la lune', by: 'traditionnel', m: 4, bpm: 96,
    v: { mel: 'C4q C4q C4q D4q | E4h D4h | C4q E4q D4q D4q | C4w | C4q C4q C4q D4q | E4h D4h | C4q E4q D4q D4q | C4w | D4q D4q D4q D4q | A3h A3h | D4q C4q B3q A3q | G3w | C4q C4q C4q D4q | E4h D4h | C4q E4q D4q D4q | C4w' },
    ch: 'C C,G C,G C C C,G C,G C Dm Am G7 G C C,G C,G C' },
  frere_jacques: { t: 'Frère Jacques', by: 'traditionnel', m: 4, bpm: 104, canon: 2,
    v: { mel: 'C4q D4q E4q C4q | C4q D4q E4q C4q | E4q F4q G4h | E4q F4q G4h | G4e A4e G4e F4e E4q C4q | G4e A4e G4e F4e E4q C4q | C4q G3q C4h | C4q G3q C4h' },
    ch: 'C C C C C C C,G,C,C C,G,C,C' },
  vous_dirai: { t: 'Ah ! vous dirai-je, maman', by: 'traditionnel (1761)', m: 4, bpm: 104,
    v: { mel: 'C4q C4q G4q G4q | A4q A4q G4h | F4q F4q E4q E4q | D4q D4q C4h | G4q G4q F4q F4q | E4q E4q D4h | G4q G4q F4q F4q | E4q E4q D4h | C4q C4q G4q G4q | A4q A4q G4h | F4q F4q E4q E4q | D4q D4q C4h' },
    ch: 'C F,C F,C G7,C C,G7 C,G C,G7 C,G C F,C F,C G7,C' },
  anniversaire: { t: 'Joyeux anniversaire', by: 'M. J. Hill (1893)', m: 3, bpm: 100, pk: 1,
    v: { mel: 'G4e. G4s | A4q G4q C5q | B4h G4e. G4s | A4q G4q D5q | C5h G4e. G4s | G5q E5q C5q | B4q A4q F5e. F5s | E5q C5q D5q | C5h.' },
    ch: 'r C G7 G7 C C7 F C,C,G7 C', end: 'rit' },
  // ─────────── Noël ───────────
  douce_nuit: { t: 'Douce nuit', by: 'F. X. Gruber (1818)', m: 3, bpm: 66,
    v: { mel: 'G4e. A4s G4e E4q. | G4e. A4s G4e E4q. | D5q D5e B4q. | C5q C5e G4q. | A4q A4e C5e. B4s A4e | G4e. A4s G4e E4q. | A4q A4e C5e. B4s A4e | G4e. A4s G4e E4q. | D5q D5e F5e. D5s B4e | C5q. E5q. | C5e. G4s E4e G4e. F4s D4e | C4h.' },
    ch: 'C C G7 C F C F C G7 C C,G7 C', end: 'rit' },
  vive_le_vent: { t: 'Vive le vent (refrain de « Jingle Bells »)', by: 'J. Pierpont (1857)', m: 4, bpm: 116,
    v: { mel: 'E4q E4q E4h | E4q E4q E4h | E4q G4q C4q. D4e | E4w | F4q F4q F4q. F4e | F4q E4q E4q E4e E4e | E4q D4q D4q E4q | D4h G4h | E4q E4q E4h | E4q E4q E4h | E4q G4q C4q. D4e | E4w | F4q F4q F4q. F4e | F4q E4q E4q E4e E4e | G4q G4q F4q D4q | C4w' },
    ch: 'C C C C F C G7 G7 C C C C F C G7 C' },
  we_wish: { t: 'We Wish You a Merry Christmas', by: 'traditionnel anglais', m: 3, bpm: 120, pk: 1,
    v: { mel: 'D4q | G4q G4e A4e G4e F#4e | E4q E4q E4q | A4q A4e B4e A4e G4e | F#4q D4q D4q | B4q B4e C5e B4e A4e | G4q E4q D4e D4e | E4q A4q F#4q | G4h.' },
    ch: 'r G C A7 D B7 Em C,D7,D7 G' },
  deck_halls: { t: 'Deck the Halls (« Nos Galan »)', by: 'traditionnel gallois', m: 4, bpm: 116,
    v: { mel: 'G4q. F4e E4q D4q | C4q D4q E4q C4q | D4e E4e F4e D4e E4q. D4e | C4q B3q C4h | G4q. F4e E4q D4q | C4q D4q E4q C4q | D4e E4e F4e D4e E4q. D4e | C4q B3q C4h '
      + '| D4q. E4e F4q D4q | E4q. F4e G4q D4q | E4e F#4e G4q A4e B4e C5q | B4q A4q G4h | G4q. F4e E4q D4q | C4q D4q E4q C4q | A4e A4e A4e A4e G4q. F4e | E4q D4q C4h' },
    ch: 'C C G7,C C,G7,C,C C C G7,C C,G7,C,C G7 C Am,D7 G C C F,G7 C,G7,C,C' },
};
// où chaque pièce est jouée (pour mémoire ; le choix effectif est fait par les styles de music.js)
export const REPERTOIRE_USES = {
  bach_prelude: ['classical', 'piano_bar'], canon: ['classical', 'hold_music'], ode_joie: ['classical', 'hold_music'],
  menuet_sol: ['classical', 'hold_music', 'music_box', 'music_box_wrong'], greensleeves: ['classical', 'hold_music', 'music_box', 'music_box_wrong'],
  fur_elise: ['classical', 'hold_music', 'creepy_vinyl', 'music_box', 'music_box_wrong'], roi_montagne: ['classical', 'cinema_score'],
  clair_lune: ['music_box', 'music_box_wrong', 'kiddie', 'creepy_vinyl', 'radio_static_voice'], vous_dirai: ['music_box', 'music_box_wrong', 'kiddie', 'creepy_vinyl'],
  frere_jacques: ['kiddie', 'music_box', 'music_box_wrong'], anniversaire: ['music_box', 'music_box_wrong', 'kiddie'],
  douce_nuit: ['xmas', 'music_box', 'music_box_wrong'], vive_le_vent: ['xmas'], we_wish: ['xmas'], deck_halls: ['xmas'],
};
