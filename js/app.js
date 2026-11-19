// =============================================================
//  app.js — navigazione (router) e schermate dell'app
// =============================================================
import * as store from './store.js';
import { initImages, getImage, putImage, deleteImage, fileToDataUrl } from './images.js';
import * as cloud from './cloud.js';
import { authScreen, accountSheet, errorText } from './account.js';
import { esc, icon, num, fmt, kcalFromMacros, toast, openSheet, confirmSheet, actionSheet, themeRow, bindThemeRow } from './ui.js';
import { recipeNutrition, mealNutrition, foodKcal, isNegligible, resolveFood } from './nutrition.js';

const $view = document.getElementById('view');
const $navbar = document.getElementById('navbar');
const $navLeft = document.getElementById('nav-left');
const $navTitle = document.getElementById('nav-title');
const $navRight = document.getElementById('nav-right');
const $tabbar = document.getElementById('tabbar');

// ---------- Router (basato sull'hash: funziona su GitHub Pages) ----------
const routes = [
  [/^#?\/?$/, () => renderHome()],
  [/^#\/dispensa$/, () => renderPantry()],
  [/^#\/pasti$/, () => renderMeals()],
  [/^#\/pasto\/([\w-]+)$/, (m) => renderMeal(m[1])],
  [/^#\/nuovo-pasto(?:\/([\w-]+))?$/, (m) => renderMealEditor(null, m[1])],
  [/^#\/modifica-pasto\/([\w-]+)$/, (m) => renderMealEditor(m[1])],
  [/^#\/categoria\/([\w-]+)$/, (m) => renderCategory(m[1])],
  [/^#\/ricetta\/([\w-]+)$/, (m) => renderRecipe(m[1])],
  [/^#\/nuova(?:\/([\w-]+))?$/, (m) => renderEditor(null, m[1])],
  [/^#\/modifica\/([\w-]+)$/, (m) => renderEditor(m[1])],
];

/** soft: ridisegna la schermata attuale senza animazione e senza tornare in cima
 *  (usato quando arrivano modifiche da un altro dispositivo o da un'altra persona) */
// Sezioni del menu in basso, nell'ordine in cui compaiono
const TAB_ORDER = ['ricette', 'dispensa', 'pasti'];
const topTab = (hash) => ({ '#/': 'ricette', '#': 'ricette', '': 'ricette', '#/dispensa': 'dispensa', '#/pasti': 'pasti' }[hash] || null);
let lastTop = null;

function router({ soft = false } = {}) {
  const hash = location.hash || '#/';
  // Chi ha accesso in sola lettura non può aprire l'editor
  if (!canEdit() && /^#\/(nuova|nuovo-pasto|modifica)/.test(hash)) return location.replace('#/');
  for (const [re, view] of routes) {
    const m = hash.match(re);
    if (m) {
      const y = window.scrollY;
      if (!soft) {
        // Passando da una sezione all'altra del menu la pagina entra di lato
        // (da destra se vai verso Pasti, da sinistra se torni verso Ricette)
        const top = topTab(hash);
        const anim = lastTop && top && top !== lastTop
          ? (TAB_ORDER.indexOf(top) > TAB_ORDER.indexOf(lastTop) ? 'enter-right' : 'enter-left')
          : 'enter';
        lastTop = top;
        $view.classList.remove('enter', 'enter-right', 'enter-left');
        void $view.offsetWidth; // riavvia l'animazione
        $view.classList.add(anim);
        window.scrollTo(0, 0);
      }
      view(m);
      if (soft) window.scrollTo(0, y);
      onScroll();
      return;
    }
  }
  location.replace('#/');
}

/** Si possono modificare i dati? (sempre senza account; con account dipende dal ruolo) */
const canEdit = () => !cloud.enabled || cloud.canEdit();

const go = (hash, replace = false) => (replace ? location.replace(hash) : (location.hash = hash));

// ---------- Barra di navigazione ----------
function setNav({ title = '', back = null, right = '' }) {
  $navTitle.textContent = title;
  $navLeft.innerHTML = back
    ? `<a class="nav-btn back" href="${back.href}">${icon.back}<span>${esc(back.label)}</span></a>`
    : '';
  // In ogni schermata: i pulsanti della pagina, poi l'account (dove c'è anche il tema)
  $navRight.innerHTML = right +
    `<button class="nav-btn icon" id="user-btn" aria-label="Account">${icon.user}</button>`;
}

$navRight.addEventListener('click', (e) => {
  if (e.target.closest('#user-btn')) openAccount();
});

/** Icona utente: con l'account apre il pannello Account, altrimenti il backup */
function openAccount() {
  if (cloud.enabled && cloud.user) accountSheet({ onSwitched: afterBookChange, onBackup: settingsSheet });
  else settingsSheet();
}

function onScroll() {
  $navbar.classList.toggle('scrolled', window.scrollY > 36);
}
window.addEventListener('scroll', onScroll, { passive: true });

// ---------- Menu in basso ----------
$tabbar.innerHTML = `
  <span class="tab-pill" aria-hidden="true"></span>
  <a href="#/" data-tab="ricette">${icon.book}<span>Ricette</span></a>
  <a href="#/dispensa" data-tab="dispensa">${icon.basket}<span>Dispensa</span></a>
  <a href="#/pasti" data-tab="pasti">${icon.meal}<span>Pasti</span></a>`;

/** Evidenzia la sezione attiva (la "pillola" scivola sotto la voce); null nasconde il menu */
function setTab(active) {
  document.body.classList.toggle('no-tabbar', active === null);
  if (active !== null) $tabbar.style.setProperty('--i', Math.max(0, TAB_ORDER.indexOf(active)));
  $tabbar.querySelectorAll('[data-tab]').forEach((a) => a.classList.toggle('active', a.dataset.tab === active));
}

// ---------- Componenti ----------
/** Icona di ricetta o categoria: la foto se c'è, altrimenti l'emoji */
const avatar = (item, fallback = '🍽️') => {
  const src = getImage(item?.photo);
  return src ? `<img class="avatar-img" src="${esc(src)}" alt="">` : esc(item?.emoji || fallback);
};

const macroChips = (n) => `
  <span class="chips">
    <i class="chip p">P ${fmt(n.protein)}gr</i>
    <i class="chip c">C ${fmt(n.carbs)}gr</i>
    <i class="chip f">G ${fmt(n.fat)}gr</i>
  </span>`;

/** Badge rossi con gli ingredienti non conteggiati nei valori */
const missingBadges = (names) =>
  names.length
    ? `<div class="missing">${names.map((n) => `<span class="badge-miss">${icon.alert} ${esc(n)} · non conteggiato</span>`).join('')}</div>`
    : '';

/** Riga piccola con i macro: "P 0,5 g · C 2,5 g · G 2,5 g · 31 kcal" */
const macroLine = (m) =>
  `<span class="ml p">P ${fmt(m.protein)} gr</span> · <span class="ml c">C ${fmt(m.carbs)} gr</span> · <span class="ml f">G ${fmt(m.fat)} gr</span> · ${Math.round(m.kcal)} kcal`;

// Nelle liste: valori totali della ricetta
const recipeRow = (r) => {
  const t = recipeNutrition(r).total;
  const meta = [r.time && `${r.time} min`, r.servings > 1 && `${r.servings} porzioni`, `${Math.round(t.kcal)} kcal`]
    .filter(Boolean).join(' · ');
  return `
  <a class="row glass" href="#/ricetta/${r.id}">
    <span class="row-emoji">${avatar(r)}</span>
    <span class="row-body">
      <span class="row-title">${esc(r.name)}</span>
      <span class="row-meta">${meta}</span>
      ${macroChips(t)}
    </span>
    <span class="row-chev">${icon.chevron}</span>
  </a>`;
};

const countLabel = (n) => (n === 1 ? '1 ricetta' : `${n} ricette`);

// =============================================================
//  HOME — categorie + ricerca
// =============================================================
function renderHome() {
  setTab('ricette');
  setNav({
    title: 'Ricette',
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
    <a class="fab edit-only" href="#/nuova" aria-label="Nuova ricetta">${icon.plus}</a>`;

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
        <button class="cat add edit-only" id="add-cat">
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
  draw();
}

// =============================================================
//  CATEGORIA — elenco ricette
// =============================================================
function renderCategory(id) {
  const cat = store.getCategory(id);
  if (!cat) return go('#/', true);
  const recipes = store.recipesIn(id);
  setTab('ricette');

  setNav({
    title: cat.name,
    back: { href: '#/', label: 'Ricette' },
    right: canEdit() ? `<button class="nav-btn icon" id="cat-menu" aria-label="Opzioni categoria">${icon.more}</button>` : '',
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
             <a class="btn primary edit-only" href="#/nuova/${id}">Aggiungi la prima ricetta</a>
           </div>`}
    </section>
    <a class="fab edit-only" href="#/nuova/${id}" aria-label="Nuova ricetta">${icon.plus}</a>`;

  const $catMenu = document.getElementById('cat-menu');
  if ($catMenu) $catMenu.onclick = () =>
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
function iconPicker(container, { emoji = '🍽️', photo = null, picks = EMOJI_PICKS, fallback = '🍽️', placeholder = '' } = {}) {
  // fallback: emoji usata se il campo resta vuoto ('' = nessuna emoji, es. per gli alimenti)
  // placeholder: cosa mostrare nell'anteprima quando non c'è emoji (es. l'iniziale del nome)
  const st = { mode: getImage(photo) ? 'photo' : 'emoji', emoji, newData: null };

  const draw = () => {
    const src = st.newData || getImage(photo);
    const isPhoto = st.mode === 'photo';
    container.innerHTML = `
      <div class="icon-picker">
        <label class="ip-preview ${isPhoto ? 'is-photo' : ''}">
          ${isPhoto
            ? (src ? `<img src="${esc(src)}" alt="">` : `<span class="ip-cam">${icon.camera}</span>`)
            : `<span class="ip-emoji ${st.emoji ? '' : 'is-placeholder'}">${esc(st.emoji || placeholder)}</span>`}
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
            : `<input class="input ip-field" maxlength="4" value="${esc(st.emoji)}" placeholder="${fallback ? '' : 'Emoji'}" aria-label="Emoji">`}
        </div>
      </div>
      ${isPhoto ? '' : `
        <div class="emoji-picks">
          ${picks.map((e) => `<button type="button" class="emoji-pick" data-e="${e}">${e}</button>`).join('')}
        </div>`}`;

    container.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => { st.mode = b.dataset.mode; draw(); })
    );
    const field = container.querySelector('.ip-field');
    const preview = container.querySelector('.ip-emoji');
    const showEmoji = () => {
      preview.textContent = st.emoji || placeholder;
      preview.classList.toggle('is-placeholder', !st.emoji);
    };
    field?.addEventListener('input', () => {
      st.emoji = field.value.trim() || fallback;
      showEmoji();
    });
    container.querySelectorAll('.emoji-pick').forEach((b) =>
      b.addEventListener('click', () => {
        st.emoji = field.value = b.dataset.e;
        showEmoji();
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
    /** Aggiorna l'iniziale mostrata quando non c'è un'emoji (es. mentre scrivi il nome) */
    setPlaceholder(text) {
      placeholder = text;
      const preview = container.querySelector('.ip-emoji.is-placeholder');
      if (preview) preview.textContent = text;
    },
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
  let portions = r.servings || 1;

  setTab(null);
  setNav({
    title: r.name,
    back: { href: cat ? `#/categoria/${cat.id}` : '#/', label: cat?.name || 'Ricette' },
    right: canEdit() ? `<a class="nav-btn text" href="#/modifica/${r.id}">Modifica</a>` : '',
  });

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

      <div class="card glass" id="nutrition-card"></div>

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

      <button class="btn danger-ghost full edit-only" id="delete">${icon.trash} Elimina ricetta</button>
    </section>`;

  // Valori totali (in grande) + per porzione (in piccolo, solo se le porzioni sono più di una)
  const drawNutrition = (nut) => {
    const t = nut.total;
    const ps = nut.perServing;
    const kP = t.protein * 4, kC = t.carbs * 4, kF = t.fat * 9;
    const kTot = kP + kC + kF || 1;
    const pct = (k) => Math.round((k / kTot) * 100);
    document.getElementById('nutrition-card').innerHTML = `
      <div class="nutrition">
        <div class="ring" style="--p:${(kP / kTot) * 100}%; --c:${((kP + kC) / kTot) * 100}%">
          <div class="ring-inner"><strong>${Math.round(t.kcal)}</strong><span>kcal</span></div>
        </div>
        <div class="macros">
          <p class="card-label">${portions > 1 ? `Totale · ${portions} porzioni` : 'Totale ricetta'}</p>
          ${[['p', 'Proteine', t.protein, kP], ['c', 'Carboidrati', t.carbs, kC], ['f', 'Grassi', t.fat, kF]]
            .map(([k, label, g, kc]) => `
            <div class="macro ${k}">
              <span class="dot"></span>
              <span class="macro-name">${label}</span>
              <span class="macro-val">${fmt(g)} gr</span>
              <span class="macro-pct">${pct(kc)}%</span>
            </div>`).join('')}
        </div>
      </div>
      ${portions > 1 ? `
        <div class="per-serving">
          <span class="ps-label">Per porzione</span>
          <span class="ps-values"><strong>${Math.round(ps.kcal)} kcal</strong> · ${macroLine({ ...ps, kcal: 0 }).replace(/ · 0 kcal$/, '')}</span>
        </div>` : ''}
      ${nut.auto ? `<p class="nut-note">${icon.basket} Calcolati dagli alimenti della dispensa</p>` : ''}
      ${nut.legacy ? `<p class="nut-note">Valori inseriti a mano. Collega gli ingredienti alla dispensa per calcolarli in automatico.</p>` : ''}
      ${missingBadges(nut.missing)}`;
  };

  // Ingredienti: quantità e macro si ricalcolano con le porzioni
  const drawIngredients = (nut) => {
    const factor = portions / (r.servings || 1);
    document.getElementById('portions').innerHTML = `${icon.people} ${portions}`;
    const anyLinked = r.ingredients.some((i) => resolveFood(i));
    document.getElementById('ingredients').innerHTML = r.ingredients.length
      ? r.ingredients.map((i, idx) => {
          const q = i.qty ? fmt(i.qty * factor) : '';
          const m = nut.perIngredient[idx];
          // Icona dell'alimento (o la sua iniziale); spazio vuoto per gli ingredienti non in dispensa,
          // così i nomi restano allineati
          const f = resolveFood(i);
          const avatarHtml = !anyLinked ? '' : f
            ? `<span class="ing-avatar">${foodAvatar(f)}</span>`
            : '<span class="ing-avatar blank"></span>';
          return `
            <li class="${m ? '' : 'compact'}">
              <div class="ing-main">
                <span class="ing-name">${avatarHtml}${esc(i.name)}</span>
                <span class="ing-qty">${q} ${esc(i.unit || '')}</span>
              </div>
              ${m ? `<div class="ing-macros">${macroLine(m)}</div>` : ''}
            </li>`;
        }).join('')
      : '<li class="muted">Nessun ingrediente inserito</li>';
  };

  const draw = () => {
    const nut = recipeNutrition(r, portions);
    drawNutrition(nut);
    drawIngredients(nut);
  };
  document.getElementById('minus').onclick = () => { if (portions > 1) { portions--; draw(); } };
  document.getElementById('plus').onclick = () => { portions++; draw(); };
  draw();

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
// Unità di misura degli ingredienti (menu a tendina: su iPhone niente tastiera)
const UNITS = ['gr', 'ml', 'pz', 'pizzico', 'q.b.']; // pz = pezzi (es. 2 uova)

/** Menu delle unità. Mostra anche un valore "vecchio" (es. kg) se l'ingrediente lo usava già */
const unitOptions = (value, extra = []) => {
  const opts = [...UNITS, ...extra.filter((u) => !UNITS.includes(u))];
  if (!opts.includes(value)) opts.push(value);
  return opts.map((u) => `<option value="${esc(u)}" ${u === value ? 'selected' : ''}>${u ? esc(u) : '—'}</option>`).join('');
};

const basisLabel = (f) => (f.basis === 'pz' ? 'per 1 pezzo' : 'per 100 gr');

// Copia dei valori dell'alimento, salvata nella ricetta (serve se l'alimento viene eliminato)
const foodSnapshot = (f) => ({
  name: f.name, emoji: f.emoji || '', basis: f.basis, protein: f.protein, carbs: f.carbs, fat: f.fat, kcal: f.kcal ?? null,
});

// Emoji suggerite per gli alimenti
const FOOD_PICKS = ['🥕', '🍅', '🥦', '🥬', '🧅', '🧄', '🥔', '🎃', '🍎', '🍌', '🍋', '🥑', '🫘', '🥜', '🫒', '🌰',
  '🥚', '🧀', '🥛', '🧈', '🍗', '🥩', '🐟', '🍚'];

/** Icona di un alimento: foto, emoji, oppure l'iniziale del nome */
const foodAvatar = (f) => {
  const src = getImage(f?.photo);
  if (src) return `<img class="avatar-img" src="${esc(src)}" alt="">`;
  if (f?.emoji) return esc(f.emoji);
  return `<span class="food-letter">${esc((f?.name || '?').trim().charAt(0).toUpperCase())}</span>`;
};

const ingredientRow = (i = {}) => `
  <div class="ing-row" data-food-id="${esc(i.foodId || '')}" data-food-snap="${i.food ? esc(JSON.stringify(i.food)) : ''}">
    <div class="ing-fields">
      <input class="input qty" name="qty" inputmode="decimal" placeholder="100" value="${i.qty ?? ''}">
      <select class="input unit" name="unit" aria-label="Unità di misura">${unitOptions(i.name ? (i.unit === 'g' ? 'gr' : i.unit || '') : 'gr', i.food?.basis === 'pz' ? ['pz'] : [])}</select>
      <input class="input" name="ing" placeholder="Ingrediente" value="${esc(i.name || '')}" autocomplete="off">
      <button type="button" class="remove" aria-label="Rimuovi">${icon.x}</button>
    </div>
    <div class="suggest" hidden></div>
    <div class="ing-calc"></div>
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

  setTab(null);
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
          <h2 class="card-title">Ingredienti</h2>
          <p class="hint">Inizia a scrivere: gli alimenti della dispensa compaiono come suggerimenti e i loro valori si calcolano da soli.</p>
          <div id="ing-list">${r.ingredients.map(ingredientRow).join('')}</div>
          <button type="button" class="btn ghost small" id="add-ing">${icon.plus} Aggiungi ingrediente</button>
        </div>

        <div class="card glass">
          <h2 class="card-title">Valori nutrizionali</h2>
          <div id="nut-auto"></div>
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
  const $auto = document.getElementById('nut-auto');
  let submitting = false;
  const picker = iconPicker(document.getElementById('recipe-icon'), { emoji: r.emoji || '🍽️', photo: editing?.photo });

  // ----- Lettura degli ingredienti dal form -----
  const readRow = (row) => {
    const qtyRaw = row.querySelector('[name=qty]').value.trim();
    const live = store.getFood(row.dataset.foodId);
    let food;
    if (live) food = foodSnapshot(live);
    else if (row.dataset.foodSnap) { try { food = JSON.parse(row.dataset.foodSnap); } catch { /* ignora */ } }
    return {
      qty: qtyRaw ? num(qtyRaw) : null,
      unit: row.querySelector('[name=unit]').value.trim(),
      name: row.querySelector('[name=ing]').value.trim(),
      ...(food ? { foodId: row.dataset.foodId, food } : {}),
    };
  };
  const rows = () => [...$ing.querySelectorAll('.ing-row')];
  const servings = () => Math.max(1, Math.round(num(form.servings.value)) || 1);

  const link = (row, food, setUnit) => {
    row.dataset.foodId = food.id;
    row.dataset.foodSnap = '';
    row.dataset.declined = '';
    row.querySelector('[name=ing]').value = food.name;
    const unit = row.querySelector('[name=unit]');
    // alimento della dispensa "per 1 pezzo" → pz; "per 100 gr" → gr
    if (setUnit && food.basis === 'pz') unit.value = 'pz';
    else if (setUnit && (unit.value === 'pz' || !UNITS.includes(unit.value))) unit.value = 'gr';
  };
  const unlink = (row) => { row.dataset.foodId = ''; row.dataset.foodSnap = ''; };

  // ----- Calcolo in tempo reale -----
  const updateCalc = () => {
    // editing?.nutrition: valori inseriti a mano nelle ricette create prima della dispensa
    const draft = { servings: servings(), ingredients: rows().map(readRow), nutrition: editing?.nutrition };
    const nut = recipeNutrition(draft);

    rows().forEach((row, idx) => {
      const m = nut.perIngredient[idx];
      const ing = draft.ingredients[idx];
      const $calc = row.querySelector('.ing-calc');
      if (m) $calc.innerHTML = macroLine(m);
      else if (ing.food && ing.qty == null) $calc.innerHTML = `<span class="muted">Dalla dispensa · inserisci la quantità</span>`;
      else if (isNegligible(ing)) $calc.innerHTML = ing.name ? '<span class="muted">Quantità trascurabile, non conteggiata</span>' : '';
      else if (ing.food && ing.food.basis !== 'pz' && (ing.unit || '').toLowerCase() === 'pz')
        $calc.innerHTML = '<span class="warn">Per contarlo a pezzi, in Dispensa imposta questo alimento “per 1 pezzo” (oppure usa gr o ml)</span>';
      else if (ing.food) $calc.innerHTML = `<span class="warn">Unità non calcolabile: usa ${ing.food.basis === 'pz' ? 'pz' : 'gr o ml'}</span>`;
      else if (ing.name) {
        // Non in dispensa: si può aggiungere in qualsiasi momento, anche modificando la ricetta dopo
        $calc.innerHTML = `
          <span class="${row.dataset.declined ? 'warn' : 'muted'}">${row.dataset.declined ? 'Non conteggiato nei valori' : 'Non in dispensa'}</span>
          <button type="button" class="add-pantry" data-add-food>${icon.plus} Aggiungi alla dispensa</button>`;
      } else $calc.innerHTML = '';
    });

    const t = nut.total, ps = nut.perServing;
    $auto.innerHTML = `
      <div class="auto-total">
        <span class="at-label">Totale ricetta</span>
        <span class="at-kcal">${Math.round(t.kcal)} <small>kcal</small></span>
        <span class="at-macros">${macroLine({ ...t, kcal: 0 }).replace(/ · 0 kcal$/, '')}</span>
      </div>
      ${draft.servings > 1 ? `
        <div class="per-serving">
          <span class="ps-label">Per porzione</span>
          <span class="ps-values"><strong>${Math.round(ps.kcal)} kcal</strong> · ${macroLine({ ...ps, kcal: 0 }).replace(/ · 0 kcal$/, '')}</span>
        </div>` : ''}
      ${nut.legacy
        ? `<p class="hint">Valori inseriti a mano in precedenza. Collega gli ingredienti alla dispensa per calcolarli in automatico.</p>`
        : `<p class="hint">${icon.basket} Calcolati dagli ingredienti presenti nella dispensa.</p>`}
      ${missingBadges(nut.missing)}`;
    return nut;
  };

  // ----- Ingrediente non in dispensa: chiedi se aggiungerlo -----
  const askToAdd = async (row) => {
    const name = row.querySelector('[name=ing]').value.trim();
    if (!name || row.dataset.foodId || row.dataset.declined === name || submitting) return;
    if (isNegligible(readRow(row))) return; // sale q.b., un pizzico di pepe: non serve chiedere
    if (!document.body.contains(row)) return;
    const yes = await confirmSheet(
      `“${name}” non è nella dispensa. Vuoi aggiungerlo con i suoi valori nutrizionali?`,
      { title: 'Nuovo alimento', okText: 'Sì, aggiungilo', cancelText: 'No, inseriscilo senza valori' }
    );
    if (!document.body.contains(row)) return;
    const decline = () => { row.dataset.declined = name; updateCalc(); };
    if (!yes) return decline();
    openAddFood(row, decline);
  };

  // Pop-up dell'alimento con il nome già scritto; salvato quello si torna alla ricetta con l'ingrediente collegato
  const openAddFood = (row, onCancel) => {
    foodSheet(null, {
      name: row.querySelector('[name=ing]').value.trim(),
      onSaved: (food, { existing } = {}) => {
        link(row, food, true);
        updateCalc();
        toast(existing ? `${food.name} era già nella dispensa: collegato` : `${food.name} aggiunto alla dispensa`);
      },
      onCancel,
    });
  };

  // Pulsante "+ Aggiungi alla dispensa" sotto gli ingredienti non collegati
  $ing.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-food]');
    if (btn) openAddFood(btn.closest('.ing-row'));
  });

  // ----- Suggerimenti dalla dispensa -----
  const showSuggest = (row) => {
    const box = row.querySelector('.suggest');
    const q = row.querySelector('[name=ing]').value.trim().toLowerCase();
    const items = store.getPantry()
      .filter((f) => f.name.toLowerCase().includes(q) && f.id !== row.dataset.foodId)
      .slice(0, 6);
    box.hidden = !items.length;
    box.innerHTML = items.map((f) => `
      <button type="button" data-food="${f.id}">
        <span class="sg-name"><span class="ing-avatar">${foodAvatar(f)}</span>${esc(f.name)}</span><small>${basisLabel(f)} · ${Math.round(foodKcal(f))} kcal</small>
      </button>`).join('');
  };

  $ing.addEventListener('input', (e) => {
    const row = e.target.closest('.ing-row');
    if (!row) return;
    if (e.target.name === 'ing') {
      const match = store.findFoodByName(e.target.value);
      match ? link(row, match, false) : unlink(row);
      showSuggest(row);
    }
    updateCalc();
  });
  $ing.addEventListener('change', (e) => {
    if (e.target.name !== 'ing') return;
    const row = e.target.closest('.ing-row');
    // piccola attesa: se hai toccato un suggerimento o "Salva", non serve chiedere
    setTimeout(() => askToAdd(row), 250);
  });
  $ing.addEventListener('focusin', (e) => {
    if (e.target.name === 'ing') showSuggest(e.target.closest('.ing-row'));
  });
  $ing.addEventListener('focusout', (e) => {
    if (e.target.name === 'ing') {
      const box = e.target.closest('.ing-row').querySelector('.suggest');
      setTimeout(() => (box.hidden = true), 150);
    }
  });
  // pointerdown + preventDefault: il tocco sul suggerimento non chiude la tastiera prima del tempo
  $ing.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.suggest [data-food]');
    if (!btn) return;
    e.preventDefault();
    const row = btn.closest('.ing-row');
    link(row, store.getFood(btn.dataset.food), true);
    row.querySelector('.suggest').hidden = true;
    updateCalc();
    const qty = row.querySelector('[name=qty]');
    if (!qty.value) qty.focus();
  });

  form.servings.addEventListener('input', updateCalc);

  // All'apertura collego gli ingredienti che nel frattempo sono stati aggiunti alla dispensa
  rows().forEach((row) => {
    if (row.dataset.foodId) return;
    const match = store.findFoodByName(row.querySelector('[name=ing]').value);
    if (match) link(row, match, false);
  });
  updateCalc();

  // ----- Righe dinamiche -----
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
    btn.closest('.ing-row, .step-row').remove();
    renumber();
    updateCalc();
  });

  // ----- Salvataggio -----
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) {
      form.name.focus();
      return toast('Dai un nome alla ricetta');
    }
    submitting = true;
    const nut = updateCalc();
    const { emoji, photo } = await picker.commit();
    const round1 = (x) => Math.round(x * 10) / 10;
    const recipe = {
      id: editing?.id,
      name,
      emoji,
      photo,
      categoryId: form.category.value,
      time: Math.round(num(form.time.value)) || null,
      servings: servings(),
      ingredients: rows().map(readRow).filter((i) => i.name),
      steps: [...$steps.querySelectorAll('textarea')].map((t) => t.value.trim()).filter(Boolean),
      notes: form.notes.value.trim(),
      // Sempre per porzione (le ricette vecchie senza dispensa tengono i valori inseriti a mano)
      nutrition: nut.legacy
        ? editing.nutrition
        : Object.fromEntries(Object.entries(nut.perServing).map(([k, v]) => [k, round1(v)])),
    };
    const savedId = store.saveRecipe(recipe);
    toast(editing ? 'Modifiche salvate' : 'Ricetta salvata');
    go(`#/ricetta/${savedId}`, true);
  };
}

