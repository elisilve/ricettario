// =============================================================
//  shopping.js — lista della spesa
// =============================================================
//  Prende tutto quello che è segnato nel diario per una settimana
//  (anche i giorni futuri: è il piano della settimana) e lo scompone
//  negli ingredienti singoli da comprare:
//    - alimento della dispensa  → così com'è (es. 200 ml latte di mandorla)
//    - ricetta (in porzioni)    → i suoi ingredienti, in proporzione
//                                 (2 porzioni di una ricetta da 4 → metà delle quantità)
//    - pasto salvato            → i suoi elementi (alimenti e ricette) × quante volte
//  Lo stesso ingrediente usato più volte viene sommato (gr con gr, ml con ml, pz con pz).
//
//  Le spunte ("già preso / ce l'ho") restano salvate su questo dispositivo, per settimana.

import * as store from './store.js';
import * as diary from './diary.js';
import { capitalize, fmt } from './ui.js';

// ---------- Unità ----------
// Ogni unità finisce in una "famiglia" che si può sommare; il valore è il fattore di conversione
const FAMILY = {
  g: ['gr', 1], gr: ['gr', 1], grammi: ['gr', 1], kg: ['gr', 1000],
  ml: ['ml', 1], cl: ['ml', 10], dl: ['ml', 100], l: ['ml', 1000],
  pz: ['pz', 1], pezzo: ['pz', 1], pezzi: ['pz', 1], '': ['pz', 1],
  pizzico: ['qb', 0], 'q.b.': ['qb', 0], qb: ['qb', 0],
};

/** "1.250 gr" → "1,25 kg"; "3 pz"; "q.b." */
function formatAmounts(amounts) {
  const parts = [];
  if (amounts.gr) parts.push(amounts.gr >= 1000 ? `${fmt(amounts.gr / 1000)} kg` : `${fmt(Math.round(amounts.gr))} gr`);
  if (amounts.ml) parts.push(amounts.ml >= 1000 ? `${fmt(amounts.ml / 1000)} l` : `${fmt(Math.round(amounts.ml))} ml`);
  if (amounts.pz) parts.push(`${fmt(Math.round(amounts.pz * 10) / 10)} pz`);
  for (const [unit, n] of Object.entries(amounts.other || {})) parts.push(`${fmt(n)} ${unit}`);
  if (!parts.length && amounts.qb) parts.push('q.b.');
  return parts.join(' + ');
}

// ---------- Scomposizione ----------
/**
 * Aggiunge alla lista un elemento (alimento, ricetta o pasto) moltiplicato per factor.
 * from = da dove arriva (es. "Pasta al pesto"), per mostrarlo sotto l'ingrediente.
 */
function expand(list, it, factor, from) {
  const times = (Number(it.qty) || 1) * factor;

  if (it.recipeId) {
    const r = store.getRecipe(it.recipeId);
    if (r) {
      const k = times / (r.servings || 1); // porzioni volute / porzioni della ricetta
      r.ingredients.forEach((ing) => addIngredient(list, ing, k, r.name));
      return;
    }
  }
  if (it.mealId) {
    const m = store.getMeal(it.mealId);
    if (m) {
      m.items.forEach((sub) => expand(list, sub, times, sub.recipeId ? undefined : m.name));
      return;
    }
  }
  // alimento (oppure ricetta/pasto che non esistono più: resta il nome)
  addIngredient(list, it.recipeId || it.mealId ? { ...it, qty: null } : it, factor, from);
}

function addIngredient(list, ing, factor, from) {
  if (!ing.name) return;
  const food = store.getFood(ing.foodId) || store.findFoodByName(ing.name);
  const key = food ? `f:${food.id}` : `n:${ing.name.trim().toLowerCase()}`;
  const row = list.get(key) || {
    key,
    name: capitalize(food?.name || ing.name),
    foodId: food?.id || null,
    amounts: { gr: 0, ml: 0, pz: 0, qb: false, other: {} },
    from: new Set(),
  };
  const unit = (ing.unit || '').trim().toLowerCase();
  const qty = ing.qty == null || ing.qty === '' ? null : Number(ing.qty) * factor;
  const fam = FAMILY[unit];
  if (fam && fam[0] === 'qb') row.amounts.qb = true;
  else if (qty != null && fam) row.amounts[fam[0]] += qty * fam[1];
  else if (qty != null) row.amounts.other[unit] = (row.amounts.other[unit] || 0) + qty;
  // quantità non indicata: l'ingrediente compare senza quantità
  if (from) row.from.add(from);
  list.set(key, row);
}

/**
 * Lista della spesa della settimana che inizia da `monday`.
 * Restituisce [{ key, name, foodId, amount: "450 gr", from: ["Pasta al pesto", …], checked }]
 */
export function weekList(monday) {
  const list = new Map();
  for (let i = 0; i < 7; i++) {
    const day = diary.addDays(monday, i);
    for (const slot of diary.SLOTS) {
      for (const it of diary.itemsOf(day, slot.id)) expand(list, it, 1);
    }
  }
  const checks = readChecks(monday);
  return [...list.values()]
    .map((r) => ({ key: r.key, name: r.name, foodId: r.foodId, amount: formatAmounts(r.amounts), from: [...r.from], checked: !!checks[r.key] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

/** Quanti giorni della settimana hanno qualcosa segnato */
export const plannedDays = (monday) =>
  Array.from({ length: 7 }, (_, i) => diary.addDays(monday, i)).filter(diary.hasEntries).length;

// ---------- Spunte ----------
const checksKey = (monday) => `ricettario:spesa:${monday}`;
function readChecks(monday) {
  try { return JSON.parse(localStorage.getItem(checksKey(monday))) || {}; } catch { return {}; }
}
export function setChecked(monday, key, value) {
  const checks = readChecks(monday);
  if (value) checks[key] = true;
  else delete checks[key];
  try { localStorage.setItem(checksKey(monday), JSON.stringify(checks)); } catch { /* spazio pieno */ }
}
export function clearChecks(monday) {
  localStorage.removeItem(checksKey(monday));
}

/** Testo semplice da condividere (WhatsApp, Note…) */
export const shareText = (title, rows) =>
  `${title}\n\n${rows.filter((r) => !r.checked).map((r) => `• ${r.name}${r.amount ? ` — ${r.amount}` : ''}`).join('\n')}`;
