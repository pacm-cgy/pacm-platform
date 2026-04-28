import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  componentDidCatch(error, info) { console.error('React Error:', error, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, background:'#050505', color:'#F0F0F0', fontFamily:'Pretendard,sans-serif', padding:40, textAlign:'center' }}>
          <div style={{ fontSize:48 }}>⚠️</div>
          <h2 style={{ fontSize:20, fontWeight:700 }}>페이지 로딩 오류</h2>
          <p style={{ color:'#666', fontSize:14, maxWidth:400 }}>일시적인 오류가 발생했습니다.<br/>아래 버튼을 눌러 새로고침해주세요.</p>
          <button onClick={() => window.location.reload()}
            style={{ padding:'12px 24px', background:'#3B82F6', border:'none', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', borderRadius:8 }}>
            새로고침
          </button>
          <p style={{ color:'#333', fontSize:11 }}>{this.state.error?.message?.slice(0,100)}</p>
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
import { useAuthStore } from './store'
import './styles/global.css'

const HomePage       = lazy(() => import('./pages/HomePage'))
const InsightPage    = lazy(() => import('./pages/InsightPage'))
const StoryPage      = lazy(() => import('./pages/StoryPage'))
const TrendPage      = lazy(() => import('./pages/TrendPage'))
const CommunityPage  = lazy(() => import('./pages/CommunityPage'))
const ConnectPage    = lazy(() => import('./pages/ConnectPage'))
const ArticlePage    = lazy(() => import('./pages/ArticlePage'))
const ProfilePage    = lazy(() => import('./pages/ProfilePage'))
const NotFoundPage   = lazy(() => import('./pages/NotFoundPage'))
const AdvertisePage  = lazy(() => import('./pages/AdvertisePage'))
const MessagesPage   = lazy(() => import('./pages/MessagesPage'))
const NewsPage       = lazy(() => import('./pages/NewsPage'))
const NewsDetailPage = lazy(() => import('./pages/NewsDetailPage'))
const PostDetailPage = lazy(() => import('./pages/PostDetailPage'))
const AboutPage      = lazy(() => import('./pages/AboutPage'))
const AdminPage      = lazy(() => import('./pages/AdminPage'))
const TermsPage      = lazy(() => import('./pages/TermsPage'))
const PrivacyPage    = lazy(() => import('./pages/PrivacyPage'))
const EduPage        = lazy(() => import('./pages/EduPage'))
const OfficePage     = lazy(() => import('./pages/OfficePage'))
const MagazinePage   = lazy(() => import('./pages/MagazinePage'))
const LoginPage      = lazy(() => import('./pages/LoginPage'))
const MentorPage     = lazy(() => import('./pages/MentorPage'))
const IdeasPage      = lazy(() => import('./pages/IdeasPage'))
const EventsPage     = lazy(() => import('./pages/EventsPage'))

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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', flexDirection:'column', gap:16 }}>
      <div style={{ width:32, height:32, border:'2px solid rgba(59,130,246,0.2)', borderTop:'2px solid #3B82F6', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:'#3A3A3A', letterSpacing:'3px' }}>LOADING</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function AppInit({ children }) {
  const { initialize } = useAuthStore()
  useEffect(() => { initialize() }, [initialize])
  return children
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top:0, left:0, behavior:'instant' }) }, [pathname])
  return null
}

export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ErrorBoundary>
            <ScrollToTop />
            <AppInit>
              <div className="app-layout">
                <Header />
                <div className="main-content-area">
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/"                  element={<HomePage />} />
                      <Route path="/insight"           element={<InsightPage />} />
                      <Route path="/insight/:category" element={<InsightPage />} />
                      <Route path="/trend"             element={<TrendPage />} />
                      <Route path="/news"              element={<NewsPage />} />
                      <Route path="/news/:slug"        element={<NewsDetailPage />} />
                      <Route path="/community"         element={<CommunityPage />} />
                      <Route path="/community/:id"     element={<PostDetailPage />} />
                      <Route path="/mentor"            element={<MentorPage />} />
                      <Route path="/ideas"             element={<IdeasPage />} />
                      <Route path="/edu"               element={<EduPage />} />
                      <Route path="/events"            element={<EventsPage />} />
                      <Route path="/connect"           element={<ConnectPage />} />
                      <Route path="/article/:slug"     element={<ArticlePage />} />
                      <Route path="/profile"           element={<ProfilePage />} />
                      <Route path="/profile/:id"       element={<ProfilePage />} />
                      <Route path="/messages"          element={<MessagesPage />} />
                      <Route path="/story"             element={<StoryPage />} />
                      <Route path="/magazine"          element={<MagazinePage />} />
                      <Route path="/office"            element={<OfficePage />} />
                      <Route path="/advertise"         element={<AdvertisePage />} />
                      <Route path="/about"             element={<AboutPage />} />
                      <Route path="/admin"             element={<AdminPage />} />
                      <Route path="/terms"             element={<TermsPage />} />
                      <Route path="/privacy"           element={<PrivacyPage />} />
                      <Route path="/login"             element={<LoginPage />} />
                      <Route path="/signup"            element={<LoginPage />} />
                      <Route path="/404"               element={<NotFoundPage />} />
                      <Route path="*"                  element={<Navigate to="/404" replace />} />
                    </Routes>
                  </Suspense>
                </div>
                <Footer />
              </div>
            </AppInit>
          </ErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  )
}
