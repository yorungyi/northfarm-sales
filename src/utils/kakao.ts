import type { DailySales } from '../types/sales'
import { Venue, VENUES } from '../types/sales'

// 업장별 이모지
const VENUE_EMOJI: Record<Venue, string> = {
  [Venue.CLUBHOUSE]:  '🏌',
  [Venue.STARTHOUSE]: '⛳',
  [Venue.EAST_SHADE]: '🌿',
  [Venue.WEST_SHADE]: '🌲',
}

// "4/6(일)" 형태 단축 날짜
function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`
}

// 전일 대비 변화율 문자열 (없으면 빈 문자열)
function changeStr(cur: number, prev: number | undefined): string {
  if (!prev || prev === 0) return ''
  const rate = Math.round(((cur - prev) / prev) * 100)
  return rate >= 0 ? `  ↑${rate}%` : `  ↓${Math.abs(rate)}%`
}

// 오른쪽 정렬 패딩 (한글 포함 고려 — 고정폭 아님이지만 카톡 고정폭 폰트 기준)
function rpad(s: string, len: number): string {
  return s + ' '.repeat(Math.max(0, len - s.length))
}

export interface KakaoReportOptions {
  salesMap: Partial<Record<Venue, DailySales>>
  prevMap?: Partial<Record<Venue, DailySales>>   // 전일 데이터 (선택)
  monthTotal?: number                             // 월 누적 합계 원 단위 (선택)
  selMonth?: number                               // 해당 월 (선택, 누적 표시용)
  memos?: Record<Venue, string>                   // 업장별 비고 (선택)
}

export function generateKakaoReport(date: string, options: KakaoReportOptions): string {
  const { salesMap, prevMap = {}, monthTotal, selMonth, memos = {} as Record<Venue, string> } = options

  let total = 0
  const venueLines: string[] = []

  for (const venue of VENUES) {
    const net = salesMap[venue]?.total_sales ?? 0
    const prevNet = prevMap[venue]?.total_sales
    total += net

    const netK = Math.round(net / 1000)
    const emoji = VENUE_EMOJI[venue]
    const change = changeStr(net, prevNet)
    venueLines.push(`${emoji} ${rpad(venue, 8)}  ${netK.toLocaleString()}천원${change}`)

    // 비고가 있으면 바로 아래 줄에 추가
    const memo = memos[venue]?.trim()
    if (memo) {
      venueLines.push(`   📝 ${memo}`)
    }
  }

  const totalK = Math.round(total / 1000)
  const lines = [
    `📊 [노스팜CC] ${shortDate(date)} 매출 보고`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ...venueLines,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💰 합   계      ${totalK.toLocaleString()}천원`,
  ]

  // 월 누적이 있을 때만 추가
  if (monthTotal !== undefined && selMonth !== undefined) {
    const monthK = Math.round(monthTotal / 1000)
    lines.push(`📈 ${selMonth}월 누적    ${monthK.toLocaleString()}천원`)
  }

  return lines.join('\n')
}
