import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { adminDeleteResident, adminUpdateResident, fetchResidents, type AdminResident } from './api'
import { MAX_VILLA, MIN_VILLA, isValidVilla, villaKey } from './auth'
import type { Booking } from './pilates'
import { MONTHS, prettyDate, timeLabel } from './pilates'

const inputStyle: CSSProperties = { padding: 11, borderRadius: 10, border: '1px solid #E4DACB', background: '#FBF7F1', fontSize: 14, color: '#2B2620', outline: 'none' }
const labelSpan: CSSProperties = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8C8073' }
const smallBtn: CSSProperties = { padding: '9px 14px', minHeight: 38, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 12, cursor: 'pointer' }
const dangerBtn: CSSProperties = { ...smallBtn, border: '1px solid #E0C4B8', background: '#FBF3EF', color: '#94422A' }

interface Draft {
  first: string
  last: string
  villa: string
  phone: string
}

/**
 * Registered residents: who they are, how much they book, and edit/delete.
 * `monthBookings` comes from the calendar that is already loaded, so the
 * expanded row can show exactly which sessions a resident holds this month.
 */
export default function AdminResidents({
  monthBookings,
  year,
  month,
  narrow,
  onChanged,
}: {
  monthBookings: Booking[]
  year: number
  month: number
  narrow: boolean
  onChanged: () => void
}) {
  const [rows, setRows] = useState<AdminResident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ first: '', last: '', villa: '', phone: '' })
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchResidents())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sakinler yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function startEdit(r: AdminResident) {
    setEditId(r.id)
    setConfirmId(null)
    setDraft({ first: r.first, last: r.last, villa: r.villa, phone: r.phone })
    setError('')
  }

  async function saveEdit(id: string) {
    if (!draft.first.trim() || !draft.last.trim() || !draft.villa.trim()) {
      setError('Ad, soyad ve villa numarası zorunludur.')
      return
    }
    if (!isValidVilla(draft.villa)) {
      setError(`Villa numarası ${MIN_VILLA} ile ${MAX_VILLA} arasında bir sayı olmalıdır.`)
      return
    }
    setBusy(true)
    try {
      await adminUpdateResident(id, { ...draft, villa: villaKey(draft.villa) })
      setEditId(null)
      await load()
      onChanged()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kaydedilemedi.'
      setError(
        msg.includes('residents_villa_key_idx')
          ? 'Bu villa numarası başka bir hesapta kayıtlı.'
          : msg.includes('residents_villa_range')
            ? `Villa numarası ${MIN_VILLA} ile ${MAX_VILLA} arasında olmalıdır.`
            : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      await adminDeleteResident(id)
      setConfirmId(null)
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silinemedi.')
    } finally {
      setBusy(false)
    }
  }

  const q = query.trim().toLocaleLowerCase('tr')
  const visible = q
    ? rows.filter((r) => (r.first + ' ' + r.last + ' ' + r.villa + ' ' + r.phone).toLocaleLowerCase('tr').includes(q))
    : rows

  return (
    <div style={{ background: '#FFFDFA', border: '1px solid #E9E0D2', borderRadius: 18, padding: narrow ? '16px 14px 18px' : '22px 22px 26px', marginTop: narrow ? 14 : 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingBottom: 14, borderBottom: '1px solid #F0E8DA' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A79A8B' }}>Kayıtlı sakinler</div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: narrow ? 24 : 30 }}>
            {loading ? 'Yükleniyor…' : rows.length + ' hesap'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="dc-field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ad veya villa ara…"
            style={{ ...inputStyle, minWidth: narrow ? 0 : 220, flex: narrow ? 1 : undefined }}
          />
          <button onClick={load} style={smallBtn}>Yenile</button>
        </div>
      </div>

      {!!error && (
        <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 10, background: '#F7E4DC', color: '#94422A', fontSize: 13 }}>{error}</div>
      )}

      {!loading && visible.length === 0 && (
        <div style={{ padding: '22px 6px', fontSize: 13, color: '#8C8073', textAlign: 'center' }}>
          {rows.length === 0 ? 'Henüz kayıtlı sakin yok.' : 'Aramanızla eşleşen sakin yok.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14 }}>
        {visible.map((r) => {
          const editing = editId === r.id
          const open = openId === r.id
          const theirs = monthBookings
            .filter((b) => b.residentId === r.id)
            .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

          return (
            <div key={r.id} style={{ border: '1px solid #EFE7DA', borderRadius: 12, background: '#FBF7F1', padding: narrow ? '12px 13px' : '14px 16px' }}>
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 12 }}>
                    {(
                      [
                        ['Ad', 'first'],
                        ['Soyad', 'last'],
                        [`Villa numarası (${MIN_VILLA}–${MAX_VILLA})`, 'villa'],
                        ['Telefon', 'phone'],
                      ] as Array<[string, keyof Draft]>
                    ).map(([label, k]) => (
                      <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={labelSpan}>{label}</span>
                        <input
                          className="dc-field"
                          value={draft[k]}
                          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                          style={inputStyle}
                        />
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button onClick={() => setEditId(null)} disabled={busy} style={smallBtn}>Vazgeç</button>
                    <button
                      onClick={() => saveEdit(r.id)}
                      disabled={busy}
                      style={{ ...smallBtn, border: '1px solid #B0674C', background: '#B0674C', color: '#FFFDFA', fontWeight: 500 }}
                    >
                      {busy ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: '#9C9083', textWrap: 'pretty' }}>
                    Villa numarası aynı zamanda giriş adıdır — değiştirirseniz sakin yeni numarasıyla giriş yapar.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{r.first} {r.last}</div>
                    <div style={{ fontSize: 12, color: '#8C8073' }}>
                      Villa {r.villa}
                      {r.phone ? ' · ' + r.phone : ' · telefon yok'} · {r.total} seans ({r.upcoming} yaklaşan)
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => setOpenId(open ? null : r.id)} style={smallBtn}>
                      {open ? 'Gizle' : 'Seansları'}
                    </button>
                    <button onClick={() => startEdit(r)} style={smallBtn}>Düzenle</button>
                    {confirmId === r.id ? (
                      <>
                        <button onClick={() => setConfirmId(null)} disabled={busy} style={smallBtn}>Vazgeç</button>
                        <button onClick={() => remove(r.id)} disabled={busy} style={dangerBtn}>
                          {busy ? 'Siliniyor…' : 'Kalıcı olarak sil'}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmId(r.id)} style={dangerBtn}>Sil</button>
                    )}
                  </div>
                </div>
              )}

              {confirmId === r.id && !editing && (
                <div style={{ marginTop: 10, padding: '11px 13px', borderRadius: 10, background: '#F7E4DC', color: '#94422A', fontSize: 12, textWrap: 'pretty' }}>
                  {r.first} {r.last} hesabı, {r.total} rezervasyonuyla birlikte kalıcı olarak silinecek. Bu işlem geri alınamaz.
                </div>
              )}

              {open && !editing && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #EFE7DA', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A79A8B' }}>
                    {MONTHS[month] + ' ' + year} seansları
                  </div>
                  {theirs.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#8C8073' }}>Bu ay rezervasyonu yok.</div>
                  ) : (
                    theirs.map((b) => (
                      <div key={b.id} style={{ fontSize: 13, color: '#6E6357' }}>
                        {prettyDate(b.date)} · {timeLabel(b.time)}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
