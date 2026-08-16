import { supabase } from './supabase'
import type { Booking } from './pilates'

// ---------------------------------------------------------------------------
// Row <-> client mapping. The DB uses snake_case columns; the UI uses the
// original component's field names (time / first / last).
// ---------------------------------------------------------------------------
interface BookingRow {
  id: string
  date: string
  slot_time: string
  resident_id: string | null
  first_name: string
  last_name: string
  villa: string
  phone: string
}

function toBooking(r: BookingRow): Booking {
  return {
    id: r.id,
    date: r.date,
    time: r.slot_time,
    residentId: r.resident_id,
    first: r.first_name,
    last: r.last_name,
    villa: r.villa,
    phone: r.phone,
  }
}

export interface BookingInput {
  date: string
  time: string
  first: string
  last: string
  villa: string
  phone: string
}

export interface MonthAvailability {
  /** key `${date}|${time}` → { booked, capacity } for slots that deviate from the default (0 booked, capacity 1). */
  slots: Record<string, { booked: number; capacity: number }>
  blocked: string[]
}

export interface MonthAdminData {
  /** key `${date}|${time}` → bookings in that slot. */
  bySlot: Record<string, Booking[]>
  /** key `${date}|${time}` → custom capacity (default 1 when absent). */
  caps: Record<string, number>
  blocked: string[]
}

