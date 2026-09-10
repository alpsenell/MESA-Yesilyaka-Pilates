# UX / UI Audit — Booking Calendar & Admin Console

Audited: all of `src/` (calendar in `App.tsx`, admin console in `AdminApp.tsx` /
`AdminSessions.tsx` / `AdminResidents.tsx`, auth and modals), cross-checked
against `useStudio.ts`, `api.ts` and the SQL in `supabase/` to confirm which
behaviours are UI-side. Findings are ordered by severity; every item carries a
file reference and a concrete recommendation.

The privacy rules in the README (residents never see who booked, the month grid
stays text-free for them) are treated as constraints, not defects — none of the
recommendations below violate them.

---

## What already works well

Worth keeping as-is while fixing the rest:

- Coherent, warm visual language: one palette, Instrument Serif + DM Sans,
  pill buttons, consistent card chrome across every screen.
- The privacy model is genuinely well executed — counts only for residents,
  own bookings accented, legend explains every treatment.
- Mandatory admin cancellation reasons, delivered to the resident as a
  sign-in notice, is excellent operationally.
- Two-step inline delete confirmation with consequence text
  (`AdminResidents.tsx:223`).
- Good form hygiene: `autocomplete` attributes, password reveal toggles,
  numeric `inputMode` for villa numbers.
- Resident-facing server errors are already localised Turkish
  (`supabase/schema.sql` RPCs).
- 44px touch targets on narrow layouts.

---

## P0 — Broken or blocking workflows

### 1. An admin cannot fill the second seat of a partially booked hour

`App.tsx:353` — as soon as a slot has one booking, the row's actions become
**Düzenle / İptal et** only; the **Misafir ekle** button exists solely on the
empty-slot branch (`App.tsx:363`). With the default capacity of 2, the single
most common admin task — adding the second person to a half-full hour — is
impossible from the UI. The only workaround is raising capacity on some other
empty slot and juggling bookings, i.e. there is none.

**Fix:** show **Misafir ekle** whenever `open > 0`, regardless of existing
bookings.

### 2. Only the first booking in a slot can be edited or cancelled

`App.tsx:318` — `const holder = bk && bk[0]`, and both Düzenle and İptal act on
`holder`. When two people share an hour, the second booking cannot be managed
anywhere in the app (the other tabs only *view* sessions). To cancel person #2
the admin would have to cancel person #1, re-add them, and… still couldn't.

**Fix:** render one line per booking inside the slot row (name · villa · phone)
with its own Düzenle / İptal actions. This also fixes the current readability
problem of multiple guests being crammed into one 12px line joined by `|`
(`App.tsx:355-357`).

### 3. "Katılım listesi" pretends to print but does nothing

`App.tsx:607` — the button immediately toasts *"…katılım listesi ön büro
yazıcısına gönderildi."* No list is generated, nothing is sent anywhere; it is
a leftover stub from the design prototype. An admin will trust that toast and
walk to a printer that received nothing.

**Fix:** either implement it (a printable day sheet — date, hours, names,
villas, phones — opened via `window.print()` with a print stylesheet is an
afternoon of work) or remove the button until it exists. A success message for
an action that did not happen is worse than no button.

---

## P1 — High-impact UX

### 4. Resident cancellation is a single tap with no confirmation and no undo

`App.tsx:384` (day panel) and `App.tsx:445` ("Rezervasyonlarım" modal) both
call `cancelMine` directly. One accidental tap releases the slot; if someone
else books it in the next minute, the resident has lost their session with no
recourse. Contrast: the *admin* cancel flow gets a full dialog.

**Fix:** a small confirm step ("İptal edilsin mi?" with the session named), or
an undo window in the toast.

### 5. On phones, tapping a day appears to do nothing

Below 900px the layout is a single column with the day panel *under* the
calendar (`App.tsx:457`). Tapping a day only changes a cell border; the slot
list that responds to the tap is off-screen. First-time mobile users — most of
the residents — will tap repeatedly and conclude the calendar is broken.

**Fix:** on narrow layouts, scroll the day panel into view on selection
(`scrollIntoView({behavior:'smooth'})`), or present the day as a bottom sheet.

### 6. While the month loads, every day looks open and bookable

