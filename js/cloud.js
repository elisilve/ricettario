// =============================================================
//  cloud.js — collegamento al server (Supabase)
// =============================================================
//  - account: accesso, registrazione, password
//  - ricettari: il proprio + quelli condivisi da altre persone
//  - sincronizzazione: ogni modifica fatta nell'app (store.js / images.js)
//    viene messa in una coda e inviata al server; se manca la connessione
//    resta in coda e parte appena torna online
//  - tempo reale: le modifiche fatte da altri compaiono subito

import { SUPABASE_URL, SUPABASE_KEY, PUBLIC_URL } from './config.js';
import * as store from './store.js';
import { getImage, putImage, deleteImage, onImageChange, hasImage } from './images.js';

export const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

// Libreria ufficiale di Supabase (versione 2), caricata dal CDN e tenuta in cache dal service worker
const LIB_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let sb = null;
export let user = null;
export let books = []; // [{ id, name, role, ownerId }]
export let book = null; // ricettario aperto

const KIND_OF = { categories: 'category', recipes: 'recipe', pantry: 'food', meals: 'meal' };
const COLLECTION = { category: 'categories', recipe: 'recipes', food: 'pantry', meal: 'meals' };

// In locale (Live Server) i link delle email devono comunque portare all'app pubblicata
const appUrl = () =>
  ['localhost', '127.0.0.1'].includes(location.hostname) && PUBLIC_URL ? PUBLIC_URL : location.origin + location.pathname;
const lsGet = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* spazio pieno */ } };

/** Errore di rete (offline, server irraggiungibile) oppure errore "vero" (es. permessi)? */
export const isNetworkError = (e) =>
  !navigator.onLine || /fetch|network|load failed|timeout|offline/i.test(String(e?.message || e));

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// =============================================================
//  Avvio e account
// =============================================================
export async function init() {
  const { createClient } = await import(LIB_URL);
  sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // link di conferma email / reimpostazione password
      flowType: 'implicit', // il link può essere aperto anche in Safari, fuori dall'app
      storageKey: 'ricettario:auth',
    },
  });
  const { data } = await sb.auth.getSession();
  user = data.session?.user ?? null;
  return user;
}

/** fn(event, session): event = 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | ... */
export const onAuthChange = (fn) =>
  sb.auth.onAuthStateChange((event, session) => {
    user = session?.user ?? null;
    fn(event, session);
  });

export async function signIn(email, password) {
  const data = check(await sb.auth.signInWithPassword({ email: email.trim(), password }));
  user = data.user;
}

/** Restituisce { needsConfirm: true } se Supabase richiede di confermare l'email */
export async function signUp(email, password) {
  const data = check(await sb.auth.signUp({
    email: email.trim(), password, options: { emailRedirectTo: appUrl() },
  }));
  user = data.session ? data.user : null;
  return { needsConfirm: !data.session };
}

export const resetPassword = async (email) =>
  check(await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() }));

export const updatePassword = async (password) => check(await sb.auth.updateUser({ password }));

/** Cambio password dall'app: prima verifico quella attuale (rifacendo l'accesso), poi la aggiorno */
export async function changePassword(current, next) {
  check(await sb.auth.signInWithPassword({ email: user.email, password: current }));
  check(await sb.auth.updateUser({ password: next }));
}

export async function signOut() {
  stopRealtime();
  // via le copie locali dei ricettari (restano sul server)
  Object.keys(localStorage)
    .filter((k) => k.startsWith('ricettario:book:') || k.startsWith('ricettario:queue:') || k.startsWith('ricettario:books:'))
    .forEach((k) => localStorage.removeItem(k));
  try { await sb.auth.signOut(); } catch { /* offline: la sessione locale viene comunque rimossa */ }
  user = null; book = null; books = [];
}

