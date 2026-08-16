import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Residents sign in with "villa number + password". Supabase Auth wants an
// e-mail, so we derive a stable synthetic one from the villa number. It is
// never shown to the resident and never receives mail.
//
// One account per villa: "B-14", "b 14" and "b14" all normalise to the same
// key, so the household can never end up with two rival logins.
// ---------------------------------------------------------------------------
const VILLA_EMAIL_DOMAIN = 'villa.yesilyakasupilates.com'

/** Canonical villa key — must match `public.villa_key()` in the database. */
export function villaKey(villa: string): string {
  return villa
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
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
  if (m.includes('email not confirmed')) {
    return 'Hesap henüz etkinleştirilmemiş. Lütfen yöneticinizle iletişime geçin.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.'
  }
  if (m.includes('residents_villa_key_idx') || m.includes('duplicate key')) {
    return 'Bu villa numarası zaten kayıtlı.'
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
  const villa = input.villa.trim().toUpperCase()
  if (!input.first.trim() || !input.last.trim() || !villaKey(villa)) {
    return { ok: false, error: 'Ad, soyad ve villa numarası zorunludur.' }
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
      return {
        ok: false,
        error: 'Hesap oluşturuldu ancak giriş yapılamadı. Supabase → Authentication → Providers → Email altında "Confirm email" kapalı olmalıdır.',
      }
    }
  }
  return { ok: true }
}

export async function loginResident(villa: string, password: string): Promise<AuthResult> {
  if (!villaKey(villa)) return { ok: false, error: 'Villa numaranızı girin.' }
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
