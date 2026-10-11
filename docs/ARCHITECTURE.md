# NUIT BLANCHE — Centre Commercial Hélios

Jeu d'horreur / simulateur de gardien de nuit en 3D, navigateur, Three.js r170 (vendored, `vendor/three.module.min.js`,
importé via importmap sous le nom `three`). Aucun build : modules ES natifs servis statiquement (`python3 -m http.server`).

## Conventions
- Langue de l'UI / textes : **français**.
- Unités : mètres, Y vers le haut. Temps en secondes.
- Tous les sons sont **synthétisés** en WebAudio (aucun fichier audio). Toutes les textures sont procédurales (canvas).
- Modules : `js/engine` (bas niveau), `js/world` (construction du centre commercial), `js/game` (gameplay),
  `js/data` (données pures, sans dépendance à three), `js/screens` (contenus des écrans, mini-jeux 2D canvas).
- Pas de dépendance externe autre que three.

## Contrat : `js/engine/audio.js`
```js
import { Audio } from './engine/audio.js';
Audio.init();                       // crée l'AudioContext (appelé sur geste utilisateur). Idempotent.
Audio.ctx                           // AudioContext
Audio.setListener(pos, forward, up) // THREE.Vector3-like {x,y,z}
Audio.setReverbZone(type, fade=1.5) // 'security'|'shop'|'bigstore'|'backroom'|'atrium'|'corridor'|'garage'|'vent'
                                    // |'roof'|'basement'|'warehouse'|'stairs'|'toilets'|'outside'
Audio.setOcclusionFn(fn)            // fn(pos) -> nombre de murs entre auditeur et source (0..n). Fourni par le jeu.
Audio.play(name, opts) -> Handle    // one-shot. opts: {pos, volume=1, pitch=1, bus='sfx', occlude=true, ref=2, maxDist=60, ...params}
Audio.loop(name, opts) -> Handle    // boucle. Handle: {setPos(v), setVolume(v, ramp=0.1), setParam(k,v), stop(fade=0.2), playing}
Audio.dtmf(digit)                   // touche téléphone (fréquences DTMF réelles)
Audio.note(instr, midi, opts)       // instr: 'piano'|'guitar'|'xylo'|'bell'|'organ'|'synth'|'musicbox'
Audio.drum(kind, opts)              // 'kick'|'snare'|'hat'|'tom'|'crash'
Audio.setBusVolume(bus, v)          // 'master'|'sfx'|'music'|'ambience'|'voice'|'ui'
Audio.setMuffle(amount)             // 0..1 filtre passe-bas global (ex : sous l'eau / étourdi / masque)
Audio.update(dt)                    // met à jour occlusion/positions (appelé chaque frame)
```
Sons spatiaux : PannerNode HRTF, modèle 'inverse', `ref`/`maxDist`. Occlusion : la valeur de `occlusionFn(pos)` pilote un
BiquadFilter passe-bas par source (0 mur : 20 kHz ; 1 : ~2.5 kHz ; 2 : ~900 Hz ; 3+ : ~400 Hz) et une atténuation
(-4 dB / mur), et augmente le ratio wet de la réverbération. Réverb : ConvolverNode avec réponses impulsionnelles générées
(bruit filtré à décroissance exponentielle, early reflections), une par type de zone, crossfade entre zones.

### Noms de sons (`Audio.play` / `Audio.loop`)
Pas : `step_tile, step_concrete, step_metal, step_carpet, step_wood, step_vent, step_grass, step_heels, step_sneakers, land`
Impacts (le jeu passe `opts.intensity` 0..1) : `hit_plastic, hit_metal, hit_wood, hit_glass, hit_cardboard, hit_soft, hit_paper, hit_can, hit_ceramic, glass_break, glass_shatter_big, bottle_break`
Portes : `door_open, door_close, door_creak, door_slam, door_locked, door_unlock, shutter_move (loop), shutter_stop, drawer_open, drawer_close, cabinet_open, cabinet_close, fridge_open, fridge_close, vent_grate, hatch_open, hatch_close`
UI/élec : `switch, button, beep, error, success, breaker, power_down, power_up, relay, alert, notify, page, camera_switch, rec_start`
Caisse/argent : `register_open, register_close, coins, cash_rustle, lock_pick_click, lock_pick_set, lock_pick_fail, lock_open, padlock_close`
Nourriture : `eat_crunch, eat_soft, eat_chips, drink, drink_can_open, bottle_open, burp`
Jouets : `squeak, toy_robot (loop), toy_car (loop), doll_laugh, doll_voice, jack_in_box, jack_music (loop), ball_bounce, rattle, spinning_top (loop), bubbles, yoyo, rubik, xylo_hit, toy_drum, toy_gun, toy_horn, music_box (loop, param tempo)`
Téléphone : `phone_ring (loop, sonnerie française 440 Hz), dial_tone (loop, 440 Hz continu), busy_tone (loop), ringback (loop), phone_pickup, phone_hangup, mobile_ring (loop), vibrate`
Alarmes : `alarm_siren (loop), car_alarm (loop), smoke_alarm (loop), shop_alarm (loop), fire_bell (loop)`
Feu : `fire_crackle (loop, param size 0..1), fire_whoosh, extinguisher (loop), sprinkler (loop), smoke_hiss`
Électricité/bâtiment : `generator (loop, param rpm 0..1), generator_start, generator_fail, generator_stop, electric_hum (loop, 50 Hz + harmoniques), fluorescent_buzz (loop), neon_flicker, hvac (loop), escalator (loop), fountain (loop), elevator_ding, water_drip, pipe_knock, building_creak`
Extérieur : `wind (loop, param strength), rain (loop, param intensity), thunder, distant_traffic (loop), dog_bark_far, owl, city_night (loop)`
Foule/jour : `crowd (loop, param density), cart_roll (loop), baby_cry, laugh, pa_chime, pa_chime_end`
Horreur : `whisper, breath (loop), heartbeat (loop, param bpm), scream, jumpscare, stinger, drone (loop, param tension 0..1), creak, knock, knock_triple, scratch, footsteps_distant, footstep_heavy, giggle, music_box_wrong, static_burst, low_boom, metal_screech, vent_crawl (loop), vent_bang, breathing_heavy, door_rattle, thud`
Animaux : `meow, purr (loop), hiss, cat_run, rat_squeak, parrot, bird_chirp, fish_bubble (loop), dog_whine`
Appareils (loops sauf mention) : `tv_static, tv_on (one-shot), tv_off (one-shot), radio_tune, microwave, microwave_ding (one-shot), blender, vacuum, hairdryer, washer, toaster_tick, toaster_pop (one-shot), kettle, kettle_whistle, fan, fridge_hum, coffee_machine, printer, computer_fan, computer_boot (one-shot), vcr_insert (one-shot), vcr_eject (one-shot), vcr_whirr, turntable_crackle, cd_tray (one-shot), console_boot (one-shot), arcade_ambient, crt_whine, drill, saw, shaver, electric_toothbrush, massage_chair, popcorn, fryer, grinder, projector`
Divers : `pickup, drop, throw, swing, hit_body, flashlight_click, battery_insert, spray, perfume_spray, air_horn, camera_shutter, polaroid_eject, paper, book_page, zipper, cloth, keys, coin_insert, coin_drop, kiddie_ride (loop musique), claw_machine (loop), bell_shop, cash_register_ding, gunshot, police_siren (loop), fire_truck (loop), car_engine (loop, param rpm), car_horn, car_door, car_lock, glass_crack, clock_tick (loop), wind_chime, bowling_pins, basketball, skate_roll (loop), photo_flash, typewriter, sticker`

