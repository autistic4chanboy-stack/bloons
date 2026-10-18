// Rendu : WebGLRenderer + post-traitement maison.
// Chaîne de la vue principale :
//  scène → cible HalfFloat (+ texture de profondeur, alpha = part directe de l'éclairage écrite par les matériaux)
//  → [qualité moyenne/haute] passe demi-résolution : SSAO (normales reconstruites depuis la profondeur, 12–16
//    échantillons en spirale) + faisceau volumétrique de la lampe torche (marche dans le cône, ombres de la lampe),
//    puis flou bilatéral 2 passes
//  → mesure de luminance 32×18 pondérée au centre → adaptation lente sur GPU (cible 1×1, pas de lecture CPU ; elle
//    déclenche aussi la « chasse » de la mise au point de la caméra-piéton)
//  → bloom (seuil exprimé après exposition)
//  → composite : objectif de caméra-piéton (barillet normalisé + champ élargi, aberration chromatique et flou sur les
//    bords, netteté légère, flou bref de mise au point), SSAO sur la seule part ambiante, AgX + étalonnage (balance des
//    blancs, look), vignette, bruit de capteur luma/chroma (plus fort quand le gain monte), effets de stress et
//    « lunettes », sortie sRGB.
// renderTo() (CCTV, photos) : rendu brut sans post-traitement. renderCCTV() : écran de vidéosurveillance plein écran.
import * as THREE from 'three';
import { noiseTexture, setMaxAnisotropy } from './textures.js';
import { initEnvironment, GLOBAL_UNIFORMS, syncGlobals } from './materials.js';

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Exposition : base (environnement) × gain automatique lu dans la cible 1×1 adaptée (log2 de la luminance moyenne)
const EXPO = /* glsl */`
uniform sampler2D tExpo; uniform float exposure, aeOn, aeKey, aeMin, aeMax, aeStrength;
float autoGain() { if (aeOn < 0.5) return 1.0; float lg = texture2D(tExpo, vec2(0.5)).r; return clamp(exp2((log2(aeKey) - lg) * aeStrength), aeMin, aeMax); }`;

const BRIGHT_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform float threshold; uniform vec2 texel;
${EXPO}
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tDiffuse, vUv + texel * vec2(-0.5, -0.5)).rgb;
  c += texture2D(tDiffuse, vUv + texel * vec2( 0.5, -0.5)).rgb;
  c += texture2D(tDiffuse, vUv + texel * vec2(-0.5,  0.5)).rgb;
  c += texture2D(tDiffuse, vUv + texel * vec2( 0.5,  0.5)).rgb;
  c *= 0.25 * exposure * autoGain();
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(threshold, threshold * 1.8 + 0.2, l);
  gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
}`;

const BLUR_FRAG = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
  c += texture2D(tDiffuse, vUv + dir * 1.3846).rgb * 0.3162162;
  c += texture2D(tDiffuse, vUv - dir * 1.3846).rgb * 0.3162162;
  c += texture2D(tDiffuse, vUv + dir * 3.2307).rgb * 0.0702702;
  c += texture2D(tDiffuse, vUv - dir * 3.2307).rgb * 0.0702702;
  gl_FragColor = vec4(c, 1.0);
}`;

// Mesure de luminance (32×18) : 16 prises par cellule, log2, pondération centrale (comme la mesure d'une caméra)
const LUM_FRAG = /* glsl */`
uniform sampler2D tScene; varying vec2 vUv;
void main() {
  vec2 cell = vec2(1.0 / 32.0, 1.0 / 18.0); float s = 0.0;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    vec3 c = texture2D(tScene, vUv + (vec2(float(i), float(j)) - 1.5) * cell * 0.25).rgb;
    s += log2(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5, 6e4));
  }
  vec2 d = (vUv - 0.5) * vec2(1.4, 1.8); float w = exp(-dot(d, d) * 1.6) + 0.12;
  gl_FragColor = vec4(s / 16.0 * w, w, 0.0, 1.0);
}`;
// Adaptation (cible 1×1) : vers une scène plus claire, rapide ; vers l'obscurité, lente.
// G : « chasse » de l'autofocus (caméra-piéton) : la scène devient d'un coup bien plus claire que le niveau adapté
// (2 à 3,4 diaphragmes) → impulsion entretenue 0,25 s au plus, qui retombe ensuite ; B : délai avant la suivante (18 s :
// l'effet reste rare)
const ADAPT_FRAG = /* glsl */`
uniform sampler2D tLum, tPrev; uniform float dt, upRate, downRate, reset; varying vec2 vUv;
void main() {
  float sl = 0.0, sw = 0.0;
  for (int y = 0; y < 18; y++) for (int x = 0; x < 32; x++) { vec2 v = texelFetch(tLum, ivec2(x, y), 0).rg; sl += v.r; sw += v.g; }
  vec3 pv = texture2D(tPrev, vec2(0.5)).rgb; float target = sl / max(sw, 1e-5), prev = pv.r;
  float v = reset > 0.5 ? target : mix(prev, target, 1.0 - exp(-dt * (target > prev ? upRate : downRate)));
  if (!(v > -30.0 && v < 30.0)) v = -2.0;
  float tr = (pv.b <= 0.0 || pv.b > 17.75) ? smoothstep(2.0, 3.4, target - prev) : 0.0;
  float h = reset > 0.5 ? 0.0 : max(pv.g * exp(-dt * 5.0), tr);
  if (!(h >= 0.01 && h <= 1.0)) h = 0.0;
  float cd = pv.b <= 0.0 && tr > 0.5 ? 18.0 : max(0.0, pv.b - dt);
  if (!(cd < 100.0)) cd = 0.0;
  gl_FragColor = vec4(v, h, cd, 1.0);
}`;

