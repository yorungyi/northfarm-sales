/**
 * 월별 스코어카드 — 골프 스코어카드 문법으로 한 달을 주(월요일 시작) × 요일 격자로 본다.
 * 하루 목표(파) 이상이면 동그라미, 미달이면 네모, 지난 날인데 입력이 없으면 미입력.
 *
 * 화면과 분리한 순수 함수만 둔다 — 같은 입력이면 늘 같은 결과라 테스트하기 쉽다.
 * 금액은 전부 원 단위로 계산하고, 만원 환산은 화면에 그릴 때 한 번만 한다(반올림 오차 누적 방지).
 */

/** 칸 판정 — over: 목표 이상, under: 미달, plain: 목표 없음(금액만), missing: 지난 날 미입력, empty: 오늘·이후 미입력 */
export type ScoreStatus = 'over' | 'under' | 'plain' | 'missing' | 'empty'

export interface ScoreDay {
  date: string      // 'YYYY-MM-DD'
  day: number       // 1~31
  net: number       // 그날 순매출(원). 입력이 없으면 0
  hasData: boolean  // 그날 행이 하나라도 있는지
  isToday: boolean
  status: ScoreStatus
}

export interface ScoreWeek {
  /** 1부터 — 그 달의 몇째 주 */
  index: number
  /** 월~일 7칸. 그 달에 속하지 않는 칸은 null */
  cells: (ScoreDay | null)[]
  /** 그 주 중 그 달에 속한 날만 더한 합계(원) */
  total: number
  /** 그 주에 입력된 날이 하루라도 있는지 */
  hasData: boolean
  /** 그 주에 속한 그 달의 첫날·마지막 날 (예: 1, 2) */
  firstDay: number
  lastDay: number
}

export interface ScoreSummary {
  over: number     // 목표 이상 일수
  under: number    // 목표 미달 일수
  missing: number  // 지난 날 미입력 일수
  total: number    // 월 합계(원) — 일자별 합계를 원 단위로 그대로 더한 값
}

export interface Scorecard {
  weeks: ScoreWeek[]
  summary: ScoreSummary
}

/** 그 달의 일수 */
export function daysInMonthOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * 하루 목표(파, 원) = 그 달 목표 매출(원) ÷ 그 달 일수.
 * 목표가 없거나 0 이하이면 0 (판정 없이 금액만 그린다).
 */
export function dailyPar(monthTargetWon: number | null, year: number, month: number): number {
  if (monthTargetWon === null || !Number.isFinite(monthTargetWon) || monthTargetWon <= 0) return 0
  return monthTargetWon / daysInMonthOf(year, month)
}

/** 한 칸 판정 */
export function judgeDay(
  net: number,
  hasData: boolean,
  date: string,
  todayStr: string,
  par: number,
): ScoreStatus {
  if (hasData) {
    if (par <= 0) return 'plain'
    return net >= par ? 'over' : 'under'
  }
  // 입력이 없는 날 — 지난 날만 미입력, 오늘과 이후는 빈 칸
  return date < todayStr ? 'missing' : 'empty'
}

/** 월요일=0 … 일요일=6 */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 스코어카드 만들기.
 * @param dayMap 날짜('YYYY-MM-DD') → 그날 순매출 합계(원). 키가 있으면 입력된 날로 본다.
 * @param todayStr 오늘 'YYYY-MM-DD'
 * @param par 하루 목표(원). 0이면 판정하지 않는다
 */
export function buildScorecard(
  year: number,
  month: number,
  dayMap: ReadonlyMap<string, number>,
  todayStr: string,
  par: number,
): Scorecard {
  const days = daysInMonthOf(year, month)
  const mm = pad2(month)
  const firstOffset = mondayIndex(new Date(year, month - 1, 1))

  const weeks: ScoreWeek[] = []
  const summary: ScoreSummary = { over: 0, under: 0, missing: 0, total: 0 }

  for (let d = 1; d <= days; d++) {
    const slot = firstOffset + d - 1
    const weekIdx = Math.floor(slot / 7)
    const col = slot % 7
    if (weeks[weekIdx] === undefined) {
      weeks[weekIdx] = {
        index: weekIdx + 1,
        cells: Array.from({ length: 7 }, () => null),
        total: 0,
        hasData: false,
        firstDay: d,
        lastDay: d,
      }
    }
    const week = weeks[weekIdx]

    const date = `${year}-${mm}-${pad2(d)}`
    const hasData = dayMap.has(date)
    const net = dayMap.get(date) ?? 0
    const status = judgeDay(net, hasData, date, todayStr, par)

    week.cells[col] = { date, day: d, net, hasData, isToday: date === todayStr, status }
    week.total += net
    week.hasData = week.hasData || hasData
    week.lastDay = d

    summary.total += net
    if (status === 'over') summary.over += 1
    else if (status === 'under') summary.under += 1
    else if (status === 'missing') summary.missing += 1
  }

  return { weeks, summary }
}

/** 원 → 만원 (반올림 정수). 화면에 그릴 때만 쓴다 */
export function toManwon(won: number): number {
  return Math.round(won / 10000)
}
