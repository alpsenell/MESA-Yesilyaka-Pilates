-- ============================================================================
-- Yeşilyaka Su · Pilates booking — database schema
-- Run this in the Supabase SQL editor (or `supabase db push`) on a fresh project.
-- For an existing database created before resident accounts existed, run
-- `supabase/migration-002-resident-auth.sql` instead.
--
-- Design:
--   * Residents have real accounts (Supabase Auth). One account per villa:
--     the client derives a synthetic e-mail from the villa number, so the
--     resident only ever types "villa number + password".
--   * A resident may only ever see counts for other people's slots. The
--     `availability` RPC returns numbers only, and RLS on `bookings` limits a
--     resident to their own rows — names and villas of others are never sent.
--   * Admins are rows in `public.admins`. They read/write the tables directly.
--   * All slot times are local Europe/Istanbul wall-clock ("HH:00").
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Canonical form of a villa number. Villas are numbered 1–500, and "007",
-- "7" and " 7 " are all villa 7. Used for uniqueness and for deriving the
-- login e-mail client-side.
create or replace function public.villa_key(p_villa text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(upper(btrim(coalesce(p_villa, ''))), '[^A-Z0-9]', '', 'g'),
           '^0+(?=.)', '');
$$;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text,
  created_at timestamptz not null default now()
);

-- True when the caller is a studio admin. SECURITY DEFINER so that policies on
-- other tables can consult it without granting anyone a read on `admins`.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Resident profile, one row per auth user. Created automatically by the
-- `on_auth_user_created` trigger from the sign-up metadata.
create table if not exists public.residents (
  id         uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name  text not null,
  villa      text not null,
  phone      text not null default '',
  created_at timestamptz not null default now(),
  -- 1–500, spelled out as a regex so the constraint never has to cast text.
  constraint residents_villa_range check (villa ~ '^([1-9][0-9]?|[1-4][0-9]{2}|500)$')
);
create unique index if not exists residents_villa_key_idx on public.residents (public.villa_key(villa));

create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  slot_time   text not null,               -- 'HH:00' local time
  -- Owning resident. NULL for walk-in guests added by an admin.
  resident_id uuid references public.residents(id) on delete cascade,
  -- Denormalised on purpose: an admin-added guest has no profile, and the
  -- attendance sheet should keep the name that was used at booking time.
  first_name  text not null,
  last_name   text not null,
  villa       text not null,
  phone       text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists bookings_date_idx on public.bookings (date);
create index if not exists bookings_villa_idx on public.bookings (upper(villa));
create index if not exists bookings_resident_idx on public.bookings (resident_id);

create table if not exists public.blocked_days (
  date date primary key
);

create table if not exists public.slot_capacity (
  date      date not null,
  slot_time text not null,
  capacity  int  not null default 1 check (capacity between 0 and 4),
  primary key (date, slot_time)
);

-- Why an admin cancelled a resident's session. Shown to that resident the
-- next time they sign in, then marked seen.
create table if not exists public.cancellation_notices (
  id           uuid primary key default gen_random_uuid(),
  resident_id  uuid not null references public.residents(id) on delete cascade,
  date         date not null,
  slot_time    text not null,
  reason       text not null,
  cancelled_by text,                       -- admin e-mail, for the audit trail
  created_at   timestamptz not null default now(),
  seen_at      timestamptz
);
create index if not exists cancellation_notices_resident_idx
  on public.cancellation_notices (resident_id, seen_at);

-- Keep the denormalised copies in step when an admin edits a profile.
create or replace function public.sync_resident_bookings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
     set first_name = new.first_name,
         last_name  = new.last_name,
         villa      = new.villa
   where resident_id = new.id;
  return new;
end;
$$;

drop trigger if exists residents_sync_bookings on public.residents;
create trigger residents_sync_bookings
  after update of first_name, last_name, villa on public.residents
  for each row execute function public.sync_resident_bookings();

