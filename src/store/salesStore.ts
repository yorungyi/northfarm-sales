import { create } from 'zustand'
import { Venue } from '../types/sales'

interface SalesStore {
  selectedDate: string
  inputs: Record<Venue, number>  // 업장별 순매출

  setSelectedDate: (date: string) => void
  setInput: (venue: Venue, value: number) => void
  resetInputs: () => void
}

const defaultInputs: Record<Venue, number> = {
  [Venue.CLUBHOUSE]:  0,
  [Venue.STARTHOUSE]: 0,
  [Venue.EAST_SHADE]: 0,
  [Venue.WEST_SHADE]: 0,
  [Venue.CLIENT]:     0,
}

function todayString(): string {
  return new Date().toLocaleDateString('sv-SE')
}

export const useSalesStore = create<SalesStore>((set) => ({
  selectedDate: todayString(),
  inputs: { ...defaultInputs },

  setSelectedDate: (date) => set({ selectedDate: date }),

  setInput: (venue, value) =>
    set((state) => ({
      inputs: { ...state.inputs, [venue]: value },
    })),

  resetInputs: () => set({ inputs: { ...defaultInputs } }),
}))
