import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
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
import { formatCurrency, formatDate, toDateString, calcChangeRate, formatKoreanWon } from '../utils/format'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'
import { SectionHead, Stat } from '../components/Ledger'
import {
  VENUE_SWATCH, BTN_OUTLINE, BTN_FILLED, INPUT, CARD, ALERT, CHIP_BAD, CHIP_NEUTRAL,
  formatDelta, deltaChip, readChartTokens, barOptions,
} from '../lib/ledger'

ChartJS.register(Tooltip, Legend, BarElement, CategoryScale, LinearScale)

/** 이번 달 가마감 미입력 경고를 띄우기 시작하는 날짜(일) — ClosingPage와 동일 기준 */
const CLOSING_WARN_DAY = 25

/** 요일 라벨 (Date.getDay() 인덱스 순서) */
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** 최근 4주 = 28일 */
const WEEKDAY_RANGE_DAYS = 28

/** 대시보드 월 선택 탭에 노출할 개월 수 (이번 달 포함, 과거 방향) */
const MONTH_TAB_COUNT = 12

/**
 * 최근 count개월 목록 (오래된 달 → 이번 달 순).
 * 각 달의 1일을 기준으로 계산해 31일 등 말일에 실행해도 월이 건너뛰거나 중복되지 않는다.
 * (MonthlyPage·ClosingPage와 동일 규칙)
 */
