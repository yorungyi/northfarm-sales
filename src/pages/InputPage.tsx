import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Venue, VENUES } from '../types/sales'
import type { DailySales } from '../types/sales'
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
  const [memos, setMemos] = useState<Record<Venue, string>>({
    [Venue.CLUBHOUSE]: '', [Venue.STARTHOUSE]: '', [Venue.EAST_SHADE]: '', [Venue.WEST_SHADE]: '',
  })

  useEffect(() => {
    const dateParam = searchParams.get('date')
    if (dateParam) setSelectedDate(dateParam)
  }, [searchParams, setSelectedDate])

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
    getSalesByDate(toDateString(prevDate)).then((rows) => {
      const map: Partial<Record<Venue, DailySales>> = {}
      for (const row of rows) map[row.venue as Venue] = row
      setPrevDayMap(map)
    }).catch(() => {})
  }, [selectedDate])

  // 해당 날짜 기존 데이터 pre-fill
  useEffect(() => {
    getSalesByDate(selectedDate).then((rows) => {
      resetInputs()
      for (const row of rows) {
        setInput(row.venue as Venue, row.food_sales + row.store_sales)
      }
    }).catch(() => {})
  }, [selectedDate, resetInputs, setInput])

  // 날짜 변경 시 메모 localStorage에서 로드
  useEffect(() => {
    const loaded: Record<Venue, string> = {
      [Venue.CLUBHOUSE]: '', [Venue.STARTHOUSE]: '', [Venue.EAST_SHADE]: '', [Venue.WEST_SHADE]: '',
    }
    for (const v of VENUES) {
      loaded[v] = localStorage.getItem(`northfarm_memo_${selectedDate}_${v}`) ?? ''
    }
    setMemos(loaded)
  }, [selectedDate])

  const total = VENUES.reduce((sum, v) => sum + inputs[v], 0)

  const handleSave = useCallback(async () => {
    if (!isOnline) {
      setToast({ message: '오프라인 상태입니다. 인터넷 연결을 확인해주세요.', type: 'error' })
      return
    }
    setSaving(true)
    try {
      await Promise.all(
        VENUES.map((venue) =>
          upsertSales(selectedDate, venue, inputs[venue], 0)
        )
      )
      // 메모 localStorage 저장
      for (const v of VENUES) {
        const key = `northfarm_memo_${selectedDate}_${v}`
        if (memos[v].trim()) {
          localStorage.setItem(key, memos[v].trim())
        } else {
          localStorage.removeItem(key)
        }
      }
      setToast({ message: '저장되었습니다!', type: 'success' })
    } catch {
      setToast({ message: '저장에 실패했습니다. 다시 시도해주세요.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }, [isOnline, selectedDate, inputs, memos])

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
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

      {/* 합계 카드 */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="bg-blue-600 rounded-2xl p-4 text-white text-center shadow">
          <p className="text-sm text-blue-200">전체 순매출</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(total)}</p>
        </div>
      </div>

      {/* 업장별 입력 */}
      <div className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
        {VENUES.map((venue) => (
          <VenueInputCard
            key={venue}
            venue={venue}
            netSales={inputs[venue]}
            prevDaySales={prevDayMap[venue] ?? null}
            memo={memos[venue]}
            onChange={(value) => setInput(venue, value)}
            onMemoChange={(m) => setMemos((prev) => ({ ...prev, [venue]: m }))}
          />
        ))}
      </div>

      {/* 저장 버튼 */}
      <div className="fixed bottom-14 left-0 right-0 px-4 z-30">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSave}
            disabled={saving || !isOnline}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-base shadow-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
