import { initSecurityGuards } from './lib/security'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.jsx'

// 테마 초기화 (깜빡임 방지)
const savedTheme = (() => {
  try { return JSON.parse(localStorage.getItem('insightship_theme'))?.state?.theme || 'dark' }
  catch { return 'dark' }
})()
document.documentElement.setAttribute('data-theme', savedTheme)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
