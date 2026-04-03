import { create } from 'zustand'
import type { DailySales } from '../types/sales'
import { Venue } from '../types/sales'

interface VenueInput {
  food_sales: number
  store_sales: number
}

interface SalesStore {
  // 현재 선택된 날짜
  selectedDate: string

  // 입력 폼 상태 (업장별)
  inputs: Record<Venue, VenueInput>

  // 조회된 데이터
  dailySalesMap: Record<Venue, DailySales | null>

  // 액션
  setSelectedDate: (date: string) => void
  setInput: (venue: Venue, field: 'food_sales' | 'store_sales', value: number) => void
  setDailySales: (venue: Venue, data: DailySales | null) => void
  resetInputs: () => void
}

const defaultVenueInput: VenueInput = { food_sales: 0, store_sales: 0 }

const defaultInputs: Record<Venue, VenueInput> = {
  [Venue.CLUBHOUSE]:  { ...defaultVenueInput },
  [Venue.STARTHOUSE]: { ...defaultVenueInput },
  [Venue.EAST_SHADE]: { ...defaultVenueInput },
  [Venue.WEST_SHADE]: { ...defaultVenueInput },
}

const defaultDailySalesMap: Record<Venue, DailySales | null> = {
  [Venue.CLUBHOUSE]:  null,
  [Venue.STARTHOUSE]: null,
  [Venue.EAST_SHADE]: null,
  [Venue.WEST_SHADE]: null,
}

function todayString(): string {
  return new Date().toLocaleDateString('sv-SE') // 'YYYY-MM-DD'
}

export const useSalesStore = create<SalesStore>((set) => ({
  selectedDate: todayString(),
  inputs: { ...defaultInputs },
  dailySalesMap: { ...defaultDailySalesMap },

  setSelectedDate: (date) => set({ selectedDate: date }),

  setInput: (venue, field, value) =>
    set((state) => ({
      inputs: {
        ...state.inputs,
        [venue]: { ...state.inputs[venue], [field]: value },
      },
    })),

  setDailySales: (venue, data) =>
    set((state) => ({
      dailySalesMap: { ...state.dailySalesMap, [venue]: data },
    })),

  resetInputs: () => set({ inputs: { ...defaultInputs } }),
}))
