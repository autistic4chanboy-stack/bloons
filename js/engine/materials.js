// Bibliothèque de matériaux PBR. Chaque matériau peut être « cloné par zone » : la zone injecte une lumière
// ambiante (zoneLight) dans le shader, ce qui permet d'éclairer un magasin entier pour le prix d'un uniform,
// en complément des quelques vraies lumières dynamiques (pool) proches du joueur. Le patch de zone ajoute :
//  - une ambiance hémisphérique (lumière venue des plafonds : sols plus éclairés que les plafonds) ;
//  - les reflets d'une carte d'environnement procédurale (PMREM d'une galerie éclairée), dosés par la lumière de la
//    zone : une zone éteinte ne renvoie aucun reflet, seule la lampe torche y fait briller les surfaces ;
//  - la lumière qui entre par les ouvertures déclarées (verrière : lune ou soleil, façade vitrée : lampadaires), avec
//    une ombre analytique (rayon vers la source à travers le rectangle de l'ouverture) — voir APERTURES ci-dessous ;
//  - en alpha (matériaux opaques), la part DIRECTE de l'éclairage : le post-traitement n'assombrit par l'occlusion
//    ambiante (SSAO) que la part ambiante (1 - alpha). Les matériaux non patchés écrivent alpha = 1 : pas de SSAO ;
//  - un masque par lumière du pool : une lampe de zone n'éclaire que la boîte de sa zone (+ un fondu), elle ne traverse
//    plus les murs (le poste de sécurité n'éclaire plus le plafond de la galerie). L'emplacement du pool est codé dans
//    le decay de la PointLight (1,6 + n × 0,001), indépendant de l'ordre des lumières dans le shader.
// irBoost (global) éclaire toute la scène pendant le rendu des caméras infrarouges.
import * as THREE from 'three';
import * as TX from './textures.js';

// Ouvertures lumineuses (4 au plus), remplies par l'environnement (js/game/environment.js) :
//  apA = (axe du plan : 0 = horizontal y, 1 = plan x, 2 = plan z ; coordonnée du plan ; y d'une dalle percée à
//         traverser aussi, -1e4 sinon ; décalage des montants en u). Les trémies de cette dalle sont apHoles (6 rectangles
//         x0, z0, x1, z1 au plus, communs à toutes les ouvertures ; un rectangle vide = x0 > x1)
//  apB = rectangle (u0, v0, u1, v1) dans le plan (plan y : x,z ; plan x : z,y ; plan z : x,y)
//  apC = boîte des surfaces éclairables : min (x, y, z) + flou des bords (m) ; apD = max (x, y, z) + pas des montants en u
//  apL = direction VERS la source (normalisée) + largeur des montants (m) ; apE = couleur × intensité + pas des montants en v
const v4 = (n = 4) => Array.from({ length: n }, () => new THREE.Vector4());
export const NUM_APERTURES = 4, POOL_SIZE = 8;
export const GLOBAL_UNIFORMS = {
  irBoost: { value: 0 },
  uvPos: { value: new THREE.Vector3() }, uvDir: { value: new THREE.Vector3(0, 0, -1) }, uvCos: { value: 0.9 }, uvOn: { value: 0 },
  time: { value: 0 },
  envZoneK: { value: 0.6 },           // intensité des reflets d'environnement par unité de lumière de zone (0 en qualité basse)
  hemiMid: { value: 0.82 }, hemiAmp: { value: 0.3 }, // ambiance de zone : sol = mid + amp, mur = mid, plafond = mid - amp
  apA: { value: v4() }, apB: { value: v4() }, apC: { value: v4() }, apD: { value: v4() }, apL: { value: v4() }, apE: { value: v4() },
  apHoles: { value: v4(6).map((v) => v.set(1e4, 1e4, -1e4, -1e4)) },
  poolMin: { value: v4(POOL_SIZE) }, poolMax: { value: v4(POOL_SIZE) }, // boîte (xyz) ; min.w = 1 si masquée, max.w = fondu (m)
};
// Carte d'environnement partagée (PMREM), créée par initEnvironment(renderer) au démarrage du moteur de rendu ;
// le moteur sert aussi à envoyer les textures procédurales au GPU dès leur création (leurs pixels CPU sont alors libérés)
export const ENV = { map: null, renderer: null };