// Demi-résolution : R = occlusion ambiante, G = profondeur linéaire (m), B = diffusion du faisceau de la lampe
const AO_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tDepth, tShadow;
uniform vec2 resolution, tanHalf; uniform float camNear, camFar;
uniform float aoOn, aoRadius, aoIntensity, aoBias, aoSamples;
uniform float beamOn, beamCos, beamTan, beamRange, beamSteps, shadowOn; uniform vec3 beamPos, beamDir; uniform mat4 viewToShadow;
varying vec2 vUv;
float vz(vec2 uv) { return perspectiveDepthToViewZ(texture2D(tDepth, uv).r, camNear, camFar); }
vec3 vpos(vec2 uv, float z) { return vec3((uv * 2.0 - 1.0) * tanHalf * -z, z); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float profile(float rn) { return exp(-rn * rn / 0.0441) * 0.82 + 0.2 * (1.0 - smoothstep(0.6, 1.0, rn)); }
// positions reconstruites au centre exact des texels de profondeur (sinon, en incidence rasante, l'écart entre la
// coordonnée supposée et le texel lu crée des bandes d'occlusion sur les grands plans : plafonds, sols)
vec2 snap(vec2 uv) { return (floor(uv * resolution) + 0.5) / resolution; }
void main() {
  vec2 uv0 = (floor(vUv * resolution - 0.5) + 0.5) / resolution;
  float z = vz(uv0); vec3 P = vpos(uv0, z); float ao = 1.0, beam = 0.0;
  if (aoOn > 0.5 && -z < 150.0) {
    vec2 tx = 1.0 / resolution;
    vec3 pl = vpos(uv0 - vec2(tx.x, 0.0), vz(uv0 - vec2(tx.x, 0.0))), pr = vpos(uv0 + vec2(tx.x, 0.0), vz(uv0 + vec2(tx.x, 0.0)));
    vec3 pd = vpos(uv0 - vec2(0.0, tx.y), vz(uv0 - vec2(0.0, tx.y))), pu = vpos(uv0 + vec2(0.0, tx.y), vz(uv0 + vec2(0.0, tx.y)));
    vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl, dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
    vec3 N = normalize(cross(dx, dy)); if (dot(N, P) > 0.0) N = -N;
    vec2 rs = min(0.5 * aoRadius / (-z * tanHalf), vec2(0.15));
    float ang = ign(gl_FragCoord.xy) * 6.2831853, occ = 0.0, r2 = aoRadius * aoRadius;
    for (int i = 0; i < 16; i++) {
      if (float(i) >= aoSamples) break;
      float t = (float(i) + 0.5) / aoSamples, a = ang + float(i) * 2.3999632;
      vec2 suv = snap(uv0 + vec2(cos(a), sin(a)) * rs * t);
      vec3 v = vpos(suv, vz(suv)) - P; float vv = dot(v, v);
      occ += max(0.0, 1.0 - vv / r2) * max(0.0, dot(v, N) * inversesqrt(vv + 1e-4) - aoBias);
    }
    ao = clamp(1.0 - occ / aoSamples * aoIntensity, 0.0, 1.0);
  }
  if (beamOn > 0.5) {
    vec3 V = normalize(vpos(vUv, -1.0)); float tMax = min(-z > 600.0 ? 1e4 : length(P), beamRange);
    vec3 W = -beamPos; float c2 = beamCos * beamCos, vd = dot(V, beamDir), wd = dot(W, beamDir), wv = dot(W, V), ww = dot(W, W);
    float qa = vd * vd - c2, qb = 2.0 * (wd * vd - c2 * wv), qk = wd * wd - c2 * ww, t0 = 0.0, t1 = tMax; bool hit = true;
    if (abs(vd) > 1e-5) { float th = -wd / vd; if (vd > 0.0) t0 = max(t0, th); else t1 = min(t1, th); } else if (wd < 0.0) hit = false;
    float disc = qb * qb - 4.0 * qa * qk;
    if (abs(qa) < 1e-6) { if (qk < 0.0 && qb <= 0.0) hit = false; }
    else if (disc < 0.0) { if (qa < 0.0) hit = false; }
    else {
      float sq = sqrt(disc), r1 = (-qb - sq) / (2.0 * qa), r2b = (-qb + sq) / (2.0 * qa);
      if (r1 > r2b) { float tt = r1; r1 = r2b; r2b = tt; }
      if (qa < 0.0) { t0 = max(t0, r1); t1 = min(t1, r2b); } else if (t0 > r1) t0 = max(t0, r2b); else t1 = min(t1, r1);
    }
    if (hit && t1 > t0) {
      float dts = (t1 - t0) / beamSteps, j = ign(gl_FragCoord.xy + vec2(17.0, 31.0)), acc = 0.0;
      for (int i = 0; i < 16; i++) {
        if (float(i) >= beamSteps) break;
        vec3 S = V * (t0 + (float(i) + j) * dts), L = S - beamPos; float dl = length(L), ca = dot(L, beamDir) / max(dl, 1e-4);
        float rn = sqrt(max(0.0, 1.0 - ca * ca)) / max(ca, 1e-3) / beamTan, fall = clamp(1.0 - pow(dl / beamRange, 4.0), 0.0, 1.0);
        float vis = 1.0;
        if (shadowOn > 0.5) { vec4 sc = viewToShadow * vec4(S, 1.0); sc.xyz /= sc.w; if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) vis = step(sc.z - 0.002, unpackRGBAToDepth(texture2D(tShadow, sc.xy))); }
        acc += profile(rn) * (1.0 - smoothstep(0.85, 1.0, rn)) * fall * fall / (dl * dl + 0.3) * vis;
      }
      beam = acc * dts;
    }
  }
  gl_FragColor = vec4(ao, -z, beam, 1.0);
}`;
// Flou bilatéral séparable (ne bave pas d'un objet à l'autre : poids selon l'écart de profondeur)
const AOBLUR_FRAG = /* glsl */`
uniform sampler2D tAO; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tAO, vUv); float z = c.g, ws = 1.0; vec2 acc = c.rb;
  for (int i = 1; i <= 3; i++) for (int s = -1; s <= 1; s += 2) {
    vec4 t = texture2D(tAO, vUv + dir * float(i * s));
    float w = exp(-float(i * i) * 0.2) * max(0.0, 1.0 - abs(t.g - z) / (0.04 * z + 0.06));
    acc += t.rb * w; ws += w;
  }
  gl_FragColor = vec4(acc.x / ws, z, acc.y / ws, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */`
#include <packing>
uniform sampler2D tScene; uniform sampler2D tBloom1; uniform sampler2D tBloom2; uniform sampler2D tNoise; uniform sampler2D tDepth; uniform sampler2D tAO;
uniform float time, bloomStrength, grain, vignette, ca, stress, fade, flash, damage, distort, drunk, cold, sleepy, kaleido, heartbeat;
uniform float glassesMode; // 0 aucun, 1 vision nocturne, 2 anaglyphe 3D, 3 lunettes de soleil, 4 VR, 5 UV
uniform float nvGain; uniform vec2 resolution; uniform float desat; uniform vec3 tint; uniform float scanline;
uniform float lensK, aspect, sharpen, chroma, aoOn, aoStrength, camNear, camFar, lookPower, lookSat, debugView;
uniform float vigAmt, edgeSoft, huntK;
uniform vec2 aoRes; uniform vec3 beamColor, wb;
${EXPO}
varying vec2 vUv;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
// AgX (Troy Sobotka, version three.js) + « look » de caméra (contraste, saturation) appliqué dans l'espace AgX
vec3 agxContrast(vec3 x) { vec3 x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
vec3 agx(vec3 color) {
  const mat3 toRec2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
  const mat3 fromRec2020 = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  color = inset * (toRec2020 * color);
  color = clamp((log2(max(color, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
  color = agxContrast(color);
  float l = dot(color, LUMA);
  color = pow(max(color, 0.0), vec3(lookPower)); l = pow(max(l, 0.0), lookPower);
  color = l + lookSat * (color - l);
  color = outset * color;
  color = pow(max(color, 0.0), vec3(2.2));
  return clamp(fromRec2020 * color, 0.0, 1.0);
}
// SSAO + faisceau : suréchantillonnage bilatéral (4 texels demi-résolution pondérés par l'écart de profondeur)
vec4 aoAt(vec2 uv, float zc) {
  vec2 f = uv * aoRes - 0.5, b = floor(f), fr = f - b, du = 1.0 / aoRes, u0 = (b + 0.5) * du;
  vec4 s00 = texture2D(tAO, u0), s10 = texture2D(tAO, u0 + vec2(du.x, 0.0)), s01 = texture2D(tAO, u0 + vec2(0.0, du.y)), s11 = texture2D(tAO, u0 + du);
  vec4 w = vec4((1.0 - fr.x) * (1.0 - fr.y), fr.x * (1.0 - fr.y), (1.0 - fr.x) * fr.y, fr.x * fr.y);
  vec4 dz = abs(vec4(s00.g, s10.g, s01.g, s11.g) - zc) / (0.03 * zc + 0.04);
  w = w / (1.0 + dz * dz) + 1e-4;
  return (s00 * w.x + s10 * w.y + s01 * w.z + s11 * w.w) / dot(w, vec4(1.0));
}

void main() {
  vec2 uv = vUv;
  // ivresse : ondulation
  if (drunk > 0.0) {
    uv += vec2(sin(uv.y * 6.0 + time * 1.3), cos(uv.x * 5.0 + time * 1.1)) * 0.012 * drunk;
  }
  // kaléidoscope
  if (kaleido > 0.0) {
    vec2 p = uv - 0.5; float r = length(p); float a = atan(p.y, p.x) + time * 0.3;
    float seg = 6.2831853 / 8.0; a = mod(a, seg); a = abs(a - seg * 0.5);
    uv = mix(uv, vec2(cos(a), sin(a)) * r + 0.5, kaleido);
  }
  // objectif : barillet normalisé (les coins de l'image restent les coins du rendu, le centre est agrandi de 1 + K ;
  // le champ de la caméra est élargi d'autant : voir lensScale())
  vec2 p = uv * 2.0 - 1.0;
  vec2 q = p * vec2(aspect, 1.0) * inversesqrt(aspect * aspect + 1.0); float r2 = dot(q, q);
  float K = lensK + distort;
  p *= (1.0 + K * r2) / (1.0 + K);
  uv = p * 0.5 + 0.5;
  // aberration chromatique latérale : nulle au centre, maximale aux bords (+ stress)
  float caAmt = ca * r2 + stress * 0.004 * (0.5 + 0.5 * sin(time * 8.0)) * (0.4 + r2);
  vec2 off = normalize(p + 1e-5) * caAmt;
  vec4 cS = texture2D(tScene, uv);
  vec3 col;
  if (glassesMode == 2.0) {
    float rr = texture2D(tScene, uv + vec2(0.006, 0.0)).r; vec3 gb = texture2D(tScene, uv - vec2(0.006, 0.0)).rgb;
    col = vec3(rr, gb.g, gb.b);
  } else {
    col = vec3(texture2D(tScene, uv + off).r, cS.g, texture2D(tScene, uv - off).b);
  }
  // netteté légère : masque flou sur la luminance, dans un espace compressé (pas de halo autour des lampes)
  if (sharpen > 0.0) {
    vec2 tx = 1.0 / resolution;
    float ln = dot(texture2D(tScene, uv + vec2(tx.x, 0.0)).rgb + texture2D(tScene, uv - vec2(tx.x, 0.0)).rgb + texture2D(tScene, uv + vec2(0.0, tx.y)).rgb + texture2D(tScene, uv - vec2(0.0, tx.y)).rgb, LUMA) * 0.25;
    float lc = dot(cS.rgb, LUMA), sc = lc / (1.0 + lc), sn = ln / (1.0 + ln), st = clamp(sc + sharpen * (sc - sn), 0.0, 0.995);
    col *= (st / (1.0 - st) + 1e-6) / max(lc, 1e-6);
  }
  // caméra-piéton : bords de l'objectif plus mous (flou radial + tangentiel qui croît vers les coins)…
  if (edgeSoft > 0.0 && r2 > 0.3) {
    float s = edgeSoft * smoothstep(0.3, 1.0, r2); vec2 d = normalize(p + 1e-5) * 0.0024 * s, t = vec2(-d.y, d.x) * 0.7;
    vec3 b = texture2D(tScene, uv + d).rgb + texture2D(tScene, uv - d).rgb + texture2D(tScene, uv + t).rgb + texture2D(tScene, uv - t).rgb;
    col = mix(col, b * 0.25, s * 0.8);
  }
  // … et « chasse » de la mise au point quand la scène s'éclaire d'un coup (impulsion de l'adaptation : tExpo.g)
  float hunt = huntK * texture2D(tExpo, vec2(0.5)).g;
  if (hunt > 0.0) {
    float rr = hunt * (0.0045 + 0.003 * sin(time * 15.0)); vec3 b = vec3(0.0);
    for (int i = 0; i < 8; i++) { float a = float(i) * 2.3999632 + 0.4, k = rr * sqrt((float(i) + 0.5) / 8.0); b += texture2D(tScene, uv + vec2(cos(a), sin(a) * aspect) * k).rgb; }
    col = mix(col, b * 0.125, min(1.0, hunt * 1.4));
  }
  // flou (somnolence)
  if (sleepy > 0.0) {
    vec3 b = vec3(0.0); float s = sleepy * 0.006;
    b += texture2D(tScene, uv + vec2(s, 0.0)).rgb; b += texture2D(tScene, uv - vec2(s, 0.0)).rgb;
    b += texture2D(tScene, uv + vec2(0.0, s)).rgb; b += texture2D(tScene, uv - vec2(0.0, s)).rgb;
    col = mix(col, b * 0.25, clamp(sleepy, 0.0, 1.0));
  }
  // occlusion ambiante (sur la seule part ambiante de l'éclairage : 1 - alpha) et faisceau volumétrique
  if (aoOn > 0.5) {
    vec4 a = aoAt(uv, -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, camNear, camFar));
    col *= mix(1.0, a.r, aoStrength * (1.0 - clamp(cS.a, 0.0, 1.0)));
    col += beamColor * a.b;
    if (debugView > 0.5) { float v = debugView < 1.5 ? a.r : debugView < 2.5 ? cS.a : debugView < 3.5 ? a.b * 4.0 : a.g / 30.0; gl_FragColor = vec4(vec3(v), 1.0); return; }
  }
  float gain = autoGain() * (1.0 + hunt * 0.1 * sin(time * 9.0)); // l'exposition pompe un peu pendant la chasse
  vec3 bloom = texture2D(tBloom1, uv).rgb * 0.6 + texture2D(tBloom2, uv).rgb * 0.8; // déjà exposé (seuil après exposition)
  if (glassesMode == 1.0) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    l = pow(l * nvGain, 0.6);
    l += (rand(uv * resolution + time) - 0.5) * 0.25;
    col = vec3(0.1, 1.0, 0.25) * l;
    float circ = smoothstep(0.62, 0.45, length((vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0)));
    col *= circ;
  }
  col = col * exposure * gain + bloom * bloomStrength;
  // balance des blancs (tubes fluorescents : légère dominante verte), tonemapping AgX + look
  col = agx(col * wb);
  // étalonnage : désaturation nocturne, teinte
  float lum = dot(col, LUMA);
  col = mix(col, vec3(lum), clamp(desat + stress * 0.35, 0.0, 1.0));
  col *= tint;
  if (cold > 0.0) col = mix(col, col * vec3(0.75, 0.9, 1.25), cold);
  if (glassesMode == 3.0) col *= vec3(0.45, 0.38, 0.3);
  if (glassesMode == 4.0) { // VR : grille de pixels + double vignette
    vec2 g = fract(vUv * resolution / 3.0); col *= 0.75 + 0.25 * step(0.3, g.x) * step(0.3, g.y);
  }
  // vignette (pulsation avec le cœur quand stressé)
  vec2 cc = vUv - 0.5;
  float vig = smoothstep(0.85, 0.25, length(cc * vec2(1.0, 0.9)) * (1.0 + vignette));
  float pulse = heartbeat * stress;
  col *= mix(1.0, vig, vigAmt + stress * 0.35);
  col = mix(col, col * vec3(1.0, 0.35, 0.3), pulse * (1.0 - vig) * 0.8);
  // dégâts
  col = mix(col, vec3(0.5, 0.0, 0.0), damage * (1.0 - vig * 0.6));
  if (scanline > 0.0) col *= 1.0 - scanline * (0.5 + 0.5 * sin(vUv.y * resolution.y * 1.5));
  col = mix(col, vec3(1.0), flash);
  col *= 1.0 - fade;
  vec3 outc = toSRGB(max(col, 0.0));
  // bruit de capteur (espace perceptuel) : luma surtout dans les tons moyens, chroma dans les ombres ; il monte avec le
  // gain de l'exposition automatique, comme une vraie caméra dans le noir
  vec3 n = texture2D(tNoise, vUv * resolution / 256.0 + vec2(fract(time * 17.0), fract(time * 31.0))).rgb - 0.5;
  float sl = dot(outc, vec3(0.333)), g = grain * (0.65 + 0.35 * sqrt(gain));
  outc += n.r * g * (0.35 + sl * (1.0 - sl) * 2.0);
  outc += vec3(n.g, -0.5 * (n.g + n.b), n.b) * chroma * g * (1.0 - sl);
  gl_FragColor = vec4(outc, 1.0);
}`;

// Tube cathodique « vivant », partagé par la vue plein écran (CCTV_FRAG, CCTV_LIVE) et l'affichage des moniteurs du
// poste (security.js : l'image de la cible n'est refaite qu'à son tour, le tube l'anime à chaque image) : bande de
// défilement lente (plus claire, liseré sombre en tête), respiration et scintillement de la luminosité, entrelacement,
// lignes de balayage légères (effacées quand elles deviennent plus fines qu'un pixel), grain fin animé, décrochages
// horizontaux rares et brefs. Couleur en espace perceptuel (gamma 2,2 : un grain ajouté en linéaire grésillerait fort
// dans les noirs après l'encodage). t : temps (s) ; sd : graine (chaque moniteur dérive à sa façon) ; cell : grain (px).
export const CRT_LIVE = /* glsl */`
float crtH1(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float crtH2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// décrochage (fraction de la largeur) : une bande de lignes glisse 0,2 s, en moyenne un créneau sur 1 / (1 - p)
float crtJitter(float y, float t, float sd, float p) {
  float slot = floor(t * 5.0);
  if (crtH1(slot + sd * 37.0) < p) return 0.0;
  float y0 = crtH1(slot * 1.7 + sd * 3.1), hb = 0.03 + 0.1 * crtH1(slot * 2.3 + sd), env = sin(fract(t * 5.0) * 3.14159);
  return env * ((1.0 - smoothstep(hb * 0.4, hb, abs(y - y0))) * (0.006 + 0.016 * crtH1(floor(y * 240.0) * 0.37 + slot)) + 0.002);
}
// visibilité des lignes de balayage (à calculer hors de toute branche : dérivée) : nulle sous ~2 pixels par ligne
float crtScanVis(float v, float lines) { return lines > 0.0 ? 1.0 - smoothstep(0.3, 0.6, fwidth(v) * lines) : 0.0; }
float crtBump(float x, float a, float m, float b) { return smoothstep(a, m, x) * (1.0 - smoothstep(m, b, x)); }
vec3 crtLive(vec3 c, vec2 uv, vec2 cell, float t, float sd, float lines, float vis) {
  // bande : liseré sombre en tête, partie claire, puis traîne un peu plus sombre (descend d'un écran en ~12 s)
  float ph = fract(uv.y + t * 0.085 + sd);
  c *= 1.0 - 0.07 * crtBump(ph, 0.0, 0.006, 0.03) + 0.09 * crtBump(ph, 0.02, 0.12, 0.24) - 0.045 * crtBump(ph, 0.2, 0.32, 0.5);
  c *= 1.0 + 0.014 * sin(t * 1.9 + sd * 6.3) + 0.007 * sin(t * 7.3 + sd * 2.1) + 0.012 * (crtH1(floor(t * 30.0) + sd * 13.0) - 0.5);
  float y = uv.y * lines;
  c *= 1.0 - vis * (0.045 * (0.5 + 0.5 * cos(6.2831853 * y)) - 0.012 * (mod(floor(y) + floor(t * 50.0), 2.0) - 0.5));
  return c + (crtH2(floor(cell) + fract(t * 7.0) * 917.0) - 0.5) * 0.05 * (1.2 - 0.8 * dot(c, vec3(0.333)));
}`;
// Shader « écran CCTV » : vue plein écran (CCTV_LIVE : tube animé ici), image des moniteurs du poste (CCTV_RT : partie
// fixe seulement, l'écran du moniteur anime le tube et repasse en linéaire ; l'alpha porte la neige « pas de signal »)
// et images de l'enregistreur. Sortie perceptuelle (sRGB). Partie fixe : courbure et coins arrondis adoucis, parasites
// (glitch), tonemapping, infrarouge, grain du capteur (plus fort dans les ombres), neige, vignettage doux, incrustation.
export const CCTV_FRAG = /* glsl */`
uniform sampler2D tCam; uniform sampler2D tNoise; uniform sampler2D tOverlay; uniform float time, ir, noiseAmt, offline, glitch, hasOverlay, curvature, brightness;
uniform float swap, lines, seed, analog; uniform vec2 resolution;
varying vec2 vUv;
${CRT_LIVE}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  float t = time, vis = crtScanVis(vUv.y, lines);
  vec2 cc = vUv - 0.5, uv = 0.5 + cc * (1.0 + curvature * dot(cc, cc));
  float mask = 1.0;
  if (curvature > 0.0) { vec2 e = max(abs(uv - 0.5) - 0.465, 0.0); mask = 1.0 - smoothstep(0.029, 0.035, length(e)); }
  if (mask <= 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
#ifdef CCTV_LIVE
  if (analog > 0.5) {
    uv.y = fract(uv.y + swap * swap * 0.55); // changement de caméra : l'image roule un instant
    uv.x += crtJitter(uv.y, t, seed, 0.9833);
  }
#endif
  float line = floor(uv.y * resolution.y), jitter = 0.0;
  if (glitch > 0.0) {
    jitter = (crtH2(vec2(line, floor(t * 30.0))) - 0.5) * 0.004 * (1.0 + glitch * 20.0);
    if (crtH2(vec2(floor(t * 12.0), line * 0.1)) < glitch * 0.3) jitter += (crtH1(line * 0.731) - 0.5) * 0.1;
  }
  vec3 c = texture2D(tCam, vec2(uv.x + jitter, uv.y)).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // tonemapping simple
  c = c / (1.0 + c);
  l = l / (1.0 + l);
  if (ir > 0.5) { c = vec3(l * 0.85, l * 1.0, l * 0.9) * 1.35; }
  else { c = mix(c, vec3(l), 0.35); }
  // suite en espace perceptuel : grain du capteur (plus marqué dans les ombres), neige, vignettage doux
  c = toSRGB(clamp(c * brightness, 0.0, 1.0));
  float n = crtH2(floor(uv * resolution) + fract(t * 13.0) * 431.0);
  c += (n - 0.5) * noiseAmt * (0.7 + 0.6 * (1.0 - l));
  if (offline > 0.5) c = vec3(n * 0.6);
  c *= mix(0.86, 1.0, 1.0 - smoothstep(0.32, 0.95, length(cc * vec2(1.0, 0.94)))) * mask;
#ifdef CCTV_LIVE
  if (analog > 0.5) c = crtLive(c, uv, gl_FragCoord.xy, t, seed, lines, vis);
  else c += (crtH2(gl_FragCoord.xy + fract(t * 7.0) * 917.0) - 0.5) * 0.03; // écran plat (tablette) : grain seul
  if (swap > 0.0) c = mix(c, vec3(crtH2(gl_FragCoord.xy + fract(t * 7.0) * 311.0) * 0.7 + 0.1), swap * 0.6);
#endif
  if (hasOverlay > 0.5) { vec4 o = texture2D(tOverlay, vUv); c = mix(c, o.rgb, o.a); }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
#ifdef CCTV_RT
  gl_FragColor.a = offline > 0.5 ? 0.0 : 1.0;
#endif
}`;

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4();

export class Renderer {
  constructor(canvasEl, settings) {
    this.settings = settings;
    this.gl = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    const r = this.gl;
    // vérification des erreurs de shaders (lecture synchrone des journaux de compilation : un arrêt du fil principal à
    // chaque programme) seulement en mode débogage (?debug)
    r.debug.checkShaderErrors = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);
    r.outputColorSpace = THREE.LinearSRGBColorSpace; // la conversion sRGB est faite dans le composite
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = true;
    r.info.autoReset = true;
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));
    initEnvironment(r); // carte d'environnement (reflets) partagée par les matériaux

    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsGeo = new THREE.BufferGeometry();
    this.fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.fsMesh = new THREE.Mesh(this.fsGeo, null); this.fsMesh.frustumCulled = false;
    this.fsScene = new THREE.Scene(); this.fsScene.add(this.fsMesh);

    const noise = noiseTexture(256);
    const NEAREST = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.expoRT = [this.makeRT(1, 1, NEAREST), this.makeRT(1, 1, NEAREST)]; this.expoIdx = 0; this._aeReset = 2;
    this.lumRT = this.makeRT(32, 18, NEAREST);
    // uniforms d'exposition partagés par le seuil du bloom et le composite (fx.exposure règle les deux)
    const E = this.expoU = { tExpo: { value: this.expoRT[0].texture }, exposure: { value: 1 }, aeOn: { value: 1 }, aeKey: { value: 0.18 }, aeMin: { value: 0.5 }, aeMax: { value: 2 }, aeStrength: { value: 0.7 } };
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.brightMat = mk(BRIGHT_FRAG, { tDiffuse: { value: null }, threshold: { value: 1.1 }, texel: { value: new THREE.Vector2() }, ...E });
    this.blurMat = mk(BLUR_FRAG, { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } });
    this.lumMat = mk(LUM_FRAG, { tScene: { value: null } });
    this.adaptMat = mk(ADAPT_FRAG, { tLum: { value: this.lumRT.texture }, tPrev: { value: null }, dt: { value: 0.016 }, upRate: { value: 2.2 }, downRate: { value: 0.75 }, reset: { value: 1 } });
    this.aoMat = mk(AO_FRAG, {
      tDepth: { value: null }, tShadow: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, tanHalf: { value: new THREE.Vector2(1, 1) }, camNear: { value: 0.05 }, camFar: { value: 700 },
      aoOn: { value: 1 }, aoRadius: { value: 0.7 }, aoIntensity: { value: 2.4 }, aoBias: { value: 0.1 }, aoSamples: { value: 12 },
      beamOn: { value: 0 }, beamCos: { value: 0.9 }, beamTan: { value: 0.45 }, beamRange: { value: 20 }, beamSteps: { value: 12 }, shadowOn: { value: 0 },
      beamPos: { value: new THREE.Vector3() }, beamDir: { value: new THREE.Vector3(0, 0, -1) }, viewToShadow: { value: new THREE.Matrix4() },
    });
    this.aoBlurMat = mk(AOBLUR_FRAG, { tAO: { value: null }, dir: { value: new THREE.Vector2() } });
    this.compMat = mk(COMPOSITE_FRAG, {
      tScene: { value: null }, tBloom1: { value: null }, tBloom2: { value: null }, tNoise: { value: noise }, tDepth: { value: null }, tAO: { value: null },
      time: { value: 0 }, bloomStrength: { value: 0.6 }, grain: { value: 0.06 }, vignette: { value: 0.1 }, ca: { value: 0.0015 },
      stress: { value: 0 }, fade: { value: 0 }, flash: { value: 0 }, damage: { value: 0 }, distort: { value: 0 }, drunk: { value: 0 }, cold: { value: 0 },
      sleepy: { value: 0 }, kaleido: { value: 0 }, heartbeat: { value: 0 }, glassesMode: { value: 0 }, nvGain: { value: 6 },
      resolution: { value: new THREE.Vector2(1, 1) }, desat: { value: 0.12 }, tint: { value: new THREE.Vector3(1, 1, 1) }, scanline: { value: 0 },
      lensK: { value: 0.04 }, aspect: { value: 16 / 9 }, sharpen: { value: 0.15 }, chroma: { value: 0.5 }, aoOn: { value: 0 }, aoStrength: { value: 1 },
      camNear: { value: 0.05 }, camFar: { value: 700 }, lookPower: { value: 1.1 }, lookSat: { value: 1.05 }, aoRes: { value: new THREE.Vector2(1, 1) },
      beamColor: { value: new THREE.Color(0, 0, 0) }, wb: { value: new THREE.Vector3(1, 1, 1) },
      vigAmt: { value: 0.45 }, edgeSoft: { value: 0 }, huntK: { value: 0 }, // caméra-piéton : vignette, bords mous, chasse de la mise au point
      debugView: { value: 0 }, // diagnostic : 1 SSAO, 2 part directe (alpha), 3 faisceau, 4 profondeur
      ...E,
    });
    this.cctvMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT, fragmentShader: CCTV_FRAG, depthTest: false, depthWrite: false, defines: { CCTV_LIVE: 1 },
      uniforms: { tCam: { value: null }, tNoise: { value: noise }, tOverlay: { value: null }, hasOverlay: { value: 0 }, time: { value: 0 }, ir: { value: 1 }, noiseAmt: { value: 0.12 }, offline: { value: 0 }, glitch: { value: 0 }, curvature: { value: 0.12 }, brightness: { value: 1.1 }, resolution: { value: new THREE.Vector2(640, 400) }, swap: { value: 0 }, lines: { value: 240 }, seed: { value: 0 }, analog: { value: 1 } },
    });
    this.copyMat = new THREE.MeshBasicMaterial();
    this.beam = { light: null, strength: 0 }; // lampe torche du joueur (faisceau volumétrique en post-traitement)
    this.stats = { calls: 0, tris: 0 };
    this.rts = null;
    this.resize();
    this._time = 0;
  }

  get fx() { return this.compMat.uniforms; }
  // Faisceau volumétrique disponible (qualité moyenne/haute) : le joueur n'affiche alors pas le cône de secours
  get volumetric() { return this.settings.quality !== 'low' && this.settings.volumetric !== false; }
  get bodycam() { return this.settings.bodycam !== false; }
  // Agrandissement du centre de l'image par le barillet : la caméra doit élargir son champ d'autant (tan(fov/2) × k)
  lensScale() { return 1 + (this.bodycam ? 0.27 : 0.04); }
  setBeam(light, strength) { this.beam.light = light; this.beam.strength = strength; }
  // Après une téléportation (début de nuit, réapparition) : l'exposition se recale immédiatement
  resetAdaptation() { this._aeReset = 2; }

  makeRT(w, h, opts = {}) {
    return new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), Object.assign({ type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }, opts));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight, q = this.settings.quality;
    // écrans haute densité : définition plafonnée selon la qualité (un écran Retina en ×2 quadruple le travail)
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'low' ? 1 : 1.25);
    // qualité basse : scène rendue à 80 % de la définition (le composite remet l'image à la taille de l'écran)
    const scale = (this.settings.renderScale ?? 1) * (this.dynScale ?? 1) * (q === 'low' ? 0.8 : 1);
    if (this.gl.getPixelRatio() !== 1) this.gl.setPixelRatio(1); // (setPixelRatio redimensionne toujours le canevas)
    this.gl.domElement.style.width = w + 'px'; this.gl.domElement.style.height = h + 'px';
    const W = Math.max(320, Math.floor(w * dpr * scale)), H = Math.max(200, Math.floor(h * dpr * scale));
    // un seul redimensionnement du canevas (chaque affectation de sa taille réalloue le tampon de dessin)
    const cw = Math.floor(w * dpr), ch = Math.floor(h * dpr), cv = this.gl.domElement;
    if (cv.width !== cw || cv.height !== ch) this.gl.setSize(cw, ch, false);
    this.W = W; this.H = H;
    if (this.rts) { for (const k in this.rts) { this.rts[k].depthTexture?.dispose(); this.rts[k].dispose(); } }
    const samples = this.settings.quality === 'high' ? 4 : 0;
    const depthTexture = new THREE.DepthTexture(W, H); depthTexture.type = THREE.UnsignedIntType;
    this.rts = {
      scene: this.makeRT(W, H, { depthBuffer: true, depthTexture, samples }),
      ao: this.makeRT(W / 2, H / 2), ao2: this.makeRT(W / 2, H / 2),
      bright: this.makeRT(W / 2, H / 2),
      b1a: this.makeRT(W / 4, H / 4), b1b: this.makeRT(W / 4, H / 4),
      b2a: this.makeRT(W / 8, H / 8), b2b: this.makeRT(W / 8, H / 8),
    };
    const U = this.compMat.uniforms;
    U.resolution.value.set(W, H); U.aspect.value = w / h; U.aoRes.value.set(this.rts.ao.width, this.rts.ao.height);
    GLOBAL_UNIFORMS.envZoneK.value = q === 'low' ? 0 : 0.6; // qualité basse : pas de reflets d'environnement (lectures en moins)
    this.aoMat.uniforms.resolution.value.set(W, H);
  }

  // Résolution dynamique : si les images tardent (< ~40 i/s), la définition interne baisse par paliers (jusqu'à 55 %),
  // puis remonte doucement quand la marge revient. Désactivable dans les options.
  adapt(dt) {
    if (this.settings.autoScale === false) { if ((this.dynScale ?? 1) !== 1) { this.dynScale = 1; this.resize(); } return; }
    if (!(dt > 0) || dt >= 0.1) return; // onglet caché, chargement : on ignore
    this.ema = this.ema == null ? dt : this.ema + (dt - this.ema) * 0.04;
    this.adaptT = (this.adaptT || 0) + dt;
    if (this.adaptT < 2.5) return;
    this.adaptT = 0;
    const cur = this.dynScale ?? 1; let s = cur;
    if (this.ema > 0.025) s = Math.max(0.55, cur - 0.1);
    else if (this.ema < 0.0185) s = Math.min(1, cur + 0.05);
    if (Math.abs(s - cur) > 0.001) { this.dynScale = s; this.resize(); }
  }

  pass(mat, target) {
    this.fsMesh.material = mat;
    this.gl.setRenderTarget(target);
    this.gl.render(this.fsScene, this.fsCam);
  }

  // Rendu principal de la scène + post-traitement
  render(scene, camera, dt) {
    this._time += dt;
    syncGlobals(); // tableaux d'uniformes globaux : une nouvelle version seulement s'ils ont changé
    this.adapt(dt);
    const r = this.gl, rts = this.rts, U = this.compMat.uniforms, S = this.settings;
    U.time.value = this._time;
    r.setRenderTarget(rts.scene);
    r.clear();
    r.render(scene, camera);
    this.stats.calls = r.info.render.calls; this.stats.tris = r.info.render.triangles;
    // objectif « caméra-piéton » (réglage) ou objectif discret
    const bc = this.bodycam, low = S.quality === 'low';
    // qualité basse : ni netteté ni bords mous de l'objectif (8 lectures de texture par pixel en moins)
    U.lensK.value = this.lensScale() - 1; U.ca.value = bc ? 0.0052 : 0.0014; U.sharpen.value = low ? 0 : bc ? 0.32 : 0.12; U.chroma.value = bc ? 0.85 : 0.4;
    U.vignette.value = bc ? 0.16 : 0.1; U.vigAmt.value = bc ? 0.56 : 0.45; U.edgeSoft.value = bc && !low ? 1 : 0; U.huntK.value = bc ? 1 : 0;
    // SSAO + faisceau volumétrique (demi-résolution)
    const aoOn = S.quality !== 'low', hi = S.quality === 'high';
    const L = this.beam.light, beamOn = aoOn && this.volumetric && L && L.intensity > 0 && this.beam.strength > 0;
    U.aoOn.value = aoOn ? 1 : 0; U.tDepth.value = rts.scene.depthTexture;
    if (aoOn) {
      const A = this.aoMat.uniforms, P = camera.projectionMatrix.elements;
      A.tDepth.value = rts.scene.depthTexture; A.tanHalf.value.set(1 / P[0], 1 / P[5]); A.camNear.value = U.camNear.value = camera.near; A.camFar.value = U.camFar.value = camera.far;
      A.aoSamples.value = hi ? 16 : 12; A.beamSteps.value = hi ? 16 : 12; A.beamOn.value = beamOn ? 1 : 0;
      if (beamOn) {
        const vm = camera.matrixWorldInverse;
        A.beamPos.value.copy(L.position).applyMatrix4(vm);
        A.beamDir.value.copy(_d.copy(L.target.position).sub(L.position).normalize()).transformDirection(vm);
        A.beamCos.value = Math.cos(L.angle); A.beamTan.value = Math.tan(L.angle); A.beamRange.value = L.distance || 20;
        const sm = L.castShadow && L.shadow.map ? L.shadow.map.texture : null;
        A.shadowOn.value = sm ? 1 : 0; A.tShadow.value = sm;
        if (sm) A.viewToShadow.value.multiplyMatrices(L.shadow.matrix, camera.matrixWorld);
        // diffusion : couleur × intensité × densité de la brume (plus épaisse dans les conduits, plus fine au poste)
        const fog = scene.fog ? scene.fog.density : 0.02;
        U.beamColor.value.copy(L.color).multiplyScalar(L.intensity * this.beam.strength * 0.0038 * Math.min(2.5, Math.max(0.5, fog / 0.022)));
      } else U.beamColor.value.setRGB(0, 0, 0);
      this.pass(this.aoMat, rts.ao);
      const B = this.aoBlurMat.uniforms;
      B.tAO.value = rts.ao.texture; B.dir.value.set(1 / rts.ao.width, 0); this.pass(this.aoBlurMat, rts.ao2);
      B.tAO.value = rts.ao2.texture; B.dir.value.set(0, 1 / rts.ao.height); this.pass(this.aoBlurMat, rts.ao);
      U.tAO.value = rts.ao.texture;
    }
    // exposition automatique (mesure + adaptation, entièrement sur GPU)
    this.lumMat.uniforms.tScene.value = rts.scene.texture; this.pass(this.lumMat, this.lumRT);
    const Ad = this.adaptMat.uniforms, prev = this.expoRT[this.expoIdx], next = this.expoRT[1 - this.expoIdx];
    Ad.tPrev.value = prev.texture; Ad.dt.value = Math.min(0.1, Math.max(0, dt)); Ad.reset.value = this._aeReset > 0 ? 1 : 0;
    this.pass(this.adaptMat, next); this.expoIdx = 1 - this.expoIdx; this.expoU.tExpo.value = next.texture;
    if (this._aeReset > 0) this._aeReset--;
    // bloom
    const bloomOn = S.bloom !== false;
    if (bloomOn) {
      this.brightMat.uniforms.tDiffuse.value = rts.scene.texture;
      this.brightMat.uniforms.texel.value.set(1 / this.W, 1 / this.H);
      this.pass(this.brightMat, rts.bright);
      const B = this.blurMat.uniforms;
      B.tDiffuse.value = rts.bright.texture; B.dir.value.set(1 / rts.b1a.width, 0); this.pass(this.blurMat, rts.b1a);
      B.tDiffuse.value = rts.b1a.texture; B.dir.value.set(0, 1 / rts.b1a.height); this.pass(this.blurMat, rts.b1b);
      if (!low) { // qualité basse : un seul niveau de halo (3 passes au lieu de 7)
        B.tDiffuse.value = rts.b1b.texture; B.dir.value.set(1 / rts.b2a.width, 0); this.pass(this.blurMat, rts.b2a);
        B.tDiffuse.value = rts.b2a.texture; B.dir.value.set(0, 1 / rts.b2a.height); this.pass(this.blurMat, rts.b2b);
        B.tDiffuse.value = rts.b2b.texture; B.dir.value.set(2 / rts.b2a.width, 0); this.pass(this.blurMat, rts.b2a);
        B.tDiffuse.value = rts.b2a.texture; B.dir.value.set(0, 2 / rts.b2a.height); this.pass(this.blurMat, rts.b2b);
      }
    }
    U.tScene.value = rts.scene.texture;
    U.tBloom1.value = rts.b1b.texture; U.tBloom2.value = low ? rts.b1b.texture : rts.b2b.texture;
    U.bloomStrength.value = bloomOn ? (S.bloomStrength ?? 0.55) : 0;
    this.pass(this.compMat, null);
  }

  // Rendu d'une caméra dans une cible (CCTV, polaroid…)
  renderTo(scene, camera, target) {
    this.gl.setRenderTarget(target);
    this.gl.clear();
    this.gl.render(scene, camera);
    this.gl.setRenderTarget(null);
  }

  // Affiche une texture de caméra en plein écran avec le shader CCTV (tube animé). opts.time : horloge du tube (la vue
  // plein écran remplace render(), dont l'horloge _time ne tourne plus) ; opts.swap : 1 → 0 après un changement de
  // caméra ; opts.seed : dérive propre à la caméra ; opts.analog === false : écran plat (tablette), sans tube
  renderCCTV(texture, opts = {}) {
    const U = this.cctvMat.uniforms, analog = opts.analog !== false;
    if (opts.time === undefined) this._time += opts.dt ?? 1 / 60;
    U.tCam.value = texture; U.time.value = opts.time ?? this._time;
    U.ir.value = opts.ir ? 1 : 0; U.noiseAmt.value = opts.noise ?? 0.08; U.offline.value = opts.offline ? 1 : 0; U.glitch.value = opts.glitch || 0;
    U.tOverlay.value = opts.overlay || null; U.hasOverlay.value = opts.overlay ? 1 : 0; U.curvature.value = analog ? 0.06 : 0; U.analog.value = analog ? 1 : 0;
    U.resolution.value.set(texture?.image?.width || 640, texture?.image?.height || 400);
    U.brightness.value = opts.brightness ?? 1.05; U.swap.value = opts.swap || 0; U.seed.value = opts.seed || 0;
    U.lines.value = Math.max(120, Math.round(this.gl.domElement.height / 3)); // ~3 pixels par ligne de balayage
    this.pass(this.cctvMat, null);
  }

  readPixels(target, w, h, out = null) {
    const buf = out && out.length >= w * h * 4 ? out : new Uint8Array(w * h * 4);
    this.gl.readRenderTargetPixels(target, 0, 0, w, h, buf);
    return buf;
  }
}
