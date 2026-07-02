import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'
import { getSalesByDate, getSalesByMonth } from '../lib/api'
import { formatDate, formatCurrency, calcChangeRate } from '../utils/format'
import { generateKakaoReport } from '../utils/kakao'
import type { KakaoReportOptions } from '../utils/kakao'
import BottomNav from '../components/BottomNav'

export default function DetailPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const safeDate = date ?? ''

  const [salesMap, setSalesMap] = useState<Partial<Record<Venue, DailySales>>>({})
  const [prevMap, setPrevMap] = useState<Partial<Record<Venue, DailySales>>>({})
  const [monthTotal, setMonthTotal] = useState<number>(0)
  const [memos, setMemos] = useState<Record<Venue, string>>(
    () => Object.fromEntries(VENUES.map((v) => [v, ''])) as Record<Venue, string>
  )
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!safeDate) return
    const prevDate = new Date(safeDate + 'T00:00:00')
    prevDate.setDate(prevDate.getDate() - 1)
    const prevDateStr = prevDate.toLocaleDateString('sv-SE')

    const dateObj = new Date(safeDate + 'T00:00:00')
    const year = dateObj.getFullYear()
    const month = dateObj.getMonth() + 1

    Promise.all([
      getSalesByDate(safeDate),
      getSalesByDate(prevDateStr),
      getSalesByMonth(year, month), // 월 누적용
    ]).then(([cur, prev, monthRows]) => {
      const cm: Partial<Record<Venue, DailySales>> = {}
      for (const r of cur) cm[r.venue as Venue] = r
      setSalesMap(cm)

      const pm: Partial<Record<Venue, DailySales>> = {}
      for (const r of prev) pm[r.venue as Venue] = r
      setPrevMap(pm)

      // 월 누적 합계
      setMonthTotal(monthRows.reduce((s, r) => s + r.total_sales, 0))

      // 메모 로드
      const loaded: Record<Venue, string> = Object.fromEntries(
        VENUES.map((v) => [v, ''])
      ) as Record<Venue, string>
      for (const v of VENUES) {
        loaded[v] = localStorage.getItem(`northfarm_memo_${safeDate}_${v}`) ?? ''
      }
      setMemos(loaded)
    }).finally(() => setLoading(false))
  }, [safeDate])

  if (!safeDate) return null

  const totalNet = VENUES.reduce((s, v) => s + (salesMap[v]?.total_sales ?? 0), 0)
  const prevTotalNet = VENUES.reduce((s, v) => s + (prevMap[v]?.total_sales ?? 0), 0)

  async function handleCopy() {
    const dateObj = new Date(safeDate + 'T00:00:00')
    const options: KakaoReportOptions = {
      salesMap,
      prevMap,
      monthTotal,
      selMonth: dateObj.getMonth() + 1,
      memos,
    }
    const text = generateKakaoReport(safeDate, options)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
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
          <div className="bg-blue-600 rounded-2xl p-4 text-white text-center shadow">
            <p className="text-sm text-blue-200">전체 순매출</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(totalNet)}</p>
            {(() => {
              const rate = calcChangeRate(totalNet, prevTotalNet)
              if (rate === null) return null
              return (
                <p className={`text-sm mt-1 ${rate >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  전일 대비 {rate >= 0 ? '↑' : '↓'}{Math.abs(rate)}%
                </p>
              )
            })()}
          </div>

          {/* 업장별 카드 */}
          {VENUES.map((venue) => {
            const net = salesMap[venue]?.total_sales ?? 0
            const prevNet = prevMap[venue]?.total_sales ?? 0
            const rate = calcChangeRate(net, prevNet)

            return (
              <div key={venue} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800">{venue}</span>
                  <div className="text-right">
                    <span className="font-bold text-gray-800">{formatCurrency(net)}</span>
                    {rate !== null && (
                      <span className={`text-xs ml-2 ${rate >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {rate >= 0 ? '↑' : '↓'}{Math.abs(rate)}%
                      </span>
                    )}
                  </div>
                </div>
                {/* 메모 표시 */}
                {memos[venue] && (
                  <p className="mt-1.5 text-xs text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    📝 {memos[venue]}
                  </p>
                )}
              </div>
            )
          })}

          {/* 카카오 보고 복사 */}
          <button
            onClick={handleCopy}
            className="w-full py-4 rounded-2xl font-bold text-base shadow active:scale-95 transition-transform"
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
