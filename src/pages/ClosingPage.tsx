import { useState, useEffect, useCallback, useMemo } from 'react'
import { calcClosing } from '../types/closing'
import type { MonthlyClosing } from '../types/closing'
import {
  getMonthlyClosing,
  upsertMonthlyClosing,
  getSalesByMonth,
  getRecentClosings,
} from '../lib/api'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'
import ClosingTrendChart from '../components/ClosingTrendChart'

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
  d: Omit<MonthlyClosing, 'id' | 'created_at' | 'updated_at'>
): string {
  const c = calcClosing(d)
  const n = (v: number) => v.toLocaleString('ko-KR')
  const p = (v: number) => v.toFixed(1)
  const pad = (s: string, len = 7) => s.padEnd(len, '\u3000')

  return [
    `📊 [노스팜CC] 손익보고`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📅 ${year}년 ${String(month).padStart(2, '0')}월 기준 예상치`,
    ``,
    `💰 매출`,
    `  ▸ ${pad('합  계')} ➜  ${n(d.sales_total)}천원`,
    ``,
    `🥩 식재료비`,
    `  ▸ ${pad('금  액')}     ${n(d.food_cost)}천원`,
    `  ▸ ${pad('원가율')} ➜      ${p(c.food_cost_rate)}%`,
    ``,
    `👤 인건비`,
    `  ▸ ${pad('직영')}       ${n(d.labor_direct)}천원`,
    `  ▸ ${pad('파견')}       ${n(d.labor_dispatch)}천원`,
    `  ▸ ${pad('지원')}       ${n(d.labor_support)}천원`,
    `  ▸ ${pad('합  계')} ➜  ${n(c.labor_total)}천원`,
    `  ▸ ${pad('인건비율')} ➜     ${p(c.labor_rate)}%`,
    ``,
    `🔧 제조경비`,
    `  ▸ ${pad('금  액')} ➜  ${n(d.manufacturing_cost)}천원`,
    `  ▸ ${pad('경비율')} ➜      ${p(c.manufacturing_rate)}%`,
    ``,
    `📈 예상이익`,
    `  ▸ ${pad('금  액')} ➜  ${n(c.profit)}천원`,
    `  ▸ ${pad('이익률')}  ➜      ${p(c.profit_rate)}%`,
  ].join('\n')
}

// ── 목표 관리 ───────────────────────────────────────────────
interface ClosingTarget {
  sales: number
  food_cost: number   // 목표 식재비 (천원)
  profit: number      // 목표 이익 (천원)
}

const DEFAULT_TARGET: ClosingTarget = { sales: 0, food_cost: 0, profit: 0 }

function loadTarget(year: number, month: number): ClosingTarget {
  try {
    const raw = localStorage.getItem(`closing_target_${year}_${month}`)
    if (raw) return { ...DEFAULT_TARGET, ...JSON.parse(raw) as ClosingTarget }
  } catch { /* 무시 */ }
  return { ...DEFAULT_TARGET }
}

function saveTarget(year: number, month: number, target: ClosingTarget) {
  localStorage.setItem(`closing_target_${year}_${month}`, JSON.stringify(target))
}

// ── 전월 대비 뱃지 ──────────────────────────────────────────
function DeltaBadge({
  current, prev, unit = '%p', lowerIsBetter = false,
}: {
  current: number; prev: number | undefined; unit?: string; lowerIsBetter?: boolean
}) {
  if (prev === undefined || prev === 0 || current === 0) return null
  const diff = current - prev
  const threshold = unit === '천원' ? 1 : 0.05
  if (Math.abs(diff) < threshold) return null
  const improved = lowerIsBetter ? diff < 0 : diff > 0
  const sign = diff > 0 ? '▲' : '▼'
  const absVal = unit === '천원'
    ? Math.abs(Math.round(diff)).toLocaleString('ko-KR')
    : Math.abs(diff).toFixed(1)
  return (
    <span className={`text-xs font-semibold ${improved ? 'text-blue-500' : 'text-red-400'}`}>
      {sign}{absVal}{unit}
    </span>
  )
}

// ── 달성률 뱃지 ─────────────────────────────────────────────
function AchieveBadge({ actual, target }: { actual: number; target: number }) {
  if (target <= 0 || actual <= 0) return null
  const rate = (actual / target) * 100
  const cls = rate >= 100 ? 'text-green-600 bg-green-50 border-green-200'
            : rate >= 80  ? 'text-amber-600 bg-amber-50 border-amber-200'
            : 'text-red-600 bg-red-50 border-red-200'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${cls}`}>
      달성 {rate.toFixed(1)}%
    </span>
  )
}

// ── 목표 대비 색상 ──────────────────────────────────────────
function targetColor(actual: number, goal: number, lowerIsBetter = false) {
  if (goal <= 0 || actual <= 0) return 'text-gray-400'
  const good = lowerIsBetter ? actual <= goal : actual >= goal
  return good ? 'text-green-600' : 'text-red-500'
}

// ── 메인 컴포넌트 ───────────────────────────────────────────
type Fields = Omit<MonthlyClosing, 'id' | 'created_at' | 'updated_at'>

