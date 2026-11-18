// =============================================================
//  app.js — navigazione (router) e schermate dell'app
// =============================================================
import * as store from './store.js';
import { initImages, getImage, putImage, deleteImage, fileToDataUrl } from './images.js';
import { esc, icon, num, fmt, kcalFromMacros, toast, openSheet, confirmSheet, actionSheet } from './ui.js';

const $view = document.getElementById('view');
const $navbar = document.getElementById('navbar');
const $navLeft = document.getElementById('nav-left');
const $navTitle = document.getElementById('nav-title');
const $navRight = document.getElementById('nav-right');

// ---------- Router (basato sull'hash: funziona su GitHub Pages) ----------
const routes = [
  [/^#?\/?$/, () => renderHome()],
  [/^#\/categoria\/([\w-]+)$/, (m) => renderCategory(m[1])],
  [/^#\/ricetta\/([\w-]+)$/, (m) => renderRecipe(m[1])],
  [/^#\/nuova(?:\/([\w-]+))?$/, (m) => renderEditor(null, m[1])],
  [/^#\/modifica\/([\w-]+)$/, (m) => renderEditor(m[1])],
];

function router() {
  const hash = location.hash || '#/';
  for (const [re, view] of routes) {
    const m = hash.match(re);
    if (m) {
      $view.classList.remove('enter');
      void $view.offsetWidth; // riavvia l'animazione
      $view.classList.add('enter');
      window.scrollTo(0, 0);
      view(m);
      onScroll();
      return;
    }
  }
  location.replace('#/');
}

const go = (hash, replace = false) => (replace ? location.replace(hash) : (location.hash = hash));

// ---------- Barra di navigazione ----------
function setNav({ title = '', back = null, right = '' }) {
  $navTitle.textContent = title;
  $navLeft.innerHTML = back
    ? `<a class="nav-btn back" href="${back.href}">${icon.back}<span>${esc(back.label)}</span></a>`
    : '';
  // Il pulsante sole/luna sta sempre a destra, prima degli altri pulsanti
  $navRight.innerHTML = themeButton() + right;
}

// ---------- Tema chiaro / scuro ----------
// L'icona mostra la modalità attuale: sole = chiara, luna = scura
const THEME_KEY = 'ricettario:theme';
const currentTheme = () => document.documentElement.dataset.theme || 'light';

const themeButton = () => {
  const dark = currentTheme() === 'dark';
  return `<button class="nav-btn theme-toggle" id="theme-toggle"
            aria-label="${dark ? 'Passa alla modalità chiara' : 'Passa alla modalità scura'}">
            ${dark ? icon.moon : icon.sun}
          </button>`;
};

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme-color').content = theme === 'dark' ? '#131313' : '#eef0f6';
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage non disponibile */ }
  document.getElementById('theme-toggle').outerHTML = themeButton();
}

$navRight.addEventListener('click', (e) => {
  if (e.target.closest('#theme-toggle')) setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
});

function onScroll() {
  $navbar.classList.toggle('scrolled', window.scrollY > 36);
}
window.addEventListener('scroll', onScroll, { passive: true });

// ---------- Componenti ----------
/** Icona di ricetta o categoria: la foto se c'è, altrimenti l'emoji */
const avatar = (item, fallback = '🍽️') => {
  const src = getImage(item?.photo);
  return src ? `<img class="avatar-img" src="${esc(src)}" alt="">` : esc(item?.emoji || fallback);
};

const macroChips = (n) => `
  <span class="chips">
    <i class="chip p">P ${fmt(n.protein)}g</i>
    <i class="chip c">C ${fmt(n.carbs)}g</i>
    <i class="chip f">G ${fmt(n.fat)}g</i>
  </span>`;

const recipeRow = (r) => `
  <a class="row glass" href="#/ricetta/${r.id}">
    <span class="row-emoji">${avatar(r)}</span>
    <span class="row-body">
      <span class="row-title">${esc(r.name)}</span>
      <span class="row-meta">${r.time ? `${r.time} min · ` : ''}${fmt(r.nutrition.kcal)} kcal</span>
      ${macroChips(r.nutrition)}
    </span>
    <span class="row-chev">${icon.chevron}</span>
  </a>`;

const countLabel = (n) => (n === 1 ? '1 ricetta' : `${n} ricette`);

// =============================================================
//  HOME — categorie + ricerca
// =============================================================
function renderHome() {
  setNav({
    title: 'Ricette',
    right: `<button class="nav-btn icon" id="settings" aria-label="Impostazioni">${icon.gear}</button>`,
  });

  $view.innerHTML = `
    <section class="page">
      <h1 class="large-title">Ricette</h1>
      <label class="search glass">
        ${icon.search}
        <input id="q" type="search" placeholder="Cerca una ricetta" autocomplete="off">
      </label>
      <div id="home-content"></div>
    </section>
    <a class="fab" href="#/nuova" aria-label="Nuova ricetta">${icon.plus}</a>`;

  const $content = document.getElementById('home-content');
  const $q = document.getElementById('q');

  const draw = () => {
    const q = $q.value.trim().toLowerCase();
    if (q) {
      const results = store.getRecipes().filter((r) =>
        [r.name, ...r.ingredients.map((i) => i.name)].join(' ').toLowerCase().includes(q)
      );
      $content.innerHTML = results.length
        ? `<h2 class="section-title">Risultati</h2><div class="list">${results.map(recipeRow).join('')}</div>`
        : `<p class="empty">Nessuna ricetta trovata per “${esc(q)}”.</p>`;
      return;
    }
    const recent = [...store.getRecipes()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
    $content.innerHTML = `
      <h2 class="section-title">Categorie</h2>
      <div class="grid">
        ${store.getCategories().map((c) => `
          <a class="cat glass" href="#/categoria/${c.id}">
            <span class="cat-emoji">${avatar(c)}</span>
            <span class="cat-name">${esc(c.name)}</span>
            <span class="cat-count">${countLabel(store.recipesIn(c.id).length)}</span>
          </a>`).join('')}
        <button class="cat add" id="add-cat">
          <span class="cat-emoji">${icon.plus}</span>
          <span class="cat-name">Nuova categoria</span>
        </button>
      </div>
      ${recent.length ? `
        <h2 class="section-title">Modificate di recente</h2>
        <div class="list">${recent.map(recipeRow).join('')}</div>` : ''}`;
    document.getElementById('add-cat').onclick = () => categorySheet();
  };

  $q.addEventListener('input', draw);
  document.getElementById('settings').onclick = settingsSheet;
  draw();
}

// =============================================================
//  CATEGORIA — elenco ricette
// =============================================================
function renderCategory(id) {
  const cat = store.getCategory(id);
  if (!cat) return go('#/', true);
  const recipes = store.recipesIn(id);

  setNav({
    title: cat.name,
    back: { href: '#/', label: 'Ricette' },
    right: `<button class="nav-btn icon" id="cat-menu" aria-label="Opzioni categoria">${icon.more}</button>`,
  });

  $view.innerHTML = `
    <section class="page">
      <h1 class="large-title"><span class="title-emoji">${avatar(cat)}</span>${esc(cat.name)}</h1>
      <p class="subtitle">${countLabel(recipes.length)}</p>
      ${recipes.length
        ? `<div class="list">${recipes.map(recipeRow).join('')}</div>`
        : `<div class="empty-state glass">
             <span class="big-emoji">${avatar(cat)}</span>
             <p>Ancora nessuna ricetta in questa categoria.</p>
             <a class="btn primary" href="#/nuova/${id}">Aggiungi la prima ricetta</a>
           </div>`}
    </section>
    <a class="fab" href="#/nuova/${id}" aria-label="Nuova ricetta">${icon.plus}</a>`;

  document.getElementById('cat-menu').onclick = () =>
    actionSheet([
      { label: 'Modifica categoria', run: () => categorySheet(cat) },
      {
        label: 'Elimina categoria',
        danger: true,
        run: async () => {
          if (recipes.length) return toast('Sposta o elimina prima le ricette della categoria');
          if (await confirmSheet(`Eliminare la categoria “${cat.name}”?`, { okText: 'Elimina', danger: true })) {
            await deleteImage(cat.photo);
            store.deleteCategory(id);
            toast('Categoria eliminata');
            go('#/', true);
          }
        },
      },
    ]);
}

// Sheet per creare / modificare una categoria
const EMOJI_PICKS = ['🥣', '🍝', '🍗', '🐟', '🥗', '🍲', '🍕', '🥪', '🍰', '🍪', '🥜', '🥤', '🍳', '🌱', '🍜', '🥘'];

/**
 * Selettore dell'icona: emoji oppure foto dalla galleria.
 * Restituisce { commit() } che salva la foto (se serve) e dà { emoji, photo }.
 */
function iconPicker(container, { emoji = '🍽️', photo = null } = {}) {
  const st = { mode: getImage(photo) ? 'photo' : 'emoji', emoji, newData: null };

  const draw = () => {
    const src = st.newData || getImage(photo);
    const isPhoto = st.mode === 'photo';
    container.innerHTML = `
      <div class="icon-picker">
        <label class="ip-preview ${isPhoto ? 'is-photo' : ''}">
          ${isPhoto
            ? (src ? `<img src="${esc(src)}" alt="">` : `<span class="ip-cam">${icon.camera}</span>`)
            : `<span class="ip-emoji">${esc(st.emoji)}</span>`}
          ${isPhoto ? '<input type="file" accept="image/*" hidden>' : ''}
        </label>
        <div class="ip-side">
          <div class="segmented" role="tablist">
            <button type="button" data-mode="emoji" class="${!isPhoto ? 'on' : ''}">Emoji</button>
            <button type="button" data-mode="photo" class="${isPhoto ? 'on' : ''}">Foto</button>
          </div>
          ${isPhoto
            ? `<label class="btn ghost small ip-choose">${icon.camera} ${src ? 'Cambia foto' : 'Scegli dalla galleria'}
                 <input type="file" accept="image/*" hidden></label>`
            : `<input class="input ip-field" maxlength="4" value="${esc(st.emoji)}" aria-label="Emoji">`}
        </div>
      </div>
      ${isPhoto ? '' : `
        <div class="emoji-picks">
          ${EMOJI_PICKS.map((e) => `<button type="button" class="emoji-pick" data-e="${e}">${e}</button>`).join('')}
        </div>`}`;

    container.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => { st.mode = b.dataset.mode; draw(); })
    );
    const field = container.querySelector('.ip-field');
    const preview = container.querySelector('.ip-emoji');
    field?.addEventListener('input', () => {
      st.emoji = field.value.trim() || '🍽️';
      preview.textContent = st.emoji;
    });
    container.querySelectorAll('.emoji-pick').forEach((b) =>
      b.addEventListener('click', () => {
        st.emoji = field.value = preview.textContent = b.dataset.e;
      })
    );
    container.querySelectorAll('input[type=file]').forEach((input) =>
      input.addEventListener('change', async () => {
        const f = input.files[0];
        if (!f) return;
        try {
          st.newData = await fileToDataUrl(f);
          draw();
        } catch {
          toast('Non riesco a leggere questa foto');
        }
      })
    );
  };
  draw();

  return {
    async commit() {
      if (st.mode === 'photo' && st.newData) {
        await deleteImage(photo);
        const id = store.uid();
        await putImage(id, st.newData);
        return { emoji: st.emoji, photo: id };
      }
      if (st.mode === 'photo' && getImage(photo)) return { emoji: st.emoji, photo };
      // Modalità emoji (o foto non scelta): l'eventuale foto precedente si elimina
      await deleteImage(photo);
      return { emoji: st.emoji, photo: null };
    },
  };
}

function categorySheet(cat = null) {
  openSheet(
    `<h3 class="sheet-title">${cat ? 'Modifica categoria' : 'Nuova categoria'}</h3>
     <form id="cat-form" class="form">
       <div id="cat-icon"></div>
       <input class="input" name="name" placeholder="Nome categoria" value="${esc(cat?.name || '')}" required>
       <button class="btn primary full" type="submit">${cat ? 'Salva' : 'Crea categoria'}</button>
     </form>`,
    (sheet, close) => {
      const form = sheet.querySelector('#cat-form');
      const picker = iconPicker(sheet.querySelector('#cat-icon'), { emoji: cat?.emoji || '🍽️', photo: cat?.photo });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = form.name.value.trim();
        if (!name) return form.name.focus();
        const { emoji, photo } = await picker.commit();
        const id = store.saveCategory({ id: cat?.id, name, emoji, photo });
        close();
        toast(cat ? 'Categoria aggiornata' : 'Categoria creata');
        cat ? router() : go(`#/categoria/${id}`);
      };
    }
  );
}

// =============================================================
//  RICETTA — pagina di dettaglio
// =============================================================
function renderRecipe(id) {
  const r = store.getRecipe(id);
  if (!r) return go('#/', true);
  const cat = store.getCategory(r.categoryId);
  const n = r.nutrition;
  let portions = r.servings || 1;

  setNav({
    title: r.name,
    back: { href: cat ? `#/categoria/${cat.id}` : '#/', label: cat?.name || 'Ricette' },
    right: `<a class="nav-btn text" href="#/modifica/${r.id}">Modifica</a>`,
  });

  // Ripartizione delle calorie fra i macro (per il grafico ad anello)
  const kP = n.protein * 4, kC = n.carbs * 4, kF = n.fat * 9;
  const kTot = kP + kC + kF || 1;
  const pctP = (kP / kTot) * 100, pctC = (kC / kTot) * 100;
  const pct = (k) => Math.round((k / kTot) * 100);

  $view.innerHTML = `
    <section class="page recipe">
      <div class="hero">
        <span class="hero-emoji glass">${avatar(r)}</span>
        <h1 class="large-title center">${esc(r.name)}</h1>
        <div class="pills">
          ${cat ? `<span class="pill glass"><span class="pill-icon">${avatar(cat)}</span> ${esc(cat.name)}</span>` : ''}
          ${r.time ? `<span class="pill glass">${icon.clock} ${r.time} min</span>` : ''}
        </div>
      </div>

      <div class="card glass nutrition">
        <div class="ring" style="--p:${pctP}%; --c:${pctP + pctC}%">
          <div class="ring-inner">
            <strong>${fmt(n.kcal)}</strong><span>kcal</span>
          </div>
        </div>
        <div class="macros">
          <p class="card-label">Valori per porzione</p>
          ${[
            ['p', 'Proteine', n.protein, kP],
            ['c', 'Carboidrati', n.carbs, kC],
            ['f', 'Grassi', n.fat, kF],
          ].map(([k, label, g, kc]) => `
            <div class="macro ${k}">
              <span class="dot"></span>
              <span class="macro-name">${label}</span>
              <span class="macro-val">${fmt(g)} g</span>
              <span class="macro-pct">${pct(kc)}%</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="card glass">
        <div class="card-head">
          <h2 class="card-title">Ingredienti</h2>
          <div class="stepper" aria-label="Porzioni">
            <button id="minus" aria-label="Meno porzioni">${icon.minus}</button>
            <span id="portions"></span>
            <button id="plus" aria-label="Più porzioni">${icon.plus}</button>
          </div>
        </div>
        <ul class="ingredients" id="ingredients"></ul>
      </div>

      ${r.steps.length ? `
        <div class="card glass">
          <h2 class="card-title">Preparazione</h2>
          <ol class="steps">
            ${r.steps.map((s, i) => `<li><span class="step-n">${i + 1}</span><p>${esc(s)}</p></li>`).join('')}
          </ol>
        </div>` : ''}

      ${r.notes ? `
        <div class="card glass">
          <h2 class="card-title">Note</h2>
          <p class="notes">${esc(r.notes)}</p>
        </div>` : ''}

      <button class="btn danger-ghost full" id="delete">${icon.trash} Elimina ricetta</button>
    </section>`;

  // Porzioni: le quantità degli ingredienti si ricalcolano
  const drawIngredients = () => {
    const factor = portions / (r.servings || 1);
    document.getElementById('portions').innerHTML = `${icon.people} ${portions}`;
    document.getElementById('ingredients').innerHTML = r.ingredients.length
      ? r.ingredients.map((i) => {
          const q = i.qty ? fmt(i.qty * factor) : '';
          return `<li><span class="ing-name">${esc(i.name)}</span><span class="ing-qty">${q} ${esc(i.unit || '')}</span></li>`;
        }).join('')
      : '<li class="muted">Nessun ingrediente inserito</li>';
  };
  document.getElementById('minus').onclick = () => { if (portions > 1) { portions--; drawIngredients(); } };
  document.getElementById('plus').onclick = () => { portions++; drawIngredients(); };
  drawIngredients();

  document.getElementById('delete').onclick = async () => {
    if (await confirmSheet(`Eliminare “${r.name}”? L’operazione non si può annullare.`, { okText: 'Elimina', danger: true })) {
      await deleteImage(r.photo);
      store.deleteRecipe(r.id);
      toast('Ricetta eliminata');
      go(cat ? `#/categoria/${cat.id}` : '#/', true);
    }
  };
}