const PATCH_PARS = /* glsl */`
uniform vec3 zoneLight;
uniform float irBoost, envZoneK, hemiMid, hemiAmp;
uniform vec4 apA[ 4 ], apB[ 4 ], apC[ 4 ], apD[ 4 ], apL[ 4 ], apE[ 4 ], apHoles[ 6 ], poolMin[ 8 ], poolMax[ 8 ];
float apMask( vec2 p, vec4 r, float s ) { vec2 a = smoothstep( r.xy - s, r.xy + s, p ) * ( 1.0 - smoothstep( r.zw - s, r.zw + s, p ) ); return a.x * a.y; }
float apBars( float u, float pitch, float off, float w ) { if ( pitch <= 0.0 ) return 1.0; float f = abs( fract( ( u + off ) / pitch + 0.5 ) - 0.5 ) * pitch; return smoothstep( w * 0.5, w * 0.5 + 0.03, f ); }
`;
// reflets d'environnement (spéculaire seulement, l'ambiance diffuse vient de la zone) dosés par la lumière de zone
const PATCH_MAPS = /* glsl */`
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	if ( envZoneK > 0.0 && zoneLight.r + zoneLight.g + zoneLight.b > 0.0 ) // zone éteinte ou qualité basse : pas de lecture
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) * zoneLight * envZoneK;
#endif
`;
const PATCH_LIGHTS = /* glsl */`
{
	vec3 wN = ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz;
	#if defined( RE_IndirectDiffuse )
	irradiance += zoneLight * ( hemiMid + hemiAmp * wN.y ) + vec3( irBoost );
	#endif
	// ouvertures : au plus une concerne un fragment donné en pratique (boîtes disjointes) → un seul appel de RE_Direct
	vec3 apCol = vec3( 0.0 ), apDir = vec3( 0.0 );
	for ( int i = 0; i < 4; i ++ ) {
		vec3 apc = apE[ i ].rgb;
		if ( apc.r + apc.g + apc.b <= 0.0 ) continue;
		if ( any( lessThan( wPos0, apC[ i ].xyz ) ) || any( greaterThan( wPos0, apD[ i ].xyz ) ) ) continue;
		vec3 L = apL[ i ].xyz;
		if ( dot( wN, L ) <= 0.0 ) continue;
		float ax = apA[ i ].x;
		float lc = ax < 0.5 ? L.y : ( ax < 1.5 ? L.x : L.z );
		float t = ( apA[ i ].y - ( ax < 0.5 ? wPos0.y : ( ax < 1.5 ? wPos0.x : wPos0.z ) ) ) / lc;
		if ( t <= 0.0 ) continue;
		vec3 h = wPos0 + L * t;
		vec2 q = ax < 0.5 ? h.xz : ( ax < 1.5 ? h.zy : h.xy );
		float m = apMask( q, apB[ i ], apC[ i ].w ) * apBars( q.x, apD[ i ].w, apA[ i ].w, apL[ i ].w ) * apBars( q.y, apE[ i ].w, 0.0, apL[ i ].w );
		if ( apA[ i ].z > -1000.0 && wPos0.y < apA[ i ].z - 0.05 ) { // sous la dalle : le rayon doit passer par une trémie
			vec2 qs = ( wPos0 + L * ( ( apA[ i ].z - wPos0.y ) / L.y ) ).xz; float hm = 0.0;
			for ( int k = 0; k < 6; k ++ ) hm = max( hm, apMask( qs, apHoles[ k ], apC[ i ].w ) );
			m *= hm;
		}
		vec3 c = apc * m; apCol += c; apDir += L * ( c.r + c.g + c.b );
	}
	if ( apCol.r + apCol.g + apCol.b > 0.0 ) {
		IncidentLight apLight;
		apLight.direction = normalize( ( viewMatrix * vec4( normalize( apDir ), 0.0 ) ).xyz );
		apLight.color = apCol;
		apLight.visible = true;
		RE_Direct( apLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
}
#include <lights_fragment_end>`;
// boucle des lumières de three.js, avec le masque de zone des lumières du pool (calculé une fois pour les 8 emplacements,
// appliqué par indice dans la boucle déroulée : le code de chaque lumière reste court)
const PATCH_BEGIN = /* glsl */`
vec3 wPos0 = cameraPosition + ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz;
float poolM[ 8 ];
for ( int k = 0; k < 8; k ++ ) { vec4 mn = poolMin[ k ], mx = poolMax[ k ]; poolM[ k ] = mn.w < 0.5 ? 1.0 : 1.0 - smoothstep( 0.0, mx.w, length( max( max( mn.xyz - wPos0, wPos0 - mx.xyz ), 0.0 ) ) ); }
` + THREE.ShaderChunk.lights_fragment_begin.replace(
  'getPointLightInfo( pointLight, geometryPosition, directLight );',
  'getPointLightInfo( pointLight, geometryPosition, directLight );\n\t\t{ int pk = int( ( pointLight.decay - 1.6 ) * 1000.0 + 0.5 ) - 1; if ( pk >= 0 && pk < 8 ) directLight.color *= poolM[ pk ]; }');
