// Entrées clavier / souris. Les touches de déplacement utilisent KeyboardEvent.code (position physique) :
// ZQSD sur AZERTY = WASD sur QWERTY, automatiquement.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // appuyées pendant cette frame
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, buttons: 0, wheel: 0, x: 0, y: 0 };
    this.mousePressed = new Set(); this.mouseReleased = new Set();
    this.locked = false;
    this.enabled = true;          // false quand une UI capture le clavier
    this.captureHandler = null;   // fonction(code, down, event) -> true si consommé (mode jeu sur écran, piano…)
    this.textMode = false;        // champ texte actif (chat, annonce)
    this.sensitivity = 1;
    this.invertY = false;

    window.addEventListener('keydown', e => this.onKey(e, true));
    window.addEventListener('keyup', e => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons = 0; });
    document.addEventListener('mousemove', e => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.locked) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; }
    });
    canvas.addEventListener('mousedown', e => {
      if (!this.locked && this.wantLock) { this.lock(); return; }
      this.mouse.buttons |= (1 << e.button); this.mousePressed.add(e.button);
    });
    window.addEventListener('mouseup', e => { this.mouse.buttons &= ~(1 << e.button); this.mouseReleased.add(e.button); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('wheel', e => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    this.wantLock = false;
  }

  lock() { if (this.canvas.requestPointerLock) { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  onKey(e, down) {
    if (this.textMode) return; // les champs texte gèrent eux-mêmes
    const code = e.code;
    if (this.captureHandler && this.captureHandler(code, down, e)) { e.preventDefault(); return; }
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'Slash'].includes(code)) e.preventDefault();
    if (down) { if (!this.keys.has(code)) this.pressed.add(code); this.keys.add(code); }
    else { this.keys.delete(code); this.released.add(code); }
  }

  down(code) { return this.enabled && this.keys.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  up(code) { return this.enabled && this.released.has(code); }
  mouseDown(b) { return this.enabled && (this.mouse.buttons & (1 << b)) !== 0; }
  click(b) { return this.enabled && this.mousePressed.has(b); }
  mouseUp(b) { return this.enabled && this.mouseReleased.has(b); }

  consumeMouse() { const d = { dx: this.mouse.dx * this.sensitivity, dy: this.mouse.dy * this.sensitivity * (this.invertY ? -1 : 1) }; this.mouse.dx = 0; this.mouse.dy = 0; return d; }
  consumeWheel() { const w = this.mouse.wheel; this.mouse.wheel = 0; return w; }

  endFrame() { this.pressed.clear(); this.released.clear(); this.mousePressed.clear(); this.mouseReleased.clear(); }
}
