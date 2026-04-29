import { initSecurityGuards } from './lib/security'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.jsx'

// 보안 초기화
initSecurityGuards()

// 테마 초기화 (깜빡임 방지 — index.html에서 이미 설정되나 hydration 시 재확인)
const savedTheme = (() => {
  try { return JSON.parse(localStorage.getItem('insightship_theme'))?.state?.theme || 'dark' }
  catch { return 'dark' }
})()
document.documentElement.setAttribute('data-theme', savedTheme)

// React 앱 마운트
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
