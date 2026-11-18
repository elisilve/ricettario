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

- **HTML, CSS, JavaScript** (moduli ES, nessun framework e nessuna build)
- **PWA**: Web App Manifest + Service Worker
- **localStorage** per i dati e **IndexedDB** per le foto (copia locale, funziona offline)
- **Supabase**: autenticazione, PostgreSQL con Row Level Security, Storage per le foto, Realtime
- Router basato sull'hash (`#/ricetta/...`), compatibile con GitHub Pages

## Struttura

```
index.html             pagina unica dell'app
css/style.css          stile (variabili, glass, tema scuro)
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

## Roadmap

- [x] v1 — Ricette per categorie con valori nutrizionali
- [ ] Foto delle ricette
- [ ] Prodotti pronti e pasti salvati (es. "colazione tipo")
- [ ] Piano alimentare settimanale
- [ ] Lista della spesa generata dal piano, con spunte
- [ ] Diario giornaliero con obiettivi di macronutrienti
- [x] Account, sincronizzazione fra dispositivi e condivisione
