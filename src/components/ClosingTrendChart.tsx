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

const OPTIONS = {
  responsive: true,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: { font: { size: 11 }, boxWidth: 12, padding: 10 },
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
    y: {
      type: 'linear' as const,
      position: 'left' as const,
      ticks: {
        callback: (v: any) => Number(v).toLocaleString(),
        font: { size: 10 },
        maxTicksLimit: 5,
      },
      grid: { color: 'rgba(0,0,0,0.05)' },
    },
    y2: {
      type: 'linear' as const,
      position: 'right' as const,
      min: -250,
      max: 100,
      ticks: {
        callback: (v: any) => `${v}%`,
        font: { size: 10 },
        maxTicksLimit: 7,
      },
      grid: { drawOnChartArea: false },
    },
  },
}

export default function ClosingTrendChart({ history, currentYear, currentMonth }: Props) {
  const chartData = useMemo(() => {
    const labels = history.map(
      h => `${h.year !== currentYear ? `${h.year % 100}년 ` : ''}${h.month}월`
    )
    const salesData        = history.map(h => h.sales_total)
    const foodRates        = history.map(h => h.sales_total > 0 ? calcClosing(h).food_cost_rate      : null)
    const laborRates       = history.map(h => h.sales_total > 0 ? calcClosing(h).labor_rate          : null)
    const manufacturingRates = history.map(h => h.sales_total > 0 ? calcClosing(h).manufacturing_rate : null)
    const profitRates      = history.map(h => h.sales_total > 0 ? calcClosing(h).profit_rate         : null)
    const bgColors         = history.map(h =>
      h.year === currentYear && h.month === currentMonth
        ? 'rgba(59, 130, 246, 0.85)'
        : 'rgba(59, 130, 246, 0.3)'
    )

    const lineBase = {
      type: 'line' as const,
      backgroundColor: 'transparent',
      yAxisID: 'y2',
      tension: 0.3,
      pointRadius: 4,
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
          borderRadius: 5,
          order: 2,
        },
        { ...lineBase, label: '식재비율(%)',   data: foodRates,           borderColor: '#F59E0B', pointBackgroundColor: '#F59E0B' },
        { ...lineBase, label: '인건비율(%)',   data: laborRates,          borderColor: '#8B5CF6', pointBackgroundColor: '#8B5CF6' },
        { ...lineBase, label: '제조경비율(%)', data: manufacturingRates,  borderColor: '#EF4444', pointBackgroundColor: '#EF4444' },
        { ...lineBase, label: '이익률(%)',     data: profitRates,         borderColor: '#10B981', pointBackgroundColor: '#10B981' },
      ],
    }
  }, [history, currentYear, currentMonth])

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <p className="text-xs font-bold text-gray-400 mb-3">📊 추세 분석</p>
      <Chart type="bar" data={chartData as any} options={OPTIONS} />
    </div>
  )
}
