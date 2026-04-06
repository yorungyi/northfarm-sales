import { supabase } from './supabase'
import type { DailySales } from '../types/sales'
import type { MonthlyClosing } from '../types/closing'
import { Venue } from '../types/sales'

/** 일매출 upsert — 같은 날 같은 업장은 덮어씀 */
export async function upsertSales(
  date: string,
  venue: Venue,
  foodSales: number,
  storeSales: number,
): Promise<void> {
  const { error } = await supabase
    .from('daily_sales')
    .upsert(
      { sale_date: date, venue, food_sales: foodSales, store_sales: storeSales },
      { onConflict: 'sale_date,venue' },
    )
  if (error) throw error
}

/** 특정 날짜의 4개 업장 데이터 조회 */
export async function getSalesByDate(date: string): Promise<DailySales[]> {
  const { data, error } = await supabase
    .from('daily_sales')
    .select('*')
    .eq('sale_date', date)
  if (error) throw error
  return (data ?? []) as DailySales[]
}

/** 특정 달 전체 데이터 조회 (YYYY-MM) */
export async function getSalesByMonth(year: number, month: number): Promise<DailySales[]> {
  const monthStr = String(month).padStart(2, '0')
  const startDate = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const endDate   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('daily_sales')
    .select('*')
    .gte('sale_date', startDate)
    .lt('sale_date', endDate)
    .order('sale_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as DailySales[]
}

/** 월 가마감 단건 조회 */
export async function getMonthlyClosing(year: number, month: number): Promise<MonthlyClosing | null> {
  const { data, error } = await supabase
    .from('monthly_closing')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (error) throw error
  return data as MonthlyClosing | null
}

/** 월 가마감 upsert */
export async function upsertMonthlyClosing(
  closing: Omit<MonthlyClosing, 'id' | 'created_at' | 'updated_at'>
): Promise<void> {
  const { error } = await supabase
    .from('monthly_closing')
    .upsert(
      { ...closing, updated_at: new Date().toISOString() },
      { onConflict: 'year,month' }
    )
  if (error) throw error
}
