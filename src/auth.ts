import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Residents sign in with "villa number + password". Supabase Auth wants an
// e-mail, so we derive a stable synthetic one from the villa number. It is
// never shown to the resident and never receives mail — which is also why
// "Confirm email" has to stay off in the Supabase project: a confirmation
// mail to these addresses cannot be delivered and sign-up would fail.
//
// One account per villa: "7", "007" and " 7 " all normalise to villa 7.
// ---------------------------------------------------------------------------
const VILLA_EMAIL_DOMAIN = import.meta.env.VITE_VILLA_EMAIL_DOMAIN || 'villa.yesilyakasupilates.com'

// Staff do the same with a username. Must match the domain used in
// supabase/migration-004-admin-username.sql.
const ADMIN_EMAIL_DOMAIN = import.meta.env.VITE_ADMIN_EMAIL_DOMAIN || 'admin.yesilyakasupilates.com'

/** Canonical username — must match the `admins_username_format` constraint. */
export function usernameKey(username: string): string {
  return username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
}

export function adminEmail(username: string): string {
  return `${usernameKey(username)}@${ADMIN_EMAIL_DOMAIN}`
}

/** Sign in as studio staff. Nobody types an e-mail address anywhere. */
export async function loginAdmin(username: string, password: string): Promise<AuthResult> {
  const user = usernameKey(username)
  if (!user) return { ok: false, error: 'Kullanıcı adınızı girin.' }
  const { error } = await supabase.auth.signInWithPassword({ email: adminEmail(user), password })
  if (error) {
    return {
      ok: false,
      error: error.message.toLowerCase().includes('invalid login credentials')
        ? 'Kullanıcı adı veya şifre hatalı.'
        : authError(error.message),
    }
  }
  return { ok: true }
}

/** The community is numbered 1–500; there are no letter blocks. */
export const MIN_VILLA = 1
export const MAX_VILLA = 500

/** Canonical villa key — must match `public.villa_key()` in the database. */
export function villaKey(villa: string): string {
  return villa
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^0+(?=.)/, '')
}

export function isValidVilla(villa: string): boolean {
  const key = villaKey(villa)
  if (!/^[0-9]+$/.test(key)) return false
  const n = Number(key)
  return n >= MIN_VILLA && n <= MAX_VILLA
}

export function villaEmail(villa: string): string {
  return `villa-${villaKey(villa).toLowerCase()}@${VILLA_EMAIL_DOMAIN}`
}

export interface Resident {
  id: string
  first: string
  last: string
  villa: string
  phone: string
}

interface ResidentRow {
  id: string
  first_name: string
  last_name: string
  villa: string
  phone: string
}

function toResident(r: ResidentRow): Resident {
  return { id: r.id, first: r.first_name, last: r.last_name, villa: r.villa, phone: r.phone }
}

// ---------------------------------------------------------------------------
// Error messages. Supabase speaks English; residents do not have to.
// ---------------------------------------------------------------------------
function authError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Bu villa numarası zaten kayıtlı. Giriş yapın veya yöneticinizle iletişime geçin.'
  }
  if (m.includes('invalid login credentials')) return 'Villa numarası veya şifre hatalı.'
  if (m.includes('password should be') || m.includes('password must')) {
    return 'Şifre en az 6 karakter olmalıdır.'
  }
  if (m.includes('email not confirmed') || m.includes('email address') || m.includes('invalid email')) {
    // Residents never see an address, so this is always the same cause: the
    // project still has "Confirm email" on and tried to mail the synthetic
    // account address. Keep the message human and log the fix for whoever is
    // looking at the console.
    console.warn(
      'Sign-up failed on the account address. Supabase → Authentication → Providers → Email → turn "Confirm email" off.',
    )
    return 'Kayıt şu anda tamamlanamıyor. Lütfen stüdyo yönetimiyle iletişime geçin.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.'
  }
  if (m.includes('residents_villa_key_idx') || m.includes('duplicate key')) {
    return 'Bu villa numarası zaten kayıtlı.'
  }
  if (m.includes('residents_villa_range')) {
    return `Villa numarası ${MIN_VILLA} ile ${MAX_VILLA} arasında olmalıdır.`
  }
  return message
}

