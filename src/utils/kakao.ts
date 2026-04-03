import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'
import { formatDate, formatCurrency } from './format'

/** 카카오 보고용 텍스트 생성 */
export function generateKakaoReport(date: string, salesMap: Partial<Record<Venue, DailySales>>): string {
  const dateLabel = formatDate(date)

  let totalFood = 0
  let totalStore = 0
  let totalAll = 0

  const lines: string[] = []

  for (const venue of VENUES) {
    const s = salesMap[venue]
    const food = s?.food_sales ?? 0
    const store = s?.store_sales ?? 0
    const total = food + store
    totalFood += food
    totalStore += store
    totalAll += total

    lines.push(`[${venue}]`)
    lines.push(`  식료: ${formatCurrency(food)}`)
    lines.push(`  매점: ${formatCurrency(store)}`)
    lines.push(`  합계: ${formatCurrency(total)}`)
  }

  const header = `📊 ${dateLabel} 매출 보고`
  const separator = '─'.repeat(20)
  const footer = [
    separator,
    `▶ 전체 합계`,
    `  식료: ${formatCurrency(totalFood)}`,
    `  매점: ${formatCurrency(totalStore)}`,
    `  총계: ${formatCurrency(totalAll)}`,
  ].join('\n')

  return [header, separator, ...lines, footer].join('\n')
}
