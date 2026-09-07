import { useState, useEffect, useCallback } from 'react'
import { calcClosing } from '../types/closing'
import type { MonthlyClosing } from '../types/closing'
import {
  getMonthlyClosing,
  upsertMonthlyClosing,
  getSalesByMonth,
  getClosingsUpTo,
  getClosingsByYear,
  getClosingTarget,
  upsertClosingTarget,
} from '../lib/api'
import { downloadCsv } from '../utils/exportCsv'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'
import ClosingTrendChart from '../components/ClosingTrendChart'
import MonthYearPicker from '../components/MonthYearPicker'

// ── 숫자 입력 헬퍼 ─────────────────────────────────────────
function fmtAbs(n: number) {
  return n === 0 ? '' : Math.abs(n).toLocaleString('ko-KR')
}
function parseAbs(s: string) {
  const n = parseInt(s.replace(/,/g, ''), 10)
  return isNaN(n) ? 0 : Math.abs(n)
}

function NumInput({
  label, value, onChange, hint, hintNeg,
}: {
  label: string; value: number; onChange: (v: number) => void; hint?: string; hintNeg?: boolean
}) {
  const isNeg = value < 0
  const [disp, setDisp] = useState(fmtAbs(value))
  useEffect(() => { setDisp(fmtAbs(value)) }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/,/g, '')
    if (raw === '' || /^\d+$/.test(raw)) {
      setDisp(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'))
      const abs = parseAbs(raw)
      onChange(isNeg ? -abs : abs)
    }
  }

  function toggleSign() { onChange(-value) }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-600 w-20 shrink-0">{label}</label>
      <button
        type="button"
        onClick={toggleSign}
        className={`w-8 h-8 rounded-lg text-sm font-bold shrink-0 transition-colors ${
          isNeg
            ? 'bg-red-100 text-red-600 border border-red-200'
            : 'bg-gray-100 text-gray-500 border border-gray-200'
        }`}
      >
        {isNeg ? '−' : '+'}
      </button>
      <div className="relative flex-1">
        <input
          type="text"
          inputMode="numeric"
          value={disp}
          onChange={handleChange}
          placeholder="0"
          className={`w-full text-right pr-10 py-2.5 px-3 rounded-xl border text-sm font-medium focus:outline-none focus:ring-1 ${
            isNeg
              ? 'border-red-200 text-red-600 focus:border-red-400 focus:ring-red-400'
              : 'border-gray-200 text-gray-800 focus:border-blue-400 focus:ring-blue-400'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">천원</span>
      </div>
      {hint && (
        <span className={`text-xs font-semibold w-14 text-right shrink-0 ${hintNeg ? 'text-red-500' : 'text-blue-600'}`}>
          {hint}
        </span>
      )}
    </div>
  )
}

// ── 카카오 보고 텍스트 생성 ─────────────────────────────────
function buildKakaoText(
  year: number, month: number,
  d: Omit<MonthlyClosing, 'id' | 'created_at' | 'updated_at'>,
  target: ClosingTarget,
): string {
  const c = calcClosing(d)
  const n = (v: number) => v.toLocaleString('ko-KR')
  const p = (v: number) => v.toFixed(1)
  const hasTarget = target.sales > 0

  // 목표대비 상태 문자열
  function tgtStatus(actual: number, tgt: number, lowerIsBetter: boolean): string {
    if (tgt <= 0 || actual <= 0) return ''
    const diff = actual - tgt
    const good = lowerIsBetter ? diff <= 0 : diff >= 0
    const rate = (actual / tgt) * 100
    const absDiff = Math.abs(Math.round(diff)).toLocaleString('ko-KR')
    const icon = good ? '✅' : (rate >= 80 ? '⚠️' : '🔴')
    const label = good
      ? lowerIsBetter ? `${absDiff}천 절감` : `${absDiff}천 초과달성`
      : lowerIsBetter ? `${absDiff}천 초과` : `${absDiff}천 미달`
    return `${icon} ${label} (${rate.toFixed(1)}%)`
  }

  // 종합 평가 — 이익 달성 여부 기준
  function overallStatus(): string {
    const tProfit = calcTargetProfit(target)
    if (tProfit <= 0) return ''
    const st = tgtStatus(c.profit, tProfit, false)
    if (st.startsWith('✅')) return '✅ 이익 목표 달성'
    if (st.startsWith('⚠️')) return '⚠️ 이익 목표 근접 (주의)'
    return '🔴 이익 목표 미달'
  }

  const tProfit = calcTargetProfit(target)
  const tProfitRate = calcTargetProfitRate(target)

  const rows: string[] = [
    `📊 [노스팜CC 식음팀] 가마감 손익보고`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📅 ${year}년 ${String(month).padStart(2, '0')}월 기준 (예상치)`,
    ``,
    `▣ 핵심 요약`,
    `  • 영업이익    ${n(c.profit)}천원 (이익률 ${p(c.profit_rate)}%)`,
    `  • Prime Cost  ${p(c.prime_cost_rate)}% (식재비+인건비)`,
  ]
  if (hasTarget) rows.push(`  • 종합평가    ${overallStatus()}`)

  rows.push(``, `━━━━━━━━━━━━━━━━━━━━━`)

  // 💰 매출
  rows.push(`💰 매출`)
  if (hasTarget) rows.push(`  목  표   ${n(target.sales)}천원`)
  rows.push(`  실  적   ${n(d.sales_total)}천원`)
  if (hasTarget) {
    const st = tgtStatus(d.sales_total, target.sales, false)
    if (st) rows.push(`  달성현황  ${st}`)
  }

  rows.push(``)

  // 🥩 식재료비
  rows.push(`🥩 식재료비`)
  if (hasTarget) {
    const tRate = (target.food_cost / target.sales * 100).toFixed(1)
    rows.push(`  목  표   ${n(target.food_cost)}천원 (목표율 ${tRate}%)`)
  }
  rows.push(`  실  적   ${n(d.food_cost)}천원 (원가율 ${p(c.food_cost_rate)}%)`)
  if (hasTarget) {
    const st = tgtStatus(d.food_cost, target.food_cost, true)
    if (st) rows.push(`  달성현황  ${st}`)
  }

  rows.push(``)

  // 👤 인건비
  rows.push(`👤 인건비`)
  if (hasTarget) rows.push(`  목  표   ${n(target.labor)}천원`)
  rows.push(`  실  적   ${n(c.labor_total)}천원 (인건비율 ${p(c.labor_rate)}%)`)
  rows.push(`    └ 직영 ${n(d.labor_direct)} / 파견 ${n(d.labor_dispatch)} / 지원 ${n(d.labor_support)}`)
  if (hasTarget) {
    const st = tgtStatus(c.labor_total, target.labor, true)
    if (st) rows.push(`  달성현황  ${st}`)
  }

  rows.push(``)

  // 🔧 제조경비
  rows.push(`🔧 제조경비`)
  if (hasTarget) {
    const tRate = (target.manufacturing / target.sales * 100).toFixed(1)
    rows.push(`  목  표   ${n(target.manufacturing)}천원 (목표율 ${tRate}%)`)
  }
  rows.push(`  실  적   ${n(d.manufacturing_cost)}천원 (경비율 ${p(c.manufacturing_rate)}%)`)
  if (hasTarget) {
    const st = tgtStatus(d.manufacturing_cost, target.manufacturing, true)
    if (st) rows.push(`  달성현황  ${st}`)
  }

  rows.push(``, `━━━━━━━━━━━━━━━━━━━━━`)

  // 📈 예상이익
  rows.push(`📈 예상이익`)
  if (hasTarget && tProfit !== 0) {
    rows.push(`  목  표   ${n(tProfit)}천원 (목표이익률 ${p(tProfitRate)}%)`)
  }
  rows.push(`  실  적   ${n(c.profit)}천원 (이익률 ${p(c.profit_rate)}%)`)
  if (hasTarget && tProfit !== 0) {
    const st = tgtStatus(c.profit, tProfit, false)
    if (st) rows.push(`  달성현황  ${st}`)
  }

  rows.push(``, `━━━━━━━━━━━━━━━━━━━━━`)
  rows.push(`노스팜CC 식음 총관리자 박요한`)

  return rows.join('\n')
}

