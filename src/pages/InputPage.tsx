import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Venue, VENUES } from '../types/sales'
import type { DailySales } from '../types/sales'
import { useSalesStore } from '../store/salesStore'
import { getSalesByDate, getDailyNote, upsertDailyNote, saveDailyEntry } from '../lib/api'
import { formatDate, formatCurrency, toDateString } from '../utils/format'
import { savePending, getPending, clearPending } from '../utils/offlineQueue'
import { applyKeypadKey } from '../utils/keypad'
import VenueInputCard from '../components/VenueInputCard'
import { VenueStepField, NumberKeypad } from '../components/VenueStepper'
import BottomNav from '../components/BottomNav'
import Toast from '../components/Toast'
import { PageHeader, SectionHead, Segmented } from '../components/Ledger'
import type { SegmentOption } from '../components/Ledger'
import {
  BTN_OUTLINE, BTN_FILLED, BTN_FILLED_LG, INPUT, CARD, ALERT, CHIP_BAD, CHIP_NEUTRAL, VENUE_SWATCH,
} from '../lib/ledger'

/** 입력 방식 — 한 곳씩(단계형) / 한눈에(전체 목록). 두 방식 모두 같은 store·상태를 쓴다 */
type InputMode = 'step' | 'all'

const INPUT_MODE_OPTIONS: SegmentOption<InputMode>[] = [
  { value: 'step', label: '한 곳씩' },
  { value: 'all', label: '한눈에' },
]

/** 입력 방식 기억용 localStorage 키 (이 기기에서만 쓰는 편의 설정) */
const INPUT_MODE_KEY = 'northfarm_input_mode'

/** 단계 수 — 업장 5단계 다음의 마무리(내장객·비고·저장) 단계 번호 */
const FINAL_STEP = VENUES.length

/** 기억해 둔 입력 방식 읽기 — 저장소를 못 쓰면 기본값(한 곳씩) */
function readInputMode(): InputMode {
  try {
    return localStorage.getItem(INPUT_MODE_KEY) === 'all' ? 'all' : 'step'
  } catch {
    return 'step'
  }
}

