import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'
import { getSalesByDate } from '../lib/api'
import { formatDate, formatCurrency, calcChangeRate } from '../utils/format'
import { generateKakaoReport } from '../utils/kakao'
import BottomNav from '../components/BottomNav'

export default function DetailPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()

  const [salesMap, setSalesMap] = useState<Partial<Record<Venue, DailySales>>>({})
  const [prevMap, setPrevMap] = useState<Partial<Record<Venue, DailySales>>>({})
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!date) return
    setLoading(true)

    const prevDate = new Date(date + 'T00:00:00')
    prevDate.setDate(prevDate.getDate() - 1)
    const prevDateStr = prevDate.toLocaleDateString('sv-SE')

    Promise.all([
      getSalesByDate(date),
      getSalesByDate(prevDateStr),
    ]).then(([cur, prev]) => {
      const cm: Partial<Record<Venue, DailySales>> = {}
      for (const r of cur) cm[r.venue as Venue] = r
      setSalesMap(cm)

      const pm: Partial<Record<Venue, DailySales>> = {}
      for (const r of prev) pm[r.venue as Venue] = r
      setPrevMap(pm)
    }).finally(() => setLoading(false))
  }, [date])

  const safeDate = date ?? ''

  if (!safeDate) return null

  const totalFood = VENUES.reduce((s, v) => s + (salesMap[v]?.food_sales ?? 0), 0)
  const totalStore = VENUES.reduce((s, v) => s + (salesMap[v]?.store_sales ?? 0), 0)
  const totalAll = totalFood + totalStore

  const prevTotalFood = VENUES.reduce((s, v) => s + (prevMap[v]?.food_sales ?? 0), 0)
  const prevTotalStore = VENUES.reduce((s, v) => s + (prevMap[v]?.store_sales ?? 0), 0)
  const prevTotalAll = prevTotalFood + prevTotalStore

  function ArrowTag({ current, previous }: { current: number; previous: number }) {
    const rate = calcChangeRate(current, previous)
    if (rate === null) return null
    const up = rate >= 0
    return (
      <span className={`text-xs font-medium ml-1 ${up ? 'text-green-500' : 'text-red-500'}`}>
        {up ? '↑' : '↓'}{Math.abs(rate)}%
      </span>
    )
  }

  async function handleCopy() {
    const text = generateKakaoReport(safeDate, salesMap)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // fallback
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">날짜별 상세</h1>
            <p className="text-xs text-gray-400">{formatDate(safeDate)}</p>
          </div>
          <button
            onClick={() => navigate(`/input?date=${safeDate}`)}
            className="text-sm text-blue-600 font-medium px-3 py-1.5 rounded-lg border border-blue-200 active:bg-blue-50"
          >
            수정
          </button>
        </div>
      </header>

      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">로딩 중...</div>
      ) : (
        <div className="px-4 pt-4 max-w-lg mx-auto space-y-4">
          {/* 당일 합계 카드 */}
          <div className="bg-blue-600 rounded-2xl p-4 text-white grid grid-cols-3 gap-2 text-center shadow">
            <div>
              <p className="text-xs text-blue-200">식료</p>
              <p className="font-bold text-sm mt-0.5">{formatCurrency(totalFood)}</p>
              <ArrowTag current={totalFood} previous={prevTotalFood} />
            </div>
            <div>
              <p className="text-xs text-blue-200">매점</p>
              <p className="font-bold text-sm mt-0.5">{formatCurrency(totalStore)}</p>
              <ArrowTag current={totalStore} previous={prevTotalStore} />
            </div>
            <div>
              <p className="text-xs text-blue-200">합계</p>
              <p className="font-bold text-sm mt-0.5">{formatCurrency(totalAll)}</p>
              <ArrowTag current={totalAll} previous={prevTotalAll} />
            </div>
          </div>

          {/* 업장별 카드 */}
          {VENUES.map((venue) => {
            const s = salesMap[venue]
            const p = prevMap[venue]
            const food = s?.food_sales ?? 0
            const store = s?.store_sales ?? 0
            const total = food + store
            const prevFood = p?.food_sales ?? 0
            const prevStore = p?.store_sales ?? 0
            const prevTotal = prevFood + prevStore

            return (
              <div key={venue} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800">{venue}</h3>
                  <div className="text-right">
                    <span className="font-bold text-blue-600">{formatCurrency(total)}</span>
                    <ArrowTag current={total} previous={prevTotal} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-xs text-gray-400 mb-1">식료</p>
                    <p className="font-medium text-gray-800">{formatCurrency(food)}</p>
                    <ArrowTag current={food} previous={prevFood} />
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-xs text-gray-400 mb-1">매점</p>
                    <p className="font-medium text-gray-800">{formatCurrency(store)}</p>
                    <ArrowTag current={store} previous={prevStore} />
                  </div>
                </div>
              </div>
            )
          })}

          {/* 카카오 보고 복사 버튼 */}
          <button
            onClick={handleCopy}
            className="w-full py-4 rounded-2xl font-bold text-base shadow transition-all active:scale-95"
            style={{ backgroundColor: '#FEE500', color: '#1A1A1A' }}
          >
            {copied ? '복사됨! ✓' : '카카오 보고 복사'}
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
