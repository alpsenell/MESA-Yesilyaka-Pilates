import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react'
import Modal from './Modal'
import {
  DAYS,
  DAYS_SHORT,
  HOURS_LABEL,
  MONTHS,
  hoursOut,
  iso,
  now,
  prettyDate,
  slotStart,
  telHref,
  timeLabel,
  times,
  type Booking,
} from './pilates'
import type { StudioStore } from './useStudio'
import { MAX_VILLA, MIN_VILLA, isValidVilla, villaKey, type Resident } from './auth'

interface Cell {
  key: string
  isDay: boolean
  style: CSSProperties
  day?: number
  /** Accessible name: date plus availability state. */
  label?: string
  disabled?: boolean
  selected?: boolean
  numStyle?: CSSProperties
  dotStyle?: CSSProperties
  /** Bar along the bottom when the day has bookings; absent otherwise. */
  markStyle?: CSSProperties
  /** Admin only: booked/capacity for the day. */
  count?: string
  onClick?: () => void
}

type FormMode = 'book' | 'admin-add' | 'edit'
interface FormState {
  date: string
  time: string
  mode: FormMode
  id?: string
}
interface Fields {
  first: string
  last: string
  villa: string
  phone: string
}

interface SlotAction {
  label: string
  style: CSSProperties
  onClick?: () => void
  disabled?: boolean
}

interface SlotRowData {
  key: string
  past: boolean
  timeLabel: string
  rowStyle: CSSProperties
  statusStyle: CSSProperties
  statusText: string
  metaText: string
  showCapacity: boolean
  capLabel: string
  /** Admin: individual bookings in the slot, each with its own actions. */
  bookings: Booking[] | null
  action: SlotAction | null
}

interface AppProps {
  store: StudioStore
  headerExtra?: ReactNode
  /** Signed-in resident, or null when the visitor is browsing anonymously. */
  resident?: Resident | null
  /** Called when an action needs a signed-in resident. */
  onRequireLogin?: () => void
  /** Called after a booking may have updated the stored phone number. */
  onProfileChange?: () => void
  /** Rendered directly under the header — the admin console's tab bar. */
  tabs?: (ctx: { narrow: boolean }) => ReactNode
  /** When set, replaces the calendar + day panel entirely (admin sub-views). */
  replaceBody?: (ctx: { narrow: boolean }) => ReactNode
}

