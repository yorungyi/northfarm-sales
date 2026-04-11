import { create } from 'zustand'
import { Venue } from '../types/sales'

interface SalesStore {
  selectedDate: string
  inputs: Record<Venue, number>        // 업장별 순매출
  guestCounts: Record<Venue, number>   // 업장별 내장객 수

  setSelectedDate: (date: string) => void
  setInput: (venue: Venue, value: number) => void
  resetInputs: () => void
  setGuestCount: (venue: Venue, count: number) => void
  resetGuestCounts: () => void
}

const defaultInputs: Record<Venue, number> = {
  [Venue.CLUBHOUSE]:  0,
  [Venue.STARTHOUSE]: 0,
  [Venue.EAST_SHADE]: 0,
  [Venue.WEST_SHADE]: 0,
}

const defaultGuestCounts: Record<Venue, number> = {
  [Venue.CLUBHOUSE]:  0,
  [Venue.STARTHOUSE]: 0,
  [Venue.EAST_SHADE]: 0,
  [Venue.WEST_SHADE]: 0,
}

function todayString(): string {
  return new Date().toLocaleDateString('sv-SE')
}

export const useSalesStore = create<SalesStore>((set) => ({
  selectedDate: todayString(),
  inputs: { ...defaultInputs },
  guestCounts: { ...defaultGuestCounts },

  setSelectedDate: (date) => set({ selectedDate: date }),

  setInput: (venue, value) =>
    set((state) => ({
      inputs: { ...state.inputs, [venue]: value },
    })),

  resetInputs: () => set({ inputs: { ...defaultInputs } }),

  setGuestCount: (venue, count) =>
    set((state) => ({
      guestCounts: { ...state.guestCounts, [venue]: count },
    })),

  resetGuestCounts: () => set({ guestCounts: { ...defaultGuestCounts } }),
}))
