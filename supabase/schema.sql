-- =============================================================
--  Ricettario — schema del database (Supabase / PostgreSQL)
-- =============================================================
--  Come usarlo: Supabase → SQL Editor → New query → incolla tutto → Run.
--  Si può rieseguire senza problemi: non cancella i dati.
--
--  Modello:
--   • books    = un ricettario (ogni utente ne ha uno suo; può essere condiviso)
--   • members  = chi fa parte di un ricettario e con che ruolo
--                owner (proprietario) · editor (vede e modifica) · viewer (solo vede)
--   • invites  = inviti in attesa, per email: quando la persona invitata accede
--                con quella email entra nel ricettario con il ruolo scelto
--   • items    = categorie, ricette, alimenti della dispensa e pasti (salvati come JSON,
--                con la stessa forma che usa l'app)
--   • foto     = nello Storage, bucket "photos", cartella = id del ricettario
--   • diary    = il diario alimentare: PERSONALE (una riga per utente e per giorno),
--                non fa parte del ricettario e non lo vede nessun altro
--
--  La sicurezza è garantita dal database con la Row Level Security (RLS):
--  ognuno legge e scrive solo i ricettari di cui fa parte, secondo il suo ruolo.
-- =============================================================


-- ---------- Tabelle ----------

create table if not exists public.books (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Il mio ricettario',
  owner_id    uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  book_id     uuid not null references public.books (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text,
  role        text not null check (role in ('owner', 'editor', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (book_id, user_id)
);
create index if not exists members_user_idx on public.members (user_id);

create table if not exists public.invites (
  book_id     uuid not null references public.books (id) on delete cascade,
  email       text not null check (email = lower(email)),
  role        text not null check (role in ('editor', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (book_id, email)
);

create table if not exists public.items (
  book_id     uuid not null references public.books (id) on delete cascade,
  kind        text not null check (kind in ('category', 'recipe', 'food', 'meal')),
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (book_id, kind, id)
);

-- Diario alimentare: una riga per persona e per giorno.
-- data = { "colazione": [ elementi ], "pranzo": [ … ], … } (stessa forma dei pasti)
create table if not exists public.diary (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);


-- Aggiornamento per chi aveva già creato le tabelle: ora ci sono anche i pasti ('meal')
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('category', 'recipe', 'food', 'meal'));


-- ---------- Funzioni di supporto per i permessi ----------
-- "security definer": leggono la tabella members senza passare dalle sue regole
-- (evita regole che si richiamano a vicenda all'infinito)

create or replace function public.my_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.book_role(b uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where book_id = b and user_id = auth.uid()
$$;

create or replace function public.is_member(b uuid) returns boolean
language sql stable as $$ select public.book_role(b) is not null $$;

create or replace function public.can_edit(b uuid) returns boolean
language sql stable as $$ select coalesce(public.book_role(b) in ('owner', 'editor'), false) $$;

create or replace function public.is_owner(b uuid) returns boolean
language sql stable as $$ select coalesce(public.book_role(b) = 'owner', false) $$;

-- Converte il nome della cartella di una foto in uuid (null se non valido)
create or replace function public.try_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;


-- ---------- Azioni chiamate dall'app ----------

-- Crea un ricettario e ne rende proprietario chi lo crea
create or replace function public.create_book(book_name text default 'Il mio ricettario') returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  insert into public.books (name, owner_id) values (coalesce(nullif(trim(book_name), ''), 'Il mio ricettario'), auth.uid())
  returning id into new_id;
  insert into public.members (book_id, user_id, email, role) values (new_id, auth.uid(), public.my_email(), 'owner');
  return new_id;
end $$;

-- Accetta gli inviti destinati alla propria email (chiamata dopo ogni accesso)
create or replace function public.accept_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare me text := public.my_email(); n integer := 0;
begin
  if auth.uid() is null or me = '' then return 0; end if;
  insert into public.members (book_id, user_id, email, role)
    select i.book_id, auth.uid(), me, i.role from public.invites i where i.email = me
  on conflict (book_id, user_id) do update set role = excluded.role
    where public.members.role <> 'owner';          -- il proprietario resta proprietario
  get diagnostics n = row_count;
  delete from public.invites where email = me;
  return n;
end $$;


-- ---------- Permessi di base ----------
-- Solo gli utenti che hanno fatto l'accesso possono usare le tabelle
-- (cosa possono vedere e modificare lo decidono poi le regole RLS qui sotto)

revoke all on public.books, public.members, public.invites, public.items, public.diary from anon;
grant select, insert, update, delete on public.books, public.members, public.invites, public.items, public.diary to authenticated;
revoke execute on function public.create_book(text), public.accept_invites() from public, anon;
grant execute on function public.create_book(text), public.accept_invites() to authenticated;


-- ---------- Row Level Security ----------

alter table public.books   enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.items   enable row level security;
alter table public.diary   enable row level security;

-- Rieseguendo lo script le regole vengono ricreate da zero
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('books', 'members', 'invites', 'items', 'diary') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Ricettari: li vede chi ne fa parte; li rinomina/elimina solo il proprietario
-- (si creano solo con create_book)
create policy books_select on public.books for select to authenticated using (public.is_member(id));
create policy books_update on public.books for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
create policy books_delete on public.books for delete to authenticated using (public.is_owner(id));

-- Membri: li vede chi fa parte del ricettario; il proprietario cambia i ruoli
-- e rimuove le persone; ognuno può uscire da un ricettario non suo
create policy members_select on public.members for select to authenticated using (public.is_member(book_id));
create policy members_update on public.members for update to authenticated
  using (public.is_owner(book_id) and role <> 'owner')
  with check (public.is_owner(book_id) and role in ('editor', 'viewer'));
create policy members_delete on public.members for delete to authenticated
  using (role <> 'owner' and (public.is_owner(book_id) or user_id = auth.uid()));

-- Inviti: li gestisce il proprietario; l'invitato vede quelli per la sua email
create policy invites_select on public.invites for select to authenticated
  using (public.is_owner(book_id) or email = public.my_email());
create policy invites_insert on public.invites for insert to authenticated with check (public.is_owner(book_id));
create policy invites_update on public.invites for update to authenticated using (public.is_owner(book_id)) with check (public.is_owner(book_id));
create policy invites_delete on public.invites for delete to authenticated using (public.is_owner(book_id));

-- Categorie, ricette, alimenti: le vede ogni membro; le modifica owner o editor
create policy items_select on public.items for select to authenticated using (public.is_member(book_id));
create policy items_insert on public.items for insert to authenticated with check (public.can_edit(book_id));
create policy items_update on public.items for update to authenticated using (public.can_edit(book_id)) with check (public.can_edit(book_id));
create policy items_delete on public.items for delete to authenticated using (public.can_edit(book_id));

-- Diario: ognuno vede e modifica solo il proprio
create policy diary_own on public.diary for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ---------- Foto (Storage) ----------
-- Percorso di ogni foto: <id ricettario>/<id foto>.jpg

insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists photos_select on storage.objects;
drop policy if exists photos_insert on storage.objects;
drop policy if exists photos_update on storage.objects;
drop policy if exists photos_delete on storage.objects;

create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_member(public.try_uuid((storage.foldername(name))[1])));
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_edit(public.try_uuid((storage.foldername(name))[1])));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.can_edit(public.try_uuid((storage.foldername(name))[1])));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_edit(public.try_uuid((storage.foldername(name))[1])));


-- ---------- Aggiornamenti in tempo reale ----------
-- Le modifiche fatte da un altro membro (o dal tuo altro dispositivo) compaiono subito

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['items', 'diary'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