// =============================================================
//  Ricettari
// =============================================================
export const canEdit = () => !!book && (book.role === 'owner' || book.role === 'editor');
export const isOwner = () => book?.role === 'owner';
const activeKey = () => `ricettario:active:${user.id}`;

/**
 * Carica i ricettari dell'utente (accettando prima gli inviti ricevuti).
 * Se non ne ha uno suo lo crea. Offline usa l'ultimo elenco salvato.
 * Restituisce { books, joined } — joined: id di un ricettario condiviso appena aggiunto
 */
export async function loadBooks() {
  let joined = null;
  try {
    const accepted = check(await sb.rpc('accept_invites'));
    const rows = check(await sb.from('members')
      .select('role, created_at, books(id, name, owner_id)')
      .eq('user_id', user.id));
    books = rows.filter((m) => m.books).map((m) => ({
      id: m.books.id, name: m.books.name, ownerId: m.books.owner_id, role: m.role, since: m.created_at,
    }));
    if (!books.some((b) => b.role === 'owner')) {
      const name = defaultBookName();
      const id = check(await sb.rpc('create_book', { book_name: name }));
      books.push({ id, name, ownerId: user.id, role: 'owner', since: new Date().toISOString() });
    }
    if (accepted > 0) {
      joined = [...books].filter((b) => b.role !== 'owner').sort((a, b) => (a.since < b.since ? 1 : -1))[0]?.id ?? null;
    }
    lsSet(`ricettario:books:${user.id}`, books);
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    books = lsGet(`ricettario:books:${user.id}`, []);
    if (!books.length) throw e;
  }
  books.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name, 'it')));
  return { books, joined };
}

/** "Ricettario di Elisa" (dal nome dell'email: elisa.rossi@… → Elisa); si può rinominare */
function defaultBookName() {
  const first = (user.email || '').split('@')[0].split(/[._\-+\d]/).find(Boolean) || '';
  return first ? `Ricettario di ${first.charAt(0).toUpperCase()}${first.slice(1)}` : 'Il mio ricettario';
}

/** Ricettario da aprire: quello appena condiviso, altrimenti l'ultimo usato, altrimenti il proprio */
export function pickBook(joined) {
  const last = lsGet(activeKey(), null);
  return joined || (books.some((b) => b.id === last) ? last : books.find((b) => b.role === 'owner')?.id || books[0]?.id);
}

/** Apre un ricettario: mostra subito la copia locale, poi scarica dal server e si mette in ascolto */
export async function openBook(id) {
  stopRealtime();
  book = books.find((b) => b.id === id) || null;
  if (!book) return;
  lsSet(activeKey(), id);
  store.useStorage(`ricettario:book:${id}`);
  try {
    await flush();
    await pull();
  } catch (e) {
    if (!isNetworkError(e)) throw e; // offline: si lavora sulla copia locale
  }
  startRealtime();
}

/** Scarica tutto il contenuto del ricettario aperto */
export async function pull() {
  const rows = check(await sb.from('items').select('kind, id, data').eq('book_id', book.id));
  const d = { categories: [], recipes: [], pantry: [], meals: [] };
  rows.forEach((r) => d[COLLECTION[r.kind]]?.push({ ...r.data, id: r.id }));
  store.replaceData(d);
  // le modifiche locali non ancora inviate restano valide
  queue().forEach((op) => { if (op.type === 'item') store.applyRemote(op.kind, op.id, op.data); });
  fetchMissingPhotos();
  return rows.length;
}

export const isEmpty = () => {
  const d = store.snapshot();
  return !d.categories.length && !d.recipes.length && !d.pantry.length && !d.meals.length;
};

export async function renameBook(name) {
  check(await sb.from('books').update({ name }).eq('id', book.id));
  book.name = name;
  lsSet(`ricettario:books:${user.id}`, books);
}

