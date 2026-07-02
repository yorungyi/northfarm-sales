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
import { getSalesByDate, getSalesByMonth, getSalesByRange } from '../lib/api'
import { formatCurrency, formatDate, toDateString, calcChangeRate } from '../utils/format'
import BottomNav from '../components/BottomNav'

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

// 월 목표 localStorage 키 (월별 구분)
function targetKey(year: number, month: number) {
  return `northfarm_target_${year}_${String(month).padStart(2, '0')}`
}
function loadTarget(year: number, month: number): number {
  return parseInt(localStorage.getItem(targetKey(year, month)) ?? '0', 10) || 0
}
function saveTarget(year: number, month: number, value: number) {
  localStorage.setItem(targetKey(year, month), String(value))
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
  const [lastYearTotal, setLastYearTotal] = useState<number>(0)
  const [weeklyData, setWeeklyData] = useState<{ date: string; total: number }[]>([])
  const [loading, setLoading] = useState(true)

  // 목표 매출 (원 단위)
  const [target, setTarget] = useState(() => loadTarget(now.getFullYear(), now.getMonth() + 1))
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput, setTargetInput] = useState('')

  useEffect(() => {
    // 최근 7일 범위 계산
    const end = new Date(today + 'T00:00:00')
    end.setDate(end.getDate() + 1)
    const start = new Date(today + 'T00:00:00')
    start.setDate(start.getDate() - 6)
    const startStr = toDateString(start)
    const endStr = toDateString(end)

    // 최근 7일 날짜 배열 (오늘 포함)
    const last7: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today + 'T00:00:00')
      d.setDate(d.getDate() - i)
      last7.push(toDateString(d))
    }

    Promise.all([
      getSalesByDate(today),
      getSalesByMonth(selYear, selMonth),
      getSalesByMonth(selYear - 1, selMonth), // 전년 동월
      getSalesByRange(startStr, endStr),       // 최근 7일
    ]).then(([todayRows, mRows, lastYearRows, weekRows]) => {
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

      // 전년 동월 합계
      setLastYearTotal(lastYearRows.reduce((s, r) => s + r.total_sales, 0))

      // 최근 7일 일별 합산
      const dayTotals = new Map<string, number>()
      for (const r of weekRows) {
        dayTotals.set(r.sale_date, (dayTotals.get(r.sale_date) ?? 0) + r.total_sales)
      }
      setWeeklyData(last7.map((date) => ({ date, total: dayTotals.get(date) ?? 0 })))
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

  // 목표 달성률 계산
  const achieveRate = target > 0 ? Math.min(Math.round((monthDonut.total / target) * 100), 100) : 0
  const todayNum = parseInt(today.split('-')[2], 10)
  const daysInMonth = new Date(selYear, selMonth, 0).getDate()
  // 오늘 매출 입력 완료 시 오늘 제외, 미입력 시 오늘 포함
  const remainDays = todayDonut.total > 0
    ? daysInMonth - todayNum
    : daysInMonth - todayNum + 1
  const remainAmount = Math.max(target - monthDonut.total, 0)
  const dailyNeed = remainDays > 0 && remainAmount > 0
    ? Math.round(remainAmount / remainDays / 10000) // 만원 단위
    : 0

  function handleTargetSave() {
    const val = parseInt(targetInput.replace(/,/g, ''), 10)
    if (!isNaN(val) && val > 0) {
      saveTarget(selYear, selMonth, val * 10000) // 만원 입력 → 원 저장
      setTarget(val * 10000)
    }
    setEditingTarget(false)
  }

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
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-gray-400">{inputDays}일 입력 완료</p>
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
                    onClick={handleTargetSave}
                    className="text-xs text-white bg-blue-600 px-2.5 py-1 rounded-lg font-medium"
                  >
                    확인
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setTargetInput(target > 0 ? String(target / 10000) : '')
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
