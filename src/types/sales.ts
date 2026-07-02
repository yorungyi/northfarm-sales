export const Venue = {
  CLUBHOUSE:  '클럽하우스',
  STARTHOUSE: '스타트하우스',
  EAST_SHADE: '동그늘집',
  WEST_SHADE: '서그늘집',
  CLIENT:     '고객사이용',
} as const

export type Venue = (typeof Venue)[keyof typeof Venue]

export const VENUES: Venue[] = [
  Venue.CLUBHOUSE,
  Venue.STARTHOUSE,
  Venue.EAST_SHADE,
  Venue.WEST_SHADE,
  Venue.CLIENT,
]

export interface DailySales {
  id: string
  sale_date: string        // 'YYYY-MM-DD'
  venue: Venue
  food_sales: number
  store_sales: number
  total_sales: number      // generated: food_sales + store_sales
  created_at: string
}
