import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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
const NewsPage      = lazy(() => import('./pages/NewsPage'))
const NewsDetailPage = lazy(() => import('./pages/NewsDetailPage'))
const AboutPage      = lazy(() => import('./pages/AboutPage'))
const AdminPage      = lazy(() => import('./pages/AdminPage'))
const TermsPage       = lazy(() => import('./pages/TermsPage'))
const PrivacyPage     = lazy(() => import('./pages/PrivacyPage'))

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

export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppInit>
            <style>{`@keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
              @keyframes fadeIn { from{opacity:0} to{opacity:1} }
              @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
              @keyframes slideInRight { from{transform:translateX(100%)} to{transform:translateX(0)} }
            `}</style>
            <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
              <Header />
              <main style={{ flex: 1 }}>
                <div className="container">
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/"           element={<HomePage />} />
                      <Route path="/insight"    element={<InsightPage />} />
                      <Route path="/insight/:category" element={<InsightPage />} />
                      <Route path="/story"      element={<StoryPage />} />
                      <Route path="/trend"      element={<TrendPage />} />
                      <Route path="/community"  element={<CommunityPage />} />
                      <Route path="/news"        element={<NewsPage />} />
                      <Route path="/news/:slug"   element={<NewsDetailPage />} />
                      <Route path="/about"          element={<AboutPage />} />
                      <Route path="/admin"          element={<AdminPage />} />
                      <Route path="/terms"          element={<TermsPage />} />
                      <Route path="/privacy"         element={<PrivacyPage />} />
                      <Route path="/connect"    element={<ConnectPage />} />
                      <Route path="/article/:slug" element={<ArticlePage />} />
                      <Route path="/profile"    element={<ProfilePage />} />
                      <Route path="/404"        element={<NotFoundPage />} />
                      <Route path="*"           element={<Navigate to="/404" replace />} />
                    </Routes>
                  </Suspense>
                </div>
              </main>
              <Footer />
            </div>
          </AppInit>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  )
}
