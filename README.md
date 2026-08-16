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
| `admin.yesilyakasupilates.com` | Studio staff | Supabase email + password |

In local dev, reach the admin build via `http://localhost:5173/?admin=1` (or
`http://admin.localhost:5173`).

## Security model

- **Residents have real accounts.** Sign-up asks for name, surname, villa number
  and a password. Supabase Auth needs an e-mail, so the client derives a
  synthetic one from the villa number (`villa-b14@villa.yesilyakasupilates.com`);
  the resident only ever types their villa number. `B-14`, `b 14` and `B14` all
  normalise to the same account, so **there is one account per villa**.
- **A resident can never see who booked anything.** The month view comes from
  `availability()`, which returns counts only, and RLS on `bookings` restricts
  `select` to `resident_id = auth.uid()` — other people's rows are never sent to
  the browser at all. Their own sessions are marked "Rezervasyonunuz".
- **Booking requires a session.** `book_slot` reads the caller's profile via
  `auth.uid()`; name and villa can't be spoofed from the client. It also
  re-checks blocked days, past times, capacity and double-booking.
- **Residents cancel only their own sessions** — `cancel_booking` verifies
  ownership and the 12-hour window server-side.
- **Admins are rows in `public.admins`**, not merely "any authenticated user".
  The admin console checks `is_admin()` before rendering, and every admin RLS
  policy is gated on the same function.
- The `service_role` key is never used in the frontend and must never be
  committed. Only the anon key belongs in `VITE_SUPABASE_ANON_KEY`.

## 1 · Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql).
   It creates the tables, RLS policies, RPCs, and demo seed data.
   *Upgrading a database that predates resident accounts?* Run
   [`supabase/migration-002-resident-auth.sql`](supabase/migration-002-resident-auth.sql)
   instead — it adds everything in place and records every existing auth user
   as an admin (review `public.admins` afterwards).
3. **Authentication → Providers → Email**: turn **Confirm email** *off*. Resident
   addresses are synthetic and receive no mail, so confirmation would lock
   everyone out. Leave sign-ups enabled.
4. Create staff logins under **Authentication → Users → Add user**, then list
   them as admins:

   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```

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
src/AdminLogin.tsx    Supabase email/password login (staff)
src/AdminResidents.tsx Registered residents: search, edit, delete, sessions
src/App.tsx           Shared calendar + day panel (presentational)
src/useStudio.ts      Data + mutations hook (resident vs. admin)
src/api.ts            Supabase calls (RPCs for residents, tables for admins)
src/supabase.ts       Supabase client
src/pilates.ts        Types, constants, date helpers, config
src/Notice.tsx        Loading / setup / error screens
supabase/schema.sql   Tables, RLS, RPCs, seed data
supabase/migration-002-resident-auth.sql
                      In-place upgrade for pre-accounts databases
```

## Managing residents

The admin console lists every registered account below the calendar, with each
resident's total and upcoming session counts. From there you can search, expand
a resident to see their sessions in the displayed month, edit their name / villa
/ phone (their existing bookings are relabelled automatically), or delete the
account outright — which also removes their login and all of their bookings.

Residents sign themselves up; there is no invite step. Forgotten passwords are
handled by deleting the account and letting the household register again, or by
setting a new password in **Authentication → Users** in Supabase.
