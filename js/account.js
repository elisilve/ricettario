// =============================================================
//  account.js — schermata di accesso e pannello "Account"
// =============================================================
import * as cloud from './cloud.js';
import { PUBLIC_URL } from './config.js';
import { esc, icon, toast, openSheet, confirmSheet, themeRow, bindThemeRow } from './ui.js';

const ROLE_LABEL = { owner: 'Titolare', editor: 'Può modificare', viewer: 'Solo lettura' };
const BOOK_ROLE = { owner: 'Tuo', editor: 'Condiviso · può modificare', viewer: 'Condiviso · solo lettura' };

/** Messaggi d'errore di Supabase in italiano */
export function errorText(e) {
  const m = String(e?.message || e || '');
  if (cloud.isNetworkError(e)) return 'Nessuna connessione. Riprova quando sei online.';
  if (/invalid login credentials/i.test(m)) return 'Email o password non corretti.';
  if (/email not confirmed/i.test(m)) return 'Devi prima confermare l’email: apri il link che ti abbiamo mandato.';
  if (/already registered|already exists/i.test(m)) return 'Esiste già un account con questa email: prova ad accedere.';
  if (/password should be|at least 6/i.test(m)) return 'La password deve avere almeno 6 caratteri.';
  if (/email rate limit/i.test(m)) return 'Supabase ha raggiunto il limite di email che può mandare (2 all’ora con il servizio gratuito). Riprova più tardi, oppure fatti creare l’account dalla dashboard di Supabase.';
  if (/security purposes|after \d+ seconds/i.test(m)) return 'Aspetta un minuto prima di riprovare.';
  if (/rate limit|too many/i.test(m)) return 'Troppi tentativi in poco tempo: riprova tra qualche minuto.';
  if (/valid email|invalid email|unable to validate email/i.test(m)) return 'Controlla l’indirizzo email.';
  if (/same password|different from the old/i.test(m)) return 'La nuova password deve essere diversa da quella vecchia.';
  if (/row-level security|permission|not allowed/i.test(m)) return 'Non hai i permessi per questa operazione.';
  return m || 'Qualcosa è andato storto. Riprova.';
}

// =============================================================
//  Schermata di accesso / registrazione
// =============================================================
/**
 * Mostra la schermata e si risolve quando l'utente ha fatto l'accesso.
 * mode: 'login' | 'signup' | 'reset' | 'newpass' (dopo il link "password dimenticata")
 */