export interface RegisterInput {
  first: string
  last: string
  villa: string
  phone: string
  password: string
}

export type AuthResult = { ok: true } | { ok: false; error: string }

export async function registerResident(input: RegisterInput): Promise<AuthResult> {
  const villa = villaKey(input.villa)
  if (!input.first.trim() || !input.last.trim() || !villa) {
    return { ok: false, error: 'Ad, soyad ve villa numarası zorunludur.' }
  }
  if (!isValidVilla(villa)) {
    return { ok: false, error: `Villa numarası ${MIN_VILLA} ile ${MAX_VILLA} arasında bir sayı olmalıdır.` }
  }
  if (input.password.length < 6) return { ok: false, error: 'Şifre en az 6 karakter olmalıdır.' }

  const { data, error } = await supabase.auth.signUp({
    email: villaEmail(villa),
    password: input.password,
    options: {
      data: {
        first_name: input.first.trim(),
        last_name: input.last.trim(),
        villa,
        phone: input.phone.trim(),
      },
    },
  })
  if (error) return { ok: false, error: authError(error.message) }

  // With e-mail confirmation switched off (the expected setup — these
  // addresses are synthetic) sign-up already returns a session. If it did not,
  // try a normal sign-in before giving up.
  if (!data.session) {
    const retry = await loginResident(villa, input.password)
    if (!retry.ok) {
      console.warn(
        'Account created but no session. Supabase → Authentication → Providers → Email → turn "Confirm email" off.',
      )
      return { ok: false, error: 'Hesap oluşturuldu ancak giriş yapılamadı. Lütfen stüdyo yönetimiyle iletişime geçin.' }
    }
  }
  return { ok: true }
}

export async function loginResident(villa: string, password: string): Promise<AuthResult> {
  if (!villaKey(villa)) return { ok: false, error: 'Villa numaranızı girin.' }
  if (!isValidVilla(villa)) {
    return { ok: false, error: `Villa numarası ${MIN_VILLA} ile ${MAX_VILLA} arasında bir sayı olmalıdır.` }
  }
  const { error } = await supabase.auth.signInWithPassword({ email: villaEmail(villa), password })
  if (error) return { ok: false, error: authError(error.message) }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

/** The signed-in user's resident profile, or null when they are not a resident. */
export async function fetchProfile(userId: string): Promise<Resident | null> {
  const { data, error } = await supabase.from('residents').select('*').eq('id', userId).maybeSingle()
  if (error || !data) return null
  return toResident(data as ResidentRow)
}

/** True when the signed-in user is listed in `public.admins`. */
export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) return false
  return data === true
}

/**
 * Change the signed-in account's password.
 *
 * Supabase's `updateUser` does not ask for the current password, so we verify
 * it first by re-authenticating against whatever address the session holds —
 * a villa address for residents, an admin one for staff. That keeps a borrowed
 * open tab from being enough to take an account over.
 */
export async function changePassword(current: string, next: string): Promise<AuthResult> {
  if (next.length < 6) return { ok: false, error: 'Yeni şifre en az 6 karakter olmalıdır.' }

  const { data, error } = await supabase.auth.getUser()
  const email = data.user?.email
  if (error || !email) return { ok: false, error: 'Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.' }

  const check = await supabase.auth.signInWithPassword({ email, password: current })
  if (check.error) return { ok: false, error: 'Mevcut şifreniz hatalı.' }

  const { error: updateError } = await supabase.auth.updateUser({ password: next })
  if (updateError) return { ok: false, error: authError(updateError.message) }
  return { ok: true }
}
