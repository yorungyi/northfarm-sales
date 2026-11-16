import { useEffect, useRef, useState } from 'react'
import { getEarliestSaleDate } from '../lib/api'

/** 월 선택 탭에는 늘 12개월을 모두 깔아둔다 (1월 ~ 12월) */
const ALL_MONTHS: number[] = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * 첫 매출일 조회가 끝나기 전에 쓸 잠정 연도 하한 (올해로부터 몇 년 전까지).
 * 조회가 성공하면 실제 첫 데이터 연도로 넓어진다.
 */
const FALLBACK_YEAR_SPAN = 1

/** 연도 이동 버튼 — 각진 36px 정사각, 가는 괘선 테두리 */
const YEAR_BTN =
  'w-9 h-9 grid place-items-center rounded-[2px] border border-rule text-ink-2 hover:bg-paper-2 active:bg-paper-3 focus-visible:outline-offset-2 transition-colors disabled:opacity-55 disabled:cursor-not-allowed'

/** 연도 이동 화살표 — 글자 대신 선으로 그린 꺾쇠 (버튼 이름은 aria-label이 맡는다) */
function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={dir === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} />
    </svg>
  )
}

interface Props {
  /** 화면 제목 — 연도 이동 버튼과 같은 줄에 놓인다 */
  title: string
  /** 제목 아래 보조 설명 (선택) */
  subtitle?: string
  year: number
  month: number
  /** 연도·월은 함께 바뀔 수 있어(연도 이동 시 월 보정) 한 번에 넘긴다 */
  onChange: (year: number, month: number) => void
}

/**
 * 연도·월 선택기 — 화면 헤더(<header>) 안에 넣어 쓴다.
 * 장부 체계의 PageHeader와 같은 머리 구성(작은 표제 → 제목 → 밑줄 탭)을 따른다.
 *
 * 고를 수 있는 범위는 코드에 박지 않고 DB의 첫 매출일에서 구한다.
 * 과거 데이터를 넣으면 코드를 고치지 않아도 그 해가 열린다.
 */
export default function MonthYearPicker({ title, subtitle, year, month, onChange }: Props) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // 고를 수 있는 연도 하한 — 데이터가 있는 첫 해. 조회 전에는 작년까지만 열어둔다.
  const [firstYear, setFirstYear] = useState(currentYear - FALLBACK_YEAR_SPAN)

  // 첫 매출일을 한 번만 조회해 연도 범위를 넓힌다.
  // 실패해도 화면은 그대로 돌아가야 하므로 잠정 범위를 유지한다.
  useEffect(() => {
    let cancelled = false
    getEarliestSaleDate()
      .then((date) => {
        if (cancelled || date === null) return
        const y = Number(date.slice(0, 4))
        if (Number.isFinite(y) && y < currentYear) setFirstYear(y)
      })
      .catch(() => { /* 조회 실패 — 잠정 범위(작년~올해) 유지 */ })
    return () => { cancelled = true }
  }, [currentYear])

  // 월 탭 가로 스크롤 — 첫 렌더에서만 오른쪽 끝(연말 방향)으로 보내 이번 달이 보이게 한다
  const monthChipsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = monthChipsRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  /** 그 해에 고를 수 있는 마지막 달 — 올해는 이번 달까지, 지난 해는 12월까지 */
  function lastSelectableMonth(y: number): number {
    return y === currentYear ? currentMonth : 12
  }

  /** 연도 이동 — 넘어간 해에 없는 미래 달이면 그 해의 마지막 달로 당긴다 */
  function shiftYear(delta: number) {
    const nextYear = year + delta
    if (nextYear < firstYear || nextYear > currentYear) return
    const maxMonth = lastSelectableMonth(nextYear)
    onChange(nextYear, Math.min(month, maxMonth))
  }

  return (
    <>
      {/* 머리 — 작은 표제, 제목, 오른쪽 연도 이동 */}
      <div className="max-w-lg mx-auto pt-5 pb-2">
        <p className="text-xs text-muted">노스팜CC</p>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink">{title}</h1>
            {subtitle !== undefined && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {/* 연도 이동 — 데이터가 있는 첫 해부터 올해까지 */}
          <div role="group" aria-label="연도 선택" className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => shiftYear(-1)}
              disabled={year <= firstYear}
              aria-label="이전 연도"
              className={YEAR_BTN}
            >
              <Chevron dir="left" />
            </button>
            <span className="w-16 text-center text-sm font-semibold text-ink">
              <span className="num">{year}</span>년
            </span>
            <button
              type="button"
              onClick={() => shiftYear(1)}
              disabled={year >= currentYear}
              aria-label="다음 연도"
              className={YEAR_BTN}
            >
              <Chevron dir="right" />
            </button>
          </div>
        </div>
      </div>

      {/* 월 선택 — 1~12월 전부. 선택한 달은 빨간 밑줄, 아직 오지 않은 달만 눌리지 않게 막는다 */}
      <div
        ref={monthChipsRef}
        role="group"
        aria-label="월 선택"
        className="max-w-lg mx-auto flex overflow-x-auto -mb-[2px] [scrollbar-width:none]"
      >
        {ALL_MONTHS.map((m) => {
          const active = m === month
          const future = m > lastSelectableMonth(year)
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(year, m)}
              disabled={future}
              className={`shrink-0 px-3 min-h-11 text-sm border-b-2 focus-visible:outline-offset-[-2px] active:bg-paper-2 disabled:opacity-55 disabled:cursor-not-allowed transition-colors ${
                active
                  ? 'border-accent text-ink font-semibold'
                  : future
                    ? 'border-transparent text-muted'
                    : 'border-transparent text-muted hover:text-ink hover:border-rule'
              }`}
            >
              <span className="num">{m}</span>월
            </button>
          )
        })}
      </div>
    </>
  )
}
