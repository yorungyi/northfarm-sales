import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/',        label: '대시보드', icon: '📊' },
  { to: '/input',   label: '입력',     icon: '✏️' },
  { to: '/monthly', label: '월별',     icon: '📅' },
]

export default function BottomNav() {
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
          <span className="text-xl leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
