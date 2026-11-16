import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPassword } from '../lib/auth'
import { BTN_FILLED_LG, INPUT } from '../lib/ledger'

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
    <div className="min-h-screen bg-paper text-ink flex flex-col justify-center px-4 pt-safe-top">
      <main className="w-full max-w-sm mx-auto">
        {/* 장부 한 장 — 위쪽 잉크 괘선, 그 안에 제목과 입력칸 */}
        <section aria-labelledby="login-title" className="bg-sheet border-t-2 border-ink px-4 pt-5 pb-6">
          <div className="border-b-2 border-rule-2 pb-3">
            <h1 id="login-title" className="text-xl font-semibold text-ink">노스팜CC 매출</h1>
            <p className="mt-1 text-sm text-muted">식음팀 매출 관리 시스템</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs text-muted mb-1.5">
                이메일
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={`${INPUT} w-full`}
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs text-muted mb-1.5">
                비밀번호
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                className={`${INPUT} w-full`}
              />
            </div>

            {/* 에러 메시지 — 장부 알림 모양 */}
            {error !== null && (
              <div role="alert" className="bg-paper-2 border-t-2 border-accent px-4 py-3">
                <p className="text-sm font-semibold text-accent">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={BTN_FILLED_LG}
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </section>

        <p className="mt-4 text-center text-xs text-muted">
          계정 문의는 관리자에게 요청해주세요.
        </p>
      </main>
    </div>
  )
}
