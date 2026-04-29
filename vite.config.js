import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({ fastRefresh: true }),
  ],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
    minify: true,          // vite 기본 minifier 사용 (esbuild 별도 불필요)
    cssMinify: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        chunkFileNames:  'assets/[hash:16].js',
        entryFileNames:  'assets/[hash:16].js',
        assetFileNames:  'assets/[hash:16].[ext]',
        manualChunks(id) {
          // ── 벤더 라이브러리 분리 (캐시 극대화) ──────────────────
          if (id.includes('node_modules')) {
            if (id.includes('@supabase'))     return 'vendor-supabase'
            if (id.includes('@tanstack'))     return 'vendor-query'
            if (id.includes('lucide-react'))  return 'vendor-ui'
            if (id.includes('date-fns'))      return 'vendor-datefns'
            if (id.includes('react-router'))  return 'vendor-router'
            if (id.includes('react-helmet'))  return 'vendor-helmet'
            if (id.includes('zustand'))       return 'vendor-zustand'
            if (id.includes('react-dom'))     return 'vendor-react-dom'
            if (id.includes('react'))         return 'vendor-react'
          }
          // ── 페이지 그룹 (방문 패턴 기반) ─────────────────────────
          if (id.includes('src/pages/')) {
            if (id.match(/HomePage|InsightPage|ArticlePage|NewsPage|NewsDetailPage/))
              return 'pages-core'
            if (id.match(/CommunityPage|PostDetailPage|IdeasPage|ProfilePage/))
              return 'pages-community'
            if (id.match(/MentorPage|EduPage|EventsPage|TrendPage|MagazinePage/))
              return 'pages-edu'
            if (id.match(/AdminPage|OfficePage/))
              return 'pages-admin'
            if (id.match(/StoryPage|ConnectPage|AboutPage|AdvertisePage|MessagesPage/))
              return 'pages-misc'
            if (id.match(/LoginPage|TermsPage|PrivacyPage|NotFoundPage/))
              return 'pages-auth'
          }
          // ── admin 전용 컴포넌트 — 일반 유저 번들에서 분리 ────────
          if (id.includes('StaffChatPopup'))
            return 'admin-staff-chat'
        },
      },
      treeshake: {
        moduleSideEffects:       false,
        propertyReadSideEffects: false,
      },
    },
  },
  server: {
    port: 3000,
    cors: false,
    hmr: { overlay: false },
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options':        'DENY',
    },
  },
  preview: {
    port: 4173,
    headers: {
      'Cache-Control':          'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options':        'DENY',
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      '@supabase/supabase-js',
      '@tanstack/react-query',
      'lucide-react',
      'date-fns',
      'zustand',
    ],
    exclude: ['@vite/client'],
    force: false,
  },
  envPrefix: 'VITE_',
  css: {
    devSourcemap: false,
  },
  cacheDir: 'node_modules/.vite',
})
