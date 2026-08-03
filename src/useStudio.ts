import { useCallback, useEffect, useRef, useState } from 'react'
import {
  adminCreateBooking,
  adminDeleteBooking,
  adminSetBlocked,
  adminSetCapacity,
  adminUpdateBooking,
  bookSlot,
  cancelBookingResident,
  fetchAvailability,
  fetchMonthAdmin,
  fetchVillaBookings,
  type BookingInput,
} from './api'
import { DEFAULT_CONFIG, hoursOut, type Booking, type Config, type Role } from './pilates'

export type ActionResult = { ok: true } | { ok: false; error: string }

export interface StudioStore {
  role: Role
  config: Config
  year: number
  month: number
  selected: string
  loading: boolean
  error: string
  setSelected(date: string): void
  prevMonth(): void
  nextMonth(): void
  refresh(): void
  capacityOf(date: string, time: string): number
  bookedCount(date: string, time: string): number
  /** Individual bookings in a slot, or null when the caller (resident) must not see PII. */
  bookingsAt(date: string, time: string): Booking[] | null
  isBlocked(date: string): boolean
  book(input: BookingInput): Promise<ActionResult>
  updateBooking(id: string, input: BookingInput): Promise<ActionResult>
  cancel(booking: Booking, adminOverride: boolean): Promise<ActionResult>
  setCapacity(date: string, time: string, delta: number): Promise<void>
  toggleBlocked(date: string): Promise<void>
  lookupVilla(villa: string): Promise<Booking[]>
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Bir hata oluştu. Lütfen tekrar deneyin.'
}

export function useStudio(role: Role, config: Config = DEFAULT_CONFIG): StudioStore {
  const isAdmin = role === 'admin'
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Slot maps for the currently loaded month.
  const [availSlots, setAvailSlots] = useState<Record<string, { booked: number; capacity: number }>>({})
  const [bySlot, setBySlot] = useState<Record<string, Booking[]>>({})
  const [caps, setCaps] = useState<Record<string, number>>({})
  const [blocked, setBlocked] = useState<string[]>([])

  const reqId = useRef(0)

  const load = useCallback(async () => {
    const id = ++reqId.current
    setLoading(true)
    setError('')
    try {
      if (isAdmin) {
        const data = await fetchMonthAdmin(year, month)
        if (id !== reqId.current) return
        setBySlot(data.bySlot)
        setCaps(data.caps)
        setBlocked(data.blocked)
      } else {
        const data = await fetchAvailability(year, month)
        if (id !== reqId.current) return
        setAvailSlots(data.slots)
        setBlocked(data.blocked)
      }
    } catch (e) {
      if (id !== reqId.current) return
      setError(errMessage(e))
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [isAdmin, year, month])

  useEffect(() => {
    load()
  }, [load])

  const key = (date: string, time: string) => `${date}|${time}`

  const capacityOf = (date: string, time: string) =>
    isAdmin ? caps[key(date, time)] ?? 1 : availSlots[key(date, time)]?.capacity ?? 1
  const bookedCount = (date: string, time: string) =>
    isAdmin ? bySlot[key(date, time)]?.length ?? 0 : availSlots[key(date, time)]?.booked ?? 0
  const bookingsAt = (date: string, time: string): Booking[] | null =>
    isAdmin ? bySlot[key(date, time)] ?? [] : null
  const isBlocked = (date: string) => blocked.indexOf(date) >= 0

  const book = async (input: BookingInput): Promise<ActionResult> => {
    try {
      if (isAdmin) await adminCreateBooking(input)
      else await bookSlot(input)
      await load()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errMessage(e) }
    }
  }

  const updateBooking = async (id: string, input: BookingInput): Promise<ActionResult> => {
    try {
      await adminUpdateBooking(id, input)
      await load()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errMessage(e) }
    }
  }

  const cancel = async (booking: Booking, adminOverride: boolean): Promise<ActionResult> => {
    if (!adminOverride && hoursOut(booking.date, booking.time) < (config.cancelWindowHours ?? 12)) {
      return { ok: false, error: 'Seansa ' + (config.cancelWindowHours ?? 12) + ' saatten az kaldı — lütfen stüdyoyu arayın.' }
    }
    try {
      if (adminOverride) await adminDeleteBooking(booking.id)
      else await cancelBookingResident(booking.id, booking.villa)
      await load()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errMessage(e) }
    }
  }

  const setCapacity = async (date: string, time: string, delta: number): Promise<void> => {
    const cur = capacityOf(date, time)
    const next = Math.max(bookedCount(date, time), Math.min(4, cur + delta))
    if (next === cur) return
    try {
      await adminSetCapacity(date, time, next)
      await load()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  const toggleBlocked = async (date: string): Promise<void> => {
    try {
      await adminSetBlocked(date, !isBlocked(date))
      await load()
    } catch (e) {
      setError(errMessage(e))
    }
  }

  const lookupVilla = (villa: string) => fetchVillaBookings(villa)

  return {
    role,
    config,
    year,
    month,
    selected,
    loading,
    error,
    setSelected,
    prevMonth: () => {
      setMonth((m) => (m === 0 ? 11 : m - 1))
      setYear((y) => (month === 0 ? y - 1 : y))
    },
    nextMonth: () => {
      setMonth((m) => (m === 11 ? 0 : m + 1))
      setYear((y) => (month === 11 ? y + 1 : y))
    },
    refresh: load,
    capacityOf,
    bookedCount,
    bookingsAt,
    isBlocked,
    book,
    updateBooking,
    cancel,
    setCapacity,
    toggleBlocked,
    lookupVilla,
  }
}
