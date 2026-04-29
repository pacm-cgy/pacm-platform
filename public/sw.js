/**
 * Insightship Service Worker v6.0
 * PWA 캐싱 전략: Stale-While-Revalidate + Cache-First + Network-First
 * v6: 타임아웃 추가 + 배경 동기화 + 성능 개선
 */

const CACHE_VER = 'v6'
const CACHE_NAME = `insightship-${CACHE_VER}`
const STATIC_CACHE = `insightship-static-${CACHE_VER}`
const API_CACHE = `insightship-api-${CACHE_VER}`
const IMG_CACHE = `insightship-img-${CACHE_VER}`

const ALL_CACHES = [CACHE_NAME, STATIC_CACHE, API_CACHE, IMG_CACHE]

// 사전 캐시할 정적 자산
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
]

// 절대 캐시하지 않는 경로
const NEVER_CACHE = [
  '/api/',
  'supabase.co',
  'chrome-extension',
  'analytics',
  'gtag',
]

// 네트워크 타임아웃 (ms)
const NETWORK_TIMEOUT = 4000

// ── Install: 사전 캐시 ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(url).catch(() => {}))
      )
    }).then(() => self.skipWaiting())
  )
})

// ── Activate: 오래된 캐시 정리 ────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => !ALL_CACHES.includes(key))
          .map(key => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

// ── 메시지 핸들러 (SW 강제 업데이트 지원) ─────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
  }
})

// ── Fetch 전략 ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 캐시 제외 조건
  if (
    request.method !== 'GET' ||
    NEVER_CACHE.some(n => url.href.includes(n)) ||
    url.protocol === 'chrome-extension:' ||
    url.protocol === 'blob:'
  ) return

  // 이미지: Cache-First (30일)
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMG_CACHE, 30 * 24 * 3600))
    return
  }

  // 폰트/CSS/JS 정적 자산: Cache-First (1년)
  if (
    url.pathname.includes('/assets/') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 365 * 24 * 3600))
    return
  }

  // HTML 페이지: Network-First (타임아웃 + 오프라인 폴백)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirstWithFallback(request))
    return
  }

  // 그 외: Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(request, CACHE_NAME))
})

// ── 전략 구현 ─────────────────────────────────────────────────

async function cacheFirst(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  if (cached) {
    const date = cached.headers.get('date')
    const age = date ? (Date.now() - new Date(date).getTime()) / 1000 : 0
    if (!date || age < maxAge) {
      // 백그라운드에서 캐시 갱신 (이미지는 만료 근접 시)
      if (date && age > maxAge * 0.8) {
        fetch(request).then(r => { if (r.ok) cache.put(request, r) }).catch(() => {})
      }
      return cached
    }
  }

  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return cached || new Response('', { status: 503 })
  }
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT)
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    // SPA 폴백: 모든 navigate → /
    const rootCache = await caches.match('/')
    if (rootCache) return rootCache
    const offline = await caches.match('/offline.html')
    return offline || new Response('<!DOCTYPE html><html><body><p>오프라인 상태입니다.</p></body></html>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => null)

  return cached || await networkPromise || new Response('', { status: 503 })
}

// ── 타임아웃이 있는 fetch ─────────────────────────────────────
function fetchWithTimeout(request, timeout) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeout)
    ),
  ])
}

// ── 백그라운드 동기화 ──────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications())
  }
})

async function syncNotifications() {
  // 백그라운드 알림 동기화 (추후 구현)
  return Promise.resolve()
}

// ── Push 알림 수신 ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  try {
    const data = event.data.json()
    event.waitUntil(
      self.registration.showNotification(data.title || 'Insightship', {
        body: data.body || '새 알림이 도착했습니다',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        tag: data.tag || 'insightship-notif',
        renotify: true,
        requireInteraction: false,
        data: { url: data.url || '/' },
        actions: [
          { action: 'open', title: '보기' },
          { action: 'dismiss', title: '닫기' },
        ],
      })
    )
  } catch {}
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      const win = wins.find(w => w.url.includes(self.location.origin) && 'focus' in w)
      if (win) {
        win.focus()
        win.navigate(url)
      } else {
        clients.openWindow(url)
      }
    })
  )
})