// opaque : alpha = part directe de l'éclairage (masque de la SSAO) ; transparent (vitres) : le reflet n'est pas
// atténué par l'opacité (un reflet sur une vitre claire reste entier)
const PATCH_OUT = /* glsl */`
#ifdef OPAQUE
	gl_FragColor = vec4( outgoingLight, 1.0 );
	{
		float lInd = dot( reflectedLight.indirectDiffuse + reflectedLight.indirectSpecular, vec3( 0.3333 ) );
		float lTot = lInd + dot( reflectedLight.directDiffuse + reflectedLight.directSpecular + totalEmissiveRadiance, vec3( 0.3333 ) );
		gl_FragColor.a = 1.0 - lInd / max( lTot, 1e-5 );
	}
#else
	gl_FragColor = vec4( totalDiffuse + totalSpecular / max( diffuseColor.a, 0.05 ) + totalEmissiveRadiance, diffuseColor.a );
#endif`;

export function patchZone(mat, zoneU) {
  const packed = !!mat.userData.packed, packedMetal = !!mat.userData.packedMetal;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.zoneLight = zoneU;
    for (const k of ['irBoost', 'envZoneK', 'hemiMid', 'hemiAmp', 'apA', 'apB', 'apC', 'apD', 'apL', 'apE', 'apHoles', 'poolMin', 'poolMax']) sh.uniforms[k] = GLOBAL_UNIFORMS[k];
    sh.fragmentShader = PATCH_PARS + sh.fragmentShader
      .replace('#include <lights_fragment_begin>', PATCH_BEGIN)
      .replace('#include <lights_fragment_maps>', PATCH_MAPS)
      .replace('#include <lights_fragment_end>', PATCH_LIGHTS)
      .replace('#include <opaque_fragment>', PATCH_OUT);
    // textures empaquetées (textures.js) : rugosité dans l'alpha de map, métal dans l'alpha de normalMap
    if (packed) sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * sampledDiffuseColor.a;');
    if (packedMetal) sh.fragmentShader = sh.fragmentShader.replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * texture2D( normalMap, vNormalMapUv ).a;');
  };
  const key = 'zl5' + (packed ? 'p' : '') + (packedMetal ? 'm' : '');
  mat.customProgramCacheKey = () => key;
  return mat;
}

// Matériau standard depuis une surface PBR de textures.js (rugosité absolue dans map.a, métal dans normalMap.a)
function std(t, o = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap,
    roughness: o.rough ?? 1, metalness: t.metal ? 1 : (o.metal ?? 0), envMap: ENV.map, envMapIntensity: o.env ?? 1,
  });
  m.userData.packed = !!t.packed; m.userData.packedMetal = !!(t.packed && t.metal);
  if (o.ns) m.normalScale.set(o.ns, o.ns);
  if (o.color !== undefined) m.color.set(o.color);
  // envoi immédiat au GPU (pendant le chargement plutôt qu'au premier affichage) : libère les pixels côté CPU
  const R = ENV.renderer; if (R) for (const tx of [t.map, t.normalMap]) if (tx) R.initTexture(tx);
  return m;
}

