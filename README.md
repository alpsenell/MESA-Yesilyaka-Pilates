# MESA Yeşilyaka · Pilates Booking

A booking system for the Pilates studio at the Yeşilyaka Su residential
community. Residents register an account for their villa, sign in, and reserve
one-on-one reformer sessions (08.00–20.00, one per hour); the studio manager
works the same calendar in a login-gated admin console to manage resident
accounts, add guests, adjust per-slot capacity, edit or cancel bookings, and
close days for maintenance.

**Stack:** Vite + React + TypeScript frontend · **Supabase** (Postgres + Auth +
RLS) backend. Ported from a Claude Design component (`Pilates Booking.dc.html`).

## How it's split

One app, routed by hostname:

| Host | Who | Auth |
| --- | --- | --- |
| `yesilyakasupilates.com` (+ `www`) | Residents | villa number + password (self sign-up) |
| `admin.yesilyakasupilates.com` | Studio staff | username + password |

In local dev, reach the admin build via `http://localhost:5173/?admin=1` (or
`http://admin.localhost:5173`).

## Security model

- **Residents have real accounts.** Sign-up asks for name, surname, villa number
  and a password. Supabase Auth needs an e-mail, so the client derives a
  synthetic one from the villa number (`villa-343@villa.yesilyakasupilates.com`);
  the resident only ever types their villa number. Villas are numbered
  **1–500**, and `343`, `007` and ` 7 ` normalise to one account each, so
  **there is one account per villa**. Override the address domain with
  `VITE_VILLA_EMAIL_DOMAIN` if your Supabase project ever rejects the default.
- **A resident can never see who booked anything.** The month view comes from
  `availability()`, which returns counts only, and RLS on `bookings` restricts
  `select` to `resident_id = auth.uid()` — other people's rows are never sent to
  the browser at all. Their own sessions are marked "Rezervasyonunuz".
- **Booking requires a session.** `book_slot` reads the caller's profile via
  `auth.uid()`; name and villa can't be spoofed from the client. It also
  re-checks blocked days, past times, capacity and double-booking.
- **Residents cancel only their own sessions** — `cancel_booking` verifies
  ownership and the 12-hour window server-side.
- **Admin cancellations require a reason.** `admin_cancel_booking` refuses an
  empty one, records it in `cancellation_notices` for the affected resident,
  and only then deletes the booking. The resident sees it the next time they
  sign in; `mark_notices_seen()` (not an UPDATE policy) clears it, so the
  recipient can never rewrite the reason.
- **Admins are rows in `public.admins`**, not merely "any authenticated user".
  The admin console checks `is_admin()` before rendering, and every admin RLS
  policy is gated on the same function. Staff sign in with a **username**; as
  with villas, the client turns it into a synthetic address
  (`ayse@admin.yesilyakasupilates.com`). **No e-mail address is typed anywhere
  in this application**, by residents or by staff.
- The `service_role` key is never used in the frontend and must never be
  committed. Only the anon key belongs in `VITE_SUPABASE_ANON_KEY`.

## 1 · Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql).
   It creates the tables, RLS policies, RPCs, and demo seed data.
   *Upgrading an existing database?* Run the migrations in order instead:
   [`002-resident-auth.sql`](supabase/migration-002-resident-auth.sql) (adds
   accounts in place and records every existing auth user as an admin — review
   `public.admins` afterwards) then
   [`003-villa-numbers-cancel-reason.sql`](supabase/migration-003-villa-numbers-cancel-reason.sql)
   (numeric villa numbers 1–500 and mandatory cancellation reasons) then
   [`004-admin-username.sql`](supabase/migration-004-admin-username.sql)
   (username logins for staff — it rewrites existing admin account addresses so
   their current passwords keep working, keeping the original in
   `admins.email`).
3. **Authentication → Providers → Email**: turn **Confirm email** *off*. This is
   not optional — the account addresses are synthetic and receive no mail, so
   a confirmation step cannot be completed and sign-up fails with *"Email
   address … is invalid"*. There is no other e-mail verification in the app.
   Leave sign-ups enabled.