// =============================================================
//  DISPENSA — alimenti con i loro valori nutrizionali
// =============================================================
function renderPantry() {
  setTab('dispensa');
  setNav({ title: 'Dispensa' });

  $view.innerHTML = `
    <section class="page">
      <h1 class="large-title">Dispensa</h1>
      <p class="subtitle">Gli alimenti che usi spesso, con i valori per 100 gr o per pezzo.</p>
      <label class="search glass">
        ${icon.search}
        <input id="pq" type="search" placeholder="Cerca un alimento" autocomplete="off">
      </label>
      <div id="pantry-list" class="pantry-list"></div>
    </section>
    <button class="fab edit-only" id="add-food" aria-label="Nuovo alimento">${icon.plus}</button>`;

  const $list = document.getElementById('pantry-list');
  const $q = document.getElementById('pq');

  const draw = () => {
    const q = $q.value.trim().toLowerCase();
    const all = store.getPantry();
    const foods = all.filter((f) => f.name.toLowerCase().includes(q));
    if (!all.length) {
      $list.innerHTML = `
        <div class="empty-state glass">
          <span class="big-emoji">🧺</span>
          <p>La dispensa è vuota. Aggiungi gli alimenti che usi spesso: nelle ricette i loro valori si calcoleranno da soli.</p>
          <button class="btn primary edit-only" id="first-food">Aggiungi il primo alimento</button>
        </div>`;
      document.getElementById('first-food').onclick = () => foodSheet();
      return;
    }
    $list.innerHTML = foods.length
      ? `<div class="list">${foods.map((f) => `
          <button class="row glass food-row" data-id="${f.id}">
            <span class="row-emoji">${foodAvatar(f)}</span>
            <span class="row-body">
              <span class="row-title">${esc(f.name)}</span>
              <span class="row-meta">${basisLabel(f)} · ${Math.round(foodKcal(f))} kcal</span>
              ${macroChips(f)}
            </span>
            <span class="row-chev">${icon.chevron}</span>
          </button>`).join('')}</div>`
      : `<p class="empty">Nessun alimento trovato per “${esc(q)}”.</p>`;
  };

  $list.addEventListener('click', (e) => {
    const row = e.target.closest('.food-row');
    if (!row) return;
    if (!canEdit()) return toast('Puoi solo consultare questo ricettario');
    foodSheet(store.getFood(row.dataset.id));
  });
  $q.addEventListener('input', draw);
  document.getElementById('add-food').onclick = () => foodSheet();
  draw();
}

