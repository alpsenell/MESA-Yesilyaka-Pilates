-- ============================================================================
-- Migration 006 — two people per hour by default
--
-- Run once in the Supabase SQL editor, after migration 005.
-- Idempotent: running it twice is harmless.
--
-- Every hour now seats 2 unless an admin has said otherwise. Slots with an
-- explicit row in `slot_capacity` are left exactly as the admin set them —
-- including any deliberate 1 — so only the default changes. To push existing
-- explicit 1s up to 2 as well, run the optional statement at the bottom.
-- ============================================================================

alter table public.slot_capacity alter column capacity set default 2;

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
         coalesce(c.capacity, 2)            as capacity
  from b
  full outer join c on b.date = c.date and b.slot_time = c.slot_time;
$$;

-- Same function as migration 003, with the default capacity raised to 2.
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

  select coalesce((select capacity from public.slot_capacity where date = p_date and slot_time = p_slot), 2)
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

-- Optional — only if you also want previously pinned 1-person slots to seat 2:
--
--   update public.slot_capacity set capacity = 2 where capacity = 1;
