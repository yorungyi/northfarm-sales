export interface MonthlyClosing {
  id: string
  year: number
  month: number
  sales_total: number        // 매출 합계 (천원)
  food_cost: number          // 식재료비 (천원)
  labor_direct: number       // 직영 인건비 (천원)
  labor_dispatch: number     // 파견 인건비 (천원)
  labor_support: number      // 지원 인건비 (천원)
  manufacturing_cost: number // 제조경비 (천원)
  created_at: string
  updated_at: string
}

/** 자동 계산 항목 */
export interface ClosingCalc {
  food_cost_rate: number         // 원가율 %
  labor_total: number            // 인건비 합계
  labor_rate: number             // 인건비율 %
  manufacturing_rate: number     // 제조경비율 %
  profit: number                 // 예상이익
  profit_rate: number            // 이익률 %
}

export function calcClosing(c: Omit<MonthlyClosing, 'id' | 'created_at' | 'updated_at'>): ClosingCalc {
  const labor_total = c.labor_direct + c.labor_dispatch + c.labor_support
  const profit = c.sales_total - c.food_cost - labor_total - c.manufacturing_cost
  const safe = (n: number) => c.sales_total > 0 ? Math.round((n / c.sales_total) * 1000) / 10 : 0

  return {
    food_cost_rate: safe(c.food_cost),
    labor_total,
    labor_rate: safe(labor_total),
    manufacturing_rate: safe(c.manufacturing_cost),
    profit,
    profit_rate: safe(profit),
  }
}