const EMPTY_FIELDS = (year: number, month: number): Fields => ({
  year, month,
  sales_total: 0, food_cost: 0,
  labor_direct: 0, labor_dispatch: 0, labor_support: 0,
  manufacturing_cost: 0,
})

function getRecentMonths(count: number) {
  const result = []
  const d = new Date()
  for (let i = 0; i < count; i++) {
    result.unshift({ year: d.getFullYear(), month: d.getMonth() + 1 })
    d.setMonth(d.getMonth() - 1)
  }
  return result
}

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

  const tabs = getRecentMonths(6)

  // 최근 7개월 가마감 초기 로드
  useEffect(() => {
    getRecentClosings(7).then(setHistory).catch(() => {})
  }, [])

  // 탭 전환 시 데이터 + 목표 로드
  useEffect(() => {
    setFields(EMPTY_FIELDS(selYear, selMonth))
    setDailyTotal(null)
    setTarget(loadTarget(selYear, selMonth))

    Promise.all([
      getMonthlyClosing(selYear, selMonth),
      getSalesByMonth(selYear, selMonth),
    ]).then(([closing, dailyRows]) => {
      const sumK = Math.round(dailyRows.reduce((acc, r) => acc + r.total_sales, 0) / 1000)
      setDailyTotal(sumK)
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
    }).catch(() => {})
  }, [selYear, selMonth])

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  function updateTarget<K extends keyof ClosingTarget>(key: K, value: ClosingTarget[K]) {
    setTarget(prev => {
      const next = { ...prev, [key]: value }
      saveTarget(selYear, selMonth, next)
      return next
    })
  }

  const calc = calcClosing(fields)

  // 이전 월 데이터 (전월 대비 증감용)
  const prevData = useMemo(() => {
    const prevM = selMonth === 1 ? 12 : selMonth - 1
    const prevY = selMonth === 1 ? selYear - 1 : selYear
    const found = history.find(h => h.year === prevY && h.month === prevM)
    if (!found || found.sales_total === 0) return null
    return { closing: found, calc: calcClosing(found) }
  }, [history, selYear, selMonth])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await upsertMonthlyClosing(fields)
      getRecentClosings(7).then(setHistory).catch(() => {})
      setToast({ message: '저장되었습니다!', type: 'success' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류'
      setToast({ message: `저장 실패: ${msg}`, type: 'error' })
    } finally {
      setSaving(false)
    }
  }, [fields])

  async function handleCopy() {
    const text = buildKakaoText(selYear, selMonth, fields)
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

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {toast !== null && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="text-lg font-bold text-gray-900">가마감</h1>
          <p className="text-xs text-gray-400">손익 예상치 — 단위: 천원</p>
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

      <div className="px-4 pt-4 max-w-lg mx-auto space-y-3">

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
                <label className="text-sm text-gray-600 w-20 shrink-0">목표 매출</label>
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
                <label className="text-sm text-gray-600 w-20 shrink-0">목표 식재비</label>
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
              {/* 목표 이익 */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 w-20 shrink-0">목표 이익</label>
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={target.profit === 0 ? '' : target.profit.toLocaleString('ko-KR')}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '')
                      const n = parseInt(raw, 10)
                      updateTarget('profit', isNaN(n) ? 0 : n)
                    }}
                    placeholder="0"
                    className="w-full text-right pr-10 py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:ring-1 focus:border-blue-400 focus:ring-blue-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">천원</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* 💰 매출 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-gray-400">💰 매출</p>
              <DeltaBadge
                current={fields.sales_total}
                prev={prevData?.closing.sales_total}
                unit="천원"
              />
              {target.sales > 0 ? (
                <AchieveBadge actual={fields.sales_total} target={target.sales} />
              ) : null}
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
            {hasSales ? (
              <DeltaBadge
                current={calc.food_cost_rate}
                prev={prevData?.calc.food_cost_rate}
                lowerIsBetter
              />
            ) : null}
            {target.food_cost > 0 ? (
              <span className={`text-xs font-semibold ${targetColor(fields.food_cost, target.food_cost, true)}`}>
                목표 {target.food_cost.toLocaleString()}천원
              </span>
            ) : null}
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
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-bold text-gray-400">👤 인건비</p>
            {hasSales ? (
              <DeltaBadge
                current={calc.labor_rate}
                prev={prevData?.calc.labor_rate}
                lowerIsBetter
              />
            ) : null}
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
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs font-bold text-gray-400">🔧 제조경비</p>
            {hasSales ? (
              <DeltaBadge
                current={calc.manufacturing_rate}
                prev={prevData?.calc.manufacturing_rate}
                lowerIsBetter
              />
            ) : null}
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
            {hasSales && prevData ? (
              <span className={`text-xs font-semibold ${
                calc.profit_rate >= prevData.calc.profit_rate ? 'text-blue-200' : 'text-red-200'
              }`}>
                {calc.profit_rate >= prevData.calc.profit_rate ? '▲' : '▼'}
                {Math.abs(calc.profit_rate - prevData.calc.profit_rate).toFixed(1)}%p
              </span>
            ) : null}
            {target.profit > 0 ? (
              <span className={`text-xs font-semibold ${
                calc.profit >= target.profit ? 'text-green-300' : 'text-yellow-300'
              }`}>
                목표 {target.profit.toLocaleString()}천원
              </span>
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
          </div>
        </div>

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
