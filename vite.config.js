import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 800,
    // 소스맵 완전 비활성화 (소스 역공학 방지)
    sourcemap: false,
    // 코드 압축/난독화 (Vite 8 기본 oxc minifier 사용)
    minify: true,
    rollupOptions: {
      output: {
        // 청크 파일명 해시화 (경로 추측 방지)
        chunkFileNames: 'assets/[hash:16].js',
        entryFileNames: 'assets/[hash:16].js',
        assetFileNames: 'assets/[hash:16].[ext]',
        // 코드 압축
        compact: true,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('@tanstack')) return 'vendor-query'
            if (id.includes('lucide-react')) return 'vendor-ui'
            if (id.includes('react')) return 'vendor-react'
          }
        },
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
  optimizeDeps: {
    include: ['react', 'react-dom', '@supabase/supabase-js', '@tanstack/react-query'],
  },
  // 환경변수 노출 방지: VITE_ 접두사 외 노출 차단
  envPrefix: 'VITE_',
})
