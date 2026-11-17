import { useState, useEffect, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'
import { getSalesByDate, getSalesByMonth, getDailyNote } from '../lib/api'
import { formatDate, formatCurrency, calcChangeRate } from '../utils/format'
import { generateKakaoReport } from '../utils/kakao'
import type { KakaoReportOptions } from '../utils/kakao'
import BottomNav from '../components/BottomNav'
import { PageHeader } from '../components/Ledger'
import { VENUE_SWATCH, BTN_OUTLINE, CARD, formatDelta, deltaChip } from '../lib/ledger'

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
      getDailyNote(safeDate),       // 메모·내장객 수
    ]).then(([cur, prev, monthRows, note]) => {
      const cm: Partial<Record<Venue, DailySales>> = {}
      for (const r of cur) cm[r.venue as Venue] = r
      setSalesMap(cm)

      const pm: Partial<Record<Venue, DailySales>> = {}
      for (const r of prev) pm[r.venue as Venue] = r
      setPrevMap(pm)

      // 월 누적 합계
      setMonthTotal(monthRows.reduce((s, r) => s + r.total_sales, 0))

      // 메모 로드 (Supabase daily_notes)
      const loaded: Record<Venue, string> = Object.fromEntries(
        VENUES.map((v) => [v, ''])
      ) as Record<Venue, string>
      for (const v of VENUES) {
        loaded[v] = note?.memos[v] ?? ''
      }
      setMemos(loaded)
    }).catch(() => {
      // 조회 실패 — 화면은 빈 상태로 유지
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

  // 당일 합계의 전일 대비 증감률
  const totalRate = calcChangeRate(totalNet, prevTotalNet)

  return (
    <div className="min-h-screen bg-paper text-ink pb-24">
      <PageHeader
        title="날짜별 상세"
        aside={
          <button
            type="button"
            onClick={() => navigate(`/input?date=${safeDate}`)}
            className={BTN_OUTLINE}
          >
            수정
          </button>
        }
      >
        <p className="max-w-lg mx-auto pb-1 text-base text-muted">{formatDate(safeDate)}</p>
      </PageHeader>

      {loading ? (
        // 로딩 — 큰 숫자와 카드 자리 모양의 빈 막대 (애니메이션 없음)
        <div className="px-4 mt-3 max-w-lg mx-auto" aria-busy="true">
          <div className="h-4 w-24 rounded-full bg-paper-3" />
          <div className="mt-3 h-9 w-52 rounded-full bg-paper-3" />
          <div className={`${CARD} mt-5`}>
            <div className="h-3 w-full rounded-full bg-paper-2" />
            <div className="mt-3 h-3 w-full rounded-full bg-paper-2" />
            <div className="mt-3 h-3 w-2/3 rounded-full bg-paper-2" />
          </div>
          <p className="mt-3 text-sm text-muted">로딩 중…</p>
        </div>
      ) : (
        <main className="px-4 max-w-lg mx-auto">
          {/* ── 주인공 숫자: 그날 전체 순매출 + 전일 대비 칩 ── */}
          <section aria-labelledby="day-total-title" className="mt-2">
            <h2 id="day-total-title" className="text-base font-medium text-muted">전체 순매출</h2>
            <p className="num mt-1 text-4xl leading-tight font-bold tracking-[-0.03em] text-ink">
              {formatCurrency(totalNet)}
            </p>
            {totalRate !== null && (
              <p className="mt-2">
                <span className={deltaChip(totalRate)}>
                  전일 대비 <span className="num">{formatDelta(totalRate)}</span>
                </span>
              </p>
            )}
          </section>

          {/* ── 업장별 카드 — 메모는 해당 업장 행 바로 아래 줄에 붙인다 ── */}
          <section aria-label="업장별 순매출" className={`${CARD} mt-5`}>
            <table className="w-full text-sm">
              <caption className="sr-only">업장별 순매출</caption>
              <thead>
                <tr>
                  <th scope="col" className="pb-2 text-left text-sm font-medium text-muted">업장</th>
                  <th scope="col" className="pb-2 pl-2 text-right text-sm font-medium text-muted">순매출</th>
                  <th scope="col" className="pb-2 pl-2 text-right text-sm font-medium text-muted whitespace-nowrap">전일 대비</th>
                </tr>
              </thead>
              <tbody>
                {VENUES.map((venue) => {
                  const net = salesMap[venue]?.total_sales ?? 0
                  const prevNet = prevMap[venue]?.total_sales ?? 0
                  const rate = calcChangeRate(net, prevNet)

                  return (
                    <Fragment key={venue}>
                      <tr className="border-t border-rule">
                        <th scope="row" className="py-3 pr-2 text-left font-medium text-ink">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${VENUE_SWATCH[venue]}`} aria-hidden="true" />
                            <span className="truncate">{venue}</span>
                          </span>
                        </th>
                        <td className="num py-3 pl-2 text-right font-semibold text-ink whitespace-nowrap">{formatCurrency(net)}</td>
                        <td className={`num py-3 pl-2 text-right font-semibold ${rate !== null && rate < 0 ? 'text-accent-ink' : 'text-brand-ink'}`}>
                          {rate !== null ? formatDelta(rate) : ''}
                        </td>
                      </tr>
                      {/* 메모 표시 */}
                      {memos[venue] && (
                        <tr>
                          <td colSpan={3} className="pb-3 pl-[18px] text-sm text-ink-2 whitespace-pre-wrap">
                            {memos[venue]}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
              {/* 합계 행 — 위에 가는 선 하나, 굵은 글자 */}
              <tfoot>
                <tr className="border-t border-rule-2">
                  <th scope="row" className="pt-3 text-left font-bold text-ink">합계</th>
                  <td className="num pt-3 pl-2 text-right font-bold text-ink whitespace-nowrap">{formatCurrency(totalNet)}</td>
                  <td className={`num pt-3 pl-2 text-right font-semibold ${totalRate !== null && totalRate < 0 ? 'text-accent-ink' : 'text-brand-ink'}`}>
                    {totalRate !== null ? formatDelta(totalRate) : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-sm text-muted">※ △는 감소입니다.</p>
          </section>

          {/* 카카오 보고 복사 — 카카오 브랜드색(팔레트 밖 예외) */}
          <button
            type="button"
            onClick={handleCopy}
            className="mt-5 w-full h-12 px-4 rounded-[14px] bg-kakao text-kakao-ink text-base font-bold hover:opacity-90 active:opacity-80 transition-opacity"
          >
            <span aria-live="polite">{copied ? '복사됨!' : '카카오 보고 복사'}</span>
          </button>
        </main>
      )}

      <BottomNav />
    </div>
  )
}
