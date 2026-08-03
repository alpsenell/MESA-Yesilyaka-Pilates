-- ============================================================================
-- Yeşilyaka Su · Pilates booking — database schema
-- Run this in the Supabase SQL editor (or `supabase db push`) on a fresh project.
--
-- Design:
--   * Residents use the anon key and may ONLY call the four RPCs at the bottom
--     (availability / book_slot / villa_bookings / cancel_booking). They can
--     never bulk-read the bookings table, so names and phone numbers are not
--     exposed through the public key.
--   * Admins authenticate (Supabase Auth) and read/write the tables directly;
--     "any authenticated user is an admin" — only invited staff have accounts.
--   * All slot times are local Europe/Istanbul wall-clock ("HH:00").
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  slot_time  text not null,               -- 'HH:00' local time
  first_name text not null,
  last_name  text not null,
  villa      text not null,
  phone      text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists bookings_date_idx on public.bookings (date);
create index if not exists bookings_villa_idx on public.bookings (upper(villa));

create table if not exists public.blocked_days (
  date date primary key
);

create table if not exists public.slot_capacity (
  date      date not null,
  slot_time text not null,
  capacity  int  not null default 1 check (capacity between 0 and 4),
  primary key (date, slot_time)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.bookings      enable row level security;
alter table public.blocked_days  enable row level security;
alter table public.slot_capacity enable row level security;

-- Admins (any authenticated user) — full access to every table.
drop policy if exists admin_all on public.bookings;
create policy admin_all on public.bookings
  for all to authenticated using (true) with check (true);

drop policy if exists admin_all on public.blocked_days;
create policy admin_all on public.blocked_days
  for all to authenticated using (true) with check (true);

drop policy if exists admin_all on public.slot_capacity;
create policy admin_all on public.slot_capacity
  for all to authenticated using (true) with check (true);

-- Blocked days are not personal data — safe to read publicly so the resident
-- calendar can render "studio closed" without an RPC round-trip per action.
drop policy if exists public_read on public.blocked_days;
create policy public_read on public.blocked_days
  for select using (true);

-- NOTE: there is deliberately NO anon policy on bookings or slot_capacity.
-- Residents reach those only through the SECURITY DEFINER functions below.

-- ---------------------------------------------------------------------------
-- Resident RPCs (SECURITY DEFINER, callable by anon)
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

-- Create a booking. Enforces validation, blocked days, past times and capacity.
create or replace function public.book_slot(
  p_date date, p_slot text, p_first text, p_last text, p_villa text, p_phone text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap    int;
  v_booked int;
  v_id     uuid;
  v_start  timestamptz;
begin
  if p_first is null or btrim(p_first) = '' or btrim(p_last) = '' or btrim(coalesce(p_villa,'')) = '' then
    raise exception 'Ad, soyad ve villa numarası zorunludur.';
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

  select coalesce(
           (select capacity from public.slot_capacity where date = p_date and slot_time = p_slot),
           1)
    into v_cap;
  select count(*) into v_booked from public.bookings where date = p_date and slot_time = p_slot;
  if v_booked >= v_cap then
    raise exception 'Bu saat dolu.';
  end if;

  insert into public.bookings (date, slot_time, first_name, last_name, villa, phone)
  values (p_date, p_slot, btrim(p_first), btrim(p_last), upper(btrim(p_villa)), btrim(coalesce(p_phone, '')))
  returning id into v_id;
  return v_id;
end;
$$;

-- A single villa's bookings (residents look up their own by villa number).
create or replace function public.villa_bookings(p_villa text)
returns setof public.bookings
language sql
security definer
set search_path = public
as $$
  select * from public.bookings
  where upper(villa) = upper(btrim(p_villa))
  order by date, slot_time;
$$;

-- Resident self-cancel: must match the villa and be outside the 12h window.
create or replace function public.cancel_booking(p_id uuid, p_villa text)
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
  if upper(r.villa) <> upper(btrim(p_villa)) then
    raise exception 'Villa numarası eşleşmiyor.';
  end if;
  v_start := (r.date + (r.slot_time || ':00')::time) at time zone 'Europe/Istanbul';
  if v_start - now() < interval '12 hours' then
    raise exception 'Seansa 12 saatten az kaldı — lütfen stüdyoyu arayın.';
  end if;
  delete from public.bookings where id = p_id;
end;
$$;

-- Lock down default grants, then expose only the RPCs to the anon role.
revoke all on function public.availability(int, int)                         from public;
revoke all on function public.book_slot(date, text, text, text, text, text)  from public;
revoke all on function public.villa_bookings(text)                           from public;
revoke all on function public.cancel_booking(uuid, text)                     from public;

grant execute on function public.availability(int, int)                        to anon, authenticated;
grant execute on function public.book_slot(date, text, text, text, text, text) to anon, authenticated;
grant execute on function public.villa_bookings(text)                          to anon, authenticated;
grant execute on function public.cancel_booking(uuid, text)                    to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed data (demo month: August 2026). Safe to delete in production.
-- ---------------------------------------------------------------------------
insert into public.blocked_days (date) values ('2026-08-15'), ('2026-08-16')
  on conflict do nothing;

-- Only seed when the table is empty, so re-running this file is safe (bookings
-- have no natural unique key, so ON CONFLICT can't dedupe them).
insert into public.bookings (date, slot_time, first_name, last_name, villa, phone)
select d, t, fn, ln, vl, ph
from (values
  ('2026-08-03','08:00','Elif','Yılmaz','A-02','+90 532 114 22 88'),
  ('2026-08-03','17:00','Mert','Demir','C-11',''),
  ('2026-08-04','09:00','Selin','Kaya','B-14','+90 555 902 77 41'),
  ('2026-08-04','10:00','Zeynep','Arslan','D-07',''),
  ('2026-08-04','18:00','Can','Öztürk','A-09','+90 542 330 11 90'),
  ('2026-08-05','08:00','Selin','Kaya','B-14','+90 555 902 77 41'),
  ('2026-08-06','11:00','Deniz','Aydın','B-03',''),
  ('2026-08-06','12:00','Emre','Şahin','C-05','+90 536 771 00 34'),
  ('2026-08-06','19:00','Ece','Koç','D-12',''),
  ('2026-08-07','09:00','Selin','Kaya','B-14','+90 555 902 77 41'),
  ('2026-08-07','15:00','Burak','Yıldız','A-15',''),
  ('2026-08-10','08:00','Merve','Çelik','C-08','+90 534 220 88 17'),
  ('2026-08-11','13:00','Ayşe','Polat','B-21',''),
  ('2026-08-12','10:00','Selin','Kaya','B-14','+90 555 902 77 41'),
  ('2026-08-12','16:00','Kerem','Tunç','D-02',''),
  ('2026-08-13','08:00','Nil','Erdem','A-06',''),
  ('2026-08-14','18:00','Barış','Acar','C-19','+90 532 664 33 21'),
  ('2026-08-18','09:00','Pelin','Güneş','B-08',''),
  ('2026-08-20','11:00','Onur','Kılıç','D-15',''),
  ('2026-08-25','17:00','Sude','Aksoy','A-11','')
) as v(d, t, fn, ln, vl, ph)
where not exists (select 1 from public.bookings);
