import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DailySales } from '../types/sales'
import { getSalesByMonth } from '../lib/api'
import { formatCurrency, calcChangeRate } from '../utils/format'
import BottomNav from '../components/BottomNav'

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function todayYM(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function getRecentMonths(count: number): { year: number; month: number; label: string }[] {
  const result = []
  const d = new Date()
  for (let i = 0; i < count; i++) {
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    result.unshift({ year, month, label: `${month}월` })
    d.setMonth(d.getMonth() - 1)
  }
  return result
}

interface DaySummary {
  date: string
  food: number
  store: number
  total: number
  hasData: boolean
}

export default function MonthlyPage() {
  const navigate = useNavigate()
  const { year: todayYear, month: todayMonth } = todayYM()
  const [selYear, setSelYear] = useState(todayYear)
  const [selMonth, setSelMonth] = useState(todayMonth)
  const [rows, setRows] = useState<DailySales[]>([])
  const [prevRows, setPrevRows] = useState<DailySales[]>([])
  const [loading, setLoading] = useState(false)

  const tabs = getRecentMonths(6)

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

  // 날짜별 합산
  const dayMap = new Map<string, { food: number; store: number; total: number }>()
  for (const r of rows) {
    const prev = dayMap.get(r.sale_date) ?? { food: 0, store: 0, total: 0 }
    dayMap.set(r.sale_date, {
      food: prev.food + r.food_sales,
      store: prev.store + r.store_sales,
      total: prev.total + r.total_sales,
    })
  }

  const daysInMonth = getDaysInMonth(selYear, selMonth)
  const today = new Date().toLocaleDateString('sv-SE')

  const daySummaries: DaySummary[] = Array.from({ length: daysInMonth }, (_, i) => {
    const mm = String(selMonth).padStart(2, '0')
    const dd = String(i + 1).padStart(2, '0')
    const date = `${selYear}-${mm}-${dd}`
    const entry = dayMap.get(date)
    return {
      date,
      food: entry?.food ?? 0,
      store: entry?.store ?? 0,
      total: entry?.total ?? 0,
      hasData: !!entry,
    }
  })

  // 월 합계
  const monthFood = daySummaries.reduce((s, d) => s + d.food, 0)
  const monthStore = daySummaries.reduce((s, d) => s + d.store, 0)
  const monthTotal = daySummaries.reduce((s, d) => s + d.total, 0)

  // 전월 합계
  const prevFood = prevRows.reduce((s, r) => s + r.food_sales, 0)
  const prevStore = prevRows.reduce((s, r) => s + r.store_sales, 0)
  const prevTotal = prevRows.reduce((s, r) => s + r.total_sales, 0)

  function ChangeTag({ current, previous }: { current: number; previous: number }) {
    const rate = calcChangeRate(current, previous)
    if (rate === null) return null
    const up = rate >= 0
    return (
      <span className={`text-xs font-medium ml-1 ${up ? 'text-green-500' : 'text-red-500'}`}>
        {up ? '↑' : '↓'}{Math.abs(rate)}%
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="text-lg font-bold text-gray-900">월별 현황</h1>
        </div>
        {/* 월 탭 */}
        <div className="max-w-lg mx-auto flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
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
                {t.year !== todayYear ? `${t.year}년 ` : ''}{t.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* 월 합계 카드 */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="bg-blue-600 rounded-2xl p-4 text-white grid grid-cols-3 gap-2 text-center shadow">
          <div>
            <p className="text-xs text-blue-200">식료</p>
            <p className="font-bold text-sm mt-0.5">{formatCurrency(monthFood)}</p>
            <ChangeTag current={monthFood} previous={prevFood} />
          </div>
          <div>
            <p className="text-xs text-blue-200">매점</p>
            <p className="font-bold text-sm mt-0.5">{formatCurrency(monthStore)}</p>
            <ChangeTag current={monthStore} previous={prevStore} />
          </div>
          <div>
            <p className="text-xs text-blue-200">합계</p>
            <p className="font-bold text-sm mt-0.5">{formatCurrency(monthTotal)}</p>
            <ChangeTag current={monthTotal} previous={prevTotal} />
          </div>
        </div>
      </div>

      {/* 일별 테이블 */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* 헤더 행 */}
          <div className="grid grid-cols-4 text-xs text-gray-400 font-medium px-4 py-2 border-b border-gray-100">
            <span>날짜</span>
            <span className="text-right">식료</span>
            <span className="text-right">매점</span>
            <span className="text-right">합계</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">로딩 중...</div>
          ) : (
            <>
              {daySummaries.map((day) => {
                const isPast = day.date < today
                const isToday = day.date === today
                const isFuture = day.date > today
                const missing = isPast && !day.hasData

                return (
                  <button
                    key={day.date}
                    onClick={() => day.hasData && navigate(`/detail/${day.date}`)}
                    disabled={!day.hasData}
                    className={`w-full grid grid-cols-4 px-4 py-2.5 border-b border-gray-50 last:border-0 text-sm transition-colors ${
                      day.hasData ? 'active:bg-blue-50 cursor-pointer' : 'cursor-default'
                    } ${isToday ? 'bg-blue-50' : ''}`}
                  >
                    <span className="flex items-center gap-1.5 font-medium text-gray-700">
                      {day.date.slice(8)}일
                      {missing && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                      )}
                      {day.hasData && !isFuture && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      )}
                    </span>
                    <span className={`text-right text-xs ${day.hasData ? 'text-gray-600' : 'text-gray-300'}`}>
                      {day.hasData ? day.food.toLocaleString() : '-'}
                    </span>
                    <span className={`text-right text-xs ${day.hasData ? 'text-gray-600' : 'text-gray-300'}`}>
                      {day.hasData ? day.store.toLocaleString() : '-'}
                    </span>
                    <span className={`text-right text-xs font-medium ${day.hasData ? 'text-gray-800' : 'text-gray-300'}`}>
                      {day.hasData ? day.total.toLocaleString() : '-'}
                    </span>
                  </button>
                )
              })}

              {/* 합계 행 */}
              <div className="grid grid-cols-4 px-4 py-3 bg-gray-50 text-sm font-bold">
                <span className="text-gray-700">합계</span>
                <span className="text-right text-gray-700">{monthFood.toLocaleString()}</span>
                <span className="text-right text-gray-700">{monthStore.toLocaleString()}</span>
                <span className="text-right text-blue-600">{monthTotal.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
