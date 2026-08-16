-- ============================================================================
-- Migration 004 — admins sign in with a username
--
-- Run once in the Supabase SQL editor, after migration 003.
-- Idempotent: running it twice is harmless.
--
-- Nobody types an e-mail address into this application any more. Residents
-- already signed in with their villa number; staff now sign in with a
-- username. Supabase Auth still needs an address internally, so each admin
-- gets the synthetic `<username>@admin.yesilyakasupilates.com` — the same
-- trick the villa logins use.
--
-- IMPORTANT: this rewrites the e-mail on existing admin auth accounts so that
-- their current passwords keep working with the new username. The original
-- address is preserved in `public.admins.email`; to undo, copy it back into
-- `auth.users.email` and `auth.identities`. If an admin is ever locked out,
-- Supabase → Authentication → Users can always reset the address or password.
--
-- The domain below MUST match ADMIN_EMAIL_DOMAIN in src/auth.ts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Usernames
-- ---------------------------------------------------------------------------
alter table public.admins add column if not exists username text;

-- Derive a username from the existing address ("ayse@studio.com" → "ayse"),
-- numbering any duplicates so the result is unique.
with derived as (
  select user_id,
         case when rn = 1 then base else base || rn::text end as username
  from (
    select user_id,
           base,
           row_number() over (partition by base order by created_at, user_id) as rn
    from (
      select user_id,
             created_at,
             coalesce(
               nullif(regexp_replace(lower(split_part(coalesce(email, ''), '@', 1)),
                                     '[^a-z0-9._-]', '', 'g'), ''),
               'admin') as base
      from public.admins
    ) b
  ) n
)
update public.admins a
   set username = d.username
  from derived d
 where a.user_id = d.user_id
   and a.username is null;

alter table public.admins alter column username set not null;
create unique index if not exists admins_username_idx on public.admins (lower(username));

-- Usernames are what people type: letters, digits, dot, dash, underscore.
alter table public.admins drop constraint if exists admins_username_format;
alter table public.admins add constraint admins_username_format
  check (username ~ '^[a-zA-Z0-9._-]{2,32}$');

-- ---------------------------------------------------------------------------
-- 2. Point the auth accounts at the synthetic addresses
-- ---------------------------------------------------------------------------
update auth.users u
   set email = lower(a.username) || '@admin.yesilyakasupilates.com',
       email_confirmed_at = coalesce(u.email_confirmed_at, now())
  from public.admins a
 where a.user_id = u.id
   and u.email is distinct from lower(a.username) || '@admin.yesilyakasupilates.com';

-- GoTrue resolves password logins through auth.identities, so it has to agree.
update auth.identities i
   set identity_data = jsonb_set(coalesce(i.identity_data, '{}'::jsonb), '{email}', to_jsonb(u.email)),
       provider_id = u.email
  from auth.users u
  join public.admins a on a.user_id = u.id
 where i.user_id = u.id
   and i.provider = 'email'
   and i.provider_id is distinct from u.email;

-- ---------------------------------------------------------------------------
-- 3. Adding a new admin later
-- ---------------------------------------------------------------------------
-- In Supabase → Authentication → Users → Add user, set the e-mail to
-- `<username>@admin.yesilyakasupilates.com` and tick "Auto Confirm User", then:
--
--   insert into public.admins (user_id, username, email)
--   select id, 'ayse', email from auth.users
--   where email = 'ayse@admin.yesilyakasupilates.com'
--   on conflict (user_id) do update set username = excluded.username;
