import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Venue, VENUES } from '../types/sales'
import type { DailySales } from '../types/sales'
import { useSalesStore } from '../store/salesStore'
import { getSalesByDate, getDailyNote, upsertDailyNote, saveDailyEntry } from '../lib/api'
import { formatDate, formatCurrency, toDateString } from '../utils/format'
import { savePending, getPending, clearPending } from '../utils/offlineQueue'
import VenueInputCard from '../components/VenueInputCard'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'

/** 업장별 빈 메모 맵 생성 */
function emptyMemos(): Record<Venue, string> {
  return Object.fromEntries(VENUES.map((v) => [v, ''])) as Record<Venue, string>
}

/** 구버전 localStorage 메모·내장객 수 읽기 (Supabase 이전용, 1회성) */
function readLegacyNote(date: string): { guestCount: number; memos: Record<Venue, string>; found: boolean } {
  const memos = emptyMemos()
  let found = false
  try {
    for (const v of VENUES) {
      const m = localStorage.getItem(`northfarm_memo_${date}_${v}`)
      if (m) {
        memos[v] = m
        found = true
      }
    }
    const rawGuest = localStorage.getItem(`northfarm_guest_${date}`)
    const guest = rawGuest !== null ? Number(rawGuest) : 0
    const guestCount = Number.isFinite(guest) ? guest : 0
    if (rawGuest !== null) found = true
    return { guestCount, memos, found }
  } catch {
    return { guestCount: 0, memos, found: false }
  }
}

/** 이전 완료된 localStorage 키 정리 */
function clearLegacyNote(date: string): void {
  try {
    for (const v of VENUES) localStorage.removeItem(`northfarm_memo_${date}_${v}`)
    localStorage.removeItem(`northfarm_guest_${date}`)
  } catch {
    // 무시
  }
}

