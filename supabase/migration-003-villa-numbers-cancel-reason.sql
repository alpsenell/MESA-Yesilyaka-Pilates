-- ============================================================================
-- Migration 003 — numeric villa numbers + cancellation reasons
--
-- Run once in the Supabase SQL editor, after migration 002.
-- Idempotent: running it twice is harmless.
--
-- What changes:
--   * villa numbers are plain numbers 1–500, stored normalised ("007" → "7");
--   * an admin cancelling a resident's session must give a reason, and the
--     resident is shown that reason the next time they sign in.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Villa numbers are 1–500
-- ---------------------------------------------------------------------------

-- Leading zeros no longer make a separate villa: "007" and "7" are villa 7.
create or replace function public.villa_key(p_villa text)
returns text language sql immutable as $$
  select regexp_replace(
           regexp_replace(upper(btrim(coalesce(p_villa, ''))), '[^A-Z0-9]', '', 'g'),
           '^0+(?=.)', '');
$$;

-- Normalise anything already stored, then rebuild the index on the new key.
update public.residents set villa = public.villa_key(villa) where villa <> public.villa_key(villa);

drop index if exists public.residents_villa_key_idx;
create unique index residents_villa_key_idx on public.residents (public.villa_key(villa));

-- 1–500, spelled out as a regex so the constraint never has to cast text.
alter table public.residents drop constraint if exists residents_villa_range;
alter table public.residents add constraint residents_villa_range
  check (villa ~ '^([1-9][0-9]?|[1-4][0-9]{2}|500)$');

-- Sign-up hook: store the normalised number and reject anything out of range.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- ---------------------------------------------------------------------------
-- 2. Cancellation notices
-- ---------------------------------------------------------------------------
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

alter table public.cancellation_notices enable row level security;

drop policy if exists admin_all on public.cancellation_notices;
create policy admin_all on public.cancellation_notices
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Residents read their own notices. There is no UPDATE policy on purpose —
-- marking one as seen goes through `mark_notices_seen()` so the reason text
-- itself can never be rewritten by the recipient.
drop policy if exists own_notices on public.cancellation_notices;
create policy own_notices on public.cancellation_notices
  for select to authenticated using (resident_id = auth.uid());

-- Admin cancellation: reason required, resident notified, booking removed.
create or replace function public.admin_cancel_booking(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
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

create or replace function public.mark_notices_seen()
returns void language sql security definer set search_path = public as $$
  update public.cancellation_notices
     set seen_at = now()
   where resident_id = auth.uid() and seen_at is null;
$$;

revoke all on function public.admin_cancel_booking(uuid, text) from public;
revoke all on function public.mark_notices_seen()              from public;
grant execute on function public.admin_cancel_booking(uuid, text) to authenticated;
grant execute on function public.mark_notices_seen()              to authenticated;
