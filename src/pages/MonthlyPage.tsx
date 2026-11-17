import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'
import { getSalesByMonth, getClosingTarget } from '../lib/api'
import { formatCurrency, calcChangeRate } from '../utils/format'
import { downloadCsv } from '../utils/exportCsv'
import { buildScorecard, dailyPar } from '../utils/scorecard'
import type { ScoreDay } from '../utils/scorecard'
import BottomNav from '../components/BottomNav'
import MonthYearPicker from '../components/MonthYearPicker'
import MonthlyScorecard from '../components/MonthlyScorecard'
import { Segmented } from '../components/Ledger'
import type { SegmentOption } from '../components/Ledger'
import { VENUE_SWATCH, BTN_OUTLINE, BTN_FILLED, CARD, ALERT, formatDelta, deltaChip } from '../lib/ledger'

/** 월별 보기 — 일자별 목록(기본) / 스코어카드 */
type MonthlyView = 'list' | 'scorecard'

const MONTHLY_VIEW_OPTIONS: SegmentOption<MonthlyView>[] = [
  { value: 'list', label: '목록' },
  { value: 'scorecard', label: '스코어카드' },
]

/** 보기 기억용 localStorage 키 (이 기기에서만 쓰는 편의 설정) */
const MONTHLY_VIEW_KEY = 'northfarm_monthly_view'

/** 기억해 둔 보기 읽기 — 저장소를 못 쓰면 기본값(목록) */
function readMonthlyView(): MonthlyView {
  try {
    return localStorage.getItem(MONTHLY_VIEW_KEY) === 'scorecard' ? 'scorecard' : 'list'
  } catch {
    return 'list'
  }
}

/** 보기 기억 — 실패해도 화면 동작에는 영향 없음 */
function writeMonthlyView(view: MonthlyView): void {
  try {
    localStorage.setItem(MONTHLY_VIEW_KEY, view)
  } catch {
    // 무시
  }
}

/**
 * 그 달 목표 매출 — 어느 달의 값인지(key)를 함께 보관해 월 전환 직후 이전 달 목표로 판정하지 않게 한다.
 * won: closing_target.sales_target(천원) × 1000 = 원. 행이 없거나 0원이면 null(목표 없음)
 */
