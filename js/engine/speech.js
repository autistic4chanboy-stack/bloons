// Voix (synthèse vocale du navigateur, française de préférence). Les sous-titres sont gérés par l'UI.
export const Speech = {
  voices: [], enabled: true, ready: false, pending: 0,
  init() {
    if (!('speechSynthesis' in window)) { this.enabled = false; return; }
    const load = () => { this.voices = speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang)); this.ready = true; };
    load(); speechSynthesis.onvoiceschanged = load;
  },
  // personnages → réglages de voix
  profile(who) {
    const w = (who || '').toLowerCase();
    if (w.includes('gérard')) return { pitch: 0.75, rate: 0.92, idx: 0 };
    if (w.includes('enfant') || w.includes('lucie')) return { pitch: 1.8, rate: 0.9, idx: 1 };
    if (w.includes('bobby')) return { pitch: 1.5, rate: 0.85, idx: 1 };
    if (w.includes('police') || w.includes('opérat')) return { pitch: 1.0, rate: 1.08, idx: 2 };
    if (w.includes('pompier')) return { pitch: 0.9, rate: 1.1, idx: 0 };
    if (w.includes('annonce') || w.includes('haut-parleur')) return { pitch: 1.0, rate: 0.95, idx: 1 };
    if (w.includes('mme') || w.includes('sandrine') || w.includes('maman') || w.includes('dame')) return { pitch: 1.25, rate: 1.0, idx: 1 };
    return { pitch: 1.0, rate: 1.0, idx: 0 };
  },
  say(text, opts = {}) {
    if (!this.enabled || !text) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[«»♪]/g, ''));
      const pr = this.profile(opts.who);
      u.lang = 'fr-FR';
      if (this.voices.length) u.voice = this.voices[pr.idx % this.voices.length];
      u.pitch = opts.pitch ?? pr.pitch; u.rate = opts.rate ?? pr.rate; u.volume = opts.volume ?? 0.9;
      // pas d'arriéré : au-delà de deux répliques en attente, on abandonne les plus anciennes (sinon des minutes de
      // chuchotements s'empilent, et sans moteur vocal la file ne se vide jamais)
      if (opts.interrupt || this.pending >= 2) { speechSynthesis.cancel(); this.pending = 0; }
      u.onend = u.onerror = () => { this.pending = Math.max(0, this.pending - 1); };
      this.pending++;
      speechSynthesis.speak(u);
    } catch (e) { /* pas de voix */ }
  },
  stop() { try { speechSynthesis.cancel(); this.pending = 0; } catch (e) { /* */ } },
  // durée estimée d'une réplique (pour les sous-titres)
  duration(text) { return Math.max(2.2, (text || '').length * 0.065 + 0.8); },
};