/**
 * Pop-up alimento. Dalla dispensa: food = alimento da modificare (o null).
 * Dall'editor ricetta: opts = { name, onSaved(food), onCancel() } — si resta sulla ricetta.
 */
function foodSheet(food = null, opts = {}) {
  let basis = food?.basis || 'g';
  let saved = false;
  openSheet(
    `<h3 class="sheet-title">${food ? 'Modifica alimento' : 'Nuovo alimento'}</h3>
     <form id="food-form" class="form">
       <div id="food-icon"></div>
       <input class="input" name="name" placeholder="Nome (es. Zucca)" value="${esc(food?.name || opts.name || '')}" required>
       <div class="field">
         <span>I valori si riferiscono a</span>
         <div class="segmented" id="basis">
           <button type="button" data-basis="g" class="${basis === 'g' ? 'on' : ''}">100 gr / 100 ml</button>
           <button type="button" data-basis="pz" class="${basis === 'pz' ? 'on' : ''}">1 pezzo</button>
         </div>
       </div>
       <div class="field-grid three">
         <label class="field macro-field p"><span>Proteine (gr)</span>
           <input class="input" name="protein" inputmode="decimal" placeholder="0" value="${food?.protein ?? ''}"></label>
         <label class="field macro-field c"><span>Carboidrati (gr)</span>
           <input class="input" name="carbs" inputmode="decimal" placeholder="0" value="${food?.carbs ?? ''}"></label>
         <label class="field macro-field f"><span>Grassi (gr)</span>
           <input class="input" name="fat" inputmode="decimal" placeholder="0" value="${food?.fat ?? ''}"></label>
       </div>
       <label class="field"><span>Calorie (kcal)</span>
         <input class="input" name="kcal" inputmode="decimal" placeholder="Calcolate in automatico" value="${food?.kcal ?? ''}"></label>
       <p class="hint" id="food-hint"></p>
       <button class="btn primary full" type="submit">${food ? 'Salva' : 'Aggiungi alla dispensa'}</button>
       ${food ? `<button type="button" class="btn danger-ghost full" id="del-food">${icon.trash} Elimina alimento</button>` : ''}
     </form>`,
    (sheet, close) => {
      const form = sheet.querySelector('#food-form');
      const $hint = sheet.querySelector('#food-hint');
      const macros = () => ({ protein: num(form.protein.value), carbs: num(form.carbs.value), fat: num(form.fat.value) });
      const updateHint = () => {
        const k = kcalFromMacros(macros());
        const per = basis === 'pz' ? 'per pezzo' : 'per 100 gr';
        $hint.innerHTML = k
          ? `Dai macro risultano circa <strong>${k} kcal</strong> ${per}.${form.kcal.value ? '' : ' Se lasci vuoto userò questo valore.'}`
          : `Per i liquidi conta 1 ml come 1 gr.`;
      };
      const initial = () => (form.name.value.trim().charAt(0) || '?').toUpperCase();
      const picker = iconPicker(sheet.querySelector('#food-icon'), {
        emoji: food?.emoji || '', photo: food?.photo, picks: FOOD_PICKS, fallback: '', placeholder: initial(),
      });
      form.name.addEventListener('input', () => picker.setPlaceholder(initial()));

      sheet.querySelectorAll('[data-basis]').forEach((b) =>
        b.addEventListener('click', () => {
          basis = b.dataset.basis;
          sheet.querySelectorAll('[data-basis]').forEach((x) => x.classList.toggle('on', x === b));
          updateHint();
        })
      );
      ['protein', 'carbs', 'fat', 'kcal'].forEach((f) => form[f].addEventListener('input', updateHint));
      updateHint();

      form.onsubmit = async (e) => {
        e.preventDefault();
        const name = form.name.value.trim();
        if (!name) return form.name.focus();
        const other = store.findFoodByName(name);
        if (other && other.id !== food?.id) {
          // Dalla ricetta: invece di dare errore collego l'alimento che c'è già
          if (opts.onSaved) {
            saved = true;
            close();
            return opts.onSaved(other, { existing: true });
          }
          return toast('C’è già un alimento con questo nome');
        }
        const { emoji, photo } = await picker.commit();
        const id = store.saveFood({
          id: food?.id, name, emoji, photo, basis, ...macros(),
          kcal: form.kcal.value.trim() ? num(form.kcal.value) : null,
        });
        saved = true;
        close();
        if (opts.onSaved) return opts.onSaved(store.getFood(id)); // torna alla ricetta, senza ricaricarla
        toast(food ? 'Alimento aggiornato' : 'Aggiunto alla dispensa');
        router();
      };

      sheet.querySelector('#del-food')?.addEventListener('click', async () => {
        const used = store.recipesUsingFood(food.id).length;
        const msg = used
          ? `“${food.name}” è usato in ${used === 1 ? '1 ricetta' : `${used} ricette`}: lì resteranno i valori di adesso. Eliminarlo dalla dispensa?`
          : `Eliminare “${food.name}” dalla dispensa?`;
        if (await confirmSheet(msg, { okText: 'Elimina', danger: true })) {
          await deleteImage(food.photo);
          store.deleteFood(food.id);
          toast('Alimento eliminato');
          router();
        }
      });
      if (opts.name) setTimeout(() => form.protein.focus(), 350);
    },
    () => { if (!saved) opts.onCancel?.(); }
  );
}

