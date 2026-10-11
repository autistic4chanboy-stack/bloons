// Simulation répliquée : toute modification du monde passe par une ACTION (exécutée sur l'hôte) qui produit
// des EFFETS (appliqués sur tous les pairs, hôte compris). En solo, l'hôte est le seul pair : même code.
import { Net } from '../net/net.js';

export class Sim {
  constructor(game) {
    this.game = game;
    this.actions = new Map();
    this.effects = new Map();
    Net.on('a', (m) => { if (Net.isHost) this._exec(m.n, m.p, m.from); });
    Net.on('e', (m) => { if (!Net.isHost || m.from !== Net.myId) this._apply(m.n, m.p); });
  }

  // Enregistre l'exécuteur d'une action (hôte) : fn(payload, actorId, sim) -> rien (émet des effets)
  action(name, fn) { this.actions.set(name, fn); }
  // Enregistre l'applicateur d'un effet (tous les pairs) : fn(payload)
  effect(name, fn) { this.effects.set(name, fn); }

  // Appelé par le joueur local
  do(name, payload = {}) {
    if (Net.isHost) this._exec(name, payload, Net.myId);
    else Net.sendAction(name, payload);
  }

  _exec(name, payload, actor) {
    const fn = this.actions.get(name);
    if (!fn) { if (this.game.ready) console.warn('[sim] action inconnue', name); return; }
    try { fn(payload || {}, actor, this); } catch (e) { console.error('[sim] action', name, e); }
  }

  // Hôte uniquement : applique localement et diffuse. opts.to : un seul joueur ; opts.local : ne pas diffuser.
  emit(name, payload = {}, opts = {}) {
    if (!Net.isHost) { console.warn('[sim] emit hors hôte', name); return; }
    const to = opts.to || null;
    if ((!to || to === Net.myId) && !opts.exceptHost) this._apply(name, payload);
    if (Net.online && !opts.local && to !== Net.myId) Net.broadcastEffect(name, payload, to);
  }

  _apply(name, payload) {
    const fn = this.effects.get(name);
    if (!fn) { if (this.game.ready) console.warn('[sim] effet inconnu', name); return; } // pendant le chargement : l'état complet suivra
    try { fn(payload || {}); } catch (e) { console.error('[sim] effet', name, e); }
  }
}
