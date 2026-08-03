// Domain model, constants, seed data and pure helpers for the Pilates booking
// calendar. Ported from the original Claude Design Component (Pilates Booking.dc.html).

export interface Booking {
  id: string
  date: string // ISO yyyy-mm-dd
  time: string // HH:00
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

// Fixed "now" so the demo always presents a consistent past/present/future.
export const NOW = new Date('2026-08-03T09:30:00')

export const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
export const DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
export const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

export const START_H = 8
export const END_H = 20

const SEED: Array<[string, string, string, string, string, string]> = [
  ['2026-08-03', '08:00', 'Elif', 'Yılmaz', 'A-02', '+90 532 114 22 88'],
  ['2026-08-03', '17:00', 'Mert', 'Demir', 'C-11', ''],
  ['2026-08-04', '09:00', 'Selin', 'Kaya', 'B-14', '+90 555 902 77 41'],
  ['2026-08-04', '10:00', 'Zeynep', 'Arslan', 'D-07', ''],
  ['2026-08-04', '18:00', 'Can', 'Öztürk', 'A-09', '+90 542 330 11 90'],
  ['2026-08-05', '08:00', 'Selin', 'Kaya', 'B-14', '+90 555 902 77 41'],
  ['2026-08-06', '11:00', 'Deniz', 'Aydın', 'B-03', ''],
  ['2026-08-06', '12:00', 'Emre', 'Şahin', 'C-05', '+90 536 771 00 34'],
  ['2026-08-06', '19:00', 'Ece', 'Koç', 'D-12', ''],
  ['2026-08-07', '09:00', 'Selin', 'Kaya', 'B-14', '+90 555 902 77 41'],
  ['2026-08-07', '15:00', 'Burak', 'Yıldız', 'A-15', ''],
  ['2026-08-10', '08:00', 'Merve', 'Çelik', 'C-08', '+90 534 220 88 17'],
  ['2026-08-11', '13:00', 'Ayşe', 'Polat', 'B-21', ''],
  ['2026-08-12', '10:00', 'Selin', 'Kaya', 'B-14', '+90 555 902 77 41'],
  ['2026-08-12', '16:00', 'Kerem', 'Tunç', 'D-02', ''],
  ['2026-08-13', '08:00', 'Nil', 'Erdem', 'A-06', ''],
  ['2026-08-14', '18:00', 'Barış', 'Acar', 'C-19', '+90 532 664 33 21'],
  ['2026-08-18', '09:00', 'Pelin', 'Güneş', 'B-08', ''],
  ['2026-08-20', '11:00', 'Onur', 'Kılıç', 'D-15', ''],
  ['2026-08-25', '17:00', 'Sude', 'Aksoy', 'A-11', ''],
]

export function seedBookings(): Booking[] {
  return SEED.map((b, i) => ({
    id: 'b' + i,
    date: b[0],
    time: b[1],
    first: b[2],
    last: b[3],
    villa: b[4],
    phone: b[5],
  }))
}

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
  return (slotStart(date, time).getTime() - NOW.getTime()) / 3600000
}

export function prettyDate(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear()
}

export function timeLabel(t: string): string {
  const h = parseInt(t, 10)
  return t.replace(':', '.') + ' – ' + String(h + 1).padStart(2, '0') + '.00'
}
