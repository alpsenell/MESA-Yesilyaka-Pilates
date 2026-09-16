-- ============================================================================
-- Migration 008 — residents cannot cancel within 24 hours of the session
--
-- Run once in the Supabase SQL editor, after migration 007.
-- Idempotent: running it twice is harmless.
--
-- The self-cancel window grows from 12 to 24 hours, and the error message now
-- points residents to site management instead of a studio phone number. Admin
-- cancellations (admin_cancel_booking) are unaffected and remain the only way
-- to cancel inside the window.
-- ============================================================================

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
  if v_start - now() < interval '24 hours' then
    raise exception 'Seansa 24 saatten az kaldı — iptal için lütfen site yönetimi ile iletişime geçin.';
  end if;
  delete from public.bookings where id = p_id;
end;
$$;
