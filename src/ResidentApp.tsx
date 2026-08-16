import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from './App'
import ResidentAuth from './ResidentAuth'
import { SetupNotice } from './Notice'
import { fetchProfile, signOut, type Resident } from './auth'
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
    </>
  )
}
