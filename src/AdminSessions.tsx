import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { fetchUpcomingBookings } from './api'
import { DAYS, prettyDate, slotStart, timeLabel, now, type Booking } from './pilates'

const inputStyle: CSSProperties = { padding: 11, borderRadius: 10, border: '1px solid #E4DACB', background: '#FBF7F1', fontSize: 14, color: '#2B2620', outline: 'none' }
const smallBtn: CSSProperties = { padding: '9px 14px', minHeight: 38, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 12, cursor: 'pointer' }

interface Person {
  key: string
  name: string
  villa: string
  phone: string
  isGuest: boolean
  bookings: Booking[]
}

/**
 * "Who is coming" — every resident holding an upcoming session, nearest first.
 * This is the admin's default view: the calendar answers "what does Thursday
 * look like", this answers "who do I expect".
 */
export default function AdminSessions({
  narrow,
  onOpenDate,
}: {
  narrow: boolean
  /** Jump to a date on the calendar tab. */
  onOpenDate: (date: string) => void
}) {
  const [rows, setRows] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchUpcomingBookings())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Seanslar yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Group by account; guests added by an admin have none, so they group by
  // villa + name instead and are labelled as guests.
  const nowD = now()
  const people = new Map<string, Person>()
  for (const b of rows) {
    if (slotStart(b.date, b.time) <= nowD) continue
    const key = b.residentId ?? `guest|${b.villa.toUpperCase()}|${(b.first + b.last).toLocaleLowerCase('tr')}`
    const p = people.get(key)
    if (p) p.bookings.push(b)
    else
      people.set(key, {
        key,
        name: (b.first + ' ' + b.last).trim(),
        villa: b.villa,
        phone: b.phone,
        isGuest: !b.residentId,
        bookings: [b],
      })
  }

  const q = query.trim().toLocaleLowerCase('tr')
  const visible = Array.from(people.values())
    .filter((p) => !q || (p.name + ' ' + p.villa + ' ' + p.phone).toLocaleLowerCase('tr').includes(q))
    .sort((a, b) => (a.bookings[0].date + a.bookings[0].time).localeCompare(b.bookings[0].date + b.bookings[0].time))

  const totalSessions = visible.reduce((n, p) => n + p.bookings.length, 0)
  const whenLabel = (b: Booking) =>
    DAYS[(new Date(b.date + 'T00:00:00').getDay() + 6) % 7] + ', ' + prettyDate(b.date) + ' · ' + timeLabel(b.time)

  return (
    <div style={{ background: '#FFFDFA', border: '1px solid #E9E0D2', borderRadius: 18, padding: narrow ? '16px 14px 18px' : '22px 22px 26px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingBottom: 14, borderBottom: '1px solid #F0E8DA' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A79A8B' }}>Seansı olan üyeler</div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: narrow ? 24 : 30 }}>
            {loading ? 'Yükleniyor…' : visible.length + ' kişi · ' + totalSessions + ' seans'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: narrow ? '100%' : undefined }}>
          <input
            className="dc-field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ad veya villa ara…"
            style={{ ...inputStyle, flex: 1, minWidth: narrow ? 0 : 220 }}
          />
          <button onClick={load} style={smallBtn}>Yenile</button>
        </div>
      </div>

      {!!error && (
        <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 10, background: '#F7E4DC', color: '#94422A', fontSize: 13 }}>{error}</div>
      )}

      {!loading && visible.length === 0 && (
        <div style={{ padding: '22px 6px', fontSize: 13, color: '#8C8073', textAlign: 'center' }}>
          {people.size === 0 ? 'Yaklaşan seans yok.' : 'Aramanızla eşleşen üye yok.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14 }}>
        {visible.map((p) => {
          const open = openKey === p.key
          const next = p.bookings[0]
          return (
            <div key={p.key} style={{ border: '1px solid #EFE7DA', borderRadius: 12, background: '#FBF7F1', padding: narrow ? '12px 13px' : '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{p.name}</span>
                    <span style={{ fontSize: 12, color: '#8C8073' }}>Villa {p.villa}</span>
                    {p.isGuest && (
                      <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A79A8B', border: '1px solid #EFE7DA', borderRadius: 999, padding: '2px 8px' }}>
                        Misafir
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#8C8073' }}>
                    Sıradaki: {whenLabel(next)}
                    {p.phone ? ' · ' + p.phone : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#6E6357', background: '#F0E8DA', borderRadius: 999, padding: '5px 11px', whiteSpace: 'nowrap' }}>
                    {p.bookings.length} seans
                  </span>
                  <button onClick={() => setOpenKey(open ? null : p.key)} style={smallBtn}>{open ? 'Gizle' : 'Seansları'}</button>
                </div>
              </div>

              {open && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #EFE7DA', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {p.bookings.map((b) => (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: '#6E6357' }}>{whenLabel(b)}</span>
                      <button onClick={() => onOpenDate(b.date)} style={smallBtn}>Takvimde aç</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