// =============================================================
//  EDITOR — nuova ricetta / modifica
// =============================================================
const UNITS = ['g', 'kg', 'ml', 'l', 'pz', 'cucchiaio', 'cucchiaino', 'tazza', 'pizzico', 'q.b.'];

const ingredientRow = (i = {}) => `
  <div class="ing-row">
    <input class="input qty" name="qty" inputmode="decimal" placeholder="100" value="${i.qty ?? ''}">
    <input class="input unit" name="unit" list="units" placeholder="g" value="${esc(i.unit || '')}">
    <input class="input" name="ing" placeholder="Ingrediente" value="${esc(i.name || '')}">
    <button type="button" class="remove" aria-label="Rimuovi">${icon.x}</button>
  </div>`;

const stepRow = (s = '') => `
  <div class="step-row">
    <span class="step-n"></span>
    <textarea class="input" name="step" rows="2" placeholder="Descrivi il passaggio">${esc(s)}</textarea>
    <button type="button" class="remove" aria-label="Rimuovi">${icon.x}</button>
  </div>`;

function renderEditor(id, presetCategory) {
  const editing = id ? store.getRecipe(id) : null;
  if (id && !editing) return go('#/', true);

  const r = editing || {
    name: '', emoji: '🍽️', categoryId: presetCategory || store.getCategories()[0]?.id,
    time: '', servings: 1, ingredients: [{}, {}], steps: [''], notes: '',
    nutrition: { kcal: '', protein: '', carbs: '', fat: '' },
  };
  const backHref = editing ? `#/ricetta/${editing.id}` : presetCategory ? `#/categoria/${presetCategory}` : '#/';

  setNav({
    title: editing ? 'Modifica' : 'Nuova ricetta',
    back: { href: backHref, label: 'Annulla' },
    right: `<button class="nav-btn text strong" form="recipe-form" type="submit">Salva</button>`,
  });

  $view.innerHTML = `
    <section class="page">
      <h1 class="large-title">${editing ? 'Modifica ricetta' : 'Nuova ricetta'}</h1>
      <form id="recipe-form" class="form" novalidate>
        <div class="card glass">
          <div id="recipe-icon"></div>
          <input class="input" name="name" placeholder="Nome della ricetta" value="${esc(r.name)}" required>
          <label class="field">
            <span>Categoria</span>
            <select class="input" name="category">
              ${store.getCategories().map((c) => `<option value="${c.id}" ${c.id === r.categoryId ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}
            </select>
          </label>
          <div class="field-grid">
            <label class="field"><span>Tempo (min)</span>
              <input class="input" name="time" inputmode="numeric" placeholder="20" value="${r.time ?? ''}"></label>
            <label class="field"><span>Porzioni</span>
              <input class="input" name="servings" inputmode="numeric" placeholder="1" value="${r.servings ?? 1}"></label>
          </div>
        </div>

        <div class="card glass">
          <h2 class="card-title">Valori nutrizionali <small>per porzione</small></h2>
          <div class="field-grid three">
            <label class="field macro-field p"><span>Proteine (g)</span>
              <input class="input" name="protein" inputmode="decimal" placeholder="0" value="${r.nutrition.protein}"></label>
            <label class="field macro-field c"><span>Carboidrati (g)</span>
              <input class="input" name="carbs" inputmode="decimal" placeholder="0" value="${r.nutrition.carbs}"></label>
            <label class="field macro-field f"><span>Grassi (g)</span>
              <input class="input" name="fat" inputmode="decimal" placeholder="0" value="${r.nutrition.fat}"></label>
          </div>
          <label class="field"><span>Calorie totali (kcal)</span>
            <input class="input" name="kcal" inputmode="decimal" placeholder="Calcolate in automatico" value="${r.nutrition.kcal}"></label>
          <p class="hint" id="kcal-hint"></p>
        </div>

        <div class="card glass">
          <h2 class="card-title">Ingredienti</h2>
          <div id="ing-list">${r.ingredients.map(ingredientRow).join('')}</div>
          <button type="button" class="btn ghost small" id="add-ing">${icon.plus} Aggiungi ingrediente</button>
          <datalist id="units">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist>
        </div>

        <div class="card glass">
          <h2 class="card-title">Preparazione</h2>
          <div id="step-list">${r.steps.map(stepRow).join('')}</div>
          <button type="button" class="btn ghost small" id="add-step">${icon.plus} Aggiungi passaggio</button>
        </div>

        <div class="card glass">
          <h2 class="card-title">Note</h2>
          <textarea class="input" name="notes" rows="3" placeholder="Consigli, varianti, conservazione…">${esc(r.notes)}</textarea>
        </div>

        <button class="btn primary full" type="submit">${editing ? 'Salva modifiche' : 'Salva ricetta'}</button>
      </form>
    </section>`;

  const form = document.getElementById('recipe-form');
  const $ing = document.getElementById('ing-list');
  const $steps = document.getElementById('step-list');
  const $hint = document.getElementById('kcal-hint');
  const picker = iconPicker(document.getElementById('recipe-icon'), { emoji: r.emoji || '🍽️', photo: editing?.photo });

  // Suggerimento calorie calcolate dai macro
  const macros = () => ({ protein: num(form.protein.value), carbs: num(form.carbs.value), fat: num(form.fat.value) });
  const updateHint = () => {
    const k = kcalFromMacros(macros());
    $hint.innerHTML = k
      ? `Dai macro risultano circa <strong>${k} kcal</strong>. ${form.kcal.value ? '' : 'Se lasci vuoto il campo userò questo valore.'}`
      : 'Inserisci i macro: le calorie si calcolano da sole (oppure scrivile tu).';
  };
  ['protein', 'carbs', 'fat', 'kcal'].forEach((f) => form[f].addEventListener('input', updateHint));
  updateHint();

  // Righe dinamiche
  const renumber = () => $steps.querySelectorAll('.step-n').forEach((el, i) => (el.textContent = i + 1));
  renumber();
  document.getElementById('add-ing').onclick = () => {
    $ing.insertAdjacentHTML('beforeend', ingredientRow());
    $ing.lastElementChild.querySelector('[name=qty]').focus();
  };
  document.getElementById('add-step').onclick = () => {
    $steps.insertAdjacentHTML('beforeend', stepRow());
    renumber();
    $steps.lastElementChild.querySelector('textarea').focus();
  };
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove');
    if (!btn) return;
    btn.parentElement.remove();
    renumber();
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) {
      form.name.focus();
      return toast('Dai un nome alla ricetta');
    }
    const { emoji, photo } = await picker.commit();
    const m = macros();
    const recipe = {
      id: editing?.id,
      name,
      emoji,
      photo,
      categoryId: form.category.value,
      time: Math.round(num(form.time.value)) || null,
      servings: Math.max(1, Math.round(num(form.servings.value)) || 1),
      ingredients: [...$ing.querySelectorAll('.ing-row')]
        .map((row) => ({
          qty: row.querySelector('[name=qty]').value.trim() ? num(row.querySelector('[name=qty]').value) : null,
          unit: row.querySelector('[name=unit]').value.trim(),
          name: row.querySelector('[name=ing]').value.trim(),
        }))
        .filter((i) => i.name),
      steps: [...$steps.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
      notes: form.notes.value.trim(),
      nutrition: { ...m, kcal: form.kcal.value.trim() ? num(form.kcal.value) : kcalFromMacros(m) },
    };
    const savedId = store.saveRecipe(recipe);
    toast(editing ? 'Modifiche salvate' : 'Ricetta salvata');
    go(`#/ricetta/${savedId}`, true);
  };
}