// =============================================================
//  PASTI — combinazioni che mangi spesso (es. "la mia colazione")
// =============================================================
const MOMENTS = [
  { id: 'colazione', label: 'Colazione', emoji: '☕' },
  { id: 'pranzo', label: 'Pranzo', emoji: '🍝' },
  { id: 'cena', label: 'Cena', emoji: '🍲' },
  { id: 'spuntino', label: 'Spuntino', emoji: '🍎' },
];
const momentLabel = (id) => MOMENTS.find((m) => m.id === id)?.label || 'Pasto';

const MEAL_PICKS = ['🥣', '☕', '🥐', '🍳', '🥞', '🥗', '🍝', '🍱', '🍲', '🥪', '🌯', '🍎', '🥜', '🍫', '🥛', '🍽️'];

const mealRow = (m) => {
  const t = mealNutrition(m).total;
  const n = m.items.length;
  return `
  <a class="row glass" href="#/pasto/${m.id}">
    <span class="row-emoji">${avatar(m)}</span>
    <span class="row-body">
      <span class="row-title">${esc(m.name)}</span>
      <span class="row-meta">${n === 1 ? '1 elemento' : `${n} elementi`} · ${Math.round(t.kcal)} kcal</span>
      ${macroChips(t)}
    </span>
    <span class="row-chev">${icon.chevron}</span>
  </a>`;
};

