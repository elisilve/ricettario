// =============================================================
//  ui.js — piccoli strumenti condivisi: icone, modali, toast
// =============================================================

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Calorie stimate dai macro: 4 kcal/g proteine e carboidrati, 9 kcal/g grassi */
export const kcalFromMacros = ({ protein = 0, carbs = 0, fat = 0 }) =>
  Math.round(protein * 4 + carbs * 4 + fat * 9);

export const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString('it-IT');

// Icone in stile SF Symbols (SVG inline, ereditano il colore del testo)
const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const icon = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  chevron: svg('<path d="M9 5l7 7-7 7"/>', 'width="16" height="16"'),
  minus: svg('<path d="M5 12h14"/>'),
  camera: svg('<path d="M4 8.5A1.5 1.5 0 015.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z"/><circle cx="12" cy="13" r="3.5"/>'),
  book: svg('<path d="M5 4.5h10.5A2.5 2.5 0 0118 7v13H7.5A2.5 2.5 0 015 17.5z"/><path d="M5 17.5A2.5 2.5 0 017.5 15H18M9 8.5h5"/>'),
  basket: svg('<path d="M3.5 9.5h17l-1.6 9a2 2 0 01-2 1.6H7.1a2 2 0 01-2-1.6z"/><path d="M8.5 9.5L11 4M15.5 9.5L13 4M9.5 13.5v3M14.5 13.5v3"/>'),
  alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>', 'width="13" height="13" stroke-width="2.4"'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'width="18" height="18" stroke-width="2.6"'),
  share: svg('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.9-3.9 3.9-6 7.5-6s6.6 2.1 7.5 6"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
};

// ---------- Tema chiaro / scuro ----------
const THEME_KEY = 'ricettario:theme';
export const currentTheme = () => document.documentElement.dataset.theme || 'light';

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme-color').content = theme === 'dark' ? '#131313' : '#eef0f6';
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage non disponibile */ }
}

/** Voce "Tema" con la scelta Chiaro / Scuro (nel pannello Account e nelle Impostazioni) */
export const themeRow = () => `
  <div class="theme-row">
    <span class="theme-label">${currentTheme() === 'dark' ? icon.moon : icon.sun} Tema</span>
    <div class="segmented theme-seg">
      <button type="button" data-theme-set="light" class="${currentTheme() === 'light' ? 'on' : ''}">Chiaro</button>
      <button type="button" data-theme-set="dark" class="${currentTheme() === 'dark' ? 'on' : ''}">Scuro</button>
    </div>
  </div>`;

/** Collega i pulsanti della voce "Tema" dentro un contenitore */
export function bindThemeRow(container) {
  container.querySelectorAll('[data-theme-set]').forEach((b) =>
    b.addEventListener('click', () => {
      setTheme(b.dataset.themeSet);
      container.querySelector('.theme-row').outerHTML = themeRow();
      bindThemeRow(container);
    })
  );
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- Modale (bottom sheet) ----------
let sheetSeq = 0; // serve ad aprire un pop-up subito dopo averne chiuso un altro

/** onClose: chiamata quando il pop-up si chiude (in qualsiasi modo) */
export function openSheet(html, onMount, onClose) {
  const root = document.getElementById('modal-root');
  const mine = ++sheetSeq;
  root.innerHTML = `
    <div class="backdrop" data-close></div>
    <div class="sheet glass" role="dialog" aria-modal="true">
      <div class="sheet-handle" aria-hidden="true"><div class="grabber"></div></div>
      ${html}
    </div>`;
  requestAnimationFrame(() => root.classList.add('open'));
  // Con il pop-up aperto la pagina sotto resta ferma
  document.documentElement.classList.add('sheet-open');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    // Se nel frattempo si è aperto un altro pop-up, non lo tocchiamo
    if (mine === sheetSeq) {
      root.classList.remove('open');
      document.documentElement.classList.remove('sheet-open');
      setTimeout(() => { if (mine === sheetSeq) root.innerHTML = ''; }, 250);
    }
    onClose?.();
  };
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  enableDragToClose(root.querySelector('.sheet'), root.querySelector('.backdrop'), close);
  onMount?.(root.querySelector('.sheet'), close);
  return close;
}

/**
 * Trascina verso il basso per chiudere, come i pop-up di iOS.
 * Si può trascinare dal trattino o dal titolo, oppure da un punto qualsiasi
 * del pop-up quando il suo contenuto è già in cima (non dai campi di testo).
 */
