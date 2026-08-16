import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from './App'
import ResidentAuth from './ResidentAuth'
import PasswordChange from './PasswordChange'
import { SetupNotice, Toast } from './Notice'
import { fetchUnseenNotices, markNoticesSeen, type CancellationNotice } from './api'
import { fetchProfile, signOut, type Resident } from './auth'
import { DAYS, prettyDate, timeLabel } from './pilates'
import { isConfigured, supabase } from './supabase'
import { useStudio } from './useStudio'

export default function ResidentApp() {
  if (!isConfigured) return <SetupNotice />
  return <ResidentInner />
}

const pillBtn: CSSProperties = {
  padding: '11px 18px',
  minHeight: 44,
  borderRadius: 999,
  border: '1px solid #E4DACB',
  background: '#FFFDFA',
  color: '#2B2620',
  fontSize: 13,
  cursor: 'pointer',
}
const primaryPill: CSSProperties = { ...pillBtn, border: '1px solid #2B2620', background: '#2B2620', color: '#FBF7F1', fontWeight: 500 }

function ResidentInner() {
  // undefined = still checking for an existing session
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Resident | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [notices, setNotices] = useState<CancellationNotice[]>([])
  const [pwOpen, setPwOpen] = useState(false)
  const [pwDone, setPwDone] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Load (or clear) the resident profile whenever the session changes.
  useEffect(() => {
    let live = true
    if (!session) {
      setProfile(null)
      return
    }
    fetchProfile(session.user.id).then((p) => {
      if (live) setProfile(p)
    })
    return () => {
      live = false
    }
  }, [session])

  // Cancellations an admin made while the resident was away. Shown once, on
  // the next sign-in, then marked seen.
  useEffect(() => {
    let live = true
    if (!profile) {
      setNotices([])
      return
    }
    fetchUnseenNotices(profile.id)
      .then((n) => {
        if (live) setNotices(n)
      })
      .catch(() => {
        /* a missing notice is not worth blocking the calendar for */
      })
    return () => {
      live = false
    }
  }, [profile])

  async function dismissNotices() {
    setNotices([])
    try {
      await markNoticesSeen()
    } catch {
      /* they will simply be shown again next time */
    }
  }

  const store = useStudio('resident', profile?.id ?? null)
  const refreshProfile = useCallback(async () => {
    if (session) setProfile(await fetchProfile(session.user.id))
  }, [session])

  // A signed-in account with no resident profile is studio staff visiting the
  // resident site; offer them the way out rather than a broken booking form.
  const staffSession = !!session && profile === null

  const headerExtra = profile ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#8C8073' }}>
        {profile.first} {profile.last} · Villa {profile.villa}
      </span>
      <button className="dc-btn-ghost" onClick={() => setPwOpen(true)} style={{ ...pillBtn, minHeight: 0, padding: '9px 16px', fontSize: 12 }}>
        Şifre değiştir
      </button>
      <button className="dc-btn-ghost" onClick={() => signOut()} style={{ ...pillBtn, minHeight: 0, padding: '9px 16px', fontSize: 12 }}>
        Çıkış
      </button>
    </div>
  ) : session === undefined ? null : staffSession ? (
    <button className="dc-btn-ghost" onClick={() => signOut()} style={pillBtn}>
      Çıkış (yönetici hesabı)
    </button>
  ) : (
    <button className="dc-btn-primary" onClick={() => setAuthOpen(true)} style={primaryPill}>
      Giriş / Kayıt
    </button>
  )

  return (
    <>
      <App
        store={store}
        resident={profile}
        onRequireLogin={() => setAuthOpen(true)}
        onProfileChange={refreshProfile}
        headerExtra={headerExtra}
      />
      {authOpen && <ResidentAuth onClose={() => setAuthOpen(false)} />}
      {notices.length > 0 && <NoticeModal notices={notices} onDismiss={dismissNotices} />}
      {pwOpen && (
        <PasswordChange
          onClose={() => setPwOpen(false)}
          onDone={() => {
            setPwOpen(false)
            setPwDone(true)
            setTimeout(() => setPwDone(false), 3200)
          }}
        />
      )}
      {pwDone && <Toast>Şifreniz güncellendi.</Toast>}
    </>
  )
}

/** "Your session was cancelled, and here's why" — shown once per notice. */
function NoticeModal({ notices, onDismiss }: { notices: CancellationNotice[]; onDismiss: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(43, 38, 32, 0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 55 }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#FFFDFA', borderRadius: 20, padding: 26, animation: 'riseIn 0.22s ease both', maxHeight: '92vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#A79A8B' }}>Stüdyodan bilgilendirme</div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, lineHeight: 1.1 }}>
            {notices.length > 1 ? notices.length + ' seansınız iptal edildi' : 'Seansınız iptal edildi'}
          </div>
          <div style={{ fontSize: 13, color: '#7E7367', textWrap: 'pretty' }}>
            Aşağıdaki seans{notices.length > 1 ? 'lar' : ''} stüdyo yönetimi tarafından iptal edildi.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notices.map((n) => (
            <div key={n.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', border: '1px solid #E0C4B8', borderRadius: 12, background: '#FBF3EF' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {DAYS[(new Date(n.date + 'T00:00:00').getDay() + 6) % 7]}, {prettyDate(n.date)} · {timeLabel(n.time)}
              </div>
              <div style={{ fontSize: 13, color: '#7E5A4E', textWrap: 'pretty' }}>{n.reason}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 20 }}>
          <button
            className="dc-btn-primary"
            onClick={onDismiss}
            style={{ padding: '14px 24px', minHeight: 46, borderRadius: 999, border: '1px solid #B0674C', background: '#B0674C', color: '#FFFDFA', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            Anladım
          </button>
        </div>
      </div>
    </div>
  )
}