function renderMeals() {
  setTab('pasti');
  setNav({ title: 'Pasti' });
  const meals = store.getMeals();

  $view.innerHTML = `
    <section class="page">
      <h1 class="large-title">Pasti</h1>
      <p class="subtitle">Le combinazioni che mangi spesso, con i valori già calcolati.</p>
      ${meals.length
        ? MOMENTS.map((mo) => {
            const list = meals.filter((m) => (m.moment || 'colazione') === mo.id);
            return list.length ? `
              <h2 class="section-title">${mo.emoji} ${mo.label}</h2>
              <div class="list">${list.map(mealRow).join('')}</div>` : '';
          }).join('')
        : `<div class="empty-state glass">
             <span class="big-emoji">🍽️</span>
             <p>Salva qui i pasti che fai spesso, per esempio la tua colazione: alimenti della dispensa e porzioni delle tue ricette, con calorie e macro già sommati.</p>
             <a class="btn primary edit-only" href="#/nuovo-pasto">Crea il primo pasto</a>
           </div>`}
    </section>
    <a class="fab edit-only" href="#/nuovo-pasto" aria-label="Nuovo pasto">${icon.plus}</a>`;
}

function renderMeal(id) {
  const m = store.getMeal(id);
  if (!m) return go('#/pasti', true);
  setTab(null);
  setNav({
    title: m.name,
    back: { href: '#/pasti', label: 'Pasti' },
    right: canEdit() ? `<a class="nav-btn text" href="#/modifica-pasto/${m.id}">Modifica</a>` : '',
  });

  const nut = mealNutrition(m);
  const t = nut.total;
  const kP = t.protein * 4, kC = t.carbs * 4, kF = t.fat * 9;
  const kTot = kP + kC + kF || 1;
  const pct = (k) => Math.round((k / kTot) * 100);

  $view.innerHTML = `
    <section class="page recipe">
      <div class="hero">
        <span class="hero-emoji glass">${avatar(m)}</span>
        <h1 class="large-title center">${esc(m.name)}</h1>
        <div class="pills">
          <span class="pill glass">${MOMENTS.find((x) => x.id === m.moment)?.emoji || '🍽️'} ${momentLabel(m.moment)}</span>
        </div>
      </div>

      <div class="card glass">
        <div class="nutrition">
          <div class="ring" style="--p:${(kP / kTot) * 100}%; --c:${((kP + kC) / kTot) * 100}%">
            <div class="ring-inner"><strong>${Math.round(t.kcal)}</strong><span>kcal</span></div>
          </div>
          <div class="macros">
            <p class="card-label">Totale pasto</p>
            ${[['p', 'Proteine', t.protein, kP], ['c', 'Carboidrati', t.carbs, kC], ['f', 'Grassi', t.fat, kF]]
              .map(([k, label, g, kc]) => `
              <div class="macro ${k}">
                <span class="dot"></span><span class="macro-name">${label}</span>
                <span class="macro-val">${fmt(g)} gr</span><span class="macro-pct">${pct(kc)}%</span>
              </div>`).join('')}
          </div>
        </div>
        ${missingBadges(nut.missing)}
      </div>

      <div class="card glass">
        <h2 class="card-title">Cosa c'è</h2>
        <ul class="ingredients">
          ${m.items.length ? m.items.map((it, idx) => {
            const mm = nut.perItem[idx];
            const r = it.recipeId && store.getRecipe(it.recipeId);
            const f = !r && resolveFood(it);
            const av = r ? `<span class="ing-avatar">${avatar(r)}</span>`
              : f ? `<span class="ing-avatar">${foodAvatar(f)}</span>`
              : '<span class="ing-avatar blank"></span>';
            const q = it.qty ? fmt(it.qty) : '';
            const name = r ? `<a class="meal-recipe-link" href="#/ricetta/${r.id}">${esc(r.name)}</a>` : esc(it.name);
            return `
              <li class="${mm ? '' : 'compact'}">
                <div class="ing-main">
                  <span class="ing-name">${av}${name}</span>
                  <span class="ing-qty">${q} ${esc(it.unit || '')}</span>
                </div>
                ${mm ? `<div class="ing-macros">${macroLine(mm)}</div>` : ''}
              </li>`;
          }).join('') : '<li class="muted">Nessun elemento</li>'}
        </ul>
      </div>

      ${m.notes ? `<div class="card glass"><h2 class="card-title">Note</h2><p class="notes">${esc(m.notes)}</p></div>` : ''}

      <button class="btn danger-ghost full edit-only" id="delete-meal">${icon.trash} Elimina pasto</button>
    </section>`;

  document.getElementById('delete-meal').onclick = async () => {
    if (await confirmSheet(`Eliminare il pasto “${m.name}”?`, { okText: 'Elimina', danger: true })) {
      await deleteImage(m.photo);
      store.deleteMeal(m.id);
      toast('Pasto eliminato');
      go('#/pasti', true);
    }
  };
}

