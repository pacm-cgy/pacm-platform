import React from 'react'

// 전역 에러 바운더리 - 검은 화면 방지
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('React Error:', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', background: '#0F0E0A', color: '#F0EEE8', fontFamily: 'Pretendard, sans-serif', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>페이지 로딩 오류</h2>
          <p style={{ color: '#888', fontSize: '14px', maxWidth: '400px' }}>일시적인 오류가 발생했습니다.<br/>아래 버튼을 눌러 새로고침해주세요.</p>
          <button onClick={() => { if ('caches' in window) { caches.keys().then(k => Promise.all(k.map(c => caches.delete(c)))).then(() => window.location.reload()) } else { window.location.reload() } }}
            style={{ padding: '12px 24px', background: '#FB923C', border: 'none', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: 'pointer', borderRadius: '2px' }}>
            캐시 삭제 후 새로고침
          </button>
          <p style={{ color: '#555', fontSize: '12px' }}>{this.state.error?.message?.slice(0, 80)}</p>
        </div>
      )
    }
    return this.props.children
  }
}

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy, useEffect } from 'react'
import { HelmetProvider } from 'react-helmet-async'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import { useAuthStore, useThemeStore } from './store'
import './styles/global.css'

const HomePage      = lazy(() => import('./pages/HomePage'))
const InsightPage   = lazy(() => import('./pages/InsightPage'))
const StoryPage     = lazy(() => import('./pages/StoryPage'))
const TrendPage     = lazy(() => import('./pages/TrendPage'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const ConnectPage   = lazy(() => import('./pages/ConnectPage'))
const ArticlePage   = lazy(() => import('./pages/ArticlePage'))
const ProfilePage   = lazy(() => import('./pages/ProfilePage'))
const NotFoundPage  = lazy(() => import('./pages/NotFoundPage'))
const AdvertisePage  = lazy(() => import('./pages/AdvertisePage'))
const MessagesPage   = lazy(() => import('./pages/MessagesPage'))
const NewsPage      = lazy(() => import('./pages/NewsPage'))
const NewsDetailPage = lazy(() => import('./pages/NewsDetailPage'))
const PostDetailPage = lazy(() => import('./pages/PostDetailPage'))
const AboutPage      = lazy(() => import('./pages/AboutPage'))
const AdminPage      = lazy(() => import('./pages/AdminPage'))
const TermsPage       = lazy(() => import('./pages/TermsPage'))
const PrivacyPage     = lazy(() => import('./pages/PrivacyPage'))
const EduPage         = lazy(() => import('./pages/EduPage'))
const OfficePage      = lazy(() => import('./pages/OfficePage'))
const MagazinePage    = lazy(() => import('./pages/MagazinePage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error?.status === 401 || error?.status === 403) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
})

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '11px', color: '#C8982A', letterSpacing: '3px', animation: 'blink 1s ease infinite' }}>
        PACM · LOADING
        <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      </div>
    </div>
  )
}

function AppInit({ children }) {
  const { initialize } = useAuthStore()
  useEffect(() => { initialize() }, [initialize])
  return children
}

// 페이지 이동 시 항상 상단으로 스크롤
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  return null
}


export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ScrollToTop />
          <AppInit>
            <style>{`@keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
              @keyframes fadeIn { from{opacity:0} to{opacity:1} }
              @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
              @keyframes slideInRight { from{transform:translateX(100%)} to{transform:translateX(0)} }
            `}</style>
            <div className="app-layout">
              <Header />
              <div className="main-content-area">
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/"           element={<HomePage />} />
                      <Route path="/insight"    element={<InsightPage />} />
                      <Route path="/insight/:category" element={<InsightPage />} />
                      <Route path="/office" element={<OfficePage />} />
                      <Route path="/story"      element={<StoryPage />} />
                      <Route path="/trend"      element={<TrendPage />} />
                      <Route path="/community"         element={<CommunityPage />} />
                      <Route path="/community/:id"   element={<PostDetailPage />} />
                      <Route path="/news"        element={<NewsPage />} />
                      <Route path="/news/:slug"   element={<NewsDetailPage />} />
                      <Route path="/about"          element={<AboutPage />} />
                      <Route path="/admin"          element={<AdminPage />} />
                      <Route path="/terms"          element={<TermsPage />} />
                      <Route path="/privacy"         element={<PrivacyPage />} />
                      <Route path="/connect"    element={<ConnectPage />} />
                      <Route path="/article/:slug" element={<ArticlePage />} />
                      <Route path="/profile"    element={<ProfilePage />} />
                      <Route path="/profile/:id" element={<ProfilePage />} />
                      <Route path="/messages"   element={<MessagesPage />} />
                      <Route path="/advertise"  element={<AdvertisePage />} />
                      <Route path="/edu"        element={<EduPage />} />
                       <Route path="/magazine"   element={<MagazinePage />} />
                      <Route path="/404"        element={<NotFoundPage />} />
                      <Route path="*"           element={<Navigate to="/404" replace />} />
                    </Routes>
                  </Suspense>
              </div>
              <Footer />
            </div>
          </AppInit>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  )
}