// rep : répétitions de la texture par mètre (UV monde × rep) ; la plupart des textures couvrent 1/rep mètres
const DEFS = {
  terrazzo: () => ({ m: std(TX.terrazzo()), rep: 0.25 }),
  concrete: () => ({ m: std(TX.concrete(0x8d8a85)), rep: 0.25 }),
  concrete_dark: () => ({ m: std(TX.concrete(0x5e5b57, 'd')), rep: 0.25 }),
  concrete_floor: () => ({ m: std(TX.concrete(0x77746e, 'f')), rep: 0.2 }),
  asphalt: () => ({ m: std(TX.asphalt(), { env: 0.6 }), rep: 0.2 }),
  brick: () => ({ m: std(TX.brick()), rep: 1 }),
  block: () => ({ m: std(TX.blockWall(0xb8b4aa)), rep: 1.25 }),
  block_dark: () => ({ m: std(TX.blockWall(0x7d7a73)), rep: 1.25 }),
  wood_floor: () => ({ m: std(TX.woodPlanks(0x8d6038)), rep: 0.3 }),
  wood_dark: () => ({ m: std(TX.woodPlanks(0x4e3420, 'd')), rep: 0.3 }),
  lino: () => ({ m: std(TX.linoleum(0x9fa59a)), rep: 0.3 }),
  lino_blue: () => ({ m: std(TX.linoleum(0x7a8ea0)), rep: 0.3 }),
  checker: () => ({ m: std(TX.checker(0x1a1a1a, 0xe8e8e8)), rep: 0.5 }),
  diamond: () => ({ m: std(TX.diamondPlate()), rep: 0.8 }),
  metal: () => ({ m: std(TX.metalPanel()), rep: 0.5 }),
  vent: () => ({ m: std(TX.metalPanel(0xa5abb0)), rep: 1 }),
  woodpanel: () => ({ m: std(TX.woodPanelWall()), rep: 0.5 }),
  ceiling: () => ({ m: std(TX.ceilingTiles(), { env: 0.5 }), rep: 0.5 }),
  corrugated: () => ({ m: std(TX.corrugated()), rep: 0.3 }),
  toilet_tiles: () => ({ m: std(TX.tiles(0xe6eef0, 0x9aa5a8, 8, 'wc', 0.2)), rep: 0.5 }),
  // architecture du centre (charpente de la verrière, habillages, sols de prestige)
  steel: () => ({ m: std(TX.brushedMetal(0xc9ced2, 'galva')), rep: 0.6 }),
  steel_dark: () => ({ m: std(TX.paintedSteel(0x4a5056)), rep: 0.6 }),
  aluminium: () => ({ m: std(TX.brushedMetal(0xb8bdc2, 'alu')), rep: 0.8 }),
  marble: () => ({ m: std(TX.marble(0xe9e5de)), rep: 0.2 }),
  granite: () => ({ m: std(TX.granite(0x4a4744)), rep: 0.3 }),
  stone: () => ({ m: std(TX.stone(0xb3aa9a)), rep: 0.5 }),
  wood_slats: () => ({ m: std(TX.woodSlats(0x9a6b42)), rep: 0.6 }),
  rubber: () => ({ m: std(TX.rubber(0x2c2e30)), rep: 1.5 }),
  office_carpet: () => ({ m: std(TX.officeCarpet(0x4a5262), { env: 0.3 }), rep: 0.5 }),
};

