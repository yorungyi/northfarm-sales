import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPassword } from '../lib/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    // 빈 값 방어
    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 모두 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await signInWithPassword(email.trim(), password)
      navigate('/', { replace: true })
    } catch {
      // 계정 존재 여부를 노출하지 않도록 동일한 메시지로 통일
      setError('이메일 또는 비밀번호가 올바르지 않습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center px-4 pt-safe-top">
      <div className="w-full max-w-sm mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">노스팜CC 매출</h1>
          <p className="mt-1 text-sm text-gray-400">식음팀 매출 관리 시스템</p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="login-email" className="block text-xs font-bold text-gray-400 mb-1.5">
                이메일
              </label>
              <input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full py-3 px-4 rounded-xl border border-gray-200 text-base text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-bold text-gray-400 mb-1.5">
                비밀번호
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                className="w-full py-3 px-4 rounded-xl border border-gray-200 text-base text-gray-800 placeholder-gray-300 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>

            {/* 에러 메시지 */}
            {error !== null && (
              <p className="text-sm text-red-500 font-medium bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-base shadow active:scale-95 transition-transform disabled:opacity-50"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-300">
          계정 문의는 관리자에게 요청해주세요.
        </p>
      </div>
    </div>
  )
}
