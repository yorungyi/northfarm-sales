import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'
import { getSalesByMonth, getEarliestSaleDate } from '../lib/api'
import { formatCurrency, calcChangeRate } from '../utils/format'
import { downloadCsv } from '../utils/exportCsv'
import BottomNav from '../components/BottomNav'

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** 월 선택 칩에 늘 12개월을 모두 깔아둔다 (1월 ~ 12월) */
const ALL_MONTHS: number[] = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * 첫 매출일 조회가 끝나기 전에 쓸 잠정 연도 하한 (올해로부터 몇 년 전까지).
 * 조회가 성공하면 실제 첫 데이터 연도로 넓혀진다.
 */
const FALLBACK_YEAR_SPAN = 1

// 업장별 색상 (도넛 차트와 동일)
const VENUE_COLORS: Record<Venue, string> = {
  [Venue.CLUBHOUSE]:  '#3B82F6',
  [Venue.STARTHOUSE]: '#10B981',
  [Venue.EAST_SHADE]: '#F59E0B',
  [Venue.WEST_SHADE]: '#8B5CF6',
  [Venue.CLIENT]:     '#EC4899',
}

/**
 * 한 달치 조회 결과 — **어느 달의 데이터인지(key)를 함께** 보관한다.
 * 이렇게 묶어두면 월을 바꾼 직후 "새 달 제목 + 이전 달 숫자"가 함께 보이는 일이 없다.
 */
interface MonthData {
  key: string                  // 'YYYY-MM'
  rows: DailySales[]           // 선택한 달
  prevRows: DailySales[]       // 전월
  lastYearRows: DailySales[]   // 전년 동월
  failed: boolean              // 조회 실패 여부
}