// ---------- Persone ----------
export async function listPeople() {
  const members = check(await sb.from('members').select('user_id, email, role, created_at').eq('book_id', book.id));
  const invites = isOwner()
    ? check(await sb.from('invites').select('email, role, created_at').eq('book_id', book.id))
    : [];
  const order = { owner: 0, editor: 1, viewer: 2 };
  members.sort((a, b) => order[a.role] - order[b.role] || (a.email || '').localeCompare(b.email || ''));
  return { members, invites };
}

export const invite = async (email, role) =>
  check(await sb.from('invites').upsert({ book_id: book.id, email: email.trim().toLowerCase(), role }));
export const cancelInvite = async (email) =>
  check(await sb.from('invites').delete().match({ book_id: book.id, email }));
export const setRole = async (userId, role) =>
  check(await sb.from('members').update({ role }).match({ book_id: book.id, user_id: userId }));
export const removeMember = async (userId) =>
  check(await sb.from('members').delete().match({ book_id: book.id, user_id: userId }));

/** Esce da un ricettario condiviso e torna al proprio */
export async function leaveBook() {
  check(await sb.from('members').delete().match({ book_id: book.id, user_id: user.id }));
  store.removeStorage(`ricettario:book:${book.id}`);
  localStorage.removeItem(`ricettario:queue:${book.id}`);
  books = books.filter((b) => b.id !== book.id);
  lsSet(`ricettario:books:${user.id}`, books);
  await openBook(books.find((b) => b.role === 'owner')?.id);
}

// =============================================================
//  Coda delle modifiche da inviare al server
// =============================================================
//  op = { type: 'item', kind, id, data }   (data null = eliminato)
//     | { type: 'photo', id, op: 'put' | 'delete' }
//     | { type: 'replace-all' }            (dopo l'importazione di un backup)

const queueKey = () => `ricettario:queue:${book.id}`;
const queue = () => (book ? lsGet(queueKey(), []) : []);
const saveQueue = (q) => lsSet(queueKey(), q);
export const pendingCount = () => queue().length;

function enqueue(op) {
  if (!book || !canEdit()) return;
  const same = (a) => a.type === op.type && a.id === op.id && a.kind === op.kind;
  const q = queue().filter((a) => !same(a));
  q.push(op);
  saveQueue(q);
  scheduleFlush();
}

let flushTimer = null;
let flushing = null;
const listeners = { status: () => {}, error: () => {}, remote: () => {} };
export const on = (event, fn) => { listeners[event] = fn; };

function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => flush().catch(() => {}), 400);
}

/** Invia al server le modifiche in coda, una alla volta e in ordine */
export function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    if (!book || !navigator.onLine) return;
    listeners.status('sync');
    while (queue().length) {
      const op = queue()[0];
      try {
        await send(op);
      } catch (e) {
        if (isNetworkError(e)) { listeners.status('offline'); return; }
        // errore "vero" (es. permessi cambiati): la modifica viene scartata
        listeners.error(e);
      }
      saveQueue(queue().slice(1));
    }
    listeners.status('ok');
  })().finally(() => { flushing = null; });
  return flushing;
}

async function send(op) {
  const bookId = book.id;
  if (op.type === 'item') {
    if (op.data) {
      check(await sb.from('items').upsert({
        book_id: bookId, kind: op.kind, id: op.id, data: op.data,
        updated_at: new Date().toISOString(), updated_by: user.id,
      }));
    } else {
      check(await sb.from('items').delete().match({ book_id: bookId, kind: op.kind, id: op.id }));
    }
  } else if (op.type === 'photo') {
    const path = `${bookId}/${op.id}.jpg`;
    if (op.op === 'put') {
      const dataUrl = getImage(op.id);
      if (!dataUrl) return;
      const blob = await (await fetch(dataUrl)).blob();
      check(await sb.storage.from('photos').upload(path, blob, { upsert: true, contentType: 'image/jpeg' }));
    } else {
      check(await sb.storage.from('photos').remove([path]));
    }
  } else if (op.type === 'replace-all') {
    check(await sb.from('items').delete().eq('book_id', bookId));
    const rows = allRows(bookId);
    if (rows.length) check(await sb.from('items').upsert(rows));
    for (const id of photoIds()) {
      await send({ type: 'photo', id, op: 'put' });
    }
  }
}