/** 입력 방식 기억 — 실패해도 화면 동작에는 영향 없음 */
function writeInputMode(mode: InputMode): void {
  try {
    localStorage.setItem(INPUT_MODE_KEY, mode)
  } catch {
    // 무시
  }
}

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

  // 입력 방식 + 단계형의 현재 단계(어느 날짜의 단계인지 함께 보관)
  const [mode, setMode] = useState<InputMode>(readInputMode)
  const [stepState, setStepState] = useState<{ date: string; step: number }>(() => ({ date: selectedDate, step: 0 }))
  const stepInputRef = useRef<HTMLInputElement>(null)

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
    // 날짜를 빠르게 바꿨을 때 늦게 도착한 이전 날짜 응답이 새 날짜 화면을 덮지 않도록 버린다
    let cancelled = false
    getSalesByDate(selectedDate).then((rows) => {
      if (cancelled) return
      resetInputs()
      for (const row of rows) {
        setInput(row.venue as Venue, row.food_sales + row.store_sales)
      }
    }).catch(() => {})
    return () => { cancelled = true }
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

  // ── 단계형 입력 ────────────────────────────────────────────
  // 단계는 날짜에 묶어 둔다 — 날짜가 바뀌면 저장된 단계가 다른 날짜 것이 되어 자동으로 1단계부터 시작한다
  const step = stepState.date === selectedDate ? stepState.step : 0
  const stepVenue: Venue | null = step < FINAL_STEP ? VENUES[step] : null

  function goStep(next: number) {
    setStepState({ date: selectedDate, step: Math.max(0, Math.min(FINAL_STEP, next)) })
  }

  function changeMode(next: InputMode) {
    setMode(next)
    writeInputMode(next)
  }

  // 단계가 바뀌면 그 업장 금액 칸에 포커스 — PC에서는 바로 타이핑, 폰에서는 키패드만 쓴다(inputMode="none")
  useEffect(() => {
    if (mode !== 'step' || step >= FINAL_STEP) return
    stepInputRef.current?.focus({ preventScroll: true })
  }, [mode, step])

  return (
    <div className={`min-h-screen bg-paper text-ink ${mode === 'all' ? 'pb-36' : 'pb-24'}`}>
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* 헤더 — 제목 오른쪽에 초기화, 아래 줄에 날짜 선택과 보기 전환 */}
      <PageHeader
        title="일매출 입력"
        aside={
          <button
            type="button"
            onClick={() => {
              if (window.confirm('모든 업장 매출을 0으로 초기화할까요?')) {
                resetInputs()
                setGuestCountState(0)
              }
            }}
            className={BTN_OUTLINE}
          >
            초기화
          </button>
        }
      >
        <div className="max-w-lg mx-auto pb-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
          <label htmlFor="input-date" className="sr-only">날짜</label>
          <input
            id="input-date"
            name="saleDate"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={`${INPUT} num font-semibold`}
          />
          <p className="text-sm text-muted">{formatDate(selectedDate)}</p>
        </div>
        <div className="max-w-lg mx-auto pb-1">
          <Segmented
            label="입력 방식"
            value={mode}
            options={INPUT_MODE_OPTIONS}
            onChange={changeMode}
          />
        </div>
      </PageHeader>

      {/* 상태 표시 — 저장 대기·오프라인은 칩으로 */}
      {(hasPending || !isOnline) && (
        <div className="px-4 mt-3 max-w-lg mx-auto">
          <p role="status" className="flex flex-wrap gap-2">
            {hasPending && <span className={CHIP_BAD}>저장 대기 중</span>}
            {!isOnline && <span className={CHIP_NEUTRAL}>오프라인</span>}
          </p>
        </div>
      )}

      {/* 비고·내장객 수 불러오기 실패 알림 */}
      {noteLoadFailed && (
        <div className="px-4 mt-3 max-w-lg mx-auto">
          <div role="alert" className={ALERT}>
            <p className="text-sm font-bold text-accent-ink">비고, 내장객수 불러오기 실패</p>
          </div>
        </div>
      )}

      {mode === 'step' ? (
        <main className="px-4 max-w-lg mx-auto">
          {/* 단계 표시 — 업장 5칸 진행 막대 */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink-2">
              {stepVenue !== null ? '업장별 순매출' : '내장객, 메모, 저장'}
            </p>
            <p className="text-sm text-muted">
              {stepVenue !== null
                ? <><span className="num font-bold text-ink">{step + 1}</span> / <span className="num">{VENUES.length}</span></>
                : '마무리'}
            </p>
          </div>
          <ol className="mt-2 grid grid-cols-5 gap-1.5" aria-label="입력 단계">
            {VENUES.map((venue, i) => (
              <li key={venue}>
                <button
                  type="button"
                  onClick={() => goStep(i)}
                  aria-label={`${i + 1}단계 ${venue}${i === step ? ', 지금 단계' : ''}`}
                  aria-current={i === step ? 'step' : undefined}
                  className="w-full py-3 focus-visible:outline-offset-0"
                >
                  <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-brand' : 'bg-rule-2'}`} />
                </button>
              </li>
            ))}
          </ol>

          {stepVenue !== null ? (
            <section aria-label={`${stepVenue} 순매출 입력`} className="mt-3">
              <VenueStepField
                ref={stepInputRef}
                venue={stepVenue}
                value={inputs[stepVenue]}
                prevDaySales={prevDayMap[stepVenue] ?? null}
                onChange={(value) => setInput(stepVenue, value)}
                onEnter={() => goStep(step + 1)}
              />
              <p className="mt-2 flex items-baseline justify-between gap-3 px-1 text-sm text-muted">
                <span>전체 순매출</span>
                <span className="num font-semibold text-ink-2">{formatCurrency(total)}</span>
              </p>

              <div className="mt-4">
                <NumberKeypad
                  venue={stepVenue}
                  onKey={(key) => setInput(stepVenue, applyKeypadKey(useSalesStore.getState().inputs[stepVenue], key))}
                />
              </div>

              <div className="mt-3 grid grid-cols-[1fr_2fr] gap-2">
                <button
                  type="button"
                  onClick={() => goStep(step - 1)}
                  disabled={step === 0}
                  className={`${BTN_OUTLINE} h-12`}
                >
                  이전
                </button>
                <button
                  type="button"
                  onClick={() => goStep(step + 1)}
                  className={`${BTN_FILLED} h-12 text-base`}
                >
                  {step < FINAL_STEP - 1 ? '다음 업장' : '내장객, 메모로'}
                </button>
              </div>
            </section>
          ) : (
            // 마무리 단계 — 업장 금액 확인(누르면 그 단계로) → 내장객 → 비고 → 저장
            <>
              <section aria-labelledby="step-review-title" className={`${CARD} mt-3`}>
                <SectionHead id="step-review-title" title="업장별 확인" />
                <ul>
                  {VENUES.map((venue, i) => (
                    <li key={venue} className="border-t border-rule first:border-t-0">
                      <button
                        type="button"
                        onClick={() => goStep(i)}
                        aria-label={`${venue} ${formatCurrency(inputs[venue])}, 눌러서 수정`}
                        className="w-full min-h-11 flex items-center justify-between gap-3 py-2 text-left focus-visible:outline-offset-0"
                      >
                        <span className="flex items-center gap-2 min-w-0 text-base text-ink">
                          <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${VENUE_SWATCH[venue]}`} aria-hidden="true" />
                          <span className="truncate">{venue}</span>
                        </span>
                        <span className={`num text-base font-semibold ${inputs[venue] > 0 ? 'text-ink' : 'text-muted'}`}>
                          {formatCurrency(inputs[venue])}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-rule-2 pt-3">
                  <p className="text-base font-bold text-ink">전체 순매출</p>
                  <p className="num text-2xl font-bold text-ink">{formatCurrency(total)}</p>
                </div>
              </section>

              <section aria-label="내장객과 비고" className={`${CARD} mt-3`}>
                {/* 내장객 수 입력 (업장 구분 없이 하루 1개) */}
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="input-guest-count" className="text-base font-semibold text-ink">내장객</label>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      id="input-guest-count"
                      name="guestCount"
                      type="text"
                      inputMode="numeric"
                      value={guestCount === 0 ? '' : String(guestCount)}
                      onChange={handleGuestCountChange}
                      placeholder="0"
                      className={`${INPUT} num w-36 text-right font-semibold`}
                    />
                    <span className="text-sm text-muted">명</span>
                  </div>
                </div>

                {/* 업장별 비고 */}
                <p className="mt-4 text-sm font-semibold text-ink-2">비고</p>
                <div className="mt-1 space-y-2">
                  {VENUES.map((venue) => (
                    <input
                      key={venue}
                      name={`memo-${venue}`}
                      aria-label={`${venue} 비고`}
                      type="text"
                      value={memos[venue]}
                      onChange={(e) => setMemos((prev) => ({ ...prev, [venue]: e.target.value }))}
                      placeholder={`${venue} (우천, 행사, 단체 등)`}
                      maxLength={50}
                      className={`${INPUT} w-full`}
                    />
                  ))}
                </div>
              </section>

              <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
                <button
                  type="button"
                  onClick={() => goStep(step - 1)}
                  className={`${BTN_OUTLINE} h-12`}
                >
                  이전
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={BTN_FILLED_LG}
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </>
          )}
        </main>
      ) : (
        <>
          <main className="px-4 max-w-lg mx-auto">
            {/* 한눈에 — 업장별 행 → 합계 → 내장객 (흰 카드 한 장) */}
            <section
              aria-label="업장별 순매출 입력"
              className={`${CARD} mt-4 pt-3`}
            >
              {/* 열 머리 */}
              <div className="flex items-end justify-between gap-3 pb-1" aria-hidden="true">
                <span className="text-sm text-muted">업장</span>
                <span className="text-sm text-muted">순매출(원)</span>
              </div>

              {/* 업장별 입력 */}
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

              {/* 합계 행 — 가는 선 위, 굵은 글자 */}
              <div className="flex items-baseline justify-between gap-3 border-t border-rule-2 py-3">
                <p className="text-base font-bold text-ink">전체 순매출</p>
                <p className="num text-2xl font-bold text-ink">{formatCurrency(total)}</p>
              </div>

              {/* 내장객 수 입력 (업장 구분 없이 하루 1개) */}
              <div className="mt-1 flex items-center justify-between gap-3">
                <label htmlFor="input-guest-count" className="text-base font-semibold text-ink">내장객</label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    id="input-guest-count"
                    name="guestCount"
                    type="text"
                    inputMode="numeric"
                    value={guestCount === 0 ? '' : String(guestCount)}
                    onChange={handleGuestCountChange}
                    placeholder="0"
                    className={`${INPUT} num w-40 text-right font-semibold`}
                  />
                  <span className="text-sm text-muted">명</span>
                </div>
              </div>
            </section>
          </main>

          {/* 저장 버튼 — 하단 탭 바로 위에 고정 */}
          <div className="fixed bottom-14 left-0 right-0 z-30 bg-paper px-4 py-2">
            <div className="max-w-lg mx-auto">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={BTN_FILLED_LG}
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  )
}
