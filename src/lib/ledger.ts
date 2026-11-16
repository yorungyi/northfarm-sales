/**
 * 장부 디자인 공용 값 — 모든 화면이 같은 버튼·견본색·증감 표기·차트 색을 쓰도록 한 곳에 모은다.
 * 색은 src/styles/tokens.css 토큰만 쓴다 (여기서 색 값을 새로 만들지 않는다).
 */
import type { ChartOptions } from 'chart.js'
import { Venue } from '../types/sales'

// 업장별 견본색 — 잉크 명도 단계 (--color-series-*). 글자에는 쓰지 않고 견본·띠그래프·막대에만 쓴다
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

/** 보조 버튼 — 잉크 외곽선 */
export const BTN_OUTLINE =
  'shrink-0 h-9 px-3 text-sm font-medium rounded-[2px] border border-ink text-ink hover:bg-paper-2 active:bg-paper-3 transition-colors disabled:opacity-55 disabled:cursor-not-allowed'
/** 주 버튼 — 잉크 채움 (한 화면에 하나) */
export const BTN_FILLED =
  'shrink-0 h-9 px-3 text-sm font-medium rounded-[2px] border border-ink bg-ink text-sheet hover:bg-ink-2 transition-colors disabled:opacity-55 disabled:cursor-not-allowed'
/** 큰 주 버튼 — 저장처럼 화면 하단의 단독 동작 (높이 44px) */
export const BTN_FILLED_LG =
  'w-full h-11 px-4 text-base font-semibold rounded-[2px] border border-ink bg-ink text-sheet hover:bg-ink-2 transition-colors disabled:opacity-55 disabled:cursor-not-allowed'
/** 입력칸 — 각진 1px 테두리, 16px 글자(모바일 확대 방지), 숫자는 num 클래스를 함께 쓴다 */
export const INPUT =
  'h-10 px-3 text-base bg-sheet text-ink border border-muted rounded-[2px] placeholder:text-muted focus-visible:outline-offset-[-2px] disabled:opacity-55 disabled:cursor-not-allowed'

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
  bar: string      // 기본 막대
  strong: string   // 강조 막대 (주말 등)
  mark: string     // 지목하는 한 점 (빨간 펜)
  ink: string
  grid: string
  tick: string
  font: string
}

export function readChartTokens(): ChartTokens {
  return {
    bar: tokenColor('--color-series-4'),
    strong: tokenColor('--color-series-2'),
    mark: tokenColor('--color-accent'),
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
