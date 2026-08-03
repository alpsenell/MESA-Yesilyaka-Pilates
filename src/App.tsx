import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import {
  DAYS,
  DAYS_SHORT,
  MONTHS,
  iso,
  now,
  prettyDate,
  slotStart,
  timeLabel,
  times,
  type Booking,
} from './pilates'
import type { StudioStore } from './useStudio'

interface Chip {
  key: string
  label: string
  style: CSSProperties
  onClick: (e: MouseEvent) => void
}

interface Cell {
  key: string
  isDay: boolean
  style: CSSProperties
  day?: number
  chips?: Chip[]
  statusText?: string
  numStyle?: CSSProperties
  dotStyle?: CSSProperties
  statusStyle?: CSSProperties
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

export default function App({ store, headerExtra }: { store: StudioStore; headerExtra?: ReactNode }) {
  const { config } = store
  const isAdmin = store.role === 'admin'

  const [layout, setLayout] = useState<'overview' | 'expanded'>('overview')
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1400))
  const [form, setForm] = useState<FormState | null>(null)
  const [f, setF] = useState<Fields>({ first: '', last: '', villa: '', phone: '' })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lookupOpen, setLookupOpen] = useState(false)
  const [lookupVilla, setLookupVilla] = useState('')
  const [lookupResults, setLookupResults] = useState<Booking[] | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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

  const showRemaining = config.showRemaining ?? true
  const accent = config.accentColor ?? '#B0674C'
  const win = config.cancelWindowHours ?? 12
  const narrow = w < 900
  const expanded = layout === 'expanded' && !narrow

  const sel = store.selected
  const y = store.year
  const m = store.month

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
    setForm({ date, time, mode: isAdmin ? 'admin-add' : 'book' })
    setF({ first: '', last: '', villa: '', phone: '' })
    setFormError('')
  }
  function editBooking(b: Booking) {
    setForm({ date: b.date, time: b.time, mode: 'edit', id: b.id })
    setF({ first: b.first, last: b.last, villa: b.villa, phone: b.phone })
    setFormError('')
  }
  async function submit() {
    if (!form) return
    if (!f.first.trim() || !f.last.trim() || !f.villa.trim()) {
      setFormError('Ad, soyad ve villa numarası zorunludur.')
      return
    }
    setBusy(true)
    const input = { date: form.date, time: form.time, first: f.first, last: f.last, villa: f.villa, phone: f.phone }
    const res = form.mode === 'edit' ? await store.updateBooking(form.id!, input) : await store.book(input)
    setBusy(false)
    if (res.ok) {
      setForm(null)
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
  async function cancelAdmin(b: Booking) {
    const res = await store.cancel(b, true)
    say(res.ok ? 'Seans iptal edildi.' : res.error)
  }
  async function doLookup(villa: string) {
    const v = villa.trim()
    if (!v) {
      setLookupResults(null)
      return
    }
    setLookupLoading(true)
    try {
      const rows = await store.lookupVilla(v)
      setLookupResults(rows)
    } catch {
      setLookupResults([])
    } finally {
      setLookupLoading(false)
    }
  }
  async function cancelMine(b: Booking) {
    const res = await store.cancel(b, false)
    if (res.ok) {
      say('Seans serbest bırakıldı. Haber verdiğiniz için teşekkürler.')
      doLookup(lookupVilla)
    } else {
      say(res.error)
    }
  }

  // ---- styles ----
  const tab = (on: boolean): CSSProperties => ({
    padding: narrow ? '9px 13px' : '10px 18px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontSize: narrow ? 12 : 13,
    fontWeight: 500,
    background: on ? '#FFFDFA' : 'transparent',
    color: on ? '#2B2620' : '#8C8073',
    boxShadow: on ? '0 1px 3px rgba(43,38,32,0.10)' : 'none',
  })
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
  const inputStyle: CSSProperties = { padding: 13, borderRadius: 10, border: '1px solid #E4DACB', background: '#FBF7F1', fontSize: 15, color: '#2B2620', outline: 'none' }
  const labelSpan: CSSProperties = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8C8073' }

  // ---- calendar cells ----
  const first = new Date(y, m, 1)
  const startPad = (first.getDay() + 6) % 7
  const daysIn = new Date(y, m + 1, 0).getDate()
  const cellH = narrow ? 58 : expanded ? 132 : 92
  const cells: Cell[] = []
  for (let i = 0; i < startPad; i++) cells.push({ key: 'p' + i, isDay: false, style: { minHeight: cellH } })
  const nowD = now()
  const todayIso = iso(nowD.getFullYear(), nowD.getMonth(), nowD.getDate())
  for (let d = 1; d <= daysIn; d++) {
    const dIso = iso(y, m, d)
    const isPast = new Date(dIso + 'T23:59:59') < nowD
    const isBlocked = store.isBlocked(dIso)
    const st = dayStats(dIso)
    const isSel = dIso === sel
    const full = st.open === 0 && !isBlocked
    const clickable = isAdmin || (!isPast && !isBlocked)
    const style: CSSProperties = {
      minHeight: cellH,
      padding: narrow ? '6px 5px' : '10px 11px',
      borderRadius: 12,
      cursor: clickable ? 'pointer' : 'default',
      border: isSel ? '1px solid ' + accent : '1px solid ' + (isBlocked ? '#EFE7DA' : '#EDE4D6'),
      background: isBlocked
        ? 'repeating-linear-gradient(135deg,#F6F1E9,#F6F1E9 6px,#F1EADF 6px,#F1EADF 12px)'
        : isSel
          ? '#FBF3ED'
          : isPast
            ? '#FAF7F1'
            : '#FFFDFA',
      boxShadow: isSel ? '0 0 0 3px rgba(176,103,76,0.10)' : 'none',
      opacity: isPast && !isAdmin ? 0.5 : 1,
      transition: 'background 0.15s, border-color 0.15s',
      overflow: 'hidden',
    }
    const chips: Chip[] = []
    if (expanded && !isBlocked && (!isPast || isAdmin)) {
      const open = times().filter(
        (t) => store.capacityOf(dIso, t) - store.bookedCount(dIso, t) > 0 && (isAdmin || slotStart(dIso, t) > nowD),
      )
      open.slice(0, 4).forEach((t) =>
        chips.push({
          key: t,
          label: t.replace(':', '.'),
          style: { padding: '3px 7px', borderRadius: 7, border: '1px solid #EAE0D0', background: '#FBF7F1', color: '#6E6357', fontSize: 11, cursor: 'pointer' },
          onClick: (e) => {
            e.stopPropagation()
            store.setSelected(dIso)
            openBooking(dIso, t)
          },
        }),
      )
      if (open.length > 4)
        chips.push({
          key: 'more',
          label: '+' + (open.length - 4),
          style: { padding: '3px 7px', borderRadius: 7, border: '1px dashed #E4DACB', background: 'transparent', color: '#A79A8B', fontSize: 11, cursor: 'pointer' },
          onClick: (e) => {
            e.stopPropagation()
            store.setSelected(dIso)
          },
        })
    }
    let statusText: string
    let statusColor: string
    if (isBlocked) {
      statusText = narrow ? 'kapalı' : 'Stüdyo kapalı'
      statusColor = '#A79A8B'
    } else if (isPast) {
      statusText = narrow ? '' : st.booked + ' seans'
      statusColor = '#A79A8B'
    } else if (full) {
      statusText = narrow ? 'dolu' : 'Tamamen dolu'
      statusColor = '#94422A'
    } else {
      statusText = narrow ? st.open + ' boş' : showRemaining ? st.open + ' / ' + st.total + ' boş' : 'Uygun'
      statusColor = '#6E6357'
    }
    cells.push({
      key: dIso,
      isDay: true,
      day: d,
      chips,
      statusText,
      numStyle: { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: narrow ? 16 : 20, color: dIso === todayIso ? accent : '#2B2620' },
      dotStyle: { width: 6, height: 6, borderRadius: 999, background: dIso === todayIso ? accent : 'transparent', display: 'inline-block' },
      statusStyle: { fontSize: narrow ? 9 : 11, letterSpacing: '0.02em', color: statusColor },
      style,
      onClick: () => {
        if (clickable) store.setSelected(dIso)
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

  // ---- day-panel slots ----
  const slotRows = times().map((t) => {
    const cp = store.capacityOf(sel, t)
    const cnt = store.bookedCount(sel, t)
    const open = cp - cnt
    const past = slotStart(sel, t) <= nowD
    const bk = store.bookingsAt(sel, t) // null for residents
    const holder = bk && bk[0]

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
      color: open > 0 && !selBlocked && !past ? '#7E9A72' : '#A79A8B',
    }

    let statusText: string
    let metaText: string
    let actionLabel: string
    let actionStyle: CSSProperties
    let onAction: () => void = () => {}
    let showSecondary = false
    let onSecondary: () => void = () => {}

    if (selBlocked) {
      statusText = 'Kapalı'
      metaText = 'Bakım / tatil'
      actionLabel = '—'
      actionStyle = { ...actBase, border: '1px solid #EFE7DA', background: 'transparent', color: '#C0B5A6', cursor: 'default' }
    } else if (isAdmin && bk && bk.length) {
      statusText = open > 0 ? open + ' yer kaldı' : 'Rezerve'
      metaText = bk
        .map((b) => b.first + ' ' + b.last + ' · Villa ' + b.villa + (b.phone ? ' · ' + b.phone : ' · telefon yok'))
        .join('  |  ')
      showSecondary = true
      onSecondary = () => holder && editBooking(holder)
      actionLabel = 'İptal et'
      actionStyle = { ...actBase, border: '1px solid #E0C4B8', background: '#FBF3EF', color: '#94422A', cursor: 'pointer' }
      onAction = () => holder && cancelAdmin(holder)
    } else if (isAdmin) {
      statusText = past ? 'Geçti' : 'Boş'
      metaText = past ? 'Rezervasyon yok' : 'Birebir seans, bir saat'
      actionLabel = 'Misafir ekle'
      actionStyle = { ...actBase, border: '1px solid ' + accent, background: '#FFFDFA', color: accent, cursor: 'pointer' }
      onAction = () => openBooking(sel, t)
    } else {
      // resident — counts only, no PII, no cross-resident cancel
      if (past) {
        statusText = 'Geçti'
        metaText = 'Geçmiş seans'
        actionLabel = 'Geçti'
        actionStyle = { ...actBase, border: '1px solid #EFE7DA', background: 'transparent', color: '#C0B5A6', cursor: 'default' }
      } else if (open > 0) {
        statusText = showRemaining ? open + ' yer boş' : 'Boş'
        metaText = 'Birebir seans, bir saat'
        actionLabel = 'Rezerve et'
        actionStyle = { ...actBase, border: '1px solid ' + accent, background: accent, color: '#FFFDFA', cursor: 'pointer' }
        onAction = () => openBooking(sel, t)
      } else {
        statusText = 'Dolu'
        metaText = 'Bu saat dolu'
        actionLabel = 'Dolu'
        actionStyle = { ...actBase, border: '1px solid #EFE7DA', background: 'transparent', color: '#C0B5A6', cursor: 'default' }
      }
    }

    return {
      key: t,
      timeLabel: timeLabel(t),
      rowStyle,
      statusStyle,
      statusText,
      metaText,
      showCapacity: isAdmin && !selBlocked,
      capLabel: cnt + '/' + cp,
      capBtnStyle: { width: narrow ? 34 : 26, height: narrow ? 34 : 26, borderRadius: 8, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#6E6357', fontSize: 14, cursor: 'pointer' } as CSSProperties,
      onCapUp: () => store.setCapacity(sel, t, 1),
      onCapDown: () => store.setCapacity(sel, t, -1),
      showSecondary,
      onSecondary,
      secondaryStyle: { ...actBase, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', cursor: 'pointer' } as CSSProperties,
      actionLabel,
      actionStyle,
      onAction,
    }
  })

  // ---- lookup (resident "my bookings") ----
  const lookupRows: MyBookingRow[] = (lookupResults ?? []).map((b) => {
    const past = slotStart(b.date, b.time) <= nowD
    const soon = ((slotStart(b.date, b.time).getTime() - nowD.getTime()) / 3600000) < win
    return {
      key: b.id,
      when:
        DAYS[(new Date(b.date + 'T00:00:00').getDay() + 6) % 7] + ', ' + prettyDate(b.date) + ' · ' + timeLabel(b.time),
      who: b.first + ' ' + b.last + ' · Villa ' + b.villa + (b.phone ? ' · ' + b.phone : ''),
      cancelLabel: past ? 'Tamamlandı' : soon ? 'Stüdyoyu arayın' : 'İptal et',
      cancelStyle: {
        ...actBase,
        border: '1px solid ' + (past || soon ? '#EFE7DA' : '#E0C4B8'),
        background: past || soon ? 'transparent' : '#FBF3EF',
        color: past || soon ? '#B3A897' : '#94422A',
        cursor: past || soon ? 'default' : 'pointer',
        flexShrink: 0,
      },
      onCancel: () => {
        if (!past && !soon) cancelMine(b)
      },
    }
  })

  // ---- header/layout styles ----
  const titleStyle: CSSProperties = { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: narrow ? 32 : 44, lineHeight: 1, letterSpacing: '-0.01em' }
  const monthLabelStyle: CSSProperties = { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: narrow ? 24 : 30 }
  const panelTitleStyle: CSSProperties = { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: narrow ? 24 : 28, lineHeight: 1.1 }
  const navBtnStyle: CSSProperties = { width: narrow ? 44 : 38, height: narrow ? 44 : 38, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 16, cursor: 'pointer' }
  const layoutTabsStyle: CSSProperties = { display: narrow ? 'none' : 'flex', gap: 2, padding: 3, background: '#EFE7DA', borderRadius: 999 }
  const lookupBtnStyle: CSSProperties = { padding: narrow ? '12px 16px' : '11px 18px', minHeight: narrow ? 44 : 0, borderRadius: 999, border: '1px solid #2B2620', background: '#2B2620', color: '#FBF7F1', fontSize: 13, fontWeight: 500, cursor: 'pointer' }
  const mainGridStyle: CSSProperties = { display: 'grid', gap: narrow ? 14 : 20, paddingTop: narrow ? 16 : 22, gridTemplateColumns: narrow ? '1fr' : expanded ? '1fr' : 'minmax(0,1fr) 380px', alignItems: 'start' }
  const cardStyle: CSSProperties = { background: '#FFFDFA', border: '1px solid #E9E0D2', borderRadius: 18, padding: narrow ? '16px 14px 18px' : '22px 22px 26px' }
  const panelStyle: CSSProperties = { background: '#FFFDFA', border: '1px solid #E9E0D2', borderRadius: 18, padding: narrow ? '16px 14px 18px' : '22px 22px 24px', position: narrow || expanded ? 'static' : 'sticky', top: 24 }
  const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 14 }
  const blockBtnStyle: CSSProperties = { ...ghost, border: '1px solid ' + (selBlocked ? '#B7C4AE' : '#E0C4B8'), background: selBlocked ? '#F2F5EF' : '#FBF3EF', color: selBlocked ? '#5E7452' : '#94422A' }

  const tagline = isAdmin
    ? 'Yönetici görünümü — ayın tüm rezervasyonları, kapasiteleri ve kapalı günleri.'
    : 'Birebir reformer seansları, her gün 08.00 – 20.00. Size uygun saati seçin.'
  const selectedSubline = selBlocked
    ? 'Stüdyo kapalı — bugün seans yok.'
    : showRemaining
      ? selStats.open + ' / ' + selStats.total + ' saat boş'
      : 'Saat başı seanslar, 08.00 – 20.00'
  const policyNote = isAdmin
    ? 'Kapasite, ikili seanslar için 4 kişiye kadar çıkarılabilir. Buradan yapılan iptaller anında takvime yansır.'
    : 'Seansınıza ' + win + ' saat kalana kadar ücretsiz iptal. Sonrasında lütfen stüdyoyu arayın: ' + (config.studioPhone ?? '') + '.'

  const formKicker = form ? (form.mode === 'edit' ? 'Rezervasyonu düzenle' : 'Yeni rezervasyon') : ''
  const formTitle = form ? timeLabel(form.time) : ''
  const formSubtitle = form
    ? DAYS[(new Date(form.date + 'T00:00:00').getDay() + 6) % 7] + ', ' + prettyDate(form.date) + ' · birebir seans'
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

  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E9', padding: '24px 20px 64px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 20, borderBottom: '1px solid #E4DACB' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9C9083' }}>{config.communityName}</div>
            <div style={titleStyle}>{config.studioName}{isAdmin ? ' · Yönetim' : ''}</div>
            <div style={{ fontSize: 14, color: '#7E7367', maxWidth: '46ch', textWrap: 'pretty' }}>{tagline}</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div style={layoutTabsStyle}>
              <button onClick={() => setLayout('overview')} style={tab(!expanded)}>Genel bakış</button>
              <button onClick={() => setLayout('expanded')} style={tab(expanded)}>Detaylı</button>
            </div>
            {!isAdmin && (
              <button
                onClick={() => {
                  setLookupOpen(true)
                  setLookupResults(null)
                  setLookupVilla('')
                }}
                style={lookupBtnStyle}
              >
                Rezervasyonlarım
              </button>
            )}
            {headerExtra}
          </div>
        </div>

        {store.error && (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 12, background: '#F7E4DC', color: '#94422A', fontSize: 13 }}>
            {store.error}
          </div>
        )}

        <div style={mainGridStyle}>
          {/* Calendar */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={monthLabelStyle}>{MONTHS[m] + ' ' + y}</div>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9C9083' }}>
                  {store.loading ? 'Yükleniyor…' : mBooked + ' rezerve · ' + mOpen + ' boş'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={store.prevMonth} style={navBtnStyle}>‹</button>
                <button onClick={store.nextMonth} style={navBtnStyle}>›</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, paddingBottom: 6 }}>
              {DAYS_SHORT.map((wd) => (
                <div key={wd} style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A79A8B', textAlign: 'center' }}>{wd}</div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {cells.map((cell) => (
                <div key={cell.key} onClick={cell.onClick} style={cell.style}>
                  {cell.isDay && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                        <span style={cell.numStyle}>{cell.day}</span>
                        <span style={cell.dotStyle}></span>
                      </div>
                      <div style={cell.statusStyle}>{cell.statusText}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 'auto' }}>
                        {cell.chips?.map((chip) => (
                          <button key={chip.key} onClick={chip.onClick} style={chip.style}>{chip.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, paddingTop: 18, marginTop: 16, borderTop: '1px solid #F0E8DA' }}>
              {[
                { key: 'a', label: 'Boş saat var', style: { width: 10, height: 10, borderRadius: 3, background: '#FFFDFA', border: '1px solid #EDE4D6', display: 'inline-block' } as CSSProperties },
                { key: 'b', label: 'Tamamen dolu', style: { width: 10, height: 10, borderRadius: 3, background: '#FBF6F1', border: '1px solid #E0C4B8', display: 'inline-block' } as CSSProperties },
                { key: 'c', label: 'Stüdyo kapalı', style: { width: 10, height: 10, borderRadius: 3, background: 'repeating-linear-gradient(135deg,#F6F1E9,#F6F1E9 3px,#E9E0D2 3px,#E9E0D2 6px)', border: '1px solid #E9E0D2', display: 'inline-block' } as CSSProperties },
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
          <div style={panelStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 14, borderBottom: '1px solid #EFE7DA' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A79A8B' }}>{DAYS[(selDate.getDay() + 6) % 7]}</div>
              <div style={panelTitleStyle}>{prettyDate(sel)}</div>
              <div style={{ fontSize: 13, color: '#7E7367' }}>{selectedSubline}</div>
            </div>

            {isAdmin && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '14px 0', borderBottom: '1px solid #EFE7DA' }}>
                <button onClick={() => store.toggleBlocked(sel)} style={blockBtnStyle}>{selBlocked ? 'Bu günü aç' : 'Bu günü kapat'}</button>
                <button onClick={() => say(prettyDate(sel) + ' katılım listesi ön büro yazıcısına gönderildi.')} style={ghost}>Katılım listesi</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14 }}>
              {slotRows.map((slot) => (
                <div key={slot.key} style={slot.rowStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: '0.01em' }}>{slot.timeLabel}</span>
                      <span style={slot.statusStyle}>{slot.statusText}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#8C8073' }}>{slot.metaText}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {slot.showCapacity && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 4 }}>
                        <button onClick={slot.onCapDown} style={slot.capBtnStyle}>–</button>
                        <span style={{ fontSize: 11, letterSpacing: '0.08em', color: '#8C8073', minWidth: 42, textAlign: 'center' }}>{slot.capLabel}</span>
                        <button onClick={slot.onCapUp} style={slot.capBtnStyle}>+</button>
                      </div>
                    )}
                    {slot.showSecondary && <button onClick={slot.onSecondary} style={slot.secondaryStyle}>Düzenle</button>}
                    <button onClick={slot.onAction} style={slot.actionStyle}>{slot.actionLabel}</button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: '#9C9083', paddingTop: 14, textWrap: 'pretty' }}>{policyNote}</div>
          </div>
        </div>

        {/* Booking form modal */}
        {!!form && (
          <div
            onClick={() => {
              if (busy) return
              setForm(null)
              setFormError('')
            }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(43, 38, 32, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 40 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 470, background: '#FFFDFA', borderRadius: 20, padding: 26, animation: 'riseIn 0.22s ease both', maxHeight: '92vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 18 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A79A8B' }}>{formKicker}</div>
                <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1 }}>{formTitle}</div>
                <div style={{ fontSize: 13, color: '#7E7367' }}>{formSubtitle}</div>
              </div>
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
                  <span style={labelSpan}>Villa numarası *</span>
                  <input className="dc-field" value={f.villa} onChange={setField('villa')} placeholder="B-14" style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={labelSpan}>Telefon (opsiyonel)</span>
                  <input className="dc-field" value={f.phone} onChange={setField('phone')} placeholder="+90 532 000 00 00" style={inputStyle} />
                </label>
              </div>
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
            </div>
          </div>
        )}

        {/* Resident lookup modal */}
        {lookupOpen && (
          <div onClick={() => setLookupOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(43, 38, 32, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 40 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: '#FFFDFA', borderRadius: 20, padding: 26, animation: 'riseIn 0.22s ease both', maxHeight: '92vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A79A8B' }}>Rezervasyon bul</div>
                <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1 }}>Villanızın seansları</div>
                <div style={{ fontSize: 13, color: '#7E7367' }}>Yaklaşan seanslarınızı görmek ve iptal etmek için villa numaranızı girin.</div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  doLookup(lookupVilla)
                }}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 180 }}>
                  <span style={labelSpan}>Villa numarası</span>
                  <input className="dc-field" value={lookupVilla} onChange={(e) => setLookupVilla(e.target.value)} placeholder="B-14" style={inputStyle} />
                </label>
                <button type="submit" style={lookupBtnStyle}>{lookupLoading ? 'Aranıyor…' : 'Bul'}</button>
                <button type="button" className="dc-btn-ghost" onClick={() => setLookupOpen(false)} style={{ padding: '14px 20px', minHeight: 46, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 13, cursor: 'pointer' }}>Kapat</button>
              </form>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
                {lookupRows.map((b) => (
                  <div key={b.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', border: '1px solid #EFE7DA', borderRadius: 12, background: '#FBF7F1', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{b.when}</div>
                      <div style={{ fontSize: 12, color: '#8C8073' }}>{b.who}</div>
                    </div>
                    <button onClick={b.onCancel} style={b.cancelStyle}>{b.cancelLabel}</button>
                  </div>
                ))}
                {lookupResults !== null && lookupResults.length === 0 && !lookupLoading && (
                  <div style={{ padding: 18, border: '1px dashed #E4DACB', borderRadius: 12, fontSize: 13, color: '#8C8073', textAlign: 'center' }}>
                    {lookupVilla.trim() ? lookupVilla.trim().toUpperCase() + ' villası için seans bulunamadı.' : 'Villa numaranızı girin.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {!!toast && (
          <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', background: '#2B2620', color: '#FBF7F1', padding: '13px 22px', borderRadius: 999, fontSize: 13, zIndex: 60, maxWidth: '88vw', textAlign: 'center', animation: 'riseIn 0.2s ease both' }}>{toast}</div>
        )}
      </div>
    </div>
  )
}

interface MyBookingRow {
  key: string
  when: string
  who: string
  cancelLabel: string
  cancelStyle: CSSProperties
  onCancel: () => void
}