export default function InputPage() {
  const [searchParams] = useSearchParams()
  const { selectedDate, setSelectedDate, inputs, setInput, resetInputs } = useSalesStore()

  const [prevDayMap, setPrevDayMap] = useState<Partial<Record<Venue, DailySales>>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [hasPending, setHasPending] = useState(false)
  const [memos, setMemos] = useState<Record<Venue, string>>(emptyMemos)
  // 일별 내장객 수 (업장 구분 없이 하루 1개)
  const [guestCount, setGuestCountState] = useState(0)
  // 메모·내장객 수 불러오기 실패 여부 — true면 저장 시 daily_notes를 덮어쓰지 않는다
  const [noteLoadFailed, setNoteLoadFailed] = useState(false)

  // 재전송 중복 실행 방지
  const retryingRef = useRef(false)

  useEffect(() => {
    const dateParam = searchParams.get('date')
    if (dateParam) setSelectedDate(dateParam)
  }, [searchParams, setSelectedDate])

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

  // 날짜 변경 시 메모·내장객 수 Supabase(daily_notes)에서 로드
  useEffect(() => {
    let cancelled = false
    const date = selectedDate

    setNoteLoadFailed(false)

    getDailyNote(date).then((note) => {
      if (cancelled) return
      setNoteLoadFailed(false)

      if (note) {
        const loaded = emptyMemos()
        for (const v of VENUES) loaded[v] = note.memos[v] ?? ''
        setMemos(loaded)
        setGuestCountState(note.guest_count)
        return
      }

      // Supabase에 없으면 구버전 localStorage 값 1회 마이그레이션
      const legacy = readLegacyNote(date)
      if (!legacy.found) {
        setMemos(emptyMemos())
        setGuestCountState(0)
        return
      }

      setMemos(legacy.memos)
      setGuestCountState(legacy.guestCount)
      upsertDailyNote(date, legacy.guestCount, legacy.memos)
        .then(() => clearLegacyNote(date))
        .catch(() => {
          // 이전 실패 — localStorage 값은 유지해 다음 기회에 재시도
        })
    }).catch(() => {
      if (cancelled) return
      // 불러오기 실패 — 화면은 비우되, 저장 시 서버의 기존 값을 덮어쓰지 않도록 표시
      setMemos(emptyMemos())
      setGuestCountState(0)
      setNoteLoadFailed(true)
    })

    return () => { cancelled = true }
  }, [selectedDate])

  /** 대기 중인 저장 재전송 */
  const retryPending = useCallback(async () => {
    if (retryingRef.current) return
    const pending = getPending()
    if (!pending) {
      setHasPending(false)
      return
    }

    retryingRef.current = true
    try {
      // 현재 선택된 날짜가 아니라 큐에 기록된 날짜(pending.date)로 재전송
      const result = await saveDailyEntry(
        pending.date,
        pending.inputs,
        pending.guestCount,
        pending.memos,
        { skipNote: pending.skipNote },
      )

      // 재전송 도중 새 항목이 큐에 들어왔다면 지우지 않는다
      const current = getPending()
      if (current === null || current.queuedAt === pending.queuedAt) {
        clearPending()
        setHasPending(false)
      } else {
        setHasPending(true)
      }

      setToast(
        result.noteStatus === 'failed'
          ? {
              message: `${pending.date} 매출은 저장했지만 비고·내장객수는 저장하지 못했습니다`,
              type: 'error',
            }
          : { message: '대기 중이던 매출이 저장되었습니다', type: 'success' },
      )
    } catch {
      setHasPending(true)
    } finally {
      retryingRef.current = false
    }
  }, [])

  // 마운트 시 + 온라인 복귀 시 자동 재전송
  useEffect(() => {
    setHasPending(getPending() !== null)
    void retryPending()

    const handleOnline = () => {
      setIsOnline(true)
      void retryPending()
    }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [retryPending])

  const total = VENUES.reduce((sum, v) => sum + inputs[v], 0)

  function handleGuestCountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    setGuestCountState(raw === '' ? 0 : Number(raw))
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const result = await saveDailyEntry(selectedDate, inputs, guestCount, memos, {
        skipNote: noteLoadFailed,
      })

      // 같은 날짜의 대기 항목만 정리 — 다른 날짜의 큐는 유지해 이후 재전송되게 한다
      const pending = getPending()
      if (pending !== null && pending.date === selectedDate) {
        clearPending()
        setHasPending(false)
      } else {
        setHasPending(pending !== null)
      }

      if (result.noteStatus === 'skipped') {
        setToast({
          message: '매출은 저장했습니다. 비고·내장객수를 불러오지 못해 이번 저장에는 반영되지 않았습니다',
          type: 'error',
        })
      } else if (result.noteStatus === 'failed') {
        setToast({
          message: '매출은 저장했지만 비고·내장객수는 저장하지 못했습니다',
          type: 'error',
        })
      } else {
        setToast({ message: '저장되었습니다!', type: 'success' })
      }
    } catch {
      // 매출 저장 실패 — 입력값을 큐에 보관해 연결 복구 시 자동 재전송
      savePending({
        date: selectedDate,
        inputs,
        guestCount,
        memos,
        queuedAt: new Date().toISOString(),
        skipNote: noteLoadFailed,
      })
      setHasPending(true)
      setToast({
        message: '오프라인 상태로 임시 저장했습니다. 연결되면 자동으로 재전송됩니다',
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }, [selectedDate, inputs, guestCount, memos, noteLoadFailed])

  return (
    <div className="min-h-screen bg-gray-50 pb-36">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-gray-900">일매출 입력</h1>
              {hasPending && (
                <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
                  저장 대기 중
                </span>
              )}
              {!isOnline && (
                <span className="text-xs font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-lg px-2 py-0.5">
                  오프라인
                </span>
              )}
              {noteLoadFailed && (
                <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-0.5">
                  비고·내장객수 불러오기 실패
                </span>
              )}
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-1 text-sm text-blue-600 font-medium bg-transparent border-none outline-none"
            />
            <p className="text-xs text-gray-400">{formatDate(selectedDate)}</p>
          </div>
          <button
            onClick={() => {
              if (window.confirm('모든 업장 매출을 0으로 초기화할까요?')) {
                resetInputs()
                setGuestCountState(0)
              }
            }}
            className="mt-1 text-sm text-red-500 font-medium px-3 py-1.5 rounded-lg border border-red-200 active:bg-red-50"
          >
            초기화
          </button>
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
            disabled={saving}
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