`useStudio.ts` starts with empty maps, so `capacityOf` returns the default 2
and `bookedCount` 0 — the grid renders fully available and fully clickable
until the fetch lands; the only signal is an 11px "Yükleniyor…" in the header
(`App.tsx:548`). On a slow connection a resident can select a day and open a
booking form for an hour that is actually full (the server rejects it, but the
experience is a bait-and-switch).

**Fix:** while `store.loading`, dim the grid and suppress cell clicks /
"Rezerve et" actions; a simple opacity + `pointer-events: none` on the grid is
enough.

### 7. The admin's month grid hides the one thing an admin needs: load

For admins the cells carry only the grey "has bookings" bar (`App.tsx:247`) —
the same signal a resident gets. To learn how busy Thursday is, the admin must
click Thursday, then Friday, then… The privacy constraint explicitly does not
apply to admins (they see full PII in the day panel already).

**Fix:** in admin mode, render `booked/total` (e.g. `7/28`) or a small filled
bar per day cell. This single change turns the calendar tab into the at-a-glance
dashboard it is meant to be.

### 8. Capacity stepper feels laggy and races itself

Each − / + click issues an upsert **and a full month refetch**
(`useStudio.ts:169-179`). Going from 2 to 4 is two round-trips of the entire
month's bookings; rapid clicks race, last write wins. The stepper is also
rendered for past hours, where changing capacity is meaningless
(`App.tsx:413`).

**Fix:** optimistic local update with a debounced write; hide the stepper (or
just render the count) on past slots.

### 9. "Rezervasyonlarım" buries the sessions that matter

`fetchMyBookings` orders ascending by date (`api.ts:96`) and the modal renders
everything (`App.tsx:428`). After a few months of use the list opens on a wall
of "Tamamlandı" rows and the resident scrolls to the bottom to find next week's
session.

**Fix:** upcoming first (soonest at top), past sessions collapsed under a
"Geçmiş seanslar" toggle or simply capped at the last few.

### 10. The day panel opens on dead rows

Selecting today shows all 14 hours including the ones already past — by
evening, a resident scrolls through 10+ "Geçti" rows to reach anything
bookable (`App.tsx:312`). Similarly, the app auto-selects *today* even when
today is fully past or blocked, so the first thing shown is an inert panel.

**Fix:** collapse past hours behind "X geçmiş saati göster"; on load, if today
has nothing bookable, auto-select the next day that does.

---

## P2 — Accessibility & mobile

These apply across both apps; the resident base of a residential community will
include exactly the users these issues hit hardest.

- **Calendar is mouse-only.** Day cells are `div`s with `onClick`
  (`App.tsx:563-575`): no `role="button"`, no `tabIndex`, no `aria-label`
  ("15 Eylül, boş saat var"), no focus style, no Enter/Space handling. A
  keyboard or screen-reader user cannot operate the calendar at all.
- **Icon-only month nav** ‹ › has no `aria-label` (`App.tsx:552`).
- **Fake-disabled buttons.** "Dolu", "Geçti", "Tamamlandı", "Stüdyoyu arayın"
  are real, focusable `<button>`s with a no-op handler (`App.tsx:344,390-403`).
  Add `disabled`, or render them as text.
