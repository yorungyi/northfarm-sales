import { useState, useEffect, useId } from 'react'
import type { DailySales } from '../types/sales'
import { Venue } from '../types/sales'
import { formatNumber, parseNumber, formatCurrency } from '../utils/format'
import { INPUT, VENUE_SWATCH } from '../lib/ledger'

interface VenueInputCardProps {
  venue: Venue
  netSales: number
  prevDaySales: DailySales | null
  memo: string
  onChange: (value: number) => void
  onMemoChange: (memo: string) => void
}

/** 업장 한 줄 — 흰 카드 안의 가는 선 행. 왼쪽 업장명·전일, 오른쪽 금액, 아래 비고 */
export default function VenueInputCard({
  venue,
  netSales,
  prevDaySales,
  memo,
  onChange,
  onMemoChange,
}: VenueInputCardProps) {
  const [display, setDisplay] = useState(formatNumber(netSales))
  // 라벨과 입력칸 연결용 id (업장명이 한글이라 React가 만든 id를 쓴다)
  const fieldId = useId()

  useEffect(() => {
    setDisplay(formatNumber(netSales))
  }, [netSales])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/,/g, '')
    if (raw === '' || /^\d+$/.test(raw)) {
      setDisplay(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'))
      onChange(parseNumber(raw))
    }
  }

  const prevNet = prevDaySales ? prevDaySales.food_sales + prevDaySales.store_sales : null

  return (
    <div className="border-t border-rule first:border-t-0 py-3.5">
      <div className="flex items-center justify-between gap-3">
        {/* 업장명 = 금액 입력칸의 보이는 라벨 */}
        <div className="min-w-0">
          <label htmlFor={`${fieldId}-sales`} className="flex items-center gap-2 text-base font-semibold text-ink">
            <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${VENUE_SWATCH[venue]}`} aria-hidden="true" />
            <span className="truncate">{venue}</span>
          </label>
          {prevNet !== null && (
            <p className="mt-0.5 pl-[18px] text-sm text-muted">
              전일 <span className="num">{formatCurrency(prevNet)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            id={`${fieldId}-sales`}
            name={`sales-${venue}`}
            type="text"
            inputMode="numeric"
            value={display}
            onChange={handleChange}
            placeholder="0"
            className={`${INPUT} num w-40 text-right font-semibold`}
          />
          <span className="text-sm text-muted">원</span>
        </div>
      </div>
      {/* 비고 입력 */}
      <input
        name={`memo-${venue}`}
        aria-label={`${venue} 비고`}
        type="text"
        value={memo}
        onChange={(e) => onMemoChange(e.target.value)}
        placeholder="비고 (우천, 행사, 단체 등)"
        maxLength={50}
        className={`${INPUT} mt-2 w-full`}
      />
    </div>
  )
}
