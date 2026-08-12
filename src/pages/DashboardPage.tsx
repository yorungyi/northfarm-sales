import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Doughnut, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from 'chart.js'
import { Venue, VENUES } from '../types/sales'
import type { DailySales } from '../types/sales'
import type { MonthlyClosing } from '../types/closing'
import type { ClosingTargetRow, DailyNoteRow } from '../lib/api'
import {
  getSalesByDate,
  getSalesByMonth,
  getSalesByRange,
  getNotesByRange,
  getMonthlyClosing,
  getClosingTarget,
  upsertClosingTarget,
} from '../lib/api'
import { formatCurrency, formatDate, toDateString, calcChangeRate } from '../utils/format'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

// 업장별 색상
const VENUE_COLORS: Record<Venue, string> = {
  [Venue.CLUBHOUSE]:  '#3B82F6', // blue
  [Venue.STARTHOUSE]: '#10B981', // emerald
  [Venue.EAST_SHADE]: '#F59E0B', // amber
  [Venue.WEST_SHADE]: '#8B5CF6', // violet
  [Venue.CLIENT]:     '#EC4899', // rose
}

const VENUE_COLORS_LIGHT: Record<Venue, string> = {
  [Venue.CLUBHOUSE]:  '#DBEAFE',
  [Venue.STARTHOUSE]: '#D1FAE5',
  [Venue.EAST_SHADE]: '#FEF3C7',
  [Venue.WEST_SHADE]: '#EDE9FE',
  [Venue.CLIENT]:     '#FCE7F3',
}

/** 이번 달 가마감 미입력 경고를 띄우기 시작하는 날짜(일) — ClosingPage와 동일 기준 */
const CLOSING_WARN_DAY = 25

/** 요일 라벨 (Date.getDay() 인덱스 순서) */
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** 요일별 평균 매출 차트 색상 — 주말(일·토)만 amber로 구분 */
const WEEKDAY_BAR_COLOR = '#BFDBFE'
const WEEKEND_BAR_COLOR = '#F59E0B'

/** 최근 4주 = 28일 */
const WEEKDAY_RANGE_DAYS = 28

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function buildDonutData(map: Partial<Record<Venue, number>>) {
  const labels = VENUES.map((v) => v)
  const data = VENUES.map((v) => map[v] ?? 0)
  const total = data.reduce((s, n) => s + n, 0)

  return {
    labels,
    data,
    total,
    chartData: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: VENUES.map((v) => VENUE_COLORS[v]),
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    },
  }
}

const DONUT_OPTIONS = {
  cutout: '68%',
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: { label: string; raw: unknown }) =>
          `${ctx.label}: ${Number(ctx.raw).toLocaleString()}원`,
      },
    },
  },
  animation: { duration: 600 },
}

// ── 레거시 월 목표 localStorage (읽기·삭제 전용) ─────────────
// 목표 매출의 정본은 Supabase closing_target.sales_target(천원)이다.
// 아래 키는 구버전 대시보드가 쓰던 값(원 단위)으로, 1회 마이그레이션 후 삭제한다.
function targetKey(year: number, month: number) {
  return `northfarm_target_${year}_${pad2(month)}`
}

/** 레거시 목표(원 단위) 읽기 — 없으면 0 */
function loadLegacyTarget(year: number, month: number): number {
  try {
    return parseInt(localStorage.getItem(targetKey(year, month)) ?? '0', 10) || 0
  } catch {
    return 0
  }
}

/** 마이그레이션 성공 후 레거시 키 제거 */
function clearLegacyTarget(year: number, month: number): void {
  try {
    localStorage.removeItem(targetKey(year, month))
  } catch {
    // 무시
  }
}

/** 원 → 천원 (closing_target.sales_target 단위) */
function wonToThousand(won: number): number {
  return Math.round(won / 1000)
}

