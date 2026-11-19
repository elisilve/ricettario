# 🍲 Ricettario

Web app per iPhone dove raccolgo le mie ricette, divise per categorie e con i valori nutrizionali (proteine, carboidrati, grassi, calorie).
Si installa sulla schermata Home come un'app vera e funziona anche offline.

**👉 Demo:** `https://TUO-USERNAME.github.io/ricettario/`

## Funzionalità (v1)

- Categorie personalizzabili (nome + emoji)
- Ricette con ingredienti, passaggi, tempo, porzioni e note
- Valori nutrizionali per porzione, con calorie calcolate automaticamente dai macro
- Grafico ad anello con la ripartizione delle calorie fra i macronutrienti
- Ricalcolo delle quantità degli ingredienti in base alle porzioni
- **Dispensa**: alimenti con i valori per 100 g (o per pezzo); negli ingredienti delle ricette
  i macronutrienti si calcolano da soli in base alla quantità, con totale ricetta e per porzione
- **Pasti**: combinazioni che mangi spesso (alimenti della dispensa + porzioni di ricette),
  raggruppate per momento della giornata, con calorie e macro già sommati
- **Diario**: calendario della settimana (pallino pieno nei giorni con qualcosa segnato), anello con
  calorie e macro della giornata, cinque momenti (colazione, spuntini, pranzo, cena) in cui aggiungere
  alimenti della dispensa, ricette o pasti salvati — anche con un tocco. Il diario è personale:
  non viene condiviso con chi usa il tuo ricettario
- Foto o emoji per ricette e categorie
- Modalità chiara / scura
- **Account e condivisione** (Supabase): accesso da qualsiasi dispositivo, ricettari condivisi
  con altre persone con permessi "solo lettura" o "può modificare", aggiornamenti in tempo reale,
  modifiche offline sincronizzate al ritorno della connessione
- Ricerca per nome o ingrediente
- Tema chiaro/scuro automatico, stile "glass" ispirato a iOS
- Installabile come PWA, funziona offline
- Backup ed importazione dei dati in JSON

## Tecnologie

- **HTML, SCSS, JavaScript** (moduli ES, nessun framework; lo SCSS si compila in VS Code)
- **PWA**: Web App Manifest + Service Worker
- **localStorage** per i dati e **IndexedDB** per le foto (copia locale, funziona offline)
- **Supabase**: autenticazione, PostgreSQL con Row Level Security, Storage per le foto, Realtime
- Router basato sull'hash (`#/ricetta/...`), compatibile con GitHub Pages

## Struttura

```
index.html             pagina unica dell'app
css/style.scss         elenco dei fogli di stile, nell'ordine in cui vengono uniti
scss/                  stile, diviso per argomento (si modifica qui)
  abstracts/           variabili Sass (misure, animazioni) e mixin
  base/                colori e tema scuro, reset, sfondo, animazioni, utilità
  layout/              barra in alto, pagina, menu in basso e pulsante +
  components/          pulsanti, card, campi, liste, pop-up, valori nutrizionali…
  pages/               stili di una sola schermata (ricetta, editor, dispensa, pasti, account…)
css/style.css          CSS generato da css/style.scss (non modificarlo a mano)
js/swipe.js            scorri a sinistra per eliminare
js/diary.js            diario alimentare: dati, date, sincronizzazione personale
js/app.js              router e schermate
js/store.js            dati e salvataggio
js/ui.js               icone, modali, utility
js/nutrition.js        calcolo dei valori nutrizionali dalla dispensa
js/images.js           foto (ridimensionamento + IndexedDB)
js/cloud.js            Supabase: account, ricettari, coda di sincronizzazione, tempo reale
js/account.js          schermata di accesso e pannello Account (inviti e permessi)
js/config.js           URL e chiave pubblica del progetto Supabase
supabase/schema.sql    tabelle, regole di accesso (RLS) e storage
sw.js                  service worker (offline)
manifest.webmanifest   info per l'installazione
icons/                 icone dell'app
```

## Avviarla in locale

Apri la cartella in VS Code e avviala con l'estensione **Live Server** (tasto destro su `index.html` → *Open with Live Server*).

## Modificare lo stile

Lo stile si scrive in **SCSS** nella cartella `scss/`. Il file `css/style.scss` li elenca tutti
e viene trasformato in `css/style.css`, che è il file letto dal browser.

1. In VS Code installa l'estensione consigliata **Live Sass Compiler** (Glenn Marks).
2. Premi **Watch Sass** nella barra blu in basso.
3. Modifica un file in `scss/` e salva: `css/style.css` si aggiorna da solo.
4. Fai Commit + Push di entrambi (i file `.scss` e `css/style.css`).

Per aggiungere un nuovo foglio: crea il file (es. `scss/pages/_diario.scss`, col trattino basso)
e aggiungi la riga `@use '../scss/pages/diario';` in `css/style.scss`.

Dove cercare:

| Voglio cambiare… | File |
|---|---|
| un colore (anche del tema scuro) | `scss/base/_theme.scss` |
| misure del menu in basso, del pulsante +, della pagina | `scss/abstracts/_variables.scss` |
| i pulsanti | `scss/components/_buttons.scss` |
| le card delle liste (ricette, alimenti, pasti) | `scss/components/_lists.scss` |
| i pop-up dal basso | `scss/components/_sheet.scss` |
| la pagina di una ricetta | `scss/pages/_recipe.scss` |

## Roadmap

- [x] v1 — Ricette per categorie con valori nutrizionali
- [ ] Foto delle ricette
- [x] Pasti salvati (es. "colazione tipo")
- [ ] Piano alimentare settimanale
- [ ] Lista della spesa generata dal piano, con spunte
- [x] Diario giornaliero
- [ ] Obiettivi di calorie e macronutrienti nel diario
- [x] Account, sincronizzazione fra dispositivi e condivisione
