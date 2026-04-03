import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'
import { useSalesStore } from '../store/salesStore'
import { upsertSales, getSalesByDate } from '../lib/api'
import { formatDate, formatCurrency, toDateString } from '../utils/format'
import VenueInputCard from '../components/VenueInputCard'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'

export default function InputPage() {
  const [searchParams] = useSearchParams()
  const { selectedDate, setSelectedDate, inputs, setInput, resetInputs } = useSalesStore()

  const [prevDayMap, setPrevDayMap] = useState<Partial<Record<Venue, DailySales>>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // URL param으로 날짜 pre-fill
  useEffect(() => {
    const dateParam = searchParams.get('date')
    if (dateParam) setSelectedDate(dateParam)
  }, [searchParams, setSelectedDate])

  // 오프라인 감지
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // 전일 데이터 로드
  useEffect(() => {
    const prevDate = new Date(selectedDate + 'T00:00:00')
    prevDate.setDate(prevDate.getDate() - 1)
    const prevDateStr = toDateString(prevDate)

    getSalesByDate(prevDateStr).then((rows) => {
      const map: Partial<Record<Venue, DailySales>> = {}
      for (const row of rows) map[row.venue as Venue] = row
      setPrevDayMap(map)
    }).catch(() => {/* 전일 데이터 실패는 무시 */})
  }, [selectedDate])

  // 해당 날짜 기존 데이터 로드 (pre-fill)
  useEffect(() => {
    getSalesByDate(selectedDate).then((rows) => {
      resetInputs()
      for (const row of rows) {
        setInput(row.venue as Venue, 'food_sales', row.food_sales)
        setInput(row.venue as Venue, 'store_sales', row.store_sales)
      }
    }).catch(() => {})
  }, [selectedDate, resetInputs, setInput])

  const totalFood = VENUES.reduce((sum, v) => sum + inputs[v].food_sales, 0)
  const totalStore = VENUES.reduce((sum, v) => sum + inputs[v].store_sales, 0)
  const totalAll = totalFood + totalStore

  const handleSave = useCallback(async () => {
    if (!isOnline) {
      setToast({ message: '오프라인 상태입니다. 인터넷 연결을 확인해주세요.', type: 'error' })
      return
    }
    setSaving(true)
    try {
      await Promise.all(
        VENUES.map((venue) =>
          upsertSales(selectedDate, venue, inputs[venue].food_sales, inputs[venue].store_sales)
        )
      )
      setToast({ message: '저장되었습니다!', type: 'success' })
    } catch {
      setToast({ message: '저장에 실패했습니다. 다시 시도해주세요.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }, [isOnline, selectedDate, inputs])

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4">
          <h1 className="text-lg font-bold text-gray-900">일매출 입력</h1>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="mt-1 text-sm text-blue-600 font-medium bg-transparent border-none outline-none"
          />
          <p className="text-xs text-gray-400">{formatDate(selectedDate)}</p>
        </div>
      </header>

      {/* 상단 합계 카드 */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="bg-blue-600 rounded-2xl p-4 text-white grid grid-cols-3 gap-2 text-center shadow">
          <div>
            <p className="text-xs text-blue-200">식료 합계</p>
            <p className="font-bold text-sm mt-0.5">{formatCurrency(totalFood)}</p>
          </div>
          <div>
            <p className="text-xs text-blue-200">매점 합계</p>
            <p className="font-bold text-sm mt-0.5">{formatCurrency(totalStore)}</p>
          </div>
          <div>
            <p className="text-xs text-blue-200">전체 합계</p>
            <p className="font-bold text-sm mt-0.5">{formatCurrency(totalAll)}</p>
          </div>
        </div>
      </div>

      {/* 업장별 입력 카드 */}
      <div className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
        {VENUES.map((venue) => (
          <VenueInputCard
            key={venue}
            venue={venue}
            foodSales={inputs[venue].food_sales}
            storeSales={inputs[venue].store_sales}
            prevDaySales={prevDayMap[venue] ?? null}
            onChange={(field, value) => setInput(venue, field, value)}
          />
        ))}
      </div>

      {/* 하단 저장 버튼 (BottomNav 위) */}
      <div className="fixed bottom-14 left-0 right-0 px-4 z-30 max-w-lg mx-auto">
        <button
          onClick={handleSave}
          disabled={saving || !isOnline}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-base shadow-lg active:scale-95 transition-transform disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      <BottomNav />
    </div>
  )
}