/** 천원 → 원 (대시보드 내부 계산 단위) */
function thousandToWon(thousand: number): number {
  return thousand * 1000
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const today = toDateString(new Date())
  const now = new Date()
  const [selYear] = useState(now.getFullYear())
  const [selMonth] = useState(now.getMonth() + 1)

  const [todayMap, setTodayMap] = useState<Partial<Record<Venue, number>>>({})
  const [monthMap, setMonthMap] = useState<Partial<Record<Venue, number>>>({})
  const [prevMonthMap, setPrevMonthMap] = useState<Partial<Record<Venue, number>>>({})
  const [monthRows, setMonthRows] = useState<DailySales[]>([])
  const [lastYearTotal, setLastYearTotal] = useState<number>(0)
  const [weeklyData, setWeeklyData] = useState<{ date: string; total: number }[]>([])
  // 최근 28일 중 데이터가 있는 날만 (요일별 평균 계산용)
  const [recentDayTotals, setRecentDayTotals] = useState<{ date: string; total: number }[]>([])
  const [notes, setNotes] = useState<DailyNoteRow[]>([])
  const [closingRow, setClosingRow] = useState<MonthlyClosing | null>(null)
  // 가마감 조회가 성공적으로 끝났는지 — 로딩 중·조회 실패 시 경고 배너를 그리지 않기 위한 플래그
  const [closingLoaded, setClosingLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  // 일부 조회 실패 여부 — 빈 화면을 정상 데이터로 오해하지 않게 표시
  const [loadFailed, setLoadFailed] = useState(false)

  // 목표 매출 (원 단위) — 정본은 Supabase closing_target.sales_target(천원)
  const [target, setTarget] = useState(0)
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [targetSaving, setTargetSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ── 매출·메모·가마감 로드 ──────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadFailed(false)
    setClosingLoaded(false)

    // 최근 28일 범위 (오늘 포함) — 최근 7일 차트도 이 결과에서 파생시킨다
    const end = new Date(today + 'T00:00:00')
    end.setDate(end.getDate() + 1)
    const start = new Date(today + 'T00:00:00')
    start.setDate(start.getDate() - (WEEKDAY_RANGE_DAYS - 1))
    const startStr = toDateString(start)
    const endStr = toDateString(end)

    // 최근 7일 날짜 배열 (오늘 포함)
    const last7: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today + 'T00:00:00')
      d.setDate(d.getDate() - i)
      last7.push(toDateString(d))
    }

    // 전월 — 1월이면 전년 12월로 보정 (setMonth 롤오버 회피)
    const prevMonth = selMonth === 1 ? 12 : selMonth - 1
    const prevYear  = selMonth === 1 ? selYear - 1 : selYear

    // 이번 달 범위 (메모·내장객 수 조회용)
    const monthStart = `${selYear}-${pad2(selMonth)}-01`
    const nextMonth  = selMonth === 12 ? 1 : selMonth + 1
    const nextYear   = selMonth === 12 ? selYear + 1 : selYear
    const monthEnd   = `${nextYear}-${pad2(nextMonth)}-01`

    // allSettled — 조회 하나가 실패해도 나머지 화면은 정상 표시한다
    Promise.allSettled([
      getSalesByDate(today),
      getSalesByMonth(selYear, selMonth),
      getSalesByMonth(selYear - 1, selMonth), // 전년 동월
      getSalesByMonth(prevYear, prevMonth),   // 전월
      getSalesByRange(startStr, endStr),      // 최근 28일
      getNotesByRange(monthStart, monthEnd),  // 이번 달 메모·내장객 수
      getMonthlyClosing(selYear, selMonth),   // 가마감 입력 여부
    ]).then(([rToday, rMonth, rLastYear, rPrev, rRange, rNotes, rClosing]) => {
      if (cancelled) return

      let anyFailed = false

      // 오늘
      if (rToday.status === 'fulfilled') {
        const tm: Partial<Record<Venue, number>> = {}
        for (const r of rToday.value) tm[r.venue as Venue] = r.total_sales
        setTodayMap(tm)
      } else {
        anyFailed = true
      }

      // 이번 달 업장별 합산
      if (rMonth.status === 'fulfilled') {
        const mm: Partial<Record<Venue, number>> = {}
        for (const r of rMonth.value) {
          mm[r.venue as Venue] = (mm[r.venue as Venue] ?? 0) + r.total_sales
        }
        setMonthMap(mm)
        setMonthRows(rMonth.value)
      } else {
        anyFailed = true
      }

      // 전년 동월 합계
      if (rLastYear.status === 'fulfilled') {
        setLastYearTotal(rLastYear.value.reduce((s, r) => s + r.total_sales, 0))
      } else {
        anyFailed = true
      }

      // 전월 업장별 합산
      if (rPrev.status === 'fulfilled') {
        const pm: Partial<Record<Venue, number>> = {}
        for (const r of rPrev.value) {
          pm[r.venue as Venue] = (pm[r.venue as Venue] ?? 0) + r.total_sales
        }
        setPrevMonthMap(pm)
      } else {
        anyFailed = true
      }

      // 최근 28일 → 일별 합계 (최근 7일 차트 + 요일별 평균 공용)
      if (rRange.status === 'fulfilled') {
        const dayTotals = new Map<string, number>()
        for (const r of rRange.value) {
          dayTotals.set(r.sale_date, (dayTotals.get(r.sale_date) ?? 0) + r.total_sales)
        }
        setWeeklyData(last7.map((date) => ({ date, total: dayTotals.get(date) ?? 0 })))
        setRecentDayTotals([...dayTotals].map(([date, total]) => ({ date, total })))
      } else {
        anyFailed = true
      }

      // 메모·내장객 수
      if (rNotes.status === 'fulfilled') {
        setNotes(rNotes.value)
      } else {
        anyFailed = true
      }

      // 가마감 — 성공했을 때만 경고 배너 판정을 허용
      if (rClosing.status === 'fulfilled') {
        setClosingRow(rClosing.value)
        setClosingLoaded(true)
      } else {
        anyFailed = true
      }

      setLoadFailed(anyFailed)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [today, selYear, selMonth])

  // ── 목표 매출 로드 (Supabase closing_target 단일 소스) ──────
  useEffect(() => {
    let cancelled = false

    getClosingTarget(selYear, selMonth).then((row) => {
      if (cancelled) return

      // 1) Supabase에 행이 있으면 마이그레이션은 끝난 것으로 간주 — 값이 0이어도(사용자가
      //    ClosingPage에서 목표를 지운 경우 포함) 레거시 값을 더 이상 쓰지 않도록 즉시 정리한다.
      //    그렇지 않으면 지운 목표가 레거시 키에서 되살아나 Supabase를 다시 덮어쓰는 문제가 있었다.
      if (row !== null) {
        clearLegacyTarget(selYear, selMonth)
        setTarget(thousandToWon(row.sales_target))
        return
      }

      // 2) Supabase에 행 자체가 없을 때만 레거시 localStorage 값(원 단위)을 1회 마이그레이션
      const legacyWon = loadLegacyTarget(selYear, selMonth)
      if (legacyWon <= 0) {
        setTarget(0)
        return
      }

      setTarget(legacyWon) // 화면에는 즉시 반영
      // 이 분기는 Supabase에 closing_target 행 자체가 없을 때만 진입하므로(위 1번 분기 참고)
      // 보존할 기존 food/labor/manufacturing 목표가 없다 — 전부 0으로 신규 생성한다.
      const migrated: ClosingTargetRow = {
        year: selYear,
        month: selMonth,
        sales_target: wonToThousand(legacyWon),
        food_cost_target: 0,
        labor_target: 0,
        manufacturing_target: 0,
      }
      upsertClosingTarget(migrated)
        .then(() => clearLegacyTarget(selYear, selMonth)) // 성공했을 때만 삭제
        .catch(() => {
          // 이전 실패 — localStorage 값은 유지해 다음 기회에 재시도
        })
    }).catch(() => {
      // 조회 실패 — 목표를 0으로 덮어쓰지 않고 그대로 둔다 (저장 시 최신 행을 다시 읽는다)
    })

    return () => { cancelled = true }
  }, [selYear, selMonth])

  const todayDonut = buildDonutData(todayMap)
  const monthDonut = buildDonutData(monthMap)

  // 입력일수 계산
  const inputDays = new Set(monthRows.map((r) => r.sale_date)).size

  const todayNum = parseInt(today.split('-')[2], 10)
  const daysInMonth = new Date(selYear, selMonth, 0).getDate()

  // 미입력일 — 오늘 이전(지난 날짜) 중 데이터가 없는 날. MonthlyPage의 missing 표시와 동일 기준
  const enteredDates = new Set(monthRows.map((r) => r.sale_date))
  let missingDays = 0
  for (let d = 1; d < todayNum; d++) {
    if (!enteredDates.has(`${selYear}-${pad2(selMonth)}-${pad2(d)}`)) missingDays++
  }

  // 최고 업장 (이번달)
  const topVenue = VENUES.reduce((best, v) =>
    (monthMap[v] ?? 0) > (monthMap[best] ?? 0) ? v : best
  , VENUES[0])

  // 객단가 = 순매출 ÷ 내장객 수
  // (내장객 수 또는 매출이 없으면 '-' 처리 — 0원 객단가로 오해되지 않게 한다)
  const monthGuestTotal = notes.reduce((s, n) => s + n.guest_count, 0)
  const monthPerGuest = monthGuestTotal > 0 && monthDonut.total > 0
    ? Math.round(monthDonut.total / monthGuestTotal)
    : null
  const todayGuest = notes.find((n) => n.sale_date === today)?.guest_count ?? 0
  const todayPerGuest = todayGuest > 0 && todayDonut.total > 0
    ? Math.round(todayDonut.total / todayGuest)
    : null

  // 요일별 평균 매출 — 매출이 실제로 입력된(0원 초과) 날만 평균에 포함
  // (daily_sales는 행이 있어도 전 업장 0원으로 저장될 수 있어 "행 존재"만으로는 휴장일을 걸러내지 못한다)
  const weekdayStats = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }))
  for (const d of recentDayTotals) {
    if (d.total <= 0) continue
    const dow = new Date(d.date + 'T00:00:00').getDay()
    weekdayStats[dow].sum += d.total
    weekdayStats[dow].count += 1
  }
  const weekdayAvg = weekdayStats.map((s) => (s.count > 0 ? Math.round(s.sum / s.count) : 0))
  const hasWeekdayData = weekdayAvg.some((v) => v > 0)

  // 최근 특이사항 — 메모가 있는 날짜만 최신순 5개
  const memoItems = notes
    .map((n) => ({
      date: n.sale_date,
      entries: VENUES
        .map((venue) => ({ venue, memo: (n.memos[venue] ?? '').trim() }))
        .filter((e) => e.memo !== ''),
    }))
    .filter((item) => item.entries.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)

  // ⚠️ 이번 달 가마감 미입력 경고 — ClosingPage와 동일 조건 (로딩 완료 전에는 그리지 않음)
  const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth() + 1
  const closingExists = closingRow !== null
  const closingSalesTotal = closingRow?.sales_total ?? 0
  const showClosingWarning =
    closingLoaded &&
    isCurrentMonth &&
    !closingExists &&
    closingSalesTotal === 0 &&
    todayNum >= CLOSING_WARN_DAY

  // 목표 달성률 계산
  const achieveRate = target > 0 ? Math.min(Math.round((monthDonut.total / target) * 100), 100) : 0
  // 오늘 매출 입력 완료 시 오늘 제외, 미입력 시 오늘 포함
  const remainDays = todayDonut.total > 0
    ? daysInMonth - todayNum
    : daysInMonth - todayNum + 1
  const remainAmount = Math.max(target - monthDonut.total, 0)
  const dailyNeed = remainDays > 0 && remainAmount > 0
    ? Math.round(remainAmount / remainDays / 10000) // 만원 단위
    : 0

  /**
   * 목표 저장 — closing_target의 최신 행을 다시 읽어 sales_target만 교체한다.
   * (식재비·인건비·제조경비 목표를 0으로 덮어쓰지 않기 위함)
   */
  async function handleTargetSave() {
    const val = parseInt(targetInput.replace(/,/g, ''), 10)
    if (isNaN(val) || val <= 0) {
      setEditingTarget(false)
      return
    }
    const won = val * 10000 // 만원 입력 → 원

    setTargetSaving(true)
    try {
      const row = await getClosingTarget(selYear, selMonth)
      await upsertClosingTarget({
        year: selYear,
        month: selMonth,
        sales_target: wonToThousand(won),
        food_cost_target: row?.food_cost_target ?? 0,
        labor_target: row?.labor_target ?? 0,
        manufacturing_target: row?.manufacturing_target ?? 0,
      })
      setTarget(won)
      setEditingTarget(false)
      setToast({ message: '목표가 저장되었습니다', type: 'success' })
    } catch {
      // 실패 시 편집 상태를 유지해 재시도할 수 있게 한다 (기존 값은 그대로)
      setToast({ message: '목표 저장에 실패했습니다. 다시 시도해주세요', type: 'error' })
    } finally {
      setTargetSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {toast !== null && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4">
          <p className="text-xs text-gray-400">노스팜CC</p>
          <h1 className="text-lg font-bold text-gray-900">매출 대시보드</h1>
        </div>
      </header>

      {/* ⚠️ 이번 달 가마감 미입력 경고 */}
      {showClosingWarning ? (
        <div className="px-4 pt-4 max-w-lg mx-auto">
          <button
            onClick={() => navigate('/closing')}
            className="w-full text-left bg-amber-50 rounded-2xl p-4 shadow-sm border border-amber-200 active:bg-amber-100 transition-colors"
          >
            <p className="text-sm font-bold text-amber-700">
              ⚠️ 이번 달 가마감이 아직 입력되지 않았습니다
            </p>
            <p className="mt-1 text-xs text-amber-600">
              {selYear}년 {selMonth}월 손익 예상치를 입력하고 저장해주세요. (탭하면 가마감으로 이동)
            </p>
          </button>
        </div>
      ) : null}

      {/* 일부 데이터 조회 실패 안내 */}
      {!loading && loadFailed ? (
        <div className="px-4 pt-4 max-w-lg mx-auto">
          <div className="bg-red-50 rounded-2xl p-4 shadow-sm border border-red-200">
            <p className="text-sm font-bold text-red-600">일부 데이터를 불러오지 못했습니다</p>
            <p className="mt-1 text-xs text-red-500">
              화면의 일부 수치가 비어 있을 수 있습니다. 새로고침해주세요.
            </p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="py-20 text-center text-sm text-gray-400">데이터 불러오는 중...</div>
      ) : (
        <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">

          {/* 이번 달 메인 도넛 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400">{selMonth}월 누적 순매출</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(monthDonut.total)}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-gray-400">{inputDays}일 입력 완료</p>
                  {missingDays > 0 && (
                    <button
                      onClick={() => navigate('/monthly')}
                      className="text-xs font-semibold text-red-500 underline underline-offset-2"
                    >
                      {missingDays}일 미입력
                    </button>
                  )}
                  {/* 전년 동월 대비 */}
                  {(() => {
                    const yoy = calcChangeRate(monthDonut.total, lastYearTotal)
                    if (yoy === null) return null
                    return (
                      <span className={`text-xs font-semibold ${yoy >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        전년 {yoy >= 0 ? '↑' : '↓'}{Math.abs(yoy)}%
                      </span>
                    )
                  })()}
                </div>
                {/* 객단가 = 순매출 ÷ 내장객 수 */}
                <p className="text-xs text-gray-400 mt-0.5">
                  객단가{' '}
                  <span className="font-semibold text-gray-600">
                    {monthPerGuest !== null ? `${monthPerGuest.toLocaleString()}원` : '-'}
                  </span>
                  {monthGuestTotal > 0 && (
                    <span className="text-gray-300"> · 내장객 {monthGuestTotal.toLocaleString()}명</span>
                  )}
                </p>
              </div>
              <span className="text-xs bg-blue-50 text-blue-600 font-medium px-2.5 py-1 rounded-full shrink-0">
                최고 {topVenue}
              </span>
            </div>

            {monthDonut.total > 0 ? (
              <div className="flex items-center gap-6">
                {/* 도넛 */}
                <div className="relative w-36 h-36 shrink-0">
                  <Doughnut data={monthDonut.chartData} options={DONUT_OPTIONS} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-[10px] text-gray-400">합계</p>
                    <p className="text-xs font-bold text-gray-800 leading-tight">
                      {(monthDonut.total / 10000).toFixed(0)}만원
                    </p>
                  </div>
                </div>

                {/* 범례 */}
                <div className="flex-1 space-y-2">
                  {VENUES.map((venue) => {
                    const net = monthMap[venue] ?? 0
                    const pct = monthDonut.total > 0 ? Math.round((net / monthDonut.total) * 100) : 0
                    return (
                      <div key={venue} className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: VENUE_COLORS[venue] }}
                        />
                        <span className="text-xs text-gray-600 flex-1 truncate">{venue}</span>
                        <span className="text-xs font-medium text-gray-800">{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="text-center text-sm text-gray-300 py-6">이번 달 데이터 없음</p>
            )}
          </div>

          {/* 오늘 서브 도넛 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400">{formatDate(today)}</p>
                <p className="text-base font-bold text-gray-900">{formatCurrency(todayDonut.total)}</p>
                {todayPerGuest !== null && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    객단가{' '}
                    <span className="font-semibold text-gray-600">
                      {todayPerGuest.toLocaleString()}원
                    </span>
                    <span className="text-gray-300"> · 내장객 {todayGuest.toLocaleString()}명</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => navigate('/input')}
                className="text-xs text-blue-600 font-medium px-3 py-1.5 rounded-lg border border-blue-200 active:bg-blue-50"
              >
                {todayDonut.total > 0 ? '수정' : '입력'}
              </button>
            </div>

            {todayDonut.total > 0 ? (
              <div className="flex items-center gap-6">
                <div className="relative w-28 h-28 shrink-0">
                  <Doughnut data={todayDonut.chartData} options={DONUT_OPTIONS} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-[10px] text-gray-400">오늘</p>
                    <p className="text-xs font-bold text-gray-800 leading-tight">
                      {(todayDonut.total / 10000).toFixed(0)}만원
                    </p>
                  </div>
                </div>

                <div className="flex-1 space-y-2">
                  {VENUES.map((venue) => {
                    const net = todayMap[venue] ?? 0
                    return (
                      <div key={venue} className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: VENUE_COLORS[venue] }}
                        />
                        <span className="text-xs text-gray-500 flex-1 truncate">{venue}</span>
                        <span className="text-xs font-medium text-gray-800">
                          {net > 0 ? net.toLocaleString() + '원' : '-'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 gap-2">
                <p className="text-sm text-gray-300">오늘 데이터 미입력</p>
              </div>
            )}
          </div>

          {/* 목표 달성률 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-400">{selMonth}월 목표 달성률</p>
              {editingTarget ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={targetInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '')
                      if (raw === '' || /^\d+$/.test(raw)) {
                        setTargetInput(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'))
                      }
                    }}
                    placeholder="목표 만원"
                    autoFocus
                    className="w-28 text-right px-2 py-1 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <span className="text-xs text-gray-400">만원</span>
                  <button
                    onClick={() => { void handleTargetSave() }}
                    disabled={targetSaving}
                    className="text-xs text-white bg-blue-600 px-2.5 py-1 rounded-lg font-medium disabled:opacity-50"
                  >
                    {targetSaving ? '저장 중' : '확인'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setTargetInput(target > 0 ? (target / 10000).toLocaleString('ko-KR') : '')
                    setEditingTarget(true)
                  }}
                  className="text-xs text-blue-600 font-medium px-2.5 py-1 rounded-lg border border-blue-200 active:bg-blue-50"
                >
                  {target > 0 ? `목표 ${(target / 10000).toLocaleString()}만원` : '목표 설정'}
                </button>
              )}
            </div>

            {target > 0 ? (
              <>
                {/* 프로그레스 바 */}
                <div className="w-full bg-gray-100 rounded-full h-3 mb-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-700 ${
                      achieveRate >= 100 ? 'bg-emerald-500' : achieveRate >= 70 ? 'bg-blue-500' : 'bg-amber-400'
                    }`}
                    style={{ width: `${achieveRate}%` }}
                  />
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{achieveRate}%</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {monthDonut.total > 0
                        ? `${Math.round(monthDonut.total / 10000).toLocaleString()}만 / ${(target / 10000).toLocaleString()}만원`
                        : '아직 입력 없음'}
                    </p>
                  </div>
                  {achieveRate < 100 && dailyNeed > 0 && (
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-700">{dailyNeed.toLocaleString()}만원</p>
                      <p className="text-xs text-gray-400">
                        {todayDonut.total > 0 ? `내일부터 ${remainDays}일` : `오늘부터 ${remainDays}일`} 일평균 필요
                      </p>
                    </div>
                  )}
                  {achieveRate >= 100 && (
                    <p className="text-sm font-bold text-emerald-500">목표 달성!</p>
                  )}
                </div>
                <p className="text-[10px] text-gray-300 mt-2">가마감 화면의 목표 매출과 동일한 값입니다</p>
              </>
            ) : (
              <p className="text-sm text-gray-300 text-center py-2">목표를 설정하면 달성률을 확인할 수 있습니다</p>
            )}
          </div>

          {/* 최근 7일 트렌드 */}
          {weeklyData.some((d) => d.total > 0) && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-gray-400 mb-3">최근 7일 매출 추이</p>
              <Bar
                data={{
                  labels: weeklyData.map((d) => {
                    const [, mm, dd] = d.date.split('-')
                    return `${parseInt(mm)}/${parseInt(dd)}`
                  }),
                  datasets: [
                    {
                      data: weeklyData.map((d) => Math.round(d.total / 10000)), // 만원 단위
                      backgroundColor: weeklyData.map((d) =>
                        d.date === today ? '#3B82F6' : '#BFDBFE'
                      ),
                      borderRadius: 6,
                      borderSkipped: false,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `${Number(ctx.raw).toLocaleString()}만원`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      grid: { display: false },
                      ticks: { font: { size: 11 } },
                    },
                    y: {
                      grid: { color: '#F3F4F6' },
                      ticks: {
                        font: { size: 11 },
                        callback: (v) => `${v}만`,
                      },
                    },
                  },
                }}
              />
            </div>
          )}

          {/* 요일별 평균 매출 (최근 4주) */}
          {hasWeekdayData && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-400">요일별 평균 매출 (최근 4주)</p>
                <span className="text-[10px] text-amber-500 font-semibold">■ 주말</span>
              </div>
              <Bar
                data={{
                  labels: WEEKDAY_LABELS,
                  datasets: [
                    {
                      data: weekdayAvg.map((v) => Math.round(v / 10000)), // 만원 단위
                      backgroundColor: WEEKDAY_LABELS.map((_, dow) =>
                        dow === 0 || dow === 6 ? WEEKEND_BAR_COLOR : WEEKDAY_BAR_COLOR
                      ),
                      borderRadius: 6,
                      borderSkipped: false,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `${Number(ctx.raw).toLocaleString()}만원`,
                      },
                    },
                  },
                  scales: {
                    x: {
                      grid: { display: false },
                      ticks: { font: { size: 11 } },
                    },
                    y: {
                      grid: { color: '#F3F4F6' },
                      ticks: {
                        font: { size: 11 },
                        callback: (v) => `${v}만`,
                      },
                    },
                  },
                }}
              />
              <p className="text-[10px] text-gray-300 mt-2">매출이 입력된 날만 평균에 포함됩니다</p>
            </div>
          )}

          {/* 최근 특이사항 (비고) */}
          {memoItems.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-bold text-gray-400 mb-3">최근 특이사항</p>
              <div className="space-y-2">
                {memoItems.map((item) => {
                  const [, mm, dd] = item.date.split('-')
                  return (
                    <div key={item.date} className="flex gap-2 items-start">
                      <span className="text-xs font-semibold text-gray-500 shrink-0 w-9">
                        {parseInt(mm)}/{parseInt(dd)}
                      </span>
                      <span className="text-xs text-gray-700 flex-1 break-words">
                        {item.entries.map((e) => `${e.venue}: ${e.memo}`).join(', ')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 업장별 이번달 카드 */}
          <div className="grid grid-cols-2 gap-3">
            {VENUES.map((venue) => {
              const net = monthMap[venue] ?? 0
              const pct = monthDonut.total > 0 ? Math.round((net / monthDonut.total) * 100) : 0
              const prevNet = prevMonthMap[venue] ?? 0
              const delta = calcChangeRate(net, prevNet)
              return (
                <div
                  key={venue}
                  className="rounded-2xl p-4 border"
                  style={{
                    backgroundColor: VENUE_COLORS_LIGHT[venue],
                    borderColor: VENUE_COLORS[venue] + '33',
                  }}
                >
                  <div
                    className="text-xs font-semibold mb-2"
                    style={{ color: VENUE_COLORS[venue] }}
                  >
                    {venue}
                  </div>
                  <p className="text-sm font-bold text-gray-800">
                    {net > 0 ? net.toLocaleString() + '원' : '-'}
                  </p>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-gray-400">{pct}% 비중</p>
                    {delta !== null && (
                      <span className={`text-[11px] font-semibold whitespace-nowrap ${
                        delta >= 0 ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        전월 {delta >= 0 ? '↑' : '↓'}{Math.abs(delta)}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 text-center">
            ※ 전월 대비는 전월 <span className="font-semibold">전체</span> 실적과 이번 달 누적 실적을 비교한 값입니다
          </p>

        </div>
      )}

      <BottomNav />
    </div>
  )
}
