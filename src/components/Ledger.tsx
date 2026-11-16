/**
 * 장부 디자인 공용 부품 — 구역 머리, 수치 한 칸, 화면 머리.
 * 모든 화면이 같은 괘선·글자 크기를 쓰도록 여기서만 정의한다.
 */
import type { ReactNode } from 'react'

interface SectionHeadProps {
  id: string
  title: string
  children?: ReactNode
}

/** 구역 머리 — 제목 아래 굵은 괘선, 오른쪽에 그 구역의 동작 */
export function SectionHead({ id, title, children }: SectionHeadProps) {
  return (
    <div className="flex items-end justify-between gap-3 border-b-2 border-rule-2 pb-2 min-h-11">
      <h2 id={id} className="text-base font-semibold text-ink">{title}</h2>
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
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

interface PageHeaderProps {
  title: string
  /** 제목 오른쪽 — 날짜·기간 등 */
  aside?: ReactNode
  /** 왼쪽 위 작은 글씨 (기본 노스팜CC) */
  kicker?: ReactNode
  /** 제목 줄 아래 — 탭·선택기 등 */
  children?: ReactNode
}

/** 화면 머리 — 종이 바탕, 아래 굵은 잉크 괘선 */
export function PageHeader({ title, aside, kicker = '노스팜CC', children }: PageHeaderProps) {
  return (
    <header className="bg-paper border-b-2 border-rule-2 px-4 pt-safe-top">
      <div className="max-w-lg mx-auto pt-5 pb-2">
        <p className="text-xs text-muted">{kicker}</p>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {aside}
        </div>
      </div>
      {children}
    </header>
  )
}
