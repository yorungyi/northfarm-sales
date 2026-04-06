import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Venue, VENUES } from '../types/sales'
import type { DailySales } from '../types/sales'
import { getSalesByDate, getSalesByMonth } from '../lib/api'
import { formatCurrency, formatDate, toDateString } from '../utils/format'
import BottomNav from '../components/BottomNav'

ChartJS.register(ArcElement, Tooltip, Legend)

// 업장별 색상
const VENUE_COLORS: Record<Venue, string> = {
  [Venue.CLUBHOUSE]:  '#3B82F6', // blue
  [Venue.STARTHOUSE]: '#10B981', // emerald
  [Venue.EAST_SHADE]: '#F59E0B', // amber
  [Venue.WEST_SHADE]: '#8B5CF6', // violet
}

const VENUE_COLORS_LIGHT: Record<Venue, string> = {
  [Venue.CLUBHOUSE]:  '#DBEAFE',
  [Venue.STARTHOUSE]: '#D1FAE5',
  [Venue.EAST_SHADE]: '#FEF3C7',
  [Venue.WEST_SHADE]: '#EDE9FE',
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

export default function DashboardPage() {
  const navigate = useNavigate()
  const today = toDateString(new Date())
  const now = new Date()
  const [selYear] = useState(now.getFullYear())
  const [selMonth] = useState(now.getMonth() + 1)

  const [todayMap, setTodayMap] = useState<Partial<Record<Venue, number>>>({})
  const [monthMap, setMonthMap] = useState<Partial<Record<Venue, number>>>({})
  const [monthRows, setMonthRows] = useState<DailySales[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getSalesByDate(today),
      getSalesByMonth(selYear, selMonth),
    ]).then(([todayRows, mRows]) => {
      // 오늘
      const tm: Partial<Record<Venue, number>> = {}
      for (const r of todayRows) tm[r.venue as Venue] = r.total_sales
      setTodayMap(tm)

      // 이번 달 업장별 합산
      const mm: Partial<Record<Venue, number>> = {}
      for (const r of mRows) {
        mm[r.venue as Venue] = (mm[r.venue as Venue] ?? 0) + r.total_sales
      }
      setMonthMap(mm)
      setMonthRows(mRows)
    }).finally(() => setLoading(false))
  }, [today, selYear, selMonth])

  const todayDonut = buildDonutData(todayMap)
  const monthDonut = buildDonutData(monthMap)

  // 입력일수 계산
  const inputDays = new Set(monthRows.map((r) => r.sale_date)).size

  // 최고 업장 (이번달)
  const topVenue = VENUES.reduce((best, v) =>
    (monthMap[v] ?? 0) > (monthMap[best] ?? 0) ? v : best
  , VENUES[0])

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4">
          <p className="text-xs text-gray-400">노스팜CC</p>
          <h1 className="text-lg font-bold text-gray-900">매출 대시보드</h1>
        </div>
      </header>

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
                <p className="text-xs text-gray-400 mt-0.5">{inputDays}일 입력 완료</p>
              </div>
              <span className="text-xs bg-blue-50 text-blue-600 font-medium px-2.5 py-1 rounded-full">
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

          {/* 업장별 이번달 카드 */}
          <div className="grid grid-cols-2 gap-3">
            {VENUES.map((venue) => {
              const net = monthMap[venue] ?? 0
              const pct = monthDonut.total > 0 ? Math.round((net / monthDonut.total) * 100) : 0
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
                  <p className="text-xs text-gray-400 mt-0.5">{pct}% 비중</p>
                </div>
              )
            })}
          </div>

        </div>
      )}

      <BottomNav />
    </div>
  )
}
