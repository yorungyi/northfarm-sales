import { supabase } from './supabase'
import type { DailySales } from '../types/sales'
import type { MonthlyClosing } from '../types/closing'
import { Venue, VENUES } from '../types/sales'

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

// ── 일별 메모·내장객 수 (daily_notes) ───────────────────────

/** 일별 부가정보 — 내장객 수 + 업장별 메모 */
export interface DailyNote {
  guest_count: number
  memos: Record<string, string>
}

/** 특정 날짜의 메모·내장객 수 조회 — 없으면 null */
export async function getDailyNote(date: string): Promise<DailyNote | null> {
  const { data, error } = await supabase
    .from('daily_notes')
    .select('guest_count,memos')
    .eq('sale_date', date)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const row = data as { guest_count: number | null; memos: Record<string, string> | null }
  return {
    guest_count: row.guest_count ?? 0,
    memos: row.memos ?? {},
  }
}

/** 일별 메모·내장객 수 upsert — 같은 날짜는 덮어씀 */
export async function upsertDailyNote(
  date: string,
  guestCount: number,
  memos: Record<string, string>,
): Promise<void> {
  const { error } = await supabase
    .from('daily_notes')
    .upsert(
      {
        sale_date: date,
        guest_count: guestCount,
        memos,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sale_date' },
    )
  if (error) throw error
}

/** 메모·내장객 수(daily_notes) 저장 처리 결과 */
export type NoteSaveStatus =
  | 'saved'    // 정상 저장됨
  | 'failed'   // 저장 시도했으나 실패 (매출 저장은 성공)
  | 'skipped'  // 호출부 요청으로 저장하지 않음 (서버의 기존 값 보존)

/** 일매출 입력 1건 저장 결과 */
export interface SaveDailyEntryResult {
  noteStatus: NoteSaveStatus
}

/** saveDailyEntry 옵션 */
export interface SaveDailyEntryOptions {
  /**
   * true면 daily_notes 저장을 건너뛴다.
   * 메모·내장객 수를 불러오지 못한 상태에서 빈 값으로 덮어쓰는 사고를 막기 위한 용도.
   */
  skipNote?: boolean
}

/**
 * 일매출 입력 1건 통합 저장.
 * - 매출(daily_sales) 저장은 **필수** — 하나라도 실패하면 reject 되어 호출부가 오프라인 큐로 처리한다.
 * - 메모·내장객 수(daily_notes) 저장은 **부가** — 실패해도 reject 하지 않고 결과로만 알린다.
 *   (daily_notes 오류 하나로 이미 성공한 매출 저장까지 실패로 오판하지 않도록 분리)
 */
export async function saveDailyEntry(
  date: string,
  inputs: Record<Venue, number>,
  guestCount: number,
  memos: Record<Venue, string>,
  options: SaveDailyEntryOptions = {},
): Promise<SaveDailyEntryResult> {
  // 1) 매출 저장 (필수) — 전 업장 시도 후 실패가 있으면 첫 오류를 throw
  const salesResults = await Promise.allSettled(
    VENUES.map((venue) => upsertSales(date, venue, inputs[venue] ?? 0, 0)),
  )
  const salesFailure = salesResults.find(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  )
  if (salesFailure) throw salesFailure.reason

  // 2) 메모·내장객 수 저장 (부가) — 요청 시 생략 가능, 실패해도 매출 저장을 무효화하지 않음
  if (options.skipNote) return { noteStatus: 'skipped' }

  // 빈 메모는 저장하지 않아 jsonb를 깔끔하게 유지
  const cleanMemos: Record<string, string> = {}
  for (const venue of VENUES) {
    const memo = (memos[venue] ?? '').trim()
    if (memo) cleanMemos[venue] = memo
  }

  try {
    await upsertDailyNote(date, guestCount, cleanMemos)
    return { noteStatus: 'saved' }
  } catch {
    return { noteStatus: 'failed' }
  }
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

/** 날짜 범위 조회 (startDate 이상 endDate 미만, YYYY-MM-DD) */
export async function getSalesByRange(startDate: string, endDate: string): Promise<DailySales[]> {
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

/** 최근 N개월 가마감 조회 (오래된 순) */
export async function getRecentClosings(count: number): Promise<MonthlyClosing[]> {
  const { data, error } = await supabase
    .from('monthly_closing')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(count)
  if (error) throw error
  return ((data ?? []) as MonthlyClosing[]).reverse()
}

export interface ClosingTargetRow {
  year: number
  month: number
  sales_target: number
  food_cost_target: number
  labor_target: number
  manufacturing_target: number
}

/** 목표 단건 조회 */
export async function getClosingTarget(year: number, month: number): Promise<ClosingTargetRow | null> {
  const { data, error } = await supabase
    .from('closing_target')
    .select('year,month,sales_target,food_cost_target,labor_target,manufacturing_target')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()
  if (error) throw error
  return data as ClosingTargetRow | null
}

/** 목표 upsert */
export async function upsertClosingTarget(row: ClosingTargetRow): Promise<void> {
  const { error } = await supabase
    .from('closing_target')
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: 'year,month' }
    )
  if (error) throw error
}
