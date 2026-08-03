# MESA Yeşilyaka · Pilates Booking

A booking calendar for the Pilates studio at the Yeşilyaka residential community.
Residents reserve one-on-one reformer sessions (08.00–20.00, one per hour); the
studio manager works the same calendar in an admin view to add guests, adjust
per-slot capacity, and close days for maintenance.

Built with **Vite + React + TypeScript**. Ported from a Claude Design component
(`Pilates Booking.dc.html`) into an idiomatic React app.

## Features

- **Month calendar** with per-day availability, a "today" marker, past/blocked
  day states, and an optional expanded layout showing open-hour chips.
- **Day panel** listing every hourly slot with live status (free / reserved /
  full / past) and one-click booking or cancellation.
- **Resident view** — book a slot with name, villa and optional phone; free
  cancellation up to a configurable window (default 12h) before the session.
- **Admin view** — add guest bookings, edit or force-cancel reservations, bump
  slot capacity up to 4, open/close whole days, and "print" an attendance list.
- **My bookings lookup** — find and cancel a villa's upcoming sessions by villa
  number (try `B-14`).
- **Responsive** with an in-app desktop/mobile preview toggle.

The whole app runs client-side with in-memory seed data — no backend. The demo
uses a fixed "now" of **3 Aug 2026** so past/present/future states stay stable.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

## Configuration

Studio name, community label, phone, accent color, cancellation window and the
"show remaining" toggle are defined in `DEFAULT_CONFIG` in
[`src/pilates.ts`](src/pilates.ts) and passed to `<App config={...} />`.

## Deployment

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Enable it under
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The Vite
`base` is relative, so the build also works from any subpath or static host.

## Project structure

```
index.html            App entry + font preloads
src/main.tsx          React bootstrap
src/App.tsx           Booking calendar component
src/pilates.ts        Types, constants, seed data, date helpers
src/index.css         Global styles + focus/hover states
```
