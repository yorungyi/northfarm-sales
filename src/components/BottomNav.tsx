import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth'

const tabs = [
  { to: '/',         label: '대시보드', icon: '📊' },
  { to: '/input',    label: '입력',     icon: '✏️' },
  { to: '/monthly',  label: '월별',     icon: '📅' },
  { to: '/closing',  label: '가마감',   icon: '💰' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    if (signingOut) return
    if (!window.confirm('로그아웃 할까요?')) return
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      // 서버 로그아웃 실패해도 로그인 화면으로 보낸다
    } finally {
      setSigningOut(false)
      navigate('/login', { replace: true })
    }
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors min-h-[56px] ${
              isActive ? 'text-blue-600' : 'text-gray-400'
            }`
          }
        >
          <span className="text-lg leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}

      {/* 로그아웃 — 탭이 아닌 보조 액션이라 좁은 아이콘 버튼으로 우측에 배치 */}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        aria-label="로그아웃"
        title="로그아웃"
        className="shrink-0 w-11 min-h-[56px] flex items-center justify-center border-l border-gray-100 text-gray-300 active:text-gray-500 active:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </nav>
  )
}
