import { useState, useEffect, useCallback } from 'react'
import { calcClosing } from '../types/closing'
import type { MonthlyClosing } from '../types/closing'
import { getMonthlyClosing, upsertMonthlyClosing } from '../lib/api'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'

// ── 숫자 입력 헬퍼 ─────────────────────────────────────────
function fmt(n: number) { return n > 0 ? n.toLocaleString('ko-KR') : '' }
function parse(s: string) { const n = parseInt(s.replace(/,/g, ''), 10); return isNaN(n) ? 0 : n }

function NumInput({
  label, value, onChange, hint,
}: {
  label: string; value: number; onChange: (v: number) => void; hint?: string
}) {
  const [disp, setDisp] = useState(fmt(value))
  useEffect(() => { setDisp(fmt(value)) }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/,/g, '')
    if (raw === '' || /^\d+$/.test(raw)) {
      setDisp(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'))
      onChange(parse(raw))
    }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-600 w-24 shrink-0">{label}</label>
      <div className="relative flex-1">
        <input
          type="text"
          inputMode="numeric"
          value={disp}
          onChange={handleChange}
          placeholder="0"
          className="w-full text-right pr-10 py-2.5 px-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">천원</span>
      </div>
      {hint && <span className="text-xs text-blue-600 font-semibold w-16 text-right shrink-0">{hint}</span>}
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

  const tabs = getRecentMonths(6)

  // 월 전환 시 기존 데이터 로드
  useEffect(() => {
    setFields(EMPTY_FIELDS(selYear, selMonth))
    getMonthlyClosing(selYear, selMonth).then((data) => {
      if (data) {
        setFields({
          year: data.year, month: data.month,
          sales_total: data.sales_total,
          food_cost: data.food_cost,
          labor_direct: data.labor_direct,
          labor_dispatch: data.labor_dispatch,
          labor_support: data.labor_support,
          manufacturing_cost: data.manufacturing_cost,
        })
      }
    }).catch(() => {})
  }, [selYear, selMonth])

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const calc = calcClosing(fields)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await upsertMonthlyClosing(fields)
      setToast({ message: '저장되었습니다!', type: 'success' })
    } catch {
      setToast({ message: '저장 실패. 다시 시도해주세요.', type: 'error' })
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

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="text-lg font-bold text-gray-900">가마감</h1>
          <p className="text-xs text-gray-400">손익 예상치 — 단위: 천원</p>
        </div>
        {/* 월 탭 */}
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

        {/* 💰 매출 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-400 mb-3">💰 매출</p>
          <NumInput label="합계" value={fields.sales_total} onChange={(v) => set('sales_total', v)} />
        </div>

        {/* 🥩 식재료비 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-400 mb-3">🥩 식재료비</p>
          <NumInput
            label="금액"
            value={fields.food_cost}
            onChange={(v) => set('food_cost', v)}
            hint={fields.sales_total > 0 ? `${calc.food_cost_rate.toFixed(1)}%` : ''}
          />
          <div className="mt-2 pt-2 border-t border-gray-50">
            {statCell('원가율', fields.sales_total > 0 ? `${calc.food_cost_rate.toFixed(1)}%` : '-')}
          </div>
        </div>

        {/* 👤 인건비 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-400 mb-3">👤 인건비</p>
          <div className="space-y-2.5">
            <NumInput label="직영" value={fields.labor_direct}   onChange={(v) => set('labor_direct', v)} />
            <NumInput label="파견" value={fields.labor_dispatch} onChange={(v) => set('labor_dispatch', v)} />
            <NumInput label="지원" value={fields.labor_support}  onChange={(v) => set('labor_support', v)} />
          </div>
          <div className="mt-2 pt-2 border-t border-gray-50 space-y-0.5">
            {statCell('합계', `${calc.labor_total.toLocaleString()}천원`, true)}
            {statCell('인건비율', fields.sales_total > 0 ? `${calc.labor_rate.toFixed(1)}%` : '-')}
          </div>
        </div>

        {/* 🔧 제조경비 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs font-bold text-gray-400 mb-3">🔧 제조경비</p>
          <NumInput
            label="금액"
            value={fields.manufacturing_cost}
            onChange={(v) => set('manufacturing_cost', v)}
            hint={fields.sales_total > 0 ? `${calc.manufacturing_rate.toFixed(1)}%` : ''}
          />
          <div className="mt-2 pt-2 border-t border-gray-50">
            {statCell('경비율', fields.sales_total > 0 ? `${calc.manufacturing_rate.toFixed(1)}%` : '-')}
          </div>
        </div>

        {/* 📈 예상이익 (자동계산) */}
        <div className={`rounded-2xl p-4 shadow-sm border ${calc.profit >= 0 ? 'bg-blue-600 border-blue-500' : 'bg-red-500 border-red-400'}`}>
          <p className="text-xs font-bold text-blue-200 mb-3">📈 예상이익 (자동계산)</p>
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
                {fields.sales_total > 0 ? `${calc.profit_rate.toFixed(1)}%` : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* 버튼 영역 */}
        <div className="grid grid-cols-2 gap-3 pb-2">
          <button
            onClick={handleCopy}
            className="py-4 rounded-2xl font-bold text-base shadow active:scale-95 transition-transform"
            style={{ backgroundColor: '#FEE500', color: '#1A1A1A' }}
          >
            {copied ? '복사됨! ✓' : '카카오 복사'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="py-4 rounded-2xl bg-blue-600 text-white font-bold text-base shadow active:scale-95 transition-transform disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>

      </div>

      <BottomNav />
    </div>
  )
}
