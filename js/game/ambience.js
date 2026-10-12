// Ambiances sonores : boucles selon le lieu, l'heure, la météo et le stress du joueur ; la nuit, rares bruits lointains.
// Appelé par Environment.update() à chaque image ; le mélange n'est recalculé que 4 fois par seconde (ou au changement
// de lieu) et un volume n'est retouché que s'il change vraiment : quelques µs par image.
// Jour : brouhaha, ventilation, extérieur (inchangé). Nuit : un fond « pesant » à la Phasmophobia, en moins violent,
// sans musique ni sursaut : ton de salle grave du bâtiment (ressenti plus qu'entendu), une couche propre au lieu (air
// d'un immense volume vide et verrière dans les galeries, machinerie et tuyaux côté service, chaufferie au sous-sol,
// béton et vent de la rampe au parking, tôle des gaines, matériel du poste de sécurité : l'endroit rassurant), plus
// lourd dans le noir (néons qui grésillent à la place quand c'est allumé), qui s'alourdit doucement au fil de la nuit
// et avec le stress. De loin en loin, un bruit ponctuel positionné à 10-40 m (occlusion et réverbération du moteur) :
// le bâtiment qui travaille, une gaine qui se rétracte, un coup de bélier, une porte au loin… et, très rarement, des
// coups sourds irréguliers qui pourraient être des pas.
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
// reçus mesurés : crêtes ≈ -40…-30 dBFS), distance minimale (m), murs tolérés entre la source et l'auditeur (un bruit
// aigu ne traverse pas les cloisons : inutile de l'y placer ; les sourds, si), portée maximale du moteur (m) si élargie
const SPOT = {
  amb_glass: [-1, 0, 0.82, 10, 1], amb_creak: [1.5, 4, 0.57, 10, 3], amb_tick: [2.2, 4, 0.6, 10, 1], amb_thud: [0, 1, 0.33, 18, 3],
  amb_door: [0.2, 1.4, 0.28, 18, 3], amb_pipe: [1.5, 3.5, 0.55, 8, 3], amb_knock: [0, 1, 0.2, 18, 3], water_drip: [0.2, 2.5, 0.7, 4, 1],
  amb_vent: [0, 0, 0.35, 5, 1], amb_far: [-2, 6, 0.9, 60, 9], dog_bark_far: [0, 2, 0.5, 70, 9, 220], owl: [4, 12, 0.35, 40, 9, 220],
};
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
    if (!a) { a = this.ambience[name] = this.game.loop(name, null, { volume: 0, bus: 'ambience' }); this.vols[name] = -1; }
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
  // journée (inchangée) : clients, ventilation, extérieur
  dayMix(zone, outdoor) {
    const g = this.game, t = zone?.type, w = this.env.weather, T = {}, S = (n, v, p) => { if (v > 0.001) T[n] = [v, p]; };
    S('hvac', !outdoor && t !== 'vent' && g.power?.isOn('hvac') ? (t === 'corridor' || t === 'backroom' ? 0.18 : 0.08) : 0);
    S('wind', outdoor ? 0.4 + (w === 'storm' ? 0.4 : 0) : t === 'vent' ? 0.08 : 0, { strength: w === 'storm' ? 1 : 0.4 });
    S('distant_traffic', outdoor || zone?.id === 'entrance' || zone?.id === 'ramp' ? 0.25 : t === 'atrium' ? 0.04 : 0);
    const rain = w === 'rain' || w === 'storm';
    S('rain', rain ? (outdoor ? 0.7 : t === 'atrium' ? 0.35 : zone?.floor === 1 || zone?.id === 'entrance' ? 0.15 : 0.05) : 0, { intensity: w === 'storm' ? 1 : 0.5 });
    S('crowd', g.story?.crowdLevel ? g.story.crowdLevel * (t === 'corridor' || t === 'atrium' ? 0.5 : 0.25) : 0, { density: g.story?.crowdLevel || 0 });
    S('fluorescent_buzz', zone && zone._level > 0.3 && (t === 'corridor' || t === 'backroom' || t === 'garage' || t === 'basement') ? 0.06 : 0);
    S('electric_hum', t === 'basement' ? 0.15 : 0);
    return T;
  }
  // nuit : ton de salle partout à l'intérieur, couche du lieu, ventilation et néons selon l'électricité, météo
  nightMix(zone, outdoor) {
    // niveaux visés (efficace par canal, nuit moyenne, pénombre) : grondement ≈ -34 dBFS, couches du lieu -36…-46 dBFS,
    // poste de sécurité ≈ -42 dBFS. Boucles normalisées (efficace 0,22) : volume = niveau / (0,22 × g du son)
    const g = this.game, w = this.env.weather, t = zone?.type || 'corridor', id = zone?.id || '', I = this.I ?? 0.3, dk = this.dark;
    const rainK = w === 'storm' ? 1 : w === 'rain' ? 0.6 : 0, windK = w === 'storm' ? 1 : w === 'rain' ? 0.5 : 0.25, hv = !!g.power?.isOn('hvac');
    const T = {}, S = (n, v, p) => { if (v > 0.001) T[n] = [v, p]; };
    if (outdoor) { // toit, parking extérieur : vent, rumeur de la ville
      S('wind', 0.3 + (w === 'storm' ? 0.3 : 0), { strength: 0.15 + 0.85 * windK });
      S('city_night', id === 'roof' ? 0.12 : 0.16); S('distant_traffic', id === 'roof' ? 0.1 : 0.2);
      if (rainK) S('rain', 0.6, { intensity: rainK > 0.8 ? 1 : 0.5 });
      if (id === 'roof' && hv) S('hvac', 0.05); // groupes de traitement d'air du toit
      return T;
    }
    const shop = t === 'shop' || t === 'bigstore' || (!!zone?.shop && t !== 'backroom'); // (le cinéma est de type atrium)
    const gal = !shop && (t === 'atrium' || zone?.circuit === 'gallery'), up = t === 'atrium' || zone?.floor === 1;
    const RT = { security: 0.15, vent: 0.22, shop: 0.3, bigstore: 0.32, basement: 0.42, garage: 0.36, warehouse: 0.4, stairs: 0.36, toilets: 0.3 };
    S('room_tone', (id === 'b13' ? 0.5 : shop && t === 'atrium' ? 0.3 : RT[t] ?? 0.34) * (0.85 + 0.3 * I) * (0.65 + 0.35 * dk), { dark: dk, tension: I, air: hv && id !== 'b13' ? 1 : 0.1 }); // allumé : plus doux
    if (gal) { // galeries, atrium, hall : immense volume vide, verrière au-dessus
      S('hall_air', (t === 'atrium' ? 0.08 : 0.064) * (0.8 + 0.2 * dk));
      S('glass_roof', id === 'entrance' ? 0.12 : up ? 0.2 : 0.12, { rain: rainK, wind: windK, muffle: id === 'entrance' ? 0.4 : 0 });
    } else if (shop) { // boutique fermée : la galerie n'arrive qu'étouffée
      S('glass_roof', rainK ? 0.12 : 0.06, { rain: rainK, wind: windK, muffle: 1 });
      if (t === 'bigstore') { S('hall_air', 0.04); S('fridge_hum', 0.055); } // vitrines réfrigérées qui tournent toute la nuit
    } else if (t === 'security') S('equipment_hum', 0.08); // l'endroit rassurant : le ronronnement stable du matériel
    else if (t === 'basement') { S('boiler_room', id === 'boiler' ? 0.13 : id === 'generator' ? 0.03 : 0.065); S('electric_hum', id === 'electrical' || id === 'generator' ? 0.058 : 0.03); }
    else if (t === 'garage') {
      S('garage_air', 0.117); S('distant_traffic', id === 'ramp' ? 0.18 : 0.03);
      if (id === 'ramp') { S('wind', 0.1, { strength: 0.3 + 0.7 * windK }); if (rainK) S('rain', 0.25, { intensity: rainK }); }
    } else if (t === 'vent') S('vent_air', 0.144);
    else if (t === 'warehouse') { S('service_hum', 0.06); S('hall_air', 0.05); S('wind', 0.03, { strength: windK }); }
    else if (id !== 'b13') S('service_hum', t === 'toilets' || t === 'stairs' ? 0.07 : 0.115); // couloirs de service, réserves (B-13 : rien que le grondement)
    if (hv && t !== 'vent' && t !== 'security' && id !== 'b13') S('hvac', (t === 'corridor' && !gal) || t === 'backroom' ? 0.045 : 0.032);
    if (t !== 'security' && t !== 'vent' && t !== 'atrium') S('fluorescent_buzz', (shop ? 0.035 : 0.05) * (1 - dk) * (1 - dk)); // néons allumés : leur grésillement à la place du poids
    if (rainK && !gal && !shop && t !== 'garage') S('rain', (zone?.floor === 1 ? 0.05 : 0.025) * rainK, { intensity: rainK });
    return T;
  }
  // un bruit lointain, positionné : choisi selon le lieu d'où il vient, la distance et les murs qui l'en séparent ;
  // plus fréquent quand la nuit avance (8-45 s), plus rare et plus discret au poste de sécurité
  shot(zone, outdoor) {
    const g = this.game, W = g.world, I = this.I ?? 0.3, cam = g.camera.position, sec = zone?.id === 'security', lc = cat(zone);
    const walls = (x, y, z) => { try { return W.physics.countWalls([cam.x, cam.y, cam.z], [x, y, z], 3); } catch (e) { return 0; } };
    this.shotT = clamp((36 - 24 * I) * (0.55 + 0.9 * Math.random()) * (sec ? 1.6 : 1), 8, 45);
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
      const w = walls(x, y, z), list = SHOTS[cat(s)].filter(([n]) => { const S = SPOT[n]; return d >= S[3] && w <= S[4] && (n !== 'amb_knock' || (I >= 0.45 && this.knockT <= 0)); });
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
    const S = SPOT[name], vol = S[2] * (0.7 + 0.45 * I) * (sec ? 0.55 : 1) * (0.8 + 0.4 * Math.random());
    g.sfx(name, { x, y, z }, S[5] ? { volume: vol, bus: 'ambience', late: 4, maxDist: S[5], ref: 10 } : { volume: vol, bus: 'ambience', late: 4 }); // late : peu importe qu'il parte en retard
  }
}