const allRows = (bookId) => {
  const d = store.snapshot();
  const now = new Date().toISOString();
  return Object.entries(KIND_OF).flatMap(([coll, kind]) =>
    d[coll].map((item) => ({ book_id: bookId, kind, id: item.id, data: item, updated_at: now, updated_by: user.id })));
};

/** Id di tutte le foto usate da categorie, ricette e alimenti */
const photoIds = () => {
  const d = store.snapshot();
  return [...new Set([...d.categories, ...d.recipes, ...d.pantry, ...d.meals].map((x) => x.photo).filter(Boolean))];
};

/** Porta nel ricettario aperto i dati che erano salvati solo su questo dispositivo */
export async function uploadAll() {
  enqueue({ type: 'replace-all' });
  await flush();
}

// Ogni modifica fatta nell'app finisce in coda
store.onChange((change) => {
  if (!book) return;
  if (change.kind === 'all') return enqueue({ type: 'replace-all' });
  enqueue({ type: 'item', kind: change.kind, id: change.id, data: change.item ? { ...change.item } : null });
});
onImageChange(({ id, op }) => enqueue({ type: 'photo', id, op }));

// =============================================================
//  Foto mancanti (aggiunte da un altro dispositivo o da un'altra persona)
// =============================================================
let fetchingPhotos = false;
export async function fetchMissingPhotos() {
  if (fetchingPhotos || !book) return;
  fetchingPhotos = true;
  const bookId = book.id;
  let added = 0;
  try {
    for (const id of photoIds().filter((p) => !hasImage(p))) {
      try {
        const blob = check(await sb.storage.from('photos').download(`${bookId}/${id}.jpg`));
        const dataUrl = await new Promise((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.readAsDataURL(blob);
        });
        await putImage(id, dataUrl, { silent: true });
        added++;
      } catch (e) {
        if (isNetworkError(e)) break; // riproverà la prossima volta
      }
    }
  } finally {
    fetchingPhotos = false;
  }
  if (added) listeners.remote();
}

// =============================================================
//  Tempo reale
// =============================================================
let channel = null;

function startRealtime() {
  if (!book || !sb) return;
  const bookId = book.id;
  const filter = `book_id=eq.${bookId}`;
  const handle = (payload) => {
    if (!book || book.id !== bookId) return;
    if (payload.eventType === 'DELETE') {
      const old = payload.old || {};
      if (old.book_id && old.book_id !== bookId) return;
      if (!old.kind || !old.id) return;
      store.applyRemote(old.kind, old.id, null);
    } else {
      const row = payload.new;
      if (!row || row.book_id !== bookId) return;
      if (row.updated_by === user?.id) return; // è una mia modifica, già applicata
      const pending = queue().some((op) => op.type === 'item' && op.kind === row.kind && op.id === row.id);
      if (pending) return; // ho una modifica locale più recente ancora da inviare
      store.applyRemote(row.kind, row.id, row.data);
      fetchMissingPhotos();
    }
    listeners.remote();
  };
  channel = sb.channel(`items-${bookId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items', filter }, handle)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items', filter }, handle)
    // le eliminazioni non si possono filtrare lato server: controllo il ricettario qui
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'items' }, handle)
    .subscribe();
}

function stopRealtime() {
  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }
}

// Torna la connessione / riapri l'app: invia le modifiche in coda e aggiorna
window.addEventListener('online', () => { if (book) flush().then(() => pull()).then(() => listeners.remote()).catch(() => {}); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !book || !navigator.onLine) return;
  flush().then(() => pull()).then(() => listeners.remote()).catch(() => {});
});
