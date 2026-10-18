// Ambiances sonores : boucles selon le lieu, l'heure, la météo et le stress du joueur ; la nuit, rares bruits lointains.
// Appelé par Environment.update() à chaque image ; le mélange n'est recalculé que 4 fois par seconde (ou au changement
// de lieu) et un volume n'est retouché que s'il change vraiment : quelques µs par image.
// Jour : brouhaha discret là où il y a du monde, ventilation douce, dehors presque rien (une rumeur grave). Nuit : un
// fond « pesant » et intime, comme de l'ASMR, sans musique ni sursaut : ton de salle grave du bâtiment (ressenti plus
// qu'entendu), un souffle d'air tout proche, une couche propre au lieu très en retrait (air d'un immense volume vide et
// verrière dans les galeries, machinerie et tuyaux côté service, chaufferie au sous-sol, béton de la rampe au parking,
// tôle des gaines, matériel du poste de sécurité : l'endroit rassurant, presque silencieux), plus lourd dans le noir
// (néons qui grésillent à la place quand c'est allumé). Au premier plan : les petits bruits du joueur (pas, vêtements,
// lampe, souffle). Le fond s'alourdit au fil de la nuit et surtout avec le stress (dynamics) : quand il se passe quelque
// chose, la tension monte ; au calme, tout redescend. De loin en loin (une à deux fois par minute au calme), un bruit
// doux positionné à 10-40 m (occlusion et réverbération du moteur) : le bâtiment qui travaille, une gaine qui se
// rétracte, un tuyau… ; les bruits secs (porte, choc sourd, coups qui pourraient être des pas) n'arrivent qu'avec la
// tension. Le moteur baisse légèrement l'ambiance pendant qu'un personnage parle (Audio.duck).
// Niveaux visés à la nuit, mesurés par Audio.meter() (sortie, efficace moyen des deux canaux / crête, au calme : 1 h du
// matin, nuit 1, stress nul) : couloir de service ≈ -43 dBFS (crêtes ≈ -29), galerie ≈ -43, poste de sécurité ≈ -54
// (ronronnement à peine perceptible), rampe du parking ≈ -42, toit et parvis ≈ -46 (grondement grave, presque le
// silence), fontaine en marche à 6 m ≈ -34. Jour : poste ≈ -49, galerie ≈ -31, atrium avec la fontaine -30…-32 (selon
// la foule), parvis ≈ -40. Repères : pas du joueur en marchant -32…-38 (crêtes -11), voix proche ≈ -27 (crêtes -7). Le
// stress remonte le fond (jusqu'à +5 dB) et fait passer le cœur et le souffle au premier plan.
const TAU = Math.PI * 2, clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// bruits ponctuels selon le lieu d'où ils viennent : [son, poids]
const SHOTS = {
  gallery: [['amb_glass', 3], ['amb_creak', 2], ['amb_tick', 2], ['amb_door', 0.6], ['amb_thud', 0.5], ['amb_knock', 0.3]],
  service: [['amb_pipe', 2.5], ['amb_tick', 2], ['amb_creak', 1.5], ['amb_door', 1], ['amb_thud', 0.5], ['amb_knock', 0.3]],
  shop: [['amb_creak', 2], ['amb_tick', 2], ['amb_thud', 0.4], ['amb_door', 0.3], ['amb_knock', 0.2]],
  basement: [['amb_pipe', 3], ['amb_tick', 1], ['amb_creak', 1], ['amb_thud', 0.4], ['amb_door', 0.4], ['amb_knock', 0.3]],
  garage: [['amb_creak', 1.5], ['amb_tick', 1], ['amb_door', 0.8], ['amb_thud', 0.4], ['amb_knock', 0.2]],
  warehouse: [['amb_creak', 3], ['amb_tick', 2], ['amb_thud', 0.6], ['amb_door', 0.5], ['amb_knock', 0.25]],
  wet: [['amb_pipe', 3], ['amb_tick', 1], ['amb_creak', 0.5]],
  vent: [['amb_vent', 4], ['amb_tick', 1]],
  out: [['amb_far', 3], ['dog_bark_far', 0.5], ['owl', 0.35]],
};
// par son : hauteur de la source au-dessus du sol de son lieu [min, max] (-1 : sous la verrière), volume de base (niveaux
// reçus mesurés au calme : crêtes ≈ -50…-40 dBFS, -40…-30 quand la tension est au plus haut), distance minimale (m), murs
// tolérés entre la source et l'auditeur (un bruit aigu ne traverse pas les cloisons : inutile de l'y placer ; les sourds,
// si), portée maximale du moteur (m) si élargie
const SPOT = {
  amb_glass: [-1, 0, 0.55, 10, 1], amb_creak: [1.5, 4, 0.46, 10, 3], amb_tick: [2.2, 4, 0.48, 10, 1], amb_thud: [0, 1, 0.27, 18, 3],
  amb_door: [0.2, 1.4, 0.22, 18, 3], amb_pipe: [1.5, 3.5, 0.44, 8, 3], amb_knock: [0, 1, 0.18, 18, 3], water_drip: [0.2, 2.5, 0.5, 4, 1],
  amb_vent: [0, 0, 0.28, 5, 1], amb_far: [-2, 6, 0.5, 60, 9], dog_bark_far: [0, 2, 0.3, 70, 9, 220], owl: [4, 12, 0.25, 40, 9, 220],
};
// bruits secs (porte, choc sourd, coups) : absents au calme, ils n'arrivent qu'avec la tension
const HARSH = { amb_door: 1, amb_thud: 1, amb_knock: 1 };
// famille de bruits d'un lieu (le cinéma, bien que haut comme un atrium, est une boutique)
function cat(z) {
  if (!z) return 'service';
  const t = z.type;
  return z.outdoor ? 'out' : t === 'vent' ? 'vent' : z.shop && t !== 'backroom' ? 'shop' : t === 'atrium' || z.circuit === 'gallery' ? 'gallery'
    : t === 'shop' || t === 'bigstore' || t === 'security' ? 'shop' : t === 'basement' ? 'basement' : t === 'garage' ? 'garage' : t === 'warehouse' ? 'warehouse' : t === 'toilets' ? 'wet' : 'service';
}
function pick(list) {
  let tot = 0; for (const x of list) tot += x[1];
  let r = Math.random() * tot; for (const [n, w] of list) { r -= w; if (r <= 0) return n; }
  return list[0][0];
}

