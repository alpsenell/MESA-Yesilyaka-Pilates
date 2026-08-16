import { useState, type CSSProperties, type FormEvent } from 'react'
import { changePassword } from './auth'

const inputStyle: CSSProperties = { padding: 13, borderRadius: 10, border: '1px solid #E4DACB', background: '#FBF7F1', fontSize: 15, color: '#2B2620', outline: 'none' }
const labelSpan: CSSProperties = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8C8073' }
const revealBtn: CSSProperties = { position: 'absolute', right: 6, top: 6, bottom: 6, padding: '0 12px', borderRadius: 8, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#8C8073', fontSize: 12, cursor: 'pointer' }

/**
 * Change the signed-in account's password. Works for residents and staff
 * alike: `changePassword` re-checks the current password against whatever
 * address the session already holds, so neither has to think about it.
 */
export default function PasswordChange({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [next2, setNext2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (next.length < 6) {
      setError('Yeni şifre en az 6 karakter olmalıdır.')
      return
    }
    if (next !== next2) {
      setError('Yeni şifreler eşleşmiyor.')
      return
    }
    if (next === current) {
      setError('Yeni şifre mevcut şifrenizden farklı olmalıdır.')
      return
    }
    setBusy(true)
    const res = await changePassword(current, next)
    setBusy(false)
    if (res.ok) onDone()
    else setError(res.error)
  }

  const field = (label: string, value: string, set: (v: string) => void, autoComplete: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelSpan}>{label}</span>
      <div style={{ position: 'relative', display: 'flex' }}>
        <input
          className="dc-field"
          type={showPw ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => {
            set(e.target.value)
            setError('')
          }}
          placeholder="••••••••"
          style={{ ...inputStyle, flex: 1, paddingRight: 76 }}
        />
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          aria-label={showPw ? 'Şifreyi gizle' : 'Şifreyi göster'}
          style={revealBtn}
        >
          {showPw ? 'Gizle' : 'Göster'}
        </button>
      </div>
    </label>
  )

  return (
    <div
      onClick={() => !busy && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(43, 38, 32, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 440, background: '#FFFDFA', borderRadius: 20, padding: 26, animation: 'riseIn 0.22s ease both', maxHeight: '92vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A79A8B' }}>Hesap</div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1 }}>Şifre değiştir</div>
          <div style={{ fontSize: 13, color: '#7E7367', textWrap: 'pretty' }}>
            Güvenlik için önce mevcut şifrenizi girin.
          </div>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {field('Mevcut şifre *', current, setCurrent, 'current-password')}
          {field('Yeni şifre *', next, setNext, 'new-password')}
          {field('Yeni şifre (tekrar) *', next2, setNext2, 'new-password')}

          {!!error && (
            <div style={{ padding: '11px 13px', borderRadius: 10, background: '#F7E4DC', color: '#94422A', fontSize: 13, textWrap: 'pretty' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="dc-btn-ghost"
              onClick={onClose}
              disabled={busy}
              style={{ padding: '14px 20px', minHeight: 46, borderRadius: 999, border: '1px solid #E4DACB', background: '#FFFDFA', color: '#2B2620', fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="dc-btn-primary"
              disabled={busy}
              style={{ padding: '14px 24px', minHeight: 46, borderRadius: 999, border: '1px solid #B0674C', background: '#B0674C', color: '#FFFDFA', fontSize: 13, fontWeight: 500, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
            >
              {busy ? 'Kaydediliyor…' : 'Şifreyi güncelle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