// =============================================================
//  IMPOSTAZIONI — backup dei dati
// =============================================================
function settingsSheet() {
  openSheet(
    `<h3 class="sheet-title">Impostazioni</h3>
     <p class="sheet-msg">Le ricette sono salvate su questo dispositivo. Fai ogni tanto un backup per non perderle.</p>
     <div class="action-list">
       <button class="action" id="export">Esporta backup (.json)</button>
       <label class="action">Importa backup<input type="file" id="import" accept="application/json,.json" hidden></label>
     </div>
     <button class="btn ghost full" data-close>Chiudi</button>`,
    (sheet, close) => {
      sheet.querySelector('#export').onclick = async () => {
        const date = new Date().toISOString().slice(0, 10);
        const file = new File([store.exportJSON()], `ricettario-backup-${date}.json`, { type: 'application/json' });
        // Su iPhone apre il menu Condividi (salva su File, AirDrop…)
        if (navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: 'Backup Ricettario' }); } catch { /* annullato */ }
        } else {
          const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
          a.click();
          URL.revokeObjectURL(a.href);
        }
      };
      sheet.querySelector('#import').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (!(await confirmSheet('Importando il backup sostituirai le ricette attuali. Continuare?', { okText: 'Importa' }))) return;
        try {
          await store.importJSON(await f.text());
          toast('Backup importato');
          go('#/', true);
          router();
        } catch {
          toast('Il file non è un backup valido');
        }
      };
    }
  );
}

// ---------- Avvio ----------
window.addEventListener('hashchange', router);
await initImages(); // carica le foto prima di disegnare
router();

// Service worker: rende l'app installabile e utilizzabile offline.
// Non lo attiviamo in locale per non avere problemi di cache mentre sviluppi.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('./sw.js');
}