export class Ambience {
  constructor(game, env) { this.game = game; this.env = env; this.ambience = {}; this.vols = {}; this.mixT = 0; this.mixDt = 0; this.key = ''; this.I = null; this.dark = 1; this.shotT = 12 + Math.random() * 12; this.knockT = 60; }
  // boucle 2D d'ambiance : créée au premier volume non nul, fondu de sortie puis arrêt à 0
  amb(name, vol, param) {
    let a = this.ambience[name];
    if (vol <= 0.001) { if (a) { a.stop(1.5); delete this.ambience[name]; delete this.vols[name]; } return; }
    if (!a) { a = this.ambience[name] = this.game.loop(name, null, { volume: 0, bus: 'ambience', param }); this.vols[name] = -1; } // paramètres dès la création (vent grave d'emblée)
    const v0 = this.vols[name]; if (Math.abs(vol - v0) > v0 * 0.03 + 0.0005) { this.vols[name] = vol; a.setVolume(vol, 0.8); } // variation infime : ignorée
    if (param) for (const k in param) a.setParam?.(k, param[k]);
  }
  update(dt, zone, outdoor) {
    const g = this.game, lit = (zone?._level || 0) > 0.3, key = (g.isDay ? 'j' : 'n') + (zone?.id || '-') + (outdoor ? 'o' : '') + this.env.weather; // (la lumière agit en continu : pas de rafale de fondus quand un néon clignote)
    this.mixT -= dt; this.mixDt += dt;
    if (this.mixT <= 0 || key !== this.key) {
      this.key = key; this.mixT = 0.25;
      if (!g.isDay) this.dynamics(this.mixDt, lit);
      this.mixDt = 0;
      const T = g.isDay ? this.dayMix(zone, outdoor) : this.nightMix(zone, outdoor);
      for (const n in this.ambience) if (!T[n]) this.amb(n, 0);
      for (const n in T) this.amb(n, T[n][0], T[n][1]);
    }
    if (!g.isDay && dt > 0) { this.shotT -= dt; this.knockT -= dt; if (this.shotT <= 0) this.shot(zone, outdoor); }
  }
  // intensité 0..1 : avance lentement avec l'heure, la nuit (1 à 10) et le stress, mais reste discrète ; pénombre lissée
  dynamics(dt, lit) {
    const g = this.game, prog = clamp((this.env.nightMinutes || 0) / 480, 0, 1), nk = clamp(((g.night || 1) - 1) / 9, 0, 1), st = clamp((g.player?.stats?.stress || 0) / 100, 0, 1);
    const target = clamp(0.12 + 0.36 * prog + 0.17 * nk + 0.38 * st, 0, 1);
    this.I = this.I == null ? target : this.I + (target - this.I) * (1 - Math.exp(-dt / 8));
    this.dark += ((lit ? 0 : 1) - this.dark) * (1 - Math.exp(-dt / 1.2));
  }
  // journée : clients, ventilation douce ; dehors, une rumeur grave et lointaine (le centre est en ville, pas sur l'autoroute)
  dayMix(zone, outdoor) {
    const g = this.game, t = zone?.type, id = zone?.id || '', w = this.env.weather, T = {}, S = (n, v, p) => { if (v > 0.001) T[n] = [v, p]; };
    const gal = t === 'atrium' || zone?.circuit === 'gallery', svc = !gal && (t === 'corridor' || t === 'backroom');
    S('hvac', !outdoor && t !== 'vent' && g.power?.isOn('hvac') ? (t === 'security' ? 0.016 : svc ? 0.1 : 0.05) : 0); // poste : un souffle à peine
    S('wind', outdoor ? 0.02 + (w === 'storm' ? 0.05 : 0) : t === 'vent' ? 0.03 : 0, { strength: w === 'storm' ? 1 : 0.35, deep: outdoor ? 1 : 0 });
    S('distant_traffic', outdoor ? 0.03 : id === 'entrance' ? 0.015 : id === 'ramp' ? 0.025 : t === 'atrium' ? 0.01 : 0);
    const rain = w === 'rain' || w === 'storm';
    S('rain', rain ? (outdoor ? 0.35 : t === 'atrium' ? 0.2 : zone?.floor === 1 || id === 'entrance' ? 0.1 : 0.03) : 0, { intensity: w === 'storm' ? 1 : 0.5 });
    // brouhaha des clients : seulement là où il y a du monde (galeries, boutiques), discret, et selon le nombre de
    // clients autour de soi (rien au poste, dans les couloirs de service, les réserves ou au parking)
    const crowd = g.story?.crowdLevel || 0;
    if (crowd > 0.01) {
      const shop = t === 'shop' || t === 'bigstore', cg = !shop && gal;
      const place = cg ? 0.08 : shop ? 0.04 : t === 'corridor' || t === 'backroom' ? 0.01 : 0;
      let near = 0; const c = g.camera.position;
      for (const e of g.entities?.list?.values?.() || []) if (e.type === 'shopper' && e.pos && e.pos.distanceTo(c) < 18) near++;
      const k = Math.min(1, near / 5);
      S('crowd', crowd * place * (0.25 + 0.75 * k), { density: crowd * (0.3 + 0.7 * k) });
    }
    S('fluorescent_buzz', zone && zone._level > 0.3 && (svc || t === 'garage' || t === 'basement') ? 0.03 : 0);
    S('electric_hum', t === 'basement' ? 0.07 : 0);
    return T;
  }
  // nuit : ton de salle partout à l'intérieur, couche du lieu, ventilation et néons selon l'électricité, météo
  nightMix(zone, outdoor) {
    // Boucles normalisées (efficace 0,22) : niveau ≈ volume × 0,22 × g du son. Au calme, le grondement du ton de salle
    // domine à peine (≈ -48 dBFS, surtout sous 120 Hz), les couches du lieu restent 6 à 12 dB dessous ; la tension (I)
    // et la pénombre (dk) alourdissent le grondement (×0,75 au calme → ×1,5 quand ça va mal).
    const g = this.game, w = this.env.weather, t = zone?.type || 'corridor', id = zone?.id || '', I = this.I ?? 0.3, dk = this.dark;
    const rainK = w === 'storm' ? 1 : w === 'rain' ? 0.6 : 0, windK = w === 'storm' ? 1 : w === 'rain' ? 0.5 : 0.25, hv = !!g.power?.isOn('hvac');
    const T = {}, S = (n, v, p) => { if (v > 0.001) T[n] = [v, p]; };
    if (outdoor) { // toit, parvis : presque le silence — un souffle grave, la rumeur sourde et lointaine de la ville
      S('wind', 0.01 + (w === 'storm' ? 0.05 : rainK ? 0.01 : 0), { strength: 0.1 + 0.7 * windK, deep: 1 });
      S('city_night', id === 'roof' ? 0.014 : 0.016); S('distant_traffic', id === 'roof' ? 0.007 : 0.01);
      if (rainK) S('rain', 0.3, { intensity: rainK > 0.8 ? 1 : 0.5 });
      if (id === 'roof' && hv) S('hvac', 0.01); // groupes de traitement d'air du toit
      return T;
    }
    const shop = t === 'shop' || t === 'bigstore' || (!!zone?.shop && t !== 'backroom'); // (le cinéma est de type atrium)
    const gal = !shop && (t === 'atrium' || zone?.circuit === 'gallery'), up = t === 'atrium' || zone?.floor === 1;
    const RT = { security: 0.03, vent: 0.06, shop: 0.07, bigstore: 0.075, basement: 0.1, garage: 0.075, warehouse: 0.095, stairs: 0.085, toilets: 0.07 };
    S('room_tone', (id === 'b13' ? 0.25 : shop && t === 'atrium' ? 0.07 : RT[t] ?? 0.075) * (0.6 + 0.9 * I) * (0.65 + 0.35 * dk), { dark: dk, tension: I, air: hv && id !== 'b13' ? 1 : 0.1 }); // allumé : plus doux
    if (gal) { // galeries, atrium, hall : immense volume vide, verrière au-dessus
      S('hall_air', (t === 'atrium' ? 0.022 : 0.018) * (0.8 + 0.2 * dk));
      S('glass_roof', id === 'entrance' ? 0.03 : up ? 0.05 : 0.03, { rain: rainK, wind: windK, muffle: id === 'entrance' ? 0.4 : 0 });
    } else if (shop) { // boutique fermée : la galerie n'arrive qu'étouffée
      S('glass_roof', rainK ? 0.05 : 0.016, { rain: rainK, wind: windK, muffle: 1 });
      if (t === 'bigstore') { S('hall_air', 0.014); S('fridge_hum', 0.016); } // vitrines réfrigérées qui tournent toute la nuit
    } else if (t === 'security') S('equipment_hum', 0.014); // l'endroit rassurant : le ronronnement du matériel, à peine perceptible
    else if (t === 'basement') { S('boiler_room', id === 'boiler' ? 0.05 : id === 'generator' ? 0.012 : 0.022); S('electric_hum', id === 'electrical' || id === 'generator' ? 0.02 : 0.009); }
    else if (t === 'garage') {
      S('garage_air', 0.028); S('distant_traffic', id === 'ramp' ? 0.016 : 0.006);
      if (id === 'ramp') { S('wind', 0.01, { strength: 0.25 + 0.6 * windK, deep: 1 }); if (rainK) S('rain', 0.12, { intensity: rainK }); }
    } else if (t === 'vent') S('vent_air', 0.045);
    else if (t === 'warehouse') { S('service_hum', 0.02); S('hall_air', 0.016); S('wind', 0.005, { strength: windK, deep: 1 }); }
    else if (id !== 'b13') S('service_hum', t === 'toilets' || t === 'stairs' ? 0.018 : 0.028); // couloirs de service, réserves (B-13 : rien que le grondement)
    if (hv && t !== 'vent' && t !== 'security' && id !== 'b13') S('hvac', (t === 'corridor' && !gal) || t === 'backroom' ? 0.012 : 0.008);
    if (t !== 'security' && t !== 'vent' && t !== 'atrium') S('fluorescent_buzz', (shop ? 0.012 : 0.016) * (1 - dk) * (1 - dk)); // néons allumés : leur grésillement à la place du poids
    if (rainK && !gal && !shop && t !== 'garage') S('rain', (zone?.floor === 1 ? 0.025 : 0.012) * rainK, { intensity: rainK });
    return T;
  }
  // un bruit lointain, positionné : choisi selon le lieu d'où il vient, la distance et les murs qui l'en séparent ;
  // rare et doux au calme (40-100 s), plus fréquent et plus présent avec la tension (15-35 s) ; bien plus rare et plus
  // discret au poste de sécurité et dehors
  shot(zone, outdoor) {
    const g = this.game, W = g.world, I = this.I ?? 0.3, cam = g.camera.position, sec = zone?.id === 'security', lc = cat(zone);
    const walls = (x, y, z) => { try { return W.physics.countWalls([cam.x, cam.y, cam.z], [x, y, z], 3); } catch (e) { return 0; } };
    this.shotT = clamp((80 - 62 * I) * (0.6 + 0.9 * Math.random()) * (sec ? 2.5 : outdoor ? 2.2 : 1), 10, 150);
    let name = null, x = 0, y = 0, z = 0;
    if (lc === 'vent') { // dans la gaine : quelques mètres plus loin dans le conduit
      const d = (5 + 9 * Math.random()) * (Math.random() < 0.5 ? -1 : 1);
      x = cam.x; y = cam.y; z = cam.z;
      if (zone.max[0] - zone.min[0] > zone.max[2] - zone.min[2]) x = clamp(x + d, zone.min[0] + 0.5, zone.max[0] - 0.5); else z = clamp(z + d, zone.min[2] + 0.5, zone.max[2] - 0.5);
      name = pick(SHOTS.vent);
    } else if (outdoor) { // la ville, au loin
      name = pick(SHOTS.out); const S = SPOT[name], a = Math.random() * TAU, d = S[3] + (name === 'owl' ? 50 : 70) * Math.random();
      x = cam.x + Math.cos(a) * d; z = cam.z + Math.sin(a) * d; y = cam.y - 1.6 + S[0] + (S[1] - S[0]) * Math.random();
    } else if ((lc === 'basement' || lc === 'garage' || lc === 'wet') && Math.random() < 0.35) { // une goutte, pas loin et à vue
      for (let i = 0; i < 6 && !name; i++) {
        const a = Math.random() * TAU, d = 4 + 10 * Math.random(); x = cam.x + Math.cos(a) * d; z = cam.z + Math.sin(a) * d; y = cam.y - 1.4 + 2.3 * Math.random();
        const s = W.zoneAt(x, y, z); if (s && !s.outdoor && s.type !== 'vent' && walls(x, y, z) <= 1) name = 'water_drip';
      }
    } else { // ailleurs dans le bâtiment (parfois l'étage au-dessus ou en dessous)
      let s = null, d = 0;
      for (let i = 0; i < 6 && !s; i++) {
        const a = Math.random() * TAU, r = Math.random(); d = 10 + 30 * Math.pow(Math.random(), 0.7);
        x = cam.x + Math.cos(a) * d; z = cam.z + Math.sin(a) * d; y = cam.y - 1.3 + (r < 0.12 ? 5 : r < 0.2 ? -4.5 : 0) + 2.6 * Math.random();
        s = W.zoneAt(x, y, z); if (s && (s.outdoor || s.type === 'vent')) s = null;
      }
      if (!s) { this.shotT = 3; return; }
      const hk = clamp((I - 0.3) / 0.35, 0, 1), w = walls(x, y, z);
      const list = SHOTS[cat(s)].filter(([n]) => { const S = SPOT[n]; return d >= S[3] && w <= S[4] && (!HARSH[n] || hk > 0) && (n !== 'amb_knock' || (I >= 0.45 && this.knockT <= 0)); }).map(([n, p]) => [n, HARSH[n] ? p * hk : p]);
      if (!list.length) { this.shotT = 3; return; }
      name = pick(list);
      const S = SPOT[name], fl = s.void ? clamp(y - 1.3, s.min[1], s.max[1] - 2) : s.min[1];
      y = S[0] < 0 ? Math.max(s.max[1], 10) - 0.4 : clamp(fl + S[0] + (S[1] - S[0]) * Math.random(), s.min[1] + 0.1, s.max[1] - 0.2);
      if (S[4] < 3 && walls(x, y, z) > S[4]) { // à sa hauteur (sous la verrière, au plafond), le son aigu passerait derrière une dalle
        const lo = list.filter(([n]) => SPOT[n][4] >= 3); if (!lo.length) { this.shotT = 3; return; }
        name = pick(lo); const T = SPOT[name]; y = clamp(fl + T[0] + (T[1] - T[0]) * Math.random(), s.min[1] + 0.1, s.max[1] - 0.2);
      }
      if (name === 'amb_knock') this.knockT = 150 + 150 * Math.random(); // très rare
    }
    if (!name) return;
    const S = SPOT[name], vol = S[2] * (0.25 + 0.8 * I) * (sec ? 0.35 : outdoor ? 0.5 : 1) * (0.8 + 0.4 * Math.random());
    g.sfx(name, { x, y, z }, S[5] ? { volume: vol, bus: 'ambience', late: 4, maxDist: S[5], ref: 10 } : { volume: vol, bus: 'ambience', late: 4 }); // late : peu importe qu'il parte en retard
  }
}
