-- ============================================================================
-- Migration 002 — resident accounts
--
-- Run this once, in the Supabase SQL editor, on a database that was created
-- with the previous version of `schema.sql` (bookings/blocked_days/
-- slot_capacity, "any authenticated user is an admin", villa-number lookup).
--
-- It is idempotent: running it twice is harmless.
--
-- What changes:
--   * new `residents` (profiles) and `admins` tables;
--   * `bookings` gains `resident_id`;
--   * existing authenticated users are recorded as admins, so nobody is
--     locked out — review the `admins` table afterwards and remove anyone who
--     should not be staff;
--   * the villa-number lookup RPCs are dropped (they let anyone read another
--     villa's bookings); residents now read their own rows through RLS.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Helpers, admins
-- ---------------------------------------------------------------------------
create or replace function public.villa_key(p_villa text)
returns text language sql immutable as $$
  select regexp_replace(upper(btrim(coalesce(p_villa, ''))), '[^A-Z0-9]', '', 'g');
$$;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text,
  created_at timestamptz not null default now()
);

-- Everyone who could sign in before this migration was, by definition, staff.
insert into public.admins (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 2. Residents
-- ---------------------------------------------------------------------------
create table if not exists public.residents (
  id         uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name  text not null,
  villa      text not null,
  phone      text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists residents_villa_key_idx on public.residents (public.villa_key(villa));

alter table public.bookings
  add column if not exists resident_id uuid references public.residents(id) on delete cascade;
create index if not exists bookings_resident_idx on public.bookings (resident_id);

create or replace function public.sync_resident_bookings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.bookings
     set first_name = new.first_name, last_name = new.last_name, villa = new.villa
   where resident_id = new.id;
  return new;
end;
$$;

drop trigger if exists residents_sync_bookings on public.residents;
create trigger residents_sync_bookings
  after update of first_name, last_name, villa on public.residents
  for each row execute function public.sync_resident_bookings();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.raw_user_meta_data ? 'villa' then
    insert into public.residents (id, first_name, last_name, villa, phone)
    values (
      new.id,
      btrim(coalesce(new.raw_user_meta_data->>'first_name', '')),
      btrim(coalesce(new.raw_user_meta_data->>'last_name', '')),
      upper(btrim(new.raw_user_meta_data->>'villa')),
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
-- 3. Policies
-- ---------------------------------------------------------------------------
alter table public.residents enable row level security;
alter table public.admins    enable row level security;

drop policy if exists admin_all on public.bookings;
create policy admin_all on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.blocked_days;
create policy admin_all on public.blocked_days
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.slot_capacity;
create policy admin_all on public.slot_capacity
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.residents;
create policy admin_all on public.residents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists own_bookings on public.bookings;
create policy own_bookings on public.bookings
  for select to authenticated using (resident_id = auth.uid());

drop policy if exists own_profile_read on public.residents;
create policy own_profile_read on public.residents
  for select to authenticated using (id = auth.uid());

-- Deliberately no resident UPDATE policy: the villa number is the login
-- identity, so profile edits go through an admin (or `book_slot`, which
-- refreshes the phone number as a SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- 4. RPCs — replace the villa-number based ones
-- ---------------------------------------------------------------------------
drop function if exists public.villa_bookings(text);
drop function if exists public.cancel_booking(uuid, text);
drop function if exists public.book_slot(date, text, text, text, text, text);

create or replace function public.book_slot(p_date date, p_slot text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.residents; v_cap int; v_booked int; v_id uuid; v_start timestamptz;
begin
  select * into r from public.residents where id = auth.uid();
  if not found then raise exception 'Rezervasyon için giriş yapmalısınız.'; end if;
  if p_slot !~ '^\d{2}:00$' then raise exception 'Geçersiz saat.'; end if;
  if exists (select 1 from public.blocked_days where date = p_date) then
    raise exception 'Stüdyo bu gün kapalı.';
  end if;

  v_start := (p_date + (p_slot || ':00')::time) at time zone 'Europe/Istanbul';
  if v_start <= now() then raise exception 'Geçmiş bir saat rezerve edilemez.'; end if;

  if exists (select 1 from public.bookings
             where date = p_date and slot_time = p_slot and resident_id = r.id) then
    raise exception 'Bu saat için zaten bir rezervasyonunuz var.';
  end if;

  select coalesce((select capacity from public.slot_capacity where date = p_date and slot_time = p_slot), 1)
    into v_cap;
  select count(*) into v_booked from public.bookings where date = p_date and slot_time = p_slot;
  if v_booked >= v_cap then raise exception 'Bu saat dolu.'; end if;

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

create or replace function public.cancel_booking(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.bookings; v_start timestamptz;
begin
  select * into r from public.bookings where id = p_id;
  if not found then raise exception 'Rezervasyon bulunamadı.'; end if;
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

create or replace function public.admin_residents()
returns table (
  id uuid, first_name text, last_name text, villa text, phone text,
  created_at timestamptz, bookings_total int, bookings_upcoming int
)
language sql security definer set search_path = public as $$
  select r.id, r.first_name, r.last_name, r.villa, r.phone, r.created_at,
         count(b.id)::int,
         count(b.id) filter (
           where (b.date + (b.slot_time || ':00')::time) at time zone 'Europe/Istanbul' > now()
         )::int
  from public.residents r
  left join public.bookings b on b.resident_id = r.id
  where public.is_admin()
  group by r.id
  order by r.villa;
$$;

create or replace function public.admin_delete_resident(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yetkiniz yok.'; end if;
  if not exists (select 1 from public.residents where id = p_id) then
    raise exception 'Sakin bulunamadı.';
  end if;
  delete from auth.users where id = p_id;
end;
$$;

revoke all on function public.availability(int, int)      from public;
revoke all on function public.book_slot(date, text, text) from public;
revoke all on function public.cancel_booking(uuid)        from public;
revoke all on function public.admin_residents()           from public;
revoke all on function public.admin_delete_resident(uuid) from public;
revoke all on function public.is_admin()                  from public;

grant execute on function public.availability(int, int)      to anon, authenticated;
grant execute on function public.book_slot(date, text, text) to authenticated;
grant execute on function public.cancel_booking(uuid)        to authenticated;
grant execute on function public.admin_residents()           to authenticated;
grant execute on function public.admin_delete_resident(uuid) to authenticated;
grant execute on function public.is_admin()                  to authenticated;
