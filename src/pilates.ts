// Domain model, constants, seed data and pure helpers for the Pilates booking
// calendar. Ported from the original Claude Design Component (Pilates Booking.dc.html).

export interface Booking {
  id: string
  date: string // ISO yyyy-mm-dd
  time: string // HH:00
  /** Owning resident account; null for a guest added by an admin. */
  residentId?: string | null
  first: string
  last: string
  villa: string
  phone: string
}

export type Role = 'resident' | 'admin'
export type Layout = 'overview' | 'expanded'
export type View = 'desktop' | 'mobile'
export type FormMode = 'book' | 'admin-add' | 'edit'

export interface FormState {
  date: string
  time: string
  mode: FormMode
  id?: string
}

export interface FormFields {
  first: string
  last: string
  villa: string
  phone: string
}

export interface Config {
  studioName: string
  communityName: string
  studioPhone: string
  accentColor: string
  cancelWindowHours: number
  showRemaining: boolean
}

export const DEFAULT_CONFIG: Config = {
  studioName: 'Pilates Stüdyosu',
  communityName: 'Yeşilyaka Su · Sadece site sakinleri',
  studioPhone: '+90 232 000 00 00',
  accentColor: '#B0674C',
  cancelWindowHours: 12,
  showRemaining: true,
}

/** Current wall-clock time. Callers use this so "past / soon / future" logic
 *  stays in one place. The studio operates in Europe/Istanbul; the browser's
 *  local time is assumed to match (server-side checks re-validate regardless). */
export function now(): Date {
  return new Date()
}

export const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
export const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
export const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

export const START_H = 8
export const END_H = 20

export function iso(y: number, m: number, d: number): string {
  return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
}

export function times(): string[] {
  const t: string[] = []
  for (let h = START_H; h < END_H; h++) t.push(String(h).padStart(2, '0') + ':00')
  return t
}

export function slotStart(date: string, time: string): Date {
  return new Date(date + 'T' + time + ':00')
}

export function hoursOut(date: string, time: string): number {
  return (slotStart(date, time).getTime() - now().getTime()) / 3600000
}

export function prettyDate(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear()
}

export function timeLabel(t: string): string {
  const h = parseInt(t, 10)
  return t.replace(':', '.') + ' – ' + String(h + 1).padStart(2, '0') + '.00'
}
