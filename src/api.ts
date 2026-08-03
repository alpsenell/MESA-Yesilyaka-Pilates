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
  first_name: string
  last_name: string
  villa: string
  phone: string
}

function toBooking(r: BookingRow): Booking {
  return { id: r.id, date: r.date, time: r.slot_time, first: r.first_name, last: r.last_name, villa: r.villa, phone: r.phone }
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

export async function bookSlot(input: BookingInput): Promise<void> {
  const { error } = await supabase.rpc('book_slot', {
    p_date: input.date,
    p_slot: input.time,
    p_first: input.first,
    p_last: input.last,
    p_villa: input.villa,
    p_phone: input.phone,
  })
  if (error) throw new Error(error.message)
}

export async function fetchVillaBookings(villa: string): Promise<Booking[]> {
  const { data, error } = await supabase.rpc('villa_bookings', { p_villa: villa })
  if (error) throw new Error(error.message)
  return ((data ?? []) as BookingRow[]).map(toBooking)
}

export async function cancelBookingResident(id: string, villa: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_booking', { p_id: id, p_villa: villa })
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

export async function adminDeleteBooking(id: string): Promise<void> {
  const { error } = await supabase.from('bookings').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function adminSetCapacity(date: string, time: string, capacity: number): Promise<void> {
  const { error } = await supabase
    .from('slot_capacity')
    .upsert({ date, slot_time: time, capacity }, { onConflict: 'date,slot_time' })
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
