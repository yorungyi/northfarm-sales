import { useState, useEffect, useCallback, useId } from 'react'
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
import { SectionHead } from '../components/Ledger'
import { BTN_FILLED_LG, BTN_OUTLINE, INPUT, CARD, ALERT, CHIP_GOOD, CHIP_BAD, CHIP_NEUTRAL } from '../lib/ledger'

// ── 숫자 입력 헬퍼 ─────────────────────────────────────────
function fmtAbs(n: number) {
  return n === 0 ? '' : Math.abs(n).toLocaleString('ko-KR')
}
function parseAbs(s: string) {
  const n = parseInt(s.replace(/,/g, ''), 10)
  return isNaN(n) ? 0 : Math.abs(n)
}

/** 음수는 회계장부식 △ 표기 (금액) */
function fmtSigned(n: number): string {
  return n < 0 ? `△${Math.abs(n).toLocaleString()}` : n.toLocaleString()
}
/** 음수는 회계장부식 △ 표기 (비율, 소수 1자리) */
function fmtRate(r: number): string {
  return r < 0 ? `△${Math.abs(r).toFixed(1)}%` : `${r.toFixed(1)}%`
}

/** 손익 장부 한 행의 열 배치 — 항목 | 부호 | 금액 | 비율 (모든 입력 행이 같은 열을 쓴다) */
const ROW_GRID = 'grid grid-cols-[3.5rem_2.75rem_minmax(0,1fr)_3.5rem] items-center gap-2'

function NumInput({
  label, value, onChange, hint, hintNeg, name,
}: {
  label: string; value: number; onChange: (v: number) => void; hint?: string; hintNeg?: boolean; name?: string
}) {
  const isNeg = value < 0
  const [disp, setDisp] = useState(fmtAbs(value))
  useEffect(() => { setDisp(fmtAbs(value)) }, [value])
  // 라벨과 입력칸을 잇는 고유 id
  const inputId = useId()

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
    <div className={`${ROW_GRID} py-1.5`}>
      <label htmlFor={inputId} className="text-sm text-ink-2">{label}</label>
      {/* 부호 전환 — 음수(차감·환입)일 때 연한 빨강 */}
      <button
        type="button"
        onClick={toggleSign}
        aria-pressed={isNeg}
        aria-label={`${label} 음수 입력`}
        className={`num w-11 h-11 rounded-[12px] text-lg font-bold transition-colors focus-visible:outline-offset-2 ${
          isNeg
            ? 'bg-accent-soft text-accent-ink'
            : 'bg-paper-3 text-ink-2 hover:text-ink active:bg-rule-2'
        }`}
      >
        {isNeg ? '−' : '+'}
      </button>
      <div className="relative min-w-0">
        <input
          id={inputId}
          name={name}
          type="text"
          inputMode="numeric"
          value={disp}
          onChange={handleChange}
          placeholder="0"
          className={`${INPUT} num w-full text-right pr-12 font-semibold ${isNeg ? 'text-accent-ink! border-accent!' : ''}`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden="true">천원</span>
      </div>
      {/* 비율 열 — 값이 없어도 칸을 남겨 금액 열을 맞춘다 */}
      <span className={`num text-right text-sm ${hintNeg ? 'text-accent-ink' : 'text-ink-2'}`}>
        {hint}
      </span>
    </div>
  )
}

// ── 카카오 보고 텍스트 생성 ─────────────────────────────────
// 보고문 상태 기호 — 카톡 보고문 안에 들어가는 글자(화면 아이콘이 아님). 보고문 결과는 기존과 똑같고,
// 소스에는 코드포인트 이스케이프로만 적어 화면 아이콘 검사(Hallmark 30a)와 구분한다.
const MARK_OK = '\u2705'
const MARK_WARN = '\u26A0\uFE0F'
const MARK_BAD = '\u{1F534}'

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
    const icon = good ? MARK_OK : (rate >= 80 ? MARK_WARN : MARK_BAD)
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
    if (st.startsWith(MARK_OK)) return `${MARK_OK} 이익 목표 달성`
    if (st.startsWith(MARK_WARN)) return `${MARK_WARN} 이익 목표 근접 (주의)`
    return `${MARK_BAD} 이익 목표 미달`
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
  const gapLabel = good
    ? lowerIsBetter ? `${absDiff}천 절감` : `${absDiff}천 초과달성`
    : lowerIsBetter ? `${absDiff}천 초과` : `${absDiff}천 미달`
  // 목표 안쪽은 초록 글자, 목표 밖은 빨강 + △ (80% 미만이면 굵게)
  const cls = good
    ? 'text-brand-ink'
    : rate >= 80
      ? 'text-accent-ink'
      : 'text-accent-ink font-bold'
  return (
    <p className={`mt-1 text-right text-sm ${cls}`}>
      {good ? null : <span aria-hidden="true">△ </span>}
      {gapLabel} (<span className="num">{rate.toFixed(1)}%</span>)
    </p>
  )
}