// ── 목표 관리 ───────────────────────────────────────────────
interface ClosingTarget {
  sales: number
  food_cost: number        // 목표 식재비 (천원)
  labor: number            // 목표 인건비 (천원)
  manufacturing: number    // 목표 제조경비 (천원)
  // profit은 자동계산: sales - food_cost - labor - manufacturing
}

const DEFAULT_TARGET: ClosingTarget = { sales: 0, food_cost: 0, labor: 0, manufacturing: 0 }

/** 목표이익 자동계산 */
function calcTargetProfit(t: ClosingTarget): number {
  return t.sales - t.food_cost - t.labor - t.manufacturing
}

/** 목표이익률 자동계산 */
function calcTargetProfitRate(t: ClosingTarget): number {
  if (t.sales === 0) return 0
  return Math.round((calcTargetProfit(t) / t.sales) * 1000) / 10
}

/** localStorage 마이그레이션용 읽기 전용 */
function loadTargetFromLS(year: number, month: number): ClosingTarget {
  try {
    const raw = localStorage.getItem(`closing_target_${year}_${month}`)
    if (raw) return { ...DEFAULT_TARGET, ...JSON.parse(raw) as ClosingTarget }
  } catch { /* 무시 */ }
  return { ...DEFAULT_TARGET }
}

