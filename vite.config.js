import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // SW 업데이트 시 즉시 적용
      injectRegister: 'auto',
      workbox: {
        // 캐시 버전 강제 변경으로 이전 캐시 무효화
        cacheId: 'insightship-v4',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // 네트워크 우선 전략 (캐시 문제 방지)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/itcbantrpkjpkfhnriom\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-api', networkTimeoutSeconds: 10 },
          },
        ],
      },
      manifest: {
        name: 'PACM — 청소년 창업 플랫폼',
        short_name: 'PACM',
        description: '청소년에게 창업 지식을 제공하고 기업과 연결하는 미디어 플랫폼',
        theme_color: '#0F0E0A',
        background_color: '#F5F3EE',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'ko',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
  },
})
