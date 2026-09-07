import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// 서비스워커 갱신.
// 이 import 가 없으면 vite-plugin-pwa 가 '등록만 하는' registerSW.js 를 끼워넣는다.
// 그 경우 새 배포를 받아도 이미 열려 있는 화면은 옛 번들 그대로라, 요한이 새로고침을
// 두 번 하기 전까지 갱신이 안 보인다. registerType:'autoUpdate' 와 짝을 맞춰
// 새 버전을 발견하면 스스로 교체하고 새로고침하게 한다.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // 홈 화면에 설치한 앱은 한 번 켜두면 다시 로드되지 않는다.
    // 화면이 다시 보일 때·네트워크가 돌아올 때마다 새 배포가 있는지 확인한다.
    const checkForUpdate = () => {
      if (document.visibilityState !== 'visible') return
      registration.update().catch(() => { /* 오프라인 — 다음 기회에 */ })
    }
    document.addEventListener('visibilitychange', checkForUpdate)
    window.addEventListener('online', checkForUpdate)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
