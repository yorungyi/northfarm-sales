/**
 * 1안(클리어) 공용 값 — 모든 화면이 같은 버튼·카드·견본색·증감 표기·차트 색을 쓰도록 한 곳에 모은다.
 * 파일 이름은 장부 체계 때 이름(ledger)을 그대로 둔다 — import 경로를 바꾸지 않기 위함.
 * 색은 src/styles/tokens.css 토큰만 쓴다 (여기서 색 값을 새로 만들지 않는다).
 */
import type { ChartOptions } from 'chart.js'
import { Venue } from '../types/sales'

// 업장별 견본색 — 초록 명도 3단계 + 회색 2단계 (--color-series-*). 글자에는 쓰지 않고 견본·띠그래프·막대에만 쓴다
export const VENUE_SWATCH: Record<Venue, string> = {
  [Venue.CLUBHOUSE]:  'bg-series-1',
  [Venue.STARTHOUSE]: 'bg-series-2',
  [Venue.EAST_SHADE]: 'bg-series-3',
  [Venue.WEST_SHADE]: 'bg-series-4',
  [Venue.CLIENT]:     'bg-series-5',
}

/** 업장별 계열 토큰 이름 (차트용) */
export const VENUE_SERIES_TOKEN: Record<Venue, string> = {
  [Venue.CLUBHOUSE]:  '--color-series-1',
  [Venue.STARTHOUSE]: '--color-series-2',
  [Venue.EAST_SHADE]: '--color-series-3',
  [Venue.WEST_SHADE]: '--color-series-4',
  [Venue.CLIENT]:     '--color-series-5',
}

/** 보조 버튼 — 회색 면 (이름은 장부 체계 때 그대로: 외곽선 → 회색 면으로 바뀜). 높이 44px */
export const BTN_OUTLINE =
  'shrink-0 inline-flex items-center justify-center gap-1 h-11 px-4 text-sm font-semibold rounded-[14px] bg-paper-3 text-ink hover:bg-rule-2/60 active:bg-rule-2 transition-colors disabled:opacity-55 disabled:cursor-not-allowed'
/** 주 버튼 — 초록 채움 (한 화면에 하나). 높이 44px */
export const BTN_FILLED =
  'shrink-0 inline-flex items-center justify-center gap-1 h-11 px-4 text-sm font-bold rounded-[14px] bg-brand text-sheet hover:bg-brand-ink active:bg-brand-ink transition-colors disabled:opacity-55 disabled:cursor-not-allowed'
/** 큰 주 버튼 — 저장처럼 화면 하단의 단독 동작 (높이 48px) */
export const BTN_FILLED_LG =
  'w-full inline-flex items-center justify-center h-12 px-4 text-base font-bold rounded-[14px] bg-brand text-sheet hover:bg-brand-ink active:bg-brand-ink transition-colors disabled:opacity-55 disabled:cursor-not-allowed'
/** 입력칸 — 흰 면, 둥근 12px, 16px 글자(모바일 확대 방지), 포커스 시 초록 테두리. 숫자는 num 클래스를 함께 쓴다 */
export const INPUT =
  'field-focus h-11 px-3 text-base bg-sheet text-ink border border-control rounded-[12px] placeholder:text-muted transition-[border-color,box-shadow] disabled:opacity-55 disabled:cursor-not-allowed'

/** 카드 — 흰 면, 둥근 18px, 그림자·테두리 없음. 카드 안에 카드를 넣지 않는다 */
export const CARD = 'bg-sheet rounded-[18px] px-4 py-4'

/** 알림 카드 — 연한 빨강 면. 제목은 text-accent-ink, 본문은 text-ink-2 */
export const ALERT = 'bg-accent-soft rounded-[18px] px-4 py-3'

/** 칩 — 좋은 증감(초록) / 나쁜 증감·경고(빨강) / 중립(회색) */
export const CHIP_GOOD = 'inline-flex items-center gap-1 rounded-full bg-brand-soft text-brand-ink px-2.5 py-0.5 text-sm font-semibold'
export const CHIP_BAD = 'inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent-ink px-2.5 py-0.5 text-sm font-semibold'
export const CHIP_NEUTRAL = 'inline-flex items-center gap-1 rounded-full bg-paper-3 text-ink-2 px-2.5 py-0.5 text-sm font-semibold'

/** 증감률 칩 — 감소만 빨강, 그 외(증가·0)는 초록 */
export function deltaChip(rate: number): string {
  return rate < 0 ? CHIP_BAD : CHIP_GOOD
}

/** 증감률 표기 — 증가는 +, 감소는 회계장부식 △ */
export function formatDelta(rate: number): string {
  return rate >= 0 ? `+${rate}%` : `△${Math.abs(rate)}%`
}

/**
 * CSS 토큰 값을 캔버스가 확실히 읽는 rgb 문자열로 바꾼다.
 * 토큰은 oklch로 정의돼 있는데 Chart.js의 색 파서는 oklch를 모를 수 있어 1px 캔버스로 변환한다.
 */
export function tokenColor(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (raw === '' || ctx === null) return raw
  ctx.fillStyle = raw
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

/** 차트에 쓰는 토큰 묶음 */
export interface ChartTokens {
  bar: string      // 기본 막대 (회색)
  strong: string   // 강조 막대 (주말 등, 연한 초록)
  mark: string     // 지목하는 한 막대 (브랜드 초록)
  ink: string
  grid: string
  tick: string
  font: string
}

export function readChartTokens(): ChartTokens {
  return {
    bar: tokenColor('--color-series-4'),
    strong: tokenColor('--color-series-2'),
    mark: tokenColor('--color-brand'),
    ink: tokenColor('--color-ink'),
    grid: tokenColor('--color-rule'),
    tick: tokenColor('--color-muted'),
    font: getComputedStyle(document.documentElement).getPropertyValue('--font-outlier').trim(),
  }
}

/** 만원 단위 막대 차트 공통 옵션 */
export function barOptions(t: ChartTokens): ChartOptions<'bar'> {
  const ticks = { font: { size: 11, family: t.font }, color: t.tick }
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${Number(ctx.raw).toLocaleString()}만원`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: t.grid },
        ticks,
      },
      y: {
        grid: { color: t.grid },
        border: { display: false },
        ticks: { ...ticks, callback: (v) => `${v}만` },
      },
    },
  }
}
