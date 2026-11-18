// =============================================================
//  store.js — dati dell'app (copia sul dispositivo + avvisi per la sincronizzazione)
// =============================================================
//
//  Struttura dei dati (pensata già per le versioni future:
//  piano settimanale, lista della spesa, diario giornaliero).
//
//  Recipe {
//    id, name, emoji, categoryId,
//    time        -> minuti di preparazione
//    servings    -> numero di porzioni
//    ingredients -> [{ qty, unit, name, foodId, food }]
//                   foodId: alimento della dispensa collegato (calcolo automatico dei macro)
//                   food:   copia dei valori dell'alimento al momento del salvataggio,
//                           usata se l'alimento viene poi eliminato dalla dispensa
//    steps       -> [ "testo passaggio", ... ]
//    notes,
//    nutrition   -> { kcal, protein, carbs, fat }  PER PORZIONE
//                   (inseriti a mano, oppure calcolati dalla dispensa: vedi nutrition.js)
//    photo       -> id della foto (vedi images.js); se manca si usa l'emoji
//    createdAt, updatedAt
//  }
//
//  Food (dispensa) {
//    id, name,
//    basis   -> 'g' = valori per 100 g (o 100 ml) | 'pz' = valori per 1 pezzo
//    protein, carbs, fat,
//    kcal    -> null = calcolate in automatico dai macro
//  }

import { allImages, replaceAll as replaceImages } from './images.js';

// Dove sono salvati i dati sul dispositivo:
//  - senza account: "ricettario:v1"
//  - con account: una copia locale per ogni ricettario ("ricettario:book:<id>"),
//    così l'app si apre subito e funziona anche senza connessione
export const LOCAL_KEY = 'ricettario:v1';
let storageKey = LOCAL_KEY;

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))
    .replace(/-/g, '')
    .slice(0, 12);

export const defaultCategories = () => [
  { id: 'colazione', name: 'Colazione', emoji: '🥣', order: 0 },
  { id: 'primi', name: 'Primi', emoji: '🍝', order: 1 },
  { id: 'secondi', name: 'Secondi', emoji: '🍗', order: 2 },
  { id: 'contorni', name: 'Contorni', emoji: '🥗', order: 3 },
  { id: 'dolci', name: 'Dolci', emoji: '🍰', order: 4 },
  { id: 'snack', name: 'Snack', emoji: '🥜', order: 5 },
];

function seed() {
  const now = Date.now();
  const recipes = [
    {
      id: uid(),
      name: 'Overnight oats al cacao',
      emoji: '🥣',
      categoryId: 'colazione',
      time: 5,
      servings: 1,
      ingredients: [
        { qty: 40, unit: 'gr', name: 'fiocchi d’avena' },
        { qty: 150, unit: 'ml', name: 'latte di mandorla' },
        { qty: 100, unit: 'gr', name: 'yogurt greco 0%' },
        { qty: 1, unit: 'cucchiaino', name: 'cacao amaro' },
        { qty: 10, unit: 'gr', name: 'mandorle' },
      ],
      steps: [
        'In un barattolo mescola avena, cacao e latte di mandorla.',
        'Aggiungi lo yogurt greco e mescola bene.',
        'Chiudi e lascia in frigo tutta la notte.',
        'Al mattino completa con le mandorle tritate.',
      ],
      notes: 'Ricetta di esempio: puoi modificarla o eliminarla.',
      nutrition: { kcal: 345, protein: 19, carbs: 34, fat: 13 },
      createdAt: now,
      updatedAt: now,
    },
  ];
  // seeded: dati di esempio mai toccati (non vale la pena portarli nell'account)
  return { version: 1, seeded: true, categories: defaultCategories(), recipes, pantry: [] };
}

const empty = () => ({ version: 1, categories: [], recipes: [], pantry: [] });

let data = load(LOCAL_KEY, true);

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.recipes)) return normalize(parsed);
    }
  } catch (e) {
    console.warn('Impossibile leggere i dati salvati', e);
  }
  return null;
}

function load(key, withSeed) {
  const found = read(key);
  if (found) return found;
  const fresh = withSeed ? seed() : empty();
  persist(fresh, key);
  return fresh;
}

// Aggiunge i campi nuovi ai dati salvati con le versioni precedenti
function normalize(d) {
  if (!Array.isArray(d.pantry)) d.pantry = [];
  // L'unità dei grammi si scrive "gr"
  d.recipes.forEach((r) => (r.ingredients || []).forEach((i) => { if (i.unit === 'g') i.unit = 'gr'; }));
  // Ordine delle categorie
  d.categories.forEach((c, i) => { if (c.order == null) c.order = i; });
  d.categories.sort((a, b) => a.order - b.order);
  return d;
}

function persist(d = data, key = storageKey) {
  try {
    localStorage.setItem(key, JSON.stringify(d));
    return true;
  } catch (e) {
    console.error('Salvataggio non riuscito', e);
    return false;
  }
}