function monthBounds(year: number, month: number): { lo: string; hi: string } {
  const lo = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const last = new Date(year, month + 1, 0).getDate()
  const hi = `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { lo, hi }
}

// ---------------------------------------------------------------------------
// Resident API — anon key, RPC only (no direct table reads → no PII leak).
// ---------------------------------------------------------------------------
export async function fetchAvailability(year: number, month: number): Promise<MonthAvailability> {
  const [{ data: avail, error: e1 }, { data: blk, error: e2 }] = await Promise.all([
    supabase.rpc('availability', { p_year: year, p_month: month + 1 }),
    supabase.from('blocked_days').select('date').gte('date', monthBounds(year, month).lo).lte('date', monthBounds(year, month).hi),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const slots: Record<string, { booked: number; capacity: number }> = {}
  for (const row of (avail ?? []) as Array<{ date: string; slot_time: string; booked: number; capacity: number }>) {
    slots[`${row.date}|${row.slot_time}`] = { booked: row.booked, capacity: row.capacity }
  }
  return { slots, blocked: ((blk ?? []) as Array<{ date: string }>).map((b) => b.date) }
}

/** Book for the signed-in resident. Name and villa come from their profile. */
export async function bookSlot(input: BookingInput): Promise<void> {
  const { error } = await supabase.rpc('book_slot', {
    p_date: input.date,
    p_slot: input.time,
    p_phone: input.phone,
  })
  if (error) throw new Error(error.message)
}

/** The signed-in resident's own bookings — RLS hides everyone else's. */
export async function fetchMyBookings(residentId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('resident_id', residentId)
    .order('date')
    .order('slot_time')
  if (error) throw new Error(error.message)
  return ((data ?? []) as BookingRow[]).map(toBooking)
}

export async function cancelBookingResident(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_booking', { p_id: id })
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Admin API — requires an authenticated session; reads/writes tables directly.
// ---------------------------------------------------------------------------
export async function fetchMonthAdmin(year: number, month: number): Promise<MonthAdminData> {
  const { lo, hi } = monthBounds(year, month)
  const [bk, cap, blk] = await Promise.all([
    supabase.from('bookings').select('*').gte('date', lo).lte('date', hi),
    supabase.from('slot_capacity').select('*').gte('date', lo).lte('date', hi),
    supabase.from('blocked_days').select('date').gte('date', lo).lte('date', hi),
  ])
  if (bk.error) throw bk.error
  if (cap.error) throw cap.error
  if (blk.error) throw blk.error

  const bySlot: Record<string, Booking[]> = {}
  for (const row of (bk.data ?? []) as BookingRow[]) {
    const key = `${row.date}|${row.slot_time}`
    ;(bySlot[key] ??= []).push(toBooking(row))
  }
  const caps: Record<string, number> = {}
  for (const c of (cap.data ?? []) as Array<{ date: string; slot_time: string; capacity: number }>) {
    caps[`${c.date}|${c.slot_time}`] = c.capacity
  }
  return { bySlot, caps, blocked: ((blk.data ?? []) as Array<{ date: string }>).map((b) => b.date) }
}

/** Every booking from today onwards, for the "who is coming" view. */
export async function fetchUpcomingBookings(): Promise<Booking[]> {
  const t = new Date()
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .gte('date', today)
    .order('date')
    .order('slot_time')
  if (error) throw new Error(error.message)
  return ((data ?? []) as BookingRow[]).map(toBooking)
}

export async function adminCreateBooking(input: BookingInput): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    date: input.date,
    slot_time: input.time,
    first_name: input.first.trim(),
    last_name: input.last.trim(),
    villa: input.villa.trim().toUpperCase(),
    phone: input.phone.trim(),
  })
  if (error) throw new Error(error.message)
}

export async function adminUpdateBooking(id: string, input: BookingInput): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({
      first_name: input.first.trim(),
      last_name: input.last.trim(),
      villa: input.villa.trim().toUpperCase(),
      phone: input.phone.trim(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Admin cancellation. The reason is mandatory: the RPC records it as a notice
 * for the resident (skipped for admin-added guests, who have no account) and
 * only then deletes the booking.
 */
export async function adminCancelBooking(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('admin_cancel_booking', { p_id: id, p_reason: reason })
  if (error) throw new Error(error.message)
}

export async function adminSetCapacity(date: string, time: string, capacity: number): Promise<void> {
  const { error } = await supabase
    .from('slot_capacity')
    .upsert({ date, slot_time: time, capacity }, { onConflict: 'date,slot_time' })
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Cancellation notices — why an admin cancelled a resident's session.
// ---------------------------------------------------------------------------
export interface CancellationNotice {
  id: string
  date: string
  time: string
  reason: string
  createdAt: string
}

/** Notices the signed-in resident has not acknowledged yet. */
export async function fetchUnseenNotices(residentId: string): Promise<CancellationNotice[]> {
  const { data, error } = await supabase
    .from('cancellation_notices')
    .select('*')
    .eq('resident_id', residentId)
    .is('seen_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (
    (data ?? []) as Array<{ id: string; date: string; slot_time: string; reason: string; created_at: string }>
  ).map((n) => ({ id: n.id, date: n.date, time: n.slot_time, reason: n.reason, createdAt: n.created_at }))
}

export async function markNoticesSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_notices_seen')
  if (error) throw new Error(error.message)
}

export interface AdminResident {
  id: string
  first: string
  last: string
  villa: string
  phone: string
  createdAt: string
  total: number
  upcoming: number
}

export async function fetchResidents(): Promise<AdminResident[]> {
  const { data, error } = await supabase.rpc('admin_residents')
  if (error) throw new Error(error.message)
  return (
    (data ?? []) as Array<{
      id: string
      first_name: string
      last_name: string
      villa: string
      phone: string
      created_at: string
      bookings_total: number
      bookings_upcoming: number
    }>
  ).map((r) => ({
    id: r.id,
    first: r.first_name,
    last: r.last_name,
    villa: r.villa,
    phone: r.phone,
    createdAt: r.created_at,
    total: r.bookings_total,
    upcoming: r.bookings_upcoming,
  }))
}

/** Edit a resident's profile. A trigger rewrites their bookings to match. */
export async function adminUpdateResident(
  id: string,
  input: { first: string; last: string; villa: string; phone: string },
): Promise<void> {
  const { error } = await supabase
    .from('residents')
    .update({
      first_name: input.first.trim(),
      last_name: input.last.trim(),
      villa: input.villa.trim().toUpperCase(),
      phone: input.phone.trim(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Remove the account, its profile and all of its bookings. */
export async function adminDeleteResident(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_resident', { p_id: id })
  if (error) throw new Error(error.message)
}

export async function adminSetBlocked(date: string, blocked: boolean): Promise<void> {
  if (blocked) {
    const { error } = await supabase.from('blocked_days').upsert({ date }, { onConflict: 'date' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('blocked_days').delete().eq('date', date)
    if (error) throw new Error(error.message)
  }
}
