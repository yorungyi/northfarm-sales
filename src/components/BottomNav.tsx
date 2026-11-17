import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth'

/** 탭 아이콘 — 시안(.hallmark/storyboard.html)의 선 아이콘 경로를 그대로 쓴다 */
function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// 탭 — 아이콘 + 글자. 현재 탭은 초록 글자·굵게
const tabs = [
  { to: '/',         label: '홈',     icon: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" /> },
  { to: '/input',    label: '입력',   icon: <path d="M4 20h4L19 9l-4-4L4 16v4z" /> },
  {
    to: '/monthly',
    label: '월별',
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
  },
  { to: '/closing',  label: '가마감', icon: <path d="M6 3h9l3 3v15H6z M9 11h6M9 15h6" /> },
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
    <nav aria-label="주 메뉴" className="fixed bottom-0 left-0 right-0 bg-sheet border-t border-rule flex z-40">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 text-xs min-h-[56px] transition-colors ${
              isActive
                ? 'text-brand-ink font-bold'
                : 'text-muted font-medium hover:text-ink'
            }`
          }
        >
          <TabIcon>{tab.icon}</TabIcon>
          {tab.label}
        </NavLink>
      ))}

      {/* 로그아웃 — 탭이 아닌 보조 동작이라 좁은 아이콘 버튼으로 우측에 배치 */}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        aria-label="로그아웃"
        title="로그아웃"
        className="shrink-0 w-12 min-h-[56px] flex items-center justify-center text-muted hover:text-ink transition-colors disabled:opacity-55 disabled:cursor-not-allowed"
      >
        <TabIcon>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </TabIcon>
      </button>
    </nav>
  )
}
