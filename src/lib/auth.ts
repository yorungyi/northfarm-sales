import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

/**
 * 인증(Supabase Auth) 전용 래퍼.
 * 페이지 컴포넌트에서 supabase 클라이언트를 직접 호출하지 않도록 여기에만 모아둔다.
 */

/** 현재 세션 조회 — 로그인 안 되어 있으면 null */
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

/** 이메일/비밀번호 로그인 — 실패 시 throw */
export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (!data.session) throw new Error('세션을 생성하지 못했습니다.')
  return data.session
}

/**
 * 세션 변화 구독 (로그인·로그아웃·토큰 갱신).
 * 구독 해제 함수를 반환하므로 useEffect의 cleanup으로 그대로 사용 가능.
 */
export function subscribeAuthChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => {
    data.subscription.unsubscribe()
  }
}

/** 로그아웃 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
