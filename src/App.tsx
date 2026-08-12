import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import DashboardPage from './pages/DashboardPage'
import InputPage from './pages/InputPage'
import MonthlyPage from './pages/MonthlyPage'
import DetailPage from './pages/DetailPage'
import ClosingPage from './pages/ClosingPage'
import LoginPage from './pages/LoginPage'
import { getSession, subscribeAuthChange } from './lib/auth'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)

  // 앱 시작 시 세션 확인 + 이후 로그인/로그아웃 실시간 반영
  useEffect(() => {
    let mounted = true

    getSession()
      .then((s) => { if (mounted) setSession(s) })
      .catch(() => { if (mounted) setSession(null) })
      .finally(() => { if (mounted) setChecking(false) })

    const unsubscribe = subscribeAuthChange((s) => {
      if (!mounted) return
      setSession(s)
      setChecking(false)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  // 세션 확인 중 — 깜빡임 방지용 스피너
  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* /login 은 가드 예외 — 이미 로그인 상태면 대시보드로 */}
        <Route
          path="/login"
          element={session ? <Navigate to="/" replace /> : <LoginPage />}
        />

        {session ? (
          <>
            <Route path="/"             element={<DashboardPage />} />
            <Route path="/input"        element={<InputPage />} />
            <Route path="/monthly"      element={<MonthlyPage />} />
            <Route path="/detail/:date" element={<DetailPage />} />
            <Route path="/closing"      element={<ClosingPage />} />
            <Route path="*"             element={<Navigate to="/" replace />} />
          </>
        ) : (
          // 미로그인 — 모든 경로를 로그인 화면으로
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  )
}