- **Contrast failures.** On the cream backgrounds (#FFFDFA/#FBF7F1):
  `#A79A8B` ≈ 2.7:1 (slot status text, kickers), `#7E9A72` ≈ 3.1:1 (the green
  "2 boş" — the most important text in the day panel), `#9C9083` ≈ 3.3:1,
  `#8C8073` ≈ 3.8:1 (meta lines) — all below WCAG AA's 4.5:1, mostly at
  10–12px where the requirement is strictest. Darkening each token one step
  (e.g. `#8C8073` → `#6E6357`, `#7E9A72` → `#5E7452`) keeps the palette and
  passes.
- **Modals** (booking, auth, cancel, notices, password): no `role="dialog"` /
  `aria-modal`, no focus trap, no Escape-to-close, no autofocus on the first
  field. Backdrop-click-to-close plus no Escape is the inverse of the expected
  pair.
- **Toast** (`App.tsx:847`) is not announced — add `role="status"` /
  `aria-live="polite"`.
- **iOS zoom jump.** Inputs are 14–15px (`App.tsx:218`,
  `AdminSessions.tsx:5`); Safari zooms the viewport on focus below 16px. Use
  ≥16px on narrow layouts.

---

## P3 — Consistency, polish, copy

- **Admin tab state is not in the URL** (`AdminApp.tsx:102`): refresh always
  lands on "Seanslı üyeler"; after "Takvimde aç" jumps to the calendar,
  browser Back leaves the site. A `#tab` hash (and `#date` for the calendar)
  would fix both cheaply.
- **"Üye yönetimi" session lists are coupled to the calendar tab's month**
  (`AdminApp.tsx:140`): if the admin last browsed December, every expanded
  resident shows *December's* sessions. Correctly labelled, still surprising —
  the `upcoming` count next to a month list that shows none invites confusion.
- **Phone numbers aren't links.** "Seanslı üyeler" is literally the
  call-people view; render phones as `tel:` links there and in the day panel
  (`AdminSessions.tsx:129`). Same for "Stüdyoyu arayın" buttons and the policy
  note on the resident side (`App.tsx:376,473`).
- **Raw Postgres errors for admin table writes.** Resident RPCs raise Turkish
  messages, but admin inserts/updates surface English driver text
  (`api.ts:146-186`); only two constraint cases are translated
  (`AdminResidents.tsx:86-93`). Map the common cases centrally in `api.ts`.
- **No capacity guard on the admin insert path** — `adminCreateBooking` is a
  direct table insert with no client- or server-side capacity check; combined
  with fix #1 above, add a soft warning when adding a guest would exceed the
  slot's capacity.
- **Guest form skips villa validation** (`App.tsx:139`) while resident editing
  enforces 1–500 (`AdminResidents.tsx:75`). If free-form villa text for guests
  is intentional, label the field accordingly; otherwise validate the same way.
- **Admins can "Misafir ekle" on past hours** (`App.tsx:363-368` ignores
  `past` for the action). If that's for record-keeping, fine — but the meta
  text "Rezervasyon yok" + active button reads like an oversight.
- **No "Bugün" button**, and month navigation runs unbounded into the past
  where residents have nothing to do (`App.tsx:551-554`).
- **Booking intent is lost at login.** An anonymous visitor taps "Rezerve et",
  signs in, and lands back on the calendar having to find the slot again
  (`App.tsx:117-121`). Stash the pending `{date, time}` and reopen the form
  after auth.
- **"Rezervasyonlarım" modal layout**: the lone "Kapat" button sits between
  the header and the list (`App.tsx:766`) — move it to the header row (an ×)
  or the footer.
- **Button label "Seansları"** (`AdminSessions.tsx:138`,
  `AdminResidents.tsx:205`) reads as a bare noun; "Seansları göster" / a
  chevron reads as an action.
- **Legend lumps "Dolu veya geçmiş"** — for future days those are different
  facts ("come back another day" vs "too late"); a separate treatment for full
  future days would help residents plan.
- **Error banner has no retry** (`App.tsx:529`) — a failed month load
  strands the user with stale cells; add "Tekrar dene".
- **Desktop day panel is ~900px tall** (14 rows, sticky at `top:24`,
  `App.tsx:459`); evening hours need page-scrolling while the calendar stays
  put. Consider `max-height: calc(100vh - 48px); overflow-y: auto` on the
  panel.

---

## Suggested order of attack

| Batch | Items | Cost | Payoff |
| --- | --- | --- | --- |
| 1. Unblock the admin | #1, #2, #3 | ~1 day | Core admin workflow actually works; no false "printed" claim |
| 2. Protect residents | #4, #6, #9 | ~½ day | No accidental cancellations, no phantom availability |
| 3. Mobile | #5, iOS 16px inputs, #10 | ~½ day | The tap-a-day-see-nothing problem gone |
| 4. Admin dashboard value | #7, #8, tel: links, tab-in-URL | ~1 day | Calendar becomes an at-a-glance ops view |
| 5. Accessibility pass | P2 list | ~1 day | Keyboard + screen-reader operable, AA contrast |
| 6. Polish | remaining P3 | ongoing | — |

Batches 1–3 are small, independent diffs against `App.tsx` and would be safe to
ship one PR each.