/** 'YYYY-MM' 형식의 월 키 */
function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export default function MonthlyPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [selMonth, setSelMonth] = useState(today.getMonth() + 1)
  const [data, setData] = useState<MonthData | null>(null)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  // 고를 수 있는 연도 하한 — 데이터가 있는 첫 해. 조회 전에는 작년까지만 열어둔다.
  const [firstYear, setFirstYear] = useState(currentYear - FALLBACK_YEAR_SPAN)

  // 첫 매출일을 한 번만 조회해 연도 범위를 넓힌다.
  // 실패해도 화면은 그대로 돌아가야 하므로 잠정 범위를 유지한다.
  useEffect(() => {
    let cancelled = false
    getEarliestSaleDate()
      .then((date) => {
        if (cancelled || date === null) return
        const year = Number(date.slice(0, 4))
        if (Number.isFinite(year) && year < currentYear) setFirstYear(year)
      })
      .catch(() => { /* 조회 실패 — 잠정 범위(작년~올해) 유지 */ })
    return () => { cancelled = true }
  }, [currentYear])

  // 월 칩 가로 스크롤 — 첫 렌더에서만 오른쪽 끝(연말 방향)으로 보내 이번 달이 보이게 한다
  const monthChipsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = monthChipsRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  const canGoPrevYear = selYear > firstYear
  const canGoNextYear = selYear < currentYear

  /** 그 해에 고를 수 있는 마지막 달 — 올해는 이번 달까지, 지난 해는 12월까지 */
  function lastSelectableMonth(year: number): number {
    return year === currentYear ? currentMonth : 12
  }

  /** 연도 이동 — 넘어간 해에 없는 미래 달이면 그 해의 마지막 달로 당긴다 */
  function shiftYear(delta: number) {
    const nextYear = selYear + delta
    if (nextYear < firstYear || nextYear > currentYear) return
    const maxMonth = lastSelectableMonth(nextYear)
    setSelYear(nextYear)
    if (selMonth > maxMonth) setSelMonth(maxMonth)
  }

  const todayStr = today.toLocaleDateString('sv-SE')
  const monthKey = monthKeyOf(selYear, selMonth)

  // 화면에는 **선택한 달의 데이터일 때만** 쓴다. 아직 도착 전이면 로딩으로 취급해
  // 이전 달 숫자가 새 달 제목 아래 남지 않게 한다.
  const loaded = data !== null && data.key === monthKey ? data : null
  const loading = loaded === null
  const loadFailed = loaded?.failed ?? false
  const rows = loaded?.rows ?? []
  const prevRows = loaded?.prevRows ?? []
  const lastYearRows = loaded?.lastYearRows ?? []

  // 월이 바뀌면 펼쳐둔 날짜는 무효 — 선택한 달의 날짜일 때만 펼침을 유지한다
  const activeExpandedDate =
    expandedDate !== null && expandedDate.startsWith(monthKey) ? expandedDate : null

  useEffect(() => {
    let cancelled = false
    const key = monthKeyOf(selYear, selMonth)
    const prevMonth = selMonth === 1 ? 12 : selMonth - 1
    const prevYear = selMonth === 1 ? selYear - 1 : selYear
    Promise.all([
      getSalesByMonth(selYear, selMonth),
      getSalesByMonth(prevYear, prevMonth),
      getSalesByMonth(selYear - 1, selMonth), // 전년 동월
    ]).then(([cur, prev, lastYear]) => {
      if (cancelled) return
      setData({ key, rows: cur, prevRows: prev, lastYearRows: lastYear, failed: false })
    }).catch(() => {
      // 조회 실패 — 이전 달 숫자를 그대로 보여주지 않도록 빈 데이터로 두고 안내 문구를 띄운다
      if (cancelled) return
      setData({ key, rows: [], prevRows: [], lastYearRows: [], failed: true })
    })
    return () => { cancelled = true }
  }, [selYear, selMonth])

  // 날짜별 합계 맵
  const dayMap = new Map<string, number>()
  for (const r of rows) {
    dayMap.set(r.sale_date, (dayMap.get(r.sale_date) ?? 0) + r.total_sales)
  }

  // 작년 일자별 합계 맵 (MM-DD 키)
  const lastYearDayMap = new Map<string, number>()
  for (const r of lastYearRows) {
    const key = r.sale_date.slice(5) // "MM-DD"
    lastYearDayMap.set(key, (lastYearDayMap.get(key) ?? 0) + r.total_sales)
  }

  // 날짜 × 업장 맵 (드릴다운용)
  const venueMap = new Map<string, Partial<Record<Venue, number>>>()
  for (const r of rows) {
    const vMap = venueMap.get(r.sale_date) ?? {}
    vMap[r.venue as Venue] = (vMap[r.venue as Venue] ?? 0) + r.total_sales
    venueMap.set(r.sale_date, vMap)
  }

  const daysInMonth = getDaysInMonth(selYear, selMonth)
  const monthTotal = [...dayMap.values()].reduce((s, v) => s + v, 0)
  const prevTotal = prevRows.reduce((s, r) => s + r.total_sales, 0)
  const lastYearTotal = lastYearRows.reduce((s, r) => s + r.total_sales, 0)
  const changeRate = calcChangeRate(monthTotal, prevTotal)
  const yoyRate = calcChangeRate(monthTotal, lastYearTotal)

  type DaySummary = { date: string; net: number; hasData: boolean; lastYearNet: number }
  const daySummaries: DaySummary[] = Array.from({ length: daysInMonth }, (_, i) => {
    const mm = String(selMonth).padStart(2, '0')
    const dd = String(i + 1).padStart(2, '0')
    const date = `${selYear}-${mm}-${dd}`
    const net = dayMap.get(date) ?? 0
    const dayKey = `${mm}-${dd}`
    return { date, net, hasData: dayMap.has(date), lastYearNet: lastYearDayMap.get(dayKey) ?? 0 }
  })

  /** 선택된 월의 일자별 × 업장별 매출을 CSV로 내려받기 */
  function handleExportCsv() {
    const headers = ['날짜', ...VENUES, '합계']
    const csvRows: (string | number)[][] = daySummaries.map((day) => {
      const vMap = venueMap.get(day.date) ?? {}
      return [day.date, ...VENUES.map((venue) => vMap[venue] ?? 0), day.net]
    })
    downloadCsv(`노스팜CC_매출_${selYear}년${selMonth}월.csv`, headers, csvRows)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4 flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-gray-900">월별 현황</h1>
          {/* 연도 이동 — 데이터가 있는 첫 해부터 올해까지 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => shiftYear(-1)}
              disabled={!canGoPrevYear}
              aria-label="이전 연도"
              className="w-9 h-9 rounded-full text-gray-600 text-lg leading-none bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-30"
            >
              ‹
            </button>
            <span className="w-16 text-center text-sm font-bold text-gray-900 tabular-nums">
              {selYear}년
            </span>
            <button
              onClick={() => shiftYear(1)}
              disabled={!canGoNextYear}
              aria-label="다음 연도"
              className="w-9 h-9 rounded-full text-gray-600 text-lg leading-none bg-gray-100 active:bg-gray-200 transition-colors disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
        {/* 월 선택 — 1~12월 전부. 아직 오지 않은 달만 눌리지 않게 막는다 */}
        <div ref={monthChipsRef} className="max-w-lg mx-auto flex gap-1 overflow-x-auto pb-2">
          {ALL_MONTHS.map((m) => {
            const active = m === selMonth
            const future = m > lastSelectableMonth(selYear)
            return (
              <button
                key={m}
                onClick={() => setSelMonth(m)}
                disabled={future}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : future
                      ? 'bg-gray-50 text-gray-300'
                      : 'bg-gray-100 text-gray-500'
                }`}
              >
                {m}월
              </button>
            )
          })}
        </div>
      </header>

      {/* 월 합계 카드 */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="bg-blue-600 rounded-2xl p-4 text-white text-center shadow">
          <p className="text-sm text-blue-200">
            {selYear !== currentYear ? `${selYear}년 ` : ''}{selMonth}월 순매출 합계
          </p>
          {/* 불러오는 중에는 금액 대신 '—' — 이전 달 숫자를 이 달 숫자로 오해하지 않게 한다 */}
          <p className="text-2xl font-bold mt-1">
            {loading ? '—' : formatCurrency(monthTotal)}
          </p>
          <div className="flex justify-center gap-4 mt-1.5">
            {changeRate !== null && (
              <p className={`text-sm whitespace-nowrap ${changeRate >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                전월 {changeRate >= 0 ? '↑' : '↓'}{Math.abs(changeRate)}%
              </p>
            )}
            {yoyRate !== null && (
              <p className={`text-sm whitespace-nowrap ${yoyRate >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                전년동월 {yoyRate >= 0 ? '↑' : '↓'}{Math.abs(yoyRate)}%
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 조회 실패 안내 — 빈 화면을 '전부 미입력'으로 오해하지 않게 한다 */}
      {loadFailed && (
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <div className="bg-red-50 rounded-2xl p-3 border border-red-200">
            <p className="text-sm font-bold text-red-600">데이터를 불러오지 못했습니다</p>
            <p className="mt-0.5 text-xs text-red-500">
              네트워크 상태를 확인하고 새로고침해주세요.
            </p>
          </div>
        </div>
      )}

      {/* 엑셀 내보내기 */}
      <div className="px-4 pt-3 max-w-lg mx-auto flex justify-end">
        <button
          onClick={handleExportCsv}
          disabled={loading}
          className="min-h-[44px] px-4 text-sm text-blue-600 font-medium rounded-xl border border-blue-200 bg-white active:bg-blue-50 transition-colors disabled:opacity-50"
        >
          엑셀 내보내기
        </button>
      </div>

      {/* 일별 목록 */}
      <div className="px-4 pt-3 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div
            style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '0 8px' }}
            className="text-xs text-gray-400 font-medium px-4 py-2 border-b border-gray-100 items-center"
          >
            <span>날짜</span>
            <span className="text-right">순매출</span>
            <span className="text-right">전년</span>
            <span></span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">로딩 중...</div>
          ) : (
            <>
              {daySummaries.map((day) => {
                const isPast = day.date < todayStr
                const isToday = day.date === todayStr
                const missing = isPast && !day.hasData
                const isExpanded = activeExpandedDate === day.date
                const vMap = venueMap.get(day.date) ?? {}

                return (
                  <div key={day.date} className="border-b border-gray-50 last:border-0">
                    {/* 날짜 행 */}
                    <button
                      onClick={() => {
                        if (day.hasData) {
                          // 데이터 있는 날 → 드릴다운 토글
                          setExpandedDate(isExpanded ? null : day.date)
                        } else if (isPast || isToday) {
                          navigate(`/input?date=${day.date}`)
                        }
                      }}
                      disabled={!day.hasData && !isPast && !isToday}
                      className={`w-full grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 px-4 py-3 text-sm transition-colors ${
                        day.hasData
                          ? isExpanded
                            ? 'bg-blue-50'
                            : 'active:bg-blue-50 cursor-pointer'
                          : (isPast || isToday)
                            ? 'active:bg-red-50 cursor-pointer'
                            : 'cursor-default'
                      } ${isToday && !isExpanded ? 'bg-blue-50' : ''}`}
                    >
                      <span className="flex items-center gap-1.5 font-medium text-gray-700">
                        {day.date.slice(5).replace('-', '/')}
                        {missing && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
                        {day.hasData && (
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${isExpanded ? 'bg-blue-500' : 'bg-green-400'}`} />
                        )}
                      </span>
                      <span className={`text-right font-medium whitespace-nowrap ${day.hasData ? 'text-gray-800' : 'text-gray-300'}`}>
                        {day.hasData ? day.net.toLocaleString() + '원' : '-'}
                      </span>
                      {(() => {
                        if (day.lastYearNet <= 0) return <span />
                        const lyThousands = Math.round(day.lastYearNet / 1000)
                        const delta = day.hasData
                          ? Math.round(((day.net - day.lastYearNet) / day.lastYearNet) * 100)
                          : null
                        return (
                          <span className={`text-right text-xs whitespace-nowrap ${
                            delta === null ? 'text-gray-400' :
                            delta >= 0 ? 'text-green-500' : 'text-red-400'
                          }`}>
                            {delta !== null
                              ? `작년 ${lyThousands.toLocaleString()}천 (${delta >= 0 ? '↑' : '↓'}${Math.abs(delta)}%)`
                              : `작년 ${lyThousands.toLocaleString()}천`}
                          </span>
                        )
                      })()}
                      <span className="text-right">
                        {missing && <span className="text-xs text-red-400 font-medium">입력 →</span>}
                        {day.hasData && (
                          <span className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                        )}
                      </span>
                    </button>

                    {/* 드릴다운 패널 */}
                    {isExpanded && (
                      <div className="bg-gray-50 px-4 pb-3 pt-1 space-y-1.5">
                        {VENUES.map((venue) => {
                          const net = vMap[venue] ?? 0
                          const pct = day.net > 0 ? Math.round((net / day.net) * 100) : 0
                          return (
                            <div key={venue} className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: VENUE_COLORS[venue] }}
                              />
                              <span className="text-xs text-gray-600 flex-1">{venue}</span>
                              <span className="text-xs text-gray-400 w-8 text-right">{net > 0 ? `${pct}%` : '-'}</span>
                              <span className="text-xs font-medium text-gray-800 w-24 text-right">
                                {net > 0 ? net.toLocaleString() + '원' : '-'}
                              </span>
                            </div>
                          )
                        })}
                        {/* 상세 / 수정 링크 */}
                        <div className="flex gap-2 pt-1.5">
                          <button
                            onClick={() => navigate(`/detail/${day.date}`)}
                            className="flex-1 text-xs text-blue-600 font-medium py-1.5 rounded-lg border border-blue-200 active:bg-blue-50"
                          >
                            상세 보기
                          </button>
                          <button
                            onClick={() => navigate(`/input?date=${day.date}`)}
                            className="flex-1 text-xs text-gray-600 font-medium py-1.5 rounded-lg border border-gray-200 active:bg-gray-100"
                          >
                            수정
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* 합계 행 — 올해 합계 옆에 전년 동월 합계를 나란히 둔다 (일자별 행과 같은 열 배치) */}
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 px-4 py-3 bg-gray-50 text-sm font-bold">
                <span className="text-gray-700">합계</span>
                <span className="text-right text-blue-600 whitespace-nowrap">
                  {monthTotal.toLocaleString()}원
                </span>
                <span className="text-right text-xs whitespace-nowrap">
                  {lastYearTotal > 0 ? (
                    <span className={
                      yoyRate === null ? 'text-gray-400'
                        : yoyRate >= 0 ? 'text-green-500'
                        : 'text-red-400'
                    }>
                      작년 {Math.round(lastYearTotal / 1000).toLocaleString()}천
                      {yoyRate !== null && ` (${yoyRate >= 0 ? '↑' : '↓'}${Math.abs(yoyRate)}%)`}
                    </span>
                  ) : (
                    <span className="text-gray-300">작년 -</span>
                  )}
                </span>
                <span />
              </div>
            </>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
