// Clavier à code (coffres, portes, alarmes) : overlay DOM avec afficheur LED, touches 0-9, C et OK.
// Clavier physique : chiffres (rangée ou pavé numérique), Retour arrière, Entrée ; Échap annule.
//   startKeypad({ title, digits = 4, sound(name), onDone(code | null) })
let active = null; // un seul clavier à la fois

export function startKeypad(opts = {}) {
  if (active) active.cancel();
  const digits = Math.max(1, Math.min(12, Math.round(Number(opts.digits) || 4)));
  const title = String(opts.title || 'Entrez le code');
  const play = (n) => { try { opts.sound?.(n); } catch (e) { /* son indisponible */ } };
  let code = '', done = false, flashT = 0;

  const el = (tag, style, text) => { const e = document.createElement(tag); if (style) Object.assign(e.style, style); if (text !== undefined) e.textContent = text; return e; };
  const root = el('div', {
    position: 'fixed', inset: '0', zIndex: '2147483000', background: 'rgba(4,5,8,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    userSelect: 'none', fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  });
  root.setAttribute('data-nb-overlay', 'keypad');
  const panel = el('div', {
    background: 'linear-gradient(#3a3f48, #262a31)', border: '2px solid #4c525c', borderRadius: '14px', padding: '18px 20px 16px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)', width: 'min(300px, 86vw)', color: '#d8dce4',
  });
  const head = el('div', { fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c8ccd6', marginBottom: '10px', textAlign: 'center' }, title);
  const screen = el('div', {
    background: '#071207', border: '2px solid #10200f', borderRadius: '6px', padding: '10px 8px', marginBottom: '14px', textAlign: 'center',
    fontSize: '30px', letterSpacing: '0.35em', color: '#4dff6a', textShadow: '0 0 8px rgba(77,255,106,0.7)', minHeight: '38px', boxShadow: 'inset 0 0 12px rgba(0,0,0,0.8)',
  });
  const grid = el('div', { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '9px' });
  const hint = el('div', { fontSize: '11px', color: '#8a909c', marginTop: '12px', textAlign: 'center', lineHeight: '1.5' }, 'Chiffres au clavier · Entrée : valider · Retour : effacer · Échap : annuler');
  const buttons = {};
  const LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
  for (const k of LABELS) {
    const b = el('button', {
      font: 'inherit', fontSize: '20px', padding: '12px 0', borderRadius: '8px', cursor: 'pointer', outline: 'none',
      border: '1px solid #1a1d22', color: k === 'OK' ? '#0c1a0c' : k === 'C' ? '#2a0c0c' : '#e8ecf2',
      background: k === 'OK' ? 'linear-gradient(#6fe37f, #3da84d)' : k === 'C' ? 'linear-gradient(#ef7a6a, #b84434)' : 'linear-gradient(#545b66, #3a404a)',
      boxShadow: '0 3px 0 #15181c, inset 0 1px 0 rgba(255,255,255,0.18)', transform: 'translateY(0)',
    }, k);
    b.type = 'button';
    b.addEventListener('mousedown', (e) => { e.preventDefault(); press(k); });
    grid.appendChild(b);
    buttons[k] = b;
  }
  panel.append(head, screen, grid, hint);
  root.appendChild(panel);
  document.body.appendChild(root);

  function render() {
    let s = '';
    for (let i = 0; i < digits; i++) s += i < code.length ? '*' : '_';
    screen.textContent = s;
    screen.style.color = flashT > 0 ? '#ffcf4a' : '#4dff6a';
  }
  function bump(k) {
    const b = buttons[k];
    if (!b) return;
    b.style.transform = 'translateY(2px)'; b.style.boxShadow = '0 1px 0 #15181c, inset 0 1px 0 rgba(255,255,255,0.1)';
    setTimeout(() => { b.style.transform = 'translateY(0)'; b.style.boxShadow = '0 3px 0 #15181c, inset 0 1px 0 rgba(255,255,255,0.18)'; }, 110);
  }
  function press(k) {
    if (done) return;
    bump(k);
    play('button');
    if (/^[0-9]$/.test(k)) { if (code.length < digits) code += k; else { flashT = 1; setTimeout(() => { flashT = 0; render(); }, 180); } }
    else if (k === 'C') code = '';
    else if (k === '←') code = code.slice(0, -1);
    else if (k === 'OK') { if (code.length) { finish(code); return; } flashT = 1; setTimeout(() => { flashT = 0; render(); }, 180); }
    render();
  }
  const onKey = (e) => {
    e.stopImmediatePropagation();
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (m) { e.preventDefault(); press(m[1]); return; }
    if (e.code === 'Backspace') { e.preventDefault(); bump('C'); press('←'); return; }
    if (e.code === 'Delete' || e.code === 'KeyC' || e.code === 'NumpadDecimal') { e.preventDefault(); press('C'); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); press('OK'); return; }
    if (e.code === 'Escape') { e.preventDefault(); finish(null); return; }
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  };
  const onKeyUp = (e) => { if (/^(?:Digit|Numpad)[0-9]$|^Enter$|^Space$/.test(e.code)) e.preventDefault(); };
  const onCtx = (e) => e.preventDefault();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  root.addEventListener('contextmenu', onCtx);
  root.addEventListener('mousedown', (e) => { if (e.target === root) e.preventDefault(); });

  function finish(result) {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKeyUp, true);
    root.remove();
    if (active === handle) active = null;
    try { opts.onDone?.(result); } catch (e) { try { console.warn('[clavier à code] onDone', e); } catch (_) { /* */ } }
  }
  const handle = { cancel: () => finish(null) };
  active = handle;
  render();
  return handle;
}
