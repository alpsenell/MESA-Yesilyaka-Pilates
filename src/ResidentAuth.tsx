import { useState, type CSSProperties, type FormEvent } from 'react'
import { MAX_VILLA, MIN_VILLA, loginResident, registerResident } from './auth'

const inputStyle: CSSProperties = { padding: 13, borderRadius: 10, border: '1px solid #E4DACB', background: '#FBF7F1', fontSize: 15, color: '#2B2620', outline: 'none' }
const labelSpan: CSSProperties = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8C8073' }
const revealBtn: CSSProperties = {
  position: 'absolute',
  right: 6,
  top: 6,
  bottom: 6,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid #E4DACB',
  background: '#FFFDFA',
  color: '#8C8073',
  fontSize: 12,
  cursor: 'pointer',
}
const tabStyle = (on: boolean): CSSProperties => ({
  flex: 1,
  padding: '10px 14px',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  background: on ? '#FFFDFA' : 'transparent',
  color: on ? '#2B2620' : '#8C8073',
  boxShadow: on ? '0 1px 3px rgba(43,38,32,0.10)' : 'none',
})

type Mode = 'login' | 'register'

/**
 * Resident sign-in / sign-up modal. Residents identify themselves by villa
 * number; `auth.ts` turns that into the synthetic e-mail Supabase needs.
 */
export default function ResidentAuth({
  initialMode = 'login',
  onClose,
}: {
  initialMode?: Mode
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [villa, setVilla] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setPassword('')
    setPassword2('')
    setShowPw(false)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (mode === 'register' && password !== password2) {
      setError('Şifreler eşleşmiyor.')
      return
    }
    setBusy(true)
    const res =
      mode === 'login'
        ? await loginResident(villa, password)
        : await registerResident({ first, last, villa, phone, password })
    setBusy(false)
    if (res.ok) onClose()
    else setError(res.error)
    // On success the session listener in ResidentApp swaps in the profile.
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    extra: { type?: string; placeholder?: string; autoComplete?: string; inputMode?: 'numeric' } = {},
  ) => {
    const isPassword = extra.type === 'password'
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={labelSpan}>{label}</span>
        <div style={{ position: 'relative', display: 'flex' }}>
          <input
            className="dc-field"
            type={isPassword && showPw ? 'text' : (extra.type ?? 'text')}
            autoComplete={extra.autoComplete}
            inputMode={extra.inputMode}
            placeholder={extra.placeholder}
            value={value}
            onChange={(e) => {
              set(e.target.value)
              setError('')
            }}
            style={{ ...inputStyle, flex: 1, paddingRight: isPassword ? 76 : 13 }}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Şifreyi gizle' : 'Şifreyi göster'}
              style={revealBtn}
            >
              {showPw ? 'Gizle' : 'Göster'}
            </button>
          )}
        </div>
      </label>
    )
  }

  return (
    <div
      onClick={() => !busy && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(43, 38, 32, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, background: '#FFFDFA', borderRadius: 20, padding: 26, animation: 'riseIn 0.22s ease both', maxHeight: '92vh', overflow: 'auto' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A79A8B' }}>Site sakini</div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1 }}>
            {mode === 'login' ? 'Giriş yapın' : 'Hesap oluşturun'}
          </div>
          <div style={{ fontSize: 13, color: '#7E7367', textWrap: 'pretty' }}>
            {mode === 'login'
              ? 'Rezervasyon yapmak için villa numaranız ve şifrenizle giriş yapın.'
              : 'Her villa için tek hesap açılır. Bilgileriniz yalnızca stüdyo yönetimi tarafından görülür.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 2, padding: 3, background: '#EFE7DA', borderRadius: 999, marginBottom: 18 }}>
          <button onClick={() => switchMode('login')} style={tabStyle(mode === 'login')}>Giriş</button>
          <button onClick={() => switchMode('register')} style={tabStyle(mode === 'register')}>Kayıt ol</button>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'register' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {field('Ad *', first, setFirst, { placeholder: 'Selin', autoComplete: 'given-name' })}
              {field('Soyad *', last, setLast, { placeholder: 'Kaya', autoComplete: 'family-name' })}
            </div>
          )}
          {field(`Villa numarası * (${MIN_VILLA}–${MAX_VILLA})`, villa, setVilla, {
            placeholder: '343',
            autoComplete: 'username',
            inputMode: 'numeric',
          })}
          {mode === 'register' && field('Telefon (opsiyonel)', phone, setPhone, { placeholder: '+90 532 000 00 00', autoComplete: 'tel' })}
          {field('Şifre *', password, setPassword, {
            type: 'password',
            placeholder: '••••••••',
            autoComplete: mode === 'login' ? 'current-password' : 'new-password',
          })}
          {mode === 'register' &&
            field('Şifre (tekrar) *', password2, setPassword2, { type: 'password', placeholder: '••••••••', autoComplete: 'new-password' })}

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
              {busy ? 'Lütfen bekleyin…' : mode === 'login' ? 'Giriş yap' : 'Hesabı oluştur'}
            </button>
          </div>
        </form>

        <div style={{ fontSize: 12, color: '#9C9083', paddingTop: 16, textWrap: 'pretty' }}>
          {mode === 'login'
            ? 'Şifrenizi mi unuttunuz? Stüdyo yönetimiyle iletişime geçin.'
            : `Villa numaranız giriş adınızdır — ${MIN_VILLA} ile ${MAX_VILLA} arasında bir sayı.`}
        </div>
      </div>
    </div>
  )
}
