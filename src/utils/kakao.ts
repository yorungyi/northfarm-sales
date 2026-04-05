import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'
import { formatDate, formatCurrency } from './format'

export function generateKakaoReport(date: string, salesMap: Partial<Record<Venue, DailySales>>): string {
  const dateLabel = formatDate(date)
  let total = 0

  const lines = VENUES.map((venue) => {
    const net = salesMap[venue]?.total_sales ?? 0
    total += net
    return `${venue}: ${formatCurrency(net)}`
  })

  return [
    `📊 ${dateLabel} 매출 보고`,
    '─'.repeat(22),
    ...lines,
    '─'.repeat(22),
    `합계: ${formatCurrency(total)}`,
  ].join('\n')
}
