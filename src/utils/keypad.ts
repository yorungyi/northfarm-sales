/**
 * 화면 숫자 키패드 — 키 하나를 눌렀을 때 금액이 어떻게 바뀌는지만 계산하는 순수 함수.
 * 입력 화면(단계형)이 이 결과를 store의 setInput으로 넘긴다.
 */

export type KeypadKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '0' | 'back'

/** 키패드 배열 — 1~9, 00, 0, 지움 */
export const KEYPAD_KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back']

/** 금액 최대 자릿수 — 하루 한 업장 매출로 충분하고 Number 정밀도 안에 머문다 (999억 원 미만) */
export const KEYPAD_MAX_DIGITS = 11

/**
 * 현재 금액(원)에 키 하나를 적용한 새 금액.
 * - 숫자·00: 뒤에 붙인다 (0일 때 0·00은 그대로 0)
 * - back(지움): 맨 끝 한 자리를 지운다
 * - 최대 자릿수를 넘기면 그대로 둔다
 */
export function applyKeypadKey(current: number, key: KeypadKey): number {
  const digits = current > 0 ? String(Math.floor(current)) : ''
  if (key === 'back') {
    const next = digits.slice(0, -1)
    return next === '' ? 0 : Number(next)
  }
  const next = digits + key
  const trimmed = next.replace(/^0+/, '')
  if (trimmed === '') return 0
  if (trimmed.length > KEYPAD_MAX_DIGITS) return current
  return Number(trimmed)
}