export function authScreen({ mode = 'login', message = '' } = {}) {
  return new Promise((resolve) => {
    document.getElementById('auth')?.remove();
    const el = document.createElement('div');
    el.id = 'auth';
    el.className = 'auth';
    document.body.appendChild(el);
    document.body.classList.add('auth-open');
    let email = '';

    const TEXT = {
      login: { sub: 'Accedi per ritrovare le tue ricette su qualsiasi dispositivo.', btn: 'Accedi' },
      signup: { sub: 'Crea il tuo account: le ricette verranno salvate online.', btn: 'Crea account' },
      reset: { sub: 'Inserisci la tua email: ti mandiamo un link per scegliere una nuova password.', btn: 'Invia il link' },
      newpass: { sub: 'Scegli la nuova password per il tuo account.', btn: 'Salva la password' },
    };

    const draw = (msg = '', isError = false) => {
      const t = TEXT[mode];
      el.innerHTML = `
        <div class="auth-card">
          <img class="auth-logo" src="icons/apple-touch-icon.png" alt="">
          <h1 class="auth-title">Ricettario</h1>
          <p class="auth-sub">${t.sub}</p>
          ${mode === 'login' || mode === 'signup' ? `
            <div class="segmented auth-tabs">
              <button type="button" data-mode="login" class="${mode === 'login' ? 'on' : ''}">Accedi</button>
              <button type="button" data-mode="signup" class="${mode === 'signup' ? 'on' : ''}">Crea account</button>
            </div>` : ''}
          <form class="form" id="auth-form" novalidate>
            ${mode !== 'newpass' ? `
              <input class="input" type="email" name="email" placeholder="Email" autocomplete="email"
                     autocapitalize="off" value="${esc(email)}" required>` : ''}
            ${mode !== 'reset' ? `
              <input class="input" type="password" name="password" placeholder="${mode === 'login' ? 'Password' : 'Password (almeno 6 caratteri)'}"
                     autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>` : ''}
            ${mode === 'signup' || mode === 'newpass' ? `
              <input class="input" type="password" name="confirm" placeholder="Ripeti la password" autocomplete="new-password" required>` : ''}
            <p class="auth-msg ${isError ? 'error' : ''}" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
            <button class="btn primary full" type="submit">${t.btn}</button>
          </form>
          ${mode === 'login' ? '<button type="button" class="link-btn" data-mode="reset">Password dimenticata?</button>' : ''}
          ${mode === 'reset' ? '<button type="button" class="link-btn" data-mode="login">Torna all’accesso</button>' : ''}
        </div>`;

      el.querySelectorAll('[data-mode]').forEach((b) =>
        b.addEventListener('click', () => {
          email = el.querySelector('[name=email]')?.value || email;
          mode = b.dataset.mode;
          draw();
        })
      );

      const form = el.querySelector('#auth-form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        email = form.email?.value.trim() || email;
        const password = form.password?.value || '';
        if (form.email && !email) return draw('Inserisci la tua email.', true);
        if (form.password && password.length < 6) return draw('La password deve avere almeno 6 caratteri.', true);
        if (form.confirm && form.confirm.value !== password) return draw('Le due password non coincidono.', true);
        btn.disabled = true;
        btn.textContent = 'Un attimo…';
        try {
          if (mode === 'login') {
            await cloud.signIn(email, password);
            return done();
          }
          if (mode === 'signup') {
            const { needsConfirm } = await cloud.signUp(email, password);
            if (!needsConfirm) return done();
            mode = 'login';
            return draw('Ti abbiamo mandato un’email: apri il link per confermare l’account, poi torna qui e accedi.');
          }
          if (mode === 'reset') {
            await cloud.resetPassword(email);
            mode = 'login';
            return draw('Se esiste un account con questa email riceverai un link per scegliere una nuova password.');
          }
          if (mode === 'newpass') {
            await cloud.updatePassword(password);
            toast('Password aggiornata');
            return done();
          }
        } catch (err) {
          draw(errorText(err), true);
        }
      };
    };

    const done = () => {
      el.classList.add('hide');
      document.body.classList.remove('auth-open');
      setTimeout(() => el.remove(), 300);
      resolve();
    };

    draw(message);
  });
}

/** Messaggio d'invito pronto da mandare: menu Condividi dell'iPhone, oppure copia negli appunti */
async function shareInvite(email) {
  const url = PUBLIC_URL || location.origin + location.pathname;
  const text =
    `Ciao! Ti ho invitato nel mio ricettario “${cloud.book.name}” 🍽️\n` +
    `Apri l'app, tocca “Crea account” e registrati con questa email: ${email}\n` +
    `Troverai già tutte le ricette.`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Ricettario', text, url }); } catch { /* annullato */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Messaggio copiato: incollalo dove vuoi');
  } catch {
    toast('Copia non riuscita');
  }
}

// =============================================================
//  Pannello Account
// =============================================================
/**
 * onSwitched(): chiamata dopo aver cambiato ricettario (l'app si ridisegna)
 * onBackup(): apre il pop-up del backup
 */
