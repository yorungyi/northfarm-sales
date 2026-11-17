/**
 * 1안(클리어) 공용 부품 — 화면 머리, 카드 안 구역 머리, 수치 한 칸, 세그먼트 컨트롤.
 * 파일 이름은 장부 체계 때 이름(Ledger)을 그대로 둔다 — import 경로를 바꾸지 않기 위함.
 */
import type { ReactNode } from 'react'

interface SectionHeadProps {
  id: string
  title: string
  children?: ReactNode
}

/** 구역 머리 — 카드 맨 위에 두는 굵은 제목, 오른쪽에 그 구역의 동작 (괘선 없음) */
export function SectionHead({ id, title, children }: SectionHeadProps) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-11">
      <h2 id={id} className="text-base font-bold text-ink">{title}</h2>
      {children}
    </div>
  )
}

interface StatProps {
  label: string
  children: ReactNode
}

/** 작은 수치 한 칸 — <dl> 안에서 쓴다 */
export function Stat({ label, children }: StatProps) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-ink">{children}</dd>
    </div>
  )
}

interface PageHeaderProps {
  title: string
  /** 제목 오른쪽 — 날짜·기간·동작 등 */
  aside?: ReactNode
  /** 제목 위 작은 글씨 (기본 노스팜CC) */
  kicker?: ReactNode
  /** 제목 줄 아래 — 탭·선택기 등 */
  children?: ReactNode
}

/** 화면 머리 — 바탕색 위에 큰 제목만. 괘선·그림자 없음 */
export function PageHeader({ title, aside, kicker = '노스팜CC', children }: PageHeaderProps) {
  return (
    <header className="bg-paper px-4 pt-safe-top">
      <div className="max-w-lg mx-auto pt-6 pb-3">
        <p className="text-sm text-muted">{kicker}</p>
        <div className="mt-0.5 flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {aside}
        </div>
      </div>
      {children}
    </header>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

interface SegmentedProps<T extends string> {
  /** 보조기기에 읽히는 묶음 이름 */
  label: string
  value: T
  options: SegmentOption<T>[]
  onChange: (value: T) => void
  className?: string
}

/** 세그먼트 컨트롤 — 회색 트랙 위에 선택한 칸만 흰 면. 탭·보기 전환·필터에 쓴다 */
export function Segmented<T extends string>({ label, value, options, onChange, className = '' }: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-[12px] bg-paper-3 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`min-h-9 px-3 rounded-[9px] text-sm whitespace-nowrap transition-colors focus-visible:outline-offset-0 ${
              active ? 'bg-sheet text-ink font-bold' : 'text-muted font-medium hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
