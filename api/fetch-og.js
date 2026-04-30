/**
 * api/fetch-og.js — OG 이미지 & 설명 재수집 v2.0
 * ★ SECURITY PATCH:
 *   - SSRF 방어: 내부 IP / metadata 엔드포인트 접근 차단
 *   - 리다이렉트 제한: redirect:'error' 설정
 *   - URL 허용 목록: https:// 외부 URL만 허용
 *   - 응답 크기 제한: 2MB 이상 차단
 */
export const config = { runtime: 'edge', maxDuration: 30 }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

// ── SSRF 방어: 내부 IP / 메타데이터 차단 ──────────────────────────
const BLOCKED_HOSTS = [
  '169.254.169.254',   // AWS/GCP metadata
  '169.254.170.2',     // ECS metadata
  'metadata.google.internal',
  'metadata.azure.com',
  '100.100.100.200',   // Alibaba cloud metadata
]
const PRIVATE_IP_RE = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fc00:|fd|localhost)/i

function isSafeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl)
    // https:// 만 허용 (http:// 차단 — MITM 방지)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    // 내부 IP / 메타데이터 차단
    if (PRIVATE_IP_RE.test(host)) return false
    if (BLOCKED_HOSTS.includes(host)) return false
    // IP 주소 직접 접근 차단 (내부 서비스 스캐닝 방지)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false
    return true
  } catch {
    return false
  }
}

async function fetchOgMeta(url) {
  if (!url) return {}
  // ★ SSRF 방어: URL 유효성 검사
  if (!isSafeUrl(url)) return {}

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InsightshipBot/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(3000),
      redirect: 'error',  // ★ SSRF 방어: 리다이렉트 차단 (302 → 내부 IP 우회 방지)
    })
    if (!res.ok) return {}

    // ★ 응답 크기 제한: 2MB 이상 차단 (메모리 고갈 방지)
    const contentLength = parseInt(res.headers.get('content-length') || '0')
    if (contentLength > 2 * 1024 * 1024) return {}

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return {}

    const html = await res.text()
    // ★ 파싱 전 크기 재검증
    if (html.length > 2 * 1024 * 1024) return {}

    const get = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
      return m ? m[1].trim().slice(0, 500) : null  // ★ 메타 값 길이 제한
    }

    let image = get('og:image') || get('twitter:image')
    const description = get('og:description') || get('description') || get('twitter:description')

    // ★ 이미지 URL도 SSRF 검사
    if (image && !isSafeUrl(image)) image = null

    return { image, description }
  } catch {
    return {}
  }
}

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  const isAuthed = req.headers.get('x-vercel-cron') === '1'
    || req.headers.get('authorization') === 'Bearer ' + CRON_SECRET
  if (!isAuthed) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { 'Content-Type': 'application/json' },
  })

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  // cover_image 없는 뉴스 최대 10개씩 처리
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?source_name=not.is.null&cover_image=is.null&source_url=not.is.null&select=id,source_url&order=published_at.desc&limit=10`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY } }
  )
  const articles = await res.json().catch(() => [])
  if (!Array.isArray(articles) || !articles.length) {
    return new Response(JSON.stringify({ message: '처리할 기사 없음' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }

  const results = { updated: 0, failed: 0, skipped_ssrf: 0 }

  for (const article of articles) {
    const sourceUrl = article.source_url
    // ★ SSRF: DB에서 온 URL도 재검증
    if (!sourceUrl || !isSafeUrl(sourceUrl)) {
      results.skipped_ssrf++
      continue
    }

    const meta = await fetchOgMeta(sourceUrl)
    if (!meta.image) { results.failed++; continue }

    // 이미지 URL 유효성 확인 (https로 시작 + SSRF 검사 통과)
    if (!meta.image.startsWith('https')) { results.failed++; continue }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ cover_image: meta.image }),
    })
    if (r.status === 204) results.updated++
    else results.failed++
  }

  return new Response(JSON.stringify({ ...results, timestamp: new Date().toISOString() }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
