import { useEffect, useState, type CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from './App'
import AdminLogin from './AdminLogin'
import AdminResidents from './AdminResidents'
import Notice, { SetupNotice } from './Notice'
import { checkIsAdmin } from './auth'
import { isConfigured, supabase } from './supabase'
import { useStudio } from './useStudio'

export default function AdminApp() {
  if (!isConfigured) return <SetupNotice />
  return <AdminGate />
}

function AdminGate() {
  // undefined = still checking for an existing session
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // undefined = membership check in flight
  const [admin, setAdmin] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // A resident account can reach admin.* too — the console is gated on
  // membership of `public.admins`, not merely on being signed in.
  useEffect(() => {
    let live = true
    if (!session) {
      setAdmin(undefined)
      return
    }
    setAdmin(undefined)
    checkIsAdmin().then((ok) => {
      if (live) setAdmin(ok)
    })
    return () => {
      live = false
    }
  }, [session])

  if (session === undefined) return <Notice kicker="Yönetici" title="Yükleniyor…" />
  if (!session) return <AdminLogin />
  if (admin === undefined) return <Notice kicker="Yönetici" title="Yetki kontrol ediliyor…" />
  if (!admin) {
    return (
      <Notice kicker="Yönetici" title="Bu hesabın yönetici yetkisi yok">
        <p style={{ margin: '0 0 16px' }}>
          Bu sayfa yalnızca stüdyo yönetimi içindir. Site sakinleri rezervasyonlarını ana adresten yapar.
        </p>
        <button className="dc-btn-ghost" onClick={() => supabase.auth.signOut()} style={logoutBtn}>Çıkış</button>
      </Notice>
    )
  }
  return <AdminConsole email={session.user.email ?? ''} />
}

const logoutBtn: CSSProperties = {
  padding: '9px 16px',
  minHeight: 0,
  borderRadius: 999,
  border: '1px solid #E4DACB',
  background: '#FFFDFA',
  color: '#2B2620',
  fontSize: 12,
  cursor: 'pointer',
}

function AdminConsole({ email }: { email: string }) {
  const store = useStudio('admin')
  const headerExtra = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, color: '#8C8073', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
      <button className="dc-btn-ghost" onClick={() => supabase.auth.signOut()} style={logoutBtn}>Çıkış</button>
    </div>
  )
  return (
    <App
      store={store}
      headerExtra={headerExtra}
      footer={({ narrow }) => (
        <AdminResidents
          monthBookings={store.monthBookings}
          year={store.year}
          month={store.month}
          narrow={narrow}
          onChanged={store.refresh}
        />
      )}
    />
  )
}
