-- ============================================================================
-- Migration 007 — fix "Database error querying schema" on admin sign-in
--
-- Run once in the Supabase SQL editor, after migration 005.
-- Idempotent: running it twice is harmless.
--
-- Cause: Supabase Auth scans a handful of auth.users token columns into plain
-- (non-nullable) strings. Accounts it creates itself store '' there; the
-- accounts `create_admin` created in migration 005 left them NULL, so every
-- sign-in for such an account failed with HTTP 500 / unexpected_failure.
--
-- Fix: blank those NULLs on existing admin accounts, and redefine
-- `create_admin` so new accounts get '' from the start. The column list is
-- matched against information_schema, so a column this Auth version does not
-- have is simply skipped rather than breaking the statement.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Repair the accounts that already exist
-- ---------------------------------------------------------------------------
do $$
declare col text;
begin
  for col in
    select column_name
      from information_schema.columns
     where table_schema = 'auth'
       and table_name   = 'users'
       and column_name in ('confirmation_token', 'recovery_token',
                           'email_change_token_new', 'email_change_token_current',
                           'email_change', 'phone_change', 'phone_change_token',
                           'reauthentication_token')
  loop
    execute format(
      'update auth.users set %I = '''' where %I is null and id in (select user_id from public.admins)',
      col, col);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Same function as migration 005, plus the blank-token step
-- ---------------------------------------------------------------------------
create or replace function public.create_admin(p_username text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user  text;
  v_email text;
  v_id    uuid;
  col     text;
begin
  v_user := lower(btrim(coalesce(p_username, '')));
  if v_user !~ '^[a-z0-9._-]{2,32}$' then
    raise exception 'Kullanıcı adı 2-32 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir.';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Şifre en az 8 karakter olmalıdır.';
  end if;

  v_email := v_user || '@admin.yesilyakasupilates.com';

  if exists (select 1 from public.admins where lower(username) = v_user)
     or exists (select 1 from auth.users where email = v_email) then
    raise exception 'Bu kullanıcı adı zaten kullanılıyor: %', v_user;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    v_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf', 10)),
    now(), now(), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb
  );

  -- Supabase Auth reads these as non-nullable strings; NULL makes every
  -- sign-in for this account fail with "Database error querying schema".
  for col in
    select column_name
      from information_schema.columns
     where table_schema = 'auth'
       and table_name   = 'users'
       and column_name in ('confirmation_token', 'recovery_token',
                           'email_change_token_new', 'email_change_token_current',
                           'email_change', 'phone_change', 'phone_change_token',
                           'reauthentication_token')
  loop
    execute format('update auth.users set %I = '''' where id = $1 and %I is null', col, col)
      using v_id;
  end loop;

  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    now(), now(), now()
  );

  insert into public.admins (user_id, username, email) values (v_id, v_user, v_email);
  return v_id;
end;
$$;

revoke all on function public.create_admin(text, text) from public, anon, authenticated;
