import { useState, useEffect } from 'react'
import type { DailySales } from '../types/sales'
import { Venue } from '../types/sales'
import { formatNumber, parseNumber, formatCurrency } from '../utils/format'

interface VenueInputCardProps {
  venue: Venue
  foodSales: number
  storeSales: number
  prevDaySales: DailySales | null
  onChange: (field: 'food_sales' | 'store_sales', value: number) => void
}

export default function VenueInputCard({
  venue,
  foodSales,
  storeSales,
  prevDaySales,
  onChange,
}: VenueInputCardProps) {
  const [foodDisplay, setFoodDisplay] = useState(formatNumber(foodSales))
  const [storeDisplay, setStoreDisplay] = useState(formatNumber(storeSales))

  useEffect(() => {
    setFoodDisplay(formatNumber(foodSales))
  }, [foodSales])

  useEffect(() => {
    setStoreDisplay(formatNumber(storeSales))
  }, [storeSales])

  const total = foodSales + storeSales

  function handleFoodChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/,/g, '')
    if (raw === '' || /^\d+$/.test(raw)) {
      setFoodDisplay(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'))
      onChange('food_sales', parseNumber(raw))
    }
  }

  function handleStoreChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/,/g, '')
    if (raw === '' || /^\d+$/.test(raw)) {
      setStoreDisplay(raw === '' ? '' : Number(raw).toLocaleString('ko-KR'))
      onChange('store_sales', parseNumber(raw))
    }
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-800 text-base">{venue}</h3>
        <span className="text-base font-bold text-blue-600">{formatCurrency(total)}</span>
      </div>

      <div className="space-y-2">
        {/* 식료 */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 w-10 shrink-0">식료</label>
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="numeric"
              value={foodDisplay}
              onChange={handleFoodChange}
              placeholder="0"
              className="w-full text-right pr-6 py-2 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
          </div>
          {prevDaySales && (
            <span className="text-xs text-gray-400 w-20 text-right shrink-0">
              전일 {formatCurrency(prevDaySales.food_sales)}
            </span>
          )}
        </div>

        {/* 매점 */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 w-10 shrink-0">매점</label>
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="numeric"
              value={storeDisplay}
              onChange={handleStoreChange}
              placeholder="0"
              className="w-full text-right pr-6 py-2 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
          </div>
          {prevDaySales && (
            <span className="text-xs text-gray-400 w-20 text-right shrink-0">
              전일 {formatCurrency(prevDaySales.store_sales)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