function enableDragToClose(sheet, backdrop, close) {
  const FIELDS = 'input, textarea, select, [contenteditable]';
  let startY = 0, dy = 0, eligible = false, dragging = false;
  let samples = []; // ultime posizioni del dito, per misurare la velocità del gesto

  const start = (y, target) => {
    startY = y; dy = 0; dragging = false; samples = [{ y, t: Date.now() }];
    const fromHandle = !!target.closest('.sheet-handle, .sheet-title');
    eligible = fromHandle || (sheet.scrollTop <= 0 && !target.closest(FIELDS));
  };

  const move = (y, e) => {
    if (!eligible) return;
    dy = y - startY;
    samples.push({ y, t: Date.now() });
    if (samples.length > 6) samples.shift();
    if (!dragging) {
      if (dy > 6) {
        dragging = true;
        document.activeElement?.blur?.(); // chiude la tastiera mentre trascini
        sheet.style.transition = 'none';
        backdrop.style.transition = 'none';
      } else if (dy < -4) {
        eligible = false; // stai scorrendo verso l'alto: lascio scorrere il contenuto
        return;
      } else return;
    }
    e.preventDefault();
    const t = Math.max(0, dy);
    sheet.style.transform = `translateY(${t}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - t / (sheet.offsetHeight || 1)));
  };

  const end = () => {
    if (!dragging) return;
    dragging = false;
    // velocità negli ultimi istanti del gesto (px al millisecondo): un "colpetto" verso il basso chiude
    const first = samples[0], last = samples[samples.length - 1];
    const speed = (last.y - first.y) / Math.max(1, last.t - first.t);
    if (dy > sheet.offsetHeight * 0.25 || (dy > 30 && speed > 0.35)) {
      // chiudi: il pop-up scivola via dalla posizione in cui l'hai lasciato
      sheet.style.transition = 'transform .22s ease-out';
      sheet.style.transform = 'translateY(110%)';
      backdrop.style.transition = 'opacity .22s';
      backdrop.style.opacity = '0';
      close();
    } else {
      // torna su con un piccolo rimbalzo
      sheet.style.transition = 'transform .3s cubic-bezier(.2, .9, .25, 1)';
      sheet.style.transform = '';
      backdrop.style.transition = 'opacity .3s';
      backdrop.style.opacity = '';
    }
  };

  // Sullo sfondo scuro niente scroll: né col dito né con trackpad/rotellina
  const block = (e) => e.preventDefault();
  backdrop.addEventListener('touchmove', block, { passive: false });
  backdrop.addEventListener('wheel', block, { passive: false });
  // Sul pop-up la rotellina scorre solo il suo contenuto (se ce n'è da scorrere)
  sheet.addEventListener('wheel', (e) => {
    const canScroll = sheet.scrollHeight > sheet.clientHeight;
    const atTop = sheet.scrollTop <= 0 && e.deltaY < 0;
    const atBottom = sheet.scrollTop + sheet.clientHeight >= sheet.scrollHeight - 1 && e.deltaY > 0;
    if (!canScroll || atTop || atBottom) e.preventDefault();
  }, { passive: false });

  // iPhone: eventi touch (preventDefault blocca lo scroll della pagina durante il trascinamento)
  sheet.addEventListener('touchstart', (e) => start(e.touches[0].clientY, e.target), { passive: true });
  sheet.addEventListener('touchmove', (e) => move(e.touches[0].clientY, e), { passive: false });
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);

  // Computer (mouse): solo dal trattino/titolo
  sheet.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || !e.target.closest('.sheet-handle, .sheet-title')) return;
    e.preventDefault(); // niente selezione del testo mentre trascini col mouse
    start(e.clientY, e.target);
    const onMove = (ev) => move(ev.clientY, ev);
    const onUp = () => { end(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

/** Conferma in stile iOS. Restituisce una Promise<boolean> */
export function confirmSheet(message, { okText = 'Conferma', cancelText = 'Annulla', danger = false, title = '' } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openSheet(
      `${title ? `<h3 class="sheet-title">${esc(title)}</h3>` : ''}
       <p class="sheet-msg">${esc(message)}</p>
       <div class="sheet-actions">
         <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button>
         <button class="btn ghost" data-cancel>${esc(cancelText)}</button>
       </div>`,
      (sheet, close) => {
        sheet.querySelector('[data-ok]').onclick = () => { answer = true; close(); };
        sheet.querySelector('[data-cancel]').onclick = () => close();
      },
      () => resolve(answer) // anche toccando fuori dal pop-up la risposta è "no"
    );
  });
}

/** Menu di azioni (action sheet). actions: [{ label, danger, run }] */
export function actionSheet(actions) {
  openSheet(
    `<div class="action-list">
       ${actions.map((a, i) => `<button class="action ${a.danger ? 'danger' : ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}
     </div>
     <button class="btn ghost full" data-close>Annulla</button>`,
    (sheet, close) => {
      sheet.querySelectorAll('[data-i]').forEach((b) =>
        b.addEventListener('click', () => { close(); setTimeout(() => actions[b.dataset.i].run(), 260); })
      );
    }
  );
}