// Vitres : le blending conserve l'alpha déjà écrit dessous (masque de SSAO des surfaces vues à travers)
function glassMat(o) {
  const m = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, envMap: ENV.map, ...o });
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  return m;
}

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
    if (DEFS[name]) { const d = DEFS[name](); d.m.userData.texRepeat = d.rep; return d.m; }
    let mm;
    if ((mm = name.match(/^tile_([0-9a-f]{6})_([0-9a-f]{6})_(\d+)$/))) {
      const m = std(TX.tiles(parseInt(mm[1], 16), parseInt(mm[2], 16), +mm[3]));
      m.userData.texRepeat = 0.4; return m;
    }
    if ((mm = name.match(/^plaster_([0-9a-f]{6})$/))) {
      const m = std(TX.plaster(parseInt(mm[1], 16)), { env: 0.5 });
      m.userData.texRepeat = 0.5; return m;
    }
    if ((mm = name.match(/^carpet_([0-9a-f]{6})$/))) {
      const m = std(TX.carpet(parseInt(mm[1], 16)), { env: 0.3 });
      m.userData.texRepeat = 0.5; return m;
    }
    const env = ENV.map;
    if (name === 'furniture') return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.02, envMap: env, envMapIntensity: 0.8 });
    if (name === 'furniture_metal') return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.75, envMap: env });
    if (name === 'props') return new THREE.MeshStandardMaterial({ vertexColors: true, map: this.atlas, roughness: 0.5, metalness: 0.02, envMap: env, envMapIntensity: 0.8 });
    if (name === 'glass') return glassMat({ color: 0xb8ccd2, opacity: 0.12, roughness: 0.03, metalness: 0 });
    if (name === 'glass_roof') return glassMat({ color: 0xa8bcc6, opacity: 0.18, roughness: 0.05, metalness: 0 });
    if (name === 'glass_dirty') return glassMat({ color: 0x8aa0a0, opacity: 0.3, roughness: 0.32, metalness: 0 });
    if (name === 'chrome') return new THREE.MeshStandardMaterial({ color: 0xe4e6e8, roughness: 0.12, metalness: 1, envMap: env });
    if (name === 'black') return new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.55, envMap: env, envMapIntensity: 0.6 });
    if (name === 'skin') return new THREE.MeshStandardMaterial({ color: 0xe0b89a, roughness: 0.65 });
    if (name === 'water') return new THREE.MeshStandardMaterial({ color: 0x2a5868, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.8, envMap: env });
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
    if (m.isMeshStandardMaterial) patchZone(m, this.zoneUniform(zone));
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

// ───────────────────────── Carte d'environnement ─────────────────────────
// Galerie marchande éclairée, rendue une fois dans un cube puis préfiltrée (PMREM) : rangées de néons au plafond,
// vitrines chaudes de part et d'autre, sol clair, fond sombre. Valeurs normalisées : le shader la multiplie par la
// lumière de la zone (envZoneK), une zone éteinte ne reflète donc rien.
export function initEnvironment(renderer) {
  ENV.renderer = renderer;
  if (ENV.map) return ENV.map;
  try {
    const sc = new THREE.Scene(), geo = new THREE.PlaneGeometry(1, 1), mats = new Map();
    const mat = (r, g, b) => { const k = r + ',' + g + ',' + b; if (!mats.has(k)) mats.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide })); return mats.get(k); };
    const quad = (cx, cy, cz, w, h, rx, ry, m) => { const q = new THREE.Mesh(geo, m); q.position.set(cx, cy, cz); q.rotation.set(rx, ry, 0); q.scale.set(w, h, 1); sc.add(q); };
    const Y0 = -1.6, H = 5.2, L = 44, W = 15;
    quad(0, Y0, 0, L, W, -Math.PI / 2, 0, mat(0.26, 0.25, 0.23)); // sol
    quad(0, Y0 + H, 0, L, W, Math.PI / 2, 0, mat(0.13, 0.13, 0.13)); // plafond
    for (const s of [-1, 1]) {
      quad(0, Y0 + H / 2, s * W / 2, L, H, 0, 0, mat(0.24, 0.23, 0.21)); // murs longs
      for (let x = -19; x <= 19; x += 7.6) {
        quad(x, Y0 + 1.6, s * (W / 2 - 0.02), 5.6, 2.8, 0, 0, mat(1.25, 1.05, 0.82)); // vitrines éclairées
        quad(x, Y0 + 3.5, s * (W / 2 - 0.03), 4.2, 0.6, 0, 0, mat(0.05, 0.05, 0.06)); // bandeau d'enseigne
        quad(x, Y0 + 3.5, s * (W / 2 - 0.04), 2.6, 0.32, 0, 0, mat(2.2, 1.9, 1.5)); // lettres lumineuses
      }
      quad(s * L / 2, Y0 + H / 2, 0, W, H, 0, Math.PI / 2, mat(0.07, 0.07, 0.08)); // fonds de galerie
    }
    for (let x = -20; x <= 20; x += 4) for (const z of [-3, 3]) quad(x, Y0 + H - 0.02, z, 2.4, 0.5, Math.PI / 2, 0, mat(7, 7, 6.6)); // néons
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(sc, 0.02, 0.1, 100);
    pm.dispose(); geo.dispose(); for (const m of mats.values()) m.dispose();
    ENV.map = rt.texture;
  } catch (e) { console.warn('[env] carte d\'environnement indisponible', e); ENV.map = null; }
  return ENV.map;
}
