/**
 * CSV 다운로드 공통 유틸.
 * 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 앞에 붙인다.
 */

/** CSV 셀 이스케이프 — 콤마·따옴표·개행이 있으면 큰따옴표로 감싼다 */
function escapeCell(value: string | number): string {
  const s = String(value ?? '')
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * 헤더 + 데이터 행을 CSV 파일로 즉시 다운로드
 * @param filename 확장자 포함 파일명 (예: 노스팜CC_매출_2026년4월.csv)
 * @param headers  1행 헤더
 * @param rows     데이터 행 배열
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','))
  const BOM = '\uFEFF' // 엑셀 한글 깨짐 방지
  const csv = BOM + lines.join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } finally {
    // 즉시 해제하면 Firefox·구형 Safari에서 다운로드가 취소될 수 있어 지연 해제
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
