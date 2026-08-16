import type { ReactNode } from 'react'

/** Centered card used for loading / setup / error states, styled to match the app. */
export default function Notice({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F6F1E9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#FFFDFA', border: '1px solid #E9E0D2', borderRadius: 20, padding: 30 }}>
        {kicker && <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A79A8B', paddingBottom: 6 }}>{kicker}</div>}
        <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1, paddingBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: '#7E7367', lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  )
}

export function SetupNotice() {
  return (
    <Notice kicker="Kurulum" title="Sunucu bağlantısı gerekli">
      Supabase ortam değişkenleri bulunamadı. <code>.env.example</code> dosyasını <code>.env.local</code> olarak
      kopyalayıp <code>VITE_SUPABASE_URL</code> ve <code>VITE_SUPABASE_ANON_KEY</code> değerlerini doldurun,
      ardından uygulamayı yeniden başlatın.
    </Notice>
  )
}

/** Transient confirmation pill, matching the one inside the calendar view. */
export function Toast({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', background: '#2B2620', color: '#FBF7F1', padding: '13px 22px', borderRadius: 999, fontSize: 13, zIndex: 60, maxWidth: '88vw', textAlign: 'center', animation: 'riseIn 0.2s ease both' }}>
      {children}
    </div>
  )
}
