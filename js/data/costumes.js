// Costumes et lampes torches.

export const COSTUMES = {
  guard: { name: 'Uniforme de gardien', color: 0x1f2a44, color2: 0x3b4a6b, desc: 'Votre tenue réglementaire. Badge « SÉCURITÉ ».', effects: [] },
  bear: { name: 'Costume d\'ours', color: 0xc8873a, color2: 0x8d5a24, desc: 'Bobby vous prend pour l\'un des siens : il vous ignore. Le chat est intrigué.', effects: ['bobby_ignore'] },
  ghost: { name: 'Costume de fantôme', color: 0xf5f5f5, color2: 0xdddddd, desc: 'L\'Ombre vous croit de son côté et vous laisse tranquille. Les braqueurs hésitent.', effects: ['shadow_ignore', 'robbers_hesitate'] },
  police: { name: 'Costume de policier', color: 0x1a237e, color2: 0x0d1450, desc: 'Les braqueurs qui vous voient prennent la fuite.', effects: ['robbers_flee'] },
  firefighter: { name: 'Tenue de pompier', color: 0x263238, color2: 0xffd600, desc: 'Résiste au feu (dégâts -80 %), extincteurs deux fois plus efficaces.', effects: ['fire_resist'] },
  mannequin: { name: 'Body blanc mat', color: 0xf0ece4, color2: 0xe0dcd4, desc: 'Immobile, les mannequins vous prennent pour l\'un des leurs.', effects: ['mannequin_still'] },
  cat: { name: 'Costume de chat', color: 0x212121, color2: 0x424242, desc: 'Le chat errant vous suit partout et vous prévient du danger.', effects: ['cat_friend'] },
  clown: { name: 'Costume de clown', color: 0xff1744, color2: 0x2979ff, desc: 'Bobby a peur des clowns et fuit. Tout le reste vous trouve… agaçant.', effects: ['bobby_flee', 'aggro'] },
  astronaut: { name: 'Combinaison d\'astronaute', color: 0xeceff1, color2: 0x90a4ae, desc: 'Immunisé contre la fumée. Le casque étouffe les sons (on entend sa propre respiration).', effects: ['smoke_immune', 'muffled'] },
};

export const FLASHLIGHTS = {
  none: { name: 'Aucune', intensity: 0, angle: 0.4, range: 0, drain: 0, color: 0xffffff },
  basic: { name: 'Lampe de Gérard', intensity: 13.3, angle: 0.42, range: 26, drain: 1 / 240, color: 0xfff1d6 },
  tactical: { name: 'Lampe tactique', intensity: 26.2, angle: 0.55, range: 40, drain: 1 / 120, color: 0xf4f8ff },
  uv: { name: 'Lampe UV', intensity: 7, angle: 0.38, range: 16, drain: 1 / 200, color: 0x7b3cff, uv: true },
  headlamp: { name: 'Lampe frontale', intensity: 9.1, angle: 0.33, range: 20, drain: 1 / 300, color: 0xfff6e0, head: true },
  cheap: { name: 'Lampe bon marché', intensity: 7.7, angle: 0.45, range: 16, drain: 1 / 150, color: 0xffe0a0, flicker: true },
  phone: { name: 'Lampe du téléphone', intensity: 4.2, angle: 0.6, range: 10, drain: 1 / 400, color: 0xf0f4ff },
  lighter: { name: 'Briquet', intensity: 1, angle: 1.5, range: 6, drain: 0, color: 0xffa040, point: true },
};