// ---------- Editor del pasto ----------
const mealItemRow = (it = {}) => `
  <div class="ing-row" data-food-id="${esc(it.foodId || '')}" data-recipe-id="${esc(it.recipeId || '')}"
       data-food-snap="${it.food ? esc(JSON.stringify(it.food)) : ''}">
    <div class="ing-fields">
      <input class="input qty" name="qty" inputmode="decimal" placeholder="1" value="${it.qty ?? ''}">
      <select class="input unit" name="unit" aria-label="Unità di misura">${unitOptions(it.name ? (it.unit || '') : 'gr', it.recipeId ? ['porz.'] : [])}</select>
      <input class="input" name="ing" placeholder="Alimento o ricetta" value="${esc(it.name || '')}" autocomplete="off">
      <button type="button" class="remove" aria-label="Rimuovi">${icon.x}</button>
    </div>
    <div class="suggest" hidden></div>
    <div class="ing-calc"></div>
  </div>`;

function renderMealEditor(id, presetMoment) {
  const editing = id ? store.getMeal(id) : null;
  if (id && !editing) return go('#/pasti', true);
  const m = editing || { name: '', emoji: '🥣', moment: presetMoment || 'colazione', items: [{}, {}], notes: '' };
  let moment = m.moment || 'colazione';
  let submitting = false;

  setTab(null);
  setNav({
    title: editing ? 'Modifica pasto' : 'Nuovo pasto',
    back: { href: editing ? `#/pasto/${editing.id}` : '#/pasti', label: 'Annulla' },
    right: `<button class="nav-btn text strong" form="meal-form" type="submit">Salva</button>`,
  });

  $view.innerHTML = `
    <section class="page">
      <h1 class="large-title">${editing ? 'Modifica pasto' : 'Nuovo pasto'}</h1>
      <form id="meal-form" class="form" novalidate>
        <div class="card glass">
          <div id="meal-icon"></div>
          <input class="input" name="name" placeholder="Nome del pasto (es. La mia colazione)" value="${esc(m.name)}" required>
          <div class="field">
            <span>Momento della giornata</span>
            <div class="segmented moments">
              ${MOMENTS.map((mo) => `<button type="button" data-moment="${mo.id}" class="${mo.id === moment ? 'on' : ''}">${mo.label}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="card glass">
          <h2 class="card-title">Cosa mangi</h2>
          <p class="hint">Scrivi un alimento della dispensa (con la quantità) oppure una delle tue ricette (in porzioni).</p>
          <div id="item-list">${m.items.map(mealItemRow).join('')}</div>
          <button type="button" class="btn ghost small" id="add-item">${icon.plus} Aggiungi</button>
        </div>

        <div class="card glass">
          <h2 class="card-title">Valori nutrizionali</h2>
          <div id="meal-total"></div>
        </div>

        <div class="card glass">
          <h2 class="card-title">Note</h2>
          <textarea class="input" name="notes" rows="2" placeholder="Es. con caffè amaro">${esc(m.notes || '')}</textarea>
        </div>

        <button class="btn primary full" type="submit">${editing ? 'Salva modifiche' : 'Salva pasto'}</button>
      </form>
    </section>`;

  const form = document.getElementById('meal-form');
  const $list = document.getElementById('item-list');
  const $total = document.getElementById('meal-total');
  const picker = iconPicker(document.getElementById('meal-icon'), { emoji: m.emoji || '🥣', photo: editing?.photo, picks: MEAL_PICKS });

  form.querySelectorAll('[data-moment]').forEach((b) =>
    b.addEventListener('click', () => {
      moment = b.dataset.moment;
      form.querySelectorAll('[data-moment]').forEach((x) => x.classList.toggle('on', x === b));
    })
  );

  const rows = () => [...$list.querySelectorAll('.ing-row')];
  const readRow = (row) => {
    const qtyRaw = row.querySelector('[name=qty]').value.trim();
    const base = {
      qty: qtyRaw ? num(qtyRaw) : null,
      unit: row.querySelector('[name=unit]').value.trim(),
      name: row.querySelector('[name=ing]').value.trim(),
    };
    const recipe = store.getRecipe(row.dataset.recipeId);
    if (recipe) return { ...base, recipeId: recipe.id };
    const live = store.getFood(row.dataset.foodId);
    let food;
    if (live) food = foodSnapshot(live);
    else if (row.dataset.foodSnap) { try { food = JSON.parse(row.dataset.foodSnap); } catch { /* ignora */ } }
    return { ...base, ...(food ? { foodId: row.dataset.foodId, food } : {}) };
  };

  const setUnitOptions = (row, isRecipe) => {
    const sel = row.querySelector('[name=unit]');
    const value = isRecipe ? 'porz.' : (sel.value === 'porz.' ? 'gr' : sel.value);
    sel.innerHTML = unitOptions(value, isRecipe ? ['porz.'] : []);
  };
  const linkFood = (row, food, setUnit) => {
    row.dataset.foodId = food.id; row.dataset.recipeId = ''; row.dataset.foodSnap = '';
    row.querySelector('[name=ing]').value = food.name;
    setUnitOptions(row, false);
    if (setUnit) row.querySelector('[name=unit]').value = food.basis === 'pz' ? 'pz' : 'gr';
  };
  const linkRecipe = (row, recipe) => {
    row.dataset.recipeId = recipe.id; row.dataset.foodId = ''; row.dataset.foodSnap = '';
    row.querySelector('[name=ing]').value = recipe.name;
    setUnitOptions(row, true);
    const qty = row.querySelector('[name=qty]');
    if (!qty.value) qty.value = '1';
  };
  const unlink = (row) => {
    const wasRecipe = !!row.dataset.recipeId;
    row.dataset.foodId = ''; row.dataset.recipeId = ''; row.dataset.foodSnap = '';
    if (wasRecipe) setUnitOptions(row, false);
  };
  const findRecipeByName = (name) => {
    const n = name.trim().toLowerCase();
    return n ? store.getRecipes().find((r) => r.name.trim().toLowerCase() === n) : null;
  };

  const updateCalc = () => {
    const items = rows().map(readRow);
    const nut = mealNutrition({ items });
    rows().forEach((row, idx) => {
      const mm = nut.perItem[idx];
      const it = items[idx];
      const $calc = row.querySelector('.ing-calc');
      if (mm) $calc.innerHTML = `${it.recipeId ? '<span class="tag-recipe">Ricetta</span> ' : ''}${macroLine(mm)}`;
      else if (isNegligible(it)) $calc.innerHTML = it.name ? '<span class="muted">Quantità trascurabile, non conteggiata</span>' : '';
      else if (it.food && it.qty == null) $calc.innerHTML = '<span class="muted">Dalla dispensa · inserisci la quantità</span>';
      else if (it.food) $calc.innerHTML = `<span class="warn">Unità non calcolabile: usa ${it.food.basis === 'pz' ? 'pz' : 'gr o ml'}</span>`;
      else if (it.name) $calc.innerHTML = `<span class="muted">Non in dispensa</span>
          <button type="button" class="add-pantry" data-add-food>${icon.plus} Aggiungi alla dispensa</button>`;
      else $calc.innerHTML = '';
    });
    const t = nut.total;
    $total.innerHTML = `
      <div class="auto-total">
        <span class="at-label">Totale pasto</span>
        <span class="at-kcal">${Math.round(t.kcal)} <small>kcal</small></span>
        <span class="at-macros">${macroLine({ ...t, kcal: 0 }).replace(/ · 0 kcal$/, '')}</span>
      </div>
      ${missingBadges(nut.missing)}`;
    return nut;
  };

  // Suggerimenti: alimenti della dispensa e ricette
  const showSuggest = (row) => {
    const box = row.querySelector('.suggest');
    const q = row.querySelector('[name=ing]').value.trim().toLowerCase();
    const foods = store.getPantry().filter((f) => f.name.toLowerCase().includes(q) && f.id !== row.dataset.foodId).slice(0, 5);
    const recs = store.getRecipes().filter((r) => r.name.toLowerCase().includes(q) && r.id !== row.dataset.recipeId).slice(0, 3);
    box.hidden = !foods.length && !recs.length;
    box.innerHTML =
      foods.map((f) => `
        <button type="button" data-food="${f.id}">
          <span class="sg-name"><span class="ing-avatar">${foodAvatar(f)}</span>${esc(f.name)}</span><small>${basisLabel(f)} · ${Math.round(foodKcal(f))} kcal</small>
        </button>`).join('') +
      recs.map((r) => `
        <button type="button" data-recipe="${r.id}">
          <span class="sg-name"><span class="ing-avatar">${avatar(r)}</span>${esc(r.name)}</span><small>ricetta · ${Math.round(recipeNutrition(r).perServing.kcal)} kcal a porz.</small>
        </button>`).join('');
  };

  $list.addEventListener('input', (e) => {
    const row = e.target.closest('.ing-row');
    if (!row) return;
    if (e.target.name === 'ing') {
      const food = store.findFoodByName(e.target.value);
      const recipe = !food && findRecipeByName(e.target.value);
      if (food) linkFood(row, food, false);
      else if (recipe) linkRecipe(row, recipe);
      else unlink(row);
      showSuggest(row);
    }
    updateCalc();
  });
  $list.addEventListener('change', (e) => { if (e.target.name === 'unit') updateCalc(); });
  $list.addEventListener('focusin', (e) => { if (e.target.name === 'ing') showSuggest(e.target.closest('.ing-row')); });
  $list.addEventListener('focusout', (e) => {
    if (e.target.name === 'ing') {
      const box = e.target.closest('.ing-row').querySelector('.suggest');
      setTimeout(() => (box.hidden = true), 150);
    }
  });
  $list.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.suggest [data-food], .suggest [data-recipe]');
    if (!btn) return;
    e.preventDefault();
    const row = btn.closest('.ing-row');
    if (btn.dataset.food) linkFood(row, store.getFood(btn.dataset.food), true);
    else linkRecipe(row, store.getRecipe(btn.dataset.recipe));
    row.querySelector('.suggest').hidden = true;
    updateCalc();
    const qty = row.querySelector('[name=qty]');
    if (!qty.value) qty.focus();
  });
  $list.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-food]');
    if (add) {
      const row = add.closest('.ing-row');
      foodSheet(null, {
        name: row.querySelector('[name=ing]').value.trim(),
        onSaved: (food, { existing } = {}) => {
          linkFood(row, food, true);
          updateCalc();
          toast(existing ? `${food.name} era già nella dispensa: collegato` : `${food.name} aggiunto alla dispensa`);
        },
      });
    }
    const rm = e.target.closest('.remove');
    if (rm) { rm.closest('.ing-row').remove(); updateCalc(); }
  });

  // All'apertura collego gli elementi aggiunti in dispensa nel frattempo
  rows().forEach((row) => {
    if (row.dataset.foodId || row.dataset.recipeId) return;
    const food = store.findFoodByName(row.querySelector('[name=ing]').value);
    if (food) linkFood(row, food, false);
  });
  updateCalc();

  document.getElementById('add-item').onclick = () => {
    $list.insertAdjacentHTML('beforeend', mealItemRow());
    $list.lastElementChild.querySelector('[name=qty]').focus();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const name = form.name.value.trim();
    if (!name) { form.name.focus(); return toast('Dai un nome al pasto'); }
    submitting = true;
    const { emoji, photo } = await picker.commit();
    const savedId = store.saveMeal({
      id: editing?.id, name, emoji, photo, moment,
      items: rows().map(readRow).filter((it) => it.name),
      notes: form.notes.value.trim(),
    });
    toast(editing ? 'Modifiche salvate' : 'Pasto salvato');
    go(`#/pasto/${savedId}`, true);
  };
}