interface MonthTarget {
  key: string
  won: number | null
  failed: boolean
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** 증감률 글자색 — 감소는 빨강, 나머지는 초록 */
function deltaTone(rate: number): string {
  return rate < 0 ? 'text-accent-ink' : 'text-brand-ink'
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
  const [view, setView] = useState<MonthlyView>(readMonthlyView)
  const [targetData, setTargetData] = useState<MonthTarget | null>(null)

  const currentYear = today.getFullYear()

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

  // 스코어카드용 그 달 목표 매출 — 단위 환산: closing_target.sales_target은 천원(대시보드·가마감과 같은 정본) → ×1000 = 원
  useEffect(() => {
    let cancelled = false
    const key = monthKeyOf(selYear, selMonth)
    getClosingTarget(selYear, selMonth).then((row) => {
      if (cancelled) return
      const won = row !== null && row.sales_target > 0 ? row.sales_target * 1000 : null
      setTargetData({ key, won, failed: false })
    }).catch(() => {
      // 조회 실패 — 판정 없이 금액만 그린다
      if (cancelled) return
      setTargetData({ key, won: null, failed: true })
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

  // ── 스코어카드 ──────────────────────────────────────────
  // 하루 목표(파) = 그 달 목표 매출(원) ÷ 그 달 일수. 목표 조회가 끝나기 전·실패·0원이면 판정 없이 금액만
  const loadedTarget = targetData !== null && targetData.key === monthKey ? targetData : null
  const par = dailyPar(loadedTarget?.won ?? null, selYear, selMonth)
  const scorecard = buildScorecard(selYear, selMonth, dayMap, todayStr, par)

  function changeView(next: MonthlyView) {
    setView(next)
    writeMonthlyView(next)
  }

  /** 스코어카드 칸 누름 — 기존 목록과 같은 이동: 입력된 날은 상세, 지난 날·오늘 미입력은 입력 화면 */
  function openScoreDay(day: ScoreDay) {
    if (day.hasData) navigate(`/detail/${day.date}`)
    else if (day.date <= todayStr) navigate(`/input?date=${day.date}`)
  }

  return (
    <div className="min-h-screen bg-paper text-ink pb-24">
      {/* 헤더 — 바탕 위 큰 제목 + 연도·월 선택기 */}
      <header className="bg-paper px-4 pt-safe-top">
        <MonthYearPicker
          title="월별 현황"
          year={selYear}
          month={selMonth}
          onChange={(y, m) => { setSelYear(y); setSelMonth(m) }}
        />
      </header>

      {/* 조회 실패 안내 — 빈 화면을 '전부 미입력'으로 오해하지 않게 한다 */}
      {loadFailed && (
        <div className="px-4 mt-3 max-w-lg mx-auto">
          <div role="alert" className={ALERT}>
            <p className="text-sm font-bold text-accent-ink">데이터를 불러오지 못했습니다</p>
            <p className="mt-1 text-sm text-ink-2">
              네트워크 상태를 확인하고 새로고침해주세요.
            </p>
          </div>
        </div>
      )}

      <main className="px-4 max-w-lg mx-auto">
        {/* ── 주인공 숫자: 월 합계 → 전월·전년 칩 ── */}
        <section aria-labelledby="monthly-total-title" className="mt-3">
          <div className="flex items-start justify-between gap-3">
            <h2 id="monthly-total-title" className="pt-1 text-base font-medium text-muted">
              {selYear !== currentYear ? `${selYear}년 ` : ''}{selMonth}월 순매출 합계
            </h2>
            {/* 엑셀 내보내기 */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading}
              className={BTN_OUTLINE}
            >
              엑셀 내보내기
            </button>
          </div>
          {/* 불러오는 중에는 금액 대신 '—' — 이전 달 숫자를 이 달 숫자로 오해하지 않게 한다 */}
          <p className="num mt-1 text-4xl leading-tight font-bold tracking-[-0.03em] text-ink">
            {loading ? '—' : formatCurrency(monthTotal)}
          </p>

          {(changeRate !== null || yoyRate !== null) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {changeRate !== null && (
                <span className={deltaChip(changeRate)}>
                  전월 <span className="num">{formatDelta(changeRate)}</span>
                </span>
              )}
              {yoyRate !== null && (
                <span className={deltaChip(yoyRate)}>
                  전년동월 <span className="num">{formatDelta(yoyRate)}</span>
                </span>
              )}
            </div>
          )}
        </section>

        {/* 보기 전환 — 목록(기본) / 스코어카드 */}
        <Segmented
          label="월별 보기"
          value={view}
          options={MONTHLY_VIEW_OPTIONS}
          onChange={changeView}
          className="mt-5"
        />

        {loading ? (
          // 로딩 — 카드 자리 모양의 빈 막대 (애니메이션 없음)
          <div className={`${CARD} mt-3`} aria-busy="true">
            <div className="h-3 w-full rounded-full bg-paper-2" />
            <div className="mt-3 h-3 w-full rounded-full bg-paper-2" />
            <div className="mt-3 h-3 w-full rounded-full bg-paper-2" />
            <div className="mt-3 h-3 w-2/3 rounded-full bg-paper-2" />
            <p className="mt-4 text-sm text-muted">로딩 중…</p>
          </div>
        ) : view === 'scorecard' ? (
          <MonthlyScorecard
            month={selMonth}
            scorecard={scorecard}
            par={par}
            targetFailed={loadedTarget?.failed ?? false}
            targetLoading={loadedTarget === null}
            onOpenDay={openScoreDay}
          />
        ) : (
          // 일자별 목록 — 날짜를 누르면 업장 내역이 펼쳐지고, 빈 날은 입력 화면으로 간다
          <section aria-label={`${selMonth}월 일자별 순매출`} className={`${CARD} mt-3`}>
            <table className="w-full text-sm">
              <caption className="sr-only">{selMonth}월 일자별 순매출</caption>
              <thead>
                <tr>
                  <th scope="col" className="pb-2 text-left text-sm font-medium text-muted">날짜</th>
                  <th scope="col" className="pb-2 pl-2 text-right text-sm font-medium text-muted">순매출</th>
                  <th scope="col" className="pb-2 pl-2 text-right text-sm font-medium text-muted">전년</th>
                  <th scope="col" className="pb-2 pl-2 w-14"></th>
                </tr>
              </thead>
              <tbody>
                {daySummaries.map((day) => {
                  const isPast = day.date < todayStr
                  const isToday = day.date === todayStr
                  const missing = isPast && !day.hasData
                  const isExpanded = activeExpandedDate === day.date
                  const vMap = venueMap.get(day.date) ?? {}
                  const clickable = day.hasData || isPast || isToday

                  // 작년 같은 날 비교 — 작년 값이 없으면 칸을 비운다
                  const lyThousands = Math.round(day.lastYearNet / 1000)
                  const delta = day.lastYearNet > 0 && day.hasData
                    ? Math.round(((day.net - day.lastYearNet) / day.lastYearNet) * 100)
                    : null

                  return (
                    <Fragment key={day.date}>
                      {/* 날짜 행 — 날짜 버튼이 행 전체를 덮어 어디를 눌러도 동작한다 */}
                      <tr
                        className={`relative border-t border-rule transition-colors ${
                          isExpanded || isToday ? 'bg-paper-2' : ''
                        } ${clickable ? 'hover:bg-paper-2' : ''}`}
                      >
                        <th scope="row" className="pr-2 text-left font-normal align-middle">
                          <button
                            type="button"
                            onClick={() => {
                              if (day.hasData) {
                                // 데이터 있는 날 → 드릴다운 토글
                                setExpandedDate(isExpanded ? null : day.date)
                              } else if (isPast || isToday) {
                                navigate(`/input?date=${day.date}`)
                              }
                            }}
                            disabled={!day.hasData && !isPast && !isToday}
                            aria-expanded={day.hasData ? isExpanded : undefined}
                            className={`num min-h-11 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-offset-2 disabled:cursor-default ${
                              isToday ? 'font-bold text-ink' : clickable ? 'font-medium text-ink-2' : 'text-muted'
                            }`}
                          >
                            {day.date.slice(5).replace('-', '/')}
                          </button>
                        </th>
                        <td className="py-2 pl-2 text-right whitespace-nowrap align-middle">
                          {day.hasData ? (
                            <span className="font-semibold text-ink"><span className="num">{day.net.toLocaleString()}</span>원</span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td className="py-2 pl-2 text-right text-sm whitespace-nowrap align-middle">
                          {day.lastYearNet > 0 && (
                            <>
                              <span className="block text-muted">
                                작년 <span className="num">{lyThousands.toLocaleString()}</span>천
                              </span>
                              {delta !== null && (
                                <span className={`num block font-semibold ${deltaTone(delta)}`}>{formatDelta(delta)}</span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="py-2 pl-2 text-right text-sm whitespace-nowrap align-middle">
                          {missing && <span className="font-bold text-accent-ink">입력</span>}
                          {day.hasData && (
                            <svg
                              viewBox="0 0 24 24"
                              className={`ml-auto w-4 h-4 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            >
                              <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </td>
                      </tr>

                      {/* 드릴다운 — 그날의 업장별 내역과 상세·수정 이동 */}
                      {isExpanded && (
                        <tr className="bg-paper-2">
                          <td colSpan={4} className="px-3 pt-1 pb-3">
                            <ul>
                              {VENUES.map((venue) => {
                                const net = vMap[venue] ?? 0
                                const pct = day.net > 0 ? Math.round((net / day.net) * 100) : 0
                                return (
                                  <li
                                    key={venue}
                                    className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 py-2 border-t border-rule first:border-t-0 text-sm"
                                  >
                                    <span className="flex items-center gap-2 min-w-0 text-ink-2">
                                      <span className={`w-2 h-2 shrink-0 rounded-full ${VENUE_SWATCH[venue]}`} aria-hidden="true" />
                                      <span className="truncate">{venue}</span>
                                    </span>
                                    <span className="num w-10 text-right text-muted">{net > 0 ? `${pct}%` : '-'}</span>
                                    <span className="w-28 text-right font-semibold text-ink whitespace-nowrap">
                                      {net > 0 ? <><span className="num">{net.toLocaleString()}</span>원</> : '-'}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                            {/* 상세 / 수정 이동 */}
                            <div className="flex gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => navigate(`/detail/${day.date}`)}
                                className={`${BTN_FILLED} flex-1`}
                              >
                                상세 보기
                              </button>
                              <button
                                type="button"
                                onClick={() => navigate(`/input?date=${day.date}`)}
                                className={`${BTN_OUTLINE} flex-1`}
                              >
                                수정
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              {/* 합계 행 — 올해 합계 옆에 전년 동월 합계를 나란히 둔다 */}
              <tfoot>
                <tr className="border-t border-rule-2">
                  <th scope="row" className="pt-3 text-left font-bold text-ink">합계</th>
                  <td className="pt-3 pl-2 text-right font-bold text-ink whitespace-nowrap">
                    <span className="num">{monthTotal.toLocaleString()}</span>원
                  </td>
                  <td className="pt-3 pl-2 text-right text-sm whitespace-nowrap">
                    {lastYearTotal > 0 ? (
                      <>
                        <span className="block text-muted">
                          작년 <span className="num">{Math.round(lastYearTotal / 1000).toLocaleString()}</span>천
                        </span>
                        {yoyRate !== null && (
                          <span className={`num block font-semibold ${deltaTone(yoyRate)}`}>{formatDelta(yoyRate)}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">작년 -</span>
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-sm text-muted">※ △는 감소입니다.</p>
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
