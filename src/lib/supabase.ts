import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('.env.local에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정해주세요.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
