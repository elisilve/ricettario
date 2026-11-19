// =============================================================
//  Scorri a sinistra per eliminare (come in Mail / Promemoria su iPhone)
//  Markup: <div class="swipe" data-kind="recipe" data-id="..."> <riga .row> </div>
//  - trascini poco  → la riga torna a posto
//  - trascini metà  → resta aperta con il pulsante rosso "Elimina"
//  - trascini tanto → elimina subito (chiede comunque conferma)
// =============================================================
import { icon } from './ui.js';

const OPEN = 96;      // larghezza del pulsante quando la riga resta aperta
const GAP = 8;        // spazio fra riga e pulsante
const FULL = 0.6;     // oltre il 60% della larghezza: eliminazione diretta

let openEl = null;    // riga aperta in questo momento (una sola alla volta)

const setX = (wrap, x, animate) => {
  const row = wrap.querySelector('.row');
  const reveal = Math.max(0, -x - GAP);
  row.style.transition = animate ? 'transform .32s cubic-bezier(.2,.9,.3,1)' : 'none';
  wrap.style.setProperty('--reveal', `${reveal}px`);
  wrap.classList.toggle('swipe-anim', !!animate);
  wrap.classList.toggle('swipe-full', -x > wrap.offsetWidth * FULL);
  row.style.transform = x ? `translateX(${x}px)` : '';
  wrap.dataset.x = x;
};

export const closeSwipe = (wrap = openEl) => {
  if (!wrap) return;
  setX(wrap, 0, true);
  if (openEl === wrap) openEl = null;
};

/**
 * Attiva lo scorrimento su tutte le righe .swipe dentro root.
 * onDelete(kind, id) → Promise<boolean>: true se l'elemento è stato eliminato.
 */
export function enableSwipe(root, { onDelete, afterDelete, enabled = () => true }) {
  let s = null; // trascinamento in corso

  root.addEventListener('pointerdown', (e) => {
    const wrap = e.target.closest('.swipe');
    if (e.target.closest('.swipe-action')) return;
    if (openEl && openEl !== wrap) closeSwipe();
    if (!wrap || !enabled() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    s = { wrap, id: e.pointerId, x0: e.clientX, y0: e.clientY, start: +wrap.dataset.x || 0, dir: null, moved: false };
  });

  root.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
    if (!s.dir) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (s.dir === 'v') { s = null; return; }            // è uno scroll della pagina
      s.wrap.setPointerCapture?.(e.pointerId);
      s.wrap.classList.add('swiping');
    }
    s.moved = true;
    let x = Math.min(0, s.start + dx);
    const max = s.wrap.offsetWidth;
    if (-x > max) x = -max - (-x - max) * 0.2;             // effetto elastico oltre il bordo
    setX(s.wrap, x, false);
  });

  const end = async (e) => {
    if (!s || e.pointerId !== s.id) return;
    const { wrap, moved } = s;
    s = null;
    wrap.classList.remove('swiping');
    if (!moved) return;
    // dopo un trascinamento il "tap" non deve aprire la ricetta
    wrap.dataset.dragged = '1';
    setTimeout(() => delete wrap.dataset.dragged, 60);
    const x = +wrap.dataset.x || 0;
    if (-x > wrap.offsetWidth * FULL) return remove(wrap);
    if (-x > OPEN * 0.5) { setX(wrap, -(OPEN + GAP), true); openEl = wrap; }
    else closeSwipe(wrap);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  // Tap: sulla riga aperta la richiude; sul pulsante rosso elimina
  root.addEventListener('click', (e) => {
    const wrap = e.target.closest('.swipe');
    if (!wrap) return;
    if (e.target.closest('.swipe-action')) { e.preventDefault(); e.stopPropagation(); return remove(wrap); }
    if (wrap.dataset.dragged) { e.preventDefault(); e.stopPropagation(); return; } // fine trascinamento, non è un tap
    if (+wrap.dataset.x) { e.preventDefault(); e.stopPropagation(); closeSwipe(wrap); }
  }, true);

  const remove = async (wrap) => {
    // la riga scorre tutta a sinistra mentre chiediamo conferma
    setX(wrap, -wrap.offsetWidth, true);
    const done = await onDelete(wrap.dataset.kind, wrap.dataset.id);
    if (!done) { closeSwipe(wrap); return; }
    openEl = null;
    // la riga si chiude in altezza, poi l'elenco si ridisegna
    wrap.style.height = `${wrap.offsetHeight}px`;
    void wrap.offsetHeight;
    wrap.classList.add('swipe-gone');
    setTimeout(() => afterDelete?.(), 340);
  };
}

/** Avvolge una riga per renderla scorrevole */
export const swipeWrap = (kind, id, rowHtml) => `
  <div class="swipe" data-kind="${kind}" data-id="${id}">
    <button type="button" class="swipe-action" aria-label="Elimina">${icon.trash}<span>Elimina</span></button>
    ${rowHtml}
  </div>`;
