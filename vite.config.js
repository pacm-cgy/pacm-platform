import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    minify: true,
    cssMinify: true,
    reportCompressedSize: false, // 빌드 속도 향상
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[hash:16].js',
        entryFileNames: 'assets/[hash:16].js',
        assetFileNames: 'assets/[hash:16].[ext]',
        compact: true,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('@tanstack')) return 'vendor-query'
            if (id.includes('lucide-react')) return 'vendor-ui'
            if (id.includes('date-fns')) return 'vendor-datefns'
            if (id.includes('react-router')) return 'vendor-router'
            if (id.includes('react-helmet')) return 'vendor-helmet'
            if (id.includes('zustand')) return 'vendor-zustand'
            if (id.includes('react')) return 'vendor-react'
          }
          // 페이지 그룹 — 자주 함께 방문하는 페이지끼리 묶기
          if (id.includes('src/pages/')) {
            if (id.match(/HomePage|InsightPage|ArticlePage|NewsPage|NewsDetailPage/)) return 'pages-core'
            if (id.match(/CommunityPage|PostDetailPage|IdeasPage|ProfilePage/)) return 'pages-community'
            if (id.match(/MentorPage|EduPage|EventsPage|TrendPage/)) return 'pages-edu'
            if (id.match(/AdminPage|OfficePage/)) return 'pages-admin'
          }
        },
      },
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
      },
    },
  },
  server: {
    port: 3000,
    cors: false,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  },
  preview: {
    port: 4173,
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  },
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-router-dom',
      '@supabase/supabase-js', '@tanstack/react-query',
      'lucide-react', 'date-fns', 'zustand',
    ],
    exclude: ['@vite/client'],
  },
  envPrefix: 'VITE_',
  // CSS 코드 스플리팅
  css: {
    devSourcemap: false,
  },
})
