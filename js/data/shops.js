// Magasins du Centre Commercial Hélios.
// Galerie : x ∈ [-66, 66], 11 emplacements de 12 m par côté et par étage.
// side 'N' : z ∈ [8, 22] ; side 'S' : z ∈ [-22, -8]. floor 0 : RDC (y=0), floor 1 : étage (y=5).
// layout : aisles | walls | food | racks | cases | arcade | cinema | salon | music | pets | flowers | office | staff | toilets | court
// unlock : nuit du mode histoire à partir de laquelle le magasin est ouvert (rideau déverrouillé + caméras).

export const SLOT_W = 12;
export const GALLERY_X0 = -66;
// L('a b c', n) → [['a', n], ['b', n], ['c', n]] : assortiment compact. Un exemplaire listé suffit, js/world/stocking.js
// complète ensuite les rayons (facings, présentoirs, réserve) dans la limite du budget d'objets du magasin.
const L = (ids, n = 1) => ids.split(' ').map((id) => [id, n]);

export const SHOPS = [
  // ═════════ REZ-DE-CHAUSSÉE — CÔTÉ NORD ═════════
  { id: 'hyper', name: 'Hypermarché Hélios', floor: 0, side: 'N', slot: 0, w: 4, color: 0x2e7d32, layout: 'aisles', unlock: 2, cams: 3, zone: 'bigstore',
    desc: 'La grande surface du centre : 48 mètres de rayons, fruits et légumes, frais, surgelés, droguerie, et une immense réserve.',
    items: [['apple', 14], ['green_apple', 10], ['banana', 12], ['orange', 12], ['tomato', 10], ['lemon', 8], ['watermelon', 4], ['carrot', 8], ['salad', 6], ['baguette', 8], ['bread', 8], ['milk', 12], ['water', 16], ['soda', 18], ['lemonade', 10], ['juice', 10], ['wine', 12], ['champagne', 4], ['energy_drink', 10], ['chips', 14], ['cereal', 12], ['chocolate', 14], ['cheese', 8], ['saucisson', 6], ['pasta', 14], ['frozen_pizza', 8], ['canned_food', 14], ['eggs', 8], ['flour', 8], ['sugar', 8], ['coffee_pack', 8], ['tea', 6], ['toilet_paper', 14], ['detergent', 8], ['cat_food', 6], ['honey', 6], ['jam', 6], ['yogurt', 8], ['ice_bag', 4], ['battery', 6], ['candle', 6], ['lighter', 4], ['matches', 4], ['sponge', 6], ['bleach', 6], ['baby_bottle', 4], ['basket', 6], ['shopping_cart', 8],
      // fruits & légumes (étals) et cagettes
      ...L('pear peach kiwi plum apricot clementine grapes avocado mango lime potato onion garlic zucchini eggplant pepper_red pepper_green pepper_yellow cucumber mushrooms_box', 1), ...L('pineapple melon cabbage cauliflower leek pumpkin', 1),
      ...L('crate_apples crate_oranges crate_potatoes crate_tomatoes crate_lemons crate_onions crate_peppers crate_clementines crate_pears crate_zucchini crate_avocados crate_melons', 1),
      // pain, petit-déjeuner, biscuits, chocolat
      ...L('brioche_sliced pains_au_lait biscottes', 1), ...L('cereal_choco cereal_honey cereal_flakes cereal_muesli cereal_bobby cereal_fiber', 1),
      ...L('coffee_ground coffee_beans coffee_instant coffee_pods tea_mint tea_earl infusion_night cocoa_powder spread_choco jam_apricot marmalade honey_lavender', 1),
      ...L('biscuit_butter biscuit_choco cookies_pack speculoos madeleines galettes_tin gaufrettes barquettes', 1), ...L('choco_dark choco_milk choco_hazelnut choco_white choco_box candy_bears candy_sour mints_tin', 1),
      // épicerie salée
      ...L('chips_paprika chips_vinegar chips_bbq tortilla_chips chips_tube peanuts pretzels crackers popcorn_micro', 1),
      ...L('pasta_spaghetti pasta_penne pasta_fusilli pasta_coquillettes pasta_tagliatelle pasta_lasagne pasta_farfalle rice_long rice_basmati rice_risotto semoule lentils quinoa puree_flakes', 1),
      ...L('can_peas can_corn can_beans can_tomato can_cassoulet can_chili can_soup can_lentils can_chickpeas can_mushrooms can_peaches can_tuna can_mackerel can_sardines choucroute pack_tuna3 pack_corn3', 1),
      ...L('sauce_tomato sauce_bolo pesto mustard mayonnaise cornichons olives_jar harissa soy_sauce_bottle salt_box pepper_jar herbes_provence bouillon_cubes oil_olive oil_sunflower vinegar balsamic', 1),
      ...L('tray_can_peas tray_can_beans tray_can_tomato tray_can_chickpeas tray_can_mushrooms tray_can_soup tray_can_lentils tray_can_chili tray_can_peaches tray_can_mackerel tray_can_sardines tray_sauce_tomato tray_pesto tray_mustard tray_cornichons tray_olives_jar tray_jam_apricot tray_marmalade tray_honey_lavender tray_spread_choco tray_pepper_jar tray_herbes_provence tray_bouillon_cubes tray_coffee_ground tray_tea_mint tray_tea_earl tray_infusion_night tray_choco_dark tray_choco_milk tray_candy_bar tray_mints_tin tray_gum tray_baby_food tray_baby_food_fruit tray_cat_food_can tray_yogurt_pot tray_dessert_choco', 1),
      // boissons
      ...L('water_sparkling water_small water_lemon soda_cola_big soda_orange ice_tea soda_lemon_lime syrup_grenadine syrup_mint cola_can_zero orange_can juice_apple juice_multi juice_grape juice_tomato juice_kids', 1),
      ...L('pack_water6 pack_sparkling6 pack_cola6 pack_juice_kids', 1), ...L('wine_rose wine_white wine_red_cdr wine_beaujolais cider sparkling_wine beer_blonde beer_amber beer_can pastis rum calvados', 1), ...L('pack_beer6 pack_beercan6', 1),
      // crèmerie & surgelés
      ...L('milk_half milk_whole milk_choco milk_oat yogurt_pot yogurt_straw dessert_choco compote cream_fresh butter cheese_grated cheese_comte cheese_goat ham eggs_12', 1),
      ...L('pack_milk6 pack_yogurt4 pack_yogurt_nat4 pack_dessert4 pack_compote4 frozen_fries frozen_veg fish_sticks ice_cream_tub', 1),
      // droguerie, hygiène, bébé, papier, animaux, bazar
      ...L('shampoo_family shampoo_anti conditioner shower_gel soap_liquid shaving_foam deo_roll toothpaste toothbrush_pack cotton_swabs tissue_box hand_cream razors', 1),
      ...L('diapers baby_wipes baby_food baby_food_fruit baby_milk', 1),
      ...L('dish_soap cleaner_multi glass_cleaner softener laundry_pods dishwasher_tabs wc_gel insecticide air_freshener floor_cleaner trash_bags rubber_gloves sponges_pack', 1),
      ...L('tp_pack kitchen_roll alu_foil cling_film paper_napkins paper_plates plastic_cups', 1),
      ...L('cat_food_premium cat_food_can pack_catfood4 cat_treats dog_food_bag dog_treats cat_litter', 1),
      ...L('batteries_aaa batteries_9v bulb_led_pack tealights charcoal freezer_bags umbrella_compact', 1),
      // réserve
      ...L('case_pasta_spaghetti case_pasta_penne case_rice_long case_can_peas case_can_tomato case_can_cassoulet case_sauce_tomato case_cereal_choco case_cereal_honey case_coffee_ground case_biscuit_butter case_chips case_soda case_water case_wine case_beer_blonde case_milk_half case_shampoo_family case_shower_gel case_detergent case_dish_soap case_tp_pack case_cat_food case_dog_food_bag case_diapers case_battery case_candle', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_sauce_bolo tray_mayonnaise tray_harissa tray_soy_sauce_bottle tray_salt_box tray_cola_can_zero tray_orange_can tray_juice_apple tray_juice_multi tray_milk_choco tray_milk_whole', 1),
      ...L('tray_milk_oat tray_cream_fresh tray_butter tray_cheese_comte tray_yogurt_straw tray_compote tray_shampoo_anti tray_conditioner tray_soap_liquid tray_shaving_foam tray_deo_roll', 1),
      ...L('tray_cotton_swabs tray_hand_cream tray_cleaner_multi tray_glass_cleaner tray_wc_gel tray_insecticide tray_air_freshener tray_cat_treats tray_dog_treats tray_bulb_led_pack tray_coffee_instant', 1),
      ...L('tray_cocoa_powder tray_pasta_fusilli tray_pasta_coquillettes tray_pasta_lasagne tray_rice_risotto tray_semoule tray_quinoa tray_choucroute tray_vinegar tray_balsamic tray_oil_olive', 1),
      ...L('tray_oil_sunflower tray_syrup_grenadine tray_syrup_mint tray_juice_tomato tray_juice_grape tray_beer_amber tray_cider tray_wine_rose tray_wine_white tray_wine_red_cdr tray_wine_beaujolais', 1),
      ...L('tray_water_small tray_choco_hazelnut tray_choco_white tray_chips_tube tray_baby_milk tray_jam tray_honey tray_canned_food tray_chocolate tray_lighter tray_matches tray_batteries_aaa', 1),
      ...L('tray_batteries_9v', 1)
    ],
    fixed: [['register', 4], ['fridge', 4], ['freezer', 2]] },
  { id: 'pharma', name: 'Pharmacie du Centre', floor: 0, side: 'N', slot: 4, w: 1, color: 0x00a152, layout: 'walls', unlock: 9, cams: 1,
    desc: 'Croix verte clignotante. De quoi soigner les blessures… et calmer les nerfs.',
    items: [['paracetamol', 8], ['vitamins', 6], ['sleeping_pills', 3], ['bandage', 8], ['first_aid', 2], ['cough_syrup', 5], ['thermometer', 4], ['sanitizer', 6], ['sunscreen', 5], ['mask_medical', 4], ['earplugs', 5], ['glucose', 5],
      ...L('ibuprofen aspirin paracetamol_1g throat_lozenges magnesium melatonin energy_ampoules vitamin_d homeopathy', 1),
      ...L('band_aids compresses antiseptic arnica_gel ice_pack elastic_bandage face_cream lip_balm aftersun mosquito_spray mouthwash dental_floss mask_ffp2 hot_water_bottle herbal_tea_sleep baby_powder', 1),
      ...L('toothpaste toothbrush_pack hand_cream baby_wipes baby_milk', 1),
      ...L('tray_ibuprofen tray_aspirin tray_paracetamol tray_throat_lozenges tray_band_aids tray_vitamin_d tray_homeopathy', 1), ...L('case_ibuprofen case_band_aids', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_hand_cream tray_baby_milk tray_paracetamol_1g tray_magnesium tray_melatonin tray_energy_ampoules tray_compresses tray_antiseptic tray_arnica_gel tray_elastic_bandage tray_face_cream', 1),
      ...L('tray_aftersun tray_mosquito_spray tray_mouthwash tray_dental_floss tray_herbal_tea_sleep tray_baby_powder tray_lip_balm tray_vitamins tray_sanitizer tray_sunscreen tray_cough_syrup', 1),
      ...L('tray_glucose tray_sleeping_pills tray_earplugs tray_bandage', 1)
    ],
    fixed: [['register', 1]] },
  { id: 'boulangerie', name: 'Boulangerie Au Bon Grain', floor: 0, side: 'N', slot: 5, w: 1, color: 0xc8873a, layout: 'food', unlock: 3, cams: 1,
    desc: 'L\'odeur du pain chaud flotte encore la nuit.',
    items: [['baguette', 12], ['croissant', 14], ['pain_choc', 14], ['eclair', 8], ['tarte', 4], ['macarons', 6], ['birthday_cake', 2], ['brioche', 6], ['cookie', 10], ['flan', 6],
      ...L('pain_campagne pain_complet ficelle pain_raisins chausson millefeuille religieuse canele fougasse sandwich_ham chouquettes', 1), ...L('tarte_citron paris_brest quiche galette_rois', 1),
      ...L('case_croissant case_baguette', 1)
    ],
    fixed: [['register', 1], ['oven', 1], ['coffee_maker', 1]] },
  { id: 'fleuriste', name: 'Fleurs de Lune', floor: 0, side: 'N', slot: 6, w: 1, color: 0xad1457, layout: 'flowers', unlock: 9, cams: 1,
    desc: 'Fleuriste. Les lys blancs sentent fort dans le noir.',
    items: [['roses', 6], ['tulips', 6], ['sunflower', 5], ['cactus', 6], ['orchid', 5], ['bonsai', 2], ['watering_can', 3], ['seeds', 6], ['vase', 6], ['lilies', 4], ['wreath', 1],
      ...L('bouquet_field peonies gerberas carnations', 1), ...L('chrysanthemums bucket_roses bucket_tulips', 1),
      ...L('lavender_pot fern succulent cactus_tall basil_pot orchid_white bonsai_juniper', 1), ...L('ficus monstera olive_tree', 1),
      ...L('potting_soil pot_terracotta flower_food seeds_tomato seeds_sunflower gift_ribbon greeting_card', 1), ...L('case_flower_food case_potting_soil', 1)
    ],
    fixed: [['register', 1]] },
  { id: 'quincaillerie', name: 'Quincaillerie Martin', floor: 0, side: 'N', slot: 7, w: 1, color: 0xe65100, layout: 'aisles', unlock: 6, cams: 1,
    desc: 'Tout pour bricoler… ou se défendre. Cadenas, pied-de-biche, piles, escabeaux.',
    items: [['crowbar', 2], ['hammer', 4], ['screwdriver', 6], ['wrench', 3], ['drill', 2], ['saw', 2], ['padlock', 8], ['chain', 3], ['duct_tape', 6], ['battery', 10], ['flashlight_spare', 4], ['flashlight_tac', 1], ['light_bulbs', 4], ['bulb', 6], ['fuse', 6], ['gloves', 4], ['helmet', 3], ['toolbox', 2], ['wd40', 4], ['mousetrap', 6], ['ladder', 2], ['rope', 3], ['paint_can', 6], ['nails', 4], ['measuring_tape', 4], ['extension_cord', 4], ['headlamp', 2],
      ...L('pliers cutter level paint_brush paint_roller trowel mallet hacksaw chisel screwdriver_set', 1),
      ...L('screws_box wall_plugs cable_ties hinge door_handle padlock_code allen_keys drill_bits glue_tube silicone electrical_tape socket_strip sandpaper safety_glasses ear_muffs dust_mask flashlight_led', 1),
      ...L('bucket broom garden_hose', 1), ...L('paint_white paint_red paint_green paint_yellow spray_paint varnish', 1), ...L('batteries_aaa batteries_9v bulb_led_pack', 1),
      ...L('case_screws_box case_paint_white case_light_bulbs', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_bulb_led_pack tray_wall_plugs tray_cable_ties tray_hinge tray_allen_keys tray_drill_bits tray_door_handle tray_glue_tube tray_electrical_tape tray_silicone tray_spray_paint', 1),
      ...L('tray_varnish tray_paint_yellow tray_padlock_code tray_padlock tray_nails tray_measuring_tape tray_batteries_aaa tray_batteries_9v tray_fuse tray_mousetrap tray_duct_tape tray_wd40', 1),
      ...L('tray_gloves', 1)
    ],
    fixed: [['register', 1]] },
  { id: 'animalerie', name: 'Animalerie Arche de Noé', floor: 0, side: 'N', slot: 8, w: 1, color: 0x0097a7, layout: 'pets', unlock: 8, cams: 1,
    desc: 'Aquariums qui bullent, Coco le perroquet, un hamster insomniaque et un python.',
    items: [['fish_food', 6], ['bird_seed', 5], ['dog_toy', 6], ['hamster_ball', 3], ['leash', 4], ['cat_toy', 4], ['pet_bed', 3], ['cat_food', 6], ['pet_bowl', 4],
      ...L('hamster_food rabbit_hay aquarium_gravel aquarium_plant fish_net dog_collar cat_scratcher pet_brush dog_ball chew_bone squeaky_chicken pet_shampoo bird_toy litter_tray', 1),
      ...L('cat_food_premium cat_food_can cat_treats dog_food_bag dog_treats cat_litter pack_catfood4', 1), ...L('case_fish_food case_cat_food', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_cat_food_can tray_cat_treats tray_dog_treats tray_hamster_food tray_pet_shampoo tray_dog_ball tray_bird_seed tray_fish_food', 1)
    ],
    fixed: [['aquarium', 3], ['parrot_cage', 1], ['hamster_cage', 1], ['terrarium', 1], ['register', 1]] },
  { id: 'bijouterie', name: 'Bijouterie Orfèvre & Fils', floor: 0, side: 'N', slot: 9, w: 1, color: 0xffd700, layout: 'cases', unlock: 6, cams: 2,
    desc: 'Vitrines blindées (enfin, presque). La cible préférée des braqueurs.',
    items: [['ring', 8], ['diamond_ring', 4], ['necklace', 6], ['watch', 6], ['bracelet', 6], ['earrings', 8], ['cursed_brooch', 1],
      ...L('ring_silver ring_ruby ring_sapphire pendant_heart chain_gold earrings_pearl bracelet_charm watch_sport watch_gold', 1), ...L('jewel_box cufflinks', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_ring_silver tray_ring_ruby tray_ring_sapphire tray_earrings_pearl tray_ring tray_earrings tray_watch_sport tray_watch_gold tray_watch tray_cufflinks tray_bracelet_charm', 1),
      ...L('tray_pendant_heart tray_chain_gold tray_bracelet tray_necklace', 1)
    ],
    fixed: [['register', 1], ['safe', 1]] },
  { id: 'tabac', name: 'Tabac-Presse Le Balto', floor: 0, side: 'N', slot: 10, w: 1, color: 0xc62828, layout: 'walls', unlock: 3, cams: 1,
    desc: 'Journaux, magazines, jeux à gratter, briquets.',
    items: [['newspaper', 10], ['old_newspaper', 1], ['magazine', 12], ['comic', 8], ['scratch_card', 14], ['lottery', 6], ['postcard', 10], ['city_map', 4], ['gum', 12], ['candy_bar', 12], ['lighter', 6], ['matches', 6], ['battery', 4],
      ...L('mag_auto mag_people mag_tv mag_cuisine mag_sport mag_crosswords mag_mystery mag_bobby mag_deco mag_games mag_rock mag_women', 1), ...L('newspaper_local newspaper_sport', 1),
      ...L('scratch_cash scratch_astro', 1), ...L('stamps envelopes ballpoint_pen school_notebook phone_card postcard_night postcard_fountain lighter_storm lighter_disposable keychain_torch road_map crossword_book', 1),
      ...L('mints_tin candy_bears chips_paprika', 1), ...L('tray_candy_bar tray_gum tray_mints_tin', 1), ...L('case_magazine case_newspaper', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_lighter_disposable tray_lighter_storm tray_lighter tray_matches row_comics pile_crossword_book pile_magazine pile_comic pile_mag_auto pile_mag_people pile_mag_tv pile_mag_cuisine', 1),
      ...L('pile_mag_sport pile_mag_crosswords pile_mag_mystery pile_mag_deco pile_mag_games pile_mag_rock pile_mag_women pile_newspaper pile_newspaper_local pile_newspaper_sport', 1)
    ],
    fixed: [['register', 1]] },

  // ═════════ REZ-DE-CHAUSSÉE — CÔTÉ SUD ═════════
  { id: 'cafe', name: 'Café Le Petit Noir', floor: 0, side: 'S', slot: 0, w: 1, color: 0x6d4c41, layout: 'food', unlock: 1, cams: 0,
    desc: 'Juste à côté du poste de sécurité. La machine à espresso marche toujours.',
    items: [['coffee', 6], ['cappuccino', 4], ['hot_choc', 4], ['tea_cup', 4], ['croissant', 6], ['muffin', 6], ['sugar_packet', 12], ['cookie', 6],
      ...L('espresso cafe_creme latte orange_juice_glass tartine croque_monsieur cake_slice', 1), ...L('teapot mug_helios sugar_bowl', 1), ...L('pain_choc madeleines', 1), ...L('case_coffee_pack', 1)
    ],
    fixed: [['coffee_maker', 2], ['register', 1], ['chair', 8]] },
  { id: 'jouets', name: 'Royaume du Jouet', floor: 0, side: 'S', slot: 1, w: 2, color: 0xffb300, layout: 'walls', unlock: 1, cams: 2,
    desc: 'Le premier magasin que vous surveillez. Bobby l\'Ourson, la mascotte, vous accueille à l\'entrée. Il a l\'air de sourire.',
    items: [['teddy', 10], ['bobby_plush', 6], ['bunny_plush', 6], ['dino_plush', 6], ['cat_plush', 4], ['robot', 6], ['toy_car', 10], ['toy_train', 4], ['doll', 6], ['porcelain_doll', 2], ['jack_box', 4], ['ball', 12], ['beach_ball', 4], ['music_box', 3], ['spinning_top', 6], ['yoyo', 8], ['rubik', 6], ['xylophone', 3], ['toy_drum', 3], ['dart_gun', 4], ['bubble_gun', 4], ['toy_horn', 4], ['dice', 6], ['lego', 6], ['puzzle', 4], ['board_game', 4], ['slime', 6], ['kaleidoscope', 4], ['toy_phone', 3], ['nightlight', 4], ['toy_blocks', 4], ['rc_car', 3], ['rc_remote', 3],
      ...L('plush_panda plush_elephant plush_lion plush_unicorn plush_penguin plush_dog plush_fox plush_frog plush_snake plush_bobby_mini', 1),
      ...L('toy_dollhouse toy_firetruck toy_racetrack toy_robot_kit toy_castle toy_kitchen toy_doctor toy_magic toy_chemistry toy_figure_astro toy_figure_knight toy_cars_5 toy_train_set puzzle_500', 1),
      ...L('game_cards game_colors game_dominos game_chess game_memo game_quiz', 1),
      ...L('water_gun soap_bubbles crayons chalk_box play_dough balloons_bag party_popper toy_microphone baby_rattle stacking_rings kite jump_rope toy_piano', 1),
      ...L('case_toy_car case_lego case_teddy', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_toy_figure_astro tray_toy_figure_knight tray_game_cards tray_game_colors tray_soap_bubbles tray_balloons_bag tray_party_popper tray_rubik tray_slime tray_toy_car tray_ball', 1),
      ...L('tray_dice', 1)
    ],
    fixed: [['register', 1], ['kiddie_ride', 1]] },
  { id: 'electro', name: 'ElectroMaison', floor: 0, side: 'S', slot: 3, w: 2, color: 0x1565c0, layout: 'walls', unlock: 3, cams: 2,
    desc: 'Électroménager : murs de téléviseurs, micro-ondes, grille-pains… et un câblage douteux.',
    items: [['blender', 4], ['toaster', 5], ['kettle', 5], ['fan', 4], ['lamp', 6], ['vacuum', 3], ['hairdryer', 4], ['radio', 5], ['speaker', 4], ['toothbrush', 4], ['shaver', 3], ['iron', 3], ['smoke_detector', 4], ['bread', 4],
      ...L('box_toaster box_kettle box_blender box_hairdryer box_iron box_fan box_radio box_lamp box_vacuum box_shaver box_toothbrush box_speaker', 1), ...L('radio_alarm kitchen_scale tv_remote', 1)
    ],
    fixed: [['tv', 10], ['crt_tv', 2], ['microwave', 4], ['washer', 3], ['dishwasher', 2], ['fridge', 3], ['oven', 2], ['coffee_maker', 2], ['register', 1]] },
  { id: 'pixel', name: 'Pixel Planet', floor: 0, side: 'S', slot: 5, w: 1, color: 0x7c4dff, layout: 'walls', unlock: 4, cams: 1,
    desc: 'Jeux vidéo, consoles et rétro-gaming. Kevin, le vendeur, a laissé sa console allumée.',
    items: [['cart_snake', 2], ['cart_pong', 2], ['cart_breakout', 2], ['cart_invaders', 2], ['cart_blocs', 2], ['cart_racer', 2], ['cart_platformer', 2], ['cart_glouton', 2], ['cart_oiseau', 2], ['cart_demineur', 2], ['cart_simon', 2], ['pocketboy', 3], ['controller', 6], ['vr_headset', 2], ['gaming_headset', 3], ['figurine', 6], ['game_box', 14],
      ...L('game_kart game_dragon game_zombie game_foot game_ninja game_puzzle game_farm game_horror', 1), ...L('console_box pocketboy_box controller_wireless memory_card game_guide arcade_stick figurine_hero poster_game', 1),
      ...L('case_game_box case_cart_snake', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_cart_pong tray_cart_breakout tray_cart_invaders tray_cart_blocs tray_cart_racer tray_cart_platformer tray_cart_glouton tray_cart_oiseau tray_cart_demineur tray_cart_simon', 1),
      ...L('tray_pocketboy tray_memory_card row_games_a row_games_b', 1)
    ],
    fixed: [['console_station', 3], ['register', 1], ['office_chair', 1]] },
  { id: 'videoclub', name: 'Rétro Vidéo Club', floor: 0, side: 'S', slot: 6, w: 1, color: 0xd81b60, layout: 'walls', unlock: 4, cams: 1,
    desc: 'Vinyles, cassettes VHS et néons roses. Une étagère « Interdit aux moins de 18 ans »… et une cassette sans étiquette.',
    items: [...['jazz', 'disco', 'rock', 'classical', 'synthwave', 'funk', 'chanson', 'reggae', 'metal', 'ambient', 'piano_bar', 'xmas'].map(g => ['vinyl_' + g, 2]), ['vinyl_creepy_vinyl', 1],
      ...['cartoon', 'aerobic', 'cooking', 'birthday', 'nature', 'kungfu', 'western', 'scifi', 'horror', 'karaoke', 'bobby_ad'].map(t => ['vhs_' + t, 2]), ['walkman', 3], ['audio_tape', 8], ['movie_poster', 3],
      ...L('dvd_basement dvd_action dvd_comedy dvd_romance dvd_scifi dvd_cartoon dvd_western dvd_thriller dvd_kungfu dvd_musical', 1), ...L('cd_album_rock cd_album_chanson cd_album_electro vhs_blank', 1), ...L('vhs_sleeve_horror popcorn_micro_vc', 1),
      ...L('case_vhs_blank', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('row_dvd_a row_dvd_b row_vhs_a row_vhs_b', 1)
    ],
    fixed: [['turntable', 2], ['vcr', 2], ['register', 1]] },
  { id: 'librairie', name: 'Librairie La Page', floor: 0, side: 'S', slot: 7, w: 1, color: 0x5d4037, layout: 'walls', unlock: 5, cams: 1,
    desc: 'Des milliers de livres. Certains racontent l\'histoire du centre.',
    items: [['book_horror', 4], ['book_cook', 4], ['book_kids', 4], ['book_history', 3], ['dictionary', 2], ['book_electric', 2], ['book_cats', 3], ['book_poetry', 3], ['mall_guide', 6], ['globe', 2], ['notebook', 4], ['comic', 6],
      ...L('novel_polar novel_romance novel_scifi novel_fantasy novel_hugo novel_horror2 comic_pepito manga_ninja kids_counting cookbook_pastry travel_normandy atlas_world dict_english coloring_book sudoku_book diary_2 crossword_book', 1),
      ...L('case_book_horror case_novel_polar', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('row_novel_polar row_novel_romance row_novel_scifi row_novel_fantasy row_classics row_manga row_comics row_kids row_cookbooks row_travel row_dicts row_history pile_novel_polar', 1),
      ...L('pile_novel_fantasy pile_novel_scifi pile_comic_pepito pile_coloring_book pile_atlas_world pile_sudoku_book pile_crossword_book pile_cookbook_pastry pile_kids_counting pile_book_history', 1),
      ...L('pile_diary_2 pile_mall_guide pile_comic', 1)
    ],
    fixed: [['register', 1], ['chair', 2]] },
  { id: 'mobizone', name: 'MobiZone', floor: 0, side: 'S', slot: 8, w: 1, color: 0x00acc1, layout: 'walls', unlock: 7, cams: 1,
    desc: 'Téléphonie : portables, tablettes, batteries externes.',
    items: [['mobile_phone', 3], ['smartphone', 6], ['tablet', 2], ['earbuds', 6], ['charger', 8], ['phone_case', 10], ['powerbank', 4], ['walkie', 4],
      ...L('phone_box_nova phone_box_flip screen_protector usb_cable car_charger selfie_stick earphones_wired smartwatch sim_card phone_case_flower phone_case_black', 1), ...L('case_smartphone', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_phone_box_nova tray_phone_box_flip tray_screen_protector tray_usb_cable tray_car_charger tray_earphones_wired tray_phone_case_flower tray_phone_case_black tray_smartwatch', 1),
      ...L('tray_charger tray_earbuds tray_powerbank tray_mobile_phone tray_smartphone', 1)
    ],
    fixed: [['register', 1]] },
  { id: 'opticien', name: 'Optique Clairvoyance', floor: 0, side: 'S', slot: 9, w: 1, color: 0x4fc3f7, layout: 'walls', unlock: 9, cams: 1,
    desc: 'Lunettes de soleil, lunettes 3D, loupes. Le tableau d\'acuité cache quelque chose.',
    items: [['sunglasses', 8], ['glasses_3d', 4], ['magnifier', 3], ['contact_lens', 4], ['binoculars', 2],
      ...L('glasses_round glasses_cateye glasses_square glasses_kids reading_glasses sunglasses_aviator sunglasses_sport', 1), ...L('glasses_case lens_cloth opera_glasses', 1), ...L('case_sunglasses', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_glasses_round tray_glasses_cateye tray_glasses_square tray_glasses_kids tray_reading_glasses tray_sunglasses_aviator tray_sunglasses_sport tray_sunglasses tray_glasses_case', 1)
    ],
    fixed: [['eye_chart', 1], ['register', 1], ['mirror_wall', 1]] },
  { id: 'parfumerie', name: 'Parfumerie Essence', floor: 0, side: 'S', slot: 10, w: 1, color: 0xce93d8, layout: 'walls', unlock: 9, cams: 1,
    desc: 'Les parfums se mélangent dans l\'air immobile.',
    items: [['perfume', 6], ['perfume2', 6], ['lipstick', 8], ['compact_mirror', 4], ['soap', 8], ['shampoo', 6], ['nail_polish', 8], ['deodorant', 6],
      ...L('perf_rose perf_amber perf_citrus perf_vanilla perf_helios perf_orange_blossom perf_mini perf_box_rose perf_box_amber', 1),
      ...L('lipstick_red lipstick_pink lipstick_nude mascara eyeliner foundation powder_compact eyeshadow nail_red nail_black nail_gold day_cream serum body_lotion bath_salts bath_bomb makeup_brush gift_set_beauty', 1),
      ...L('tray_nail_red tray_nail_black tray_nail_gold tray_lipstick_red tray_day_cream', 1), ...L('case_perfume case_soap', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_perf_rose tray_perf_amber tray_perf_citrus tray_perf_vanilla tray_perf_helios tray_perf_orange_blossom tray_perf_mini tray_lipstick_pink tray_lipstick_nude tray_mascara', 1),
      ...L('tray_eyeliner tray_foundation tray_serum tray_body_lotion tray_bath_salts tray_powder_compact tray_bath_bomb tray_deodorant tray_shampoo tray_compact_mirror tray_makeup_brush', 1)
    ],
    fixed: [['register', 1], ['mirror_wall', 1]] },

  // ═════════ ÉTAGE — CÔTÉ NORD ═════════
  { id: 'mode', name: 'Élégance — Prêt-à-porter', floor: 1, side: 'N', slot: 0, w: 2, color: 0x880e4f, layout: 'racks', unlock: 5, cams: 2,
    desc: 'Vêtements, cabines d\'essayage et une douzaine de mannequins. Comptez-les. Recomptez-les.',
    items: [['shirt_white', 6], ['shirt_hawaii', 4], ['jacket_leather', 4], ['dress_red', 4], ['hoodie', 6], ['suit', 3], ['raincoat', 4], ['sweater', 4], ['hat_fedora', 4], ['cap', 6], ['beanie', 6], ['scarf', 6], ['handbag', 4], ['sunglasses', 4],
      ...L('tshirt_white tshirt_helios mariniere polo_navy shirt_check shirt_blue jeans chinos skirt_pleated dress_flower dress_black blazer coat_wool down_jacket cardigan sweater_cable hoodie_grey', 1),
      ...L('scarf_silk tie_red gloves_leather beret hat_straw socks_pack belt_leather wallet backpack tote_bag', 1), ...L('case_tshirt_white case_jeans', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_sunglasses', 1)
    ],
    fixed: [['mannequin', 12], ['register', 1], ['mirror_wall', 2]] },
  { id: 'chaussures', name: 'Pas de Deux — Chaussures', floor: 1, side: 'N', slot: 2, w: 1, color: 0x6a1b9a, layout: 'walls', unlock: 5, cams: 1,
    desc: 'Baskets silencieuses, escarpins bruyants. Vos pas comptent.',
    items: [['sneakers', 6], ['heels', 6], ['boots', 4], ['slippers', 4], ['shoe_box', 12],
      ...L('shoes_derby shoes_running shoes_canvas shoes_sandals shoes_chelsea shoes_espadrilles shoes_ballerinas shoes_kids_light shoes_rain_boots shoes_moccasins', 1),
      ...L('shoebox_running shoebox_derby shoebox_boots shoebox_canvas shoebox_kids', 1), ...L('shoe_polish insoles shoelaces shoe_horn', 1), ...L('case_sneakers case_shoebox_running', 1)
    ],
    fixed: [['register', 1], ['bench', 1], ['mirror_wall', 1]] },
  { id: 'sport', name: 'Hélios Sport', floor: 1, side: 'N', slot: 3, w: 1, color: 0x2962ff, layout: 'walls', unlock: 5, cams: 1,
    desc: 'Ballons, battes, haltères, camping et lunettes de vision nocturne.',
    items: [['football', 6], ['basketball', 6], ['tennis_ball', 10], ['racket', 4], ['baseball_bat', 3], ['dumbbell', 4], ['yoga_mat', 4], ['skateboard', 3], ['boxing_gloves', 3], ['whistle', 6], ['air_horn', 3], ['energy_bar', 10], ['sleeping_bag', 3], ['golf_club', 3], ['headlamp', 3], ['night_goggles', 1], ['water', 6],
      ...L('volleyball rugby_ball handball frisbee petanque_ball tennis_balls_tube shuttlecocks badminton_racket pingpong_set kettlebell jump_rope_pro water_bottle_sport isotonic protein_bar energy_gel', 1),
      ...L('swim_goggles swim_cap jersey_foot shorts_sport headband shin_guards compass thermos bike_helmet', 1), ...L('tray_energy_bar tray_protein_bar', 1), ...L('case_tennis_ball case_energy_bar', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_energy_gel tray_tennis_balls_tube tray_shuttlecocks tray_isotonic tray_water_bottle_sport tray_petanque_ball tray_compass tray_whistle tray_thermos', 1)
    ],
    fixed: [['tent', 1], ['bike', 2], ['basket_hoop', 1], ['register', 1]] },
  { id: 'instruments', name: 'Do Ré Mi Musique', floor: 1, side: 'N', slot: 4, w: 1, color: 0x8d6e63, layout: 'music', unlock: 5, cams: 1,
    desc: 'Pianos, batterie, guitares. Tout est jouable. Parfois, le piano joue seul.',
    items: [['guitar', 3], ['electric_guitar', 2], ['violin', 2], ['trumpet', 2], ['flute', 4], ['maracas', 4], ['triangle', 3], ['harmonica', 4], ['tambourine', 3], ['metronome', 3], ['sheet_music', 6],
      ...L('ukulele bass_guitar ocarina kazoo castanets drumsticks bongos cymbal guitar_strings guitar_picks tuner songbook', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_guitar_picks tray_harmonica tray_castanets tray_tuner tray_ocarina tray_metronome', 1)
    ],
    fixed: [['piano', 1], ['organ', 1], ['synth_keyboard', 1], ['drum_kit', 1], ['register', 1]] },
  { id: 'costumes', name: 'Mille Masques — Déguisements', floor: 1, side: 'N', slot: 5, w: 1, color: 0x6200ea, layout: 'racks', unlock: 7, cams: 1,
    desc: 'Costumes et masques. Certains costumes changent la façon dont les choses vous perçoivent.',
    items: [['costume_bear', 1], ['costume_ghost', 2], ['costume_police', 1], ['costume_firefighter', 1], ['costume_mannequin', 1], ['costume_cat', 1], ['costume_clown', 1], ['costume_astronaut', 1], ['mask_clown', 3], ['mask_pig', 3], ['mask_skull', 3], ['wig', 3], ['witch_hat', 3], ['magic_wand', 4], ['plastic_sword', 4], ['cape', 3], ['fake_mustache', 6],
      ...L('mask_witch mask_vampire mask_zombie mask_venice hat_pirate crown_gold top_hat cowboy_hat clown_nose vampire_teeth eyepatch wig_blonde fake_blood face_paint confetti_bag pirate_hook party_popper', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_party_popper tray_fake_mustache tray_vampire_teeth tray_eyepatch tray_fake_blood tray_confetti_bag', 1)
    ],
    fixed: [['mannequin', 3], ['register', 1], ['mirror_wall', 1]] },
  { id: 'coiffeur', name: 'Salon Tif\'Hair', floor: 1, side: 'N', slot: 6, w: 1, color: 0xf06292, layout: 'salon', unlock: 8, cams: 1,
    desc: 'Fauteuils qui tournent, têtes à perruque qui fixent le vide.',
    items: [['scissors', 4], ['comb', 6], ['clippers', 3], ['hairdryer', 3], ['shampoo', 6], ['hair_spray', 5], ['wig_head', 6],
      ...L('shampoo_pro hair_mask hair_wax hair_dye hairbrush hair_clips hair_ties curling_iron salon_towel water_spray', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_shampoo tray_shampoo_pro tray_hair_mask tray_hair_wax tray_hair_dye tray_hair_clips tray_hair_ties tray_water_spray tray_hair_spray', 1)
    ],
    fixed: [['salon_chair', 4], ['sink', 2], ['mirror_wall', 3], ['register', 1]] },
  { id: 'photo', name: 'Flash Photo', floor: 1, side: 'N', slot: 7, w: 1, color: 0xff5252, layout: 'walls', unlock: 8, cams: 1,
    desc: 'Photomaton, appareils instantanés et vieux albums du centre.',
    items: [['polaroid', 3], ['disposable_cam', 6], ['photo_frame', 8], ['film_roll', 10], ['photo_album', 2],
      ...L('camera_compact film_pack photo_paper frame_wood frame_gold album_blank tripod camera_bag camera_lens flash_unit', 1), ...L('case_film_roll', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_film_pack tray_camera_lens tray_disposable_cam tray_flash_unit tray_camera_compact', 1)
    ],
    fixed: [['photobooth', 1], ['register', 1]] },
  { id: 'deco', name: 'Déco & Lumières', floor: 1, side: 'N', slot: 8, w: 1, color: 0xffa000, layout: 'walls', unlock: 8, cams: 1,
    desc: 'Lampes, horloges, boules à neige… et des poupées de porcelaine.',
    items: [['lamp', 6], ['lava_lamp', 4], ['disco_ball', 2], ['string_lights', 4], ['cuckoo_clock', 2], ['wall_clock', 4], ['snow_globe', 6], ['wind_chime', 4], ['cushion', 8], ['candle_set', 4], ['neon_sign', 2], ['porcelain_doll', 4], ['candle', 8],
      ...L('cushion_velvet cushion_stripes plaid vase_glass candle_scented candle_pillar table_lamp globe_lamp clock_wall_retro clock_station diffuser cat_figurine fake_plant wicker_basket wood_tray deco_bowl mug_moon tea_towel photo_frame_deco', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_candle_scented tray_candle_pillar tray_diffuser', 1)
    ],
    fixed: [['mirror_deco', 2], ['register', 1]] },
  { id: 'arcade', name: 'Galaxy Arcade', floor: 1, side: 'N', slot: 9, w: 2, color: 0xd500f9, layout: 'arcade', unlock: 8, cams: 2,
    desc: 'Bornes d\'arcade, machine à pinces, air hockey. Les écrans d\'attente clignotent toute la nuit.',
    items: [['token', 20], ['prize_plush', 6],
      ...L('prize_robot prize_ball prize_keychain prize_candy token_bag', 1)
    ],
    fixed: [['arcade_invaders', 1], ['arcade_racer', 1], ['arcade_glouton', 1], ['arcade_blocs', 1], ['arcade_platformer', 1], ['arcade_oiseau', 1], ['arcade_breakout', 1], ['arcade_snake', 1], ['arcade_simon', 1], ['claw_machine', 2], ['token_machine', 1], ['air_hockey', 1], ['basket_machine', 1], ['dance_machine', 1]] },

  // ═════════ ÉTAGE — CÔTÉ SUD ═════════
  { id: 'pizzeria', name: 'Pizzeria Napoli', floor: 1, side: 'S', slot: 0, w: 1, color: 0xd32f2f, layout: 'food', unlock: 8, cams: 1,
    desc: 'Four à bois, pizzas et fontaine à soda.',
    items: [['pizza', 4], ['pizza_slice', 8], ['pizza_box', 6], ['frozen_pizza', 4], ['soda', 8],
      ...L('pizza_margherita pizza_reine calzone tiramisu parmesan_shaker chili_oil', 1), ...L('case_pizza_box', 1)
    ],
    fixed: [['pizza_oven', 1], ['soda_fountain', 1], ['register', 1], ['chair', 6]] },
  { id: 'burger', name: 'Big Burger', floor: 1, side: 'S', slot: 1, w: 1, color: 0xffc107, layout: 'food', unlock: 8, cams: 1,
    desc: 'Burgers, frites, milkshakes. La friteuse est encore tiède.',
    items: [['burger', 8], ['fries', 8], ['milkshake', 6], ['nuggets', 6], ['ketchup', 4], ['soda', 6],
      ...L('cheeseburger double_burger chicken_wrap onion_rings salad_box sundae_caramel sauce_sachet', 1), ...L('case_fries', 1)
    ],
    fixed: [['fryer', 2], ['soda_fountain', 1], ['register', 1], ['chair', 6]] },
  { id: 'sushi', name: 'Sushi Zen', floor: 1, side: 'S', slot: 2, w: 1, color: 0x263238, layout: 'food', unlock: 8, cams: 1,
    desc: 'Le tapis roulant tourne encore… pourquoi ?',
    items: [['sushi', 8], ['maki', 8], ['wasabi', 6], ['green_tea', 8], ['chopsticks', 12],
      ...L('nigiri_salmon california_roll bento edamame miso_soup mochi', 1)
    ],
    fixed: [['conveyor', 1], ['rice_cooker', 1], ['register', 1], ['chair', 6]] },
  { id: 'cinema', name: 'Ciné Hélios', floor: 1, side: 'S', slot: 3, w: 2, color: 0x1a237e, layout: 'cinema', unlock: 8, cams: 2,
    desc: 'Une salle de 60 places, un projecteur et une machine à pop-corn. Rang M, siège 13.',
    items: [['popcorn', 6], ['ticket', 3], ['glasses_3d', 6], ['candy_bar', 6], ['film_reel', 2], ['soda', 6],
      ...L('nachos popcorn_large soda_cup_large candy_box_cinema choco_bites eskimo cinema_program', 1), ...L('case_soda_cup_large', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_candy_bar', 1)
    ],
    fixed: [['popcorn_machine', 1], ['projector', 1], ['register', 1]] },
  { id: 'glacier', name: 'Glacier Banquise', floor: 1, side: 'S', slot: 5, w: 1, color: 0x81d4fa, layout: 'food', unlock: 9, cams: 1,
    desc: 'Glaces, coupes et gaufres.',
    items: [['ice_cream', 10], ['sundae', 6], ['waffle', 8],
      ...L('icecream_vanilla icecream_choco icecream_strawberry icecream_pistachio ice_pop cone_choco crepe_sugar milkshake_vanilla', 1), ...L('tray_icecream_vanilla tray_icecream_choco', 1), ...L('case_ice_cream', 1)
    ],
    fixed: [['freezer', 2], ['register', 1], ['chair', 4]] },
  { id: 'bonbons', name: 'La Bonbonnière', floor: 1, side: 'S', slot: 6, w: 1, color: 0xff4081, layout: 'walls', unlock: 9, cams: 1,
    desc: 'Bocaux de bonbons, barbe à papa et sucettes géantes.',
    items: [['candy_jar', 10], ['lollipop', 10], ['marshmallow', 6], ['licorice', 10], ['gum', 10], ['chocolate', 6],
      ...L('candy_jar_bears candy_jar_lemon', 1), ...L('candy_strawberries candy_crocodiles candy_cola nougat calissons berlingots salted_caramels truffles pralines dragees candy_cane lollipops_small chocolate_coins marshmallow_twist', 1),
      ...L('case_candy_jar case_lollipop', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_gum tray_berlingots tray_salted_caramels tray_pralines tray_lollipops_small tray_dragees tray_truffles tray_chocolate_coins tray_licorice tray_chocolate', 1)
    ],
    fixed: [['cotton_candy_machine', 1], ['gumball_machine', 2], ['register', 1]] },
  { id: 'octet', name: 'Octet Informatique', floor: 1, side: 'S', slot: 7, w: 1, color: 0x00897b, layout: 'walls', unlock: 9, cams: 1,
    desc: 'Ordinateurs, imprimantes, webcams. L\'imprimante imprime parfois toute seule.',
    items: [['laptop', 4], ['keyboard', 6], ['mouse', 8], ['usb_key', 1], ['hard_drive', 6], ['router', 3], ['webcam', 3],
      ...L('mouse_wireless keyboard_compact usb_16 hdd_external webcam_box laptop_box monitor_box ink_cartridges paper_ream mouse_pad headset_office hdmi_cable pc_speakers floppy_box software_box', 1), ...L('case_laptop_box case_mouse', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_mouse_wireless tray_usb_16 tray_hdd_external tray_webcam_box tray_ink_cartridges tray_hdmi_cable tray_floppy_box tray_hard_drive', 1)
    ],
    fixed: [['pc_tower', 2], ['printer', 2], ['register', 1]] },
  { id: 'direction', name: 'Bureau de la Direction', floor: 1, side: 'S', slot: 8, w: 1, color: 0x37474f, layout: 'office', unlock: 7, cams: 1, noShutter: true, door: 'locked',
    desc: 'Le bureau de M. Desmarais. Coffre-fort, passe-partout, et beaucoup de secrets.',
    items: [['director_whisky', 1], ['master_key', 1], ['photo_frame', 2], ['coffee', 1],
      ...L('binder paper_files stapler calculator rubber_stamp desk_plant pen_cup', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('row_binders', 1)
    ],
    fixed: [['safe', 1], ['desk_phone', 1], ['pc_tower', 1], ['office_chair', 1], ['printer', 1]] },
  { id: 'staff', name: 'Salle du Personnel', floor: 1, side: 'S', slot: 9, w: 1, color: 0x546e7a, layout: 'staff', unlock: 1, cams: 0, noShutter: true, door: 'keys',
    desc: 'Casiers, micro-ondes, distributeur, panneau d\'affichage avec des numéros de téléphone.',
    items: [['coffee', 2], ['yogurt', 2], ['canned_food', 2], ['first_aid', 1], ['battery', 4],
      ...L('instant_noodles lunch_box thermos_coffee mug_colleague biscuit_tin newspaper magazine', 1),
      // présentoirs multi-unités (une rangée / un présentoir = un objet)
      ...L('tray_canned_food pile_magazine pile_newspaper', 1)
    ],
    fixed: [['locker', 8], ['microwave', 1], ['coffee_maker', 1], ['fridge', 1], ['vending', 1], ['notice_board', 1], ['chair', 4], ['massage_chair', 1]] },
  { id: 'toilettes', name: 'Toilettes', floor: 1, side: 'S', slot: 10, w: 1, color: 0x90a4ae, layout: 'toilets', unlock: 1, cams: 0, noShutter: true, door: 'open', zone: 'toilets',
    desc: 'Le miroir du fond… ne le regardez pas trop longtemps.',
    items: [['toilet_paper', 6], ['soap', 2],
      ...L('hand_soap air_freshener_wc toilet_brush tp_pack', 1)
    ],
    fixed: [['sink', 4], ['hand_dryer', 2], ['toilet', 4], ['mirror_wall', 2]] },
];

export const SHOP_COUNT = SHOPS.filter(s => !['direction', 'staff', 'toilettes'].includes(s.id)).length;

// Zones hors magasins (pour le wiki, les caméras et l'histoire)
export const AREAS = [
  { id: 'security', name: 'Poste de sécurité', desc: 'Votre bureau. Écrans, téléphone, radio lofi, machine à café. Le seul endroit où l\'on se sent bien.', unlock: 1 },
  { id: 'gallery0', name: 'Galerie — Rez-de-chaussée', desc: 'La grande allée du rez-de-chaussée, l\'atrium et sa fontaine.', unlock: 1 },
  { id: 'gallery1', name: 'Galerie — Étage', desc: 'Coursives de l\'étage, rambardes au-dessus de l\'atrium, escalators.', unlock: 5 },
  { id: 'entrance', name: 'Hall d\'entrée', desc: 'Portes automatiques verrouillées la nuit, plan du centre, distributeur de billets.', unlock: 1 },
  { id: 'service', name: 'Couloirs de service', desc: 'Arrière-couloirs qui longent les réserves des magasins. Néons fatigués.', unlock: 2 },
  { id: 'warehouse', name: 'Entrepôt', desc: 'Racks de palettes, chariot élévateur, quai de chargement. Le chat errant y dort.', unlock: 9 },
  { id: 'garage', name: 'Parking souterrain', desc: 'Niveau -1. Voitures oubliées, piliers, barrière. Entrée des braqueurs.', unlock: 6 },
  { id: 'basement', name: 'Sous-sol technique', desc: 'Groupe électrogène, tableau électrique, régie d\'annonces, chaudière… et la porte B-13.', unlock: 7 },
  { id: 'vents', name: 'Conduits d\'aération', desc: 'Réseau de gaines entre le poste, les réserves et le couloir de service. Accroupi obligatoire.', unlock: 8 },
  { id: 'roof', name: 'Toit', desc: 'Accès par l\'escalier de service. Verrière de l\'atrium, climatiseurs, vue sur la ville.', unlock: 9 },
];
