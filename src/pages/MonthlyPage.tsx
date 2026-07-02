import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'
import { getSalesByMonth } from '../lib/api'
import { formatCurrency, calcChangeRate } from '../utils/format'
import BottomNav from '../components/BottomNav'

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getRecentMonths(count: number): { year: number; month: number }[] {
  const result = []
  const d = new Date()
  for (let i = 0; i < count; i++) {
    result.unshift({ year: d.getFullYear(), month: d.getMonth() + 1 })
    d.setMonth(d.getMonth() - 1)
  }
  return result
}

// 업장별 색상 (도넛 차트와 동일)
const VENUE_COLORS: Record<Venue, string> = {
  [Venue.CLUBHOUSE]:  '#3B82F6',
  [Venue.STARTHOUSE]: '#10B981',
  [Venue.EAST_SHADE]: '#F59E0B',
  [Venue.WEST_SHADE]: '#8B5CF6',
  [Venue.CLIENT]:     '#EC4899',
}

export default function MonthlyPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [selMonth, setSelMonth] = useState(today.getMonth() + 1)
  const [rows, setRows] = useState<DailySales[]>([])
  const [prevRows, setPrevRows] = useState<DailySales[]>([])
  const [lastYearRows, setLastYearRows] = useState<DailySales[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const tabs = getRecentMonths(6)
  const todayStr = today.toLocaleDateString('sv-SE')

  useEffect(() => {
    setLoading(true)
    setExpandedDate(null) // 월 전환 시 펼침 초기화
    const prevMonth = selMonth === 1 ? 12 : selMonth - 1
    const prevYear = selMonth === 1 ? selYear - 1 : selYear
    Promise.all([
      getSalesByMonth(selYear, selMonth),
      getSalesByMonth(prevYear, prevMonth),
      getSalesByMonth(selYear - 1, selMonth), // 전년 동월
    ]).then(([cur, prev, lastYear]) => {
      setRows(cur)
      setPrevRows(prev)
      setLastYearRows(lastYear)
    }).finally(() => setLoading(false))
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

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="text-lg font-bold text-gray-900">월별 현황</h1>
        </div>
        <div className="max-w-lg mx-auto flex gap-1 overflow-x-auto pb-2">
          {tabs.map((t) => {
            const active = t.year === selYear && t.month === selMonth
            return (
              <button
                key={`${t.year}-${t.month}`}
                onClick={() => { setSelYear(t.year); setSelMonth(t.month) }}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {t.month}월
              </button>
            )
          })}
        </div>
      </header>

      {/* 월 합계 카드 */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="bg-blue-600 rounded-2xl p-4 text-white text-center shadow">
          <p className="text-sm text-blue-200">{selMonth}월 순매출 합계</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(monthTotal)}</p>
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

      {/* 일별 목록 */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
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
                const isExpanded = expandedDate === day.date
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

              {/* 합계 행 */}
              <div className="grid grid-cols-2 px-4 py-3 bg-gray-50 text-sm font-bold">
                <span className="text-gray-700">합계</span>
                <span className="text-right text-blue-600">{monthTotal.toLocaleString()}원</span>
              </div>
            </>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