export function accountSheet({ onSwitched, onBackup }) {
  openSheet(`<h3 class="sheet-title">Account</h3><div id="acct" class="acct"><p class="muted center">Caricamento…</p></div>`,
    (sheet, close) => {
      const $acct = sheet.querySelector('#acct');
      let people = { members: [], invites: [] };
      let inviteRole = 'viewer';
      const TAB_ORDER = ['settings', 'book', 'password'];
      let prevTab = 'settings'; // per far scivolare il selettore dalla voce precedente
      let slideDir = 0; // 1 = il contenuto entra da destra, -1 da sinistra, 0 = nessuna animazione
      let tab = 'settings'; // scheda del menu: 'settings' (tema, backup, esci) | 'book' (ricettario e persone) | 'password'

      const syncLine = () => {
        const n = cloud.pendingCount();
        if (!navigator.onLine) return `<span class="sync off">● Offline${n ? ` · ${n} modifiche in attesa` : ''}</span>`;
        return n ? `<span class="sync wait">● ${n} modifiche in invio…</span>` : '<span class="sync ok">● Tutto salvato online</span>';
      };

      const personRow = (p, pending = false) => {
        const isMe = p.user_id === cloud.user.id;
        const editable = cloud.isOwner() && !isMe && p.role !== 'owner';
        return `
          <div class="person">
            <span class="person-avatar">${esc((p.email || '?').charAt(0).toUpperCase())}</span>
            <span class="person-body">
              <span class="person-email">${esc(p.email || 'Utente')}${isMe ? ' <small>(tu)</small>' : ''}</span>
              <span class="person-role">${pending ? 'Invito in attesa · ' : ''}${pending || !editable ? ROLE_LABEL[p.role] : ''}</span>
            </span>
            ${editable && !pending ? `
              <select class="input role-select" data-uid="${p.user_id}" aria-label="Permessi">
                <option value="viewer" ${p.role === 'viewer' ? 'selected' : ''}>Solo lettura</option>
                <option value="editor" ${p.role === 'editor' ? 'selected' : ''}>Può modificare</option>
              </select>
              <button type="button" class="icon-btn danger" data-remove="${p.user_id}" aria-label="Rimuovi">${icon.x}</button>` : ''}
            ${pending && cloud.isOwner() ? `
              <button type="button" class="share-btn" data-share="${esc(p.email)}" aria-label="Condividi invito">${icon.share}<span>Invia</span></button>
              <button type="button" class="icon-btn danger" data-cancel="${esc(p.email)}" aria-label="Annulla invito">${icon.x}</button>` : ''}
          </div>`;
      };

      const sheetEl = $acct.closest('.sheet');

      // Il pannello Account occupa sempre tutto lo schermo (altezza fissa, qualunque voce sia aperta)
      sheetEl.classList.add('full');

      /** Ridisegna il pannello; il selettore scivola dalla voce precedente a quella attuale */
      const draw = () => {
        render();
        const $tabs = $acct.querySelector('.acct-tabs');
        requestAnimationFrame(() => $tabs?.style.setProperty('--i', TAB_ORDER.indexOf(tab)));
        prevTab = tab;
        slideDir = 0;
      };

      const render = () => {
        const b = cloud.book;
        $acct.innerHTML = `
          <div class="acct-me">
            <span class="person-avatar big">${esc(cloud.user.email.charAt(0).toUpperCase())}</span>
            <div>
              <div class="acct-email">${esc(cloud.user.email)}</div>
              ${syncLine()}
            </div>
          </div>

          <div class="segmented acct-tabs three" role="tablist" style="--i:${TAB_ORDER.indexOf(prevTab)}">
            <button type="button" data-tab="settings" class="${tab === 'settings' ? 'on' : ''}">Impostazioni</button>
            <button type="button" data-tab="book" class="${tab === 'book' ? 'on' : ''}">Invito</button>
            <button type="button" data-tab="password" class="${tab === 'password' ? 'on' : ''}">Password</button>
          </div>

          <div class="acct-pane ${slideDir ? 'slide' : ''}" style="--dir:${slideDir}">
          ${tab === 'settings' ? `
          <div class="acct-settings">
            ${themeRow()}
            <div class="action-list acct-actions">
              <button type="button" class="action" id="backup">Backup</button>
              <button type="button" class="action danger" id="logout">Esci dall’account</button>
            </div>
          </div>
          ` : tab === 'book' ? `
          <h4 class="acct-h">Ricettario</h4>
          <div class="action-list books">
            ${cloud.books.map((x) => `
              <button type="button" class="book-row ${x.id === b.id ? 'on' : ''}" data-book="${x.id}">
                <span class="book-name">${esc(x.name)}</span>
                <span class="book-role">${BOOK_ROLE[x.role]}</span>
                ${x.id === b.id ? `<span class="book-check">${icon.check}</span>` : ''}
              </button>`).join('')}
          </div>
          ${cloud.isOwner() ? '<button type="button" class="link-btn small" id="rename">Rinomina il ricettario</button>' : ''}

          <h4 class="acct-h">Persone con accesso</h4>
          <div class="people">
            ${people.members.map((p) => personRow(p)).join('')}
            ${people.invites.map((i) => personRow({ email: i.email, role: i.role }, true)).join('')}
          </div>

          ${cloud.isOwner() ? `
            <form class="invite" id="invite-form" novalidate>
              <h4 class="acct-h">Invita una persona</h4>
              <input class="input" type="email" name="email" placeholder="Email della persona" autocapitalize="off" autocomplete="off">
              <div class="segmented" id="invite-role">
                <button type="button" data-role="viewer" class="${inviteRole === 'viewer' ? 'on' : ''}">Solo vedere</button>
                <button type="button" data-role="editor" class="${inviteRole === 'editor' ? 'on' : ''}">Vedere e modificare</button>
              </div>
              <button class="btn primary full" type="submit">Invita</button>
            </form>` : `
            <p class="hint">Sei in questo ricettario come: <strong>${ROLE_LABEL[b.role]}</strong>.</p>
            <button type="button" class="btn ghost full danger-text" id="leave">Esci da questo ricettario</button>`}
          ` : `
          <form class="pw-form" id="pw-form" novalidate>
            <h4 class="acct-h">Cambia password</h4>
            <input class="input" type="password" name="current" placeholder="Password attuale" autocomplete="current-password">
            <input class="input" type="password" name="next" placeholder="Nuova password (almeno 6 caratteri)" autocomplete="new-password">
            <input class="input" type="password" name="confirm" placeholder="Ripeti la nuova password" autocomplete="new-password">
            <p class="auth-msg" id="pw-msg" hidden></p>
            <button class="btn primary full" type="submit">Salva la nuova password</button>
          </form>`}
          </div>`;

        bindThemeRow($acct);

        // Menu: Ricettario / Password
        $acct.querySelectorAll('[data-tab]').forEach((t) =>
          t.addEventListener('click', () => {
            const next = t.dataset.tab;
            if (next === tab) return;
            slideDir = TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(tab) ? 1 : -1;
            tab = next;
            draw();
          })
        );

        // Cambio password
        const pw = $acct.querySelector('#pw-form');
        if (pw) {
          const msg = (text, isError = true) => {
            const el = pw.querySelector('#pw-msg');
            el.hidden = !text;
            el.textContent = text;
            el.classList.toggle('error', isError);
          };
          pw.onsubmit = async (e) => {
            e.preventDefault();
            const { current, next, confirm } = pw;
            if (!current.value) return msg('Inserisci la password attuale.');
            if (next.value.length < 6) return msg('La nuova password deve avere almeno 6 caratteri.');
            if (next.value !== confirm.value) return msg('Le due nuove password non coincidono.');
            if (next.value === current.value) return msg('La nuova password deve essere diversa da quella attuale.');
            const btn = pw.querySelector('button[type=submit]');
            btn.disabled = true;
            btn.textContent = 'Un attimo…';
            try {
              await cloud.changePassword(current.value, next.value);
              pw.reset();
              msg('Password aggiornata ✓', false);
              toast('Password aggiornata');
            } catch (err) {
              msg(/invalid login credentials/i.test(String(err?.message)) ? 'La password attuale non è corretta.' : errorText(err));
            } finally {
              btn.disabled = false;
              btn.textContent = 'Salva la nuova password';
            }
          };
        }

        // Cambio ricettario
        $acct.querySelectorAll('[data-book]').forEach((btn) =>
          btn.addEventListener('click', async () => {
            if (btn.dataset.book === cloud.book.id) return;
            try {
              await cloud.openBook(btn.dataset.book);
              onSwitched();
              await load();
              toast(`Ricettario: ${cloud.book.name}`);
            } catch (e) { toast(errorText(e)); }
          })
        );

        $acct.querySelector('#rename')?.addEventListener('click', () => {
          const row = $acct.querySelector('.book-row.on .book-name');
          row.outerHTML = `<input class="input rename-input" value="${esc(cloud.book.name)}" maxlength="40">`;
          const input = $acct.querySelector('.rename-input');
          input.focus();
          input.select();
          const save = async () => {
            const name = input.value.trim();
            if (name && name !== cloud.book.name) {
              try { await cloud.renameBook(name); toast('Ricettario rinominato'); } catch (e) { toast(errorText(e)); }
            }
            draw();
          };
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
          input.addEventListener('blur', save, { once: true });
        });

        // Permessi delle persone
        $acct.querySelectorAll('.role-select').forEach((sel) =>
          sel.addEventListener('change', async () => {
            try { await cloud.setRole(sel.dataset.uid, sel.value); toast('Permessi aggiornati'); } catch (e) { toast(errorText(e)); }
            await load();
          })
        );
        $acct.querySelectorAll('[data-remove]').forEach((btn) =>
          btn.addEventListener('click', async () => {
            const p = people.members.find((m) => m.user_id === btn.dataset.remove);
            if (!(await confirmSheet(`Togliere l’accesso a ${p?.email || 'questa persona'}?`, { okText: 'Rimuovi', danger: true }))) {
              return accountSheet({ onSwitched, onBackup });
            }
            try { await cloud.removeMember(btn.dataset.remove); toast('Accesso rimosso'); } catch (e) { toast(errorText(e)); }
            accountSheet({ onSwitched, onBackup });
          })
        );
        // Condividi l'invito (WhatsApp, Messaggi, Mail…): l'app non manda email da sola
        $acct.querySelectorAll('[data-share]').forEach((btn) =>
          btn.addEventListener('click', () => shareInvite(btn.dataset.share))
        );
        $acct.querySelectorAll('[data-cancel]').forEach((btn) =>
          btn.addEventListener('click', async () => {
            try { await cloud.cancelInvite(btn.dataset.cancel); toast('Invito annullato'); } catch (e) { toast(errorText(e)); }
            await load();
          })
        );

        // Invito
        const form = $acct.querySelector('#invite-form');
        if (form) {
          form.querySelectorAll('[data-role]').forEach((b2) =>
            b2.addEventListener('click', () => {
              inviteRole = b2.dataset.role;
              form.querySelectorAll('[data-role]').forEach((x) => x.classList.toggle('on', x === b2));
            })
          );
          form.onsubmit = async (e) => {
            e.preventDefault();
            const email = form.email.value.trim().toLowerCase();
            if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Controlla l’indirizzo email');
            if (email === cloud.user.email.toLowerCase()) return toast('Questa è la tua email');
            if (people.members.some((m) => m.email === email)) return toast('Questa persona ha già accesso');
            try {
              await cloud.invite(email, inviteRole);
              await load();
              toast('Invito creato');
            } catch (err) { toast(errorText(err)); }
          };
        }

        $acct.querySelector('#leave')?.addEventListener('click', async () => {
          if (!(await confirmSheet(`Uscire da “${cloud.book.name}”? Non vedrai più queste ricette, a meno che non ti invitino di nuovo.`, { okText: 'Esci', danger: true }))) {
            return accountSheet({ onSwitched, onBackup });
          }
          try { await cloud.leaveBook(); onSwitched(); toast('Hai lasciato il ricettario'); } catch (e) { toast(errorText(e)); }
        });

        $acct.querySelector('#backup')?.addEventListener('click', () => { close(); setTimeout(onBackup, 260); });
        const $logout = $acct.querySelector('#logout');
        if ($logout) $logout.onclick = async () => {
          const n = cloud.pendingCount();
          const msg = n
            ? `Ci sono ${n} modifiche non ancora salvate online (sei offline?). Uscendo andranno perse. Uscire comunque?`
            : 'Uscire dall’account? Le ricette restano salvate online: le ritrovi accedendo di nuovo.';
          if (!(await confirmSheet(msg, { okText: 'Esci', danger: true }))) return accountSheet({ onSwitched, onBackup });
          await cloud.signOut();
          location.replace(location.pathname + '#/');
          location.reload();
        };
      };

      const load = async () => {
        try { people = await cloud.listPeople(); } catch (e) { if (!cloud.isNetworkError(e)) toast(errorText(e)); }
        if (document.body.contains($acct)) draw();
      };
      draw();
      load();
    });
}
