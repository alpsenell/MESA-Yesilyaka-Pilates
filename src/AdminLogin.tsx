import { useState, type CSSProperties, type FormEvent } from 'react'
import { supabase } from './supabase'
import { DEFAULT_CONFIG } from './pilates'

const inputStyle: CSSProperties = { padding: 13, borderRadius: 10, border: '1px solid #E4DACB', background: '#FBF7F1', fontSize: 15, color: '#2B2620', outline: 'none' }
const labelSpan: CSSProperties = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8C8073' }

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError('Giriş başarısız. E-posta veya şifre hatalı.')
    // On success, AdminApp's auth listener swaps in the console automatically.
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400, background: '#FFFDFA', border: '1px solid #E9E0D2', borderRadius: 20, padding: 30 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9C9083' }}>{DEFAULT_CONFIG.communityName}</div>
        <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 34, lineHeight: 1.05, padding: '6px 0 4px' }}>Yönetici girişi</div>
        <div style={{ fontSize: 13, color: '#7E7367', paddingBottom: 20 }}>Devam etmek için stüdyo hesabınızla giriş yapın.</div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelSpan}>E-posta</span>
            <input className="dc-field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ad@yesilyakasupilates.com" style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelSpan}>Şifre</span>
            <input className="dc-field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
          </label>
          {!!error && <div style={{ padding: '11px 13px', borderRadius: 10, background: '#F7E4DC', color: '#94422A', fontSize: 13 }}>{error}</div>}
          <button
            className="dc-btn-primary"
            type="submit"
            disabled={busy}
            style={{ marginTop: 4, padding: '14px 24px', minHeight: 48, borderRadius: 999, border: '1px solid #B0674C', background: '#B0674C', color: '#FFFDFA', fontSize: 14, fontWeight: 500, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>
        <div style={{ fontSize: 12, color: '#9C9083', paddingTop: 18, textWrap: 'pretty' }}>
          Hesaplar stüdyo yöneticisi tarafından oluşturulur. Şifrenizi mi unuttunuz? Yöneticinizle iletişime geçin.
        </div>
      </div>
    </div>
  )
}
