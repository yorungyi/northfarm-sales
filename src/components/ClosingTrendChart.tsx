import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  BarController,
  LineController,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import type { MonthlyClosing } from '../types/closing'
import { calcClosing } from '../types/closing'
import { SectionHead } from './Ledger'
import { readChartTokens, tokenColor } from '../lib/ledger'

// 믹스드 차트(bar+line)에 필요한 컨트롤러까지 명시적 등록
// Vite 트리쉐이킹이 react-chartjs-2의 사이드이펙트를 제거할 수 있으므로 직접 등록
ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, LineElement, PointElement,
  Tooltip, Legend,
  BarController, LineController,
)

// chart.js tick/tooltip 콜백은 any 타입 — 라이브러리 제약
/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  history: MonthlyClosing[]
  currentYear: number
  currentMonth: number
}

/** 차트 색 — 토큰에서 한 번 읽는다 (원가 3계열은 잉크·회색 명도 + 점선 무늬, 이익률만 브랜드 초록) */
interface TrendColors {
  barBase: string     // 지난 달 매출 막대
  barCurrent: string  // 선택한 달 매출 막대
  food: string
  labor: string
  manufacturing: string
  profit: string
}

function readTrendColors(): TrendColors {
  return {
    barBase: tokenColor('--color-series-5'),
    barCurrent: tokenColor('--color-series-3'),
    food: tokenColor('--color-ink'),
    labor: tokenColor('--color-muted'),
    manufacturing: tokenColor('--color-series-4'),
    profit: tokenColor('--color-brand'),
  }
}

export default function ClosingTrendChart({ history, currentYear, currentMonth }: Props) {
  // 토큰 값은 화면 수명 동안 바뀌지 않으므로 한 번만 읽는다
  const tokens = useMemo(() => readChartTokens(), [])
  const colors = useMemo(() => readTrendColors(), [])

  // 축·범례 공통 글꼴 — 본문 글꼴, 라벨 보조 잉크색
  const options = useMemo(() => {
    const font = { size: 11, family: tokens.font }
    return {
      responsive: true,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { font, color: tokens.tick, boxWidth: 16, boxHeight: 8, padding: 10 },
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              if (ctx.raw === null || ctx.raw === undefined) return ''
              if (ctx.datasetIndex === 0) return ` 매출: ${Number(ctx.raw).toLocaleString()}천원`
              return ` ${ctx.dataset.label}: ${Number(ctx.raw).toFixed(1)}%`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: tokens.grid },
          ticks: { font, color: tokens.tick },
        },
        y: {
          type: 'linear' as const,
          position: 'left' as const,
          ticks: {
            callback: (v: any) => Number(v).toLocaleString(),
            font: { ...font, size: 10 },
            color: tokens.tick,
            maxTicksLimit: 5,
          },
          grid: { color: tokens.grid },
          border: { display: false },
        },
        y2: {
          type: 'linear' as const,
          position: 'right' as const,
          ticks: {
            callback: (v: any) => `${v}%`,
            font: { ...font, size: 10 },
            color: tokens.tick,
            maxTicksLimit: 5,
          },
          grid: { drawOnChartArea: false },
          border: { display: false },
        },
      },
    }
  }, [tokens])

  const chartData = useMemo(() => {
    const labels = history.map(
      h => `${h.year !== currentYear ? `${h.year % 100}년 ` : ''}${h.month}월`
    )
    const salesData        = history.map(h => h.sales_total)
    const foodRates        = history.map(h => h.sales_total > 0 ? calcClosing(h).food_cost_rate      : null)
    const laborRates       = history.map(h => h.sales_total > 0 ? calcClosing(h).labor_rate          : null)
    const manufacturingRates = history.map(h => h.sales_total > 0 ? calcClosing(h).manufacturing_rate : null)
    const profitRates      = history.map(h => h.sales_total > 0 ? calcClosing(h).profit_rate         : null)
    // 선택한 달 막대만 한 단계 짙게
    const bgColors         = history.map(h =>
      h.year === currentYear && h.month === currentMonth
        ? colors.barCurrent
        : colors.barBase
    )

    // 선 공통 — 2px, 꺾은선 그대로(곡선 보정 없음)
    const lineBase = {
      type: 'line' as const,
      backgroundColor: 'transparent',
      yAxisID: 'y2',
      borderWidth: 2,
      tension: 0,
      pointRadius: 3,
      spanGaps: true,
      order: 1,
    }

    return {
      labels,
      datasets: [
        {
          type: 'bar' as const,
          label: '매출(천원)',
          data: salesData,
          backgroundColor: bgColors,
          yAxisID: 'y',
          borderRadius: 4,
          maxBarThickness: 24,
          order: 2,
        },
        // 원가 3계열 — 잉크·회색 명도와 점선 무늬로 구분 (색만으로 구분하지 않는다)
        { ...lineBase, label: '식재비율(%)',   data: foodRates,          borderColor: colors.food,          pointBackgroundColor: colors.food,          borderDash: [] },
        { ...lineBase, label: '인건비율(%)',   data: laborRates,         borderColor: colors.labor,         pointBackgroundColor: colors.labor,         borderDash: [6, 3] },
        { ...lineBase, label: '제조경비율(%)', data: manufacturingRates, borderColor: colors.manufacturing, pointBackgroundColor: colors.manufacturing, borderDash: [2, 3] },
        // 이익률 — 화면이 지목하는 한 계열, 브랜드 초록
        { ...lineBase, label: '이익률(%)',     data: profitRates,        borderColor: colors.profit,        pointBackgroundColor: colors.profit,        borderDash: [] },
      ],
    }
  }, [history, currentYear, currentMonth, colors])

  return (
    <section aria-labelledby="closing-trend-title">
      <SectionHead id="closing-trend-title" title="추세 분석" />
      <div className="mt-3">
        <Chart type="bar" data={chartData as any} options={options as any} />
      </div>
    </section>
  )
}
