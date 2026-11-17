/**
 * 월별 스코어카드 보기 — 행은 주(월요일 시작), 열은 월~일 + 오른쪽 주 합계.
 * 하루 목표(파) 이상이면 초록 동그라미, 미달이면 회색 네모, 지난 날 미입력은 빨간 점선 네모.
 * 계산은 utils/scorecard.ts의 순수 함수가 하고, 여기서는 그리기만 한다.
 */
import type { Scorecard, ScoreDay, ScoreStatus } from '../utils/scorecard'
import { toManwon } from '../utils/scorecard'
import { formatCurrency } from '../utils/format'
import { SectionHead } from './Ledger'
import { CARD } from '../lib/ledger'

/** 열 머리 — 월요일 시작 */
const WEEK_HEAD = ['월', '화', '수', '목', '금', '토', '일']

/** 격자 열 배치 — 주 이름 | 월~일 7칸 | 주 합계 */
const GRID = 'grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))_2.75rem] gap-x-1'

/** 칸 모양 — 판정별 테두리 (색만이 아니라 모양으로도 구분한다) */
const SHAPE: Record<ScoreStatus, string> = {
  over: 'rounded-full border-[1.5px] border-brand text-ink',
  under: 'rounded-[6px] border-[1.5px] border-muted text-ink',
  plain: 'rounded-[6px] text-ink',
  missing: 'rounded-[6px] border-[1.5px] border-dashed border-accent text-accent-ink',
  empty: 'rounded-[6px]',
}

/** 판정을 보조기기용 말로 */
const STATUS_WORD: Record<ScoreStatus, string> = {
  over: '목표 이상',
  under: '목표 미달',
  plain: '',
  missing: '미입력',
  empty: '',
}

/** 만원 정수 (칸에는 콤마 없이 짧게) */
function shortManwon(won: number): string {
  return String(toManwon(won))
}

interface MonthlyScorecardProps {
  month: number
  scorecard: Scorecard
  /** 하루 목표(원). 0이면 목표 없음 — 금액만 표시 */
  par: number
  /** 목표 조회 실패 여부 */
  targetFailed: boolean
  /** 목표 조회 중 — 이때는 '목표 없음' 안내를 띄우지 않는다 */
  targetLoading: boolean
  /** 칸을 눌렀을 때 — 입력된 날은 상세, 지난 날·오늘 미입력은 입력 화면 */
  onOpenDay: (day: ScoreDay) => void
}

