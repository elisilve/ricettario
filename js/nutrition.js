// =============================================================
//  nutrition.js — calcolo dei valori nutrizionali
// =============================================================
//  Esempio: zucca nella dispensa = per 100 g → C 5, G 5, P 1.
//  In ricetta 50 g di zucca → fattore 50/100 = 0,5 → C 2,5, G 2,5, P 0,5.
//  Il totale della ricetta è la somma degli ingredienti collegati.

import * as store from './store.js';
import { kcalFromMacros } from './ui.js';

const ZERO = { protein: 0, carbs: 0, fat: 0, kcal: 0 };

/** Calorie di un alimento: quelle inserite, oppure calcolate dai macro */
export const foodKcal = (f) => (f.kcal != null && f.kcal !== '' ? Number(f.kcal) : kcalFromMacros(f));

/** Valori dell'alimento collegato: dalla dispensa (aggiornati) o la copia salvata nella ricetta */
export function resolveFood(ing) {
  // 1) alimento collegato  2) se non è collegato, un alimento della dispensa con lo stesso nome
  //    (es. aggiunto in dispensa dopo aver salvato la ricetta)  3) la copia salvata nella ricetta
  const live = store.getFood(ing.foodId) || (!ing.food && ing.name ? store.findFoodByName(ing.name) : null);
  if (live) return live;
  return ing.food || null;
}

// Unità di peso/volume convertite in grammi (per i liquidi 1 ml ≈ 1 g)
const TO_GRAMS = { '': 1, g: 1, gr: 1, grammi: 1, kg: 1000, ml: 1, cl: 10, dl: 100, l: 1000 };
const PIECES = ['', 'pz', 'pezzo', 'pezzi', 'n', 'unità'];

/** Quante "basi" dell'alimento ci sono: es. 50 g con base 100 g → 0,5. null se l'unità non è compatibile */
function portionsOfBasis(qty, unit, basis) {
  const u = (unit || '').trim().toLowerCase().replace(/\.$/, '');
  if (basis === 'pz') return PIECES.includes(u) ? qty : null;
  return u in TO_GRAMS ? (qty * TO_GRAMS[u]) / 100 : null;
}

/**
 * Macro di un ingrediente per la quantità indicata (moltiplicata per factor).
 * Restituisce null se l'ingrediente non è collegato alla dispensa o l'unità non è calcolabile.
 */
export function ingredientMacros(ing, factor = 1) {
  const f = resolveFood(ing);
  if (!f || ing.qty == null || ing.qty === '') return null;
  const k = portionsOfBasis(Number(ing.qty) * factor, ing.unit, f.basis);
  if (k == null) return null;
  return {
    protein: (Number(f.protein) || 0) * k,
    carbs: (Number(f.carbs) || 0) * k,
    fat: (Number(f.fat) || 0) * k,
    kcal: foodKcal(f) * k,
  };
}

export const isLinked = (ing) => !!resolveFood(ing);

/** "Un pizzico" o "q.b.": quantità trascurabili, non entrano nel calcolo e non vengono segnalate */
export const isNegligible = (ing) => ['pizzico', 'q.b.', 'qb'].includes((ing.unit || '').trim().toLowerCase());

const add = (a, b) => ({
  protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, kcal: a.kcal + b.kcal,
});
const scale = (a, k) => ({ protein: a.protein * k, carbs: a.carbs * k, fat: a.fat * k, kcal: a.kcal * k });

const hasValues = (n) => !!n && ['protein', 'carbs', 'fat', 'kcal'].some((k) => Number(n[k]) > 0);

/**
 * Valori della ricetta per un certo numero di porzioni.
 *  - di regola sono la somma degli ingredienti collegati alla dispensa
 *  - legacy: ricette create prima della dispensa, con valori inseriti a mano (per porzione)
 *    e nessun ingrediente collegato, continuano a usare quei valori
 * Restituisce { auto, legacy, total, perServing, perIngredient[], missing[] }
 *  missing = nomi degli ingredienti non conteggiati
 */
export function recipeNutrition(r, portions = r.servings || 1) {
  const factor = portions / (r.servings || 1);
  const auto = r.ingredients.some(isLinked);
  const perIngredient = r.ingredients.map((i) => ingredientMacros(i, factor));
  const legacy = !auto && hasValues(r.nutrition);

  let total;
  if (legacy) {
    const n = r.nutrition;
    total = scale(
      { protein: +n.protein || 0, carbs: +n.carbs || 0, fat: +n.fat || 0, kcal: +n.kcal || 0 },
      portions
    );
  } else {
    total = perIngredient.reduce((acc, m) => (m ? add(acc, m) : acc), { ...ZERO });
  }

  const missing = legacy
    ? []
    : r.ingredients.filter((i, idx) => i.name && !perIngredient[idx] && !isNegligible(i)).map((i) => i.name);

  return { auto, legacy, total, perServing: scale(total, 1 / portions), perIngredient, missing };
}


/**
 * Valori di un elemento di un pasto o del diario.
 *  - alimento della dispensa: come un ingrediente (es. 200 ml di latte di mandorla)
 *  - ricetta: valori per porzione × numero di porzioni
 *  - pasto salvato: valori del pasto intero × quante volte
 * Se la ricetta o il pasto non esistono più si usa la copia dei valori (snap)
 * salvata quando l'elemento è stato aggiunto. null = non calcolabile.
 */
export function itemMacros(it) {
  const times = Number(it.qty) || 1;
  if (it.recipeId || it.mealId) {
    const per = unitValues(it);
    return per ? scale(per, times) : null;
  }
  return ingredientMacros(it);
}

/** Valori di UNA porzione di una ricetta o di UN pasto salvato (quelli da copiare in snap) */
export function unitValues(it) {
  if (it.recipeId) {
    const r = store.getRecipe(it.recipeId);
    if (r) return recipeNutrition(r).perServing;
  }
  if (it.mealId) {
    const m = store.getMeal(it.mealId);
    if (m) return mealNutrition(m).total;
  }
  return it.snap || null;
}

/**
 * Valori di un insieme di elementi (un pasto salvato, un momento del diario, una giornata).
 * Restituisce { total, perItem[], missing[] }  — missing = nomi non conteggiati
 */
export function mealNutrition(meal) {
  const perItem = meal.items.map(itemMacros);
  const total = perItem.reduce((acc, m) => (m ? add(acc, m) : acc), { ...ZERO });
  const missing = meal.items.filter((it, i) => it.name && !perItem[i] && !isNegligible(it)).map((it) => it.name);
  return { total, perItem, missing };
}
