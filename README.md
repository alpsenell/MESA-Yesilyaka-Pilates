# MESA Yeşilyaka · Pilates Booking

A booking system for the Pilates studio at the Yeşilyaka Su residential
community. Residents reserve one-on-one reformer sessions (08.00–20.00, one per
hour) by name + villa; the studio manager works the same calendar in a
login-gated admin console to add guests, adjust per-slot capacity, edit or
cancel bookings, and close days for maintenance.

**Stack:** Vite + React + TypeScript frontend · **Supabase** (Postgres + Auth +
RLS) backend. Ported from a Claude Design component (`Pilates Booking.dc.html`).

## How it's split

One app, routed by hostname:

| Host | Who | Auth |
| --- | --- | --- |
| `yesilyakasupilates.com` (+ `www`) | Residents | none — book by name + villa |
| `admin.yesilyakasupilates.com` | Studio staff | Supabase email + password |

In local dev, reach the admin build via `http://localhost:5173/?admin=1` (or
`http://admin.localhost:5173`).

## Security model

- **Residents use the public anon key but can never bulk-read personal data.**
  The `bookings` table has no anon RLS policy; residents reach it only through
  four `SECURITY DEFINER` functions (`availability`, `book_slot`,
  `villa_bookings`, `cancel_booking`). The resident calendar shows *counts only*
  ("3 / 12 boş") — never who booked.
- **Residents cancel only their own sessions**, via the villa lookup; the server
  re-checks the villa and the 12-hour cancellation window.
- **Admins** authenticate with Supabase Auth (any authenticated user is treated
  as staff — only invited accounts exist) and read/write the tables directly.
- The `service_role` key is never used in the frontend and must never be
  committed. Only the anon key belongs in `VITE_SUPABASE_ANON_KEY`.

## 1 · Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql).
   It creates the tables, RLS policies, resident RPCs, and demo seed data.
3. Create staff logins under **Authentication → Users → Add user** (set a
   password; there is no public sign-up). These are the admin accounts.
4. Copy **Project Settings → API → Project URL** and the **anon public** key.

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
src/ResidentApp.tsx   Resident wiring
src/AdminApp.tsx      Auth gate + admin console + logout
src/AdminLogin.tsx    Supabase email/password login
src/App.tsx           Shared calendar + day panel (presentational)
src/useStudio.ts      Data + mutations hook (resident vs. admin)
src/api.ts            Supabase calls (RPCs for residents, tables for admins)
src/supabase.ts       Supabase client
src/pilates.ts        Types, constants, date helpers, config
src/Notice.tsx        Loading / setup / error screens
supabase/schema.sql   Tables, RLS, RPCs, seed data
```