export default function App({ store, headerExtra, resident = null, onRequireLogin, onProfileChange, tabs, replaceBody }: AppProps) {
  const { config } = store
  const isAdmin = store.role === 'admin'
  const signedIn = isAdmin || !!resident

  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1400))
  const [form, setForm] = useState<FormState | null>(null)
  const [f, setF] = useState<Fields>({ first: '', last: '', villa: '', phone: '' })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mineOpen, setMineOpen] = useState(false)
  // Admin cancellation always needs a reason, so it goes through a dialog.
  const [cancelling, setCancelling] = useState<Booking | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState('')
  // Residents confirm their own cancellations too — one tap must not be enough
  // to give a slot away.
  const [confirmCancel, setConfirmCancel] = useState<Booking | null>(null)
  // A slot tapped before signing in; the form reopens right after login.
  const [pending, setPending] = useState<{ date: string; time: string } | null>(null)
  const [showPastSlots, setShowPastSlots] = useState(false)
  const [showPastMine, setShowPastMine] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  const autoPicked = useRef(false)

  useEffect(() => {
    const onResize = () => setW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function say(msg: string) {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }

  // Availability counts are off for everyone, admins included. The per-slot
  // capacity stepper on the day panel still shows exact figures, since that is
  // the control an admin uses to change them.
  const showRemaining = config.showRemaining ?? true
  const accent = config.accentColor ?? '#B0674C'
  const win = config.cancelWindowHours ?? 24
  const narrow = w < 900

  const sel = store.selected
  const y = store.year
  const m = store.month

  useEffect(() => {
    setShowPastSlots(false)
  }, [sel])

  function dayStats(date: string) {
    let open = 0
    let total = 0
    let booked = 0
    times().forEach((t) => {
      const c = store.capacityOf(date, t)
      const b = store.bookedCount(date, t)
      total += c
      booked += b
      open += Math.max(0, c - b)
    })
    return { open, total, booked }
  }

  // ---- actions ----
  function openBooking(date: string, time: string) {
    if (!isAdmin && !resident) {
      setPending({ date, time })
      onRequireLogin?.()
      return
    }
    setForm({ date, time, mode: isAdmin ? 'admin-add' : 'book' })
    setF(
      resident && !isAdmin
        ? { first: resident.first, last: resident.last, villa: resident.villa, phone: resident.phone }
        : { first: '', last: '', villa: '', phone: '' },
    )
    setFormError('')
  }

  // The slot tapped before signing in reopens as a booking form after login.
  useEffect(() => {
    if (!resident || !pending) return
    const p = pending
    setPending(null)
    if (slotStart(p.date, p.time) <= now()) return
    setForm({ date: p.date, time: p.time, mode: 'book' })
    setF({ first: resident.first, last: resident.last, villa: resident.villa, phone: resident.phone })
    setFormError('')
  }, [resident, pending])

  function editBooking(b: Booking) {
    setForm({ date: b.date, time: b.time, mode: 'edit', id: b.id })
    setF({ first: b.first, last: b.last, villa: b.villa, phone: b.phone })
    setFormError('')
  }
  async function submit() {
    if (!form) return
    // Residents book as themselves — the server reads their profile, so only
    // the admin "add a guest" form still collects a name.
    if (isAdmin) {
      if (!f.first.trim() || !f.last.trim() || !f.villa.trim()) {
        setFormError('Ad, soyad ve villa numarası zorunludur.')
        return
      }
      if (!isValidVilla(f.villa)) {
        setFormError(`Villa numarası ${MIN_VILLA} ile ${MAX_VILLA} arasında bir sayı olmalıdır.`)
        return
      }
      // The insert path has no server-side capacity check, so guard here.
      if (form.mode === 'admin-add' && store.bookedCount(form.date, form.time) >= store.capacityOf(form.date, form.time)) {
        setFormError('Bu saat dolu. Misafir eklemek için önce kapasiteyi artırın.')
        return
      }
    }
    setBusy(true)
    const input = {
      date: form.date,
      time: form.time,
      first: f.first,
      last: f.last,
      villa: isAdmin ? villaKey(f.villa) : f.villa,
      phone: f.phone,
    }
    const res = form.mode === 'edit' ? await store.updateBooking(form.id!, input) : await store.book(input)
    setBusy(false)
    if (res.ok) {
      setForm(null)
      if (!isAdmin && f.phone.trim() !== (resident?.phone ?? '')) onProfileChange?.()
      say(
        form.mode === 'edit'
          ? 'Rezervasyon güncellendi.'
          : prettyDate(form.date) +
              ', ' +
              timeLabel(form.time) +
              (isAdmin ? ' misafir eklendi.' : ' rezervasyonunuz alındı.'),
      )
    } else {
      setFormError(res.error)
    }
  }
  function askCancelAdmin(b: Booking) {
    setCancelling(b)
    setCancelReason('')
    setCancelError('')
  }
  async function confirmCancelAdmin() {
    if (!cancelling) return
    if (!cancelReason.trim()) {
      setCancelError('İptal nedeni zorunludur.')
      return
    }
    setBusy(true)
    const res = await store.cancel(cancelling, true, cancelReason)
    setBusy(false)
    if (res.ok) {
      setCancelling(null)
      say(
        cancelling.residentId
          ? 'Seans iptal edildi. Sakin, giriş yaptığında nedeni görecek.'
          : 'Seans iptal edildi.',
      )
    } else {
      setCancelError(res.error)
    }
  }
  function openMine() {
    if (!resident) {
      onRequireLogin?.()
      return
    }
    setShowPastMine(false)
    setMineOpen(true)
  }
  async function confirmCancelMine() {
    if (!confirmCancel) return
    setBusy(true)
    // `store.cancel` reloads the month, which also refreshes `store.mine`.
    const res = await store.cancel(confirmCancel, false)
    setBusy(false)
    setConfirmCancel(null)
    say(res.ok ? 'Seans serbest bırakıldı. Haber verdiğiniz için teşekkürler.' : res.error)
  }

  // The attendance sheet renders into `.print-sheet` (visible only in print
  // media) and hands it to the browser's print dialog.
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => window.print(), 60)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  // ---- styles ----
  const ghost: CSSProperties = {
    padding: narrow ? '10px 13px' : '9px 14px',
    minHeight: narrow ? 44 : 0,
    borderRadius: 999,
    border: '1px solid #E4DACB',
    background: '#FFFDFA',
    color: '#2B2620',
    fontSize: 12,
    cursor: 'pointer',
  }
  const actBase: CSSProperties = {
    padding: narrow ? '12px 18px' : '9px 18px',
    minHeight: narrow ? 44 : 0,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
  }
  const disabledAct: CSSProperties = { ...actBase, border: '1px solid #EFE7DA', background: 'transparent', color: '#C0B5A6', cursor: 'default' }
  const dangerAct: CSSProperties = { ...actBase, border: '1px solid #E0C4B8', background: '#FBF3EF', color: '#94422A', cursor: 'pointer' }
  const miniBtn: CSSProperties = { padding: '7px 12px', minHeight: narrow ? 38 : 0, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 12, cursor: 'pointer' }
  const miniDanger: CSSProperties = { ...miniBtn, border: '1px solid #E0C4B8', background: '#FBF3EF', color: '#94422A' }
  const inputStyle: CSSProperties = { padding: 13, borderRadius: 10, border: '1px solid #E4DACB', background: '#FBF7F1', fontSize: 15, color: '#2B2620', outline: 'none' }
  const labelSpan: CSSProperties = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6E6357' }

  // ---- calendar cells ----
  // The grid carries no names: a day is open, full, past, or the studio is
  // closed. Admins additionally see the day's booked/capacity count — the
  // privacy rule binds residents, not staff. The legend under the calendar
  // explains every treatment.
  const first = new Date(y, m, 1)
  const startPad = (first.getDay() + 6) % 7
  const daysIn = new Date(y, m + 1, 0).getDate()
  const cellH = narrow ? 68 : 84
  const cells: Cell[] = []
  for (let i = 0; i < startPad; i++) cells.push({ key: 'p' + i, isDay: false, style: { minHeight: cellH } })
  const nowD = now()
  const todayIso = iso(nowD.getFullYear(), nowD.getMonth(), nowD.getDate())
  for (let d = 1; d <= daysIn; d++) {
    const dIso = iso(y, m, d)
    const isPast = new Date(dIso + 'T23:59:59') < nowD
    const isBlocked = store.isBlocked(dIso)
    const isSel = dIso === sel
    const st = dayStats(dIso)
    const full = st.open === 0 && !isBlocked
    const fullFuture = full && !isPast
    // Nothing left to book: shown greyed out, and inert for residents.
    const unavailable = isPast || isBlocked || full
    const clickable = isAdmin || !unavailable
    // "This day has bookings" — no names, no counts, which is all a resident
    // may know about other people's sessions. Their own bookings get the
    // accent colour so they can find them at a glance.
    const mineHere = !isAdmin && store.mine.some((b) => b.date === dIso)
    const markColor = isAdmin ? null : mineHere ? accent : st.booked > 0 ? '#8C8073' : null
    const stateLabel = isBlocked ? 'stüdyo kapalı' : isPast ? 'geçmiş' : full ? 'dolu' : 'boş saat var'
    const style: CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      textAlign: 'left',
      minHeight: cellH,
      padding: narrow ? '9px 6px' : '10px 11px',
      borderRadius: 12,
      cursor: clickable ? 'pointer' : 'default',
      border: '1px solid ' + (isSel ? accent : fullFuture ? '#EAD9CC' : unavailable ? '#EDE6DA' : '#EDE4D6'),
      background: isBlocked
        ? 'repeating-linear-gradient(135deg,#F6F1E9,#F6F1E9 6px,#F1EADF 6px,#F1EADF 12px)'
        : isSel
          ? '#FBF3ED'
          : fullFuture
            ? '#F5EAE2'
            : unavailable
              ? '#F4EFE7'
              : '#FFFDFA',
      boxShadow: isSel ? '0 0 0 3px rgba(176,103,76,0.10)' : 'none',
      opacity: unavailable && !isAdmin ? 0.55 : 1,
      transition: 'background 0.15s, border-color 0.15s',
      overflow: 'hidden',
    }
    cells.push({
      key: dIso,
      isDay: true,
      day: d,
      label:
        d + ' ' + MONTHS[m] + ' ' + y + ', ' + DAYS[(new Date(dIso + 'T00:00:00').getDay() + 6) % 7] +
        ' — ' + stateLabel + (mineHere ? ', rezervasyonunuz var' : ''),
      disabled: !clickable,
      selected: isSel,
      numStyle: {
        fontFamily: "'Instrument Serif', Georgia, serif",
        fontSize: narrow ? 22 : 20,
        color: dIso === todayIso ? accent : unavailable ? '#B3A897' : '#2B2620',
      },
      dotStyle: { width: narrow ? 7 : 6, height: narrow ? 7 : 6, borderRadius: 999, background: dIso === todayIso ? accent : 'transparent', display: 'inline-block' },
      markStyle: markColor
        ? { marginTop: 'auto', alignSelf: 'flex-start', width: narrow ? 14 : 18, height: 4, borderRadius: 999, background: markColor, display: 'inline-block' }
        : undefined,
      count: isAdmin && st.booked > 0 ? st.booked + '/' + st.total : undefined,
      style,
      onClick: () => {
        store.setSelected(dIso)
        // On phones the day panel sits below the calendar; bring it into view
        // so the tap has a visible response.
        if (narrow) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      },
    })
  }
  while (cells.length % 7 !== 0) cells.push({ key: 'e' + cells.length, isDay: false, style: { minHeight: cellH } })

  let mOpen = 0
  let mBooked = 0
  for (let d = 1; d <= daysIn; d++) {
    const dIso = iso(y, m, d)
    if (store.isBlocked(dIso)) continue
    const st = dayStats(dIso)
    mOpen += st.open
    mBooked += st.booked
  }

  const selBlocked = store.isBlocked(sel)
  const selDate = new Date(sel + 'T00:00:00')
  const selStats = dayStats(sel)

  // If today has nothing left to book, start the resident on the next day
  // that does instead of a panel full of dead rows. Runs once, after the
  // first month load.
  useEffect(() => {
    if (isAdmin || store.loading || autoPicked.current) return
    autoPicked.current = true
    if (sel !== todayIso) return
    const bookableToday =
      !store.isBlocked(sel) &&
      times().some((t) => slotStart(sel, t) > nowD && store.capacityOf(sel, t) - store.bookedCount(sel, t) > 0)
    if (bookableToday) return
    for (let d = selDate.getDate() + 1; d <= daysIn; d++) {
      const dIso = iso(y, m, d)
      if (store.isBlocked(dIso)) continue
      if (dayStats(dIso).open > 0) {
        store.setSelected(dIso)
        break
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.loading, isAdmin])

  // ---- day-panel slots ----
  // The grid says nothing, so this is where availability lives: how many
  // places are free, and how many are already taken.
  function seatText(free: number, taken: number): string {
    if (free <= 0) return 'Dolu'
    if (taken <= 0) return free + ' boş'
    return free + ' boş · ' + taken + ' dolu'
  }

  const slotRows: SlotRowData[] = times().map((t) => {
    const cp = store.capacityOf(sel, t)
    const cnt = store.bookedCount(sel, t)
    const open = cp - cnt
    const past = slotStart(sel, t) <= nowD
    const bk = store.bookingsAt(sel, t) // null for residents
    const own = isAdmin ? null : store.mineAt(sel, t)

    const rowStyle: CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: narrow ? '12px 13px' : '13px 15px',
      borderRadius: 12,
      border: '1px solid #F0E8DA',
      background: selBlocked || past ? '#FAF7F1' : open > 0 ? '#FFFDFA' : '#FBF6F1',
      opacity: (past || selBlocked) && !isAdmin ? 0.55 : 1,
      flexWrap: 'wrap',
    }
    const statusStyle: CSSProperties = {
      fontSize: 11,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: open > 0 && !selBlocked && !past ? '#5E7452' : '#7E7367',
    }

    let statusText: string
    let metaText = ''
    let bookings: Booking[] | null = null
    let action: SlotAction | null = null

    if (selBlocked) {
      statusText = 'Kapalı'
      metaText = 'Bakım / tatil'
    } else if (isAdmin) {
      statusText = past ? 'Geçti' : seatText(open, cnt)
      bookings = bk && bk.length ? bk : null
      if (!bookings) metaText = past ? 'Geçmiş saat' : 'Bir saatlik seans'
      // A free seat means a guest can be added — a half-full hour included.
      if (open > 0) {
        action = { label: 'Misafir ekle', style: { ...actBase, border: '1px solid ' + accent, background: '#FFFDFA', color: accent, cursor: 'pointer' }, onClick: () => openBooking(sel, t) }
      }
    } else if (own) {
      // The resident's own session — the only booking they may ever see.
      const soon = !past && hoursOut(sel, t) < win
      statusText = past ? 'Tamamlandı' : 'Rezervasyonunuz'
      metaText = past
        ? 'Bu seans sizin adınıza ayrılmıştı.'
        : 'Bu seans sizin adınıza ayrıldı · ' + seatText(open, cnt)
      if (past) action = { label: 'Tamamlandı', style: disabledAct, disabled: true }
      else if (soon) action = { label: 'Yönetime başvurun', style: disabledAct, disabled: true }
      else action = { label: 'İptal et', style: dangerAct, onClick: () => setConfirmCancel(own) }
    } else {
      // resident — counts only, no PII, no cross-resident cancel
      if (past) {
        statusText = 'Geçti'
        metaText = 'Geçmiş seans'
        action = { label: 'Geçti', style: disabledAct, disabled: true }
      } else if (open > 0) {
        statusText = seatText(open, cnt)
        metaText = signedIn ? 'Bir saatlik seans' : 'Rezervasyon için giriş yapın'
        action = {
          label: signedIn ? 'Rezerve et' : 'Giriş yapın',
          style: { ...actBase, border: '1px solid ' + accent, background: accent, color: '#FFFDFA', cursor: 'pointer' },
          onClick: () => openBooking(sel, t),
        }
      } else {
        statusText = 'Dolu'
        metaText = cnt + ' kişi bu saati almış'
        action = { label: 'Dolu', style: disabledAct, disabled: true }
      }
    }

    return {
      key: t,
      past,
      timeLabel: timeLabel(t),
      rowStyle,
      statusStyle,
      statusText,
      metaText,
      showCapacity: isAdmin && !selBlocked && !past,
      capLabel: cnt + '/' + cp,
      bookings,
      action,
    }
  })

  // On today, fold the hours that are already over out of the way.
  const collapsePast = sel === todayIso && !selBlocked
  const pastCount = slotRows.filter((r) => r.past).length
  const visibleSlotRows = collapsePast && !showPastSlots && pastCount > 0 ? slotRows.filter((r) => !r.past) : slotRows

  const capBtnStyle: CSSProperties = { width: narrow ? 34 : 26, height: narrow ? 34 : 26, borderRadius: 8, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#6E6357', fontSize: 14, cursor: 'pointer' }

  function renderAction(action: SlotAction | null) {
    if (!action) return null
    return (
      <button onClick={action.onClick} disabled={action.disabled} style={action.style}>
        {action.label}
      </button>
    )
  }

  // ---- resident "my bookings" — upcoming first, history folded away ----
  const mineWhen = (b: Booking) =>
    DAYS[(new Date(b.date + 'T00:00:00').getDay() + 6) % 7] + ', ' + prettyDate(b.date) + ' · ' + timeLabel(b.time)
  const mineUpcoming = store.mine.filter((b) => slotStart(b.date, b.time) > nowD)
  const minePast = store.mine.filter((b) => slotStart(b.date, b.time) <= nowD).reverse()

  function mineAction(b: Booking, past: boolean): SlotAction {
    const soon = !past && hoursOut(b.date, b.time) < win
    if (past) return { label: 'Tamamlandı', style: { ...disabledAct, flexShrink: 0 }, disabled: true }
    if (soon) return { label: 'Yönetime başvurun', style: { ...disabledAct, flexShrink: 0 }, disabled: true }
    return { label: 'İptal et', style: { ...dangerAct, flexShrink: 0 }, onClick: () => setConfirmCancel(b) }
  }

  function mineRow(b: Booking, past: boolean) {
    return (
      <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', border: '1px solid #EFE7DA', borderRadius: 12, background: '#FBF7F1', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{mineWhen(b)}</div>
          <div style={{ fontSize: 12, color: '#6E6357' }}>Villa {b.villa}{b.phone ? ' · ' + b.phone : ''}</div>
        </div>
        {renderAction(mineAction(b, past))}
      </div>
    )
  }

  // ---- header/layout styles ----
  const titleStyle: CSSProperties = { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: narrow ? 32 : 44, lineHeight: 1, letterSpacing: '-0.01em' }
  const monthLabelStyle: CSSProperties = { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: narrow ? 24 : 30 }
  const panelTitleStyle: CSSProperties = { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: narrow ? 24 : 28, lineHeight: 1.1 }
  const navBtnStyle: CSSProperties = { width: narrow ? 44 : 38, height: narrow ? 44 : 38, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 16, cursor: 'pointer' }
  const lookupBtnStyle: CSSProperties = { padding: narrow ? '12px 16px' : '11px 18px', minHeight: narrow ? 44 : 0, borderRadius: 999, border: '1px solid #2B2620', background: '#2B2620', color: '#FBF7F1', fontSize: 13, fontWeight: 500, cursor: 'pointer' }
  const mainGridStyle: CSSProperties = { display: 'grid', gap: narrow ? 14 : 20, paddingTop: narrow ? 16 : 22, gridTemplateColumns: narrow ? '1fr' : 'minmax(0,1fr) 380px', alignItems: 'start' }
  const cardStyle: CSSProperties = { background: '#FFFDFA', border: '1px solid #E9E0D2', borderRadius: 18, padding: narrow ? '16px 14px 18px' : '22px 22px 26px' }
  const panelStyle: CSSProperties = {
    background: '#FFFDFA',
    border: '1px solid #E9E0D2',
    borderRadius: 18,
    padding: narrow ? '16px 14px 18px' : '22px 22px 24px',
    position: narrow ? 'static' : 'sticky',
    top: 24,
    maxHeight: narrow ? undefined : 'calc(100vh - 48px)',
    overflowY: narrow ? undefined : 'auto',
    scrollMarginTop: 12,
  }
  const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 14 }
  const blockBtnStyle: CSSProperties = { ...ghost, border: '1px solid ' + (selBlocked ? '#B7C4AE' : '#E0C4B8'), background: selBlocked ? '#F2F5EF' : '#FBF3EF', color: selBlocked ? '#5E7452' : '#94422A' }

  const tagline = isAdmin
    ? 'Yönetici görünümü — ayın tüm rezervasyonları, kapasiteleri ve kapalı günleri.'
    : 'Reformer seansları, her gün ' + HOURS_LABEL + '. Size uygun saati seçin.'
  const selectedSubline = selBlocked
    ? 'Stüdyo kapalı — bugün seans yok.'
    : showRemaining
      ? selStats.open + ' / ' + selStats.total + ' saat boş'
      : 'Saat başı seanslar, ' + HOURS_LABEL

  const formKicker = form ? (form.mode === 'edit' ? 'Rezervasyonu düzenle' : 'Yeni rezervasyon') : ''
  const formTitle = form ? timeLabel(form.time) : ''
  const formSubtitle = form
    ? DAYS[(new Date(form.date + 'T00:00:00').getDay() + 6) % 7] + ', ' + prettyDate(form.date) + ' · bir saatlik seans'
    : ''
  const formCta = busy
    ? 'Kaydediliyor…'
    : form && form.mode === 'edit'
      ? 'Değişiklikleri kaydet'
      : form && form.mode === 'admin-add'
        ? 'Misafir ekle'
        : 'Rezervasyonu onayla'

  const setField = (k: keyof Fields) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setF((prev) => ({ ...prev, [k]: v }))
    setFormError('')
  }

  // ---- admin: month bookings grouped by resident (name + villa) ----
  const summaryMap = new Map<string, { name: string; villa: string; count: number }>()
  if (isAdmin) {
    for (const b of store.monthBookings) {
      const gkey = b.villa.toUpperCase() + '|' + (b.first + ' ' + b.last).trim().toLocaleLowerCase('tr')
      const g = summaryMap.get(gkey)
      if (g) g.count += 1
      else summaryMap.set(gkey, { name: (b.first + ' ' + b.last).trim(), villa: b.villa.toUpperCase(), count: 1 })
    }
  }
  const summaryRows = Array.from(summaryMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'),
  )
  const summaryTotal = store.monthBookings.length

  return (
    <>
    <div className="no-print" style={{ minHeight: '100vh', background: '#F6F1E9', padding: '24px 20px 64px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 20, borderBottom: '1px solid #E4DACB' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#7E7367' }}>{config.communityName}</div>
            <div style={titleStyle}>{config.studioName}{isAdmin ? ' · Yönetim' : ''}</div>
            <div style={{ fontSize: 14, color: '#7E7367', maxWidth: '46ch', textWrap: 'pretty' }}>{tagline}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {!isAdmin && (
              <button onClick={openMine} style={lookupBtnStyle}>
                Rezervasyonlarım
              </button>
            )}
            {headerExtra}
          </div>
        </div>

        {store.error && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 12, background: '#F7E4DC', color: '#94422A', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>{store.error}</span>
            <button onClick={store.refresh} style={{ ...ghost, flexShrink: 0 }}>Tekrar dene</button>
          </div>
        )}

        {tabs?.({ narrow })}

        {replaceBody ? (
          <div style={{ paddingTop: narrow ? 16 : 22 }}>{replaceBody({ narrow })}</div>
        ) : (
        <>
        <div style={mainGridStyle}>
          {/* Calendar */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={monthLabelStyle}>{MONTHS[m] + ' ' + y}</div>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7E7367' }}>
                  {store.loading ? 'Yükleniyor…' : showRemaining ? mBooked + ' rezerve · ' + mOpen + ' boş' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={store.goToday} style={ghost}>Bugün</button>
                <button onClick={store.prevMonth} aria-label="Önceki ay" style={navBtnStyle}>‹</button>
                <button onClick={store.nextMonth} aria-label="Sonraki ay" style={navBtnStyle}>›</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, paddingBottom: 6 }}>
              {DAYS_SHORT.map((wd) => (
                <div key={wd} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7E7367', textAlign: 'center' }}>{wd}</div>
              ))}
            </div>

            <div
              aria-busy={store.loading}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, opacity: store.loading ? 0.45 : 1, pointerEvents: store.loading ? 'none' : undefined, transition: 'opacity 0.2s' }}
            >
              {cells.map((cell) =>
                cell.isDay ? (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={cell.onClick}
                    disabled={cell.disabled}
                    aria-label={cell.label}
                    aria-pressed={cell.selected}
                    style={cell.style}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                      <span style={cell.numStyle}>{cell.day}</span>
                      <span style={cell.dotStyle}></span>
                    </div>
                    {cell.count && (
                      <span style={{ marginTop: 'auto', fontSize: 10, letterSpacing: '0.06em', color: '#6E6357' }}>{cell.count}</span>
                    )}
                    {cell.markStyle && <span style={cell.markStyle}></span>}
                  </button>
                ) : (
                  <div key={cell.key} style={cell.style}></div>
                ),
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, paddingTop: 18, marginTop: 16, borderTop: '1px solid #F0E8DA' }}>
              {[
                { key: 'a', label: 'Boş saat var', style: { width: 10, height: 10, borderRadius: 3, background: '#FFFDFA', border: '1px solid #EDE4D6', display: 'inline-block' } as CSSProperties },
                { key: 'g', label: 'Dolu', style: { width: 10, height: 10, borderRadius: 3, background: '#F5EAE2', border: '1px solid #EAD9CC', display: 'inline-block' } as CSSProperties },
                { key: 'b', label: 'Geçmiş', style: { width: 10, height: 10, borderRadius: 3, background: '#F4EFE7', border: '1px solid #EDE6DA', display: 'inline-block' } as CSSProperties },
                { key: 'c', label: 'Stüdyo kapalı', style: { width: 10, height: 10, borderRadius: 3, background: 'repeating-linear-gradient(135deg,#F6F1E9,#F6F1E9 3px,#E9E0D2 3px,#E9E0D2 6px)', border: '1px solid #E9E0D2', display: 'inline-block' } as CSSProperties },
                ...(isAdmin
                  ? []
                  : [
                      { key: 'e', label: 'Rezervasyon var', style: { width: 16, height: 4, borderRadius: 999, background: '#8C8073', display: 'inline-block' } as CSSProperties },
                      { key: 'f', label: 'Rezervasyonunuz', style: { width: 16, height: 4, borderRadius: 999, background: accent, display: 'inline-block' } as CSSProperties },
                    ]),
                { key: 'd', label: 'Bugün', style: { width: 10, height: 10, borderRadius: 999, background: accent, display: 'inline-block' } as CSSProperties },
              ].map((lg) => (
                <div key={lg.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#7E7367' }}>
                  <span style={lg.style}></span>
                  {lg.label}
                </div>
              ))}
            </div>
          </div>

          {/* Day panel */}
          <div ref={panelRef} style={panelStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 14, borderBottom: '1px solid #EFE7DA' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7E7367' }}>{DAYS[(selDate.getDay() + 6) % 7]}</div>
              <div style={panelTitleStyle}>{prettyDate(sel)}</div>
              <div style={{ fontSize: 13, color: '#7E7367' }}>{selectedSubline}</div>
            </div>

            {isAdmin && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 0', borderBottom: '1px solid #EFE7DA' }}>
                <button onClick={() => store.toggleBlocked(sel)} style={blockBtnStyle}>{selBlocked ? 'Bu günü aç' : 'Bu günü kapat'}</button>
                <button onClick={() => setPrinting(true)} style={ghost}>Katılım listesini yazdır</button>
              </div>
            )}

            <div
              aria-busy={store.loading}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, opacity: store.loading ? 0.45 : 1, pointerEvents: store.loading ? 'none' : undefined, transition: 'opacity 0.2s' }}
            >
              {collapsePast && pastCount > 0 && (
                <button onClick={() => setShowPastSlots((v) => !v)} style={{ ...ghost, alignSelf: 'flex-start' }}>
                  {showPastSlots ? 'Geçmiş saatleri gizle' : pastCount + ' geçmiş saati göster'}
                </button>
              )}
              {visibleSlotRows.map((slot) => (
                <div key={slot.key} style={slot.rowStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: '0.01em' }}>{slot.timeLabel}</span>
                      <span style={slot.statusStyle}>{slot.statusText}</span>
                    </div>
                    {slot.metaText && <div style={{ fontSize: 12, color: '#6E6357' }}>{slot.metaText}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {slot.showCapacity && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                        <button onClick={() => store.setCapacity(sel, slot.key, -1)} aria-label={slot.timeLabel + ' kapasitesini azalt'} style={capBtnStyle}>–</button>
                        <span style={{ fontSize: 11, letterSpacing: '0.08em', color: '#6E6357', minWidth: 42, textAlign: 'center' }}>{slot.capLabel}</span>
                        <button onClick={() => store.setCapacity(sel, slot.key, 1)} aria-label={slot.timeLabel + ' kapasitesini artır'} style={capBtnStyle}>+</button>
                      </div>
                    )}
                    {renderAction(slot.action)}
                  </div>
                  {slot.bookings && (
                    <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {slot.bookings.map((b) => (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', padding: '8px 11px', borderRadius: 10, border: '1px solid #F0E8DA', background: '#FBF7F1' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>
                              {b.first} {b.last} <span style={{ fontWeight: 400, color: '#6E6357' }}>· Villa {b.villa}</span>
                            </span>
                            <span style={{ fontSize: 12, color: '#6E6357' }}>
                              {b.phone ? <a href={telHref(b.phone)}>{b.phone}</a> : 'telefon yok'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button onClick={() => editBooking(b)} style={miniBtn}>Düzenle</button>
                            <button onClick={() => askCancelAdmin(b)} style={miniDanger}>İptal et</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: '#7E7367', paddingTop: 14, textWrap: 'pretty' }}>
              {isAdmin
                ? 'Kapasite, ikili seanslar için 4 kişiye kadar çıkarılabilir. Buradan yapılan iptaller anında takvime yansır.'
                : 'Seansınıza ' + win + ' saat kalana kadar ücretsiz iptal. Sonrasında iptal için lütfen site yönetimi ile iletişime geçin.'}
            </div>
          </div>
        </div>

        {/* Admin: month summary grouped by resident */}
        {isAdmin && (
          <div style={{ ...cardStyle, marginTop: narrow ? 14 : 20 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingBottom: 14, borderBottom: '1px solid #F0E8DA' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7E7367' }}>Kişiye göre özet</div>
                <div style={monthLabelStyle}>{MONTHS[m] + ' ' + y}</div>
              </div>
              <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7E7367' }}>
                {store.loading ? 'Yükleniyor…' : summaryTotal + ' rezervasyon · ' + summaryRows.length + ' kişi'}
              </div>
            </div>
            {summaryRows.length === 0 ? (
              <div style={{ padding: '20px 6px', fontSize: 13, color: '#6E6357', textAlign: 'center' }}>
                {store.loading ? '' : 'Bu ay için rezervasyon yok.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, paddingTop: 14 }}>
                {summaryRows.map((r) => (
                  <div key={r.villa + '|' + r.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', border: '1px solid #EFE7DA', borderRadius: 12, background: '#FBF7F1' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: '#6E6357' }}>Villa {r.villa}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#6E6357', background: '#F0E8DA', borderRadius: 999, padding: '5px 11px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {r.count} seans
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </>
        )}

        {/* Booking form modal */}
        {!!form && (
          <Modal
            onClose={() => {
              setForm(null)
              setFormError('')
            }}
            closable={!busy}
            label={formKicker + ' · ' + formTitle}
            maxWidth={470}
            zIndex={40}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7E7367' }}>{formKicker}</div>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1 }}>{formTitle}</div>
              <div style={{ fontSize: 13, color: '#7E7367' }}>{formSubtitle}</div>
            </div>
            {isAdmin ? (
              <div style={formGridStyle}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelSpan}>Ad *</span>
                  <input className="dc-field" value={f.first} onChange={setField('first')} placeholder="Selin" style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelSpan}>Soyad *</span>
                  <input className="dc-field" value={f.last} onChange={setField('last')} placeholder="Kaya" style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelSpan}>Villa numarası * ({MIN_VILLA}–{MAX_VILLA})</span>
                  <input className="dc-field" value={f.villa} onChange={setField('villa')} placeholder="343" inputMode="numeric" style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelSpan}>Telefon (opsiyonel)</span>
                  <input className="dc-field" value={f.phone} onChange={setField('phone')} placeholder="+90 532 000 00 00" autoComplete="tel" style={inputStyle} />
                </label>
              </div>
            ) : (
              // Residents book as themselves; the server takes the name and
              // villa from their account, so only the phone stays editable.
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '13px 15px', borderRadius: 12, border: '1px solid #EFE7DA', background: '#FBF7F1' }}>
                  <span style={labelSpan}>Rezervasyon sahibi</span>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{f.first} {f.last}</span>
                  <span style={{ fontSize: 12, color: '#6E6357' }}>Villa {f.villa}</span>
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelSpan}>Telefon (opsiyonel)</span>
                  <input className="dc-field" value={f.phone} onChange={setField('phone')} placeholder="+90 532 000 00 00" autoComplete="tel" style={inputStyle} />
                </label>
              </div>
            )}
            {!!formError && (
              <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 10, background: '#F7E4DC', color: '#94422A', fontSize: 13 }}>{formError}</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 20, flexWrap: 'wrap' }}>
              <button
                className="dc-btn-ghost"
                onClick={() => {
                  setForm(null)
                  setFormError('')
                }}
                disabled={busy}
                style={{ padding: '14px 20px', minHeight: 46, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                Vazgeç
              </button>
              <button
                className="dc-btn-primary"
                onClick={submit}
                disabled={busy}
                style={{ padding: '14px 24px', minHeight: 46, borderRadius: 999, border: '1px solid #B0674C', background: '#B0674C', color: '#FFFDFA', fontSize: 13, fontWeight: 500, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
              >
                {formCta}
              </button>
            </div>
          </Modal>
        )}

        {/* Resident "my bookings" modal */}
        {mineOpen && (
          <Modal onClose={() => setMineOpen(false)} label="Seanslarınız" maxWidth={520} zIndex={40}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7E7367' }}>
                  {resident ? 'Villa ' + resident.villa : 'Rezervasyonlarım'}
                </div>
                <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1 }}>Seanslarınız</div>
                <div style={{ fontSize: 13, color: '#7E7367' }}>Seansınıza {win} saat kalana kadar buradan ücretsiz iptal edebilirsiniz.</div>
              </div>
              <button
                type="button"
                aria-label="Kapat"
                onClick={() => setMineOpen(false)}
                style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 17, cursor: 'pointer', flexShrink: 0 }}
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mineUpcoming.map((b) => mineRow(b, false))}
              {mineUpcoming.length === 0 && (
                <div style={{ padding: 18, border: '1px dashed #E4DACB', borderRadius: 12, fontSize: 13, color: '#6E6357', textAlign: 'center' }}>
                  {store.loading ? 'Yükleniyor…' : 'Yaklaşan bir rezervasyonunuz yok.'}
                </div>
              )}
              {minePast.length > 0 && (
                <>
                  <button onClick={() => setShowPastMine((v) => !v)} style={{ ...ghost, alignSelf: 'flex-start', marginTop: 6 }}>
                    {showPastMine ? 'Geçmiş seansları gizle' : 'Geçmiş seanslar (' + minePast.length + ')'}
                  </button>
                  {showPastMine && minePast.map((b) => mineRow(b, true))}
                </>
              )}
            </div>
          </Modal>
        )}

        {/* Resident cancellation — confirm before releasing the slot */}
        {!!confirmCancel && (
          <Modal onClose={() => !busy && setConfirmCancel(null)} closable={!busy} label="Rezervasyonu iptal et" maxWidth={440} zIndex={45}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 14 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7E7367' }}>Rezervasyonu iptal et</div>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1 }}>{timeLabel(confirmCancel.time)}</div>
              <div style={{ fontSize: 13, color: '#7E7367' }}>{mineWhen(confirmCancel)}</div>
            </div>
            <div style={{ fontSize: 13, color: '#6E6357', textWrap: 'pretty' }}>
              Seansınız iptal edilecek ve saat yeniden rezervasyona açılacak. Bu işlem geri alınamaz.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 20, flexWrap: 'wrap' }}>
              <button
                className="dc-btn-ghost"
                onClick={() => setConfirmCancel(null)}
                disabled={busy}
                style={{ padding: '14px 20px', minHeight: 46, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                Vazgeç
              </button>
              <button
                onClick={confirmCancelMine}
                disabled={busy}
                style={{ padding: '14px 24px', minHeight: 46, borderRadius: 999, border: '1px solid #94422A', background: '#94422A', color: '#FFFDFA', fontSize: 13, fontWeight: 500, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
              >
                {busy ? 'İptal ediliyor…' : 'Seansı iptal et'}
              </button>
            </div>
          </Modal>
        )}

        {/* Admin cancellation — reason required */}
        {!!cancelling && (
          <Modal onClose={() => !busy && setCancelling(null)} closable={!busy} label="Seansı iptal et" maxWidth={460} zIndex={45}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 16 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7E7367' }}>Seansı iptal et</div>
              <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1 }}>{timeLabel(cancelling.time)}</div>
              <div style={{ fontSize: 13, color: '#7E7367' }}>
                {prettyDate(cancelling.date)} · {cancelling.first} {cancelling.last} · Villa {cancelling.villa}
              </div>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelSpan}>İptal nedeni *</span>
              <textarea
                className="dc-field"
                value={cancelReason}
                onChange={(e) => {
                  setCancelReason(e.target.value)
                  setCancelError('')
                }}
                rows={3}
                placeholder="Eğitmen rahatsızlandı, seans ileri bir tarihe alınacak."
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>
            <div style={{ fontSize: 12, color: '#7E7367', paddingTop: 8, textWrap: 'pretty' }}>
              {cancelling.residentId
                ? 'Bu not, sakin siteye giriş yaptığında kendisine gösterilir.'
                : 'Bu misafirin hesabı yok — not yalnızca kayıt için tutulur.'}
            </div>
            {!!cancelError && (
              <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 10, background: '#F7E4DC', color: '#94422A', fontSize: 13 }}>{cancelError}</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 20, flexWrap: 'wrap' }}>
              <button
                className="dc-btn-ghost"
                onClick={() => setCancelling(null)}
                disabled={busy}
                style={{ padding: '14px 20px', minHeight: 46, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                Vazgeç
              </button>
              <button
                onClick={confirmCancelAdmin}
                disabled={busy}
                style={{ padding: '14px 24px', minHeight: 46, borderRadius: 999, border: '1px solid #94422A', background: '#94422A', color: '#FFFDFA', fontSize: 13, fontWeight: 500, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
              >
                {busy ? 'İptal ediliyor…' : 'Seansı iptal et'}
              </button>
            </div>
          </Modal>
        )}

        {/* Toast */}
        {!!toast && (
          <div role="status" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', background: '#2B2620', color: '#FBF7F1', padding: '13px 22px', borderRadius: 999, fontSize: 13, zIndex: 60, maxWidth: '88vw', textAlign: 'center', animation: 'riseIn 0.2s ease both' }}>{toast}</div>
        )}
      </div>
    </div>

    {/* Attendance sheet — rendered only for the print dialog */}
    {printing && (
      <div className="print-sheet">
        <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>{config.studioName} — Katılım listesi</h1>
        <div style={{ fontSize: 13, margin: '0 0 14px' }}>
          {DAYS[(selDate.getDay() + 6) % 7]}, {prettyDate(sel)}
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 110 }}>Saat</th>
              <th>Katılımcılar</th>
              <th style={{ width: 70 }}>Doluluk</th>
            </tr>
          </thead>
          <tbody>
            {times().map((t) => {
              const list = store.bookingsAt(sel, t) ?? []
              return (
                <tr key={t}>
                  <td>{timeLabel(t)}</td>
                  <td>
                    {list.length === 0
                      ? '—'
                      : list.map((b) => (
                          <div key={b.id}>
                            {b.first} {b.last} · Villa {b.villa}
                            {b.phone ? ' · ' + b.phone : ''}
                          </div>
                        ))}
                  </td>
                  <td>{list.length + ' / ' + store.capacityOf(sel, t)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )}
    </>
  )
}