function getRecentMonths(count: number): { year: number; month: number }[] {
  const now = new Date()
  const result: { year: number; month: number }[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.unshift({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return result
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 업장별 금액 맵의 합계 (도넛을 걷어낸 뒤에도 기존 변수명을 유지하기 위해 이름은 그대로 둔다) */
function buildDonutData(map: Partial<Record<Venue, number>>) {
  const data = VENUES.map((v) => map[v] ?? 0)
  const total = data.reduce((s, n) => s + n, 0)
  return { data, total }
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
  // 차트 색·글꼴은 토큰에서 한 번만 읽는다
  const chartTokens = useMemo(readChartTokens, [])
  const today = toDateString(new Date())
  const now = new Date()
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)

  // 선택 월이 이번 달인지 — '오늘' 카드·목표 잔여일수 등 오늘 기준 계산의 분기점
  const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth() + 1

  // 월 선택 탭 (오래된 달 → 이번 달)
  const monthTabs = getRecentMonths(MONTH_TAB_COUNT)
  const monthTabsRef = useRef<HTMLDivElement>(null)

  // 첫 렌더에서만 월 탭을 오른쪽 끝(이번 달)으로 이동 — 이후 사용자의 스크롤 위치는 건드리지 않는다
  // 웹폰트가 늦게 붙으면 탭 폭이 늘어나므로, 글꼴 로드 후 한 번 더 맞춘다
  useEffect(() => {
    const toEnd = () => {
      const el = monthTabsRef.current
      if (el) el.scrollLeft = el.scrollWidth
    }
    toEnd()
    let cancelled = false
    document.fonts?.ready.then(() => { if (!cancelled) toEnd() }).catch(() => {})
    return () => { cancelled = true }
  }, [])

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

    // '오늘 매출'과 '최근 28일'은 이번 달 화면에서만 쓰는 값 — 지난 달을 보는 중이면 조회하지 않는다.
    // (지난 달의 일자별·요일별 차트는 이미 불러온 그 달 데이터에서 파생시킨다)
    const [todayYear, todayMonth] = today.split('-').map(Number)
    const viewingCurrentMonth = selYear === todayYear && selMonth === todayMonth

    // allSettled — 조회 하나가 실패해도 나머지 화면은 정상 표시한다
    Promise.allSettled([
      viewingCurrentMonth ? getSalesByDate(today) : Promise.resolve([] as DailySales[]),
      getSalesByMonth(selYear, selMonth),
      getSalesByMonth(selYear - 1, selMonth), // 전년 동월
      getSalesByMonth(prevYear, prevMonth),   // 전월
      viewingCurrentMonth
        ? getSalesByRange(startStr, endStr)   // 최근 28일
        : Promise.resolve([] as DailySales[]),
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

    // 월 전환 직후 이전 달 목표가 잠시 남아 보이지 않도록 초기화한다
    setTarget(0)

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

  // 미입력일 — 이번 달은 오늘 이전(지난 날짜), 지난 달은 그 달 전체 중 데이터가 없는 날
  const enteredDates = new Set(monthRows.map((r) => r.sale_date))
  const missingCheckLastDay = isCurrentMonth ? todayNum - 1 : daysInMonth
  let missingDays = 0
  for (let d = 1; d <= missingCheckLastDay; d++) {
    if (!enteredDates.has(`${selYear}-${pad2(selMonth)}-${pad2(d)}`)) missingDays++
  }

  // 전월 라벨 (1월이면 전년 12월)
  const prevMonthLabel = `${selMonth === 1 ? 12 : selMonth - 1}월`

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
  // ── 선택 월 파생 데이터 ────────────────────────────────
  // 지난 달을 볼 때는 '오늘'·'최근 28일'이 의미가 없으므로, 이미 불러온 그 달 데이터로 대체한다.

  /** 선택 월의 일자별 합계 (날짜 오름차순) */
  const monthDayTotals: { date: string; total: number }[] = (() => {
    const map = new Map<string, number>()
    for (const r of monthRows) {
      map.set(r.sale_date, (map.get(r.sale_date) ?? 0) + r.total_sales)
    }
    return [...map]
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date))
  })()

  /** 선택 월 특정 날짜의 업장별 매출 맵 */
  function venueMapOf(date: string): Partial<Record<Venue, number>> {
    const map: Partial<Record<Venue, number>> = {}
    for (const r of monthRows) {
      if (r.sale_date !== date) continue
      map[r.venue as Venue] = (map[r.venue as Venue] ?? 0) + r.total_sales
    }
    return map
  }

  // 두 번째 도넛 카드의 기준일 — 이번 달은 '오늘', 지난 달은 '그 달 최고 매출일'
  const bestDay = monthDayTotals.reduce<{ date: string; total: number } | null>(
    (best, d) => (d.total > 0 && (best === null || d.total > best.total) ? d : best),
    null,
  )
  const spotDate = isCurrentMonth ? today : (bestDay?.date ?? null)
  const spotMap: Partial<Record<Venue, number>> = isCurrentMonth
    ? todayMap
    : (spotDate !== null ? venueMapOf(spotDate) : {})
  const spotDonut = buildDonutData(spotMap)

  const spotGuest = spotDate !== null
    ? (notes.find((n) => n.sale_date === spotDate)?.guest_count ?? 0)
    : 0
  const spotPerGuest = spotGuest > 0 && spotDonut.total > 0
    ? Math.round(spotDonut.total / spotGuest)
    : null

  // 매출 추이 차트 — 이번 달은 최근 7일, 지난 달은 그 달 일자별
  const trendData = isCurrentMonth ? weeklyData : monthDayTotals

  // 요일별 평균 매출 — 매출이 실제로 입력된(0원 초과) 날만 평균에 포함
  // (daily_sales는 행이 있어도 전 업장 0원으로 저장될 수 있어 "행 존재"만으로는 휴장일을 걸러내지 못한다)
  // 모집단: 이번 달은 최근 4주, 지난 달은 그 달 전체
  const weekdaySource = isCurrentMonth ? recentDayTotals : monthDayTotals
  const weekdayStats = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }))
  for (const d of weekdaySource) {
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

  // 이번 달 가마감 미입력 경고 — ClosingPage와 동일 조건 (로딩 완료 전에는 그리지 않음)
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
  // 잔여 일수 — 이번 달에만 의미가 있다 (지난 달은 이미 종료되었으므로 0)
  // 오늘 매출 입력 완료 시 오늘 제외, 미입력 시 오늘 포함
  const remainDays = !isCurrentMonth
    ? 0
    : todayDonut.total > 0
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

  /** 월 전환 — 편집 중이던 목표 입력은 다른 달의 값이 되므로 취소한다 */
  function handleSelectMonth(year: number, month: number) {
    if (year === selYear && month === selMonth) return
    setSelYear(year)
    setSelMonth(month)
    setEditingTarget(false)
    setTargetInput('')
  }

  // 전년 동월 대비 (null이면 전년 데이터 없음)
  const yoy = calcChangeRate(monthDonut.total, lastYearTotal)

  // 목표 진행 막대 색 — 달성은 짙은 초록, 70% 이상 초록, 그 아래는 빨강
  const progressTone =
    achieveRate >= 100 ? 'bg-brand-ink' : achieveRate >= 70 ? 'bg-brand' : 'bg-accent'

  return (
    <div className="min-h-screen bg-paper text-ink pb-24">
      {toast !== null && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* 헤더 — 바탕 위 큰 제목, 아래 월 알약 탭 */}
      <header className="bg-paper px-4 pt-safe-top">
        <div className="max-w-lg mx-auto pt-6 pb-3">
          <p className="text-sm text-muted">노스팜CC</p>
          <div className="mt-0.5 flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-ink">매출 대시보드</h1>
            <p className="flex items-center gap-2 text-sm text-muted">
              <span><span className="num">{selYear}</span>년 <span className="num">{selMonth}</span>월</span>
              {isCurrentMonth ? null : <span className={CHIP_NEUTRAL}>지난 달 보기</span>}
            </p>
          </div>
        </div>
        {/* 월 선택 — 최근 12개월. 해가 다른 달은 연도를 함께 표시한다. 선택한 달은 초록 알약 */}
        <div
          ref={monthTabsRef}
          role="group"
          aria-label="월 선택"
          className="max-w-lg mx-auto flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none]"
        >
          {monthTabs.map((t) => {
            const active = t.year === selYear && t.month === selMonth
            return (
              <button
                key={`${t.year}-${t.month}`}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectMonth(t.year, t.month)}
                className={`shrink-0 px-4 min-h-10 rounded-full text-sm whitespace-nowrap transition-colors focus-visible:outline-offset-0 ${
                  active
                    ? 'bg-brand text-sheet font-bold'
                    : 'bg-sheet text-ink-2 font-medium hover:text-ink active:bg-paper-3'
                }`}
              >
                {t.year !== now.getFullYear() ? `${String(t.year).slice(2)}년 ` : ''}{t.month}월
              </button>
            )
          })}
        </div>
      </header>

      {/* 이번 달 가마감 미입력 경고 */}
      {showClosingWarning ? (
        <div className="px-4 mt-3 max-w-lg mx-auto">
          <button
            type="button"
            onClick={() => navigate('/closing')}
            className={`${ALERT} w-full text-left hover:bg-accent-soft/70 transition-colors`}
          >
            <span className="block text-sm font-bold text-accent-ink">
              이번 달 가마감이 아직 입력되지 않았습니다
            </span>
            <span className="mt-1 block text-sm text-ink-2">
              {selYear}년 {selMonth}월 손익 예상치를 입력하고 저장해주세요. (탭하면 가마감으로 이동)
            </span>
          </button>
        </div>
      ) : null}

      {/* 일부 데이터 조회 실패 안내 */}
      {!loading && loadFailed ? (
        <div className="px-4 mt-3 max-w-lg mx-auto">
          <div role="alert" className={ALERT}>
            <p className="text-sm font-bold text-accent-ink">일부 데이터를 불러오지 못했습니다</p>
            <p className="mt-1 text-sm text-ink-2">
              화면의 일부 수치가 비어 있을 수 있습니다. 새로고침해주세요.
            </p>
          </div>
        </div>
      ) : null}

      {loading ? (
        // 로딩 — 큰 숫자와 카드 자리 모양의 빈 막대 (애니메이션 없음)
        <div className="px-4 mt-4 max-w-lg mx-auto" aria-busy="true">
          <div className="h-4 w-28 rounded-full bg-paper-3" />
          <div className="mt-3 h-10 w-56 rounded-full bg-paper-3" />
          <div className={`${CARD} mt-6`}>
            <div className="h-3 w-full rounded-full bg-paper-2" />
            <div className="mt-3 h-3 w-full rounded-full bg-paper-2" />
          </div>
          <p className="mt-3 text-sm text-muted">데이터 불러오는 중…</p>
        </div>
      ) : (
        <main className="px-4 max-w-lg mx-auto">

          {/* ── 주인공 숫자: 누적 순매출 → 전년 대비·미입력 칩 ── */}
          <section aria-labelledby="ledger-title" className="mt-3">
            <h2 id="ledger-title" className="text-base font-medium text-muted">
              {selMonth}월 {isCurrentMonth ? '누적 순매출' : '순매출'}
            </h2>
            <p className="num mt-1 text-[2.5rem] leading-[1.1] font-bold tracking-[-0.035em] text-ink">
              {formatKoreanWon(monthDonut.total)}
            </p>
            {/* 원 단위 정확한 값 — 큰 숫자는 만원 반올림이라 함께 둔다 */}
            {Math.abs(monthDonut.total) >= 10000 && (
              <p className="num mt-1 text-sm text-muted">{formatCurrency(monthDonut.total)}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {yoy !== null && (
                <span className={deltaChip(yoy)}>
                  전년 동월 대비 <span className="num">{formatDelta(yoy)}</span>
                </span>
              )}
              {missingDays > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/monthly')}
                  className={`${CHIP_BAD} min-h-8 hover:bg-accent-soft/70`}
                >
                  미입력 <span className="num">{missingDays}</span>일
                </button>
              )}
            </div>
          </section>

          {/* ── 목표 달성률 카드 ── */}
          <section aria-labelledby="target-title" className={`${CARD} mt-6`}>
            <SectionHead id="target-title" title={`${selMonth}월 목표 달성률`}>
              {editingTarget ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    name="salesTarget"
                    aria-label="목표 매출(만원)"
                    value={targetInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '')
                      if (raw === '' || /^\d+$/.test(raw)) {
                        setTargetInput(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'))
                      }
                    }}
                    placeholder="목표 만원"
                    autoFocus
                    className={`${INPUT} num w-28 px-2 text-right`}
                  />
                  <span className="text-sm text-muted">만원</span>
                  <button
                    type="button"
                    onClick={() => { void handleTargetSave() }}
                    disabled={targetSaving}
                    className={BTN_FILLED}
                  >
                    {targetSaving ? '저장 중' : '확인'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTargetInput(target > 0 ? (target / 10000).toLocaleString('ko-KR') : '')
                    setEditingTarget(true)
                  }}
                  className={BTN_OUTLINE}
                >
                  {target > 0 ? <>목표 <span className="num">{(target / 10000).toLocaleString()}</span>만원</> : '목표 설정'}
                </button>
              )}
            </SectionHead>

            {target > 0 ? (
              <div className="mt-2">
                <div className="flex justify-between items-end gap-3">
                  <div>
                    <p className="num text-3xl font-bold text-ink">{achieveRate}%</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {monthDonut.total > 0
                        ? <><span className="num">{Math.round(monthDonut.total / 10000).toLocaleString()}</span>만 / <span className="num">{(target / 10000).toLocaleString()}</span>만원</>
                        : '아직 입력 없음'}
                    </p>
                  </div>
                  {isCurrentMonth && achieveRate < 100 && dailyNeed > 0 && (
                    <div className="text-right">
                      <p className="text-base font-bold text-ink">
                        <span className="num">{dailyNeed.toLocaleString()}</span>만원
                      </p>
                      <p className="text-sm text-muted">
                        {todayDonut.total > 0 ? `내일부터 ${remainDays}일` : `오늘부터 ${remainDays}일`} 일평균 필요
                      </p>
                    </div>
                  )}
                  {!isCurrentMonth && achieveRate < 100 && remainAmount > 0 && (
                    <div className="text-right">
                      <p className="text-base font-bold text-accent-ink">
                        <span className="num">△{Math.round(remainAmount / 10000).toLocaleString()}</span>만원
                      </p>
                      <p className="text-sm text-muted">목표 미달</p>
                    </div>
                  )}
                  {achieveRate >= 100 && (
                    <p className="text-base font-bold text-brand-ink">목표 달성!</p>
                  )}
                </div>
                {/* 진행 막대 — 너비 대신 scaleX */}
                <div
                  role="progressbar"
                  aria-label="목표 달성률"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={achieveRate}
                  className="mt-3 h-2.5 rounded-full bg-paper-3 overflow-hidden"
                >
                  <div
                    className={`progress-fill h-full rounded-full ${progressTone}`}
                    style={{ transform: `scaleX(${achieveRate / 100})` }}
                  />
                </div>
                <p className="mt-2 text-sm text-muted">가마감 화면의 목표 매출과 동일한 값입니다</p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted">목표를 설정하면 달성률을 확인할 수 있습니다</p>
            )}
          </section>

          {/* ── 업장별 카드: 띠그래프 → 결산표 ── */}
          <section aria-labelledby="venue-title" className={`${CARD} mt-3`}>
            <SectionHead id="venue-title" title="업장별">
              <p className="text-sm text-muted">
                최고 <span className="font-bold text-ink">{topVenue}</span>
              </p>
            </SectionHead>

            {/* 업장 구성 띠그래프 — 수치는 아래 표가 말하므로 보조기기에는 숨긴다 */}
            {monthDonut.total > 0 ? (
              <div className="mt-2 flex h-3 gap-0.5 rounded-full overflow-hidden" aria-hidden="true">
                {VENUES.map((venue) => {
                  const net = monthMap[venue] ?? 0
                  if (net <= 0) return null
                  return (
                    <div
                      key={venue}
                      className={`basis-0 min-w-0.5 ${VENUE_SWATCH[venue]}`}
                      style={{ flexGrow: net }}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {isCurrentMonth ? '이번 달' : `${selMonth}월`} 데이터 없음
              </p>
            )}

            {/* 업장별 결산표 — 카드 안 가는 선만 */}
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">{selMonth}월 업장별 순매출</caption>
              <thead>
                <tr>
                  <th scope="col" className="pb-2 text-left text-sm font-medium text-muted">업장</th>
                  <th scope="col" className="pb-2 text-right text-sm font-medium text-muted">순매출(원)</th>
                  <th scope="col" className="pb-2 pl-2 text-right text-sm font-medium text-muted">비중</th>
                  <th scope="col" className="pb-2 pl-2 text-right text-sm font-medium text-muted whitespace-nowrap">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {VENUES.map((venue) => {
                  const net = monthMap[venue] ?? 0
                  const pct = monthDonut.total > 0 ? Math.round((net / monthDonut.total) * 100) : 0
                  const prevNet = prevMonthMap[venue] ?? 0
                  const delta = calcChangeRate(net, prevNet)
                  return (
                    <tr key={venue} className="border-t border-rule">
                      <th scope="row" className="py-2.5 pr-2 text-left font-medium text-ink">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${VENUE_SWATCH[venue]}`} aria-hidden="true" />
                          <span className="truncate">{venue}</span>
                        </span>
                      </th>
                      <td className="num py-2.5 text-right font-semibold text-ink">{net > 0 ? net.toLocaleString() : '-'}</td>
                      <td className="num py-2.5 pl-2 text-right text-muted">{pct}%</td>
                      <td className={`num py-2.5 pl-2 text-right font-semibold ${delta === null ? 'text-muted' : delta < 0 ? 'text-accent-ink' : 'text-brand-ink'}`}>
                        {delta !== null ? formatDelta(delta) : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-rule-2">
                  <th scope="row" className="pt-2.5 text-left font-bold text-ink">합계</th>
                  <td className="num pt-2.5 text-right font-bold text-ink">
                    {monthDonut.total > 0 ? monthDonut.total.toLocaleString() : '-'}
                  </td>
                  <td className="num pt-2.5 pl-2 text-right text-muted">{monthDonut.total > 0 ? '100%' : '-'}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-sm text-muted">
              {isCurrentMonth ? (
                <>※ 전월 대비는 전월 <strong className="font-bold text-ink-2">전체</strong> 실적과 이번 달 누적 실적을 비교한 값입니다. △는 감소입니다.</>
              ) : (
                <>※ 전월 대비는 {prevMonthLabel} 실적과 {selMonth}월 실적을 비교한 값입니다 (양쪽 모두 월 전체). △는 감소입니다.</>
              )}
            </p>
          </section>

          {/* ── 객단가·내장객·입력일 카드 ── */}
          <section aria-label={`${selMonth}월 객단가와 입력 현황`} className={`${CARD} mt-3`}>
            <dl className="grid grid-cols-3 gap-x-3">
              {/* 객단가 = 순매출 ÷ 내장객 수 */}
              <Stat label="객단가">
                {monthPerGuest !== null ? (
                  <><span className="num">{monthPerGuest.toLocaleString()}</span>원</>
                ) : '-'}
              </Stat>
              <Stat label="내장객">
                {monthGuestTotal > 0 ? (
                  <><span className="num">{monthGuestTotal.toLocaleString()}</span>명</>
                ) : '-'}
              </Stat>
              <Stat label="입력 완료">
                <span className="num">{inputDays}</span>일
              </Stat>
            </dl>
          </section>

          {/* ── 기준일 — 이번 달은 '오늘', 지난 달은 '그 달 최고 매출일' ── */}
          <section aria-labelledby="spot-title" className={`${CARD} mt-3`}>
            <SectionHead id="spot-title" title={isCurrentMonth ? '오늘' : `${selMonth}월 최고 매출일`}>
              {isCurrentMonth ? (
                <button
                  type="button"
                  onClick={() => navigate('/input')}
                  className={spotDonut.total > 0 ? BTN_OUTLINE : BTN_FILLED}
                >
                  {spotDonut.total > 0 ? '수정' : '입력'}
                </button>
              ) : spotDate !== null ? (
                <button
                  type="button"
                  onClick={() => navigate(`/detail/${spotDate}`)}
                  className={BTN_OUTLINE}
                >
                  상세
                </button>
              ) : null}
            </SectionHead>

            <div className="mt-1 flex items-baseline justify-between gap-3">
              <p className="text-sm text-muted">
                {isCurrentMonth ? formatDate(today) : spotDate !== null ? formatDate(spotDate) : '-'}
              </p>
              <p className="num text-2xl font-bold text-ink">{formatCurrency(spotDonut.total)}</p>
            </div>
            {spotPerGuest !== null && (
              <p className="mt-1 text-right text-sm text-muted">
                객단가 <span className="num font-semibold text-ink-2">{spotPerGuest.toLocaleString()}</span>원,
                내장객 <span className="num font-semibold text-ink-2">{spotGuest.toLocaleString()}</span>명
              </p>
            )}

            {spotDonut.total > 0 ? (
              <dl className="mt-3">
                {VENUES.map((venue) => {
                  const net = spotMap[venue] ?? 0
                  return (
                    <div key={venue} className="flex items-center justify-between gap-3 py-2 border-t border-rule">
                      <dt className="flex items-center gap-2 text-sm text-ink-2 min-w-0">
                        <span className={`w-2 h-2 shrink-0 rounded-full ${VENUE_SWATCH[venue]}`} aria-hidden="true" />
                        <span className="truncate">{venue}</span>
                      </dt>
                      <dd className="text-sm font-semibold text-ink">
                        {net > 0 ? <><span className="num">{net.toLocaleString()}</span>원</> : '-'}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {isCurrentMonth ? '오늘 데이터 미입력' : `${selMonth}월 데이터 없음`}
              </p>
            )}
          </section>

          {/* ── 매출 추이 — 이번 달은 최근 7일, 지난 달은 그 달 일자별. 기준일 막대만 초록 ── */}
          {trendData.some((d) => d.total > 0) && (
            <section aria-labelledby="trend-title" className={`${CARD} mt-3`}>
              <SectionHead
                id="trend-title"
                title={isCurrentMonth ? '최근 7일 매출 추이' : `${selMonth}월 일자별 매출 추이`}
              >
                <span className="text-sm text-muted">단위 만원</span>
              </SectionHead>
              <div className="mt-2">
                <Bar
                  data={{
                    labels: trendData.map((d) => {
                      const [, mm, dd] = d.date.split('-')
                      return `${parseInt(mm)}/${parseInt(dd)}`
                    }),
                    datasets: [
                      {
                        data: trendData.map((d) => Math.round(d.total / 10000)), // 만원 단위
                        backgroundColor: trendData.map((d) =>
                          d.date === spotDate ? chartTokens.mark : chartTokens.bar
                        ),
                        borderRadius: 4,
                        maxBarThickness: 24,
                      },
                    ],
                  }}
                  options={barOptions(chartTokens)}
                />
              </div>
            </section>
          )}

          {/* ── 요일별 평균 매출 — 주말만 연한 초록 ── */}
          {hasWeekdayData && (
            <section aria-labelledby="weekday-title" className={`${CARD} mt-3`}>
              <SectionHead
                id="weekday-title"
                title={`요일별 평균 매출 (${isCurrentMonth ? '최근 4주' : `${selMonth}월`})`}
              >
                <span className="flex items-center gap-1.5 text-sm text-muted">
                  <span className="w-2.5 h-2.5 rounded-full bg-series-2" aria-hidden="true" />
                  주말
                </span>
              </SectionHead>
              <div className="mt-2">
                <Bar
                  data={{
                    labels: WEEKDAY_LABELS,
                    datasets: [
                      {
                        data: weekdayAvg.map((v) => Math.round(v / 10000)), // 만원 단위
                        backgroundColor: WEEKDAY_LABELS.map((_, dow) =>
                          dow === 0 || dow === 6 ? chartTokens.strong : chartTokens.bar
                        ),
                        borderRadius: 4,
                        maxBarThickness: 24,
                      },
                    ],
                  }}
                  options={barOptions(chartTokens)}
                />
              </div>
              <p className="mt-2 text-sm text-muted">매출이 입력된 날만 평균에 포함됩니다</p>
            </section>
          )}

          {/* ── 특이사항 (비고) ── */}
          {memoItems.length > 0 && (
            <section aria-labelledby="memo-title" className={`${CARD} mt-3`}>
              <SectionHead
                id="memo-title"
                title={isCurrentMonth ? '최근 특이사항' : `${selMonth}월 특이사항`}
              />
              <ul className="mt-1">
                {memoItems.map((item) => {
                  const [, mm, dd] = item.date.split('-')
                  return (
                    <li key={item.date} className="grid grid-cols-[3rem_1fr] gap-3 py-2.5 border-t border-rule text-sm">
                      <span className="num font-semibold text-muted">{parseInt(mm)}/{parseInt(dd)}</span>
                      <span className="text-ink-2 break-words min-w-0">
                        {item.entries.map((e) => `${e.venue}: ${e.memo}`).join(', ')}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

        </main>
      )}

      <BottomNav />
    </div>
  )
}
