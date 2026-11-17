/**
 * 단계형 입력 부품 — 업장 하나의 큰 금액 칸과 화면 숫자 키패드.
 * 금액은 늘 부모(store)의 값을 그대로 보여주고, 바뀐 값은 onChange로만 올린다.
 * 기본 키보드는 inputMode="none"으로 막고, PC 키보드 타이핑은 onChange로 계속 받는다.
 */
import { forwardRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { DailySales } from '../types/sales'
import { Venue } from '../types/sales'
import { formatNumber, parseNumber, formatCurrency } from '../utils/format'
import { KEYPAD_KEYS, KEYPAD_MAX_DIGITS } from '../utils/keypad'
import type { KeypadKey } from '../utils/keypad'
import { VENUE_SWATCH } from '../lib/ledger'

interface VenueStepFieldProps {
  venue: Venue
  value: number
  prevDaySales: DailySales | null
  onChange: (value: number) => void
  /** 칸에서 Enter — 다음 단계로 */
  onEnter: () => void
}

/** 업장 이름(크게) + 전일 매출 + 큰 금액 칸 */
export const VenueStepField = forwardRef<HTMLInputElement, VenueStepFieldProps>(function VenueStepField(
  { venue, value, prevDaySales, onChange, onEnter },
  ref,
) {
  const prevNet = prevDaySales ? prevDaySales.food_sales + prevDaySales.store_sales : null
  // 라벨과 입력칸 연결용 id — 단계형에는 한 번에 업장 하나만 그려지므로 업장명으로 충분하다
  const fieldId = `step-sales-${venue}`

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/,/g, '')
    // 키패드와 같은 자릿수 상한 — 붙여넣기·PC 타이핑도 11자리를 넘기면 무시
    if (raw.length > KEYPAD_MAX_DIGITS) return
    if (raw === '' || /^\d+$/.test(raw)) onChange(parseNumber(raw))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnter()
    }
  }

  return (
    <div>
      <label htmlFor={fieldId} className="flex items-center gap-2.5 text-2xl font-bold text-ink">
        <span className={`w-3 h-3 shrink-0 rounded-full ${VENUE_SWATCH[venue]}`} aria-hidden="true" />
        {venue}
      </label>
      <p className="mt-1 pl-[22px] text-sm text-muted">
        {prevNet !== null ? <>전일 <span className="num">{formatCurrency(prevNet)}</span></> : '전일 입력 없음'}
      </p>
      <div className="mt-4 flex items-baseline gap-2 rounded-[14px] bg-sheet border-[1.5px] border-brand px-4 py-3 focus-within:shadow-[0_0_0_1px_var(--color-brand)]">
        <input
          ref={ref}
          id={fieldId}
          name={`sales-${venue}`}
          type="text"
          inputMode="none"
          autoComplete="off"
          value={formatNumber(value)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="0"
          className="num min-w-0 flex-1 bg-transparent text-right text-3xl font-bold text-ink placeholder:text-rule-2 outline-none focus-visible:outline-none"
        />
        <span className="text-lg font-semibold text-muted">원</span>
      </div>
    </div>
  )
})

interface NumberKeypadProps {
  /** 키패드가 바꾸는 업장 (보조기기 안내용) */
  venue: Venue
  /**
   * 키 하나 눌림 — 새 금액 계산(applyKeypadKey)은 부모가 store의 최신 값으로 한다.
   * 화면에 그려진 값으로 계산하면 빠르게 연타할 때 앞 입력이 사라질 수 있기 때문.
   */
  onKey: (key: KeypadKey) => void
}

/** 화면 숫자 키패드 — 1~9, 00, 0, 지움 */
export function NumberKeypad({ venue, onKey }: NumberKeypadProps) {
  function press(key: KeypadKey) {
    onKey(key)
  }

  return (
    <div role="group" aria-label={`${venue} 금액 키패드`} className="grid grid-cols-3 gap-2">
      {KEYPAD_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          aria-label={key === 'back' ? '한 자리 지움' : key}
          className={`h-14 rounded-[14px] bg-sheet text-ink active:bg-paper-3 transition-colors focus-visible:outline-offset-0 ${
            key === 'back' ? 'text-base font-semibold text-ink-2' : 'num text-2xl font-semibold'
          }`}
        >
          {key === 'back' ? '지움' : key}
        </button>
      ))}
    </div>
  )
}