4. Create staff logins under **Authentication → Users → Add user**, with the
   address `<username>@admin.yesilyakasupilates.com` and **Auto Confirm User**
   ticked, then list them as admins:

   ```sql
   insert into public.admins (user_id, username, email)
   select id, 'ayse', email from auth.users
   where email = 'ayse@admin.yesilyakasupilates.com'
   on conflict (user_id) do update set username = excluded.username;
   ```

   They then sign in at `admin.…` with just `ayse` and their password.

5. Copy **Project Settings → API → Project URL** and the **anon public** key.

## 2 · Run locally

```bash
npm install
cp .env.example .env.local     # then paste your Supabase URL + anon key
npm run dev                    # resident app at http://localhost:5173
                               # admin app at   http://localhost:5173/?admin=1
```

Other scripts: `npm run build` (type-check + production build), `npm run preview`.

## 3 · Deploy (Vercel)

The frontend is fully static — Supabase is the backend — so any static host
works. Vercel handles both subdomains from one project cleanly:

1. **Import** the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. **Environment Variables** → add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (same values as `.env.local`).
3. Deploy. Then **Settings → Domains** → add all three:
   `yesilyakasupilates.com`, `www.yesilyakasupilates.com`,
   `admin.yesilyakasupilates.com`. They all serve the same build; the app's
   hostname routing shows residents vs. admin.

### DNS records (at your domain registrar)

Point the domain at Vercel (use the exact targets Vercel shows you under
Settings → Domains — the values below are the current defaults):

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com.` |
| CNAME | `admin` | `cname.vercel-dns.com.` |

TLS certificates for all three are issued automatically. Add
`admin.yesilyakasupilates.com` to Supabase **Authentication → URL
Configuration → Redirect URLs** so admin sessions are allowed from that origin.

## Configuration

Studio name, community label, phone, accent color, the cancellation window and
the "show remaining counts" toggle live in `DEFAULT_CONFIG` in
[`src/pilates.ts`](src/pilates.ts). The 12-hour cancellation window is also
enforced server-side in `cancel_booking` (`supabase/schema.sql`) — change both
if you adjust it.

## Project structure

```
index.html            App entry + font preloads
src/main.tsx          Hostname routing → ResidentApp | AdminApp
src/ResidentApp.tsx   Resident session gate + wiring
src/ResidentAuth.tsx  Resident login / registration (villa number + password)
src/auth.ts           Villa→e-mail mapping, sign-up/in, profile, admin check
src/AdminApp.tsx      Auth + is_admin() gate, admin console, logout
src/AdminLogin.tsx    Staff username/password login
src/AdminResidents.tsx Registered residents: search, edit, delete, sessions
src/App.tsx           Shared calendar + day panel (presentational)
src/useStudio.ts      Data + mutations hook (resident vs. admin)
src/api.ts            Supabase calls (RPCs for residents, tables for admins)
src/supabase.ts       Supabase client
src/pilates.ts        Types, constants, date helpers, config
src/Notice.tsx        Loading / setup / error screens
supabase/schema.sql   Tables, RLS, RPCs, seed data
supabase/migration-002-resident-auth.sql
                      In-place upgrade: resident accounts
supabase/migration-003-villa-numbers-cancel-reason.sql
                      In-place upgrade: villa numbers 1–500, cancel reasons
supabase/migration-004-admin-username.sql
                      In-place upgrade: staff sign in with a username
```

## Managing residents

The admin console lists every registered account below the calendar, with each
resident's total and upcoming session counts. From there you can search, expand
a resident to see their sessions in the displayed month, edit their name / villa
/ phone (their existing bookings are relabelled automatically), or delete the
account outright — which also removes their login and all of their bookings.

When an admin cancels a resident's session, a reason is mandatory: it is stored
against that resident and shown to them the next time they sign in, then marked
seen. Guests added by an admin have no account, so their cancellations record
the reason for the audit trail but notify nobody.

Residents sign themselves up; there is no invite step. Forgotten passwords are
handled by deleting the account and letting the household register again, or by
setting a new password in **Authentication → Users** in Supabase.
