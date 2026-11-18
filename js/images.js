// =============================================================
//  images.js — foto di ricette e categorie
// =============================================================
//  Le foto scelte dalla galleria vengono ridimensionate (max 1000px)
//  e compresse in JPEG, poi salvate in IndexedDB, che ha molto più
//  spazio di localStorage. All'avvio le carichiamo tutte in memoria
//  così le schermate si possono disegnare subito.

const DB_NAME = 'ricettario-img';
const STORE = 'images';
const cache = new Map();
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const run = (mode, fn) =>
  new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    fn(t.objectStore(STORE));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });

export async function initImages() {
  try {
    db = await openDB();
    await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve();
        cache.set(c.key, c.value);
        c.continue();
      };
      req.onerror = () => resolve();
    });
  } catch (e) {
    console.warn('Foto non disponibili', e);
  }
}

export const getImage = (id) => (id ? cache.get(id) || null : null);
export const hasImage = (id) => cache.has(id);
export const allImages = () => Object.fromEntries(cache);

// Avvisi quando si aggiunge o toglie una foto (servono per caricarla anche sul server)
const listeners = new Set();
export const onImageChange = (fn) => listeners.add(fn);

/** silent: true quando la foto arriva dal server (non va ricaricata) */
export async function putImage(id, dataUrl, { silent = false } = {}) {
  cache.set(id, dataUrl);
  if (db) await run('readwrite', (s) => s.put(dataUrl, id));
  if (!silent) listeners.forEach((fn) => fn({ id, op: 'put' }));
}

export async function deleteImage(id, { silent = false } = {}) {
  if (!id) return;
  cache.delete(id);
  if (db) await run('readwrite', (s) => s.delete(id));
  if (!silent) listeners.forEach((fn) => fn({ id, op: 'delete' }));
}

export async function replaceAll(images = {}) {
  cache.clear();
  if (db) await run('readwrite', (s) => s.clear());
  for (const [id, url] of Object.entries(images)) await putImage(id, url, { silent: true });
}

/** Legge una foto scelta dalla galleria e la restituisce ridimensionata (dataURL JPEG) */
export function fileToDataUrl(file, max = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Immagine non valida'));
    };
    img.src = url;
  });
}