/** 비율 행 — 항목 이름 왼쪽, 비율은 오른쪽 비율 열에 */
function RateRow({ label, value, tone = 'text-ink-2' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-t border-rule">
      <span className="text-sm text-muted">{label}</span>
      <span className={`num w-20 text-right text-sm ${tone}`}>{value}</span>
    </div>
  )
}

/** 손익 구조의 묶음 머리 — 항목명(h3)과 오른쪽 동작 */
function GroupHead({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-4 pb-1">
      <h3 id={id} className="text-base font-bold text-ink">{title}</h3>
      {children}
    </div>
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

  const hasSales = fields.sales_total !== 0

  // 이번 달 가마감 미입력 경고 — 25일 이후부터 노출
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

  // 결론 카드의 구성 막대 — 매출을 식재료비·인건비·제조경비·이익으로 나눈 비율.
  // 항목 중 하나라도 음수(환입·손실)면 막대가 거짓말을 하므로 그리지 않는다.
  const costParts = [
    { key: 'food', label: '식재료', value: fields.food_cost, tone: 'bg-series-4' },
    { key: 'labor', label: '인건비', value: calc.labor_total, tone: 'bg-series-3' },
    { key: 'mfg', label: '경비', value: fields.manufacturing_cost, tone: 'bg-series-5' },
    { key: 'profit', label: '이익', value: calc.profit, tone: 'bg-brand' },
  ]
  const showCostBar = fields.sales_total > 0 && costParts.every(p => p.value >= 0) && costParts.some(p => p.value > 0)

  return (
    <div className="min-h-screen bg-paper text-ink pb-24">
      {toast !== null && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 헤더 — 바탕 위 큰 제목 + 연도·월 선택기 */}
      <header className="bg-paper px-4 pt-safe-top">
        <MonthYearPicker
          title="가마감"
          subtitle="손익 예상치 — 단위: 천원"
          year={selYear}
          month={selMonth}
          onChange={(y, m) => { setSelYear(y); setSelMonth(m) }}
        />
      </header>

      <main className="px-4 max-w-lg mx-auto">

        {/* 이번 달 가마감 미입력 경고 */}
        {showClosingWarning ? (
          <div className={`${ALERT} mt-3`}>
            <p className="text-sm font-bold text-accent-ink">
              이번 달 가마감이 아직 입력되지 않았습니다
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {selYear}년 {selMonth}월 손익 예상치를 입력하고 저장해주세요.
            </p>
          </div>
        ) : null}

        {/* ── 결론 먼저: 예상이익 카드 (입력값에서 바로 계산) ── */}
        <section aria-labelledby="profit-summary-title" className={`${CARD} mt-3`}>
          <h2 id="profit-summary-title" className="text-base font-medium text-muted">예상이익</h2>
          <p className={`mt-1 text-4xl leading-tight font-bold tracking-[-0.03em] ${calc.profit < 0 ? 'text-accent-ink' : 'text-ink'}`}>
            <span className="num">{fmtSigned(calc.profit)}</span>
            <span className="ml-1 text-base font-medium text-muted">천원</span>
          </p>
          {hasSales ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={calc.profit_rate < 0 ? CHIP_BAD : CHIP_GOOD}>
                이익률 <span className="num">{fmtRate(calc.profit_rate)}</span>
              </span>
              <span className={calc.prime_cost_rate > 65 ? CHIP_BAD : CHIP_NEUTRAL}>
                Prime Cost <span className="num">{calc.prime_cost_rate.toFixed(1)}%</span>
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">아래 손익 구조에 매출을 입력하면 이익률이 계산됩니다</p>
          )}
          {showCostBar ? (
            <>
              <div className="mt-4 flex h-3 gap-0.5 rounded-full overflow-hidden" aria-hidden="true">
                {costParts.map(p => (p.value > 0 ? (
                  <div key={p.key} className={`basis-0 min-w-0.5 ${p.tone}`} style={{ flexGrow: p.value }} />
                ) : null))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                {costParts.map(p => (
                  <li key={p.key} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${p.tone}`} aria-hidden="true" />
                    {p.label} <span className="num font-semibold text-ink-2">{Math.round((p.value / fields.sales_total) * 100)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm text-muted">매출을 100으로 본 구성 비율</p>
            </>
          ) : null}
        </section>

        {/* ── 근거: 손익 구조 — 매출 → 식재료비 → 인건비 → 제조경비 → 예상이익 ── */}
        <section
          aria-label="손익 예상치"
          className="mt-3 bg-sheet rounded-[18px] px-4 pb-4"
        >
          {/* 매출 */}
          <div role="group" aria-labelledby="pl-sales">
            <GroupHead id="pl-sales" title="매출">
              {dailyTotal !== null ? (
                <button
                  type="button"
                  onClick={() => set('sales_total', dailyTotal)}
                  className={BTN_OUTLINE}
                >
                  일매출 합계 적용 <span className="num">{dailyTotal.toLocaleString()}</span>천원
                </button>
              ) : null}
            </GroupHead>
            <NumInput label="합계" name="sales_total" value={fields.sales_total} onChange={(v) => set('sales_total', v)} />
            {/* 목표 매출 대비 진행 막대 — 너비 대신 scaleX */}
            {target.sales > 0 && fields.sales_total > 0 ? (
              <div
                role="progressbar"
                aria-label="목표 달성률"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(Math.min((fields.sales_total / target.sales) * 100, 100))}
                className="mt-1 h-2 rounded-full bg-paper-3 overflow-hidden"
              >
                <div
                  className={`progress-fill h-full rounded-full ${
                    fields.sales_total >= target.sales ? 'bg-brand-ink' : 'bg-brand'
                  }`}
                  style={{ transform: `scaleX(${Math.min(fields.sales_total / target.sales, 1)})` }}
                />
              </div>
            ) : null}
            <TargetCompareBadge actual={fields.sales_total} target={target.sales} />
            {dailyTotal !== null && fields.sales_total !== 0 && fields.sales_total !== dailyTotal ? (
              <p className="mt-1 text-sm text-accent-ink">
                일매출 합계(<span className="num">{dailyTotal.toLocaleString()}</span>천원)와 다릅니다
              </p>
            ) : null}
          </div>

          {/* 식재료비 */}
          <div role="group" aria-labelledby="pl-food" className="mt-3 border-t border-rule">
            <GroupHead id="pl-food" title="식재료비" />
            <NumInput
              label="금액"
              name="food_cost"
              value={fields.food_cost}
              onChange={(v) => set('food_cost', v)}
              hint={hasSales ? `${calc.food_cost_rate.toFixed(1)}%` : ''}
              hintNeg={calc.food_cost_rate < 0}
            />
            <RateRow label="원가율" value={hasSales ? `${calc.food_cost_rate.toFixed(1)}%` : '-'} />
            <TargetCompareBadge actual={fields.food_cost} target={target.food_cost} lowerIsBetter />
          </div>

          {/* 인건비 — 세 줄 입력 뒤 소계 */}
          <div role="group" aria-labelledby="pl-labor" className="mt-3 border-t border-rule">
            <GroupHead id="pl-labor" title="인건비" />
            <NumInput label="직영" name="labor_direct"   value={fields.labor_direct}   onChange={(v) => set('labor_direct', v)} />
            <NumInput label="파견" name="labor_dispatch" value={fields.labor_dispatch} onChange={(v) => set('labor_dispatch', v)} />
            <NumInput label="지원" name="labor_support"  value={fields.labor_support}  onChange={(v) => set('labor_support', v)} />
            {/* 소계 행 — 가는 선 위, 금액은 입력칸 숫자 열에 맞춘다 */}
            <div className={`${ROW_GRID} mt-1 py-2 border-t border-rule-2`}>
              <span className="col-span-2 text-sm font-bold text-ink">합계</span>
              <span className="pr-3 text-right text-sm font-bold text-ink">
                <span className="num">{fmtSigned(calc.labor_total)}</span>
                <span className="ml-1 text-sm font-normal text-muted">천원</span>
              </span>
              <span />
            </div>
            <RateRow label="인건비율" value={hasSales ? `${calc.labor_rate.toFixed(1)}%` : '-'} />
            <TargetCompareBadge actual={calc.labor_total} target={target.labor} lowerIsBetter />
          </div>

          {/* 제조경비 */}
          <div role="group" aria-labelledby="pl-mfg" className="mt-3 border-t border-rule">
            <GroupHead id="pl-mfg" title="제조경비" />
            <NumInput
              label="금액"
              name="manufacturing_cost"
              value={fields.manufacturing_cost}
              onChange={(v) => set('manufacturing_cost', v)}
              hint={hasSales ? `${calc.manufacturing_rate.toFixed(1)}%` : ''}
              hintNeg={calc.manufacturing_rate < 0}
            />
            <RateRow label="경비율" value={hasSales ? `${calc.manufacturing_rate.toFixed(1)}%` : '-'} />
            <TargetCompareBadge actual={fields.manufacturing_cost} target={target.manufacturing} lowerIsBetter />
          </div>

          {/* 예상이익 — 손익 구조의 최종 행. 손실은 빨강 △ */}
          <div role="group" aria-labelledby="pl-profit" className="mt-3 border-t border-rule">
            <GroupHead id="pl-profit" title="예상이익 (자동계산)" />
            <div className="flex items-baseline justify-between gap-3 py-2 border-t border-rule-2">
              <span className="text-sm font-bold text-ink">금액</span>
              <span className={`text-xl font-bold ${calc.profit < 0 ? 'text-accent-ink' : 'text-ink'}`}>
                <span className="num">{fmtSigned(calc.profit)}</span>
                <span className="ml-1 text-sm font-normal text-muted">천원</span>
              </span>
            </div>
            <RateRow
              label="이익률"
              value={hasSales ? fmtRate(calc.profit_rate) : '-'}
              tone={hasSales && calc.profit_rate < 0 ? 'text-accent-ink font-bold' : 'text-ink font-bold'}
            />
            {hasSales ? (
              <RateRow
                label="Prime Cost (식재비+인건비)"
                value={`${calc.prime_cost_rate.toFixed(1)}%`}
                tone={calc.prime_cost_rate > 65 ? 'text-accent-ink font-bold' : 'text-ink-2'}
              />
            ) : null}
            {target.sales > 0 ? (
              <TargetCompareBadge actual={calc.profit} target={calcTargetProfit(target)} />
            ) : null}
          </div>
        </section>

        {/* 동작 — 저장 하나만 초록 채움, 카카오는 브랜드색, 초기화는 회색 */}
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={BTN_FILLED_LG}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 h-11 px-4 text-sm font-bold rounded-[14px] bg-kakao text-kakao-ink hover:opacity-90 active:opacity-80 transition-opacity focus-visible:outline-offset-2"
            >
              {copied ? '복사됨!' : '카카오 복사'}
            </button>
            <button
              type="button"
              onClick={() => setFields(EMPTY_FIELDS(selYear, selMonth))}
              className={`${BTN_OUTLINE} flex-1`}
            >
              초기화
            </button>
          </div>
        </div>

        {/* ── 목표 설정 — 접어두는 카드 ── */}
        <section aria-labelledby="target-title" className={`${CARD} mt-6`}>
          <SectionHead id="target-title" title="목표 설정">
            <button
              type="button"
              onClick={() => setShowTarget(v => !v)}
              aria-expanded={showTarget}
              aria-controls="target-panel"
              className={BTN_OUTLINE}
            >
              {showTarget ? '접기' : '펼치기'}
              <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${showTarget ? 'rotate-180' : ''}`} aria-hidden="true">
                <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </SectionHead>
          {showTarget ? (
            <div id="target-panel" className="mt-2">
              {/* 목표 매출 */}
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-2">
                <label htmlFor="target-sales" className="text-sm text-ink-2">목표 매출</label>
                <div className="relative min-w-0">
                  <input
                    id="target-sales"
                    name="sales_target"
                    type="text"
                    inputMode="numeric"
                    value={target.sales === 0 ? '' : target.sales.toLocaleString('ko-KR')}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const n = parseInt(raw, 10)
                      updateTarget('sales', isNaN(n) ? 0 : n)
                    }}
                    placeholder="0"
                    className={`${INPUT} num w-full text-right pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden="true">천원</span>
                </div>
              </div>
              {/* 목표 식재비 */}
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-2 border-t border-rule">
                <label htmlFor="target-food" className="text-sm text-ink-2">목표 식재비</label>
                <div className="relative min-w-0">
                  <input
                    id="target-food"
                    name="food_cost_target"
                    type="text"
                    inputMode="numeric"
                    value={target.food_cost === 0 ? '' : target.food_cost.toLocaleString('ko-KR')}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const n = parseInt(raw, 10)
                      updateTarget('food_cost', isNaN(n) ? 0 : n)
                    }}
                    placeholder="0"
                    className={`${INPUT} num w-full text-right pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden="true">천원</span>
                </div>
              </div>
              {/* 목표 인건비 */}
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-2 border-t border-rule">
                <label htmlFor="target-labor" className="text-sm text-ink-2">목표 인건비</label>
                <div className="relative min-w-0">
                  <input
                    id="target-labor"
                    name="labor_target"
                    type="text"
                    inputMode="numeric"
                    value={target.labor === 0 ? '' : target.labor.toLocaleString('ko-KR')}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const n = parseInt(raw, 10)
                      updateTarget('labor', isNaN(n) ? 0 : n)
                    }}
                    placeholder="0"
                    className={`${INPUT} num w-full text-right pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden="true">천원</span>
                </div>
              </div>
              {/* 목표 제조경비 */}
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-2 border-t border-rule">
                <label htmlFor="target-mfg" className="text-sm text-ink-2">목표 제조경비</label>
                <div className="relative min-w-0">
                  <input
                    id="target-mfg"
                    name="manufacturing_target"
                    type="text"
                    inputMode="numeric"
                    value={target.manufacturing === 0 ? '' : target.manufacturing.toLocaleString('ko-KR')}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const n = parseInt(raw, 10)
                      updateTarget('manufacturing', isNaN(n) ? 0 : n)
                    }}
                    placeholder="0"
                    className={`${INPUT} num w-full text-right pr-12`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden="true">천원</span>
                </div>
              </div>
              {/* 목표 이익 — 자동계산, 소계처럼 가는 선 위 */}
              {target.sales > 0 ? (() => {
                const tProfit = calcTargetProfit(target)
                const tProfitRate = calcTargetProfitRate(target)
                const isPositive = tProfit >= 0
                return (
                  <div className="flex items-baseline justify-between gap-3 mt-1 pt-3 border-t border-rule-2">
                    <span className="text-sm font-bold text-ink">목표 이익 (자동)</span>
                    <div className={`text-right ${isPositive ? 'text-ink' : 'text-accent-ink'}`}>
                      <span className="text-sm font-bold">
                        <span className="num">{fmtSigned(tProfit)}</span>천원
                      </span>
                      <span className="ml-2 text-sm">
                        (<span className="num">{fmtRate(tProfitRate)}</span>)
                      </span>
                    </div>
                  </div>
                )
              })() : null}
            </div>
          ) : null}
        </section>

        {/* ── 연 누적 — 1월부터 선택한 달까지 쌓인 매출·매출이익 ── */}
        <section aria-labelledby="ytd-title" className={`${CARD} mt-3`}>
          <SectionHead id="ytd-title" title={`${selYear}년 누적 (${ytdRangeLabel})`}>
            <span className="text-sm text-muted">단위: 천원</span>
          </SectionHead>

          <dl className="mt-1">
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-sm text-ink-2">누적 매출</dt>
              <dd className="text-base font-semibold text-ink">
                <span className="num">{ytdSales.toLocaleString()}</span>천원
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2 border-t border-rule">
              <dt className="text-sm font-bold text-ink">누적 매출이익</dt>
              <dd className={`text-xl font-bold ${ytdProfit >= 0 ? 'text-ink' : 'text-accent-ink'}`}>
                <span className="num">{fmtSigned(ytdProfit)}</span>
                <span className="ml-1 text-sm font-normal text-muted">천원</span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-2 border-t border-rule">
              <dt className="text-sm text-muted">누적 이익률</dt>
              <dd className={`num text-sm font-bold ${ytdProfit >= 0 ? 'text-ink' : 'text-accent-ink'}`}>
                {ytdSales !== 0 ? fmtRate(ytdProfitRate) : '-'}
              </dd>
            </div>
          </dl>

          <p className="mt-2 text-sm text-muted">매출이익 = 매출 − 식재료비 − 인건비 − 제조경비</p>
          <p className="mt-1 text-sm text-muted">
            {missingMonths.length === 0 ? (
              `${ytdRangeLabel} ${selMonth}개월 전부 반영되었습니다`
            ) : (
              <>
                {selMonth}개월 중 {selMonth - missingMonths.length}개월 반영,{' '}
                <span className="font-semibold text-accent-ink">{missingMonths.join(', ')}월 미입력</span>
              </>
            )}
          </p>
        </section>

        {/* ── 추세 차트 ── */}
        {history.length > 1 ? (
          <div className={`${CARD} mt-3`}>
            <ClosingTrendChart history={history} currentYear={selYear} currentMonth={selMonth} />
          </div>
        ) : null}

        {/* 엑셀 내보내기 — 선택한 달을 끝으로 하는 14개월 가마감 */}
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={history.length === 0}
          className={`${BTN_OUTLINE} mt-4 w-full disabled:cursor-not-allowed`}
        >
          엑셀 내보내기 (<span className="num">{HISTORY_MONTHS}</span>개월)
        </button>

      </main>

      <BottomNav />
    </div>
  )
}
