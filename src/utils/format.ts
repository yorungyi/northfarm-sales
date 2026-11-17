/** 숫자를 천 단위 콤마 + 원 포맷으로 변환 (예: 1234567 → "1,234,567원") */
export function formatCurrency(value: number): string {
  return value.toLocaleString('ko-KR') + '원'
}

/** 숫자를 천 단위 콤마만 적용 (입력 필드 표시용) */
export function formatNumber(value: number): string {
  if (value === 0) return ''
  return value.toLocaleString('ko-KR')
}

/** 콤마 제거 후 숫자 파싱 */
export function parseNumber(value: string): number {
  const cleaned = value.replace(/,/g, '')
  const parsed = parseInt(cleaned, 10)
  return isNaN(parsed) ? 0 : parsed
}

/** 날짜 포맷: YYYY-MM-DD → YYYY년 M월 D일 (요일) */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const dow = days[date.getDay()]
  return `${year}년 ${month}월 ${day}일 (${dow})`
}

/** Date 객체를 YYYY-MM-DD 문자열로 변환 */
export function toDateString(date: Date): string {
  return date.toLocaleDateString('sv-SE')
}

/** 전월 대비 변화율 계산 (%) */
export function calcChangeRate(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/**
 * 큰 금액을 억·만 단위로 짧게 (화면의 주인공 숫자용). 만원 미만은 반올림한다.
 * 예: 128,452,300 → "1억 2,845만원", 100,000,000 → "1억원", 5,120,000 → "512만원"
 * 1만원 미만(0 포함)은 원 단위 그대로 쓴다.
 */
export function formatKoreanWon(won: number): string {
  if (Math.abs(won) < 10000) return formatCurrency(won)
  const sign = won < 0 ? '-' : ''
  const man = Math.round(Math.abs(won) / 10000)
  const eok = Math.floor(man / 10000)
  const rest = man % 10000
  if (eok === 0) return `${sign}${rest.toLocaleString('ko-KR')}만원`
  if (rest === 0) return `${sign}${eok.toLocaleString('ko-KR')}억원`
  return `${sign}${eok.toLocaleString('ko-KR')}억 ${rest.toLocaleString('ko-KR')}만원`
}
