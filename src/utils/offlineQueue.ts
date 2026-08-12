import type { Venue } from '../types/sales'
import { VENUES } from '../types/sales'

/** 저장 실패 시 임시 보관하는 일매출 입력 1건 */
export interface PendingSave {
  date: string
  inputs: Record<Venue, number>
  guestCount: number
  memos: Record<Venue, string>
  queuedAt: string
  /** true면 재전송 시 메모·내장객 수 저장을 건너뛴다 (불러오기 실패로 값이 비어 있는 경우) */
  skipNote: boolean
}

const PENDING_KEY = 'northfarm_pending_save'

/** 대기 중인 저장 1건 기록 (항상 최신 시도 1건만 유지) */
export function savePending(pending: PendingSave): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    // 저장 공간 부족 등 — 큐 적재 실패는 무시 (본 저장 흐름을 막지 않음)
  }
}

/** 대기 중인 저장 조회 — 없거나 형식이 깨졌으면 null */
export function getPending(): PendingSave | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    return normalize(parsed)
  } catch {
    // 형식이 깨진 값은 정리
    clearPending()
    return null
  }
}

/** 대기 항목 삭제 */
export function clearPending(): void {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // 무시
  }
}

/** 저장된 JSON을 PendingSave 형태로 안전하게 정규화 (엣지케이스: 누락값·형식 불일치) */
function normalize(value: unknown): PendingSave | null {
  if (typeof value !== 'object' || value === null) return null
  const obj = value as Record<string, unknown>

  const date = obj.date
  if (typeof date !== 'string' || date === '') return null

  const rawInputs = typeof obj.inputs === 'object' && obj.inputs !== null
    ? (obj.inputs as Record<string, unknown>)
    : {}
  const rawMemos = typeof obj.memos === 'object' && obj.memos !== null
    ? (obj.memos as Record<string, unknown>)
    : {}

  const inputs = {} as Record<Venue, number>
  const memos = {} as Record<Venue, string>
  for (const venue of VENUES) {
    const n = rawInputs[venue]
    inputs[venue] = typeof n === 'number' && Number.isFinite(n) ? n : 0
    const m = rawMemos[venue]
    memos[venue] = typeof m === 'string' ? m : ''
  }

  const guestCount = typeof obj.guestCount === 'number' && Number.isFinite(obj.guestCount)
    ? obj.guestCount
    : 0
  const queuedAt = typeof obj.queuedAt === 'string' ? obj.queuedAt : new Date().toISOString()
  // 구버전 큐(필드 없음)는 안전한 기본값 false로 취급
  const skipNote = obj.skipNote === true

  return { date, inputs, guestCount, memos, queuedAt, skipNote }
}