export default function MonthlyScorecard({ month, scorecard, par, targetFailed, targetLoading, onOpenDay }: MonthlyScorecardProps) {
  const { weeks, summary } = scorecard
  const hasPar = par > 0

  /** 한 칸의 보조기기 이름 — 예: "11월 14일 1,340만원 목표 이상" */
  function dayLabel(day: ScoreDay): string {
    const head = `${month}월 ${day.day}일`
    if (day.hasData) {
      const word = STATUS_WORD[day.status]
      return `${head} ${toManwon(day.net).toLocaleString()}만원${word ? ` ${word}` : ''}`
    }
    if (day.status === 'missing') return `${head} 미입력, 눌러서 입력`
    return day.isToday ? `${head} 오늘, 입력 전` : head
  }

  return (
    <>
      <section aria-labelledby="scorecard-title" className={`${CARD} mt-3 px-3`}>
        <div className="px-1">
          <SectionHead id="scorecard-title" title={`${month}월 스코어카드`}>
            <span className="text-sm text-muted">단위 만원</span>
          </SectionHead>
          {/* 범례 — 목표가 있으면 파 기준, 없으면 목표를 정하는 곳 안내 */}
          <p className="text-sm text-muted">
            {hasPar ? (
              <>하루 목표(파) <span className="num font-semibold text-ink-2">{toManwon(par).toLocaleString()}</span>만원. 이상이면 동그라미, 미달이면 네모</>
            ) : targetLoading ? (
              '목표 매출 불러오는 중…'
            ) : targetFailed ? (
              '목표 매출을 불러오지 못해 금액만 표시합니다'
            ) : (
              '가마감 탭에서 목표 매출을 정하면 동그라미와 네모로 표시돼요'
            )}
          </p>
        </div>

        {/* 열 머리 — 칸마다 날짜를 읽어주므로 보조기기에는 숨긴다 */}
        <div className={`${GRID} mt-3 text-center text-xs font-medium text-muted`} aria-hidden="true">
          <span />
          {WEEK_HEAD.map((w) => <span key={w}>{w}</span>)}
          <span>합계</span>
        </div>

        <div role="group" aria-label={`${month}월 스코어카드. 칸을 누르면 그날 상세로 이동`} className="mt-1 space-y-1.5">
          {weeks.map((week) => (
            <div key={week.index} className={`${GRID} items-end`}>
              <span className="pb-2.5 text-center text-xs font-semibold text-muted" aria-hidden="true">
                {week.index}주
              </span>

              {week.cells.map((day, col) => {
                if (day === null) return <span key={`blank-${col}`} aria-hidden="true" />
                const clickable = day.hasData || day.status === 'missing' || day.isToday
                const shape = `${SHAPE[day.status]} ${day.isToday && !day.hasData ? 'bg-paper-2' : ''}`
                const inner = (
                  <>
                    <span className={`block text-[10px] leading-4 ${day.isToday ? 'font-bold text-ink' : 'text-muted'}`}>
                      {day.day}
                    </span>
                    <span className={`num mx-auto grid aspect-square w-full max-w-11 place-items-center text-[11px] font-semibold tracking-[-0.04em] ${shape}`}>
                      {day.hasData ? shortManwon(day.net) : day.status === 'missing' ? '미' : ''}
                    </span>
                  </>
                )
                return clickable ? (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => onOpenDay(day)}
                    aria-label={dayLabel(day)}
                    className="min-w-0 rounded-[8px] text-center hover:bg-paper-2 transition-colors focus-visible:outline-offset-0"
                  >
                    {inner}
                  </button>
                ) : (
                  <span key={day.date} className="min-w-0 text-center" aria-hidden="true">{inner}</span>
                )
              })}

              {/* 주 합계 — 그 주 중 이 달에 속한 날만 (원 단위로 더한 뒤 만원 환산) */}
              <span
                className="num mb-0.5 grid h-8 place-items-center rounded-[8px] bg-brand-soft text-[11px] font-bold tracking-[-0.03em] text-brand-ink"
                aria-label={`${week.index}주 합계 ${week.hasData ? `${toManwon(week.total).toLocaleString()}만원` : '입력 없음'}`}
                role="img"
              >
                {week.hasData ? toManwon(week.total).toLocaleString() : '-'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 요약 — 목표 이상·미달·미입력 일수, 누적 합계 */}
      <section aria-labelledby="scorecard-summary-title" className={`${CARD} mt-3`}>
        <h2 id="scorecard-summary-title" className="sr-only">{month}월 스코어카드 요약</h2>
        <dl>
          {hasPar && (
            <>
              <div className="flex items-center justify-between gap-3 py-2">
                <dt className="flex items-center gap-2 text-sm text-ink-2">
                  <span className="w-3.5 h-3.5 rounded-full border-[1.5px] border-brand" aria-hidden="true" />
                  목표 이상
                </dt>
                <dd className="text-base font-bold text-ink"><span className="num">{summary.over}</span>일</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2 border-t border-rule">
                <dt className="flex items-center gap-2 text-sm text-ink-2">
                  <span className="w-3.5 h-3.5 rounded-[3px] border-[1.5px] border-muted" aria-hidden="true" />
                  목표 미달
                </dt>
                <dd className="text-base font-bold text-ink"><span className="num">{summary.under}</span>일</dd>
              </div>
            </>
          )}
          <div className={`flex items-center justify-between gap-3 py-2 ${hasPar ? 'border-t border-rule' : ''}`}>
            <dt className="flex items-center gap-2 text-sm text-accent-ink">
              <span className="w-3.5 h-3.5 rounded-[3px] border-[1.5px] border-dashed border-accent" aria-hidden="true" />
              미입력
            </dt>
            <dd className={`text-base font-bold ${summary.missing > 0 ? 'text-accent-ink' : 'text-ink'}`}>
              <span className="num">{summary.missing}</span>일
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 pt-3 mt-1 border-t border-rule-2">
            <dt className="text-sm font-bold text-ink">누적 합계</dt>
            <dd className="text-right">
              <span className="block text-xl font-bold text-ink">
                <span className="num">{toManwon(summary.total).toLocaleString()}</span>만원
              </span>
              <span className="num block text-sm text-muted">{formatCurrency(summary.total)}</span>
            </dd>
          </div>
        </dl>
      </section>
    </>
  )
}
