// =============================================================
//  diary.js — diario alimentare (cosa hai mangiato, giorno per giorno)
// =============================================================
//  Il diario è PERSONALE: non fa parte del ricettario (che può essere
//  condiviso), quindi ha il suo salvataggio e la sua tabella sul server.
//
//  Forma dei dati, per ogni giorno ("2026-11-19"):
//    { colazione: [elementi], 'spuntino-mattina': [...], pranzo: [...], ... }
//  Ogni elemento ha la stessa forma degli elementi dei pasti:
//    alimento  { name, qty, unit, foodId, food }       (food = copia dei valori)
//    ricetta   { name, qty, unit: 'porz.', recipeId, snap }
//    pasto     { name, qty, unit: 'porz.', mealId, snap }
//  snap = valori di 1 porzione al momento dell'aggiunta: se poi la ricetta
//  o il pasto vengono eliminati, il diario dei giorni passati resta giusto.
//
//  Sincronizzazione (solo con account): ogni giorno modificato va in una coda
//  e viene inviato al server; offline resta in coda e parte appena torna la rete.

import * as cloud from './cloud.js';
import { capitalize } from './ui.js';

// ---------- Momenti della giornata ----------
// meal = momento dei Pasti salvati da proporre come aggiunta rapida
export const SLOTS = [
  { id: 'colazione', label: 'Colazione', emoji: '☕', meal: 'colazione' },
  { id: 'spuntino-mattina', label: 'Spuntino di metà mattina', short: 'Spuntino', emoji: '🍎', meal: 'spuntino' },
  { id: 'pranzo', label: 'Pranzo', emoji: '🍝', meal: 'pranzo' },
  { id: 'spuntino-pomeriggio', label: 'Spuntino pomeridiano', short: 'Merenda', emoji: '🍪', meal: 'spuntino' },
  { id: 'cena', label: 'Cena', emoji: '🍲', meal: 'cena' },
];
export const slotInfo = (id) => SLOTS.find((s) => s.id === id);

// ---------- Date ----------
/** "2026-11-19" nell'ora locale (non UTC: a mezzanotte deve cambiare giorno da noi) */
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (key, n) => {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
/** Lunedì della settimana del giorno indicato */
export const weekStart = (key) => addDays(key, -((parseDay(key).getDay() + 6) % 7));

// ---------- Dati sul dispositivo ----------
let storageKey = 'ricettario:diary';
let days = {};

const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
};
const persist = () => {
  try { localStorage.setItem(storageKey, JSON.stringify(days)); } catch (e) { console.error('Diario non salvato', e); }
};

/** Senza account: diario di questo dispositivo. Con account: uno per utente */
function useStorage(key) {
  storageKey = key;
  days = read(key);
}
useStorage(storageKey);

const listeners = new Set();
/** fn() viene chiamata quando il diario cambia (anche da un altro dispositivo) */
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

// ---------- Lettura ----------
export const itemsOf = (key, slot) =>
  (days[key]?.[slot] || []).map((it) => (it.name ? { ...it, name: capitalize(it.name) } : it));
export const hasEntries = (key) => SLOTS.some((s) => itemsOf(key, s.id).length > 0);
/** Tutti gli elementi del giorno, in un'unica lista (per il totale) */
export const allItems = (key) => SLOTS.flatMap((s) => itemsOf(key, s.id));

// ---------- Scrittura ----------
export function saveSlot(key, slot, items) {
  items = items.map((it) => ({ ...it, name: capitalize(it.name) }));
  const day = { ...days[key], [slot]: items };
  if (!items.length) delete day[slot];
  if (Object.keys(day).length) days[key] = day;
  else delete days[key];
  persist();
  enqueue(key);
  emit();
}

// =============================================================
//  Sincronizzazione con il server (tabella "diary")
// =============================================================
let userId = null;
const queueKey = () => `ricettario:diary-queue:${userId}`;
const queue = () => (userId ? read(queueKey()).days || [] : []);
const saveQueue = (q) => { try { localStorage.setItem(queueKey(), JSON.stringify({ days: q })); } catch { /* spazio pieno */ } };

function enqueue(key) {
  if (!userId) return;
  saveQueue([...queue().filter((k) => k !== key), key]);
  clearTimeout(enqueue.timer);
  enqueue.timer = setTimeout(() => flush().catch(() => {}), 400);
}

let flushing = null;
/** Invia i giorni modificati, uno alla volta */
function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    const sb = cloud.client();
    if (!sb || !userId || !navigator.onLine) return;
    while (queue().length) {
      const key = queue()[0];
      const data = days[key];
      try {
        const res = data
          ? await sb.from('diary').upsert({ user_id: userId, day: key, data, updated_at: new Date().toISOString() })
          : await sb.from('diary').delete().match({ user_id: userId, day: key });
        if (res.error) throw res.error;
      } catch (e) {
        if (cloud.isNetworkError(e)) return; // si riprova quando torna la rete
        console.error('Diario: modifica scartata', e);
      }
      saveQueue(queue().slice(1));
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Scarica il diario dal server; i giorni modificati qui e non ancora inviati restano quelli locali */
async function pull() {
  const sb = cloud.client();
  if (!sb || !userId || !navigator.onLine) return;
  const { data, error } = await sb.from('diary').select('day, data').eq('user_id', userId);
  if (error) throw error;
  const pending = new Set(queue());
  const fresh = {};
  for (const key of pending) if (days[key]) fresh[key] = days[key];
  for (const row of data || []) if (!pending.has(row.day)) fresh[row.day] = row.data;
  days = fresh;
  persist();
  emit();
}

let channel = null;
/** Modifiche fatte dal tuo altro dispositivo: arrivano subito */
function listen() {
  const sb = cloud.client();
  channel = sb.channel(`diary-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'diary', filter: `user_id=eq.${userId}` }, (p) => {
      const row = p.eventType === 'DELETE' ? p.old : p.new;
      if (!row?.day || (row.user_id && row.user_id !== userId) || queue().includes(row.day)) return;
      if (p.eventType === 'DELETE') delete days[row.day];
      else days[row.day] = row.data;
      persist();
      emit();
    })
    .subscribe();
}

/** Con account: da chiamare dopo l'accesso */
export async function connect(user) {
  userId = user.id;
  useStorage(`ricettario:diary:${userId}`);
  try {
    await flush();
    await pull();
  } catch (e) {
    if (!cloud.isNetworkError(e)) console.error(e);
  }
  if (!channel) listen();
}

// Torna la connessione / riapri l'app: invia e aggiorna
const refresh = () => { if (userId && navigator.onLine) flush().then(pull).catch(() => {}); };
window.addEventListener('online', refresh);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