-- Sign-up hook: turn the metadata passed to `auth.signUp` into a profile row.
-- Accounts created without a `villa` claim (i.e. staff, from the dashboard)
-- are left alone.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_villa text;
begin
  if new.raw_user_meta_data ? 'villa' then
    v_villa := public.villa_key(new.raw_user_meta_data->>'villa');
    if v_villa !~ '^([1-9][0-9]?|[1-4][0-9]{2}|500)$' then
      raise exception 'Villa numarası 1 ile 500 arasında olmalıdır.';
    end if;
    insert into public.residents (id, first_name, last_name, villa, phone)
    values (
      new.id,
      btrim(coalesce(new.raw_user_meta_data->>'first_name', '')),
      btrim(coalesce(new.raw_user_meta_data->>'last_name', '')),
      v_villa,
      btrim(coalesce(new.raw_user_meta_data->>'phone', ''))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.bookings      enable row level security;
alter table public.residents     enable row level security;
alter table public.admins        enable row level security;
alter table public.blocked_days  enable row level security;
alter table public.slot_capacity enable row level security;
alter table public.cancellation_notices enable row level security;

-- Admins — full access to the operational tables.
drop policy if exists admin_all on public.bookings;
create policy admin_all on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.residents;
create policy admin_all on public.residents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.blocked_days;
create policy admin_all on public.blocked_days
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.slot_capacity;
create policy admin_all on public.slot_capacity
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.cancellation_notices;
create policy admin_all on public.cancellation_notices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Residents — their own booking rows and their own profile, nothing else.
-- This is what keeps "who booked Thursday 09:00" private: a resident simply
-- has no readable row for anyone else's booking.
drop policy if exists own_bookings on public.bookings;
create policy own_bookings on public.bookings
  for select to authenticated using (resident_id = auth.uid());

drop policy if exists own_profile_read on public.residents;
create policy own_profile_read on public.residents
  for select to authenticated using (id = auth.uid());

-- Residents read their own cancellation notices. There is no UPDATE policy on
-- purpose — `mark_notices_seen()` does that, so the reason text can never be
-- rewritten by its recipient.
drop policy if exists own_notices on public.cancellation_notices;
create policy own_notices on public.cancellation_notices
  for select to authenticated using (resident_id = auth.uid());

-- Deliberately no resident UPDATE policy: the villa number is the login
-- identity, so profile edits go through an admin (or `book_slot`, which
-- refreshes the phone number as a SECURITY DEFINER).

-- Nobody reads `admins` directly; `is_admin()` is the only door.
-- (RLS is enabled with no permissive policy → deny by default.)

-- Blocked days are not personal data — safe to read publicly so the resident
-- calendar can render "studio closed" without an RPC round-trip per action.
drop policy if exists public_read on public.blocked_days;
create policy public_read on public.blocked_days
  for select using (true);

-- NOTE: there is deliberately NO anon policy on bookings or slot_capacity.
-- Anonymous visitors see the calendar only through `availability()` below.

-- ---------------------------------------------------------------------------
-- Public / resident RPCs (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

-- Per-slot availability for a month — counts only, never any PII.
create or replace function public.availability(p_year int, p_month int)
returns table (date date, slot_time text, booked int, capacity int)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select make_date(p_year, p_month, 1) as lo,
           (make_date(p_year, p_month, 1) + interval '1 month')::date - 1 as hi
  ),
  b as (
    select bk.date, bk.slot_time, count(*)::int as booked
    from public.bookings bk, bounds
    where bk.date between bounds.lo and bounds.hi
    group by bk.date, bk.slot_time
  ),
  c as (
    select sc.date, sc.slot_time, sc.capacity
    from public.slot_capacity sc, bounds
    where sc.date between bounds.lo and bounds.hi
  )
  select coalesce(b.date, c.date)           as date,
         coalesce(b.slot_time, c.slot_time) as slot_time,
         coalesce(b.booked, 0)              as booked,
         coalesce(c.capacity, 1)            as capacity
  from b
  full outer join c on b.date = c.date and b.slot_time = c.slot_time;
$$;

-- Book a slot for the signed-in resident. Name and villa come from the
-- profile — the client cannot book on someone else's behalf.
create or replace function public.book_slot(p_date date, p_slot text, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.residents;
  v_cap    int;
  v_booked int;
  v_id     uuid;
  v_start  timestamptz;
begin
  select * into r from public.residents where id = auth.uid();
  if not found then
    raise exception 'Rezervasyon için giriş yapmalısınız.';
  end if;
  if p_slot !~ '^\d{2}:00$' then
    raise exception 'Geçersiz saat.';
  end if;
  if exists (select 1 from public.blocked_days where date = p_date) then
    raise exception 'Stüdyo bu gün kapalı.';
  end if;

  v_start := (p_date + (p_slot || ':00')::time) at time zone 'Europe/Istanbul';
  if v_start <= now() then
    raise exception 'Geçmiş bir saat rezerve edilemez.';
  end if;

  if exists (select 1 from public.bookings
             where date = p_date and slot_time = p_slot and resident_id = r.id) then
    raise exception 'Bu saat için zaten bir rezervasyonunuz var.';
  end if;

  select coalesce(
           (select capacity from public.slot_capacity where date = p_date and slot_time = p_slot),
           1)
    into v_cap;
  select count(*) into v_booked from public.bookings where date = p_date and slot_time = p_slot;
  if v_booked >= v_cap then
    raise exception 'Bu saat dolu.';
  end if;

  if p_phone is not null and btrim(p_phone) <> '' and btrim(p_phone) <> r.phone then
    update public.residents set phone = btrim(p_phone) where id = r.id;
    r.phone := btrim(p_phone);
  end if;

  insert into public.bookings (date, slot_time, resident_id, first_name, last_name, villa, phone)
  values (p_date, p_slot, r.id, r.first_name, r.last_name, r.villa, r.phone)
  returning id into v_id;
  return v_id;
end;
$$;

-- Resident self-cancel: must own the booking and be outside the 12h window.
create or replace function public.cancel_booking(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.bookings;
  v_start timestamptz;
begin
  select * into r from public.bookings where id = p_id;
  if not found then
    raise exception 'Rezervasyon bulunamadı.';
  end if;
  if r.resident_id is distinct from auth.uid() then
    raise exception 'Bu rezervasyon size ait değil.';
  end if;
  v_start := (r.date + (r.slot_time || ':00')::time) at time zone 'Europe/Istanbul';
  if v_start - now() < interval '12 hours' then
    raise exception 'Seansa 12 saatten az kaldı — lütfen stüdyoyu arayın.';
  end if;
  delete from public.bookings where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

-- Registered residents with their booking totals.
create or replace function public.admin_residents()
returns table (
  id uuid, first_name text, last_name text, villa text, phone text,
  created_at timestamptz, bookings_total int, bookings_upcoming int
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.first_name, r.last_name, r.villa, r.phone, r.created_at,
         count(b.id)::int as bookings_total,
         count(b.id) filter (
           where (b.date + (b.slot_time || ':00')::time) at time zone 'Europe/Istanbul' > now()
         )::int as bookings_upcoming
  from public.residents r
  left join public.bookings b on b.resident_id = r.id
  where public.is_admin()
  group by r.id
  order by r.villa;
$$;

-- Admin cancellation: reason required, resident notified, booking removed.
create or replace function public.admin_cancel_booking(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r public.bookings;
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'İptal nedeni zorunludur.';
  end if;

  select * into r from public.bookings where id = p_id;
  if not found then raise exception 'Rezervasyon bulunamadı.'; end if;

  -- Guests added by an admin have no account, so there is nobody to notify.
  if r.resident_id is not null then
    insert into public.cancellation_notices (resident_id, date, slot_time, reason, cancelled_by)
    values (r.resident_id, r.date, r.slot_time, btrim(p_reason),
            (select email from auth.users where id = auth.uid()));
  end if;

  delete from public.bookings where id = p_id;
end;
$$;

-- Mark every unseen notice for the calling resident as read.
create or replace function public.mark_notices_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.cancellation_notices
     set seen_at = now()
   where resident_id = auth.uid() and seen_at is null;
$$;

-- Delete a resident account outright (profile, bookings and login).
create or replace function public.admin_delete_resident(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok.';
  end if;
  if not exists (select 1 from public.residents where id = p_id) then
    raise exception 'Sakin bulunamadı.';
  end if;
  -- Cascades: auth.users → residents → bookings.
  delete from auth.users where id = p_id;
end;
$$;

-- Lock down default grants, then expose only what each role may call.
revoke all on function public.availability(int, int)          from public;
revoke all on function public.book_slot(date, text, text)     from public;
revoke all on function public.cancel_booking(uuid)            from public;
revoke all on function public.admin_residents()               from public;
revoke all on function public.admin_delete_resident(uuid)     from public;
revoke all on function public.admin_cancel_booking(uuid, text) from public;
revoke all on function public.mark_notices_seen()             from public;
revoke all on function public.is_admin()                      from public;

grant execute on function public.availability(int, int)      to anon, authenticated;
grant execute on function public.book_slot(date, text, text) to authenticated;
grant execute on function public.cancel_booking(uuid)        to authenticated;
grant execute on function public.admin_residents()           to authenticated;
grant execute on function public.admin_delete_resident(uuid) to authenticated;
grant execute on function public.admin_cancel_booking(uuid, text) to authenticated;
grant execute on function public.mark_notices_seen()            to authenticated;
grant execute on function public.is_admin()                  to authenticated;

-- ---------------------------------------------------------------------------
-- Admin accounts
-- ---------------------------------------------------------------------------
-- Studio staff sign in with the e-mail/password account you create for them in
-- Supabase → Authentication → Users, then must be listed here:
--
--   insert into public.admins (user_id, email)
--   select id, email from auth.users where email = 'you@example.com'
--   on conflict do nothing;
--
-- Any auth user that has no `villa` metadata and is not in `admins` can do
-- nothing at all.

-- ---------------------------------------------------------------------------
-- Seed data (demo). Safe to delete in production.
-- ---------------------------------------------------------------------------
insert into public.blocked_days (date) values ('2026-08-15'), ('2026-08-16')
  on conflict do nothing;

-- Guest bookings (no resident account attached) so a fresh database still shows
-- a populated calendar. Only seeded when the table is empty.
insert into public.bookings (date, slot_time, first_name, last_name, villa, phone)
select d, t, fn, ln, vl, ph
from (values
  ('2026-08-03','08:00','Elif','Yılmaz','9','+90 532 114 22 88'),
  ('2026-08-03','17:00','Mert','Demir','47',''),
  ('2026-08-04','09:00','Selin','Kaya','58','+90 555 902 77 41'),
  ('2026-08-04','10:00','Zeynep','Arslan','32',''),
  ('2026-08-04','18:00','Can','Öztürk','37','+90 542 330 11 90'),
  ('2026-08-05','08:00','Selin','Kaya','58','+90 555 902 77 41'),
  ('2026-08-06','11:00','Deniz','Aydın','14',''),
  ('2026-08-06','12:00','Emre','Şahin','23','+90 536 771 00 34'),
  ('2026-08-06','19:00','Ece','Koç','52',''),
  ('2026-08-07','09:00','Selin','Kaya','58','+90 555 902 77 41'),
  ('2026-08-07','15:00','Burak','Yıldız','61',''),
  ('2026-08-10','08:00','Merve','Çelik','35','+90 534 220 88 17'),
  ('2026-08-11','13:00','Ayşe','Polat','86',''),
  ('2026-08-12','10:00','Selin','Kaya','58','+90 555 902 77 41'),
  ('2026-08-12','16:00','Kerem','Tunç','12',''),
  ('2026-08-13','08:00','Nil','Erdem','25',''),
  ('2026-08-14','18:00','Barış','Acar','79','+90 532 664 33 21'),
  ('2026-08-18','09:00','Pelin','Güneş','34',''),
  ('2026-08-20','11:00','Onur','Kılıç','64',''),
  ('2026-08-25','17:00','Sude','Aksoy','45','')
) as v(d, t, fn, ln, vl, ph)
where not exists (select 1 from public.bookings);
