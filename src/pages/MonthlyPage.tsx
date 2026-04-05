import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DailySales } from '../types/sales'
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

export default function MonthlyPage() {
  const navigate = useNavigate()
  const today = new Date()
  const [selYear, setSelYear] = useState(today.getFullYear())
  const [selMonth, setSelMonth] = useState(today.getMonth() + 1)
  const [rows, setRows] = useState<DailySales[]>([])
  const [prevRows, setPrevRows] = useState<DailySales[]>([])
  const [loading, setLoading] = useState(false)

  const tabs = getRecentMonths(6)
  const todayStr = today.toLocaleDateString('sv-SE')

  useEffect(() => {
    setLoading(true)
    const prevMonth = selMonth === 1 ? 12 : selMonth - 1
    const prevYear = selMonth === 1 ? selYear - 1 : selYear
    Promise.all([
      getSalesByMonth(selYear, selMonth),
      getSalesByMonth(prevYear, prevMonth),
    ]).then(([cur, prev]) => {
      setRows(cur)
      setPrevRows(prev)
    }).finally(() => setLoading(false))
  }, [selYear, selMonth])

  // 날짜별 순매출 합산
  const dayMap = new Map<string, number>()
  for (const r of rows) {
    dayMap.set(r.sale_date, (dayMap.get(r.sale_date) ?? 0) + r.total_sales)
  }

  const daysInMonth = getDaysInMonth(selYear, selMonth)
  const monthTotal = [...dayMap.values()].reduce((s, v) => s + v, 0)
  const prevTotal = prevRows.reduce((s, r) => s + r.total_sales, 0)
  const changeRate = calcChangeRate(monthTotal, prevTotal)

  type DaySummary = { date: string; net: number; hasData: boolean }
  const daySummaries: DaySummary[] = Array.from({ length: daysInMonth }, (_, i) => {
    const mm = String(selMonth).padStart(2, '0')
    const dd = String(i + 1).padStart(2, '0')
    const date = `${selYear}-${mm}-${dd}`
    const net = dayMap.get(date) ?? 0
    return { date, net, hasData: dayMap.has(date) }
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
          {changeRate !== null && (
            <p className={`text-sm mt-1 ${changeRate >= 0 ? 'text-green-300' : 'text-red-300'}`}>
              전월 대비 {changeRate >= 0 ? '↑' : '↓'}{Math.abs(changeRate)}%
            </p>
          )}
        </div>
      </div>

      {/* 일별 목록 */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-2 text-xs text-gray-400 font-medium px-4 py-2 border-b border-gray-100">
            <span>날짜</span>
            <span className="text-right">순매출</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">로딩 중...</div>
          ) : (
            <>
              {daySummaries.map((day) => {
                const isPast = day.date < todayStr
                const isToday = day.date === todayStr
                const missing = isPast && !day.hasData

                return (
                  <button
                    key={day.date}
                    onClick={() => day.hasData && navigate(`/detail/${day.date}`)}
                    disabled={!day.hasData}
                    className={`w-full grid grid-cols-2 px-4 py-3 border-b border-gray-50 last:border-0 text-sm transition-colors ${
                      day.hasData ? 'active:bg-blue-50 cursor-pointer' : 'cursor-default'
                    } ${isToday ? 'bg-blue-50' : ''}`}
                  >
                    <span className="flex items-center gap-1.5 font-medium text-gray-700">
                      {day.date.slice(5).replace('-', '/')}
                      {missing && <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />}
                      {day.hasData && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
                    </span>
                    <span className={`text-right font-medium ${day.hasData ? 'text-gray-800' : 'text-gray-300'}`}>
                      {day.hasData ? day.net.toLocaleString() + '원' : '-'}
                    </span>
                  </button>
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