Si un nom inconnu est demandé : `console.warn` une fois puis jouer un 'click' générique (jamais d'exception).

## Contrat : `js/engine/music.js`
```js
import { Music } from './engine/music.js';
Music.play(style, opts) -> Handle // opts: {pos (spatial si fourni), volume, bus='music', seed}
// styles: 'lofi' (radio du poste de sécu : accords jazz doux, rhodes FM, craquement vinyle, batterie feutrée),
// 'muzak' (musique d'ascenseur de la galerie le jour), 'jazz','disco','rock','classical','synthwave','funk',
// 'chanson' (variété française rétro), 'reggae','metal','ambient','creepy_vinyl' (valse ralentie désaccordée),
// 'music_box' (comptine), 'music_box_wrong', 'arcade','kiddie' (manège), 'cinema_score', 'piano_bar',
// 'radio_static_voice', 'hold_music' (attente téléphonique), 'national_anthem_parody', 'xmas'
// Handle: {stop(fade), setPos(v), setVolume(v), setParam(k,v), playing}
```
Séquenceur procédural (lookahead scheduler), génération déterministe à partir de `seed`.

## Contrat : `js/screens/screens.js`
Écrans = canvas 2D basse résolution (256×192 par défaut) affichés en texture sur les TV/bornes.
```js
import { createScreen, SCREEN_LIST } from './screens/screens.js';
const s = createScreen(kind, opts); // -> {canvas, w, h, update(dt), key(code, down) , dispose(), title, wantsInput, onEvent?}
// kind: 'off' | 'static' | 'channel:news' | 'channel:weather' | 'channel:cartoon' | 'channel:shopping' |
//       'channel:testcard' | 'channel:night' (mire de nuit) | 'vhs:<id>' | 'game:<id>' | 'computer:<id>' |
//       'pos' (terminal de caisse) | 'atm' | 'cinema:<id>' | 'blue' | 'boot:<console>' | 'cctv_offline'
// opts.ctx (optionnel) : {time() -> 'HH:MM', night, flags, emit(name, data)} pour contenus contextuels.
```
`s.update(dt)` redessine (le jeu appelle seulement pour les écrans visibles et proches).
`s.key(code, down)` reçoit `KeyboardEvent.code` quand le joueur « utilise » l'écran (mode jeu). `s.wantsInput` vrai pour
les jeux et l'ordinateur. Les jeux gèrent leur propre score, game over, et appellent `opts.ctx.emit('highscore', {...})`.
VHS : `vhs:<id>` jouent une séquence animée (dessin procédural) ; certaines sont des indices de l'histoire.
`js/screens/lockpick.js` : `startLockpick({difficulty:1..5, onDone(success:boolean, quality:0..1)})` — overlay DOM.
`js/screens/keypad.js` : `startKeypad({title, onDone(code|null)})` — saisie de code.

## Contrat : données (`js/data/*.js`)
Modules sans dépendance, exportent des objets. Utilisés par le jeu et par le wiki (`wiki/` les importe directement).
- `items.js` : `ITEMS` {id: {name, desc, shape, size, color, mat, use, ...}}
- `shops.js` : `SHOPS` [{id, name, floor, slot, w, items, ...}]
- `phone.js` : `PHONE_NUMBERS`
- `events.js` : `EVENT_TEMPLATES`, `buildEventCatalog()` (> 250 événements)
- `story.js` : `NIGHTS` (1..10), `ENDINGS`
- `costumes.js` : `COSTUMES`, `FLASHLIGHTS`
- `lore.js` : notes, livres, VHS, easter eggs
