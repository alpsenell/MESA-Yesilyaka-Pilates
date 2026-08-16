-- ============================================================================
-- Migration 005 — create admins from the SQL editor, username only
--
-- Run once in the Supabase SQL editor, after migration 004.
-- Idempotent: running it twice is harmless.
--
-- After this, adding a member of staff is one line — no Authentication → Users
-- step, no e-mail address typed anywhere:
--
--   select public.create_admin('ayse', 'bir-sifre-secin');
--
-- The account's internal address is still derived as
-- <username>@admin.yesilyakasupilates.com, because Supabase Auth requires one;
-- nobody ever sees or types it.
--
-- These functions are executable ONLY from the SQL editor (owner /
-- service_role). They are deliberately NOT granted to anon or authenticated,
-- so no signed-in user — admin or resident — can mint an admin account.
-- ============================================================================

-- `extensions` is on the search path because Supabase installs pgcrypto there;
-- `crypt` and `gen_salt` come from it.
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

  -- email_confirmed_at is set here, so the "Confirm email" project setting is
  -- irrelevant for staff accounts: nothing is ever sent.
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
    crypt(p_password, gen_salt('bf', 10)),   -- bcrypt cost 10, as GoTrue uses
    now(), now(), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    '{}'::jsonb
  );

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

-- Reset a password without going near the dashboard:
--   select public.set_admin_password('ayse', 'yeni-sifre');
create or replace function public.set_admin_password(p_username text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Şifre en az 8 karakter olmalıdır.';
  end if;
  select user_id into v_id from public.admins where lower(username) = lower(btrim(p_username));
  if v_id is null then
    raise exception 'Yönetici bulunamadı: %', p_username;
  end if;
  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf', 10)),
         updated_at = now()
   where id = v_id;
end;
$$;

-- SQL editor only. No API role may call these.
revoke all on function public.create_admin(text, text)       from public, anon, authenticated;
revoke all on function public.set_admin_password(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tidy-up: migration 004 set `provider_id` to the address on existing admin
-- identities. GoTrue's own shape for an email identity is the user's id, and
-- password sign-in matches on auth.users.email either way, so normalise it.
-- ---------------------------------------------------------------------------
update auth.identities i
   set provider_id = i.user_id::text
  from public.admins a
 where a.user_id = i.user_id
   and i.provider = 'email'
   and i.provider_id is distinct from i.user_id::text;

-- ---------------------------------------------------------------------------
-- Removing an admin (deletes the login as well):
--
--   delete from auth.users
--   where id = (select user_id from public.admins where username = 'ayse');
--
-- Listing them:
--
--   select username, created_at from public.admins order by username;
-- ---------------------------------------------------------------------------
