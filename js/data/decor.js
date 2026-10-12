// Objets du décor du centre commercial (galeries, hall, couloirs) ajoutés au catalogue ITEMS.
// Identifiants préfixés « mall_ » : ils complètent js/data/items.js sans le modifier.
import { ITEMS } from './items.js';

function d(id, name, shape, s, c, mat, use, o = {}) { ITEMS[id] = Object.assign({ id, name, shape, s, c, mat, use }, o); }

d('mall_payphone', 'Cabine téléphonique', 'mall_payphone', [0.85, 2.2, 0.75], 0x1565c0, 'metal', 'phone', { fixed: true, desc: 'Un vieux publiphone à pièces. Il fonctionne encore : composez un numéro (E).' });
d('mall_wetsign', 'Panneau « Sol glissant »', 'mall_aframe', [0.32, 0.62, 0.3], 0xffd600, 'plastic', 'generic', { mass: 1.5, desc: 'ATTENTION SOL GLISSANT. On peut le poser n\'importe où… ou le lancer.' });
d('mall_cleancart', 'Chariot de ménage', 'mall_cleancart', [0.6, 1.0, 1.1], 0x1e88e5, 'plastic', 'cart', { mass: 18, desc: 'Seau, balai, produits d\'entretien. Une roue grince.' });
d('mall_bin', 'Poubelle de tri', 'mall_bin', [0.95, 1.0, 0.42], 0x37474f, 'metal', 'container', { fixed: true, p: { random: 'trash' }, desc: 'Emballages, papiers, ordures ménagères.' });
d('mall_kiddie_car', 'Manège « Voiture de police »', 'kiddie', [0.8, 1.2, 1.3], 0x1565c0, 'plastic', 'kiddie', { fixed: true, desc: 'Une pièce, une minute de patrouille. La sirène est un peu fatiguée.' });
d('mall_kiddie_horse', 'Manège « Cheval de bois »', 'kiddie', [0.8, 1.2, 1.3], 0x8d6e63, 'wood', 'kiddie', { fixed: true, desc: 'Le cheval de bois qui berce les enfants… et parfois personne.' });
