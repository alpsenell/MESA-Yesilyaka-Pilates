import { useEffect, useState, type CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from './App'
import AdminLogin from './AdminLogin'
import AdminResidents from './AdminResidents'
import AdminSessions from './AdminSessions'
import PasswordChange from './PasswordChange'
import Notice, { SetupNotice, Toast } from './Notice'
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
    // Deliberately not resetting to `undefined` here: changing your password
    // re-authenticates, which fires a session event, and blanking the verdict
    // would unmount the console — and the open dialog — mid-save.
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
  // The account e-mail is a synthetic `<username>@…` address; only ever show
  // the username part of it.
  return <AdminConsole username={(session.user.email ?? '').split('@')[0]} />
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

type Tab = 'sessions' | 'calendar' | 'users'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sessions', label: 'Seanslı üyeler' },
  { id: 'calendar', label: 'Takvim' },
  { id: 'users', label: 'Üye yönetimi' },
]

const tabBtn = (on: boolean, narrow: boolean): CSSProperties => ({
  flex: narrow ? '1 1 auto' : '0 0 auto',
  padding: narrow ? '11px 12px' : '10px 20px',
  minHeight: narrow ? 44 : 0,
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  fontSize: narrow ? 12 : 13,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  background: on ? '#FFFDFA' : 'transparent',
  color: on ? '#2B2620' : '#8C8073',
  boxShadow: on ? '0 1px 3px rgba(43,38,32,0.10)' : 'none',
})

function AdminConsole({ username }: { username: string }) {
  const store = useStudio('admin')
  const [tab, setTab] = useState<Tab>('sessions')
  const [pwOpen, setPwOpen] = useState(false)
  const [pwDone, setPwDone] = useState(false)
  const headerExtra = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: '#8C8073', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</span>
      <button className="dc-btn-ghost" onClick={() => setPwOpen(true)} style={logoutBtn}>Şifre değiştir</button>
      <button className="dc-btn-ghost" onClick={() => supabase.auth.signOut()} style={logoutBtn}>Çıkış</button>
    </div>
  )
  // The calendar tab is App's own body, so it passes no replacement.
  return (
    <>
    <App
      store={store}
      headerExtra={headerExtra}
      tabs={({ narrow }) => (
        <div style={{ display: 'flex', gap: 2, padding: 3, background: '#EFE7DA', borderRadius: 999, marginTop: 18, overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={tabBtn(tab === t.id, narrow)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      replaceBody={
        tab === 'calendar'
          ? undefined
          : ({ narrow }) =>
              tab === 'sessions' ? (
                <AdminSessions
                  narrow={narrow}
                  onOpenDate={(date) => {
                    store.setSelected(date)
                    setTab('calendar')
                  }}
                />
              ) : (
                <AdminResidents
                  monthBookings={store.monthBookings}
                  year={store.year}
                  month={store.month}
                  narrow={narrow}
                  onChanged={store.refresh}
                />
              )
      }
    />
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