// ── 목표 대비 뱃지 (금액 차이 + 달성률 한 줄) ──────────────
function TargetCompareBadge({
  actual,
  target,
  lowerIsBetter = false,
}: {
  actual: number
  target: number
  lowerIsBetter?: boolean
}) {
  if (target <= 0 || actual <= 0) return null
  const diff = actual - target
  const good = lowerIsBetter ? diff <= 0 : diff >= 0
  const rate = (actual / target) * 100
  const absDiff = Math.abs(Math.round(diff)).toLocaleString('ko-KR')
  const icon = good ? '✅' : '⚠️'
  const gapLabel = good
    ? lowerIsBetter ? `${absDiff}천 절감` : `${absDiff}천 초과달성`
    : lowerIsBetter ? `${absDiff}천 초과` : `${absDiff}천 미달`
  const cls = good
    ? 'text-green-600 bg-green-50 border-green-200'
    : rate >= 80
      ? 'text-amber-600 bg-amber-50 border-amber-200'
      : 'text-red-600 bg-red-50 border-red-200'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${cls}`}>
      {icon} {gapLabel} ({rate.toFixed(1)}%)
    </span>
  )
}

// ── 메인 컴포넌트 ───────────────────────────────────────────
/** 이번 달 가마감 미입력 경고를 띄우기 시작하는 날짜(일) */
const CLOSING_WARN_DAY = 25

type Fields = Omit<MonthlyClosing, 'id' | 'created_at' | 'updated_at'>

const EMPTY_FIELDS = (year: number, month: number): Fields => ({
  year, month,
  sales_total: 0, food_cost: 0,
  labor_direct: 0, labor_dispatch: 0, labor_support: 0,
  manufacturing_cost: 0,
})

/** 추세 차트·엑셀에 담을 개월 수 (선택한 달을 끝으로 과거 방향) */
const HISTORY_MONTHS = 14

export default function ClosingPage() {
  const now = new Date()
  const [selYear, setSelYear]   = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [fields, setFields]     = useState<Fields>(EMPTY_FIELDS(now.getFullYear(), now.getMonth() + 1))
  const [saving, setSaving]     = useState(false)
  const [copied, setCopied]     = useState(false)
  const [toast, setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [dailyTotal, setDailyTotal]   = useState<number | null>(null)
  const [history, setHistory]         = useState<MonthlyClosing[]>([])
  const [target, setTarget]           = useState<ClosingTarget>({ ...DEFAULT_TARGET })
  const [showTarget, setShowTarget]   = useState(false)
  // 선택된 월의 가마감이 Supabase에 저장되어 있는지 (미입력 경고 판단용)
  const [closingExists, setClosingExists] = useState(false)
  // 가마감 조회가 성공적으로 끝났는지 — 로딩 중·조회 실패 시 경고 배너를 그리지 않기 위한 플래그
  const [closingLoaded, setClosingLoaded] = useState(false)

  // 연 누적용 — 어느 해의 데이터인지(year)를 함께 보관해, 연도 전환 직후 이전 해 숫자가 남지 않게 한다
  const [yearData, setYearData] = useState<{ year: number; rows: MonthlyClosing[] } | null>(null)

  // 선택한 달을 끝으로 하는 14개월 가마감 (추세 차트·엑셀용).
  // 오늘 기준으로 뽑으면 지난 해를 보고 있을 때 차트가 딴 해를 그린다.
  useEffect(() => {
    let cancelled = false
    getClosingsUpTo(selYear, selMonth, HISTORY_MONTHS)
      .then(rows => { if (!cancelled) setHistory(rows) })
      .catch(e => console.error('히스토리 로드 실패', e))
    return () => { cancelled = true }
  }, [selYear, selMonth])

  // 선택 연도의 가마감 전체 로드 (연 누적 계산용)
  useEffect(() => {
    let cancelled = false
    const year = selYear
    getClosingsByYear(year)
      .then(rows => { if (!cancelled) setYearData({ year, rows }) })
      .catch(e => console.error('연 누적 로드 실패', e))
    return () => { cancelled = true }
  }, [selYear])

  // 탭 전환 시 데이터 + 목표 로드
  useEffect(() => {
    setFields(EMPTY_FIELDS(selYear, selMonth))
    setDailyTotal(null)
    setTarget({ ...DEFAULT_TARGET })
    setClosingExists(false)
    setClosingLoaded(false)

    Promise.all([
      getMonthlyClosing(selYear, selMonth),
      getSalesByMonth(selYear, selMonth),
      getClosingTarget(selYear, selMonth),
    ]).then(([closing, dailyRows, savedTarget]) => {
      const sumK = Math.round(dailyRows.reduce((acc, r) => acc + r.total_sales, 0) / 1000)
      setDailyTotal(sumK)
      setClosingExists(closing !== null)
      setClosingLoaded(true)
      if (closing) {
        setFields({
          year: closing.year, month: closing.month,
          sales_total: closing.sales_total,
          food_cost: closing.food_cost,
          labor_direct: closing.labor_direct,
          labor_dispatch: closing.labor_dispatch,
          labor_support: closing.labor_support,
          manufacturing_cost: closing.manufacturing_cost,
        })
      }
      if (savedTarget) {
        setTarget({
          sales: savedTarget.sales_target,
          food_cost: savedTarget.food_cost_target,
          labor: savedTarget.labor_target,
          manufacturing: savedTarget.manufacturing_target,
        })
      } else {
        // localStorage 마이그레이션: 기존 데이터가 있으면 Supabase로 이전
        const lsTarget = loadTargetFromLS(selYear, selMonth)
        if (lsTarget.sales > 0 || lsTarget.food_cost > 0) {
          setTarget(lsTarget)
          upsertClosingTarget({
            year: selYear, month: selMonth,
            sales_target: lsTarget.sales,
            food_cost_target: lsTarget.food_cost,
            labor_target: lsTarget.labor,
            manufacturing_target: lsTarget.manufacturing,
          }).catch(e => console.error('목표 마이그레이션 실패', e))
        }
      }
    }).catch(e => {
      // 로드 실패 — closingLoaded를 false로 유지해 오탐 경고 배너가 뜨지 않게 한다
      console.error('데이터 로드 실패', e)
    })
  }, [selYear, selMonth])

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  function updateTarget<K extends keyof ClosingTarget>(key: K, value: ClosingTarget[K]) {
    setTarget(prev => {
      const next = { ...prev, [key]: value }
      upsertClosingTarget({
        year: selYear, month: selMonth,
        sales_target: next.sales,
        food_cost_target: next.food_cost,
        labor_target: next.labor,
        manufacturing_target: next.manufacturing,
      }).catch(e => console.error('목표 저장 실패', e))
      return next
    })
  }

  const calc = calcClosing(fields)

  // ── 연 누적 (1월 ~ 선택한 달) ──────────────────────────────
  // 선택한 달은 저장값 대신 화면의 입력값(fields)을 쓴다 — 아직 저장하지 않은 수정분도 즉시 반영된다.
  // (그래서 이전 달들만 저장된 행에서 합산하고, 선택한 달은 calc/fields로 더한다)
  const yearClosings = yearData !== null && yearData.year === selYear ? yearData.rows : []
  const priorClosings = yearClosings.filter(c => c.month < selMonth)

  const ytdSales  = priorClosings.reduce((s, c) => s + c.sales_total, 0) + fields.sales_total
  const ytdProfit = priorClosings.reduce((s, c) => s + calcClosing(c).profit, 0) + calc.profit
  const ytdProfitRate = ytdSales !== 0 ? Math.round((ytdProfit / ytdSales) * 1000) / 10 : 0

  // 누적 숫자가 몇 달치인지 분명히 한다 — 매출이 0인 달은 미입력으로 본다
  const enteredMonths = new Set(priorClosings.filter(c => c.sales_total !== 0).map(c => c.month))
  if (fields.sales_total !== 0) enteredMonths.add(selMonth)
  const missingMonths: number[] = []
  for (let m = 1; m <= selMonth; m++) {
    if (!enteredMonths.has(m)) missingMonths.push(m)
  }
  const ytdRangeLabel = selMonth === 1 ? '1월' : `1~${selMonth}월`

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await upsertMonthlyClosing(fields)
      setClosingExists(true)
      getClosingsUpTo(fields.year, fields.month, HISTORY_MONTHS).then(setHistory).catch(() => {})
      getClosingsByYear(fields.year)
        .then(rows => setYearData({ year: fields.year, rows }))
        .catch(() => {})
      setToast({ message: '저장되었습니다!', type: 'success' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류'
      setToast({ message: `저장 실패: ${msg}`, type: 'error' })
    } finally {
      setSaving(false)
    }
  }, [fields])

  async function handleCopy() {
    const text = buildKakaoText(selYear, selMonth, fields, target)
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

  const statCell = (label: string, value: string, highlight?: boolean) => (
    <div className={`flex justify-between items-center py-1.5 ${highlight ? 'font-bold' : ''}`}>
      <span className={`text-sm ${highlight ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
      <span className={`text-sm ${highlight ? 'text-blue-600' : 'text-gray-800'}`}>{value}</span>
    </div>
  )

  const hasSales = fields.sales_total !== 0

  // ⚠️ 이번 달 가마감 미입력 경고 — 25일 이후부터 노출
  const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth() + 1
  // (로딩 완료 전에는 그리지 않아 깜빡임·오탐 방지)
  const showClosingWarning =
    closingLoaded &&
    isCurrentMonth && !closingExists && fields.sales_total === 0 && now.getDate() >= CLOSING_WARN_DAY

  /** 선택한 달을 끝으로 하는 14개월 가마감을 CSV로 내려받기 */
  function handleExportCsv() {
    const headers = ['년', '월', '매출', '식재료비', '인건비합계', '제조경비', '예상이익', '이익률(%)']
    const rows: (string | number)[][] = history.map((h) => {
      const c = calcClosing(h)
      return [
        h.year,
        h.month,
        h.sales_total,
        h.food_cost,
        c.labor_total,
        h.manufacturing_cost,
        c.profit,
        c.profit_rate.toFixed(1),
      ]
    })
    downloadCsv(`노스팜CC_가마감_${selYear}년${selMonth}월까지_${HISTORY_MONTHS}개월.csv`, headers, rows)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {toast !== null && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <MonthYearPicker
          title="가마감"
          subtitle="손익 예상치 — 단위: 천원"
          year={selYear}
          month={selMonth}
          onChange={(y, m) => { setSelYear(y); setSelMonth(m) }}
        />
      </header>

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">

        {/* ⚠️ 이번 달 가마감 미입력 경고 */}
        {showClosingWarning ? (
          <div className="bg-amber-50 rounded-2xl p-4 shadow-sm border border-amber-200">
            <p className="text-sm font-bold text-amber-700">
              ⚠️ 이번 달 가마감이 아직 입력되지 않았습니다
            </p>
            <p className="mt-1 text-xs text-amber-600">
              {selYear}년 {selMonth}월 손익 예상치를 입력하고 저장해주세요.
            </p>
          </div>
        ) : null}

        {/* 📊 추세 차트 */}
        {history.length > 1 ? (
          <ClosingTrendChart history={history} currentYear={selYear} currentMonth={selMonth} />
        ) : null}

        {/* 🎯 목표 설정 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTarget(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <span className="text-xs font-bold text-gray-400">🎯 목표 설정</span>
            <span className="text-xs text-gray-400">{showTarget ? '▲ 접기' : '▼ 펼치기'}</span>
          </button>
          {showTarget ? (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
              {/* 목표 매출 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 w-24 shrink-0">목표 매출</label>
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={target.sales === 0 ? '' : target.sales.toLocaleString('ko-KR')}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const n = parseInt(raw, 10)
                      updateTarget('sales', isNaN(n) ? 0 : n)
                    }}
                    placeholder="0"
                    className="w-full text-right pr-10 py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-1 focus:border-blue-400 focus:ring-blue-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">천원</span>
                </div>
              </div>
              {/* 목표 식재비 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 w-24 shrink-0">목표 식재비</label>
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={target.food_cost === 0 ? '' : target.food_cost.toLocaleString('ko-KR')}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const n = parseInt(raw, 10)
                      updateTarget('food_cost', isNaN(n) ? 0 : n)
                    }}
                    placeholder="0"
                    className="w-full text-right pr-10 py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-1 focus:border-blue-400 focus:ring-blue-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">천원</span>
                </div>
              </div>
              {/* 목표 인건비 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 w-24 shrink-0">목표 인건비</label>
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={target.labor === 0 ? '' : target.labor.toLocaleString('ko-KR')}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const n = parseInt(raw, 10)
                      updateTarget('labor', isNaN(n) ? 0 : n)
                    }}
                    placeholder="0"
                    className="w-full text-right pr-10 py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-1 focus:border-blue-400 focus:ring-blue-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">천원</span>
                </div>
              </div>
              {/* 목표 제조경비 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 w-24 shrink-0">목표 제조경비</label>
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={target.manufacturing === 0 ? '' : target.manufacturing.toLocaleString('ko-KR')}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const n = parseInt(raw, 10)
                      updateTarget('manufacturing', isNaN(n) ? 0 : n)
                    }}
                    placeholder="0"
                    className="w-full text-right pr-10 py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-1 focus:border-blue-400 focus:ring-blue-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">천원</span>
                </div>
              </div>
              {/* 목표 이익 — 자동계산 */}
              {target.sales > 0 ? (() => {
                const tProfit = calcTargetProfit(target)
                const tProfitRate = calcTargetProfitRate(target)
                const isPositive = tProfit >= 0
                return (
                  <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${isPositive ? 'bg-blue-50 border border-blue-100' : 'bg-red-50 border border-red-100'}`}>
                    <span className="text-sm font-semibold text-gray-600">목표 이익 (자동)</span>
                    <div className="text-right">
                      <span className={`text-sm font-bold ${isPositive ? 'text-blue-600' : 'text-red-500'}`}>
                        {tProfit.toLocaleString('ko-KR')}천원
                      </span>
                      <span className={`ml-2 text-xs font-semibold ${isPositive ? 'text-blue-400' : 'text-red-400'}`}>
                        ({tProfitRate.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                )
              })() : null}
            </div>
          ) : null}
        </div>

        {/* 💰 매출 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-gray-400">💰 매출</p>
              <TargetCompareBadge actual={fields.sales_total} target={target.sales} />
            </div>
            {dailyTotal !== null ? (
              <button
                type="button"
                onClick={() => set('sales_total', dailyTotal)}
                className="text-xs text-blue-600 font-medium px-2.5 py-1 rounded-lg border border-blue-200 active:bg-blue-50 transition-colors shrink-0 text-center leading-tight"
              >
                <span className="block">일매출 합계 적용</span>
                <span className="block">{dailyTotal.toLocaleString()}천원</span>
              </button>
            ) : null}
          </div>
          <NumInput label="합계" value={fields.sales_total} onChange={(v) => set('sales_total', v)} />
          {/* 달성률 프로그레스바 */}
          {target.sales > 0 && fields.sales_total > 0 ? (
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  fields.sales_total >= target.sales ? 'bg-green-500' : 'bg-blue-400'
                }`}
                style={{ width: `${Math.min((fields.sales_total / target.sales) * 100, 100)}%` }}
              />
            </div>
          ) : null}
          {dailyTotal !== null && fields.sales_total !== 0 && fields.sales_total !== dailyTotal ? (
            <p className="mt-2 text-xs text-amber-500 font-medium">
              ⚠ 일매출 합계({dailyTotal.toLocaleString()}천원)와 다릅니다
            </p>
          ) : null}
        </div>

        {/* 🥩 식재료비 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="text-xs font-bold text-gray-400">🥩 식재료비</p>
            <TargetCompareBadge actual={fields.food_cost} target={target.food_cost} lowerIsBetter />
          </div>
          <NumInput
            label="금액"
            value={fields.food_cost}
            onChange={(v) => set('food_cost', v)}
            hint={hasSales ? `${calc.food_cost_rate.toFixed(1)}%` : ''}
            hintNeg={calc.food_cost_rate < 0}
          />
          <div className="mt-2 pt-2 border-t border-gray-50">
            {statCell('원가율', hasSales ? `${calc.food_cost_rate.toFixed(1)}%` : '-')}
          </div>
        </div>

        {/* 👤 인건비 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="text-xs font-bold text-gray-400">👤 인건비</p>
            <TargetCompareBadge actual={calc.labor_total} target={target.labor} lowerIsBetter />
          </div>
          <div className="space-y-2.5">
            <NumInput label="직영" value={fields.labor_direct}   onChange={(v) => set('labor_direct', v)} />
            <NumInput label="파견" value={fields.labor_dispatch} onChange={(v) => set('labor_dispatch', v)} />
            <NumInput label="지원" value={fields.labor_support}  onChange={(v) => set('labor_support', v)} />
          </div>
          <div className="mt-2 pt-2 border-t border-gray-50 space-y-0.5">
            {statCell('합계', `${calc.labor_total.toLocaleString()}천원`, true)}
            {statCell('인건비율', hasSales ? `${calc.labor_rate.toFixed(1)}%` : '-')}
          </div>
        </div>

        {/* 🔧 제조경비 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="text-xs font-bold text-gray-400">🔧 제조경비</p>
            <TargetCompareBadge actual={fields.manufacturing_cost} target={target.manufacturing} lowerIsBetter />
          </div>
          <NumInput
            label="금액"
            value={fields.manufacturing_cost}
            onChange={(v) => set('manufacturing_cost', v)}
            hint={hasSales ? `${calc.manufacturing_rate.toFixed(1)}%` : ''}
            hintNeg={calc.manufacturing_rate < 0}
          />
          <div className="mt-2 pt-2 border-t border-gray-50">
            {statCell('경비율', hasSales ? `${calc.manufacturing_rate.toFixed(1)}%` : '-')}
          </div>
        </div>

        {/* 📈 예상이익 (자동계산) */}
        <div className={`rounded-2xl p-4 shadow-sm border ${calc.profit >= 0 ? 'bg-blue-600 border-blue-500' : 'bg-red-500 border-red-400'}`}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <p className="text-xs font-bold text-blue-200">📈 예상이익 (자동계산)</p>
            {target.sales > 0 ? (
              <TargetCompareBadge actual={calc.profit} target={calcTargetProfit(target)} />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-sm text-blue-100">금액</span>
              <span className="text-xl font-bold text-white">
                {calc.profit.toLocaleString()}천원
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-blue-100">이익률</span>
              <span className="text-base font-bold text-white">
                {hasSales ? `${calc.profit_rate.toFixed(1)}%` : '-'}
              </span>
            </div>
            {hasSales ? (
              <div className="flex justify-between items-center pt-1 border-t border-blue-500">
                <span className="text-xs text-blue-200">Prime Cost (식재비+인건비)</span>
                <span className={`text-sm font-bold ${calc.prime_cost_rate > 65 ? 'text-yellow-300' : 'text-green-300'}`}>
                  {calc.prime_cost_rate.toFixed(1)}%{calc.prime_cost_rate > 65 ? ' ⚠' : ''}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* 📊 연 누적 — 1월부터 선택한 달까지 쌓인 매출·매출이익 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-400">
              📊 {selYear}년 누적 ({ytdRangeLabel})
            </p>
            <span className="text-[10px] text-gray-300">단위: 천원</span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">누적 매출</span>
              <span className="text-base font-bold text-gray-800">
                {ytdSales.toLocaleString()}천원
              </span>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-gray-100">
              <span className="text-sm font-semibold text-gray-700">누적 매출이익</span>
              <span className={`text-xl font-bold ${ytdProfit >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                {ytdProfit.toLocaleString()}천원
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">누적 이익률</span>
              <span className={`text-sm font-bold ${ytdProfit >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                {ytdSales !== 0 ? `${ytdProfitRate.toFixed(1)}%` : '-'}
              </span>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 mt-2.5 leading-relaxed">
            매출이익 = 매출 − 식재료비 − 인건비 − 제조경비
            <br />
            {missingMonths.length === 0
              ? `${ytdRangeLabel} ${selMonth}개월 전부 반영되었습니다`
              : `${selMonth}개월 중 ${selMonth - missingMonths.length}개월 반영 · ${missingMonths.join('·')}월 미입력`}
          </p>
        </div>

        {/* 엑셀 내보내기 — 선택한 달을 끝으로 하는 14개월 가마감 */}
        <button
          onClick={handleExportCsv}
          disabled={history.length === 0}
          className="w-full py-3 rounded-2xl bg-white text-blue-600 font-bold text-sm shadow-sm border border-blue-200 active:scale-95 transition-transform disabled:opacity-40"
        >
          엑셀 내보내기 ({HISTORY_MONTHS}개월)
        </button>

        {/* 버튼 영역 */}
        <div className="grid grid-cols-3 gap-2 pb-2">
          <button
            onClick={handleCopy}
            className="py-4 rounded-2xl font-bold text-sm shadow active:scale-95 transition-transform"
            style={{ backgroundColor: '#FEE500', color: '#1A1A1A' }}
          >
            {copied ? '복사됨! ✓' : '카카오 복사'}
          </button>
          <button
            onClick={() => setFields(EMPTY_FIELDS(selYear, selMonth))}
            className="py-4 rounded-2xl bg-gray-100 text-gray-600 font-bold text-sm shadow-sm active:scale-95 transition-transform border border-gray-200"
          >
            초기화
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="py-4 rounded-2xl bg-blue-600 text-white font-bold text-sm shadow active:scale-95 transition-transform disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

      </div>

      <BottomNav />
    </div>
  )
}