// =============================================================
//  IMPOSTAZIONI — backup dei dati
// =============================================================
function settingsSheet() {
  openSheet(
    `<h3 class="sheet-title">${cloud.enabled ? 'Backup' : 'Impostazioni'}</h3>
     ${cloud.enabled ? '' : themeRow()}
     <p class="sheet-msg">Le ricette sono salvate su questo dispositivo. Fai ogni tanto un backup per non perderle.</p>
     <div class="action-list">
       <button class="action" id="export">Esporta backup (.json)</button>
       <label class="action">Importa backup<input type="file" id="import" accept="application/json,.json" hidden></label>
     </div>
     <button class="btn ghost full" data-close>Chiudi</button>`,
    (sheet, close) => {
      bindThemeRow(sheet);
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

// ---------- Account e sincronizzazione ----------
/** Dopo aver aperto/cambiato ricettario: permessi e schermata aggiornati */
function afterBookChange() {
  document.body.classList.toggle('read-only', !canEdit());
  if (!canEdit() && /^#\/(nuova|nuovo-pasto|modifica)/.test(location.hash)) location.replace('#/');
  router();
}

/** Modifiche arrivate da un altro dispositivo/persona: ridisegno, ma non mentre stai scrivendo */
function onRemoteChange() {
  const editing = /^#\/(nuova|nuovo-pasto|modifica)/.test(location.hash) || document.querySelector('#modal-root .sheet');
  if (!editing) router({ soft: true });
}

/** Primo accesso con ricettario vuoto: porto le ricette di questo dispositivo, oppure parto con le categorie base */
async function setupEmptyBook() {
  if (!cloud.isOwner() || !cloud.isEmpty() || localStorage.getItem(`ricettario:setup:${cloud.book.id}`)) return;
  const local = store.readLocalData();
  const hasLocal = local && (local.recipes.length || local.pantry.length);
  let imported = false;
  if (hasLocal) {
    const yes = await confirmSheet(
      `Su questo dispositivo ci sono ${local.recipes.length === 1 ? '1 ricetta' : `${local.recipes.length} ricette`} e ${local.pantry.length === 1 ? '1 alimento' : `${local.pantry.length} alimenti`} in dispensa. Vuoi salvarli nel tuo account?`,
      { title: 'Le tue ricette', okText: 'Sì, salvali nell’account', cancelText: 'No, parto da zero' }
    );
    if (yes) {
      store.replaceData(local);
      await cloud.uploadAll();
      imported = true;
      toast('Ricette salvate nel tuo account');
    }
  }
  if (!imported) {
    store.replaceData({ categories: store.defaultCategories() });
    await cloud.uploadAll();
  }
  localStorage.setItem(`ricettario:setup:${cloud.book.id}`, '1');
  router();
}

/** Avvio con account: accesso (se serve), scelta del ricettario, download dei dati */
async function startCloud() {
  await cloud.init();
  let recovering = false;
  cloud.onAuthChange((event) => {
    // aperto il link "password dimenticata": si sceglie la nuova password
    if (event === 'PASSWORD_RECOVERY' && !recovering) {
      recovering = true;
      authScreen({ mode: 'newpass' }).then(() => { recovering = false; });
    }
  });
  cloud.on('remote', onRemoteChange);
  cloud.on('error', (e) => toast(errorText(e)));
  if (!cloud.user) {
    hideSplash();
    await authScreen();
  }
  for (;;) {
    try {
      const { joined } = await cloud.loadBooks();
      await cloud.openBook(cloud.pickBook(joined));
      if (joined) toast(`Ti hanno condiviso il ricettario “${cloud.book.name}”`);
      return;
    } catch (e) {
      hideSplash();
      await confirmSheet(errorText(e), { title: 'Impossibile caricare le ricette', okText: 'Riprova', cancelText: 'Riprova' });
    }
  }
}

function hideSplash() {
  document.body.classList.remove('loading');
  const $splash = document.getElementById('splash');
  if (!$splash) return;
  $splash.classList.add('hide');
  setTimeout(() => $splash.remove(), 400);
}

// ---------- Avvio ----------
await initImages(); // carica le foto prima di disegnare
if (cloud.enabled) {
  try {
    await startCloud();
  } catch (e) {
    console.error(e);
    toast('Impossibile collegarsi al server: uso i dati di questo dispositivo');
  }
}
document.body.classList.toggle('read-only', !canEdit());
window.addEventListener('hashchange', router);
if (/access_token|error_description|type=recovery/.test(location.hash)) location.replace(location.pathname + '#/');
router();
hideSplash();
if (cloud.enabled && cloud.book) setupEmptyBook();


// Service worker: rende l'app installabile e utilizzabile offline.
// Non lo attiviamo in locale per non avere problemi di cache mentre sviluppi.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('./sw.js');
}
