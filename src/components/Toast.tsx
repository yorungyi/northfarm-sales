import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error'
  onClose: () => void
}

export default function Toast({ message, type, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, 2500)
    return () => clearTimeout(timer)
  }, [onClose])

  // 성공은 잉크, 실패는 빨간 펜 — 각진 모서리, 그림자 없음
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-[2px] text-sm font-medium transition-[opacity,transform] duration-300 motion-reduce:transition-none ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      } ${type === 'success' ? 'bg-ink text-sheet' : 'bg-accent text-accent-ink'}`}
    >
      {message}
    </div>
  )
}