/** Passa a un altro archivio (es. la copia locale di un ricettario dell'account) */
export function useStorage(key, { withSeed = false } = {}) {
  storageKey = key;
  data = load(key, withSeed);
}

/** I dati salvati sul dispositivo senza account (per portarli nell'account) */
export const readLocalData = () => {
  const d = read(LOCAL_KEY);
  return d && !d.seeded ? d : null;
};
export const removeStorage = (key) => localStorage.removeItem(key);
export const snapshot = () => data;

// ---------- Avvisi di modifica (usati per sincronizzare con il server) ----------
// change = { kind: 'category' | 'recipe' | 'food', id, item }  (item null = eliminato)
//        | { kind: 'all' }  (es. dopo l'importazione di un backup)
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = (change) => {
  if (data.seeded) { data.seeded = false; persist(); } // da qui in poi sono dati tuoi
  listeners.forEach((fn) => fn(change));
};

const COLLECTION = { category: 'categories', recipe: 'recipes', food: 'pantry' };

/** Sostituisce tutti i dati con quelli arrivati dal server (senza rimandarli indietro) */
export function replaceData({ categories = [], recipes = [], pantry = [] }) {
  data = normalize({ version: 1, categories, recipes, pantry });
  persist();
}

/** Applica una singola modifica arrivata dal server (senza rimandarla indietro) */
export function applyRemote(kind, id, item) {
  const key = COLLECTION[kind];
  if (!key) return;
  const list = data[key].filter((x) => x.id !== id);
  if (item) list.push({ ...item, id });
  data[key] = list;
  normalize(data);
  persist();
}

// ---------- Categorie ----------
export const getCategories = () => data.categories;
export const getCategory = (id) => data.categories.find((c) => c.id === id);

export function saveCategory({ id, name, emoji, photo = null }) {
  if (id) {
    const c = getCategory(id);
    Object.assign(c, { name, emoji, photo });
  } else {
    id = uid();
    const order = Math.max(-1, ...data.categories.map((c) => c.order ?? 0)) + 1;
    data.categories.push({ id, name, emoji, photo, order });
  }
  persist();
  emit({ kind: 'category', id, item: getCategory(id) });
  return id;
}

export function deleteCategory(id) {
  data.categories = data.categories.filter((c) => c.id !== id);
  persist();
  emit({ kind: 'category', id, item: null });
}

// ---------- Ricette ----------
export const getRecipes = () => data.recipes;
export const getRecipe = (id) => data.recipes.find((r) => r.id === id);
export const recipesIn = (categoryId) =>
  data.recipes
    .filter((r) => r.categoryId === categoryId)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));

export function saveRecipe(recipe) {
  const now = Date.now();
  if (recipe.id && getRecipe(recipe.id)) {
    const i = data.recipes.findIndex((r) => r.id === recipe.id);
    data.recipes[i] = { ...data.recipes[i], ...recipe, updatedAt: now };
  } else {
    recipe = { ...recipe, id: uid(), createdAt: now, updatedAt: now };
    data.recipes.push(recipe);
  }
  persist();
  emit({ kind: 'recipe', id: recipe.id, item: getRecipe(recipe.id) });
  return recipe.id;
}

export function deleteRecipe(id) {
  data.recipes = data.recipes.filter((r) => r.id !== id);
  persist();
  emit({ kind: 'recipe', id, item: null });
}

// ---------- Dispensa ----------
export const getPantry = () => [...data.pantry].sort((a, b) => a.name.localeCompare(b.name, 'it'));
export const getFood = (id) => (id ? data.pantry.find((f) => f.id === id) : undefined);
export const findFoodByName = (name) => {
  const n = name.trim().toLowerCase();
  return n ? data.pantry.find((f) => f.name.trim().toLowerCase() === n) : undefined;
};

export function saveFood(food) {
  if (food.id && getFood(food.id)) {
    Object.assign(getFood(food.id), food);
  } else {
    food = { ...food, id: uid() };
    data.pantry.push(food);
  }
  persist();
  emit({ kind: 'food', id: food.id, item: getFood(food.id) });
  return food.id;
}

export function deleteFood(id) {
  data.pantry = data.pantry.filter((f) => f.id !== id);
  persist();
  emit({ kind: 'food', id, item: null });
}

export const recipesUsingFood = (id) => data.recipes.filter((r) => r.ingredients.some((i) => i.foodId === id));

// ---------- Backup ----------
// Il backup include anche le foto
export const exportJSON = () => JSON.stringify({ ...data, images: allImages() });

export async function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.recipes)) {
    throw new Error('File non valido');
  }
  const { images = {}, ...rest } = parsed;
  data = normalize(rest);
  persist();
  await replaceImages(images);
  emit({ kind: 'all' });
}
