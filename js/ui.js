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
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
};

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
export function openSheet(html, onMount) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="backdrop" data-close></div>
    <div class="sheet glass" role="dialog" aria-modal="true">
      <div class="grabber"></div>
      ${html}
    </div>`;
  requestAnimationFrame(() => root.classList.add('open'));
  const close = () => {
    root.classList.remove('open');
    setTimeout(() => (root.innerHTML = ''), 250);
  };
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  onMount?.(root.querySelector('.sheet'), close);
  return close;
}

/** Conferma in stile iOS. Restituisce una Promise<boolean> */
export function confirmSheet(message, { okText = 'Conferma', danger = false } = {}) {
  return new Promise((resolve) => {
    openSheet(
      `<p class="sheet-msg">${esc(message)}</p>
       <div class="sheet-actions">
         <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okText)}</button>
         <button class="btn ghost" data-cancel>Annulla</button>
       </div>`,
      (sheet, close) => {
        sheet.querySelector('[data-ok]').onclick = () => { close(); resolve(true); };
        sheet.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
        document.querySelector('#modal-root .backdrop').addEventListener('click', () => resolve(false));
      }
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
