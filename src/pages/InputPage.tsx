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
  // 일별 내장객 수 (업장 구분 없이 하루 1개)
  const [guestCount, setGuestCountState] = useState(0)

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

  // 날짜 변경 시 메모·내장객 수 localStorage에서 로드
  useEffect(() => {
    const loaded: Record<Venue, string> = {
      [Venue.CLUBHOUSE]: '', [Venue.STARTHOUSE]: '', [Venue.EAST_SHADE]: '', [Venue.WEST_SHADE]: '',
    }
    for (const v of VENUES) {
      loaded[v] = localStorage.getItem(`northfarm_memo_${selectedDate}_${v}`) ?? ''
    }
    setMemos(loaded)

    const savedGuest = localStorage.getItem(`northfarm_guest_${selectedDate}`)
    setGuestCountState(savedGuest ? Number(savedGuest) : 0)
  }, [selectedDate])

  const total = VENUES.reduce((sum, v) => sum + inputs[v], 0)

  function handleGuestCountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    setGuestCountState(raw === '' ? 0 : Number(raw))
  }

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
      // 메모·내장객 수 localStorage 저장
      for (const v of VENUES) {
        const key = `northfarm_memo_${selectedDate}_${v}`
        if (memos[v].trim()) {
          localStorage.setItem(key, memos[v].trim())
        } else {
          localStorage.removeItem(key)
        }
      }
      if (guestCount > 0) {
        localStorage.setItem(`northfarm_guest_${selectedDate}`, String(guestCount))
      } else {
        localStorage.removeItem(`northfarm_guest_${selectedDate}`)
      }
      setToast({ message: '저장되었습니다!', type: 'success' })
    } catch {
      setToast({ message: '저장에 실패했습니다. 다시 시도해주세요.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }, [isOnline, selectedDate, inputs, guestCount, memos])

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

      {/* 합계 카드 + 내장객 수 */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="bg-blue-600 rounded-2xl p-4 text-white shadow">
          <div className="text-center">
            <p className="text-sm text-blue-200">전체 순매출</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(total)}</p>
          </div>
          {/* 내장객 수 입력 */}
          <div className="mt-3 pt-3 border-t border-blue-500 flex items-center gap-3">
            <span className="text-sm text-blue-200 whitespace-nowrap">내장객</span>
            <div className="flex-1 relative">
              <input
                type="text"
                inputMode="numeric"
                value={guestCount === 0 ? '' : String(guestCount)}
                onChange={handleGuestCountChange}
                placeholder="0"
                className="w-full text-right pr-7 py-1.5 px-3 rounded-lg bg-blue-500 text-white placeholder-blue-300 text-base font-bold focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-blue-300">명</span>
            </div>
          </div>
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
