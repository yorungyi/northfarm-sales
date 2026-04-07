import { useState, useEffect } from 'react'
import type { DailySales } from '../types/sales'
import { Venue } from '../types/sales'
import { formatNumber, parseNumber, formatCurrency } from '../utils/format'

interface VenueInputCardProps {
  venue: Venue
  netSales: number
  prevDaySales: DailySales | null
  memo: string
  onChange: (value: number) => void
  onMemoChange: (memo: string) => void
}

export default function VenueInputCard({
  venue,
  netSales,
  prevDaySales,
  memo,
  onChange,
  onMemoChange,
}: VenueInputCardProps) {
  const [display, setDisplay] = useState(formatNumber(netSales))

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
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-800 text-base">{venue}</h3>
        {prevNet !== null && (
          <span className="text-xs text-gray-400">전일 {formatCurrency(prevNet)}</span>
        )}
      </div>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          placeholder="0"
          className="w-full text-right pr-7 py-3 px-4 rounded-xl border border-gray-200 text-lg font-bold text-gray-800 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">원</span>
      </div>
      {/* 비고 입력 */}
      <input
        type="text"
        value={memo}
        onChange={(e) => onMemoChange(e.target.value)}
        placeholder="비고 (우천, 행사, 단체 등)"
        maxLength={50}
        className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-100 bg-gray-50 text-xs text-gray-600 placeholder-gray-300 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-200"
      />
    </div>
  )
}
