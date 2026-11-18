// =============================================================
//  store.js — dati dell'app salvati nel dispositivo (localStorage)
// =============================================================
//
//  Struttura dei dati (pensata già per le versioni future:
//  piano settimanale, lista della spesa, diario giornaliero).
//
//  Recipe {
//    id, name, emoji, categoryId,
//    time        -> minuti di preparazione
//    servings    -> numero di porzioni
//    ingredients -> [{ qty, unit, name }]   (servirà per la lista della spesa)
//    steps       -> [ "testo passaggio", ... ]
//    notes,
//    nutrition   -> { kcal, protein, carbs, fat }  PER PORZIONE
//    createdAt, updatedAt
//  }

const STORAGE_KEY = 'ricettario:v1';

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))
    .replace(/-/g, '')
    .slice(0, 12);

function seed() {
  const cats = [
    { id: 'colazione', name: 'Colazione', emoji: '🥣' },
    { id: 'primi', name: 'Primi', emoji: '🍝' },
    { id: 'secondi', name: 'Secondi', emoji: '🍗' },
    { id: 'contorni', name: 'Contorni', emoji: '🥗' },
    { id: 'dolci', name: 'Dolci', emoji: '🍰' },
    { id: 'snack', name: 'Snack', emoji: '🥜' },
  ];
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
        { qty: 40, unit: 'g', name: 'fiocchi d’avena' },
        { qty: 150, unit: 'ml', name: 'latte di mandorla' },
        { qty: 100, unit: 'g', name: 'yogurt greco 0%' },
        { qty: 1, unit: 'cucchiaino', name: 'cacao amaro' },
        { qty: 10, unit: 'g', name: 'mandorle' },
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
  return { version: 1, categories: cats, recipes };
}

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.categories) && Array.isArray(parsed.recipes)) return parsed;
    }
  } catch (e) {
    console.warn('Impossibile leggere i dati salvati', e);
  }
  const fresh = seed();
  persist(fresh);
  return fresh;
}

function persist(d = data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    return true;
  } catch (e) {
    console.error('Salvataggio non riuscito', e);
    return false;
  }
}

// ---------- Categorie ----------
export const getCategories = () => data.categories;
export const getCategory = (id) => data.categories.find((c) => c.id === id);

export function saveCategory({ id, name, emoji }) {
  if (id) {
    const c = getCategory(id);
    Object.assign(c, { name, emoji });
  } else {
    id = uid();
    data.categories.push({ id, name, emoji });
  }
  persist();
  return id;
}

export function deleteCategory(id) {
  data.categories = data.categories.filter((c) => c.id !== id);
  persist();
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
  return recipe.id;
}

export function deleteRecipe(id) {
  data.recipes = data.recipes.filter((r) => r.id !== id);
  persist();
}

// ---------- Backup ----------
export const exportJSON = () => JSON.stringify(data, null, 2);

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.recipes)) {
    throw new Error('File non valido');
  }
  data = parsed;
  persist();
}
